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
  "family-accident-deepvoice": "notApplicable", // voiceMode:"clone" — 목소리는 참가자 본인의 것
  "grandchild-impersonation": "notApplicable", // voiceMode:"clone"
  "messenger-child-impersonation-kakao": "notApplicable", // 에스컬레이션 voiceMode:"clone"
  "messenger-friend-loan-kakao": "notApplicable", // 에스컬레이션 없음 — 통화 경로 0
  "messenger-parcel-smishing-sms": "notApplicable", // 에스컬레이션 없음
};

/**
 * 프롬프트 [화자] 블록에 넘길 옵션값 — `notApplicable`이면 `undefined`(블록 자체를 내보내지
 * 않는다, `buildSystemPrompt`의 조건형 스프레드가 falsy 값을 그대로 걸러낸다).
 */
export function speakerGenderFor(scenarioId: string): "male" | "female" | undefined {
  const assignment = SCENARIO_SPEAKER_GENDER[scenarioId];
  return assignment === "male" || assignment === "female" ? assignment : undefined;
}
