// 세션 라이프사이클 (Track B, T8). API.md `createSession`/`endSession` 1:1. AC-003/006/007/021.
//
// ⚠️ createSession은 원래 Architecture.md §4/API.md가 Track B·T8 소유로 지정한 파일이다. T7(역할극
// 엔진) 태스크 지시가 "AC-003(세션 시작 시 인격으로 대화 시작) 검증을 위해 createSession도 지금
// 구현하라"고 명시적으로 요청해 T7이 앞당겨 구현했다 — src/lib/api/createSession.ts의 기존 주석은
// "T8에서 실호출로 교체"였지만, 이 콜러블 본문은 이미 실호출이다. T8은 이 구현을 처음부터 다시
// 만들 필요 없이 세션 라이프사이클의 나머지 부분(endSession 본문, AC-006/015/023 — 상시 종료·
// 디스컬레이션·"훈련이었습니다" 고지)에 집중하면 된다(구현 보고서에 크로스트랙 노트로 남김).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { generateOpeningLine, isUsingMockLlm } from "../roleplay";
import { triggerReportGeneration } from "../report";
import { SCENARIO_PROMPTS } from "../scenarios";
import { MAX_SESSION_MS, MAX_USER_TURNS } from "../shared/constants";
import { getVoiceProvider } from "../voice/provider";
import type { MessageDoc, SessionDoc } from "../shared/types";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionRequest,
  EndSessionResponse,
} from "./types";

ensureFirebaseAdminApp();

export const createSession = onCall<CreateSessionRequest, Promise<CreateSessionResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { scenarioId, voiceId, sessionId } = request.data ?? {};
    if (!scenarioId || !voiceId) {
      throw new HttpsError("invalid-argument", "scenarioId와 voiceId가 필요합니다.");
    }
    if (!SCENARIO_PROMPTS[scenarioId]) {
      throw new HttpsError("invalid-argument", `존재하지 않는 scenarioId입니다: ${scenarioId}`);
    }

    const db = getFirestore();

    // AC-017 서버측 동의 게이팅(#4 보안 하드닝, 2026-07-22) — 그동안 동의 확인은 클라 라우팅
    // (RouteGuard·consent 페이지)에만 의존했다. 콜러블을 직접 호출하면 동의 없이 세션이 생성될 수
    // 있어, 서버에서도 users/{uid}/consents(granted:true)를 1건 이상 확인한다(클라 hasGrantedConsent와
    // 동일 기준). 동의 없으면 세션 생성을 거부한다.
    const consentSnap = await db
      .collection("users")
      .doc(request.auth.uid)
      .collection("consents")
      .where("granted", "==", true)
      .limit(1)
      .get();
    if (consentSnap.empty) {
      throw new HttpsError("failed-precondition", "훈련 참여 동의가 필요합니다.");
    }

    // roleplay 모듈(트랙 A 내부 계약, Architecture.md §4)에 오프닝 사기범 대사 생성을 위임한다.
    // LLM 호출 지점은 functions/src/llm 어댑터를 거친다(sendMessage와 동일 구조, T7 태스크 지시).
    const openingMessage = await generateOpeningLine(scenarioId);
    const isMock = isUsingMockLlm();

    // T4: sessionId(온보딩 "사전 세션 id")가 넘어오면 createVoiceClone이 만들어 둔 pending
    // sessions/{sid} 문서를 새로 만들지 않고 채택한다 — sessionId 불일치 갭 해소. 넘어오지 않으면
    // 기존과 동일하게 새 id를 발급한다(하위호환). ID 생성/채택 로직만 바꿨고, 그 외 인격유지·
    // 가드레일·프롬프트 조립 로직은 그대로다.
    let sessionRef = db.collection("sessions").doc();
    if (sessionId) {
      const candidateRef = db.collection("sessions").doc(sessionId);
      const candidateSnap = await candidateRef.get();
      if (candidateSnap.exists) {
        const candidate = candidateSnap.data();
        if (candidate?.uid !== request.auth.uid) {
          throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
        }
        // #1 치명 버그 차단(2026-07-22): 같은 사전 id로 이미 시작(active)되었거나 종료(ended)된
        // 세션을 되살려 쓰지 못하게 막는다. 정상 클론 경로의 pending 문서는 status:"created"라
        // 통과한다. 클라(session/end)가 종료 시 사전 id를 비우므로 정상 흐름에선 이 경로에 안 걸리며,
        // 이 가드는 클라 클리어가 누락된 경우의 서버측 이중 방어다.
        if (candidate?.status === "active" || candidate?.status === "ended") {
          throw new HttpsError(
            "failed-precondition",
            "이미 사용된 세션입니다. 시나리오 선택부터 다시 시작해 주세요.",
          );
        }
      }
      sessionRef = candidateRef;
    }
    const now = Timestamp.now();

    // NOTE(T3/T8 후속): identitySelfConfirmed는 CreateSessionRequest 계약에 없다(API.md). voiceId가
    // 전달됐다는 것은 이미 본인 확인 게이트(ADR-0002)를 통과해 createVoiceClone까지 마쳤다는 뜻이라
    // true로 간주한다 — T3(온보딩)이 별도 소스(예: consents 문서)를 명시적으로 넘기고 싶다면 이
    // 가정을 교체하면 된다.
    const sessionDoc: SessionDoc = {
      sessionId: sessionRef.id,
      uid: request.auth.uid,
      scenarioId,
      status: "active",
      voiceId,
      cloneStatus: "ready",
      identitySelfConfirmed: true,
      turnCount: 0,
      maxUserTurns: MAX_USER_TURNS,
      maxSessionMs: MAX_SESSION_MS,
      createdAt: now,
      // Firestore admin SDK는 필드값 undefined를 기본적으로 거부하므로(ignoreUndefinedProperties
      // 미설정), Mock이 아닐 때는 llmProvider 필드 자체를 생략한다.
      ...(isMock ? { llmProvider: "mock" as const } : {}),
    };
    // merge:true — sessionId를 채택한 경우 pending 문서(createVoiceClone이 만든 voiceProvider 등
    // 부가 필드)를 지우지 않고 scenarioId/status 등을 덧씌운다. 새 문서인 경우는 기존과 동일.
    await sessionRef.set(sessionDoc, { merge: true });

    await sessionRef.collection("messages").add({
      role: "scammer",
      textMasked: openingMessage.text,
      turnIndex: 0,
      createdAt: now,
    } satisfies MessageDoc);

    // 실시간 음성 통화 전환(2026-07-22 사용자 결정) — sendMessage.audioUrl과 동일 패턴으로 오프닝
    // 대사도 합성한다. 실패해도 세션 생성 자체는 막지 않는다(P-4 비차단 원칙).
    let openingAudioUrl: string | undefined;
    try {
      const synthesis = await getVoiceProvider().synthesize({
        sessionId: sessionRef.id,
        voiceId,
        text: openingMessage.text,
      });
      openingAudioUrl = synthesis.audioUrl;
    } catch {
      // 합성 실패는 무시 — 클라는 openingAudioUrl 없으면 텍스트만 표시(폴백).
    }

    return {
      sessionId: sessionRef.id,
      openingMessage,
      maxUserTurns: MAX_USER_TURNS,
      maxSessionMs: MAX_SESSION_MS,
      isMock,
      ...(openingAudioUrl ? { openingAudioUrl } : {}),
    };
  },
);

