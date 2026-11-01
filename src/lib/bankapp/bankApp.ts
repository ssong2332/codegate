// ⭐ BA-1(2026-11-01 · docs/research/in-service-bank-app-design-2026-11-01.md §2 · 사용자 결정 BA0~BA12 "권고대로") — 훈련용 홈 화면 ·
// 가상 "내 은행 앱"의 순수 로직(잎 모듈 · 렌더 하네스가 `@/` 별칭을 풀지 못하므로 상대 경로만 import한다).
//
// 왜: 현실에서는 사이트가 돈을 옮기지 못한다. 피해자는 **자기 은행(송금) 앱으로** 받는 분 이름을 확인하고 인증한 뒤 보낸다.
// ⭐ 간소화안(2026-11-01 · 사용자 승인 "간소화안으로") — 훈련용 홈 · 탐색 막대 · 앱 안 클립보드 · 잠금 해제 · 내 계좌 화면을 뺐다
// (실기기 확인: "복사 -> 은행앱 -> 받는 분 이름 확인으로 가는 절차가 복잡" · "실제로 계좌번호가 복사되지도 않네" · "뒤로가기랑 최근 앱 보기 버튼은 사용도 불가능").
// 실기 근거: 삼성 메시지는 문자 속 계좌번호를 알아보고 '송금' 버튼을 띄워 송금 앱(토스 · 하나은행)으로 넘긴다(삼성 뉴스룸 2019 · 삼성 커뮤니티 2025 답변).
// iOS 문자 앱의 같은 기능은 공개 자료에서 확인하지 못했다(추정 — 같은 동작으로 둔다).
//
// | 항목 | 정책 |
// |---|---|
// | 켜는 조건 | 진단 플래그 `bankapp=1`(`debugFlags.ts` 저장 키) — 플래그가 없으면 계좌 누름 · 은행 앱 0(종전 링크 이체 화면 그대로) |
// | 여는 길 | 통화 중 문자 속 계좌번호 한 번 누름 → '송금' · 메신저 송금 칩 → 받는 계좌가 채워진 송금 화면 |
// | 서버 | 송금 완료(인증 버튼) = 종전 이체 화면 제출과 **같은 기록 경로**(통화 `landing_submitted` · 메신저 `recordMockScreen(…, "submitted")`) |
// | 입력값 | 금액은 화면 state를 벗어나지 않는다(G138 — 완료 콜백은 무인자 · 네트워크 · 저장소 0) |
// | 비밀번호 | 숫자 입력 칸 0 — 인증은 지문 · 얼굴 버튼 하나(BA3) |
// | 클립보드 | 쓰지 않는다(기기 클립보드 API 0 · 앱 안 복사 0). 인증번호는 여전히 복사할 수 없다(AC-061 그대로) |
// | 은행 이름 | 가상 은행명만(서버 `functions/src/shared/fictionalBank.ts` `FICTIONAL_BANK_NAMES`와 같은 목록 — 드리프트 테스트) · 실존 은행명 0 |
// ⚠️ 이 파일은 값을 import하지 않는다(테스트 러너가 확장자 없는 상대 import를 풀지 못한다). 금액 형식 · 1회 한도 판정은 화면이
// `@/lib/landing/amountInput`(`amountError` · `transferLimitError` · `amountHint`)으로 먼저 하고, 잔액 판정만 여기 `balanceError`가 한다.

/** 진단 플래그 키(`debugFlags.ts` `PERSISTED_DEBUG_FLAGS`에 있다). */
export const BANK_APP_FLAG = "bankapp";

/** 주소 쿼리(저장 값을 얹은 `readDebugFlagSearch()` 결과)에서 은행 앱이 켜졌는가. 값 `1`만 켠다. */
export function isBankAppEnabled(search: string): boolean {
  try {
    return new URLSearchParams(search).get(BANK_APP_FLAG) === "1";
  } catch {
    return false;
  }
}

/** 서버 `FICTIONAL_BANK_NAMES`와 같은 목록·순서(§81.1 대조 통과 — `bankApp.test.ts`가 서버 파일과 대조한다). */
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

/** FNV-1a 32비트(서버 `fictionalBank.ts` `hash`와 같은 식 — 결정적 · 의존성 0). */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * 참가자의 "내 은행"(세션마다 하나 · 결정적). 사기범 계좌의 은행(문자 속 은행명)과 **다른** 이름을 고른다 — 현실에서도 피해자의 거래 은행과
 * 대포통장 은행은 대개 다르고, 같으면 "내 은행 앱으로 내 은행에 보내는" 화면이 되어 받는 분 확인이 흐려진다.
 */
export function myBankNameFor(seed: string, avoid?: string): string {
  const start = hash(`my-bank:${seed}`) % FICTIONAL_BANK_NAMES.length;
  for (let i = 0; i < FICTIONAL_BANK_NAMES.length; i += 1) {
    const name = FICTIONAL_BANK_NAMES[(start + i) % FICTIONAL_BANK_NAMES.length]!;
    if (name !== avoid) return name;
  }
  return FICTIONAL_BANK_NAMES[start]!;
}

/** BA4 — 세션별 고정 가상 잔액(1,000만 ~ 3,000만 원 · 1만 원 단위 · 결정적). 서버로 가지 않고 사기범도 모른다. */
export function fictionalBalanceFor(seed: string): number {
  const steps = (3000 - 1000) + 1; // 만 원 단위 칸 수
  return (1000 + (hash(`balance:${seed}`) % steps)) * 10_000;
}

