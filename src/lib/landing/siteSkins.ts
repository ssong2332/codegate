// ⭐ 2026-11-08 웹 안의 웹 PR-2(사용자 승인 계획 · 시안 2절 · 4절 · 5절) — 가짜 사이트 랜딩의 **사이트 계열 데이터**.
//
// 지금은 랜딩 35종이 모두 `LANDING_PAGE_TOKENS` 한 벌(남색 머리띠 · 회색 버튼)이다. 이 모듈은 랜딩마다 그 사이트가 속한 계열
// (금 거래소 · 내 은행 · 기관 · 기관형 이체 · 환급 · 택배 · 상품권 · 대출 · 송금 요청 · 앱 설치)과 계열의 색 · 로고 모양 · 꼬리말 값을 정한다.
// ⛔ 값만 둔다(컴포넌트 0). 화면에 입히는 것은 PR-3(구매형) · PR-4(안내형)다. `LANDING_PAGE_TOKENS`는 지우지 않고 기본(폴백)으로 남는다.
// ⛔ 꼬리말 값은 실재 사업자와 겹칠 수 없는 임의 값이다(사용자 결정 O5 · 시안 4절 판정표 — `siteSkins.test.ts`가 규칙마다 단언 · 역검증):
//    사업자등록번호 = 앞 3자리 101 미만 · 가운데 00 · 끝자리 검증식 불일치 / 전화 = 지역번호 뒤 국번 첫 자리 0(`inCallSms.ts` 규칙) ·
//    저장소의 다른 번호와 겹치지 않음 / 신고번호 · 주소 = 실재하지 않는 지명 '누리달' / 이메일 = `.invalid`.
// ⛔ 꼬리말 **이름**은 여기 두지 않는다 — 렌더 때 그 랜딩의 카탈로그 `issuerLabel`(서버 정본)을 쓴다(새 상호 0).
// ⛔ 세션 중 화면 금지 낱말(G437) · 실존 기관 · 회사 이름 · 8자리 이상 숫자열 0. 계열 설명은 주석에만 둔다.
// ⚠️ 잎 모듈(값 import 0) — 렌더 하네스가 CommonJS require로 불러 `@/` 별칭을 풀지 못한다.

/** 계열 — 시안 5절의 "제안 계열" 10개. */
export type SiteFamilyId =
  | "gold" // E 금 거래소
  | "bank" // I 내 은행(출금 예약)
  | "agency" // A 수사 · 공공기관
  | "agency-transfer" // D2 기관형 이체
  | "refund" // B 환급
  | "parcel" // C 택배 · 통관
  | "gift" // F 상품권
  | "loan" // G 대출
  | "send" // D1 송금 요청
  | "install"; // H 앱 설치

/** 로고 자리 그림(선 아이콘 · 실제 휘장 · 상표 0). 그리는 것은 PR-3 · PR-4. */
export type SiteLogoMark = "seal" | "ring" | "scale" | "shield" | "agency" | "box" | "bow" | "leaf" | "diamond" | "app";

/** 로고 글꼴 결 — 본문은 폰 서체 그대로(G630). 로고 글자에만 쓴다. */
export type SiteLogoFont = "serif" | "black" | "rounded" | "sans";

/** 꼬리말 값(이름 제외 — 이름은 카탈로그 `issuerLabel`). 없는 칸은 그리지 않는다. */
export type SiteFooter = {
  representative?: string;
  businessNumber?: string;
  /** 통신판매업 신고번호(쇼핑 계열). */
  mailOrderNumber?: string;
  /** 대부업 등록번호(대출 계열). */
  lenderNumber?: string;
  address?: string;
  phone: string;
  /** 전화 앞말 — 회사형 "고객센터" · 기관형 "대표 전화". */
  phoneLabel: "고객센터" | "대표 전화";
  email?: string;
};

