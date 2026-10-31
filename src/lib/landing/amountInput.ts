// §101 추가(2026-10-21 사용자 요청) — 모의 랜딩 금액 칸의 **입력 검증 · 한글 단위 표기**(순수 함수 · 잎 모듈).
// ⚠️ `src/components/MessengerFakeLanding.tsx`가 상대 경로로 import한다 — 렌더 하네스가 `@/` 별칭을 풀지 못하므로 이 파일은 아무것도 import하지 않는다.
//
// 사용자 원문: *"금액을 입력할 때, '47억 원'처럼 한글로도 표기돼서 사용자가 보기 편하도록 추가하자"* ·
// *"현재는 안전계좌 이체를 공백으로 두고 이체를 누르면 넘어가는데, 채워야 넘어갈 수 있도록 해."*
//
// | 입력(앞뒤 공백 · 쉼표 제거 뒤) | `parseAmount` | 한글 표기 | 제출 |
// |---|---|---|---|
// | 빈 칸 | `{ kind: "empty" }` | 없음 | 막음 — "금액을 입력해 주세요." |
// | 숫자 말고 다른 글자가 있다 | `{ kind: "invalid" }` | 없음 | 막음 — "금액은 숫자로만 입력해 주세요." |
// | 0(또는 0만 여러 개) | `{ kind: "zero" }` | 없음 | 막음 — "0원보다 큰 금액을 입력해 주세요." |
// | 1 이상 정수 | `{ kind: "ok", value }` | "47억 원" · "1,234만 5,000원" · "3만 원" | 통과 |
// ⛔ 입력값 자체를 바꾸지 않는다(자동 서식 0 — UX D-93). 표기는 칸 아래 보조 줄일 뿐이다.

export type ParsedAmount =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "zero" }
  | { kind: "ok"; value: bigint };

/** 금액 칸 입력을 판정한다(위 표). 큰 금액도 정확하게 다루려고 bigint를 쓴다. */
export function parseAmount(raw: string): ParsedAmount {
  const compact = raw.replace(/[\s,]/g, "");
  if (compact === "") return { kind: "empty" };
  if (!/^\d+$/.test(compact)) return { kind: "invalid" };
  const value = BigInt(compact);
  return value === ZERO ? { kind: "zero" } : { kind: "ok", value };
}

// tsconfig target이 ES2017이라 bigint 리터럴(`0n`)을 쓰지 않는다.
const ZERO = BigInt(0);
const TEN_THOUSAND = BigInt(10000);
const UNITS = ["", "만", "억", "조", "경"] as const;

/** 천 단위 쉼표("1234" → "1,234"). */
function withCommas(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 은행 앱 관례의 한글 단위 금액: 4700000000 → "47억 원" · 12345000 → "1,234만 5,000원" · 30000 → "3만 원" · 1500 → "1,500원".
 * 만 단위(4자리)로 끊어 0인 묶음은 건너뛰고, 각 묶음은 천 단위 쉼표를 쓴다. 마지막 묶음이 단위(만 · 억 …)로 끝나면 "원" 앞에 띄어 쓴다.
 * 경 단위를 넘으면 쉼표 숫자 + "원"으로 둔다(모의 화면에서 실용 범위 밖).
 */
export function formatKoreanAmount(value: bigint): string {
  if (value <= ZERO) return "";
  const groups: bigint[] = [];
  for (let rest = value; rest > ZERO; rest /= TEN_THOUSAND) groups.push(rest % TEN_THOUSAND);
  if (groups.length > UNITS.length) return `${withCommas(value)}원`;
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    if (groups[i] === ZERO) continue;
    parts.push(`${withCommas(groups[i])}${UNITS[i]}`);
  }
  const text = parts.join(" ");
  return groups[0] === ZERO ? `${text} 원` : `${text}원`;
}

/** 금액 칸 오류 안내(위 표 — 칸 아래 한 줄). 통과면 undefined. */
export function amountError(raw: string): string | undefined {
  const parsed = parseAmount(raw);
  if (parsed.kind === "empty") return "금액을 입력해 주세요.";
  if (parsed.kind === "invalid") return "금액은 숫자로만 입력해 주세요.";
  if (parsed.kind === "zero") return "0원보다 큰 금액을 입력해 주세요.";
  return undefined;
}

/** 금액 칸 아래 보조 표기(통과하는 입력에만). */
export function amountHint(raw: string): string | undefined {
  const parsed = parseAmount(raw);
  return parsed.kind === "ok" ? formatKoreanAmount(parsed.value) : undefined;
}

/** 금액이 아닌 필수 칸의 빈 칸 안내 — 받침에 따라 "을/를"을 고른다("성명을" · "생년월일을" · "연락처를"). */
export function requiredFieldError(label: string, raw: string): string | undefined {
  if (raw.trim() !== "") return undefined;
  const last = label.charCodeAt(label.length - 1);
  const hasBatchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${label}${hasBatchim ? "을" : "를"} 입력해 주세요.`;
}

/**
 * ⭐ P2-d(2026-10-31 · 메인 "권고대로") — 훈련용 이체 화면의 이체 한도. 근거: 하나은행 모바일OTP 이용안내 *"이체한도 1일 최대 5천만원, 1회 최대 1천만원"*
 * (https://www.kebhana.com/cont/info/info01/info0104/info010404/index.jsp — 2026-10-31 열람). 은행 · 보안 매체 · 등급마다 다르다(보안카드 · OTP 1등급은 더 크다).
 * 한 세션의 이체 화면은 많아야 둘이라 1회 한도 안에서는 1일 한도에 닿지 않는다 — 1일 한도는 화면에 안내만 한다.
 */
export const TRANSFER_LIMIT_PER_TRANSACTION = 10_000_000;
export const TRANSFER_LIMIT_PER_DAY = 50_000_000;

/** 1회 한도를 넘는 금액이면 안내 문구(통과하는 금액 · 판정 불가 입력은 undefined — 빈 칸 · 형식 오류는 `amountError`가 먼저 막는다). */
export function transferLimitError(raw: string): string | undefined {
  const parsed = parseAmount(raw);
  if (parsed.kind !== "ok" || parsed.value <= BigInt(TRANSFER_LIMIT_PER_TRANSACTION)) return undefined;
  return `1회 이체 한도(${formatKoreanAmount(BigInt(TRANSFER_LIMIT_PER_TRANSACTION))})를 넘었습니다. 금액을 다시 입력해 주세요.`;
}

/** 이체 화면 안내 줄("1회 1,000만 원 · 1일 5,000만 원"). */
export const TRANSFER_LIMIT_NOTE = `이체 한도 · 1회 ${formatKoreanAmount(BigInt(TRANSFER_LIMIT_PER_TRANSACTION))} · 1일 ${formatKoreanAmount(BigInt(TRANSFER_LIMIT_PER_DAY))}`;
