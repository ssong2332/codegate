// §59.10 커밋 C — Live 도구 선언(순수 — Firestore·네트워크 접근 0). docs/Architecture.md §59.5·
// §59.6·§59.9(R1) · docs/API.md 부록 C `createRealtimeCall` 증분 · G384·G385·G386.
// §61(OQ-A73 User 확정) — `offer_verification_desk` 선언 자격이 계열 분류에서 분리됐다(G399~G402,
// `declaresOfferVerificationDesk` 참고). `VERIFY_SERIES_A_SCENARIOS`/`verifySeriesFor`는 값·시그니처
// 무변경으로 남는다 — 클라의 참가자 의사 게이트가 여전히 그 분류를 쓴다(§61.2).
//
// ⛔ 이 파일이 하지 않는 것: 클라의 `toolCall` 이름 → `deliverInCallSms`/`deliverVerifyOffer` 실제
// 라우팅(§59.6 ②~⑥). `docs/Architecture.md` §59.10 커밋 표는 그 라우팅을 이 커밋(C)의 항목으로
// 명시적으로 나열하지 않는다 — 커밋 A(`GeminiVoiceSession.tsx`)는 오늘 "credentials.liveTools 부재면
// 즉시 unsupported로 답한다"만 구현했고, "존재할 때" 분기(실제 dispatch)는 어느 커밋 표에도 명문으로
// 배정돼 있지 않다(§59.10 A 행 vs 커밋 D "toolCallFailed 배선" 사이의 공백). 이 패스는 그 실제
// dispatch를 **추측으로 채우지 않는다** — architect 재확인이 필요한 인계 사항이다(구현 보고서 참고).
import { Behavior, Type } from "@google/genai";
import type { FunctionDeclaration, Tool } from "@google/genai";
import type { DifficultyLevel } from "../shared/difficulty";
import type { MessengerChannel } from "../shared/types";
import { SMS_PURPOSES, sessionDeclaresInCallSms } from "../inCallSms/smsGate";
import { hasVerifyIntercept, VERIFY_DECLINE_ALREADY } from "../scenarios/verifyIntercept";
import { isNonLastRelayLeg, type HangupRelayContext } from "../scammerHangup/decide";
import { SCAMMER_HANGUP_FAILURE_INSTRUCTION } from "../scammerHangup/guidance";

/**
 * §59.5 T1 — 클라가 하드코딩하지 않도록 이름은 `createRealtimeCall` 응답으로도 내려간다(G385).
 * ⭐ T191(문자 도달 조건 · G538) — 인자 없음(G384)을 **의도적으로 바꿨다**: `purpose` enum 필수.
 */
export const LIVE_TOOL_SEND_PREPARED_SMS = "send_prepared_sms";
/**
 * §59.5 T2 — 인자 없음(G384). §61(OQ-A73 User 확정) — 확인 무력화 카탈로그 6종 전부 · advanced에
 * 선언된다. 계열 A/B 구분은 선언 조건이 아니다(`declaresOfferVerificationDesk` 참고).
 */
export const LIVE_TOOL_OFFER_VERIFICATION_DESK = "offer_verification_desk";
/**
 * T192 C3(Architecture.md §79.3 · §79.19 (5) 4 · 5) — 사기범의 먼저 끊기. BLOCKING이라 모델은 **결과를 받은 뒤에만**
 * 작별한다(신고 ⑪을 막는 것은 금지문이 아니라 순서 — §79 머리). 서버 판정은 `requestScammerHangup`.
 */
export const LIVE_TOOL_END_CALL = "end_call";

/**
 * §61.1(OQ-A73 정정본) — 확인 무력화 카탈로그(`VERIFY_INTERCEPT`) 6종 중 **이 훈련을 위해 저작된
 * 전용 시나리오(T95)** 1종만 "계열 A"다. 나머지 5종("다른 수법의 시나리오에 이 흐름을 얹은 것")은
 * "계열 B"다. ⛔ **이 분류는 더 이상 `offer_verification_desk` 도구 선언 자격을 정하지 않는다** —
 * 선언 자격은 `declaresOfferVerificationDesk()`(계열과 무관)가 유일한 원천이다(G400). 이 함수와
 * `VERIFY_SERIES_A_SCENARIOS`는 **클라의 참가자 의사 게이트**(`src/lib/verifyintercept/
 * verifyIntercept.ts`의 동명 함수, 계열 A만 앱 주도 오퍼를 허용)를 위해 그대로 남는다 — ⛔ **계열
 * B를 이 Set에 추가하지 말 것(G399)**: 그러면 클라·서버 두 동명 함수가 계열 B에 대해 같은 답을
 * 내게 되고, §49 V5(사용자 확정)로 제거된 앱 주도 오퍼가 계열 B에서 부활한다.
 */