export type SiteSkin = {
  id: SiteFamilyId;
  /** 사이트 색(진행 막대 · 강조선). */
  accent: string;
  pageBg: string;
  text: string;
  headerBg: string;
  /** 로고 글자 색. */
  headerText: string;
  /** true = 로고가 큰 글씨(18px 이상 굵게)라 대비 3:1 기준(WCAG 큰 글자). 시안 "주황은 큰 글씨 로고에만". */
  headerLargeTextOnly?: true;
  /** 머리 위 · 아래 띠(기관 안내 띠 · 금 시세 띠). */
  band?: { bg: string; text: string };
  /** 짙은 머리 위 강조색(대출 진행 칩). */
  highlight?: string;
  buttonBg: string;
  buttonText: string;
  footerBg: string;
  footerText: string;
  logoMark: SiteLogoMark;
  logoFont: SiteLogoFont;
  /** 로고 아래 작은 영문 줄(금 거래소만). */
  logoSub?: string;
  /** null = 꼬리말 없음(송금 링크 페이지). */
  footer: SiteFooter | null;
};

export const SITE_SKINS: Readonly<Record<SiteFamilyId, SiteSkin>> = {
  gold: {
    id: "gold",
    accent: "#D9B45A",
    pageBg: "#FAF7F0",
    text: "#1F1A12",
    headerBg: "#15120D",
    headerText: "#E2C06A",
    band: { bg: "#221D14", text: "#E9DDBE" },
    buttonBg: "#D9B45A",
    buttonText: "#1A1408",
    footerBg: "#1C1812",
    footerText: "#BDB092",
    logoMark: "seal",
    logoFont: "serif",
    logoSub: "HAEDAM GOLD",
    footer: {
      representative: "한도윤",
      businessNumber: "072-00-38415",
      mailOrderNumber: "제2026-누리달-0371호",
      address: "누리달시 금빛구 윤슬로 112",
      phone: "02-0791-4406",
      phoneLabel: "고객센터",
      // PR-3 — 주소창 호스트(`haedam-gold.invalid`)를 품지 않는 도메인(렌더 게이트 [T190-2] "호스트는 주소창으로만" 신호 보존).
      email: "help@haedamgold.invalid",
    },
  },
  bank: {
    id: "bank",
    accent: "#1E3A5F",
    pageBg: "#F4F6FA",
    text: "#111827",
    headerBg: "#FFFFFF",
    headerText: "#1E3A5F",
    buttonBg: "#1E3A5F",
    buttonText: "#FFFFFF",
    footerBg: "#F4F6FA",
    footerText: "#4B5563",
    logoMark: "ring",
    logoFont: "black",
    footer: {
      businessNumber: "057-00-49152",
      address: "누리달시 금빛구 한결대로 1",
      phone: "02-0739-5520",
      phoneLabel: "고객센터",
    },
  },
  agency: {
    id: "agency",
    accent: "#14254A",
    pageBg: "#FFFFFF",
    text: "#111111",
    headerBg: "#FFFFFF",
    headerText: "#111111",
    band: { bg: "#14254A", text: "#DCE3F2" },
    buttonBg: "#14254A",
    buttonText: "#FFFFFF",
    footerBg: "#EEF1F5",
    footerText: "#3F4A5A",
    logoMark: "scale",
    logoFont: "serif",
    footer: { address: "누리달시 해오름구 별무리로 27", phone: "02-0716-5530", phoneLabel: "대표 전화" },
  },
  "agency-transfer": {
    id: "agency-transfer",
    accent: "#14254A",
    pageBg: "#FFFFFF",
    text: "#111111",
    headerBg: "#FFFFFF",
    headerText: "#111111",
    band: { bg: "#14254A", text: "#DCE3F2" },
    buttonBg: "#14254A",
    buttonText: "#FFFFFF",
    footerBg: "#EEF1F5",
    footerText: "#3F4A5A",
    logoMark: "shield",
    logoFont: "serif",
    footer: { address: "누리달시 해오름구 별무리로 31", phone: "02-0742-6618", phoneLabel: "대표 전화" },
  },
  refund: {
    id: "refund",
    accent: "#0B5CAD",
    pageBg: "#F2F6FB",
    text: "#14213D",
    headerBg: "#FFFFFF",
    headerText: "#0B3F78",
    buttonBg: "#0B5CAD",
    buttonText: "#FFFFFF",
    footerBg: "#F2F6FB",
    footerText: "#46607F",
    logoMark: "agency",
    logoFont: "sans",
    footer: { address: "누리달시 해오름구 별무리로 19", phone: "044-0832-1047", phoneLabel: "대표 전화" },
  },
  parcel: {
    id: "parcel",
    accent: "#E8590C",
    pageBg: "#FFFFFF",
    text: "#1F1F1F",
    headerBg: "#FFFFFF",
    headerText: "#E8590C",
    headerLargeTextOnly: true,
    buttonBg: "#B4410A",
    buttonText: "#FFFFFF",
    footerBg: "#262626",
    footerText: "#C9C9C9",
    logoMark: "box",
    logoFont: "black",
    footer: {
      representative: "강태오",
      businessNumber: "081-00-27364",
      address: "누리달시 너울구 물류단지로 9",
      phone: "031-0628-1175",
      phoneLabel: "고객센터",
    },
  },
  gift: {
    id: "gift",
    accent: "#C2255C",
    pageBg: "#FFF8FA",
    text: "#2B1720",
    headerBg: "#FFFFFF",
    headerText: "#C2255C",
    buttonBg: "#C2255C",
    buttonText: "#FFFFFF",
    footerBg: "#FFF8FA",
    footerText: "#6E4B58",
    logoMark: "bow",
    logoFont: "rounded",
    footer: {
      representative: "서은재",
      businessNumber: "064-00-51927",
      mailOrderNumber: "제2026-누리달-0528호",
      address: "누리달시 해오름구 별무리로 27, 4층",
      phone: "02-0784-2213",
      phoneLabel: "고객센터",
    },
  },
  loan: {
    id: "loan",
    accent: "#0E5E52",
    pageBg: "#F2F6F5",
    text: "#10231F",
    headerBg: "#0E5E52",
    headerText: "#FFFFFF",
    highlight: "#C8F169",
    buttonBg: "#0E5E52",
    buttonText: "#FFFFFF",
    footerBg: "#F2F6F5",
    footerText: "#4F625E",
    logoMark: "leaf",
    logoFont: "black",
    footer: {
      representative: "문가람",
      businessNumber: "093-00-16238",
      lenderNumber: "2026-누리달-0042",
      address: "누리달시 금빛구 윤슬로 88",
      phone: "02-0795-2084",
      phoneLabel: "고객센터",
    },
  },
  send: {
    id: "send",
    accent: "#0A7C66",
    pageBg: "#FFFFFF",
    text: "#191F28",
    headerBg: "#FFFFFF",
    headerText: "#0A7C66",
    buttonBg: "#0A7C66",
    buttonText: "#FFFFFF",
    footerBg: "#FFFFFF",
    footerText: "#4E5968",
    logoMark: "diamond",
    logoFont: "sans",
    footer: null,
  },
  install: {
    id: "install",
    accent: "#2457C5",
    pageBg: "#F2F4F7",
    text: "#121826",
    headerBg: "#FFFFFF",
    headerText: "#121826",
    buttonBg: "#2457C5",
    buttonText: "#FFFFFF",
    footerBg: "#F2F4F7",
    footerText: "#4B5565",
    logoMark: "app",
    logoFont: "sans",
    footer: { businessNumber: "038-00-65174", phone: "02-0756-3391", phoneLabel: "고객센터" },
  },
};

