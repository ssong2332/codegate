// LLM 역할극 엔진 (Track A, T7). API.md `sendMessage` 1:1. AC-003~005/AC-013/AC-024/AC-007.
//
// LLM 실호출 여부(투명 고지): `functions/src/llm`의 `getLlmClient()`가 GEMINI_API_KEY 존재 여부로
// 실 Gemini(GeminiLlmClient)/MockLlmClient를 고른다(2026-07-24, 사용자 실측 신고로 발견·수정 —
// 이전엔 키가 있어도 항상 Mock을 반환하던 팩토리 버그). 응답의 `isMock` 플래그로 어느 쪽이었는지
// 항상 구분된다(SendMessageResponse.isMock). 이 파일이 보장하는 구조는 그대로다: (1) 프롬프트
// 서버 조립, (2) 사용자입력/시스템프롬프트 role+구분자 분리, (3) 턴/시간 한도 계산·자동 종료 로직.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { maskPII } from "../guardrails";
import { completeWithFallback, getLlmClient } from "../llm";
import { triggerReportGeneration } from "../report";
import { SCENARIO_PROMPTS } from "../scenarios";
import { PUBLIC_SCENARIOS } from "../scenarios/publicMeta";
import { GEMINI_API_KEY } from "../shared/config";
import { MESSENGER_ESCALATION_FALLBACK_TURNS } from "../shared/constants";
import { getVoiceProvider } from "../voice/provider";
import { transitionChannel } from "../session/channelTransition";
import type { ChannelTransitionTrigger, MessageDoc, SessionDoc } from "../shared/types";
import { extractEscalationSignal } from "./escalationSignal";
import { extractLinkMarker } from "./linkMarker";
import { turnsSinceMessengerEntry } from "./messengerReentry";
import { buildSystemPrompt, toLlmHistory, wrapUserInputAsData } from "./promptAssembly";
import { isSessionLimitReached } from "./sessionLimits";
import type { ScammerMessage, SendMessageRequest, SendMessageResponse } from "./types";

export { generateOpeningLine } from "./openingLine";
export type { OpeningLineResult } from "./openingLine";

ensureFirebaseAdminApp();