const VERIFY_SERIES_A_SCENARIOS: ReadonlySet<string> = new Set(["bank-security-verify-scam"]);

export type VerifyOfferSeries = "A" | "B";

/**
 * 이 시나리오가 확인 무력화 카탈로그를 갖는다면 계열 A/B 중 무엇인지. 카탈로그가 없으면 `undefined`.
 * ⛔ §61 이후 이 함수는 **도구 선언 게이트가 아니다** — 클라의 참가자 의사 게이트 판별용으로만
 * 남는다(G399). 도구 선언 자격은 아래 `declaresOfferVerificationDesk()`를 쓴다.
 */
export function verifySeriesFor(scenarioId: string): VerifyOfferSeries | undefined {
  if (!hasVerifyIntercept(scenarioId)) return undefined;
  return VERIFY_SERIES_A_SCENARIOS.has(scenarioId) ? "A" : "B";
}

/**
 * §61(OQ-A73 User 확정) — `offer_verification_desk` **선언 자격**. ⛔ **이 술어가 유일한 원천이다
 * (G400)**: 도구 선언(`buildLiveToolDeclarations`) · 이름 하향(`buildLiveToolNames`) ·
 * 프롬프트 문면(`geminiProvider` → `promptAssembly.offerToolDeclared`) 세 자리가 **전부 이 함수를
 * 부른다**. 조건식을 복사하면 §59 reviewer Critical #2(문면-선언 불일치)가 그대로 재발한다.
 * ⛔ **계열(A/B)은 더 이상 이 판정에 들어오지 않는다** — 계열은 `verifySeriesFor`가 계속 소유하되
 * 그것이 게이팅하는 것은 **클라의 참가자 의사 조건**뿐이다(§61.2 · G399).
 */
export function declaresOfferVerificationDesk(
  scenarioId: string,
  difficultyLevel?: DifficultyLevel,
): boolean {
  return hasVerifyIntercept(scenarioId) && difficultyLevel === "advanced";
}

/**
 * ⛔ T192 PR A 리뷰 M1 — 실시간 `end_call` **런타임 스위치**(코드 상수 · 선례 `RELAY_RUNTIME_AVAILABLE = false`).
 * ⭐ T192 C5(PR B) — 클라 `end_call` 라우팅(`GeminiVoiceSession` `dispatchToolCall` · `resolveToolCallKind` · 공통 종료 함수
 * `endCall`)이 들어와 **켰다**. 선언 · 이름 · TOOL 문면 세 자리가 다시 `declaresEndCall` 판정대로 실린다.
 * ⚠️ 끄면(= `false`) 세 자리가 함께 꺼진다(실시간 setup · 프롬프트 = C3 전). 운영값 트립와이어 3건이 이 값을 고정한다
 * (`toolDeclarationUnchanged.test.ts` · `geminiProvider.test.ts` [운영값]). ⚠️ 배포 순서 = Hosting(클라) → Functions(§79.13).
 * ⛔ 환경 변수 · defineBoolean 아님(배포 설정으로 켜지지 않게). ⛔ 폴백 SIGNAL(`sendMessage`)은 이 값과 무관하다.
 * ⛔ P-H(G603) 통과 전 운영 off — 2026-10-19 재실측 H1 위반 1 · 통과 뒤 true로 되돌리는 PR
 * ⭐ §104.8(2026-10-22 · DECISIONS #219) — 사용자 결정 *"이제 다시 ai가 전화를 먼저 끊는 것을 시도해야겠어 … 할 게 없어도 전화를 안 끊는
 *    모습이 보여"* · 편집 승인(사용자 직접)으로 **켰다**(G603 미충족 상태 — 남은 위험과 막는 층은 Architecture §104.8.1). 작별 인사 없이 짧은 마무리만.
 */
export const END_CALL_LIVE_AVAILABLE = true;