/**
 * 랜딩 35종 → 계열(시안 5절 표 그대로). 키 = 서버 카탈로그(`functions/src/scenarios/mockScreens.ts`)의 landingId 전수 —
 * `siteSkins.test.ts`가 양방향(빠짐 0 · 남는 키 0)으로 대조한다.
 */
export const SITE_FAMILY_BY_LANDING: Readonly<Record<string, SiteFamilyId>> = {
  "parcel-redelivery": "parcel",
  "parcel-install": "install",
  "subsidy-install": "install",
  "loan-refinance-apply": "loan",
  "loan-check-app-install": "install",
  "loan-repay-transfer": "send",
  "tax-refund-claim": "refund",
  "tax-refund-fee-transfer": "send",
  "courier-customs-check": "parcel",
  "courier-fee-transfer": "send",
  "courier-safe-transfer": "agency-transfer",
  "safe-account-transfer": "agency-transfer",
  "loan-apply": "loan",
  "loan-safe-transfer": "agency-transfer",
  "gold-buy": "gold",
  "cash-withdraw": "bank",
  "card-relief-transfer": "agency-transfer",
  "card-guard-app-install": "install",
  "card-remote-support-install": "install",
  "card-safe-transfer": "agency-transfer",
  "card-delivery-app-install": "install",
  "asset-custody-apply": "agency",
  "asset-deposit-transfer": "agency-transfer",
  "asset-gold-buy": "gold",
  "asset-cash-withdraw": "bank",
  "case-record-view": "agency",
  "asset-check-site": "agency",
  "asset-check-wallet": "agency",
  "voucher-purchase": "gift",
  "blackmail-hush-transfer": "send",
  "protect-account-transfer": "agency-transfer",
  "child-insurance-install": "install",
  "child-bank-transfer": "send",
  "friend-bank-transfer": "send",
  "kidnap-ransom-transfer": "send",
};