// GEMINI_API_KEY 선언(2026-07-24) — getLlmClient()가 실 Gemini로 격상될 수 있어, Functions v2가
// 배포 환경에서 이 secret을 런타임에 주입하도록 명시해야 한다(realtime/index.ts의
// createRealtimeCall과 동일 이유).
export const sendMessage = onCall<SendMessageRequest, Promise<SendMessageResponse>>(
  { secrets: [GEMINI_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { sessionId, userText } = request.data ?? {};
    if (!sessionId || !userText || !userText.trim()) {
      throw new HttpsError("invalid-argument", "sessionId와 userText가 필요합니다.");
    }

    const db = getFirestore();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
    }
    const session = sessionSnap.data() as SessionDoc;
    if (session.uid !== request.auth.uid) {
      throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
    }
    if (session.status !== "active") {
      throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
    }

    const scenarioPrompt = SCENARIO_PROMPTS[session.scenarioId];
    if (!scenarioPrompt) {
      throw new HttpsError(
        "internal",
        `세션의 scenarioId에 해당하는 scenarioPrompts가 없습니다: ${session.scenarioId}`,
      );
    }

    // ① PII 마스킹(guardrails, T11 실구현 — 전화/계좌/주민번호형/이메일 정규식 토큰화, guardrails/
    // index.ts 참고) → messages write.
    const maskedUserText = maskPII(userText);

    const messagesRef = sessionRef.collection("messages");
    const userWriteTime = Timestamp.now();

    // #8 원자적 턴 확보(2026-07-22): 예전엔 "대화 이력 read → 길이로 turnIndex 결정 → write"가
    // 트랜잭션 밖이라, 같은 세션에서 요청이 겹치면(더블 탭·자동 청취 중복 인식) 두 요청이 같은
    // turnIndex를 쓰고 turnCount 증가가 하나 유실될 수 있었다. 이력 read + 사용자 메시지 write +
    // turnCount 증가를 한 트랜잭션으로 묶어 인덱스 충돌을 원천 차단한다.
    //
    // LLM 호출은 느리고 외부 의존이라 트랜잭션 안에 둘 수 없다(재시도 시 중복 호출·잠금 장기화).
    // 그래서 트랜잭션은 "턴 확보"까지만 하고, 사기범 응답 write는 확보한 인덱스로 트랜잭션 밖에서
    // 이어서 한다.
    const claim = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(sessionRef);
      const fresh = freshSnap.data() as SessionDoc | undefined;
      if (!fresh) {
        throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
      }
      if (fresh.status !== "active") {
        throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
      }
      const historySnap = await tx.get(messagesRef.orderBy("turnIndex", "asc"));
      const history = historySnap.docs.map((doc) => doc.data() as MessageDoc);
      const userIndex = history.length;

      tx.create(messagesRef.doc(), {
        role: "user",
        textMasked: maskedUserText,
        turnIndex: userIndex,
        createdAt: userWriteTime,
        // T30 추가(§13.1) — 교차채널 타임라인(AC-037)용 채널 표기.
        ...(fresh.channel ? { channel: fresh.channel } : {}),
      } satisfies MessageDoc);
      // answeredAt(통화 시작 기점, #6)은 첫 턴에만 설정한다 — 이후 턴은 기존 값을 유지한다.
      tx.update(sessionRef, {
        turnCount: fresh.turnCount + 1,
        ...(fresh.answeredAt ? {} : { answeredAt: userWriteTime }),
      });

      return {
        history,
        userIndex,
        turnCount: fresh.turnCount + 1,
        answeredAt: fresh.answeredAt ?? userWriteTime,
        maxUserTurns: fresh.maxUserTurns,
        maxSessionMs: fresh.maxSessionMs,
      };
    });

    const storedHistory = claim.history;
    const nextIndex = claim.userIndex;

    // ② 서버에서 scenarioPrompts 기반으로 조립한 프롬프트 + 사용자 입력 구분자 감싸기(ADR-0004) →
    // LLM 어댑터(functions/src/llm) 호출.
    const llmHistory = toLlmHistory(storedHistory);
    llmHistory.push({ role: "user", content: wrapUserInputAsData(maskedUserText) });

    // reviewer 리뷰 Major #1 수정(2026-07-24, 실 Gemini 활성화로 처음 실측 가능해진 결함) — 사용자
    // 턴은 이미 위 트랜잭션(#8, 동시 탭 방지용 원자적 클레임)에서 커밋됐고 turnCount도 이미
    // 소진됐다. LLM 호출 실패 시 던지면 "답 없는 사용자 턴"이 남는다 — completeWithFallback이
    // Mock으로 강등해 절대 답 없이 남기지 않는다(llm/index.ts 주석·유닛테스트 참고).
    const completion = await completeWithFallback(getLlmClient(), {
      systemPrompt: buildSystemPrompt(scenarioPrompt),
      messages: llmHistory,
      mockTacticHints: scenarioPrompt.weakenedTactics,
    });

    // ③ 메신저 확장(T29) — 스미싱 링크 마커([[LINK:id]])를 저장 전 텍스트에서 제거하고
    // attachments로 변환한다(§13.2 sentinel 패턴 재사용, linkMarker.ts 근거 참고). 보이스 세션의
    // 응답에는 애초에 마커가 없으므로 attachments가 항상 undefined로 빠져 기존 동작에 영향 없다.
    // 응답도 저장 전 마스킹(원칙상 사기범 발화엔 사용자 PII가 섞일 일이 적지만, 저장 전 마스킹
    // 원칙을 대화 로그 전체에 일관 적용 — ADR-0004).
    const { text: linkFreeReplyText, attachments: replyAttachments } = extractLinkMarker(
      completion.text,
    );

    // ③-b 에스컬레이션 확장(T30, Architecture.md §13.2, AC-034/024) — 구조화 신호
    // ([[SIGNAL:ESCALATE_VOICE]])를 링크 마커와 같은 sentinel 패턴으로 스캔·제거한다. 사용자는
    // 마커 원문을 절대 보지 않는다. 이 스캔은 **LLM 완성 텍스트에만** 적용된다(사용자 입력에는
    // 절대 적용하지 않음 — AC-024, escapeSentinelLookalikes가 사용자 입력의 흉내를 이미 무력화).
    const { text: signalFreeReplyText, escalate: signalEscalate } = extractEscalationSignal(
      linkFreeReplyText,
    );
    const maskedReplyText = maskPII(signalFreeReplyText);
    await messagesRef.add({
      role: "scammer",
      textMasked: maskedReplyText,
      turnIndex: nextIndex + 1,
      createdAt: Timestamp.now(),
      ...(replyAttachments ? { attachments: replyAttachments } : {}),
      ...(session.channel ? { channel: session.channel } : {}),
    } satisfies MessageDoc);

    // ④ 한도 체크 → 도달 시 ended:true + status=ended(→onSessionEnded 트리거, AC-007).
    // turnCount 증가와 answeredAt 기록은 위 트랜잭션(#8)에서 이미 원자적으로 끝났으므로, 여기서는
    // 트랜잭션이 확정한 값을 그대로 쓴다. 경과시간 기점은 answeredAt(통화 시작 = 첫 사용자 발화)
    // 이다(#6) — 수신 화면에 머문 시간이 대화 예산을 깎지 않으며, UI 통화 타이머와도 정합.
    const turnCount = claim.turnCount;
    const elapsedMs = userWriteTime.toMillis() - claim.answeredAt.toMillis();
    const limitReached = isSessionLimitReached({
      turnCount,
      maxUserTurns: claim.maxUserTurns,
      elapsedMs,
      maxSessionMs: claim.maxSessionMs,
    });

    // #9 종료 레이스 방지(T31 reviewer Major #1, 2026-07-24): 사용자 메시지 확보(#8) 이후 LLM 호출은
    // 트랜잭션 밖에서 시간이 걸리므로, 그 사이 endSession(예: 사용자의 "훈련 종료" 중복 탭)이 먼저
    // 끝나 세션을 이미 종료시켰을 수 있다. 이 경우 여기서 그걸 모른 채 status/endReason을 덮어쓰거나
    // 이미 종료된 세션을 채널 전이시키면, 리포트가 생성된 시점 이후의 상태를 리포트 없이 세션 문서에
    // 반영하는 모순이 생긴다(AC-007 "정확히 1개 리포트" 자체는 여전히 지켜지지만 세션 문서가
    // 리포트와 어긋난다). 최종 반영 직전에 트랜잭션으로 상태를 다시 확인해, 이미 종료됐다면
    // limitReached로 인한 종료 필드 갱신·전이 판단 자체를 건너뛴다(대신 무해한 llmProvider 태그만
    // 반영). isMock 플래그로 llmProvider 태그를 반영하는 것 자체는 status와 무관하므로 항상 적용한다.
    const finalize = await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(sessionRef);
      const fresh = freshSnap.data() as SessionDoc | undefined;
      const stillActive = fresh?.status === "active";

      const update: Partial<SessionDoc> = {
        ...(completion.isMock ? { llmProvider: "mock" as const } : {}),
      };
      if (limitReached && stillActive) {
        update.status = "ended";
        update.endReason = "limit_reached";
        update.endedAt = Timestamp.now();
      }
      // 2026-07-24 수정(실 Gemini 연동으로 처음 드러난 잠재 버그) — update가 llmProvider 태그도
      // 종료 필드도 없이 완전히 빈 객체({})가 되는 경우(=isMock:false·limitReached 아님·이미
      // 종료된 세션 아님, 즉 실 LLM으로 정상 진행 중인 통상적인 턴)가 그동안은 존재하지 않았다
      // (isMock이 언제나 true였던 Mock 전용 시절엔 update에 최소 llmProvider 필드가 항상 있었음).
      // Firestore Transaction.update()는 빈 객체를 거부한다("At least one field must be updated")
      // — 반영할 게 없으면 write 자체를 건너뛴다(멱등, 트랜잭션 실패로 사용자 응답을 막지 않음).
      if (Object.keys(update).length > 0) {
        tx.update(sessionRef, update);
      }
      return { stillActive };
    });

    // T8 배선: 한도 도달로 이 턴이 세션을 자동 종료시켰다면(status=ended, endReason=limit_reached),
    // endSession 콜러블 경로와 동일한 리포트 생성 트리거 지점을 거치도록 한다(AC-007 "종료된 모든
    // 세션은 정확히 1개의 리포트를 생성" — endSession을 거치지 않는 이 자동종료 경로가 리포트
    // 트리거를 빠뜨리던 기존 갭, T7 구현 보고서에 명시된 known gap). 실제 생성 로직은 T9 소관이라
    // 여전히 트리거 지점만이며, 실패해도 sendMessage 응답 자체는 막지 않는다(triggerReportGeneration
    // 내부에서 에러를 흡수, functions/src/report/index.ts 참고). stillActive가 false면 위에서 이미
    // 종료 필드를 반영하지 않았으므로(=이 턴이 종료를 일으키지 않았으므로) 트리거하지 않는다 —
    // 그 세션은 이미 다른 경로(endSession)로 리포트가 트리거됐다.
    if (limitReached && finalize.stillActive) {
      await triggerReportGeneration(sessionId);
    }

    // ④-b 채널 전이(T30, Architecture.md §13.2/13.3, AC-034/039) — 이 시나리오가 에스컬레이션
    // 가능(scenario.escalation 존재)하고 아직 메신저 단계일 때만 판단한다. 우선순위: 구조화 신호
    // > max-turn 폴백(MESSENGER_ESCALATION_FALLBACK_TURNS, §13.3 PoC 전 가정치). 이번 턴에 전체
    // 세션 한도(limitReached)로 이미 종료됐다면 전이보다 종료를 우선한다(모순된 상태 방지). 위
    // 트랜잭션에서 이미 종료된 것으로 확인됐다면(stillActive=false) 이 턴이 전이를 일으키지 않는다.
    const canEscalate =
      finalize.stillActive &&
      session.channel === "messenger" &&
      Boolean(PUBLIC_SCENARIOS[session.scenarioId]?.escalation);
    let escalationTrigger: ChannelTransitionTrigger | undefined;
    if (canEscalate && !limitReached) {
      if (signalEscalate) {
        escalationTrigger = "structured_signal";
      } else if (
        // reviewer 리뷰 Major #2 수정 — 세션 누적 turnCount가 아니라 "가장 최근 메신저 재진입
        // 이후" 턴 수를 본다(messengerReentry.ts). T40으로 보이스→메신저 복귀 후 첫 메시지에서
        // 곧바로 다시 max-turn 폴백이 발화하는 핑퐁을 막는다 — session은 이 턴이 시작되기 전에
        // 읽은 스냅샷이라 직전 전이(있었다면)의 channelHistory가 이미 반영돼 있다.
        turnsSinceMessengerEntry(turnCount, session.channelHistory) >= MESSENGER_ESCALATION_FALLBACK_TURNS
      ) {
        escalationTrigger = "maxturn_fallback";
      }
    }
    if (escalationTrigger) {
      await transitionChannel(sessionId, "messenger", "voice", escalationTrigger);
    }

    // ⑤ 실시간 음성 통화 전환(2026-07-22 사용자 결정) — 사기범 응답을 VoiceProvider로 합성해
    // audioUrl을 함께 반환한다(session.voiceId는 createSession에서 이미 검증된 값). 합성 실패는
    // 텍스트 응답 자체를 막지 않는다(P-4 "핵심 루프 비차단" — 이미 T5 synthesizeDeepvoice와 동일한
    // "실패해도 조용히 생략" 원칙을 여기서도 따른다).
    // T29 reviewer Major #2: channel="messenger"는 채팅 UI가 audioUrl을 재생하지 않으므로 합성
    // 자체를 건너뛴다(createSession과 동일한 게이팅, 불필요한 비용·지연·Storage 산출물 방지).
    let audioUrl: string | undefined;
    if (session.channel !== "messenger") {
      try {
        const synthesis = await getVoiceProvider().synthesize({
          sessionId,
          voiceId: session.voiceId ?? "",
          text: maskedReplyText,
        });
        audioUrl = synthesis.audioUrl;
      } catch {
        // 합성 실패는 무시 — 클라는 audioUrl 없으면 텍스트만 표시(폴백).
      }
    }

    const reply: ScammerMessage = {
      role: "scammer",
      text: maskedReplyText,
      ...(replyAttachments ? { attachments: replyAttachments } : {}),
    };
    return {
      reply,
      turnCount,
      ended: limitReached,
      ...(limitReached ? { endReason: "limit_reached" as const } : {}),
      isMock: completion.isMock,
      ...(audioUrl ? { audioUrl } : {}),
      ...(escalationTrigger ? { escalation: { toChannel: "voice" as const } } : {}),
    };
  },
);
