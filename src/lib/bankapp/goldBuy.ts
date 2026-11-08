// ⭐ 2026-11-07(Edge 재시험 2 S7 — 기관 고급 금 구매형이 "인출해서 실물 금으로 교체해 제출"을 말로만 지시하고 끊음 · 사용자 결정 D-G1 ~ D-G6 "앱 안 화면으로 바꾸기") —
// 앱 안 금 거래소 구매 화면(`MessengerFakeLanding.tsx` `GoldBuyMockup`)의 순수 로직. 잎 모듈(값 import 0 — 렌더 하네스 · 테스트 러너가 확장자 없는 상대
// import를 풀지 못한다 · `voucher.ts`와 같은 관례).
//
// | 항목 | 정책 |
// |---|---|
// | 거래소 | 가상명 "해담골드"(서버 `functions/src/scenarios/mockScreens.ts` `gold-buy` · `asset-gold-buy` 문구와 같은 글자 — 웹 검색 2026-11-07 일치 0) |
// | 상품 · 시세 | 골드바 10g · 37.5g(10돈) · 100g · 1kg × 1~`GOLD_MAX_QUANTITY`개. 가상 시세 1g `GOLD_PRICE_PER_GRAM`(⚠️ 판단값 — 2026-10 KRX 금시장 종가 1g 약 17.9만 원 · 2026-08 약 20만 원 보도 사이) |
// | 결제 | 내 계좌 이체(출금 계좌 선택 · 생체 인증 — 이체 화면과 같은 시트) · 1회 한도 `GOLD_PAYMENT_LIMIT`(훈련용 이체 화면의 1회 이체 한도와 같은 값) |
// | 고액 구매 확인 | 구매 목적 + "수사기관 · 금융감독원 안내로 금을 사는가" 질문(⚠️ 판단값 — 거래소의 확인 질문 절차 자체는 미확인 · 기사는 직원이 의심해 신고했다고만 쓴다). "예" = 구매 보류 |
// | 저장 · 전송 | 상품 · 수량 · 금액 · 답은 이 모듈의 메모리 표와 화면 state를 벗어나지 않는다(G138 — 네트워크 · 저장소 0). 기록은 "결제했다" · "보류됐다" 사실 하나씩 |
// | 수령 | 매장 위치 · 주소 0(AC-102 (d)) · 주문 확인 · 완료 화면에 매장 방문 수령 · 신분증 안내 0(2026-11-08 사용자 결정 — 출금 예약 §15.4 (c)와 같게 · 완료 화면은 "구매 완료" + 보증서 번호까지) |

export const GOLD_SHOP_NAME = "해담골드";

/** 가상 시세(원/g · 판단값). */
export const GOLD_PRICE_PER_GRAM = 190_000;

export type GoldProduct = { id: string; grams: number; label: string };

export const GOLD_PRODUCTS: readonly GoldProduct[] = [
  { id: "bar-10g", grams: 10, label: "골드바 10g" },
  { id: "bar-37g", grams: 37.5, label: "골드바 37.5g (10돈)" },
  { id: "bar-100g", grams: 100, label: "골드바 100g" },
  { id: "bar-1kg", grams: 1000, label: "골드바 1kg" },
];

export const GOLD_MAX_QUANTITY = 10;
/** 1회 결제 한도(원) — 계좌 이체 1회 한도(훈련용 이체 화면 `TRANSFER_LIMIT`와 같은 값 · 잎 모듈이라 값을 옮겨 적었다). */
export const GOLD_PAYMENT_LIMIT = 10_000_000;

/** 고액 구매 확인 — 구매 목적 선택지. */
export const GOLD_PURPOSES: readonly string[] = ["개인 투자", "선물", "자산 보관", "기타"];