/**
 * 판정표(정확 일치 조회만 — 문자열로 계열을 추론하지 않는다):
 * | landingId                    | 결과                                                       |
 * | 매핑표에 있음                 | 그 계열 스킨                                                |
 * | 없음 · 부재(옛 문서 · 범용 폴백) | undefined → 호출부가 기본 `LANDING_PAGE_TOKENS`(지금 화면)    |
 */
export function siteSkinFor(landingId?: string): SiteSkin | undefined {
  if (landingId === undefined || !Object.prototype.hasOwnProperty.call(SITE_FAMILY_BY_LANDING, landingId)) return undefined;
  return SITE_SKINS[SITE_FAMILY_BY_LANDING[landingId]];
}

/** 꼬리말 한 칸씩(그리는 순서) — 이름 줄은 호출부가 앞에 붙인다. 테스트가 숫자열 · 금지 낱말 검사에 같이 쓴다. */
export function footerLines(footer: SiteFooter): string[] {
  const lines: string[] = [];
  const head = [
    footer.representative ? `대표 ${footer.representative}` : "",
    footer.businessNumber ? `사업자등록번호 ${footer.businessNumber}` : "",
  ].filter(Boolean);
  if (head.length > 0) lines.push(head.join(" · "));
  if (footer.mailOrderNumber) lines.push(`통신판매업 ${footer.mailOrderNumber}`);
  if (footer.lenderNumber) lines.push(`대부업 등록번호 ${footer.lenderNumber}`);
  lines.push([footer.address, `${footer.phoneLabel} ${footer.phone}`].filter(Boolean).join(" · "));
  if (footer.email) lines.push(footer.email);
  return lines;
}

// ── ⭐ 2026-11-08 웹 안의 웹 PR-3(구매형 E 금 · F 상품권 · I 내 은행 출금 · G 대출 — 시안 E · F · I · G) ─────────────────
// 구매 화면 4종이 계열 기본값(위 `SITE_SKINS`) 밖에서 더 쓰는 색. 값만 둔다(그리는 것은 `MessengerFakeLanding.tsx`의 구매 화면).
// ⛔ 시안 값 중 비텍스트 대비 3:1 미만이던 테두리 3개(금 카드 #E7DEC8 · 은행 형태 칸 #9CA3AF · 상품권 칩 #D9A9BB)는 더 진한 값으로 바꿨다
//    (판정표 P C1 — `siteSkins.test.ts` [PR-3 대비]가 전부 잰다).

/** 구매 화면 계열(판정표 P1 ~ P4). */
export type PurchaseFamilyId = "gold" | "bank" | "gift" | "loan";

