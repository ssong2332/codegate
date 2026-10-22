// 2026-10-22(전수 검수 2차 · docs/research/full-scenario-live-audit-2026-10.md F4 · M4 · Architecture §104) — 사기범이 같은 요구 · 같은
// 말을 연달아 할 때 다음 응답에 "다른 카드로 넘어가라" 1줄을 싣는 **순수 판정**(텍스트 폴백 `sendMessage`의 턴 지시).
//
// 재현: 기관 사칭 중급 거절형 — 성함·생년월일 요구 3턴 연속(공통 [진행 강제] "같은 압박을 반복하지 않는다"로는 개선 없음) ·
// 택배 스미싱 초급 거절형 — "직접 확인해 보시지요" 6턴 연속(문자 단계라 사기범이 끝낼 수단이 없다 · 판정표 2행 `wrong_channel`).
// 프롬프트 규칙은 모델이 지키지 않으면 그만이다 ⇒ 직전 두 사기범 대답을 서버가 보고, 반복이 **이미 일어난 뒤에만** 1줄을 싣는다.
//
// ── 판정표(⛔ 이 순서 그대로 — 위에서 첫 매치 · 새 유형은 행을 추가할지 먼저 묻는다) ─────────────────────
// | # | If(직전 사기범 대답 A = 그 앞, B = 가장 최근) | Then |
// |---|---|---|
// | 1-b | 이번 참가자 발화가 자금 소진 선언("돈 없어" · "다 털렸어" · "전부 보냈어" — §104 사용자 실기 대본) | `exhausted`(사기범 대답 수와 무관) |
// | 1 | 사기범 대답이 둘 미만 | 없음 |
// | 2 | A와 B가 **같은 인적사항 항목**(성함 · 생년월일 · 주민번호 · 주소)을 요구하는 형태로 꺼냈다 | `identity` |
// | 3 | A와 B의 글자 2-gram 유사도 ≥ `REPEAT_SIMILARITY_THRESHOLD`(둘 다 공백 · 문장부호를 뺀 길이 ≥ `REPEAT_MIN_CHARS`) | `similar` |
// | 4 | 그 외 | 없음 |
// - 2행이 "같은 항목"만 보는 이유: 순순히 따르는 참가자에게 성함 → 주민번호처럼 **다른** 항목을 이어 묻는 것은 정상 진행이다.
// - 상태 저장 0 — 매 턴 직전 두 대답만 본다. 모델이 지시를 따르면 다음 턴에는 조건이 풀린다.
// - 실시간(Gemini Live)은 이 경로가 아니다 — 같은 표의 클라 짝이 `src/lib/realtime/stallRecovery.ts` §4(대기 반복 행 추가)다.
//   두 파일의 정규식 · 임계값은 루트 테스트(`stallRecovery.test.ts` [§104 짝])가 글자 단위로 대조한다.
// ⛔ 잎 모듈(import 0) · 문면에 숫자 · 횟수 · 따옴표 대사 예시 · 끊기 어휘 0(F11/G130 — `repeatBreak.test.ts`가 고정).

export type RepeatBreakKind = "exhausted" | "identity" | "similar";

/** 3행 임계값 — 전수 검수 판정표 §1.1 ② 자동 후보 탐지 기준과 같은 값. */
export const REPEAT_SIMILARITY_THRESHOLD = 0.6;
/** 3행 — 너무 짧은 대답("네.")끼리의 우연한 일치를 거른다. */
export const REPEAT_MIN_CHARS = 8;

/** 1-b행 — 참가자 자금 소진 선언(클라 `EXHAUSTED_DECLARATION`과 같은 정규식). */
export const EXHAUSTED_DECLARATION =
  /돈\s*(?:이|은|도)?\s*(?:더\s*|이제\s*)?없|(?:더|이제|남은)\s*(?:돈|게|건|것)?\s*(?:이|은)?\s*(?:하나도\s*)?없|다\s*털렸|탈탈|빈털터리|한\s*푼도|잔고\s*(?:가)?\s*없|전부\s*(?:다\s*)?보냈/;

/** 2행 — 인적사항 항목별 낱말. */
export const IDENTITY_ITEM_PATTERNS: Readonly<Record<string, RegExp>> = {
  name: /성함|이름/,
  birth: /생년월일|생일/,
  rrn: /주민\s*(?:등록\s*)?번호|뒤\s*(?:7|일곱)\s*자리/,
  address: /주소/,
};
/** 2행 — "달라"는 형태(불러 · 말씀해 · 알려 · 부탁). 되읽기 확인("○○님 맞으시죠?")은 요구가 아니다. */
export const IDENTITY_REQUEST_FORM = /(?:불러|말씀해|말씀|말해|알려|읊어)\s*(?:주|줘|달)|부탁\s*(?:드|합)/;

