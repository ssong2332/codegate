// 시나리오별 화자 성별 배정표 — 서버 전용, 순수 상수 + 순수 함수 (Architecture.md §50.3.3, 사용자
// 라이브 신고 ① 음성 성별 불일치의 **층 1** 대응 — 층 2(화자의 이름·성별 느낌)는
// `roleplay/promptAssembly.ts`의 [화자] 블록이 맡는다. 두 층을 함께 고쳐야 신고가 닫힌다).
//
// ⚠️ 이 표는 처방(prescription)이지 서술(description)이 아니다(`roleplay/l3Depth.ts:13-15` 관례
// 계승) — "이 시나리오의 화자가 이 성별이다"가 아니라 "이 시나리오의 화자에 이 성별을 배정한다"는
// 설계 결정이다. 값 자체는 사용자가 뒤집을 수 있고, 뒤집어도 표의 구조는 바뀌지 않는다.
//
// ⚠️ 클라 번들·Firestore 공개 메타에 이 표를 노출하지 않는다(ADR-0004/AC-024) — 시나리오 정답
// (사칭 대상의 성별)을 참가자에게 미리 알려주는 셈이 된다(`scenarios/publicMeta.ts`가 이미 세운
// "정답을 미리 알려주지 않는다" 축 계승). 이 파일은 `functions/src/realtime/`(서버 전용) 밖으로
// import되지 않는다 — `roleplay/index.ts`·`roleplay/openingLine.ts`가 읽는 것도 이 파일이 export한
// **표의 값**뿐이고, 클라로 나가는 응답 어디에도 이 표는 실리지 않는다.
import { resolveSessionCallLeg, type RelayState } from "../callLegs/legPlan";
import { resolveScenarioEscalation, resolveSessionEscalation, type EscalationSessionView } from "../scenarios/escalation";
import { findFlowVariant } from "../scenarios/flowVariants";
import { PUBLIC_SCENARIOS } from "../scenarios/publicMeta";

export type SpeakerGenderAssignment = "male" | "female" | "notApplicable";

/**
 * `notApplicable`의 뜻 — "Gemini 프리셋 음성이 이 시나리오에 도달하지 않는다"(clone 경로이거나
 * 통화 경로 자체가 없다). ⛔ **`either`(아무거나)와 다르다** — either를 두면 프롬프트 층(층 2)에
 * 알려 줄 값이 없어 신고가 그대로 재발한다.
 *
 * ⚠️ 키는 `PUBLIC_SCENARIOS`와 **1:1이어야 한다**(`__tests__/scenarioVoice.test.ts`의 `deepEqual`
 * 게이트, `roleplay/l3Depth.ts`와 같은 형태).
 */
export const SCENARIO_SPEAKER_GENDER: Record<string, SpeakerGenderAssignment> = {
  "institutional-impersonation": "male", // 검찰·금감원 수사관 사칭
  "bank-security-verify-scam": "male", // 은행 금융사고대응팀 — 침착하고 사무적인
  "kidnapping-threat": "male", // 낮고 차갑고 명령조
  "reputation-blackmail-scam": "male", // 차갑고 사무적으로 딱딱 끊어
  "loan-refinance-scam": "female", // 캐피탈 상담원 — 친절하고 사무적인
  "card-company-impersonation": "female", // 카드사 상담원 — 친절하지만 다급한
  "tax-refund-scam": "female", // 환급 담당 상담
  "courier-customs-scam": "female", // 택배 고객센터 상담
  "messenger-subsidy-smishing-sms": "female", // 안내센터 상담원 — 에스컬레이션 voiceMode:"generic"
  // T191 S5 — 고급 전용 3종(Architecture T191 절 "표 갱신" — 성별 표)
  "card-delivery-call": "female", // 카드 배송 안내·사고 접수 상담원 — 친절하고 사무적인
  "asset-protection-notice-call": "male", // 금융감독기관 직원 — 침착하고 정중한
  "prosecution-cooperation-call": "male", // 검찰 수사관 — 딱딱하고 단호한
  "family-accident-deepvoice": "notApplicable", // voiceMode:"clone" — 목소리는 참가자 본인의 것
  "grandchild-impersonation": "notApplicable", // voiceMode:"clone"
  "messenger-child-impersonation-kakao": "notApplicable", // 에스컬레이션 voiceMode:"clone"
  "messenger-friend-loan-kakao": "notApplicable", // 에스컬레이션 없음 — 통화 경로 0
  // 초급 · 중급은 통화 경로 0. T194-a — 고급 세션만 통화로 이어지며 그 성별은 아래 `resolveSessionSpeakerGender`가 변형 leg에서 푼다
  // (⛔ 여기를 "female"로 바꾸지 말 것 — 초급 · 중급 프롬프트에 [화자] 블록이 생긴다 · AC-106 (f)).
  "messenger-parcel-smishing-sms": "notApplicable",
};

/**
 * 프롬프트 [화자] 블록에 넘길 옵션값 — `notApplicable`이면 `undefined`(블록 자체를 내보내지
 * 않는다, `buildSystemPrompt`의 조건형 스프레드가 falsy 값을 그대로 걸러낸다).
 */
