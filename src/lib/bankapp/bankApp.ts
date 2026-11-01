// ⭐ BA-1(2026-11-01 · docs/research/in-service-bank-app-design-2026-11-01.md §2 · 사용자 결정 BA0~BA12 "권고대로") — 훈련용 홈 화면 ·
// 가상 "내 은행 앱"의 순수 로직(잎 모듈 · 렌더 하네스가 `@/` 별칭을 풀지 못하므로 상대 경로만 import한다).
//
// 왜: 현실에서는 사이트가 돈을 옮기지 못한다. 피해자는 **자기 은행 앱을 열어** 계좌를 붙여 넣고, 받는 분 이름을 확인하고, 인증한 뒤 보낸다.
// 이 모듈은 그 순간들(앱 열기 · 붙여넣기 · 받는 분 확인 · 인증 · 완료)을 서비스 안에서 재현하는 화면의 상태 규칙이다.
//
// | 항목 | 정책 (BA-1 범위) |
// |---|---|
// | 켜는 조건 | 진단 플래그 `bankapp=1`(`debugFlags.ts` 저장 키) — 플래그가 없으면 홈 버튼 · 계좌 복사 · 은행 앱 모두 0(종전 화면 그대로) |
// | 서버 | **호출 0 · 기록 0**. 이체 기록 · 속은 순간 연결은 BA-2(통화 계좌 문자 이전)에서 한다. 기존 링크 이체 화면은 그대로 둔다 |
// | 입력값 | 받는 계좌 · 금액은 화면 state를 벗어나지 않는다(G138 — 콜백 · 네트워크 · 저장소 0) |
// | 비밀번호 | 숫자 입력 칸 0 — 잠금 해제 · 인증은 지문 · 얼굴 버튼 하나(BA3) |
// | 계좌 복사 | 사용자가 문자 말풍선을 길게 눌러 "계좌번호 복사"를 고를 때만 앱 안 state에 둔다. **기기 클립보드 API는 쓰지 않는다**(실제 기기에 계좌가 남지 않게).
//   인증번호는 여전히 복사할 수 없다(AC-061 그대로) |
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

/** 내 계좌 표기(가상 · 결정적 · 가운데 가림). 실제 계좌 형식을 흉내 내지 않도록 자리 수를 고정한다. */
export function myAccountLabelFor(seed: string): string {
  const n = String(hash(`my-account:${seed}`) % 10000).padStart(4, "0");
  return `입출금 통장 ···· ${n}`;
}

/** 계좌번호 표기 정리(숫자 · 하이픈만 남김). */
export function normalizeAccountNumber(raw: string): string {
  return raw.replace(/[^\d-]/g, "");
}

/** 받는 계좌 칸 판정 — 숫자가 10~16자리면 통과(국내 계좌 자리 수 범위 · 추정). 통과면 undefined. */
export function accountNumberError(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "받는 분 계좌번호를 입력해 주세요.";
  if (digits.length < 10 || digits.length > 16) return "계좌번호를 다시 확인해 주세요.";
  return undefined;
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

/** 문자 말풍선에서 "계좌번호 복사"로 앱 안에 둔 값(서버 문자 문서의 구조화 필드 그대로). */
export type CopiedAccount = {
  bankName: string;
  accountNumber: string;
  /** 서버가 실은 예금주(이체 화면 문자만). 부재 = 은행 조회 결과를 아래 표에서 고른다. */
  holder?: string;
};

/**
 * 받는 분 이름(B5 "예금주 조회" 결과). 붙여 넣은 계좌가 문자에서 온 것이고 서버가 예금주를 실었으면 그 값이다.
 * 그 밖(직접 입력 · 예금주 없음)은 계좌 숫자로 결정적으로 고른 **가상 개인 이름**이다(대포통장은 개인 명의 — 설계 §3.2 W1).
 * ⚠️ BA-4에서 시나리오별 고정 예금주(서버 카탈로그)로 바뀐다 — 이 표는 그 전까지의 자리 값이다. 실존 인물 아님.
 */
export const FALLBACK_HOLDER_NAMES: readonly string[] = ["김민서", "이도윤", "박서연", "최준호", "정하은", "윤지성"];

export function recipientHolderFor(accountNumber: string, copied: CopiedAccount | null): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (copied?.holder && copied.accountNumber.replace(/\D/g, "") === digits) return copied.holder;
  return FALLBACK_HOLDER_NAMES[hash(`holder:${digits}`) % FALLBACK_HOLDER_NAMES.length]!;
}

