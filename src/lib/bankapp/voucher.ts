// ⭐ 2026-11-07(Edge 시험 판 12 — 검찰 고급 상품권형이 "문화상품권을 구매하신 뒤 핀 번호를 불러 주시면"으로 앱 밖 구매를 요구 · 사용자 결정 "앱 안 화면 추가") —
// 앱 안 상품권 구매 화면(`MessengerFakeLanding.tsx` `VoucherPurchaseMockup`)의 순수 로직. 잎 모듈(값 import 0 — 렌더 하네스 · 테스트 러너가 확장자 없는 상대
// import를 풀지 못한다 · `bankApp.ts`와 같은 관례).
//
// | 항목 | 정책 |
// |---|---|
// | 상품권 · 판매처 | 가상명 "다솜 문화상품권" · "한올기프트"(서버 `functions/src/scenarios/mockScreens.ts` `voucher-purchase` 문구와 같은 글자 — 웹 검색 2026-11-07 겹침 0) |
// | 권종 · 수량 | 아래 `VOUCHER_DENOMINATIONS` 중 하나 × 1~`VOUCHER_MAX_QUANTITY`장 · 1회 구매 한도 `VOUCHER_PURCHASE_LIMIT`(⚠️ 판단값 — 실제 판매처 한도는 미확인) |
// | 핀 번호 | 12자리 4-4-4(실제 문화상품권 핀 16 · 18자리와 다른 형식 — 추정 · 공개 안내 기준) · 세션 열쇠 + 장 번호의 해시(결정적 · 난수 0) |
// | 저장 · 전송 | 핀 · 권종 · 수량은 이 모듈의 메모리 표와 화면 state를 벗어나지 않는다(G138 — 네트워크 · 저장소 0 · 간편 비밀번호 키패드와 같은 원칙). 기록은 "결제했다"는 사실 하나 |
// | 다시 열기 | 같은 세션 · 같은 화면이면 마지막 구매 내역(핀 카드)을 다시 보여 준다(탭을 닫으면 사라진다) — 통화하며 문자함을 오가도 번호를 다시 볼 수 있게 |

export const VOUCHER_BRAND = "다솜 문화상품권";
export const VOUCHER_SELLER = "한올기프트";

/** 권종(원). */
export const VOUCHER_DENOMINATIONS: readonly number[] = [10_000, 30_000, 50_000, 100_000];
export const VOUCHER_MAX_QUANTITY = 10;
/** 1회 구매 한도(원 · 판단값). */
export const VOUCHER_PURCHASE_LIMIT = 1_000_000;

/** FNV-1a 32비트(`bankApp.ts` `hash`와 같은 식 — 잎 모듈이라 복사했다). */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** "100,000원". */
export function voucherWon(value: number): string {
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

/** "10만원권" · "1만원권" 권종 이름. */
export function denominationLabel(value: number): string {
  return value % 10_000 === 0 ? `${value / 10_000}만원권` : `${voucherWon(value)}권`;
}

/** 결제 금액 · 한도 판정. 통과 = undefined. */
export function voucherOrderError(denomination: number | undefined, quantity: number): string | undefined {
  if (denomination === undefined || !VOUCHER_DENOMINATIONS.includes(denomination)) return "권종을 골라 주세요.";
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > VOUCHER_MAX_QUANTITY) return `수량은 1장부터 ${VOUCHER_MAX_QUANTITY}장까지 고를 수 있습니다.`;
  if (denomination * quantity > VOUCHER_PURCHASE_LIMIT) return `1회 구매 한도(${voucherWon(VOUCHER_PURCHASE_LIMIT)})를 넘었습니다.`;
  return undefined;
}

/** 사람이 "가짜 같다"고 느끼는 묶음(한 숫자 반복 · 오름 · 내림 연속)인가(`functions/src/scenarios/sessionOtp.ts` `isTrivialOtp`와 같은 판정). */
function isTrivialGroup(group: string): boolean {
  if (/^(\d)\1+$/.test(group)) return true;
  const digits = group.split("").map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]!);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

/** 핀 번호 1장(12자리 4-4-4 · 결정적). `seed` = 세션 열쇠 · `serial` = 그 세션의 몇 번째 장인가. */
export function voucherPinFor(seed: string, serial: number): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g += 1) {
    for (let salt = 0; ; salt += 1) {
      const group = String(fnv1a(`voucher-pin:${seed}:${serial}:${g}:${salt}`) % 10_000).padStart(4, "0");
      if (!isTrivialGroup(group)) {
        groups.push(group);
        break;
      }
    }
  }
  return groups.join("-");
}

export type VoucherPurchase = { denomination: number; quantity: number; pins: string[]; purchasedAt: Date };

const purchases = new Map<string, VoucherPurchase>();
const issuedCount = new Map<string, number>();

/** 구매를 기록하고 핀을 발급한다(메모리 표만 — 서버 · 저장소 0). 같은 세션에서 다시 사면 이어지는 장 번호로 새 핀을 만든다. */
export function recordVoucherPurchase(ledgerKey: string, landingId: string, denomination: number, quantity: number, purchasedAt: Date): VoucherPurchase {
  const issued = issuedCount.get(ledgerKey) ?? 0;
  const pins = Array.from({ length: quantity }, (_, i) => voucherPinFor(ledgerKey, issued + i));
  issuedCount.set(ledgerKey, issued + quantity);
  const purchase = { denomination, quantity, pins, purchasedAt };
  purchases.set(`${ledgerKey}:${landingId}`, purchase);
  return purchase;
}

/** 이 세션 · 이 화면의 마지막 구매(없으면 undefined). */
export function lastVoucherPurchase(ledgerKey: string, landingId: string): VoucherPurchase | undefined {
  return purchases.get(`${ledgerKey}:${landingId}`);
}

/** 화면 문구(서버 카탈로그 `voucher-purchase`의 headline · bodyLines · submitLabel · successHeadline · issuerLabel과 같은 글자 — 드리프트 테스트). */
/** ⭐ 2026-11-08 웹 안의 웹 PR-3(시안 F · 사용자 승인 계획) — 상품권 몰 첫 화면의 사이트 장식 문구(새 문구). 판정 · 금액 · 핀 발급에 쓰지 않는다. */
export const VOUCHER_SITE_COPY = {
  instantBadge: "구매 즉시 발송",
  cardKind: "모바일 상품권",
  cardPin: "핀 번호 발급",
} as const;

export const VOUCHER_COPY = {
  denominationLabel: "권종",
  quantityLabel: "수량",
  totalLabel: "결제 금액",
  next: "다음",
  confirmHeadline: "결제 정보를 확인해 주세요",
  productRow: "상품",
  sellerRow: "판매처",
  payFromRow: "결제 계좌",
  amountRow: "결제 금액",
  // 실제 상품권 판매처가 결제 전에 띄우는 일반 주의 자리(문구는 판매처마다 다르다 — 추정). 정답을 가르치는 문장이 아니라 판매처가 늘 띄우는 주의다.
  notice: "상품권 핀 번호는 현금과 같습니다 · 핀 번호를 다른 사람에게 알려 주면 바로 사용될 수 있습니다.",
  pay: "결제",
  cancel: "취소",
  pinHeading: "상품권 핀 번호",
  pinNote: "핀 번호를 입력하면 바로 충전 · 사용됩니다.",
  issuedLabel: "발행",
  validLabel: "유효기간",
  validValue: "발행일로부터 5년",
} as const;
