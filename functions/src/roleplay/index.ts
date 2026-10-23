// LLM 역할극 엔진 (Track A, T7). API.md `sendMessage` 1:1. AC-003~005/AC-013/AC-024/AC-007.
//
// LLM 실호출 여부(투명 고지): `functions/src/llm`의 `getLlmClient()`가 GEMINI_API_KEY 존재 여부로
// 실 Gemini(GeminiLlmClient)/MockLlmClient를 고른다(2026-07-24, 사용자 실측 신고로 발견·수정 —
// 이전엔 키가 있어도 항상 Mock을 반환하던 팩토리 버그). 응답의 `isMock` 플래그로 어느 쪽이었는지
// 항상 구분된다(SendMessageResponse.isMock). 이 파일이 보장하는 구조는 그대로다: (1) 프롬프트
// 서버 조립, (2) 사용자입력/시스템프롬프트 role+구분자 분리, (3) 턴/시간 한도 계산·자동 종료 로직.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { assertAnonymousChallengeScope } from "../shared/anonymousGate";
import { maskPII } from "../guardrails";
import { replaceRealFinancialNames } from "../guardrails/realFinancialNames";
import { completeWithFallback, getLlmClient, LLM_FIRST_TURN_TIMEOUT_MS } from "../llm";
import { triggerReportGeneration } from "../report";
import { resolveSessionScenarioPrompt } from "../scenarios/flowVariants";
import type { InCallSmsItem } from "../scenarios/inCallSms";
import {
  findMockScreenItem,
  installConsentInstructionFor,
  isMockScreenReachable,
  listAppInstallMockScreens,
  type MockScreenEntrySurface,
} from "../scenarios/mockScreens";
import { textPathAnchorScammerTurn } from "../inCallSms/buildDoc";
import { planConfirmResult } from "../inCallSms/confirmResult";
import {
  buildSmsMarkerOfferInstruction,
  buildSmsNudgeInstruction,
  planSmsBackstop,
  effectiveTextPathUserTurns,
  resolveDeclaredSms,
  resolveSmsGate,
  sessionDeclaredSmsPurposes,
  sessionDeclaresInCallSms,
  sessionTransferSmsOpensLanding,
} from "../inCallSms/smsGate";
import type { DeliveredSmsRecord } from "../inCallSms/smsGate";
import { deliverSmsThroughGate, firestoreSmsStore, readDeliveredSms } from "../inCallSms/smsDelivery";
import { goalFollowUpFor, hasCompletedGoalAction, readMockScreenCompletion } from "../scammerHangup/goalAction";
import type { SmsDeliveryInput } from "../inCallSms/smsDelivery";
import { findVerifyInterceptItem, hasVerifyIntercept } from "../scenarios/verifyIntercept";
import {
  decideFallbackHangup,
  fallbackHangupMode,
  fallbackSmsDeclaredFor,
  resolveFallbackHangupEffect,
  type FallbackHangupFacts,
} from "../scammerHangup/fallback";
import { resolveHangupRelay } from "../scammerHangup/relayContext";
import { isVerifyTransferReachable, type VerifyOfferDocState } from "../scammerHangup/transferReach";
import { pickFallbackTurnInstruction } from "../verifyIntercept/fallbackTurn";
import { announcedVerifyAnchor } from "../verifyIntercept/buildDoc";
import { PUBLIC_SCENARIOS } from "../scenarios/publicMeta";
import { resolveSessionEscalation } from "../scenarios/escalation";
import { LLM_TEXT_SECRETS } from "../shared/config";
import { MESSENGER_ESCALATION_FALLBACK_TURNS, SEND_MESSAGE_MAX_LENGTH } from "../shared/constants";
import { normalizeDifficultyLevel } from "../shared/difficulty";
import { getVoiceProvider } from "../voice/provider";
import { transitionChannel } from "../session/channelTransition";
import type { ChannelTransitionTrigger, MessageDoc, SessionDoc } from "../shared/types";
import { wasTurnInstructionSpoken } from "./announceMarking";
import { extractEscalationSignal } from "./escalationSignal";
import { callPhaseMockTacticHints, ESCALATED_CALL_CONTEXT_INSTRUCTION, isEscalatedVoiceCall } from "./escalatedCall";
import { isFirstUserTurn } from "./firstTurn";
import { isL3Procedural } from "./l3Depth";
import { extractLinkMarker } from "./linkMarker";
import { dropRepeatedLinkChips } from "./linkChipRepeat";
import { tidyScammerReplyMarkup } from "./replyMarkup";
import { turnsSinceMessengerEntry } from "./messengerReentry";
import { PHOTO_TURN_TEXT, photoTurnInstruction } from "./photoTurn";
import { replyChatDuringCall } from "./chatDuringCall";
import { applyFamilyAddressText, resolveFamilyAddressPrompt, sessionFamilyAddress } from "../scenarios/familyAddress";
import { asksIdentityCheck } from "./personaAuthority";
import { extractSmsMarker } from "./smsMarker";
import { buildSystemPrompt, toLlmHistory, wrapUserInputAsData } from "./promptAssembly";
import { evaluateOtpCheck, otpCheckInputsFromHistory } from "./otpCheck";
import { limitReplySentences, shouldLimitReplySentences } from "./replyLength";
import { finalizeScammerReplyText } from "./scammerReplyMasking";
import { decideRepeatBreak, repeatBreakInstruction } from "./repeatBreak";
import { judgeEndCallSignal, judgeEscalationSignal } from "./signalConsistency";
import { resolveSessionSpeakerGender } from "../realtime/scenarioVoice";
import { isSessionLimitReached } from "./sessionLimits";
import type { ScammerMessage, SendMessageRequest, SendMessageResponse } from "./types";
import { applyFictionalBank, resolveFictionalBankName, resolveSessionAccountNumber } from "../shared/fictionalBank";

export { generateOpeningLine } from "./openingLine";
export type { OpeningLineResult } from "./openingLine";

ensureFirebaseAdminApp();

// GEMINI_API_KEY 선언(2026-07-24) — getLlmClient()가 실 Gemini로 격상될 수 있어, Functions v2가
// 배포 환경에서 이 secret을 런타임에 주입하도록 명시해야 한다(realtime/index.ts의
// createRealtimeCall과 동일 이유).
/** T191 — 문자 판정 1줄(도착 · 거부 모두 · AC-099 (h) 사용자 발화 수 포함). ⛔ G170 — 대사 · 번호 0. */
function logSmsGate(
  sessionId: string,
  trigger: "backstop" | "model_marker",
  purpose: string | undefined,
  status: string,
  userTurns: number,
  declaredReason?: string,
): void {
  logger.info("[T191] sendMessage 문자 판정", {
    sessionId,
    trigger,
    // 모델 원값이라 길이를 자른다(로그 오염 방지 · 리뷰 Minor ①).
    purpose: purpose !== undefined ? purpose.slice(0, 32) : null,
    status,
    userTurns,
    ...(declaredReason ? { declaredReason } : {}),
  });
}

