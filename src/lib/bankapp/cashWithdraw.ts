// ⭐ 2026-11-07(Edge 재시험 2 S7 — 기관 고급 현금 예탁형 · 자산 보호 고급 보관형이 "예금을 현금 · 수표로 찾아 직원에게 맡기라"를 말로만 지시하고 끊음 ·
// 사용자 결정 D-G1 ~ D-G6 "앱 안 화면으로 바꾸기" · D-G2 E1 내 은행 앱 출금 예약 + 문진표) — 내 은행 앱 "현금 · 수표 출금 예약" 화면의 순수 로직.
// 잎 모듈(값 import 0 — 렌더 하네스 · 테스트 러너가 확장자 없는 상대 import를 풀지 못한다 · `goldBuy.ts`와 같은 관례).
//
// | 항목 | 정책 |
// |---|---|
// | 수령 형태 | 현금 · 자기앞수표(근거 R1 — 예금 전부 인출해 수표로 · 한국경제 2026-04-15) |
// | 금액 | 1만 원 단위 · 100만 원 이상(고액 예약 · ⚠️ 판단값) · 1회 예약 한도 `CASH_RESERVE_LIMIT`(⚠️ 판단값) · 잔액 판정은 화면이 출금 계좌 시트로(`withdrawAccounts.ts`) |
// | 문진표 | 금감원 맞춤형 고액 현금 인출 문진 문항(근거 R7 — 파이낸셜뉴스 2022-08-26 · SBS Biz: 인출 목적 · 타인과 통화 여부 · 앱 설치 여부 · 2022 기준, 지금 그대로인지는 미확인). 하나라도 "예" = 예약 보류 |
// | 저장 · 전송 | 금액 · 형태 · 목적 · 답은 이 모듈의 메모리 표와 화면 state를 벗어나지 않는다(G138 — 네트워크 · 저장소 0). 기록은 "예약했다" · "보류됐다" 사실 하나씩(D-G4) |
// | 영업점 | 지점명 · 주소 · 시각 0(AC-102 (d)) · 완료 화면에 영업점 방문 · 신분증 안내 0(2026-11-08 사용자 결정 §15.4 (c) — 앱 밖 행동 암시를 남기지 않는다) |

/** 1회 예약 한도(원 · 판단값). */
export const CASH_RESERVE_LIMIT = 50_000_000;
/** 예약 최소 금액(원 · 판단값 — 고액 현금 예약). */
export const CASH_RESERVE_MIN = 1_000_000;

export type CashForm = "cash" | "check";
export const CASH_FORMS: readonly { id: CashForm; label: string }[] = [
  { id: "cash", label: "현금" },
  { id: "check", label: "자기앞수표" },
];

/** 문진표 — 인출 목적 선택지(근거 R7). */
export const CASH_PURPOSES: readonly string[] = ["생활비", "가족 송금", "사업 자금", "투자", "기타"];

/** 문진표 — 예/아니요 문항(근거 R7). 하나라도 "예"면 보류. */
export const CASH_QUESTIONS: readonly string[] = [
  "검찰 · 경찰 · 금융감독원 등 수사기관이나 금융기관 직원이라며 현금 인출을 요구받으셨나요?",
  "지금 누군가와 통화하면서 이 예약을 하고 계신가요?",
  "최근 다른 사람의 안내로 원격 지원 앱이나 처음 보는 앱을 설치하셨나요?",
];