export const endSession = onCall<EndSessionRequest, Promise<EndSessionResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { sessionId, endReason } = request.data ?? {};
    if (!sessionId || !endReason) {
      throw new HttpsError("invalid-argument", "sessionId와 endReason이 필요합니다.");
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

    // 멱등 처리(API.md endSession Errors 절: "이미 ended면 멱등 처리") — 이미 종료된 세션이면
    // status/endReason/endedAt을 재작성하지 않고 동일 응답만 반환한다. sendMessage의 한도 도달
    // 자동 종료 경로가 먼저 status=ended를 썼을 수도 있으므로(AC-007), 여기서 재작성하면
    // endReason이 덮어써지고 리포트 생성 트리거가 중복 호출될 위험이 있다(AC-007 "정확히 1개
    // 리포트" 불변식 보호).
    if (session.status === "ended") {
      return { status: "ended", reportPending: true };
    }

    await sessionRef.update({
      status: "ended",
      endReason,
      endedAt: Timestamp.now(),
    } satisfies Partial<SessionDoc>);

    // 이 write 자체가 Firestore 트리거 onSessionEnded(T10, 생성물 즉시 폐기)를 유발한다
    // (Architecture.md §5/§6.2) — 여기서 별도로 호출할 필요 없다(T10 소관, 이번 태스크가 신경 쓸
    // 부분 아님). 리포트 생성은 endSession이 직접 개시한다(Architecture.md §5 다이어그램의
    // "endSession → generateReport" 화살표). 실제 생성 로직은 아직 없지만(T9), 트리거 지점은 여기다
    // — 실패해도 세션 종료 응답 자체를 막지 않는다(triggerReportGeneration이 내부에서 에러를
    // 흡수한다, functions/src/report/index.ts 참고).
    await triggerReportGeneration(sessionId);

    return { status: "ended", reportPending: true };
  },
);
