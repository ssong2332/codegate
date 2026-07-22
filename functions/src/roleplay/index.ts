// LLM 역할극 엔진 (Track A, T7). API.md `sendMessage` 1:1. AC-003~005/AC-013/AC-024/AC-007.
//
// ⚠️ LLM 실호출 여부(투명 고지, 근거 없는 성공 보고 금지 원칙 준수): functions/.env가 아직 없고
// functions/.env.example의 LLM_API_KEY도 placeholder뿐이라(T7 시점에 직접 확인) 실제 Claude/Gemini
// API는 아직 호출하지 않는다. `functions/src/llm`의 `getLlmClient()`가 항상 MockLlmClient(규칙
// 기반 텍스트 생성기)를 반환한다 — VoiceProvider(T19)와 동일한 "어댑터 뒤 목업" 패턴. Mock 응답은
// `isMock: true`로 표시된다(SendMessageResponse.isMock). **실 LLM 없이는 "인격 유지·실시간 적응"이
// 진짜로 검증되지 않는다** — 이 파일이 실제로 보장하는 것은 (1) 프롬프트 서버 조립 구조,
// (2) 사용자입력/시스템프롬프트 role+구분자 분리 구조, (3) 턴/시간 한도 계산·자동 종료 로직이다.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { maskPII } from "../guardrails";
import { getLlmClient } from "../llm";
import { triggerReportGeneration } from "../report";
import { SCENARIO_PROMPTS } from "../scenarios";
import { getVoiceProvider } from "../voice/provider";
import type { MessageDoc, SessionDoc } from "../shared/types";
import { buildSystemPrompt, toLlmHistory, wrapUserInputAsData } from "./promptAssembly";
import { isSessionLimitReached } from "./sessionLimits";
import type { ScammerMessage, SendMessageRequest, SendMessageResponse } from "./types";

export { generateOpeningLine, isUsingMockLlm } from "./openingLine";

ensureFirebaseAdminApp();

export const sendMessage = onCall<SendMessageRequest, Promise<SendMessageResponse>>(
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

    const llm = getLlmClient();
    const completion = await llm.complete({
      systemPrompt: buildSystemPrompt(scenarioPrompt),
      messages: llmHistory,
      mockTacticHints: scenarioPrompt.weakenedTactics,
    });

    // ③ 응답도 저장 전 마스킹(원칙상 사기범 발화엔 사용자 PII가 섞일 일이 적지만, 저장 전 마스킹
    // 원칙을 대화 로그 전체에 일관 적용— ADR-0004).
    const maskedReplyText = maskPII(completion.text);
    await messagesRef.add({
      role: "scammer",
      textMasked: maskedReplyText,
      turnIndex: nextIndex + 1,
      createdAt: Timestamp.now(),
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

    const sessionUpdate: Partial<SessionDoc> = {
      // Firestore admin SDK는 필드값 undefined를 기본적으로 거부하므로, Mock일 때만 갱신한다
      // (실 LLM으로 세션이 시작됐다면 굳이 llmProvider를 덮어쓸 필요가 없다).
      ...(completion.isMock ? { llmProvider: "mock" as const } : {}),
    };
    if (limitReached) {
      sessionUpdate.status = "ended";
      sessionUpdate.endReason = "limit_reached";
      sessionUpdate.endedAt = Timestamp.now();
    }
    await sessionRef.update(sessionUpdate);

    // T8 배선: 한도 도달로 이 턴이 세션을 자동 종료시켰다면(status=ended, endReason=limit_reached),
    // endSession 콜러블 경로와 동일한 리포트 생성 트리거 지점을 거치도록 한다(AC-007 "종료된 모든
    // 세션은 정확히 1개의 리포트를 생성" — endSession을 거치지 않는 이 자동종료 경로가 리포트
    // 트리거를 빠뜨리던 기존 갭, T7 구현 보고서에 명시된 known gap). 실제 생성 로직은 T9 소관이라
    // 여전히 트리거 지점만이며, 실패해도 sendMessage 응답 자체는 막지 않는다(triggerReportGeneration
    // 내부에서 에러를 흡수, functions/src/report/index.ts 참고).
    if (limitReached) {
      await triggerReportGeneration(sessionId);
    }

    // ⑤ 실시간 음성 통화 전환(2026-07-22 사용자 결정) — 사기범 응답을 VoiceProvider로 합성해
    // audioUrl을 함께 반환한다(session.voiceId는 createSession에서 이미 검증된 값). 합성 실패는
    // 텍스트 응답 자체를 막지 않는다(P-4 "핵심 루프 비차단" — 이미 T5 synthesizeDeepvoice와 동일한
    // "실패해도 조용히 생략" 원칙을 여기서도 따른다).
    let audioUrl: string | undefined;
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

    const reply: ScammerMessage = { role: "scammer", text: maskedReplyText };
    return {
      reply,
      turnCount,
      ended: limitReached,
      ...(limitReached ? { endReason: "limit_reached" as const } : {}),
      isMock: completion.isMock,
      ...(audioUrl ? { audioUrl } : {}),
    };
  },
);