/**
 * T192 C3(§79.3 · §79.18 (1) · G502 · G527) — `end_call` **선언 자격**. ⛔ 이 술어가 유일한 원천이다: 도구 선언
 * (`buildLiveToolDeclarations`) · 이름 하향(`buildLiveToolNames`) · 프롬프트 TOOL 변형(`geminiProvider` →
 * `promptAssembly.hangupMode`) 세 자리가 **전부 이 함수를 부른다**(G400 선례).
 * - 메신저 단계 → `false`(통화형만 — AC-103 머리 · 판정표 2행과 같은 조건).
 * - 릴레이 중간 leg → `false`(마지막 화자만 끊는다 — DECISIONS #146 · 판정표 2-b와 **같은 함수**로 이중 방어).
 * - ElevenLabs는 이 경로(Gemini 프로바이더)를 타지 않아 자동 제외된다(§79.3).
 * ⛔ 문자 · 확인 도구 술어와 **독립**이다(§79.19 (5) 1 — 서로를 조건으로 쓰면 "문자 없는 세션 = 끊기 0"이 조용히 생긴다).
 * `scenarioId`는 정본 시그니처(§79.3 · G527)에 있으나 오늘 판정에 쓰지 않는다(전 시나리오 동일) — 자리만 둔다.
 */
export function declaresEndCall(
  _scenarioId: string,
  channel: MessengerChannel | undefined,
  relay: HangupRelayContext | undefined,
  // M1 — 런타임 스위치(운영값 = `END_CALL_LIVE_AVAILABLE`). 판정 로직 테스트는 `true`로 돈다.
  liveAvailable: boolean,
): boolean {
  if (!liveAvailable) return false;
  if (channel === "messenger") return false;
  return !isNonLastRelayLeg(relay);
}

/** 선언 빌더의 `end_call` 범위 — ⭐ 필수 인자(빠뜨리면 컴파일 오류 · "말없이 미선언" 방지 — §79.19 (5) 2). */
export type EndCallScope = {
  channel: MessengerChannel | undefined;
  /** `resolveHangupRelay(session)`의 값만(G527 — 이 인자를 만드는 곳은 그 함수 하나). 오늘 항상 `undefined`. */
  relay: HangupRelayContext | undefined;
  /** M1 — 운영 호출부(`geminiProvider`)는 `END_CALL_LIVE_AVAILABLE`을 넘긴다. 필수 키(빠뜨리면 컴파일 오류). */
  liveAvailable: boolean;
};

/** §59.5 — `offer_verification_desk`는 인자 없음(G384 — R1 ④가 기계로 단언한다). */
const NO_ARGS_PARAMETERS = { type: Type.OBJECT, properties: {} };

/**
 * ⭐ T191(문자 도달 조건 · PRD AC-099 (b) · G538) — `send_prepared_sms`의 유일한 인자 `purpose`(enum 필수).
 * 모델이 대화 단계를 보고 무엇을 보낼지 고르고, 서버가 세션 흐름 변형의 선언 · 간격으로 재검증한다
 * (`inCallSms/smsGate.ts` — 선언 밖 목적은 `not_allowed`). enum 값은 서버 상수 `SMS_PURPOSES`가 원천이다.
 */
const SEND_PREPARED_SMS_PARAMETERS = {
  type: Type.OBJECT,
  properties: {
    purpose: {
      type: Type.STRING,
      format: "enum",
      enum: [...SMS_PURPOSES],
      description:
        "보낼 안내 문자의 목적. identity = 본인확인용 인증번호 문자, transfer = 이체할 계좌 안내 문자, link = 눌러서 진행하는 링크 문자.",
    },
  },
  required: ["purpose"],
};

/**
 * ⭐ §71.4 D2(G430 · ADR-0017) — 두 도구 모두 **동기(BLOCKING)를 명시한다.** `gemini-3.8-live`는 기본값이
 * `NON_BLOCKING`이라, 생략하면 모델이 도구를 부르는 순간 턴을 끝내 버린다(2026-10-17 프로브: `toolCall`과 같은
 * 시각 `generationComplete` + `turnComplete`). 그러면 클라가 그 `turnComplete`를 사기범 턴 경계로 한 번 더 세고,
 * §59의 "결과(`guidance`)를 받은 뒤 이어 말한다"가 성립하지 않는다. 2.5는 기본이 BLOCKING이었고 명시도 받는다.
 * ⛔ `NON_BLOCKING`으로 바꾸려면 §59 응답 문면 계약부터 다시 설계한다(§71.0 #4).
 */
const TOOL_BEHAVIOR = Behavior.BLOCKING;

/**
 * ⭐ §117(DECISIONS #232) — "어떤 말보다도 먼저 부르고 · 결과 전에는 말하지 않는다" 1문장(`end_call` 설명과 같은 형태). 운영 세션 f7047187에서
 * 모델이 "문자로 보내 드린 인증번호"를 먼저 말하고 도구를 불러, 결과 안내를 받은 뒤 같은 요구를 한 번 더 말했다(도구 호출 3회 중 3회).
 * 상수로 둔 이유: 도구 선언 바이트 고정 테스트(`smsGate.test.ts` T194-c-1)가 이 문장만 되돌려 이전 값과 대조한다.
 */