/** "1,900,000원". */
export function goldWon(value: number): string {
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

/** 상품 1개 가격(원 · 시세 × 중량). */
export function goldProductPrice(product: GoldProduct): number {
  return Math.round(product.grams * GOLD_PRICE_PER_GRAM);
}

export function findGoldProduct(id: string | undefined): GoldProduct | undefined {
  return GOLD_PRODUCTS.find((product) => product.id === id);
}

/** 상품 · 수량 · 한도 판정. 통과 = undefined. */
export function goldOrderError(productId: string | undefined, quantity: number): string | undefined {
  const product = findGoldProduct(productId);
  if (!product) return "상품을 골라 주세요.";
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > GOLD_MAX_QUANTITY) return `수량은 1개부터 ${GOLD_MAX_QUANTITY}개까지 고를 수 있습니다.`;
  if (goldProductPrice(product) * quantity > GOLD_PAYMENT_LIMIT) return `계좌 이체 1회 한도(${goldWon(GOLD_PAYMENT_LIMIT)})를 넘었습니다. 수량을 줄여 주세요.`;
  return undefined;
}

/** 고액 구매 확인 답 판정: 둘 다 골라야 하고, 수사기관 안내가 "예"면 보류. */
export type GoldCheckResult = "incomplete" | "held" | "proceed";
export function goldCheckResult(purpose: string | undefined, agencyRequested: boolean | undefined): GoldCheckResult {
  if (purpose === undefined || !GOLD_PURPOSES.includes(purpose) || agencyRequested === undefined) return "incomplete";
  return agencyRequested ? "held" : "proceed";
}

/** FNV-1a 32비트(`voucher.ts`와 같은 식 — 잎 모듈이라 복사했다). */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** 품질 보증서 번호(결정적 · "HD-" + 8자리). `seed` = 세션 열쇠 · `serial` = 그 세션의 몇 번째 주문인가. */
export function goldWarrantyFor(seed: string, serial: number): string {
  return `HD-${String(fnv1a(`gold-warranty:${seed}:${serial}`) % 100_000_000).padStart(8, "0")}`;
}

export type GoldPurchase = { productId: string; quantity: number; total: number; warranty: string; purchasedAt: Date };

const purchases = new Map<string, GoldPurchase>();
const orderCount = new Map<string, number>();

/** 구매를 기록한다(메모리 표만 — 서버 · 저장소 0). */
export function recordGoldPurchase(ledgerKey: string, landingId: string, productId: string, quantity: number, purchasedAt: Date): GoldPurchase {
  const product = findGoldProduct(productId);
  const serial = orderCount.get(ledgerKey) ?? 0;
  orderCount.set(ledgerKey, serial + 1);
  const purchase = { productId, quantity, total: product ? goldProductPrice(product) * quantity : 0, warranty: goldWarrantyFor(ledgerKey, serial), purchasedAt };
  purchases.set(`${ledgerKey}:${landingId}`, purchase);
  return purchase;
}

/** 이 세션 · 이 화면의 마지막 구매(없으면 undefined). */
export function lastGoldPurchase(ledgerKey: string, landingId: string): GoldPurchase | undefined {
  return purchases.get(`${ledgerKey}:${landingId}`);
}

/** 화면 문구(서버 카탈로그의 headline · bodyLines · submitLabel · successHeadline · issuerLabel은 `CREDENTIAL_LANDING_COPY`가 같은 글자로 갖는다 — 드리프트 테스트). */
export const GOLD_COPY = {
  priceNote: "오늘 판매가 1g",
  quantityUnit: "개",
  totalLabel: "결제 금액",
  confirmHeadline: "주문 정보를 확인해 주세요",
  productRow: "상품",
  sellerRow: "판매처",
  payFromRow: "결제 계좌",
  amountRow: "결제 금액",
  checkHeading: "고액 구매 확인",
  checkLead: "고액으로 금을 구매하시는 고객께 아래 내용을 여쭙습니다.",
  purposeLabel: "구매 목적",
  agencyQuestion: "검찰 · 경찰 · 금융감독원 등에서 연락을 받고 금을 사라는 안내를 받으셨나요?",
  yes: "예",
  no: "아니요",
  checkError: "고액 구매 확인 항목을 모두 골라 주세요.",
  pay: "결제",
  cancel: "취소",
  heldHeadline: "구매가 보류되었습니다",
  heldLines: [
    "검찰 · 경찰 · 금융감독원은 수사나 조사를 이유로 금 구매를 요구하지 않습니다.",
    "누군가의 안내로 구매하시는 중이라면 통화를 끊고 112 또는 1332로 먼저 확인해 주세요.",
  ],
  heldBack: "주문 화면으로",
  warrantyLabel: "품질 보증서 번호",
  paidLabel: "결제",
} as const;
