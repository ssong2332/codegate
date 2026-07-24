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
import { PUBLIC_SCENARIOS } from "../scenarios/publicMeta";
import {
  MAX_SESSION_MS,
  MAX_USER_TURNS,
  MESSENGER_ESCALATION_MAX_USER_TURNS,
} from "../shared/constants";
import { FALLBACK_VOICE_FEMALE_ID, FALLBACK_VOICE_MALE_ID } from "../shared/config";
import { getVoiceProvider } from "../voice/provider";
import { transitionChannel } from "./channelTransition";
import type { MessageDoc, SessionDoc } from "../shared/types";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  EndSessionRequest,
  EndSessionResponse,
  RequestEscalationRequest,
  RequestEscalationResponse,
  RequestReverseEscalationRequest,
  RequestReverseEscalationResponse,
  UpdateMessengerSkinRequest,
  UpdateMessengerSkinResponse,
} from "./types";

ensureFirebaseAdminApp();

/** defineString은 바인딩되지 않은 컨텍스트(단위 테스트 등)에서 throw할 수 있으므로 안전하게
 * 감싼다(functions/src/realtime/provider.ts의 readSecret과 동일한 패턴). placeholder(.env.example의
 * "YOUR_" 접두) 값도 "미설정"으로 본다. */
function readOptionalConfigString(param: { value: () => string }): string {
  try {
    const value = param.value();
    return !value || value.startsWith("YOUR_") ? "" : value;
  } catch {
    return "";
  }
}