export const SEND_PREPARED_SMS_CALL_FIRST_SENTENCE =
  "문자 이야기를 꺼낼 응답에서는 어떤 말보다도 먼저 부르고, 결과를 받기 전에는 문자를 보냈다는 말도 문자 속 번호 · 링크 이야기도 하지 않는다.";

const SEND_PREPARED_SMS_DECLARATION: FunctionDeclaration = {
  name: LIVE_TOOL_SEND_PREPARED_SMS,
  description:
    `지금 이 순간 상대의 휴대전화로 미리 준비된 안내 문자 한 통을 실제로 보낸다. 대화가 본인확인 · 이체 · 링크 진행 중 어느 단계에 이르렀는지 보고 purpose로 하나를 고른다. 문자 내용은 시스템이 정한다. ${SEND_PREPARED_SMS_CALL_FIRST_SENTENCE} 이 통화에서 쓸 수 없는 목적이거나 아직 이르면 거절될 수 있고, 그때는 문자를 보냈다고 말하지 말고 그냥 대화를 이어가면 된다.`,
  parameters: SEND_PREPARED_SMS_PARAMETERS,
  behavior: TOOL_BEHAVIOR,
};

const OFFER_VERIFICATION_DESK_DECLARATION: FunctionDeclaration = {
  name: LIVE_TOOL_OFFER_VERIFICATION_DESK,
  description:
    "상대가 직접 확인해 보고 싶어 한다고 판단될 때 부른다. 확인 부서로 호를 넘겨 주겠다는 안내를 시작할 수 있게 된다. 아직 이를 때는 거절될 수 있고, 그때는 그냥 대화를 이어가면 된다.",
  parameters: NO_ARGS_PARAMETERS,
  behavior: TOOL_BEHAVIOR,
};

/**
 * T192 C3(§79.19 (5) 4 · 5) — `reason` enum 필수(S5b `purpose` 선례). 서버는 누락 · 오기입도 `unspecified`로 받는다
 * (`normalizeScammerHangupKind` — 거절 0). 설명 문면은 서버 소유 · ⛔ 숫자 · 횟수 0(G130).
 * T192 C6-F2(§79.21 (10) ② · G621) — 문장1 범위를 "그 응답의 모든 말"로 · 도구 결과 전 알림 · 종료 · 작별 금지 1문장 신설
 * (TOOL 꼬리와 같은 1회분 · reason · 거절 문장 바이트 동일).
 */
const END_CALL_DECLARATION: FunctionDeclaration = {
  name: LIVE_TOOL_END_CALL,
  description:
    "네 쪽에서 통화를 먼저 끝내기로 했으면, 그 응답에서는 어떤 말보다도 먼저 부른다. 그 응답에서 도구 결과를 받기 전에는 확인 결과를 알리는 말도, 끝내겠다는 말도, 작별 인사도 하지 않는다. reason은 goal(원하던 것을 얻었다) 또는 give_up(상대가 거절이나 의심을 되풀이해 더 진행할 수 없다) 중 하나다. 결과가 허락하지 않으면 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어간다.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: {
        type: Type.STRING,
        format: "enum",
        enum: ["goal", "give_up"],
      },
    },
    required: ["reason"],
  },
  behavior: TOOL_BEHAVIOR,
};

/**
 * §59.5 선언 조건(정본 표). T192 C3 — `end_call`은 기존 두 선언 **뒤에** 붙는다(§79.19 (5) 3). `end_call`이 거짓이면
 * (메신저 · 중간 leg) 배열은 S5b 판정 그대로(바이트 동일 — G556). ⚠️ 옛 주석 *"둘 다 걸리지 않으면 [] — 토큰 요청
 * 바이트가 오늘과 동일 · G388이 기대는 유일한 레버"* 는 C3부터 **거짓**이다: 문자 · 확인 도구가 없는 Gemini 통화 세션에도
 * `end_call`이 선언된다(§79.3 ⚠️). G388(백스톱 지연 창)은 도구별 키(`sendPreparedSms` · `offerVerificationDesk`)라 무영향.
 */
