// 세션별 가상 은행명 (2026-10-18 사용자 결정 "가상 은행 이름(권장)" · Architecture §81).
//
// 왜: 문자·대사에 "OO은행 604-2270-1183-91"이 보이면 참가자가 곧바로 훈련(=가짜)인 줄 안다(현실감 저하).
// 그래서 **실제처럼 들리지만 존재하지 않는** 은행 이름을 세션마다 하나 골라, 문자·대사·랜딩에서 같은 이름을 쓴다.
//
// 원칙(#277·#289 "실존 기관 사칭 회피"와의 관계): 실존 은행명은 여전히 쓰지 않는다 — 모델이 실존명을 말하면
// `guardrails/realFinancialNames.ts`가 바꾼다. 가상명은 **존재하지 않는 기관**이라 사칭이 아니다. 단, 실존·과거
// 은행·저축은행·상호금융·카드사 이름과 겹치거나 헷갈리면 사실상 사칭이 되므로 아래 목록은 대조를 통과한 것만 둔다
// (대조 출처·결과는 Architecture §81.1).
//
// ⛔ 이름을 늘리거나 바꿀 때는 §81.1 대조표를 다시 돌린다. "OO뱅크"류, 실존 브랜드와 한 글자 차이, 카드사·
//    증권사·보험사 상호와 같은 이름은 넣지 않는다.

/** 카탈로그·프롬프트에 쓰는 가상 은행 자리표시자(템플릿 토큰). 실제 출력 전에 세션 은행명으로 바뀐다. */
export const BANK_PLACEHOLDER = "OO은행";

/** 대조를 통과한 가상 은행명(§81.1). 순서가 곧 배정 순서다 — 바꾸면 기존 세션의 해시 폴백 배정이 달라진다. */
export const FICTIONAL_BANK_NAMES: readonly string[] = [
  "한결은행",
  "다온은행",
  "새솔은행",
  "늘봄은행",
  "해담은행",
  "가온은행",
  "미르은행",
  "보담은행",
];

/** FNV-1a 32비트 — 결정적이고 의존성이 없다. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** 새 세션의 가상 은행명을 고른다. `random`은 테스트 주입점(기본 Math.random). */
export function pickFictionalBankName(random: () => number = Math.random): string {
  const index = Math.min(FICTIONAL_BANK_NAMES.length - 1, Math.floor(random() * FICTIONAL_BANK_NAMES.length));
  return FICTIONAL_BANK_NAMES[index]!;
}

/**
 * 세션의 가상 은행명. 세션 문서의 `fictionalBankName`이 유일한 원천이고, 그 필드가 없는 옛 세션은 sessionId 해시로
 * 결정적으로 고른다(같은 세션 안에서 문자·대사가 갈라지지 않게). 목록 밖의 값이 저장돼 있으면 해시 폴백을 쓴다.
 */
export function resolveFictionalBankName(session: { sessionId?: string; fictionalBankName?: string }): string {
  const stored = session.fictionalBankName;
  if (stored && FICTIONAL_BANK_NAMES.includes(stored)) return stored;
  return FICTIONAL_BANK_NAMES[hash(session.sessionId ?? "") % FICTIONAL_BANK_NAMES.length]!;
}

/**
 * 자리표시자 표기 변형까지 잡는다(리뷰 #4 — 모델이 "OO 은행"·"oo은행"·전각 "ＯＯ은행"으로 쓸 수 있다).
 * ⚠️ 한계: 한글로 읽은 "오오은행"·"OO뱅크"·"OO카드"는 대상이 아니다(§81.5).
 */
const PLACEHOLDER_PATTERN = /[Oo○Ｏｏ]{2}\s?은행/g;

/** 텍스트의 자리표시자("OO은행"·"○○은행" 및 표기 변형)를 세션 은행명으로 바꾼다. 자리표시자가 없으면 입력을 그대로 돌려준다. */
export function applyFictionalBank(text: string, bankName: string): string {
  PLACEHOLDER_PATTERN.lastIndex = 0;
  if (!PLACEHOLDER_PATTERN.test(text)) return text;
  return text.replace(PLACEHOLDER_PATTERN, bankName);
}