export const createSession = onCall<CreateSessionRequest, Promise<CreateSessionResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const {
      scenarioId,
      voiceId,
      sessionId,
      channel,
      surface,
      messengerSkin,
      skinSource,
      voiceSelectionSource,
    } = request.data ?? {};
    if (!scenarioId || !voiceId) {
      throw new HttpsError("invalid-argument", "scenarioId와 voiceId가 필요합니다.");
    }
    if (!SCENARIO_PROMPTS[scenarioId]) {
      throw new HttpsError("invalid-argument", `존재하지 않는 scenarioId입니다: ${scenarioId}`);
    }

    // 교차채널 세션 총 한도(T30, Architecture.md §13.3, PoC 전 가정치) — 에스컬레이션 가능
    // 시나리오(scenario.escalation 존재)는 두 채널을 합쳐도 기존 10턴 안에 다 담기 어려워
    // maxUserTurns를 상향 발급한다.
    const isEscalationCapable = Boolean(PUBLIC_SCENARIOS[scenarioId]?.escalation);

    // UX-025(§13.6) "남/여 기본 보이스" 폴백 — 클라는 실제 ElevenLabs voiceId를 모르므로(서버
    // 전용 설정), voiceSelectionSource로 요청하면 서버가 FALLBACK_VOICE_MALE_ID/FEMALE_ID로
    // 재해석한다. 미설정(placeholder)이면 클라가 보낸 값을 그대로 쓴다(조용한 실패 없음 — 다만
    // 실 ElevenLabs 통화에서는 유효하지 않은 voiceId라 Mock/일반 강등으로 이어질 수 있다).
    let resolvedVoiceId = voiceId;
    if (voiceSelectionSource === "fallback_male") {
      const configured = readOptionalConfigString(FALLBACK_VOICE_MALE_ID);
      if (configured) resolvedVoiceId = configured;
    } else if (voiceSelectionSource === "fallback_female") {
      const configured = readOptionalConfigString(FALLBACK_VOICE_FEMALE_ID);
      if (configured) resolvedVoiceId = configured;
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
      voiceId: resolvedVoiceId,
      cloneStatus: "ready",
      identitySelfConfirmed: true,
      turnCount: 0,
      maxUserTurns: isEscalationCapable ? MESSENGER_ESCALATION_MAX_USER_TURNS : MAX_USER_TURNS,
      maxSessionMs: MAX_SESSION_MS,
      createdAt: now,
      // T30 추가(§13.1) — 세션이 처음 시작된 채널. 생성 시 1회만 기록(이후 전이와 무관하게 불변).
      entryChannel: channel ?? "voice",
      // Firestore admin SDK는 필드값 undefined를 기본적으로 거부하므로(ignoreUndefinedProperties
      // 미설정), Mock이 아닐 때는 llmProvider 필드 자체를 생략한다.
      ...(isMock ? { llmProvider: "mock" as const } : {}),
      // 메신저피싱 확장(T29) — UX-024가 넘긴 경우에만 채운다. 부재 시 기존과 동일하게 voice
      // 세션으로 생성된다(Migration Policy, Architecture.md §13.1/13.4).
      ...(channel ? { channel } : {}),
      ...(surface ? { surface } : {}),
      ...(messengerSkin ? { messengerSkin } : {}),
      ...(skinSource ? { skinSource } : {}),
      // UX-025(§13.6) — 에스컬레이션 가능 메신저 시나리오에서만 채워진다.
      ...(voiceSelectionSource ? { voiceSelectionSource } : {}),
    };
    // merge:true — sessionId를 채택한 경우 pending 문서(createVoiceClone이 만든 voiceProvider 등
    // 부가 필드)를 지우지 않고 scenarioId/status 등을 덧씌운다. 새 문서인 경우는 기존과 동일.
    await sessionRef.set(sessionDoc, { merge: true });

    await sessionRef.collection("messages").add({
      role: "scammer",
      textMasked: openingMessage.text,
      turnIndex: 0,
      createdAt: now,
      // T30 추가(§13.1) — 교차채널 타임라인(AC-037)용 채널 표기. 보이스 전용 세션은 기존과 동일하게
      // 필드 부재.
      ...(channel ? { channel } : {}),
    } satisfies MessageDoc);

    // 실시간 음성 통화 전환(2026-07-22 사용자 결정) — sendMessage.audioUrl과 동일 패턴으로 오프닝
    // 대사도 합성한다. 실패해도 세션 생성 자체는 막지 않는다(P-4 비차단 원칙).
    // T29 reviewer Major #2: channel="messenger"는 UI가 audioUrl을 아예 재생하지 않으므로(채팅은
    // 텍스트 전용, 에스컬레이션 전까지 TTS 불필요) 합성 자체를 건너뛴다 — Mock에서는 무해하지만
    // 실 ElevenLabs 연동 후 턴마다 불필요한 비용·지연·Storage 산출물(AC-021 폐기 대상)이 쌓이는
    // 것을 막는다.
    let openingAudioUrl: string | undefined;
    if (channel !== "messenger") {
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
    }

    return {
      sessionId: sessionRef.id,
      openingMessage,
      // T30 버그 수정(에뮬레이터 검증 중 발견): sessionDoc.maxUserTurns는 이미 에스컬레이션 여부에
      // 따라 분기했는데 이 응답 값은 MAX_USER_TURNS를 그대로 하드코딩해 응답과 저장값이 어긋나 있었다.
      maxUserTurns: sessionDoc.maxUserTurns,
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

// 메신저 채팅(UX-022) 스킨 감지/수동 전환 결과 지속(T29, P-16, AC-031). endSession과 동일한
// 패턴(인증·존재확인·소유 uid 검증)을 쓴다 — firestore.rules가 sessions/{sessionId} 클라 write를
// 전부 거부하므로(#3 보안 하드닝) 콜러블 없이는 클라가 스킨 선택을 지속시킬 방법이 없다.
export const updateMessengerSkin = onCall<
  UpdateMessengerSkinRequest,
  Promise<UpdateMessengerSkinResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, messengerSkin, skinSource } = request.data ?? {};
  if (!sessionId || !messengerSkin || !skinSource) {
    throw new HttpsError("invalid-argument", "sessionId·messengerSkin·skinSource가 필요합니다.");
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

  await sessionRef.update({ messengerSkin, skinSource } satisfies Partial<SessionDoc>);
  return { messengerSkin, skinSource };
});

