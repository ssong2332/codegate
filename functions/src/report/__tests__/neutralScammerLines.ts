// 저작 문구도 요구 어형도 없는 일반 사기범 대사 표본 — 수법 추정이 "발명하지 않음"을 고정하는 두 테스트가 같은 표본을 쓴다
// (`verdictRegression.test.ts` 문구 키 추정 · `demandFallbackLabel.test.ts` 요구 어형 보정표 — PR-A3 리뷰 Major 2).
// 원문은 verdictRegression.test.ts에 있던 배열 그대로다(옮기기만 했다).
export const NEUTRAL_SCAMMER_LINES: readonly string[] = [
  "네 고객님, 확인 도와드리겠습니다.",
  "네, 잠시만 기다려 주세요.",
  "안녕하세요, 접수처입니다. 물품이 접수처에 보관 중이라 받는 분 정보를 한 번만 확인 부탁드립니다.",
  // 인용구 안에 있지만 어느 대화에나 나오는 한 단어 대꾸(손주 사칭·대출·가족 사고 시나리오 인용구).
  "아니에요, 괜찮아요.",
  "잠깐만요, 확인해 볼게요.",
  "진짜야? 고마워.",
];