export type PurchaseSiteTokens = {
  /** 입력 카드 · 선택지 바탕. */
  surface: string;
  /** 보조 글자(본문 · 칸 설명) — `surface` · 계열 `pageBg` 둘 다 위에서 4.5:1. */
  muted: string;
  /** 선택지 · 입력 칸 테두리(비텍스트 3:1 — `surface` · `pageBg` 위). */
  border: string;
  /** 고른 선택지 테두리(2px) · 바탕 · 글자. */
  selectedBorder: string;
  selectedBg: string;
  selectedText: string;
  /** 안내 · 주의 상자 바탕(보조 글자 · 본문 글자 4.5:1). */
  noteBg: string;
  /** 금액 칸 아래 한글 단위 · 강조 글자(`surface` · `pageBg` 위 4.5:1). */
  hint: string;
  /** 배지(금 = 보증서 · 상품권 = 즉시 발송). */
  badge?: { bg: string; text: string };
  /** 아래 고정 결제 막대(금 · 상품권 — 판정표 B1). */
  payBar?: { bg: string; text: string; amount: string; error: string; border?: string };
  /** 대출 머리 아래 진행 칩(꺼진 칩). 켜진 칩 = 계열 `highlight` 바탕 위 `heroChipOnText`. */
  heroChipOff?: { bg: string; text: string };
  heroChipOnText?: string;
  /** 큰 제목 영역 보조 글자(금 = 연한 바탕 위 영문 줄 · 대출 = 짙은 머리 위). */
  heroMuted?: string;
  /** 머리 로고 아래 작은 줄(금 영문 · 은행 메뉴 이름) — 계열 `headerBg` 위. */
  headerSub?: string;
};

export const PURCHASE_SITE_TOKENS: Readonly<Record<PurchaseFamilyId, PurchaseSiteTokens>> = {
  gold: {
    surface: "#FFFFFF",
    muted: "#5E5236",
    border: "#9C8A5C",
    selectedBorder: "#7A5E22",
    selectedBg: "#FFF8E6",
    selectedText: "#1F1A12",
    noteBg: "#F3ECDB",
    hint: "#7A5E22",
    badge: { bg: "#F6EBCB", text: "#6E5212" },
    payBar: { bg: "#15120D", text: "#CDBF9C", amount: "#F0D48A", error: "#FF9C8F" },
    heroMuted: "#7A6A45",
    headerSub: "#A99260",
  },
  bank: {
    surface: "#FFFFFF",
    muted: "#4B5563",
    border: "#6B7280",
    selectedBorder: "#1E3A5F",
    selectedBg: "#EEF2F7",
    selectedText: "#1E3A5F",
    noteBg: "#EEF2F7",
    hint: "#1E3A5F",
    headerSub: "#4B5563",
  },
  gift: {
    surface: "#FFFFFF",
    muted: "#6E4B58",
    border: "#B5638A",
    selectedBorder: "#C2255C",
    selectedBg: "#FFF0F5",
    selectedText: "#2B1720",
    noteBg: "#FFF0F5",
    hint: "#C2255C",
    badge: { bg: "#E3F5E8", text: "#1E6B34" },
    payBar: { bg: "#FFFFFF", text: "#6E4B58", amount: "#2B1720", error: "#C0262D", border: "#F3D9E3" },
  },
  loan: {
    surface: "#FFFFFF",
    muted: "#4F625E",
    border: "#7C918C",
    selectedBorder: "#0E5E52",
    selectedBg: "#0E5E52",
    selectedText: "#FFFFFF",
    noteBg: "#E4EFEC",
    hint: "#0E5E52",
    heroChipOff: { bg: "#2B7468", text: "#E6F4F0" },
    heroChipOnText: "#0E3A33",
    heroMuted: "#D5ECE7",
  },
};

/** 판정표 P1 ~ P4 — 랜딩 id가 구매 계열이면 그 계열(정확 일치 조회 · `siteSkinFor`). 그 밖 = undefined. */
export function purchaseFamilyOf(landingId?: string): PurchaseFamilyId | undefined {
  const id = siteSkinFor(landingId)?.id;
  return id === "gold" || id === "bank" || id === "gift" || id === "loan" ? id : undefined;
}

/**
 * 구매 화면 단계(주문 확인 · 문진표 · 보류 · 완료 등)가 쓰는 색 한 벌 — 키는 `LANDING_PAGE_TOKENS`(`skinTokens.ts`)와 같은 이름이라 단계 코드가
 * 기본 토큰 대신 이것을 받으면 그대로 계열 색이 된다(흐름 코드 무변경). 오류 글자는 기본 토큰과 같은 빨강(모든 계열 바탕 위 5:1 이상).
 */