export function buildLiveToolDeclarations(
  scenarioId: string,
  difficultyLevel: DifficultyLevel | undefined,
  // ⭐ 리뷰 M2 — 세션 흐름 변형. 문자 선언 0 변형은 `send_prepared_sms`를 선언하지 않는다(부재 = 종전 판정).
  flowVariantId: string | undefined,
  endCallScope: EndCallScope,
): Tool[] {
  const declarations: FunctionDeclaration[] = [];
  if (sessionDeclaresInCallSms(scenarioId, flowVariantId)) declarations.push(SEND_PREPARED_SMS_DECLARATION);
  if (declaresOfferVerificationDesk(scenarioId, difficultyLevel)) {
    declarations.push(OFFER_VERIFICATION_DESK_DECLARATION);
  }
  if (declaresEndCall(scenarioId, endCallScope.channel, endCallScope.relay, endCallScope.liveAvailable)) {
    declarations.push(END_CALL_DECLARATION);
  }
  if (declarations.length === 0) return [];
  return [{ functionDeclarations: declarations }];
}

/** §59.6 — 콜러블이 아예 닿지 못했을 때 모델에게 돌려줄 서버 소유 한국어 1줄(G386). */
export const LIVE_TOOL_FAILURE_INSTRUCTION =
  "(지금은 문자를 보낼 수 없다. 문자를 보냈다고 말하지 말고 하던 이야기를 그대로 이어가라.)";

export type LiveToolNames = {
  sendPreparedSms?: string;
  offerVerificationDesk?: string;
  /**
   * §59.6 갱신 2(G394) — `offer_verification_desk` 클레임 실패(백스톱 경로가 같은 announce를
   * 요청 중) 조기 응답 전용. 서버를 부르지 않으므로 이 값을 그대로 `guidance`로 실어 돌려준다.
   * 값은 `VERIFY_DECLINE_ALREADY`의 사본이다 — 새 문면 저작 0건(리터럴 복사 금지, import 재사용).
   */
  verifyAlreadyAnnouncedInstruction?: string;
  /**
   * T192 C3(§79.5 · §79.19 (5) 6) — `end_call`과 `endCallFailureInstruction`은 **쌍**이다(둘 다 있거나 둘 다 없다).
   * 실패 문면은 콜러블이 아예 닿지 않을 때 모델에게 돌려줄 서버 소유 1줄(`SCAMMER_HANGUP_FAILURE_INSTRUCTION`).
   */
  endCall?: typeof LIVE_TOOL_END_CALL;
  endCallFailureInstruction?: string;
  /**
   * 문자 전용 실패 문면 — **필수 그대로**(클라 타입이 필수라서). `end_call`만 선언된 세션에서도 실리지만 무해하다:
   * 그 문면을 쓰는 분기(문자 도구)가 그 세션에 없다(§79.19 (5) 6).
   */
  failureInstruction: string;
};

/**
 * `createRealtimeCall` 응답 `liveTools` 필드(§59.6 ②·G385, `docs/API.md` 부록 C). 도구가 하나도
 * 선언되지 않으면 `undefined`(필드 자체가 응답에 없다 — 부착 조건은 `buildLiveToolDeclarations`와
 * **같은 판정**이어야 한다, 안 그러면 클라가 존재하지 않는 도구 이름을 credentials로 받는다).
 * ⚠️ T192 C3 — 세 술어(문자 · 확인 · 끊기) 중 **하나라도** 참이면 부착된다 ⇒ 문자 · 확인 도구가 없는 Gemini 통화
 * 세션에도 이제 `liveTools`가 붙는다(`endCall` 쌍 + 필수 `failureInstruction`).
 */
export function buildLiveToolNames(
  scenarioId: string,
  difficultyLevel: DifficultyLevel | undefined,
  flowVariantId: string | undefined,
  endCallScope: EndCallScope,
): LiveToolNames | undefined {
  const smsDeclared = sessionDeclaresInCallSms(scenarioId, flowVariantId);
  const offerDeclared = declaresOfferVerificationDesk(scenarioId, difficultyLevel);
  const endCallDeclared = declaresEndCall(
    scenarioId,
    endCallScope.channel,
    endCallScope.relay,
    endCallScope.liveAvailable,
  );
  if (!smsDeclared && !offerDeclared && !endCallDeclared) return undefined;
  return {
    ...(smsDeclared ? { sendPreparedSms: LIVE_TOOL_SEND_PREPARED_SMS } : {}),
    ...(offerDeclared
      ? {
          offerVerificationDesk: LIVE_TOOL_OFFER_VERIFICATION_DESK,
          verifyAlreadyAnnouncedInstruction: VERIFY_DECLINE_ALREADY,
        }
      : {}),
    ...(endCallDeclared
      ? { endCall: LIVE_TOOL_END_CALL, endCallFailureInstruction: SCAMMER_HANGUP_FAILURE_INSTRUCTION }
      : {}),
    failureInstruction: LIVE_TOOL_FAILURE_INSTRUCTION,
  };
}