/**
 * 화면 단계(설계 §2.2). 홈(B0) → 잠금 해제(B1) → 내 계좌(B2) → 받는 계좌(B3) → 금액(B4) → 받는 분 확인(B5) → 인증(B6) → 완료(B7).
 * | # | If (지금 · 행동) | Then |
 * |---|---|---|
 * | S1 | 홈 · 은행 앱 아이콘 | lock |
 * | S2 | lock · 간편 인증 | account |
 * | S3 | account · 이체 | recipient |
 * | S4 | recipient · 다음(계좌 통과) | amount |
 * | S5 | amount · 다음(금액 통과) | confirm |
 * | S6 | confirm · 보내기 | auth |
 * | S7 | auth · 인증 | done |
 * | S8 | confirm · auth의 취소 | amount(값 유지) |
 * | S9 | done · 확인 | account(입력값 폐기 — 새 이체) |
 * | S10 | 앱 안 뒤로(recipient · amount) | 한 단계 앞(account · recipient) |
 */
export type BankAppStage = "home" | "lock" | "account" | "recipient" | "amount" | "confirm" | "auth" | "done";

export type BankAppAction = "open" | "unlock" | "transfer" | "next" | "send" | "authenticate" | "cancel" | "finish" | "back";

const NEXT: Partial<Record<BankAppStage, Partial<Record<BankAppAction, BankAppStage>>>> = {
  home: { open: "lock" },
  lock: { unlock: "account" },
  account: { transfer: "recipient" },
  recipient: { next: "amount", back: "account" },
  amount: { next: "confirm", back: "recipient" },
  confirm: { send: "auth", cancel: "amount" },
  auth: { authenticate: "done", cancel: "amount" },
  done: { finish: "account" },
};

/** 위 표(S1~S10). 표에 없는 조합은 그대로 머문다. */
export function nextBankAppStage(stage: BankAppStage, action: BankAppAction): BankAppStage {
  return NEXT[stage]?.[action] ?? stage;
}

/** 화면 문구(한 곳에서 관리 — 테스트가 실존 은행명 · 비밀번호 요구 문구를 스캔한다). */
export const BANK_APP_COPY = {
  homeLabel: "홈",
  homeAria: "홈 화면으로",
  callPill: "눌러서 통화로 돌아가기",
  appMessages: "메시지",
  appPhone: "전화",
  appCamera: "카메라",
  appSettings: "설정",
  lockTitle: "간편 인증으로 로그인",
  lockBody: "등록된 지문 · 얼굴로 로그인합니다.",
  lockButton: "지문 · 얼굴로 로그인",
  balanceLabel: "출금 가능 금액",
  transferButton: "이체",
  historyButton: "내역",
  recipientTitle: "누구에게 보낼까요?",
  bankLabel: "받는 분 은행",
  accountLabel: "계좌번호",
  pasteLabel: "복사한 계좌번호 붙여넣기",
  amountTitle: "얼마를 보낼까요?",
  next: "다음",
  confirmCaution: "보이스피싱 주의 · 모르는 사람이 전화나 문자로 이체를 요구하면 보내기 전에 멈추고 확인하세요.",
  send: "보내기",
  cancel: "취소",
  authTitle: "본인 인증",
  authBody: "등록된 간편 인증(지문 · 얼굴)으로 이체를 확인합니다.",
  authButton: "인증하고 이체하기",
  doneButton: "확인",
  copyAccount: "계좌번호 복사",
  copied: "계좌번호를 복사했습니다.",
} as const;