export type PurchasePalette = {
  pageBg: string;
  headline: string;
  body: string;
  inputBorder: string;
  inputBg: string;
  inputText: string;
  submitBg: string;
  submitText: string;
  issuerFooter: string;
  fieldReadonlyBg: string;
  errorText: string;
  hintText: string;
  selectedBorder: string;
  selectedBg: string;
  selectedText: string;
};

export const PURCHASE_ERROR_TEXT = "#C0262D";

export function purchasePalette(family: PurchaseFamilyId): PurchasePalette {
  const skin = SITE_SKINS[family];
  const t = PURCHASE_SITE_TOKENS[family];
  return {
    pageBg: skin.pageBg,
    headline: skin.text,
    body: t.muted,
    inputBorder: t.border,
    inputBg: t.surface,
    inputText: skin.text,
    submitBg: skin.buttonBg,
    submitText: skin.buttonText,
    issuerFooter: t.muted,
    fieldReadonlyBg: t.noteBg,
    errorText: PURCHASE_ERROR_TEXT,
    hintText: t.hint,
    selectedBorder: t.selectedBorder,
    selectedBg: t.selectedBg,
    selectedText: t.selectedText,
  };
}

// ── ⭐ 2026-11-08 웹 안의 웹 PR-4(안내형 A 기관 · B 환급 · C 택배 · H 설치 — 시안 A · B · C · H) ─────────────────────────────
// 안내 화면이 계열 기본값(위 `SITE_SKINS`) 밖에서 더 쓰는 색 · 모서리. 값만 둔다(그리는 것은 `MessengerFakeLanding.tsx`).
// 판정표 G(이 표대로만 — 그리는 쪽 주석과 같은 표):
// | # | If | Then |
// |---|---|---|
// | G1 | 입력 화면(`CredentialFormMockup`) · 이체 화면 아님 · 계열 = agency | 관공서 머리(띠 · 원형 엠블럼 · 명조 이름 · 굵은 밑줄) · 본문 = 왼쪽 굵은 선 공지 상자 · 모서리 3px |
// | G2 | 같은 조건 · 계열 = refund | 흰 머리 + 기관 마크 · 첫 화면 위 조회 결과 카드(금액 · 내역 · 태그) |
// | G3 | 같은 조건 · 계열 = parcel | 상자 마크 + 주황 큰 로고 · 운송장 띠 · 보류 배지 · 단계 타임라인 · 검은 꼬리말 |
// | G4 | 같은 조건 · 계열 = loan(맥락 없는 대출 · 대환 — PR-3 판정표 P5가 넘긴 것) | 대출 계열 머리 · 색(`purchasePalette("loan")`) · 꼬리말 |
// | G5 | 이체 화면(`BANK_TRANSFER_LANDINGS` — D1 송금 요청 · D2 기관형 이체) | 이 PR에서 무변경(머리 결정 대기) |
// | G6 | 설치 화면(`AppInstallMockup`) | 앱 소개 페이지(큰 앱 아이콘 · 이름 · 만든 곳 · 요청하는 권한 목록 · 파란 버튼 · 꼬리말) |
// | G7 | 표에 없는 id(범용 폴백 · 옛 문서) | 종전 화면 그대로 |
// | C1 | 모든 글자 | 바탕 위 4.5:1(로고 큰 글자 3:1) · 입력 칸 테두리 3:1 — `guideScreens.test.ts`가 전부 잰다 |

/** 안내 화면 계열(G1 ~ G3 · G6). 대출(G4)은 구매 계열 값을 그대로 쓴다. */
export type GuideFamilyId = "agency" | "refund" | "parcel" | "install";

