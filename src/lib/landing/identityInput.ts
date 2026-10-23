// §114(2026-10-23 실기 신고 *"생년월일과 전화번호를 양식에 맞출 수 있도록 하자. 지금은 무분별하게 작성 가능해"* · UX D-152) —
// 모의 랜딩 신원 칸(생년월일 · 휴대전화 번호 · 연락처)의 **입력 정리 · 검증 · 보조 표기**(순수 함수 · 잎 모듈).
// ⚠️ `src/components/MessengerFakeLanding.tsx`가 상대 경로로 import한다 — 렌더 하네스가 `@/` 별칭을 풀지 못하므로 이 파일은 아무것도 import하지 않는다.
// 금액 칸(`amountInput.ts` · §101)과 같은 방식이다: 칸 아래 한 줄 안내 + 제출 막음 · 통과하면 보조 표기 한 줄.
//
// 생년월일(`format: "birthdate"`) — 입력하는 동안 숫자 말고는 지우고 8자리에서 자른다. 자판 = 숫자(`inputMode="numeric"`).
// | 입력(숫자만 남긴 뒤) | 판정 | 칸 아래 |
// |---|---|---|
// | 빈 칸 | 막음 | "생년월일을 입력해 주세요." |
// | 6 · 8자리가 아니다 | 막음 | "생년월일은 6자리(예: 900101) 또는 8자리(예: 19900101)로 입력해 주세요." |
// | 6자리 YYMMDD — 연도 = YY ≤ 올해 끝 두 자리면 20YY, 아니면 19YY | 날짜 검사로 | — |
// | 8자리 YYYYMMDD — 연도 1900 ~ 올해 | 날짜 검사로 | 범위 밖이면 아래 "없는 날짜" |
// | 월 1~12 · 일은 그 달의 날 수(윤년 2월 29일 포함) · 오늘보다 뒤가 아니다 | 통과 | "1990년 1월 1일" |
// | 그 밖 | 막음 | "없는 날짜예요. 생년월일을 다시 확인해 주세요." |
//
// 휴대전화(`format: "mobile"`) — 입력하는 동안 숫자 말고는 지우고 11자리에서 자른 뒤 3-4-4로 하이픈을 넣는다("010-1234-5678").
// | 입력(숫자만 남긴 뒤) | 판정 | 칸 아래 |
// |---|---|---|
// | 빈 칸 | 막음 | "{라벨}을/를 입력해 주세요." |
// | 010으로 시작하는 11자리 | 통과 | 없음 |
// | 그 밖 | 막음 | "휴대전화 번호는 010으로 시작하는 11자리로 입력해 주세요." |
// ⛔ 값은 화면 안에만 있다(콜백 · 네트워크 0 — G138). 열람본(§106)은 정리된 값을 그대로 보여 준다.

export type IdentityFormat = "birthdate" | "mobile";

const onlyDigits = (raw: string): string => raw.replace(/\D/g, "");

/** 입력 중 정리 — 생년월일은 숫자 8자리까지, 휴대전화는 숫자 11자리까지 + 3-4-4 하이픈. */
export function sanitizeIdentityInput(format: IdentityFormat, raw: string): string {
  if (format === "birthdate") return onlyDigits(raw).slice(0, 8);
  const digits = onlyDigits(raw).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/** 칸의 최대 글자 수(하이픈 포함) — 정리 함수가 이미 자르지만 붙여넣기 · 자판 반복 입력에 대한 두 번째 울타리. */
export function identityMaxLength(format: IdentityFormat): number {
  return format === "birthdate" ? 8 : 13;
}

export type ParsedBirthdate = { year: number; month: number; day: number };

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 생년월일 판정(위 표). `today`는 테스트 주입점(기본 지금). 통과면 날짜, 아니면 사유. */
export function parseBirthdate(
  raw: string,
  today: Date = new Date(),
): { kind: "ok"; date: ParsedBirthdate } | { kind: "empty" | "length" | "invalid" } {
  const digits = onlyDigits(raw);
  if (digits === "") return { kind: "empty" };
  if (digits.length !== 6 && digits.length !== 8) return { kind: "length" };
  const thisYear = today.getFullYear();
  let year: number;
  let rest: string;
  if (digits.length === 6) {
    const yy = Number(digits.slice(0, 2));
    year = yy <= thisYear % 100 ? 2000 + yy : 1900 + yy;
    rest = digits.slice(2);
  } else {
    year = Number(digits.slice(0, 4));
    rest = digits.slice(4);
  }
  const month = Number(rest.slice(0, 2));
  const day = Number(rest.slice(2, 4));
  if (year < 1900 || year > thisYear) return { kind: "invalid" };
  if (month < 1 || month > 12) return { kind: "invalid" };
  if (day < 1 || day > daysInMonth(year, month)) return { kind: "invalid" };
  const todayKey = thisYear * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  if (year * 10000 + month * 100 + day > todayKey) return { kind: "invalid" };
  return { kind: "ok", date: { year, month, day } };
}

/** 휴대전화 판정 — 010으로 시작하는 11자리. */
export function isValidMobile(raw: string): boolean {
  return /^010\d{8}$/.test(onlyDigits(raw));
}

function objectParticle(label: string): string {
  const last = label.charCodeAt(label.length - 1);
  const hasBatchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return hasBatchim ? "을" : "를";
}

/** 칸 아래 오류 안내(위 두 표). 통과면 undefined. */
export function identityError(format: IdentityFormat, label: string, raw: string, today: Date = new Date()): string | undefined {
  if (raw.trim() === "") return `${label}${objectParticle(label)} 입력해 주세요.`;
  if (format === "mobile") {
    return isValidMobile(raw) ? undefined : "휴대전화 번호는 010으로 시작하는 11자리로 입력해 주세요.";
  }
  const parsed = parseBirthdate(raw, today);
  if (parsed.kind === "ok") return undefined;
  if (parsed.kind === "length") return "생년월일은 6자리(예: 900101) 또는 8자리(예: 19900101)로 입력해 주세요.";
  return "없는 날짜예요. 생년월일을 다시 확인해 주세요.";
}

/** 통과하는 생년월일의 보조 표기("1990년 1월 1일" — 6자리의 연도 해석을 눈으로 확인하게). 그 밖은 undefined. */
export function identityHint(format: IdentityFormat, raw: string, today: Date = new Date()): string | undefined {
  if (format !== "birthdate") return undefined;
  const parsed = parseBirthdate(raw, today);
  return parsed.kind === "ok" ? `${parsed.date.year}년 ${parsed.date.month}월 ${parsed.date.day}일` : undefined;
}