/** 그 대답이 요구한 인적사항 항목들(요구 형태가 없으면 빈 집합). */
export function requestedIdentityItems(text: string): Set<string> {
  if (!IDENTITY_REQUEST_FORM.test(text)) return new Set();
  return new Set(Object.keys(IDENTITY_ITEM_PATTERNS).filter((key) => IDENTITY_ITEM_PATTERNS[key]!.test(text)));
}

function normalizeForSimilarity(text: string): string {
  return text.replace(/[\s.,!?~…·'"“”‘’()\-]/g, "");
}

function bigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2));
  return out;
}

/** 글자 2-gram Dice 유사도(0~1). 정규화 뒤 둘 중 하나라도 `REPEAT_MIN_CHARS` 미만이면 0. */
export function bigramSimilarity(a: string, b: string): number {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (na.length < REPEAT_MIN_CHARS || nb.length < REPEAT_MIN_CHARS) return 0;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared += 1;
  return (2 * shared) / (ga.size + gb.size);
}

/** 판정표 본체 — `scammerTexts`는 시간순 사기범 대답(마지막 = 가장 최근) · `currentUserText` = 이번에 답할 참가자 발화(§104 · 부재 = 1-b행 안 봄). */
export function decideRepeatBreak(scammerTexts: readonly string[], currentUserText?: string): RepeatBreakKind | null {
  if (currentUserText !== undefined && EXHAUSTED_DECLARATION.test(currentUserText)) return "exhausted"; // 1-b행
  if (scammerTexts.length < 2) return null; // 1행
  const a = scammerTexts[scammerTexts.length - 2]!;
  const b = scammerTexts[scammerTexts.length - 1]!;
  const itemsA = requestedIdentityItems(a);
  for (const item of requestedIdentityItems(b)) {
    if (itemsA.has(item)) return "identity"; // 2행
  }
  if (bigramSimilarity(a, b) >= REPEAT_SIMILARITY_THRESHOLD) return "similar"; // 3행
  return null; // 4행
}

/** 2행 지시(서버 소유). */
export const REPEAT_BREAK_IDENTITY_INSTRUCTION =
  "(너는 직전 대답과 그 앞 대답에서 같은 인적사항을 달라고 했다. 상대가 그 정보를 아직 주지 않았으면 이번 대답에서는 그 정보를 다시 달라고 하지 말고, 다른 수법이나 다른 요구로 넘어가라 — 불이익 암시, 확인 절차 차단, 비밀 유지 요구처럼 아직 쓰지 않은 카드를 골라라.)";
/** 3행 지시(서버 소유). */
export const REPEAT_BREAK_SIMILAR_INSTRUCTION =
  "(너는 직전 대답과 그 앞 대답에서 거의 같은 말을 했다. 이번 대답에서는 그 말을 되풀이하지 말고, 다른 수법이나 다른 요구, 다른 이유를 꺼내 상황을 앞으로 움직여라. 더 요구할 것이 정말 남지 않았으면 [진행 강제]의 통화 끝내기 항목이 정한 대로 하라.)";

/** 1-b행 지시(서버 소유 · 클라 `LIVE_REPEAT_BREAK_TEXT.exhausted`와 같은 글자). 끊을지는 [진행 강제] 끊기 항목에 맡긴다(NONE이면 이어 간다). */
export const REPEAT_BREAK_EXHAUSTED_INSTRUCTION =
  "(상대가 더 보낼 돈이나 줄 정보가 없다고 분명히 말했다. 같은 요구를 다시 하지 마라. 대출처럼 아직 권하지 않은 다른 수단이 있으면 그것만 권하고, 이미 권했거나 상대가 그것도 거절하면 더 요구할 것이 남지 않은 것이니 [진행 강제]의 통화 끝내기 항목이 정한 대로 하라.)";

export function repeatBreakInstruction(kind: RepeatBreakKind | null): string | undefined {
  if (kind === "exhausted") return REPEAT_BREAK_EXHAUSTED_INSTRUCTION;
  if (kind === "identity") return REPEAT_BREAK_IDENTITY_INSTRUCTION;
  if (kind === "similar") return REPEAT_BREAK_SIMILAR_INSTRUCTION;
  return undefined;
}