export const sendMessage = onCall<SendMessageRequest, Promise<SendMessageResponse>>(
  { secrets: [...LLM_TEXT_SECRETS] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { sessionId, photo } = request.data ?? {};
    // §113.2(실기 신고 9 · 사용자 결정 2026-10-23) — 사진 보내기 턴: 이미지는 서버에 오지 않는다(요청에 이미지 필드 0). 사실만 고정 문장으로
    // 대화에 남긴다(`PHOTO_TURN_TEXT` — 사기범 AI · 리포트가 같은 문장을 본다). 사진 턴이면 클라 글자는 쓰지 않는다.
    const isPhotoTurn = photo === true;
    const userText = isPhotoTurn ? PHOTO_TURN_TEXT : request.data?.userText;
    if (!sessionId || !userText || !userText.trim()) {
      throw new HttpsError("invalid-argument", "sessionId와 userText가 필요합니다.");
    }
    // §66.2 — 길이 상한. ⛔ 절단이 아니라 거절(AC-039 "조용한 실패 금지", rewind/index.ts:68-73와
    // 동일 순서). ⛔ Firestore read·LLM 호출 앞에 둔다 — 거절되는 요청이 그 비용을 태우지 않는다.
    if (userText.length > SEND_MESSAGE_MAX_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `메시지는 ${SEND_MESSAGE_MAX_LENGTH}자까지 보낼 수 있습니다.`,
      );
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
    assertAnonymousChallengeScope(request.auth, session);
    if (session.status !== "active") {
      throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
    }

    // T191 S5(AC-096 (e)(f)) — 세션에 배정된 흐름 변형을 합성한 프롬프트(부재 = 원본 · 무소급).
    const scenarioPrompt = resolveSessionScenarioPrompt(session.scenarioId, session.flowVariantId);
    if (!scenarioPrompt) {
      throw new HttpsError(
        "internal",
        `세션의 scenarioId에 해당하는 scenarioPrompts가 없습니다: ${session.scenarioId}`,
      );
    }
    // §121.7 PR-3 — 통화 중 대화방 카톡(메인 결정 ⓑⓒ). 문자 · 끊기 · 전환 판정을 타지 않는 별도 경로(`chatDuringCall.ts` 판정표).
    if (request.data?.duringCall === true) {
      return replyChatDuringCall({ db, sessionRef, sessionId, session, scenarioPrompt, userText, isPhotoTurn });
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
        // §113.2 — 사진 전송 사실(종류만 · 이미지 0).
        ...(isPhotoTurn ? { photo: true as const } : {}),
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

    // ④ 한도 계산(T192 C3 — §79.19 (5) 10: 입력이 전부 턴 확보 트랜잭션 값이라 **LLM 전에** 계산한다. 끊기 사전 판정이
    // 같은 값을 쓰고, 아래 종료 반영 · 응답도 이 값을 그대로 재사용한다 — 계산 지점 1곳).
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

    // ② 서버에서 scenarioPrompts 기반으로 조립한 프롬프트 + 사용자 입력 구분자 감싸기(ADR-0004) →
    // LLM 어댑터(functions/src/llm) 호출.
    // T191 — 사용자 입력 속 `[[SMS:` 흉내는 `wrapUserInputAsData`(promptAssembly `escapeSentinelLookalikes`)가 무력화한다.
    const llmHistory = toLlmHistory(storedHistory);
    llmHistory.push({ role: "user", content: wrapUserInputAsData(maskedUserText) });

    // reviewer 리뷰 Major #1 수정(2026-07-24, 실 Gemini 활성화로 처음 실측 가능해진 결함) — 사용자
    // 턴은 이미 위 트랜잭션(#8, 동시 탭 방지용 원자적 클레임)에서 커밋됐고 turnCount도 이미
    // 소진됐다. LLM 호출 실패 시 던지면 "답 없는 사용자 턴"이 남는다 — completeWithFallback이
    // Mock으로 강등해 절대 답 없이 남기지 않는다(llm/index.ts 주석·유닛테스트 참고).
    // T72(§15.3.3 호출부 3곳 중 "텍스트 턴") — 세션에 기록된 난이도를 그대로 반영한다. 부재·
    // enum 밖이면 normalizeDifficultyLevel이 중급으로 확정하며, 중급은 모디파이어 블록을 내보내지
    // 않으므로 난이도 도입 이전 세션의 프롬프트 문자열이 한 글자도 바뀌지 않는다(회귀 0).
    // ②-b 통화 중 문자 — ⭐ T191 문자 도달 조건(PRD AC-099 · 설계 "문자 도달 조건"). 예전에는 카탈로그 고정 턴
    // (`afterScammerTurns === 이번 사기범 턴`)이면 무조건 도착시켰다. 이제 발송 경로는 2개이고 둘 다 실시간과 **같은
    // 단일 통로**(`deliverSmsThroughGate` → `resolveSmsGate`)를 지난다:
    //   ① 백스톱(필수 목적만) — LLM 호출 **전**. 발송되면 announce가 이번 응답의 턴 지시로 실린다(같은 응답 — 설계 P7).
    //   ② 모델 마커 `[[SMS:목적]]` — LLM 응답을 저장한 **뒤**. 지금 게이트가 열린 목적만 턴 지시로 제시한다.
    // 사용자 발화 수는 서버가 `messages`로 센다(이번 발화 포함 — 위 트랜잭션이 이미 썼다). ⭐ 리뷰 M1 — 실시간에서 강등된
    // 세션은 실시간 구간 전사가 아직 `messages`에 없으므로 마지막 도착 문서의 발화 수와 max로 보정한다
    // (`effectiveTextPathUserTurns`). 실시간 계수와의 관계: 폴백의 이 값은 "지금 답하려는 발화 포함"이고, 실시간 도구
    // 호출도 같은 뜻이 되도록 응답 중인 사용자 발화를 1로 더해 보낸다(`GeminiVoiceSession` `dispatchToolCall` 주석).
    const scammerTurnNumber = storedHistory.filter((m) => m.role === "scammer").length + 1;
    // §81 — 세션 가상 은행명: 프롬프트·문자 본문·대사 후처리가 같은 이름을 쓴다. 부재(옛 세션)는 sessionId 해시.
    const fictionalBankName = resolveFictionalBankName({ sessionId, fictionalBankName: session.fictionalBankName });
    const serverUserTurns = storedHistory.filter((m) => m.role === "user").length + 1;
    let userTurnsNow = serverUserTurns;
    const { declared: smsDeclared, reason: smsDeclaredReason } = resolveDeclaredSms(
      session.scenarioId,
      session.flowVariantId,
    );
    const smsStore = firestoreSmsStore(db, sessionRef);
    const smsDeliveryBase: Omit<SmsDeliveryInput, "purpose" | "anchorScammerTurn" | "trigger" | "userTurns"> = {
      scenarioId: session.scenarioId,
      declared: smsDeclared,
      fictionalBankName,
      sessionId, // §114 — 세션별 인증번호
    };
    let smsDelivered: DeliveredSmsRecord[] = [];
    let smsDeliveredLoaded = false;
    let dueSms: InCallSmsItem | undefined;
    let deliveredSmsId: string | undefined;
    let smsNudgeInstruction: string | undefined;
    // T192 PR A 리뷰 Minor-1 — 도착 기록 read 조건 = 콜러블과 같은 단일 술어(변형 ID 없는 세션도 실시간 구간 문자를 본다).
    // 백스톱 계획 · 문자 제시는 여전히 `smsDeclared`(변형 선언 — 비면 할 일 0)를 쓴다.
    const smsSessionDeclared = fallbackSmsDeclaredFor(session.scenarioId, session.flowVariantId);
    if (smsSessionDeclared) {
      try {
        smsDelivered = await readDeliveredSms(sessionRef);
        smsDeliveredLoaded = true;
        userTurnsNow = effectiveTextPathUserTurns(serverUserTurns, smsDelivered);
        const plan = planSmsBackstop({ declared: smsDeclared, delivered: smsDelivered, userTurns: userTurnsNow });
        if (plan.action === "deliver") {
          // 앵커 — 응답 **전**에 쓰므로 이번 응답은 포함되지 않는다(`textPathAnchorScammerTurn` 주석).
          const result = await deliverSmsThroughGate(smsStore, {
            ...smsDeliveryBase,
            userTurns: userTurnsNow,
            purpose: plan.item.purpose,
            anchorScammerTurn: textPathAnchorScammerTurn(scammerTurnNumber - 1),
            trigger: "backstop",
          });
          logSmsGate(sessionId, "backstop", plan.item.purpose, result.status, userTurnsNow);
          if (result.status === "delivered") {
            dueSms = result.item;
            deliveredSmsId = result.item.smsId;
            smsDelivered = [...smsDelivered, { smsId: result.item.smsId, userTurnsAtArrival: userTurnsNow }];
          }
        } else if (plan.action === "nudge") {
          smsNudgeInstruction = buildSmsNudgeInstruction(plan.item.purpose);
        }
      } catch {
        // 문자 도착 실패가 대화 자체를 막지 않는다(P-4 핵심 루프 비차단). 이 경우 announce 지시도
        // 넣지 않는다 — "말은 했는데 문자가 없는" 불일치(UF-008 Failure (a))를 만들지 않기 위해서다.
      }
    }

    // ②-c 확인 시도 무력화의 **폴백 경로 대사 주입**(T83, §16.1.3/§16.2/§16.6 G31). 실시간
    // 경로에서는 클라가 콜러블 응답을 Live 세션에 즉시 주입하지만, 이 텍스트 경로는 매 턴 서버가
    // 프롬프트를 조립하므로 여기서 `turnInstruction`으로 넣는다.
    //   - 권유 대사: 아직 announce되지 않은 오퍼가 있으면 주입하고 `announcedAt`을 마크한다(중복 방지).
    //   - 재연결 대사: `placedAt`이 있고 이번 턴이 **판정 앵커가 가리키는 바로 그 사기범 대사**일 때
    //     주입한다(서버가 별도 인사말을 생성하지 않는다 — §16.2 "생성 파이프라인 2벌 금지").
    // ⚠️ 턴 지시는 문자열 **1개**뿐이라 문자 announce와 충돌할 수 있다 — 선택 규칙은
    // `verifyIntercept/fallbackTurn.ts`의 순수 함수 한 곳에 모아 두었다(G31).
    const difficultyLevel = normalizeDifficultyLevel(session.difficultyLevel);
    const verifyEnabled = hasVerifyIntercept(session.scenarioId) && difficultyLevel === "advanced";
    const verifyItem = verifyEnabled ? findVerifyInterceptItem(session.scenarioId) : undefined;
    const scammerDocCount = scammerTurnNumber - 1;
    let verifyOfferRef: FirebaseFirestore.DocumentReference | undefined;
    let verifyState: { announced: boolean; placed: boolean; reconnectAnchorScammerTurn?: number } | undefined;
    // T192 C6-R(§79.20 (3) ③) — 오퍼 문서 상태(끊기 4행 입력). 읽지 않았거나(verifyItem 없음) 실패하면 `unknown`(막는 쪽).
    let verifyOfferDoc: VerifyOfferDocState = "unknown";
    if (verifyItem) {
      try {
        verifyOfferRef = sessionRef.collection("verifyIntercept").doc(verifyItem.offerId);
        const verifySnap = await verifyOfferRef.get();
        verifyOfferDoc = verifySnap.exists ? "present" : "absent";
        if (verifySnap.exists) {
          verifyState = {
            announced: Boolean(verifySnap.get("announcedAt")),
            placed: Boolean(verifySnap.get("placedAt")),
            reconnectAnchorScammerTurn: verifySnap.get("reconnectAnchorScammerTurn") as
              | number
              | undefined,
          };
        }
      } catch {
        // 조회 실패가 대화를 막지 않는다(P-4 핵심 루프 비차단) — 이번 턴은 지시 없이 진행한다.
      }
    }

    // ②-c′ 사기범 끊기 **사전 판정**(T192 C3 · Architecture.md §79.7 · §79.19 (5) 10 · AC-103). LLM 호출 전에 아는 값만으로
    // 실시간 콜러블과 **같은 판정 함수**를 부른다(AC-103 (f)). `accepted`인 턴에만 [진행 강제] 끊기 규칙이 SIGNAL 변형으로
    // 실린다(그 밖 = NONE — 종전 문면). 신호를 실제로 받아들일지는 응답 뒤 사후 판정이 다시 정한다(Mock · 문자 마커).
    // §108 — 4행 입력(목표 화면 행동 완료 · 실시간 콜러블과 같은 함수). 확인 무력화 세션에서만 읽는다 · 실패 = 미완료(fail-closed).
    let goalActionDone = false;
    if (verifyEnabled) {
      try {
        goalActionDone = hasCompletedGoalAction({
          delivered: smsDeliveredLoaded ? smsDelivered : [],
          mockScreens: await readMockScreenCompletion(sessionRef),
          declared: smsDeclared,
          declaredKnown: smsDeclaredReason === undefined,
          userTurns: userTurnsNow,
          followUpUserTurns: goalFollowUpFor(session.scenarioId, session.flowVariantId), // §115 C-5
        });
      } catch {
        goalActionDone = false;
      }
    }
    const hangupFacts: FallbackHangupFacts = {
      status: session.status,
      channel: session.channel,
      verifyEnabled,
      // 조회 실패(`verifyState` 부재)는 전환 전으로 본다 — 4행 fail-closed.
      transferPlaced: verifyState?.placed === true,
      // T192 C6-R(OQ-A152 (가)) — 폴백 계열 B ∧ 오퍼 문서 없음(읽기 성공)일 때만 false(서버 값만 · 클라 값 0).
      transferReachable: isVerifyTransferReachable({
        path: "fallback",
        scenarioId: session.scenarioId,
        offerDoc: verifyOfferDoc,
      }),
      goalActionDone,
      userTurns: userTurnsNow,
      limitReached,
      alreadyAccepted: Boolean(session.scammerHangup),
      relay: resolveHangupRelay(session),
      smsDeclared: smsSessionDeclared,
      smsDeliveredLoaded,
    };
    const hangupPre = decideFallbackHangup(hangupFacts, smsDelivered, false);
    const hangupMode = fallbackHangupMode(hangupPre);
    // ⭐ T192 C6-L(§79.20 (1) #12 · (8) L-1 · G601) — 사전 판정은 매 턴 1줄 남긴다. 신호가 없으면 "끊기 신호 무시" 로그도
    // 없어서, 4행 등이 매 턴 막는 세션(끊기 0)이 라이브에서 보이지 않았다. ⛔ G170 — 숫자 · 단계명만(대사 · 사용자 입력 0).
    logger.info("끊기 사전 판정", { sessionId, row: hangupPre.row, status: hangupPre.status, mode: hangupMode });
    // ②-d 모의 설치 응낙의 **인과 배선**(T84, §15.9.3 — §15.1.2/§15.1.4와 동형). 오버레이
    // 상호작용은 클라 전용이라 모델이 볼 수 없다. 이 턴에 `sessions/{sid}/mockScreens`에서
    // **응낙됐고(consentedAt) 아직 알리지 않은(consentAnnouncedAt 부재)** 항목을 찾으면 다음
    // 응답의 `turnInstruction`으로 1줄을 주입하고 `consentAnnouncedAt`을 세팅해 **1회만** 주입한다.
    //
    // ⚠️ 이 read는 **카탈로그에 `app-install` 항목이 있는 시나리오에서만** 수행한다
    // (`hasInCallSms(...)` 게이팅과 동형) — 나머지 12개 시나리오는 read 0회, 회귀 0.
    // ⚠️ 응낙이 **채널 전이를 유발하지 않는다**(§15.9.7 G54, AC-073) — 아래 ④-b 전이 판단은
    // 여전히 구조화 신호·max-turn 폴백만 본다.
    let mockConsentRef: FirebaseFirestore.DocumentReference | undefined;
    // T194-c-1 G607 — 그 응낙 항목의 진입 표면(메신저 링크 · 통화 중 문자). 응낙 지시 선택 함수의 입력이다(문서 id = landingId).
    let mockConsentSurface: MockScreenEntrySurface | undefined;
    // T194-a(리뷰 m1) — 카탈로그 소속이 아니라 **이 세션에서 도달 가능한** 설치 항목이 있을 때만 읽는다. 도달 불가 항목은
    // `recordMockScreenEvent`가 응낙 문서를 만들지 않으므로(G588 · ⑤) 동작은 같고, parcel 초급 · 중급의 매 턴 읽기 1회가 사라진다.
    if (listAppInstallMockScreens(session.scenarioId).some((item) => isMockScreenReachable(session, item))) {
      try {
        // 세션당 문서가 한 자릿수라(카탈로그 항목 수 상한) 전체를 읽고 메모리에서 고른다 —
        // 부등호 쿼리·복합 인덱스를 새로 만들지 않는다(Database.md 인덱스 표 무변경).
        const mockSnap = await sessionRef.collection("mockScreens").get();
        const pending = mockSnap.docs.find(
          (doc) => Boolean(doc.get("consentedAt")) && !doc.get("consentAnnouncedAt"),
        );
        if (pending) {
          mockConsentRef = pending.ref;
          mockConsentSurface = findMockScreenItem(session.scenarioId, pending.id)?.entrySurface;
        }
      } catch {
        // 조회 실패가 대화를 막지 않는다(P-4 핵심 루프 비차단) — 이번 턴은 지시 없이 진행한다.
      }
    }

    const turnChoice = pickFallbackTurnInstruction({
      smsDue: Boolean(deliveredSmsId),
      ...(verifyState ? { verify: verifyState } : {}),
      scammerDocCount,
      installConsentDue: mockConsentRef !== undefined,
    });
    // ⛔⛔ **지시 선택과 "예고 완료" 마킹은 분리돼 있다**(D2/F2 · §54.9 (4) 4 · G343). 여기서는
    // **문자열만 고르고 아무것도 기록하지 않는다** — 기록은 LLM 응답을 받은 뒤, 그 응답이 실제로
    // 지시를 반영할 수 있었던 경우에만 한다(아래 `wasTurnInstructionSpoken` 블록).
    // 예전에는 이 자리에서 곧바로 마크했고, Mock 강등 턴(= systemPrompt를 읽지 않는다)에서
    // **말하지 않은 예고가 "예고 완료"로 기록**돼 자동 전환이 열렸다(§54.2 (3)).
    // A-1 ⑧ — 메신저→voice 에스컬레이션 뒤의 폴백 턴인가(`roleplay/escalatedCall.ts` 판정표). 이미 통화 중이면 응낙 지시를
    // 통화 중 변형으로 바꾸고(아래), 다른 지시가 없는 턴에는 맥락 1줄을 싣는다(②-h).
    const escalatedCall = isEscalatedVoiceCall(session.channel, session.channelHistory);
    let turnInstruction: string | undefined;
    if (turnChoice === "install_consent") {
      // ⭐ T194-c-1 G607(§84.15.4 · Q-X4) — 선택은 이 함수 하나(폴백 · 실시간 같은 함수). 처음부터 통화인 Q2 세션은 `escalatedCall`이
      // 거짓이라 예전 선택식이 "전화로 이어서"를 실었다 — 진입 표면을 함께 본다. 표면을 못 찾으면(카탈로그 밖 문서) 메신저 행(현행).
      turnInstruction = installConsentInstructionFor({
        entrySurface: mockConsentSurface ?? "messenger-link",
        escalatedCall,
        path: "fallback",
        transferPlaced: verifyState?.placed === true,
      });
    } else if (turnChoice === "verify_reconnect") {
      turnInstruction = verifyItem?.reconnectInstruction;
    } else if (turnChoice === "sms_announce") {
      turnInstruction = dueSms?.announceInstruction;
    } else if (turnChoice === "verify_announce") {
      turnInstruction = verifyItem?.announceInstruction;
    }

    // ②-f 인증번호 서버 대조(2026-10-18 · Architecture §78 — #300 회귀 수정) — 참가자가 **숫자를 부른 그 턴에만**
    // 서버가 문자 속 번호와 비교해 "일치/다름" 결과 1줄을 붙인다. 번호(정답)는 모델에 주지 않는다. 숫자가 없는 턴·
    // 계좌 등 다음 문자 도착 뒤·호 전환 뒤에는 지시가 없다(roleplay/otpCheck.ts 판정표).
    const otpInputs = otpCheckInputsFromHistory(storedHistory);
    const otpCheck = await evaluateOtpCheck({
      scenarioId: session.scenarioId,
      userText,
      sessionId, // §114 — 문자에 보인 세션 번호와 대조
      ...(otpInputs.lastScammerText !== undefined ? { lastScammerText: otpInputs.lastScammerText } : {}),
      scammerTurnNumber,
      ...(deliveredSmsId ? { deliveredThisTurn: deliveredSmsId } : {}),
      isDelivered: async (smsId) => (await sessionRef.collection("inCallSms").doc(smsId).get()).exists,
      callTransferred: verifyState?.placed === true,
      // ⭐ T191 리뷰 M3 — 도착 기록을 읽었으면 그것으로 "다음 문자 도착"을 판정한다(못 읽었으면 종전 판정).
      ...(smsDeliveredLoaded ? { deliveredRecords: smsDelivered } : {}),
    });
    const otpCheckInstruction = otpCheck.instruction;
    // §80 — 라이브에서 대조가 붙었는지 확인할 수 있게 판정 결과를 남긴다. 숫자가 없는 턴(대부분)은 남기지 않는다.
    // ⛔ G170 — 번호·대사·사용자 발화는 싣지 않는다(코드값·ID·턴 번호만).
    if (otpCheck.reason !== "no-digits" && otpCheck.reason !== "no-otp-scenario") {
      logger.info("인증번호 대조 판정", {
        sessionId,
        scenarioId: session.scenarioId,
        scammerTurnNumber,
        outcome: otpCheck.outcome,
        reason: otpCheck.reason,
        repeat: otpCheck.repeat === true,
      });
    }
    // ②-g T191 — 텍스트 폴백의 문자 요청 제시(지금 게이트가 열린 목적만 · 전환 뒤에는 제시하지 않는다 — 원 사기범이 없다).
    // 백스톱 넛지는 같은 자리에 1줄 더 붙는다(설계 "폴백 — 넛지 = 턴 지시 1줄").
    const smsOfferInstruction =
      smsDeclared.length > 0 && verifyState?.placed !== true
        ? buildSmsMarkerOfferInstruction(
            smsDeclared
              .filter(
                (item) =>
                  resolveSmsGate({
                    purpose: item.purpose,
                    declared: smsDeclared,
                    delivered: smsDelivered,
                    userTurns: userTurnsNow,
                  }).status === "allowed",
              )
              .map((item) => item.purpose),
          )
        : undefined;
    // ②-h A-1 ⑦ — 필수 계좌·링크 문자가 도착한 뒤 참가자가 "했다" 류로 응한 턴에 1회 "결과(입금 확인·처리 완료)를 알리고
    // 다음 단계(또는 마무리)로" 지시(`inCallSms/confirmResult.ts` 판정표). G31(턴 지시 1개)에 맞춰 **다른 턴 지시가 없는 턴에만**
    // 싣는다(문자 announce · 확인 오퍼 · 응낙 · 인증번호 대조 · 문자 마커 제시 · 백스톱 넛지가 있는 턴 · 호 전환 뒤 = 0 — 리뷰 Minor-1).
    // ⛔ 공유 판정 패턴(J-2) 무접촉.
    const confirmPlan =
      smsDeliveredLoaded &&
      turnChoice === "none" &&
      !otpCheckInstruction &&
      !smsOfferInstruction &&
      !smsNudgeInstruction &&
      verifyState?.placed !== true
        ? planConfirmResult({
            scenarioId: session.scenarioId,
            declared: smsDeclared,
            delivered: smsDelivered,
            userTurns: userTurnsNow,
            currentUserText: maskedUserText,
            priorUserTexts: storedHistory.filter((m) => m.role === "user").map((m) => m.textMasked),
          })
        : undefined;
    if (confirmPlan?.instruction) {
      // G170 — 단계명 · 목적 · 발화 수만(대사 0).
      logger.info("[A-1] sendMessage 확인 결과 지시", { sessionId, purpose: confirmPlan.purpose, userTurns: userTurnsNow });
    }
    // A-1 ⑧ — 에스컬레이션 뒤 폴백 턴의 맥락 1줄(다른 턴 지시가 없는 턴에만 — G31).
    const escalatedCallInstruction =
      escalatedCall && turnChoice === "none" ? ESCALATED_CALL_CONTEXT_INSTRUCTION : undefined;
    // §104(전수 검수 2차 F4 · M4) — 직전 두 사기범 대답이 같은 인적사항 요구 · 거의 같은 말이면 "다른 카드로" 1줄(`repeatBreak.ts` 판정표).
    // 앱 진행 지시(문자 · 확인 · 응낙 · 인증번호 대조 · 확인 결과)가 있는 턴에는 싣지 않는다(G31 — 그 지시가 이미 다음 국면을 정한다).
    const repeatBreakKind =
      turnChoice === "none" && !otpCheckInstruction && !confirmPlan?.instruction
        ? decideRepeatBreak(storedHistory.filter((m) => m.role === "scammer").map((m) => m.textMasked), maskedUserText)
        : null;
    if (repeatBreakKind) {
      // G170 — 판정 종류 · 턴 번호만(대사 0).
      logger.info("[§104] sendMessage 반복 차단 지시", { sessionId, kind: repeatBreakKind, scammerTurnNumber });
    }
    const promptTurnInstruction = [turnInstruction, otpCheckInstruction].filter(Boolean).join("\n") || undefined;
    const confirmAndCallContext =
      [confirmPlan?.instruction, escalatedCallInstruction, repeatBreakInstruction(repeatBreakKind)].filter(Boolean).join("\n") ||
      undefined;
    const turnInstructionWithSms =
      [promptTurnInstruction, confirmAndCallContext, smsNudgeInstruction, smsOfferInstruction].filter(Boolean).join("\n") ||
      undefined;
    // §120 — 사진 턴이면 캐릭터 유지형 반응 지시 1줄을 맨 뒤에 붙인다(`photoTurn.ts` 표 · 그 밖 턴 = 없음 · 문면 바이트 동일).
    const turnInstructionWithPhoto =
      [turnInstructionWithSms, photoTurnInstruction(isPhotoTurn)].filter(Boolean).join("\n") || undefined;

    // 첫 사용자 턴만 LLM 시간 제한 20초(2026-10-18, 사용자 결정 C — llm/index.ts LLM_FIRST_TURN_TIMEOUT_MS).
    // AC-004 목표(95% ≤10초)의 예외 1건 — 첫 턴은 Gemini 지연이 반복돼 10초에서 Mock으로 강등됐고,
    // 사용자는 문맥 없는 Mock 대사보다 더 기다리는 쪽을 골랐다. 20초는 onCall 기본 실행 제한(60초) 안이다.
    // storedHistory는 이번 사용자 메시지를 쓰기 **전**에 읽은 이력이다(위 턴 확보 트랜잭션).
    const llmClient = isFirstUserTurn(storedHistory) ? getLlmClient(LLM_FIRST_TURN_TIMEOUT_MS) : getLlmClient();
    // §110.5(실기 신고 14) — 참가자가 고른 호칭(세션 문서 값 · 부재 = 원문 호칭).
    const familyAddressPrompt = resolveFamilyAddressPrompt(session.scenarioId, sessionFamilyAddress(session));
    const completion = await completeWithFallback(llmClient, {
      // T85(§17.3 호출부 3곳 중 "텍스트 턴", G63) — 고급에서 D4(절차·서류 정당화) 블록을 얹을
      // 시나리오인지. 세 호출부가 같은 판정 함수를 쓰지 않으면 "텍스트 턴은 고급인데 오프닝만
      // 축소" 같은 비대칭이 **에러 없이** 생긴다(기본값이 축소형이다).
      // §50.4.4/§50.3.3(G298 호출부 3곳 중 "텍스트 턴") — identityCheckAllowed·speakerGender도
      // 표에서 파생해 항상 넘긴다(기본값이 관대한 쪽/미출력이라 빠뜨려도 에러는 안 나지만 조용히
      // 축소되거나 목소리·말이 어긋난다).
      systemPrompt: buildSystemPrompt(scenarioPrompt, {
        difficultyLevel,
        // ⭐ 리뷰 M2 — 세 호출부 · 도구 선언과 같은 단일 술어(변형 기준 · 변형 부재 = 종전).
        inCallSmsEnabled: sessionDeclaresInCallSms(session.scenarioId, session.flowVariantId),
        // A-1 ② — 문자 예외 항목의 예시를 선언 목적만으로(호출부 3곳 같은 술어 · G63).
        inCallSmsPurposes: sessionDeclaredSmsPurposes(session.scenarioId, session.flowVariantId),
        // 2026-10-21 — 계좌 문자의 이체 링크(호출부 3곳 같은 술어 · G63).
        transferSmsLink: sessionTransferSmsOpensLanding(session.scenarioId, session.flowVariantId),
        verifyInterceptEnabled: verifyEnabled,
        l3Procedural: isL3Procedural(session.scenarioId),
        identityCheckAllowed: asksIdentityCheck(session.scenarioId),
        // T194-a(§84.4.3) — 세션 단위 해석(표 값이 있으면 그대로 · parcel 고급만 변형 leg 성별).
        speakerGender: resolveSessionSpeakerGender(session),
        ...(turnInstructionWithPhoto ? { turnInstruction: turnInstructionWithPhoto } : {}),
        fictionalBankName,
        sessionAccountNumber: resolveSessionAccountNumber(session.scenarioId),
        // T194-b(§84.3.4 · G568 호출부 3곳 중 "텍스트 턴") — 세션 문서 값 그대로(부재 = 블록 0 · 바이트 동일).
        // ⚠️ `hangupMode` 앞에 둔다 — G552 ⓒ 소스 스캔이 hangupMode를 옵션 마지막으로 고정한다.
        personaCard: session.personaCard?.items,
        // §110.5 — 호칭(호출부 3곳 같은 값 · 부재 = 블록 0 · 바이트 동일).
        ...(familyAddressPrompt ? { familyAddress: familyAddressPrompt } : {}),
        // T192 C3 — 사전 판정이 `accepted`인 턴만 "signal"(§79.6 ②). 그 밖 = "none"(종전 문면 바이트 동일 · G505).
        hangupMode,
      }),
      messages: llmHistory,
      // 2026-10-21 — 에스컬레이션 뒤 통화에서는 채팅 단계 전용 수법("통화가 안 돼")을 Mock 대사 원천에서 뺀다(`escalatedCall.ts` 판정표).
      mockTacticHints: callPhaseMockTacticHints(scenarioPrompt.weakenedTactics, escalatedCall).map((tactic) =>
        applyFamilyAddressText(tactic, familyAddressPrompt),
      ),
      // §102 — 사기범 대사 경로: 영어 거절 등 쓸 수 없는 응답은 다음 단계(Groq → Mock)로 넘긴다.
      purpose: "scammer-reply",
    });
    // 몇 단계 공급자가 응답했는지(2026-10-18 Groq 3차 예비, Architecture.md §75.7) — 라이브 로그로
    // 1차 Gemini / 2차 Gemini 대체 / 3차 Groq / Mock 강등 비율을 읽는다. 숫자·ID·단계명만(G170).
    logger.info("sendMessage LLM 응답 단계", {
      scenarioId: session.scenarioId,
      servedBy: completion.servedBy ?? (completion.isMock ? "mock" : "unknown"),
      isMock: completion.isMock,
    });

    // ②-e ⭐⭐ **"예고 완료" 마킹 — 발화된 턴에만**(D2/F2 · §54.9 (4) 4 · **G343**).
    // `MockLlmClient.complete()`는 `systemPrompt`를 읽지 않으므로 강등 턴에서는 위 `turnInstruction`이
    // 0효과다. 그 턴에 마크해 버리면 *"말하지 않은 예고"* 가 완료로 남아, 폴백의 노출 조건이 그것을
    // 참으로 읽고 **예고 대사 없이 확인 데스크 전환**을 연다(§38이 실시간에서 닫은 결함의 재발).
    // ⇒ 마크하지 않으면 다음 턴에 같은 분기가 다시 잡혀 예고가 **재시도**된다(중복이 아니다).
    // ⛔ 마킹 대상 2종은 전수 확인 결과다 — `sms_announce`·`verify_reconnect`는 마킹이 없어 무해.
    if (wasTurnInstructionSpoken(completion)) {
      if (turnChoice === "install_consent") {
        try {
          await mockConsentRef?.update({ consentAnnouncedAt: Timestamp.now() });
        } catch {
          // 마크 실패는 다음 턴에 같은 확인이 한 번 더 나가는 정도의 열화다(대화는 막지 않는다).
        }
      } else if (turnChoice === "verify_announce" && verifyOfferRef) {
        try {
          // ⭐⭐ **§45.7 V1** — `announcedAt` 마킹과 **같은 write**로 표시 앵커를 이 턴으로 옮긴다.
          // `deliverVerifyOffer`가 굳혀 둔 `offerAnchorScammerTurn`은 **오퍼 요청 시점**의 사기범
          // 문서 수라, 예고 대사가 나오는 이 턴보다 **항상 앞**을 가리킨다(§45.6 F2-b — 구조적).
          // 그 결과 리포트 리플레이에서 확인 오퍼 카드가 예고 대사보다 먼저 그려졌다.
          // ⛔ **카드를 지우거나 렌더 순서를 손대는 방식이 아니다**(§45.7 V3·V4 기각) — 고치는 것은
          // **앵커 값 하나**이고, 리졸버·필드·컬렉션은 전부 그대로다(G252).
          // ⚠️ 앵커 값(`scammerDocCount`)은 이 이동으로 바뀌지 않는다 — 같은 턴 안이고, 사기범
          // 응답 문서는 아직 쓰이지 않았다(아래 ③에서 쓴다).
          // `announcedAt`은 `pickFallbackTurnInstruction`이 `!announced`일 때만 이 분기를 고르므로
          // 한 번만 마크되고, 따라서 이 갱신도 **1회 = 멱등**이다.
          await verifyOfferRef.update({
            announcedAt: Timestamp.now(),
            offerAnchorScammerTurn: announcedVerifyAnchor(scammerDocCount),
          });
        } catch {
          // 마크 실패는 다음 턴에 같은 권유가 한 번 더 나가는 정도의 열화다(대화는 막지 않는다).
          // 앵커 갱신도 함께 미뤄진다 — 다음 턴에 같은 분기가 다시 잡혀 그 턴 값으로 갱신된다.
        }
      }
    }

    // ③ 메신저 확장(T29) — 스미싱 링크 마커([[LINK:id]])를 저장 전 텍스트에서 제거하고
    // attachments로 변환한다(§13.2 sentinel 패턴 재사용, linkMarker.ts 근거 참고). 보이스 세션의
    // 응답에는 애초에 마커가 없으므로 attachments가 항상 undefined로 빠져 기존 동작에 영향 없다.
    // 응답도 저장 전 마스킹(원칙상 사기범 발화엔 사용자 PII가 섞일 일이 적지만, 저장 전 마스킹
    // 원칙을 대화 로그 전체에 일관 적용 — ADR-0004).
    // T84(§15.9.1 R4) — 시나리오를 함께 넘겨 attachment에 `landingKind`가 실린다(서버 카탈로그가
    // 진실 원천, 클라 분류 금지). 카탈로그가 없는 시나리오는 키 자체가 붙지 않아 무변경이다.
    // T194-a(§84.4.4 · G582) — 세션을 넘겨 이 세션에서 도달 불가한 설치 마커를 강등한다(초급 · 중급 parcel).
    const { text: linkFreeReplyText, attachments: markerAttachments } = extractLinkMarker(
      completion.text,
      session.scenarioId,
      session,
    );
    // ③-a PR-A3(감사 B 1일차 #4) — 이미 대화에 나온 링크 칩을 링크를 말하지 않는 대사에 또 붙이지 않는다(linkChipRepeat.ts 표).
    // 첫 칩 · 링크를 다시 가리키는 대사의 칩은 그대로다 — 앵커(첫 칩 메시지)는 바뀌지 않는다.
    const replyAttachments = dropRepeatedLinkChips(markerAttachments, linkFreeReplyText, storedHistory);
    // ③-a′ T191 — 문자 요청 마커를 걷어 낸다(아래 문장 수 상한보다 **앞** — 상한이 끝의 마커를 잘라 먹지 않게).
    const { text: smsMarkerFreeText, purpose: markerPurpose, markerCount: smsMarkerCount } =
      extractSmsMarker(linkFreeReplyText);

    // ③-b 에스컬레이션 확장(T30, Architecture.md §13.2, AC-034/024) — 구조화 신호
    // ([[SIGNAL:ESCALATE_VOICE]])를 링크 마커와 같은 sentinel 패턴으로 스캔·제거한다. 사용자는
    // 마커 원문을 절대 보지 않는다. 이 스캔은 **LLM 완성 텍스트에만** 적용된다(사용자 입력에는
    // 절대 적용하지 않음 — AC-024, escapeSentinelLookalikes가 사용자 입력의 흉내를 이미 무력화).
    // T192 C3 — 같은 추출이 끊기 신호(`END_CALL_GOAL` · `END_CALL_GIVEUP`)도 판별한다(정규식 · 자리 · 정리 무변경 — 신호는
    // 어느 경우든 텍스트에서 지워진다). 효과는 아래 사후 판정이 정한다.
    const {
      text: signalFreeReplyText,
      escalate: rawSignalEscalate,
      endCall: rawEndCallSignal,
    } = extractEscalationSignal(smsMarkerFreeText);
    // ③-b′ §104(전수 검수 2차 M1 · M2) — 신호가 같은 응답의 대사와 어긋나면 받아들이지 않는다(`signalConsistency.ts` 판정표 A · B).
    // 통화가 안 된다고 말한 턴의 전화 전환 · 새 송금을 요구한 턴의 목표 끊기. 신호는 위에서 이미 텍스트에서 지워졌다.
    const escalationCheck = rawSignalEscalate ? judgeEscalationSignal(signalFreeReplyText) : undefined;
    const signalEscalate = rawSignalEscalate && escalationCheck?.accept === true;
    const endCallCheck = judgeEndCallSignal(rawEndCallSignal, signalFreeReplyText);
    const endCallSignal = endCallCheck.endCall;
    if ((escalationCheck && !escalationCheck.accept) || endCallCheck.dropped) {
      // G170 — 사유 코드만(대사 0).
      logger.info("[§104] 대사와 어긋난 신호 무시", {
        sessionId,
        ...(escalationCheck && !escalationCheck.accept ? { escalate: escalationCheck.reason } : {}),
        ...(endCallCheck.dropped ? { endCall: endCallCheck.dropped } : {}),
      });
    }
    // ③-c 사기범 대사 손질(2026-10-17 라이브 신고 — 실존 은행명 + 5~7문장 대사). 링크·신호 마커가 다
    // 빠진 텍스트에만 적용한다. (1) 실존 은행·카드사 이름 → OO은행/OO카드(숫자는 그대로 —
    // guardrails/realFinancialNames.ts 헤더). (2) 문장 수 상한(replyLength.ts) — ⛔ "예고 완료"를
    // 마킹하는 지시 2종(`verify_announce`·`install_consent`) 턴에는 **적용하지 않는다**: 예고 문장이
    // 잘려도 위 ②-e가 (실 LLM 턴이면) 마킹했으므로 "말하지 않은 예고" 결함(G343)이 재발한다.
    // 마킹이 없는 `sms_announce`·`verify_reconnect`는 잘려도 상태 기록이 틀어지지 않아 적용한다
    // (2026-10-18 문자 도착 턴 5문장 신고 · 한계는 `shouldLimitReplySentences` 주석).
    // ③-c′ PR-A3 — 모델 표기 잔재(굵게 별표 · 빈 백틱 · 지문 괄호)를 지운다(replyMarkup.ts 표). 마커가 다 빠진 뒤 · 문장 상한 앞.
    const { text: markupFreeReplyText } = tidyScammerReplyMarkup(signalFreeReplyText);
    const { text: realNameReplacedText, replacedCount: realNameReplacedCount } =
      replaceRealFinancialNames(markupFreeReplyText);
    // §81 — 실존명 치환 결과("OO은행")와 모델이 그대로 말한 자리표시자를 세션 가상 은행명으로 맞춘다(문자 본문과 일치).
    const realNameFreeReplyText = applyFictionalBank(realNameReplacedText, fictionalBankName);
    const lengthLimited = shouldLimitReplySentences(turnChoice)
      ? limitReplySentences(realNameFreeReplyText)
      : undefined;
    const shapedReplyText = lengthLimited ? lengthLimited.text : realNameFreeReplyText;
    // 로그에는 숫자·ID만 싣는다(대사 본문 금지 — G170).
    if (realNameReplacedCount > 0) {
      logger.info("사기범 대사 실존 금융회사명 치환", {
        path: "sendMessage",
        scenarioId: session.scenarioId,
        replacedCount: realNameReplacedCount,
      });
    }
    if (lengthLimited?.trimmed) {
      logger.info("사기범 대사 문장 상한 적용", {
        path: "sendMessage",
        scenarioId: session.scenarioId,
        originalSentences: lengthLimited.originalSentences,
        keptSentences: lengthLimited.keptSentences,
      });
    }
    // 2026-09-06 버그수정 — 사기범(LLM) 응답에는 maskPII를 적용하지 않는다(scammerReplyMasking.ts
    // 헤더 주석 참고 — 라이브 신고 "[계좌]" 리터럴 노출, 시나리오·난이도 무관 공통 재현).
    const finalReplyText = finalizeScammerReplyText(shapedReplyText);
    await messagesRef.add({
      role: "scammer",
      textMasked: finalReplyText,
      turnIndex: nextIndex + 1,
      createdAt: Timestamp.now(),
      ...(replyAttachments ? { attachments: replyAttachments } : {}),
      ...(session.channel ? { channel: session.channel } : {}),
    } satisfies MessageDoc);

    // ③-d T191 — 모델 마커 경로. 응답을 저장한 **뒤**라 앵커에 이번 응답이 포함된다. 같은 단일 통로를 지난다.
    // T192 C3 — 사후 판정용 도착 목록(마커 도착 1건을 같은 발화 수로 더한다 — §79.19 (4)).
    let smsDeliveredAfterReply: readonly DeliveredSmsRecord[] = smsDelivered;
    let smsMarkerDeliveryFailed = false;
    if (smsMarkerCount > 0) {
      try {
        const result = await deliverSmsThroughGate(smsStore, {
          ...smsDeliveryBase,
          userTurns: userTurnsNow,
          purpose: markerPurpose,
          anchorScammerTurn: textPathAnchorScammerTurn(scammerTurnNumber),
          trigger: "model_marker",
        });
        logSmsGate(sessionId, "model_marker", markerPurpose, result.status, userTurnsNow, smsDeclaredReason);
        if (result.status === "delivered" && !deliveredSmsId) deliveredSmsId = result.item.smsId;
        if (result.status === "delivered") {
          smsDeliveredAfterReply = [
            ...smsDeliveredAfterReply,
            { smsId: result.item.smsId, userTurnsAtArrival: userTurnsNow },
          ];
        }
      } catch {
        // P-4 — 문자 도착 실패가 대화를 막지 않는다(응답은 이미 저장됐다).
        // T192 C3 — 도착 여부를 모르는 턴은 끊기 쪽에서 문자 대기로 본다(fail-closed · 그 턴만 끊기 0).
        smsMarkerDeliveryFailed = true;
      }
    }

    // ③-e 사기범 끊기 **사후 판정**(T192 C3 · §79.19 (5) 10 · 11) — 마커 발송 뒤 · 재확인 트랜잭션 앞. Mock 강등 턴(3행) ·
    // 같은 응답의 문자 마커 도착(6행 — 문자가 이긴다, OQ-A140)이 여기서 걸린다. 신호는 SIGNAL 턴 + 사후 승인일 때만 효과가 있다.
    const hangupPost = decideFallbackHangup(
      smsMarkerDeliveryFailed ? { ...hangupFacts, smsDeliveredLoaded: false } : hangupFacts,
      smsDeliveredAfterReply,
      completion.isMock,
    );
    const hangupEffect = resolveFallbackHangupEffect({
      endCall: endCallSignal,
      hangupMode,
      pre: hangupPre,
      post: hangupPost,
    });
    if (!hangupEffect.end && hangupEffect.ignored) {
      // G170 — 단계명 · 행 · status만(대사 0).
      logger.info("끊기 신호 무시", { sessionId, row: hangupEffect.ignored.row, status: hangupEffect.ignored.status });
    }

    // ④ 한도 도달 → ended:true + status=ended(→onSessionEnded 트리거, AC-007). 값(`limitReached`)은 위 ④ 한도 계산
    // (LLM 전 · T192 C3)이 이미 정했다.

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
      // T192 C3(§79.19 (5) 10) — 끊기 승인 = 같은 트랜잭션에서 종료 + 승인 표식(서버측 근거 · 리포트는 읽지 않는다 — G511).
      // 한도가 이긴다(7행 — `!limitReached`). 이미 끝난 세션은 건드리지 않는다(`stillActive`).
      const hangupAccepted = hangupEffect.end && stillActive && !limitReached;
      // §112(사용자 결정 2026-10-23 *"ai가 먼저 끊는 경우도 메신저로 넘어가도록"*) — 메신저에서 넘어온 통화(`escalatedCall`)는 여기서 세션을
      // 끝내지 않고 표식만 남긴다. 화면이 끊김 안내 → 전사 제출 → 역전환을 하고, 역전환이 표식의 종류로 끝낼지 이어갈지 정한다
      // (`session/callReturn.ts` `decideCallReturn`). 처음부터 통화인 세션은 종전(같은 트랜잭션에서 종료).
      const hangupEnded = hangupAccepted && !escalatedCall;
      const hangupToMessenger = hangupAccepted && escalatedCall;
      if (hangupEffect.end && hangupAccepted) {
        const endedAt = Timestamp.now();
        if (hangupEnded) {
          update.status = "ended";
          update.endReason = "scammer_ended";
          update.endedAt = endedAt;
        }
        update.scammerHangup = { acceptedAt: endedAt, kind: hangupEffect.kind, path: "fallback" };
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
      return { stillActive, hangupEnded, hangupToMessenger };
    });

    // T8 배선: 한도 도달로 이 턴이 세션을 자동 종료시켰다면(status=ended, endReason=limit_reached),
    // endSession 콜러블 경로와 동일한 리포트 생성 트리거 지점을 거치도록 한다(AC-007 "종료된 모든
    // 세션은 정확히 1개의 리포트를 생성" — endSession을 거치지 않는 이 자동종료 경로가 리포트
    // 트리거를 빠뜨리던 기존 갭, T7 구현 보고서에 명시된 known gap). 실제 생성 로직은 T9 소관이라
    // 여전히 트리거 지점만이며, 실패해도 sendMessage 응답 자체는 막지 않는다(triggerReportGeneration
    // 내부에서 에러를 흡수, functions/src/report/index.ts 참고). stillActive가 false면 위에서 이미
    // 종료 필드를 반영하지 않았으므로(=이 턴이 종료를 일으키지 않았으므로) 트리거하지 않는다 —
    // 그 세션은 이미 다른 경로(endSession)로 리포트가 트리거됐다.
    // T192 C3 — 끊기로 이 턴이 세션을 끝냈어도 같은 트리거 지점을 거친다(조건만 확장 · §79.7 5).
    if ((limitReached || finalize.hangupEnded) && finalize.stillActive) {
      await triggerReportGeneration(sessionId);
    }

    // ④-b 채널 전이(T30, Architecture.md §13.2/13.3, AC-034/039) — 이 시나리오가 에스컬레이션
    // 가능하고 아직 메신저 단계일 때만 판단한다. 우선순위: 구조화 신호
    // > max-turn 폴백(MESSENGER_ESCALATION_FALLBACK_TURNS, §13.3 PoC 전 가정치). 이번 턴에 전체
    // 세션 한도(limitReached)로 이미 종료됐다면 전이보다 종료를 우선한다(모순된 상태 방지). 위
    // 트랜잭션에서 이미 종료된 것으로 확인됐다면(stillActive=false) 이 턴이 전이를 일으키지 않는다.
    // ⭐ T194-a(§84.4.1 S-3) — "에스컬레이션 가능"은 (시나리오 × 난이도) 세션 술어다(parcel은 고급만). `requestEscalation`(S-2) ·
    // 클라 "전화로 확인" 버튼 · 시작 고지 열과 같은 술어다(startNoticeGate.test.ts G462 ⑤).
    // §104.9 — 이 턴에 사기범이 메신저를 끝냈으면(같은 응답에 전화 전환 신호가 함께 와도) 전이하지 않는다 — 끝난 세션을 통화로 옮기지 않는다.
    const canEscalate =
      finalize.stillActive &&
      !finalize.hangupEnded &&
      session.channel === "messenger" &&
      resolveSessionEscalation(session, PUBLIC_SCENARIOS) !== undefined;
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
          text: finalReplyText,
        });
        audioUrl = synthesis.audioUrl;
      } catch {
        // 합성 실패는 무시 — 클라는 audioUrl 없으면 텍스트만 표시(폴백).
      }
    }

    const reply: ScammerMessage = {
      role: "scammer",
      text: finalReplyText,
      ...(replyAttachments ? { attachments: replyAttachments } : {}),
    };
    return {
      reply,
      turnCount,
      ended: limitReached || finalize.hangupEnded,
      ...(limitReached
        ? { endReason: "limit_reached" as const }
        : finalize.hangupEnded
          ? { endReason: "scammer_ended" as const }
          : {}),
      isMock: completion.isMock,
      ...(audioUrl ? { audioUrl } : {}),
      ...(escalationTrigger ? { escalation: { toChannel: "voice" as const } } : {}),
      ...(deliveredSmsId ? { sms: { smsId: deliveredSmsId } } : {}),
      // §112 — 메신저에서 넘어온 통화의 폴백 끊기(세션은 아직 active · 화면이 끊김 안내 뒤 역전환).
      ...(finalize.hangupToMessenger ? { scammerHungUp: true as const } : {}),
    };
  },
);