/** "12,340,000원". */
export function cashWon(value: number): string {
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

/** 금액(숫자 · 쉼표만 남긴 값)을 원 단위 정수로. 판정 불가면 undefined. */
export function cashAmountValue(raw: string): number | undefined {
  const compact = raw.replace(/[\s,]/g, "");
  if (!/^\d{1,12}$/.test(compact)) return undefined;
  return Number(compact);
}

/** 금액 · 형태 판정. 통과 = undefined. */
export function cashReserveError(raw: string, form: CashForm | undefined): string | undefined {
  if (form === undefined) return "받으실 형태를 골라 주세요.";
  const value = cashAmountValue(raw);
  if (value === undefined || value === 0) return "출금할 금액을 입력해 주세요.";
  if (value % 10_000 !== 0) return "1만 원 단위로 입력해 주세요.";
  if (value < CASH_RESERVE_MIN) return `출금 예약은 ${cashWon(CASH_RESERVE_MIN)}부터 할 수 있습니다.`;
  if (value > CASH_RESERVE_LIMIT) return `1회 예약 한도(${cashWon(CASH_RESERVE_LIMIT)})를 넘었습니다.`;
  return undefined;
}

/** 문진표 판정: 목적 + 모든 문항에 답해야 하고, 하나라도 "예"면 보류. */
export type CashCheckResult = "incomplete" | "held" | "proceed";
export function cashCheckResult(purpose: string | undefined, answers: readonly (boolean | undefined)[]): CashCheckResult {
  if (purpose === undefined || !CASH_PURPOSES.includes(purpose)) return "incomplete";
  if (answers.length !== CASH_QUESTIONS.length || answers.some((a) => a === undefined)) return "incomplete";
  return answers.some((a) => a === true) ? "held" : "proceed";
}

/** FNV-1a 32비트(`goldBuy.ts`와 같은 식 — 잎 모듈이라 복사했다). */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** 예약 번호(결정적 · 8자리 숫자를 4-4로). `seed` = 세션 열쇠 · `serial` = 그 세션의 몇 번째 예약인가. */
export function cashReservationNumberFor(seed: string, serial: number): string {
  const digits = String(fnv1a(`cash-reserve:${seed}:${serial}`) % 100_000_000).padStart(8, "0");
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export type CashReservation = { form: CashForm; amount: number; number: string; reservedAt: Date };

const reservations = new Map<string, CashReservation>();
const reserveCount = new Map<string, number>();

/** 예약을 기록한다(메모리 표만 — 서버 · 저장소 0). */
export function recordCashReservation(ledgerKey: string, screenId: string, form: CashForm, amount: number, reservedAt: Date): CashReservation {
  const serial = reserveCount.get(ledgerKey) ?? 0;
  reserveCount.set(ledgerKey, serial + 1);
  const reservation = { form, amount, number: cashReservationNumberFor(ledgerKey, serial), reservedAt };
  reservations.set(`${ledgerKey}:${screenId}`, reservation);
  return reservation;
}

/** 이 세션 · 이 화면의 마지막 예약(없으면 undefined). */
export function lastCashReservation(ledgerKey: string, screenId: string): CashReservation | undefined {
  return reservations.get(`${ledgerKey}:${screenId}`);
}

/** 화면 문구. ⛔ 지점명 · 주소 · 시각 0(AC-102 (d)) · 화면 문구에 연습 표시 낱말 0(G437). */
export const CASH_COPY = {
  menuTitle: "현금 · 수표 출금 예약",
  fromLabel: "출금 계좌",
  amountLabel: "출금 금액",
  allButton: "전액",
  formLabel: "받으실 형태",
  next: "다음",
  checkHeading: "금융사기 예방 문진표",
  checkLead: "고액 현금 출금 전 고객님의 소중한 재산을 지키기 위해 여쭙습니다.",
  purposeLabel: "출금 목적",
  yes: "예",
  no: "아니요",
  checkError: "문진표 항목을 모두 골라 주세요.",
  reserve: "예약하기",
  cancel: "취소",
  heldHeadline: "출금 예약이 보류되었습니다",
  heldLines: [
    "검찰 · 경찰 · 금융감독원은 수사나 조사를 이유로 현금 인출이나 보관을 요구하지 않습니다.",
    "누군가의 안내로 예약하시는 중이라면 통화를 끊고 112 또는 1332로 먼저 확인해 주세요.",
  ],
  heldBack: "예약 화면으로",
  doneHeadline: "출금 예약이 접수되었습니다",
  numberLabel: "예약 번호",
  amountRow: "예약 금액",
  formRow: "받으실 형태",
} as const;
