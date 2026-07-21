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
    const historySnap = await messagesRef.orderBy("turnIndex", "asc").get();
    const storedHistory = historySnap.docs.map((doc) => doc.data() as MessageDoc);

    const nextIndex = storedHistory.length;
    const userWriteTime = Timestamp.now();
    await messagesRef.add({
      role: "user",
      textMasked: maskedUserText,
      turnIndex: nextIndex,
      createdAt: userWriteTime,
    } satisfies MessageDoc);

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

    // ④ turnCount++·경과시간 체크 → 한도 도달 시 ended:true + status=ended(→onSessionEnded 트리거,
    // AC-007). 세션 시작 시점(createdAt) 기준 경과시간으로 MAX_SESSION_MS를 판단한다.
    const turnCount = session.turnCount + 1;
    const elapsedMs = userWriteTime.toMillis() - session.createdAt.toMillis();
    const limitReached = isSessionLimitReached({
      turnCount,
      maxUserTurns: session.maxUserTurns,
      elapsedMs,
      maxSessionMs: session.maxSessionMs,
    });

    const sessionUpdate: Partial<SessionDoc> = {
      turnCount,
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

    const reply: ScammerMessage = { role: "scammer", text: maskedReplyText };
    return {
      reply,
      turnCount,
      ended: limitReached,
      ...(limitReached ? { endReason: "limit_reached" as const } : {}),
      isMock: completion.isMock,
    };
  },
);