/** UX-025 기본 목소리 선택(`voiceSelectionSource`)의 성별. 클론(recorded · reused) · 부재 = `undefined`. */
export function voiceSelectionGender(voiceSelectionSource: string | undefined): "male" | "female" | undefined {
  if (voiceSelectionSource === "fallback_male") return "male";
  if (voiceSelectionSource === "fallback_female") return "female";
  return undefined;
}

export function speakerGenderFor(scenarioId: string): "male" | "female" | undefined {
  const assignment = SCENARIO_SPEAKER_GENDER[scenarioId];
  return assignment === "male" || assignment === "female" ? assignment : undefined;
}

/**
 * ⭐ T194-a(docs/Architecture.md §84.4.3 "화자 성별" · G586) — **세션 단위** 화자 성별. 표는 시나리오 단위라
 * `messenger-parcel-smishing-sms`(초급 · 중급은 통화 경로 0 = `notApplicable`)를 `"female"`로 바꾸면 **초급 · 중급 텍스트
 * 프롬프트에도 [화자] 블록이 생긴다**(호출부 3곳이 무조건 넘긴다) = AC-106 (f) 위반. ⇒ 표 값은 그대로 두고, 표가 값을 내지 않는
 * 시나리오는 **이 세션에 통화 단계가 있을 때만** 배정된 흐름 변형의 0번 leg 성별을 쓴다.
 * 쓰는 곳: 프롬프트 호출부 3곳(`roleplay/index.ts` · `roleplay/openingLine.ts` · `realtime/geminiProvider.ts` — 마지막은
 * `createRealtimeCall`이 이 값을 계산해 넘긴다) + Gemini 음성 풀 선택(층 1 · 층 2 같은 원천 — §50.3.1).
 * 표에 값이 있는 시나리오는 **표 값 그대로**다(오늘 동작 바이트 동일).
 */
export function resolveSessionSpeakerGender(
  session: EscalationSessionView & { flowVariantId?: string; voiceSelectionSource?: string; relay?: RelayState },
): "male" | "female" | undefined {
  // §142(D5) — 다통화 변형은 현재 레그 화자 성별이 표 값보다 먼저다(레그마다 다른 인물). 다통화가 아닌 세션은 아래 종전 규칙 그대로(바이트 동일).
  const callLeg = resolveSessionCallLeg(findFlowVariant(session.flowVariantId), session);
  if (callLeg) return callLeg.gender;
  const fromTable = speakerGenderFor(session.scenarioId);
  if (fromTable) return fromTable;
  // ⭐ 2026-10-20 실기 신고(child-kakao — "남성 음성"을 골랐는데 통화가 여성 음성) — 참가자가 메신저 통화용 목소리 선택(UX-025)에서
  // **기본 남성·여성 목소리**를 고른 세션은 그 성별이 세션 화자 성별이다. 이 값 하나로 Gemini Live 음성 풀(`pickGeminiVoiceName`)과
  // 프롬프트 [화자] 블록(텍스트 · 오프닝 · Live — 아들/딸)이 함께 따라간다. 폴백 TTS는 `session.voiceId`(createSession이
  // FALLBACK_VOICE_MALE_ID/FEMALE_ID로 해석)를 쓰므로 같은 선택을 따른다. 클론(recorded · reused) · 선택 부재는 아래 종전 규칙 그대로(바이트 동일).
  // ⛔ 리뷰 M2 — 이 세션에 통화 단계가 있을 때만(createSession은 필드를 검증하지 않는다 — parcel 초급 · 중급에 클라가 직접 보내도
  // [화자] 블록이 생기지 않게, AC-106 (f) · §84.4.6). 판정은 전이 술어 하나(`resolveSessionEscalation`)로 한다.
  const chosen = voiceSelectionGender(session.voiceSelectionSource);
  if (chosen && resolveSessionEscalation(session, PUBLIC_SCENARIOS)) return chosen;
  // ⛔ 리뷰 C1 — 변형 leg 성별은 **`advancedEscalation`만 가진 시나리오**(택배 문자 — 고급만 통화)에서만 쓴다. `escalation`(세 난이도 ·
  // 클론 — child-kakao)을 가진 notApplicable 시나리오에 leg 성별을 주면 [화자] 블록이 새로 생기고 Gemini 음성 풀이 줄어든다(#162 ·
  // §84.4.6 위반). 판정은 메타 직접 읽기 대신 술어로 한다(G580): 중급 값 없음 ∧ 고급 값 있음 = advancedEscalation 전용.
  const meta = PUBLIC_SCENARIOS[session.scenarioId];
  const advancedOnlyEscalation =
    resolveScenarioEscalation(meta, "intermediate") === undefined && resolveScenarioEscalation(meta, "advanced") !== undefined;
  if (!advancedOnlyEscalation) return undefined;
  if (!resolveSessionEscalation(session, PUBLIC_SCENARIOS)) return undefined;
  const variant = findFlowVariant(session.flowVariantId);
  // 통화 단계가 있는 변형(`escalatesToVoice`)의 leg만 — 수신자용 비에스컬레이션 변형(fv-k7qm 등)은 통화 경로가 없다.
  if (!variant || variant.scenarioId !== session.scenarioId || !variant.escalatesToVoice) return undefined;
  return variant.legs[0]?.speakerGender;
}