/** 금액(숫자 · 쉼표만 남긴 값)을 정수로. 판정 불가면 undefined. */
function amountValue(raw: string): bigint | undefined {
  const compact = raw.replace(/[\s,]/g, "");
  if (!/^\d+$/.test(compact)) return undefined;
  const value = BigInt(compact);
  return value > BigInt(0) ? value : undefined;
}

/** 출금 가능 금액(잔액) 초과 안내. 통과 · 판정 불가(형식 오류는 `amountError`가 먼저 막는다)면 undefined. */
export function balanceError(raw: string, balance: number): string | undefined {
  const value = amountValue(raw);
  return value !== undefined && value > BigInt(balance) ? "출금 가능 금액보다 많습니다." : undefined;
}

/** "1,234,000원" 표기. 판정 불가면 빈 문자열. */
export function wonText(raw: string): string {
  const value = amountValue(raw);
  return value !== undefined ? `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원` : "";
}

/** 잔액 표기("12,340,000원"). */
export function balanceText(balance: number): string {
  return `${String(balance).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

/** 송금 화면이 받는 계좌(서버 문자 문서 · 메신저 칩의 구조화 필드 그대로 — 참가자 입력 아님). */
export type TransferTarget = {
  bankName: string;
  accountNumber: string;
  /** 서버가 실은 예금주. 부재 = 아래 표에서 결정적으로 고른 가상 이름(은행 앱은 예금주 조회 결과를 늘 보여 준다). */
  holder?: string;
  /** 문자에 적힌 금액("2,340,000"처럼 숫자 · 쉼표). 부재 = 금액 칸 빈 값. */
  amount?: string;
};

/**
 * 받는 분 이름(예금주 조회 결과). 서버가 예금주를 실었으면 그 값이다.
 * 그 밖은 계좌 숫자로 결정적으로 고른 **가상 개인 이름**이다(대포통장은 개인 명의 — 설계 §3.2 W1). 실존 인물 아님.
 */
export const FALLBACK_HOLDER_NAMES: readonly string[] = ["김민서", "이도윤", "박서연", "최준호", "정하은", "윤지성"];

export function recipientHolderFor(target: Pick<TransferTarget, "accountNumber" | "holder">): string {
  if (target.holder) return target.holder;
  const digits = target.accountNumber.replace(/\D/g, "");
  return FALLBACK_HOLDER_NAMES[hash(`holder:${digits}`) % FALLBACK_HOLDER_NAMES.length]!;
}

/**
 * 구조화 필드가 없는 옛 계좌 문자(§51 즉시형 등 — 서버가 `accountHolder` · `transferAmount`를 P2 이체 화면 문자에만 싣는다)의 표시용 보정.
 * 서버 문구의 고정 줄 "예금주: {이름}" · "금액: {숫자}원"만 읽는다(문자를 분류하지 않는다 — 화면에 보일 값이 문자와 어긋나지 않게 할 뿐).
 * 실기 확인(2026-11-01 로컬): 피해금 이관 문자 "예금주: 오현수"인데 송금 화면이 가상 이름을 보였다.
 */
export function holderFromSmsBody(body: string): string | undefined {
  return /^예금주:\s*(\S+)\s*$/m.exec(body)?.[1];
}

export function amountFromSmsBody(body: string): string | undefined {
  return /^금액:\s*([\d,]+)원\s*$/m.exec(body)?.[1];
}

/**
 * 화면 단계(간소화안). 받는 분 확인 → 금액 → 인증(보낼 내용 요약 + 지문 버튼) → 완료.
 * | # | If (지금 · 행동) | Then |
 * |---|---|---|
 * | S1 | recipient · 다음 | amount |
 * | S2 | amount · 다음(금액 통과) | auth |
 * | S3 | auth · 인증 | done (= 송금 완료 기록 1회) |
 * | S4 | amount · 뒤로 | recipient |
 * | S5 | auth · 취소 | amount(값 유지) |
 * | S6 | 표에 없는 조합 | 그대로 |
 * 앱 닫기(통화 띠 · 닫기 · 완료 확인 · Esc)는 단계가 아니라 호출부 `onClose`다.
 */
export type BankAppStage = "recipient" | "amount" | "auth" | "done";

export type BankAppAction = "next" | "authenticate" | "cancel" | "back";

const NEXT: Partial<Record<BankAppStage, Partial<Record<BankAppAction, BankAppStage>>>> = {
  recipient: { next: "amount" },
  amount: { next: "auth", back: "recipient" },
  auth: { authenticate: "done", cancel: "amount" },
};

/** 위 표(S1~S6). */
export function nextBankAppStage(stage: BankAppStage, action: BankAppAction): BankAppStage {
  return NEXT[stage]?.[action] ?? stage;
}

/** 화면 문구(한 곳에서 관리 — 테스트가 실존 은행명 · 비밀번호 요구 문구를 스캔한다). */
export const BANK_APP_COPY = {
  callPill: "눌러서 통화로 돌아가기",
  close: "닫기",
  /** 문자 속 계좌번호를 누르면 뜨는 메뉴(삼성 메시지 '송금' 버튼 근사). */
  sendToAccount: "송금",
  recipientTitle: "받는 분이 맞는지 확인해 주세요",
  recipientNote: "받는 분 이름이 생각한 사람과 다르면 보내지 마세요.",
  amountTitle: "얼마를 보낼까요?",
  balanceLabel: "출금 가능 금액",
  next: "다음",
  confirmCaution: "보이스피싱 주의 · 모르는 사람이 전화나 문자로 이체를 요구하면 보내기 전에 멈추고 확인하세요.",
  cancel: "취소",
  authBody: "등록된 지문 · 얼굴로 이체를 확인합니다.",
  authButton: "지문 · 얼굴로 인증하고 보내기",
  doneButton: "확인",
} as const;