export type GuideSiteTokens = {
  /** 입력 칸 · 카드 바탕. */
  surface: string;
  /** 보조 글자(본문 · 칸 설명) — `surface` · 계열 `pageBg` 둘 다 위에서 4.5:1. */
  muted: string;
  /** 입력 칸 · 보조 버튼 테두리(비텍스트 3:1 — `surface` · `pageBg` 위). */
  border: string;
  /** 공지 상자 · 읽기 전용 칸 바탕(본문 글자 4.5:1). */
  noteBg: string;
  /** 금액 한글 단위 · 강조 글자. */
  hint: string;
  /** 입력 칸 · 버튼 모서리(px). */
  inputRadius: number;
  buttonRadius: number;
  /** 머리 이름 아래 작은 줄(기관). */
  headerSub?: string;
  /** 택배 — 운송장 띠 · 보류 배지 · 타임라인 점(완료 · 보류 · 대기). */
  invoiceBand?: { bg: string; text: string };
  holdBadge?: { bg: string; text: string };
  timeline?: { line: string; done: string; hold: string; pending: string; holdText: string; sub: string };
  /** 환급 — 조회 결과 카드의 큰 금액 · 태그. */
  resultAmount?: string;
  resultTag?: { bg: string; text: string };
  /** 설치 — 앱 아이콘 그라데이션 · 권한 아이콘 바탕. */
  appIcon?: { from: string; via: string; to: string };
  permissionIcon?: { bg: string; fg: string };
};

export const GUIDE_SITE_TOKENS: Readonly<Record<GuideFamilyId, GuideSiteTokens>> = {
  agency: {
    surface: "#FFFFFF",
    muted: "#4A5568",
    border: "#6B7280",
    noteBg: "#F7F9FC",
    hint: "#14254A",
    inputRadius: 3,
    buttonRadius: 3,
    headerSub: "#4A5568",
  },
  refund: {
    surface: "#FFFFFF",
    muted: "#46607F",
    border: "#7D8CA3",
    noteBg: "#E3EFFB",
    hint: "#0B5CAD",
    inputRadius: 10,
    buttonRadius: 12,
    resultAmount: "#0B5CAD",
    resultTag: { bg: "#E3EFFB", text: "#0B5CAD" },
  },
  parcel: {
    surface: "#FFFFFF",
    muted: "#555555",
    border: "#8A8A8A",
    noteBg: "#F3F3F3",
    hint: "#B4410A",
    inputRadius: 6,
    buttonRadius: 8,
    invoiceBand: { bg: "#FFF4E6", text: "#7A3B06" },
    holdBadge: { bg: "#FDE2E2", text: "#A61B1B" },
    timeline: { line: "#D4D4D4", done: "#2B8A3E", hold: "#C92A2A", pending: "#8A8A8A", holdText: "#A61B1B", sub: "#666666" },
  },
  install: {
    surface: "#FFFFFF",
    muted: "#4B5565",
    border: "#7C8597",
    noteBg: "#E8EEFB",
    hint: "#2457C5",
    inputRadius: 12,
    buttonRadius: 12,
    appIcon: { from: "#5B8AF3", via: "#2457C5", to: "#183E92" },
    permissionIcon: { bg: "#E8EEFB", fg: "#2457C5" },
  },
};

/**
 * 판정표 G1 ~ G4 · G7 — 입력 화면(`CredentialFormMockup`)이 입을 계열. 정확 일치 조회(`siteSkinFor`)만 · 이체 화면(G5)은 늘 undefined.
 * 설치 화면(G6)은 kind로 갈리므로 여기서 다루지 않는다.
 */
export function guideFormFamilyOf(landingId: string | undefined, bankTransfer: boolean): "agency" | "refund" | "parcel" | "loan" | undefined {
  if (bankTransfer) return undefined;
  const id = siteSkinFor(landingId)?.id;
  return id === "agency" || id === "refund" || id === "parcel" || id === "loan" ? id : undefined;
}

/** 안내 화면 단계가 쓰는 색 한 벌 — 키는 `PurchasePalette`(= `LANDING_PAGE_TOKENS` 키)와 같다(흐름 코드 무변경). */
export function guidePalette(family: GuideFamilyId): PurchasePalette {
  const skin = SITE_SKINS[family];
  const t = GUIDE_SITE_TOKENS[family];
  return {
    pageBg: skin.pageBg,
    headline: skin.text,
    body: t.muted,
    inputBorder: t.border,
    inputBg: t.surface,
    inputText: skin.text,
    submitBg: skin.buttonBg,
    submitText: skin.buttonText,
    issuerFooter: t.muted,
    fieldReadonlyBg: t.noteBg,
    errorText: PURCHASE_ERROR_TEXT,
    hintText: t.hint,
    selectedBorder: skin.accent,
    selectedBg: t.noteBg,
    selectedText: skin.text,
  };
}