// 명시 전환 버튼("전화로 확인", T30, UX-022·§13.3/AC-034) — 사용자가 1턴부터 언제든 수동으로
// 메신저→보이스 전이를 요청한다. endSession/updateMessengerSkin과 동일한 인증·존재확인·소유uid·
// 상태 검증 패턴을 쓴다. 에스컬레이션이 불가능한 시나리오·이미 voice로 전이된 세션에 대한 요청은
// 조용히 무시하지 않고 명시적으로 거부한다(AC-039 "조용한 실패 금지").
export const requestEscalation = onCall<
  RequestEscalationRequest,
  Promise<RequestEscalationResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId } = request.data ?? {};
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
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
  if (session.channel !== "messenger") {
    throw new HttpsError("failed-precondition", "메신저 채널 세션에서만 요청할 수 있습니다.");
  }
  if (!PUBLIC_SCENARIOS[session.scenarioId]?.escalation) {
    throw new HttpsError("failed-precondition", "이 시나리오는 통화 전이를 지원하지 않습니다.");
  }

  await transitionChannel(sessionId, "messenger", "voice", "manual_button");
  return { escalation: { toChannel: "voice" } };
});

// 역방향 명시 전환 버튼("메시지로 전환", T40 fast-follow, UX-014 통화 화면·§13.1/13.0/AC-039) —
// 통화 중인 사용자가 언제든 수동으로 보이스→메신저 전이를 요청한다. requestEscalation과 동일한
// 인증·존재확인·소유uid·상태 검증 패턴을 쓰되 방향과 채널 사전조건이 반대다.
//
// **스코프 축소(T40 판단, docs/Tasks.md T40 행에 상세 근거)**: 정방향(structured_signal/
// maxturn_fallback, T25/T26/T30)과 달리 역방향에는 그 트리거에 대응하는 UX/Architecture 설계
// 문서가 없다(무엇을 신호로 볼지 정의된 바 없음) — 이 태스크는 명시 버튼(manual_button)만 배선한다.
//
// **시나리오 게이팅(판단 근거)**: transitionChannel 자체는 channel 필드만 뒤집을 뿐 시나리오별
// 메신저 콘텐츠 존재를 요구하지 않는다. 하지만 클라 `/session/messenger`
// (src/app/session/messenger/page.tsx)는 `scenarios[scenarioId].channel !== "messenger"`면
// "시나리오 정보를 찾을 수 없습니다"로 막아 렌더링하지 않는다(순수 보이스 시나리오는 애초에
// `channel:"messenger"` 메타가 없다 — functions/src/scenarios/publicMeta.ts 확인). 서버가 채널
// 플래그만 뒤집고 실제로는 아무 데도 못 가는 상태를 만드는 대신, 메신저 콘텐츠가 존재하는
// 시나리오(현재는 메신저→보이스로 정방향 에스컬레이션된 세션뿐)에서만 명시적으로 허용한다
// (AC-039 "조용한 실패 금지" — 여기서는 "성공한 척하고 화면만 막힘"을 피하는 형태로 적용).
export const requestReverseEscalation = onCall<
  RequestReverseEscalationRequest,
  Promise<RequestReverseEscalationResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId } = request.data ?? {};
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
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
  // 부재 시 "voice"로 간주(Migration Policy, shared/types.ts SessionDoc.channel 주석과 동일 기준).
  if ((session.channel ?? "voice") !== "voice") {
    throw new HttpsError("failed-precondition", "보이스 채널 세션에서만 요청할 수 있습니다.");
  }
  if (PUBLIC_SCENARIOS[session.scenarioId]?.channel !== "messenger") {
    throw new HttpsError("failed-precondition", "이 시나리오는 메시지 전환을 지원하지 않습니다.");
  }

  // reviewer 리뷰 Major #2 수정 — 이 시점의 누적 turnCount를 기준점으로 함께 기록해, sendMessage의
  // max-turn 폴백이 "메신저 재진입 이후 턴 수"만 보게 한다(channelTransition.ts 헤더 주석 참고).
  await transitionChannel(sessionId, "voice", "messenger", "manual_button", session.turnCount);
  return { escalation: { toChannel: "messenger" } };
});
