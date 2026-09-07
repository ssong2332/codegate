// §59.10 커밋 C — Live 도구 선언(순수 — Firestore·네트워크 접근 0). docs/Architecture.md §59.5·
// §59.6·§59.9(R1) · docs/API.md 부록 C `createRealtimeCall` 증분 · G384·G385·G386·G392.
//
// ⛔ 이 파일이 하지 않는 것: 클라의 `toolCall` 이름 → `deliverInCallSms`/`deliverVerifyOffer` 실제
// 라우팅(§59.6 ②~⑥). `docs/Architecture.md` §59.10 커밋 표는 그 라우팅을 이 커밋(C)의 항목으로
// 명시적으로 나열하지 않는다 — 커밋 A(`GeminiVoiceSession.tsx`)는 오늘 "credentials.liveTools 부재면
// 즉시 unsupported로 답한다"만 구현했고, "존재할 때" 분기(실제 dispatch)는 어느 커밋 표에도 명문으로
// 배정돼 있지 않다(§59.10 A 행 vs 커밋 D "toolCallFailed 배선" 사이의 공백). 이 패스는 그 실제
// dispatch를 **추측으로 채우지 않는다** — architect 재확인이 필요한 인계 사항이다(구현 보고서 참고).
import { Type } from "@google/genai";
import type { FunctionDeclaration, Tool } from "@google/genai";
import type { DifficultyLevel } from "../shared/difficulty";
import { hasInCallSms } from "../scenarios/inCallSms";
import { hasVerifyIntercept, VERIFY_DECLINE_ALREADY } from "../scenarios/verifyIntercept";

/** §59.5 T1 — 인자 없음(G384). 클라가 하드코딩하지 않도록 이름은 `createRealtimeCall` 응답으로도 내려간다(G385). */
export const LIVE_TOOL_SEND_PREPARED_SMS = "send_prepared_sms";
/** §59.5 T2 — 인자 없음(G384). 계열 A(오늘은 `bank-security-verify-scam` 1종)에만 선언된다(G392). */
export const LIVE_TOOL_OFFER_VERIFICATION_DESK = "offer_verification_desk";

/**
 * §59.5 G392/OQ-A73 — 확인 무력화 카탈로그(`VERIFY_INTERCEPT`) 6종 중 **이 훈련을 위해 저작된
 * 전용 시나리오(T95)** 1종만 "계열 A"다. 나머지 5종("다른 수법의 시나리오에 이 흐름을 얹은 것")은
 * "계열 B"이며, `offer_verification_desk` 도구는 계열 B에 선언하지 않는다 — 사용자가 두 번 축소를
 * 요구한 컨트롤이라(§47 신고 ③-b·§49 신고 7) 계열 B 확장은 User 확정(OQ-A73) 전까지 보류한다.
 */
const VERIFY_SERIES_A_SCENARIOS: ReadonlySet<string> = new Set(["bank-security-verify-scam"]);

export type VerifyOfferSeries = "A" | "B";

/** 이 시나리오가 확인 무력화 카탈로그를 갖는다면 계열 A/B 중 무엇인지. 카탈로그가 없으면 `undefined`. */
export function verifySeriesFor(scenarioId: string): VerifyOfferSeries | undefined {
  if (!hasVerifyIntercept(scenarioId)) return undefined;
  return VERIFY_SERIES_A_SCENARIOS.has(scenarioId) ? "A" : "B";
}

/** §59.5 — 두 도구 모두 인자 없음(G384). `parameters.properties`가 빈 객체임을 R1 ④가 기계로 단언한다. */
const NO_ARGS_PARAMETERS = { type: Type.OBJECT, properties: {} };

const SEND_PREPARED_SMS_DECLARATION: FunctionDeclaration = {
  name: LIVE_TOOL_SEND_PREPARED_SMS,
  description:
    "지금 이 순간 상대의 휴대전화로 미리 준비된 안내 문자 한 통을 실제로 보낸다. 계좌 안내·링크·인증번호 중 무엇이 나갈지는 시스템이 정하며 너는 고르지 않는다. 지금이 문자를 보낼 적절한 때라고 판단될 때 부른다. 아직 이를 때는 거절될 수 있고, 그때는 그냥 대화를 이어가면 된다.",
  parameters: NO_ARGS_PARAMETERS,
};

const OFFER_VERIFICATION_DESK_DECLARATION: FunctionDeclaration = {
  name: LIVE_TOOL_OFFER_VERIFICATION_DESK,
  description:
    "상대가 직접 확인해 보고 싶어 한다고 판단될 때 부른다. 확인 부서로 호를 넘겨 주겠다는 안내를 시작할 수 있게 된다. 아직 이를 때는 거절될 수 있고, 그때는 그냥 대화를 이어가면 된다.",
  parameters: NO_ARGS_PARAMETERS,
};

/**
 * §59.5 선언 조건(정본 표) — 둘 다 걸리지 않으면 `[]`를 그대로 반환한다 ⇒ 그 세션의 토큰 요청
 * 바이트가 오늘과 동일하다(회귀 0, G388이 이 사실에 기대는 유일한 레버).
 */
export function buildLiveToolDeclarations(
  scenarioId: string,
  difficultyLevel?: DifficultyLevel,
): Tool[] {
  const declarations: FunctionDeclaration[] = [];
  if (hasInCallSms(scenarioId)) declarations.push(SEND_PREPARED_SMS_DECLARATION);
  if (
    hasVerifyIntercept(scenarioId) &&
    difficultyLevel === "advanced" &&
    verifySeriesFor(scenarioId) === "A"
  ) {
    declarations.push(OFFER_VERIFICATION_DESK_DECLARATION);
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
  failureInstruction: string;
};

/**
 * `createRealtimeCall` 응답 `liveTools` 필드(§59.6 ②·G385, `docs/API.md` 부록 C). 도구가 하나도
 * 선언되지 않으면 `undefined`(필드 자체가 응답에 없다 — 부착 조건은 `buildLiveToolDeclarations`와
 * **같은 판정**이어야 한다, 안 그러면 클라가 존재하지 않는 도구 이름을 credentials로 받는다).
 */
export function buildLiveToolNames(
  scenarioId: string,
  difficultyLevel?: DifficultyLevel,
): LiveToolNames | undefined {
  const smsDeclared = hasInCallSms(scenarioId);
  const offerDeclared =
    hasVerifyIntercept(scenarioId) &&
    difficultyLevel === "advanced" &&
    verifySeriesFor(scenarioId) === "A";
  if (!smsDeclared && !offerDeclared) return undefined;
  return {
    ...(smsDeclared ? { sendPreparedSms: LIVE_TOOL_SEND_PREPARED_SMS } : {}),
    ...(offerDeclared
      ? {
          offerVerificationDesk: LIVE_TOOL_OFFER_VERIFICATION_DESK,
          verifyAlreadyAnnouncedInstruction: VERIFY_DECLINE_ALREADY,
        }
      : {}),
    failureInstruction: LIVE_TOOL_FAILURE_INSTRUCTION,
  };
}
