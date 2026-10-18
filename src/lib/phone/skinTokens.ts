// T190-1 — 기기 재현 스킨 토큰 (docs/Architecture.md §73.4 · UX-014 v1.33 (5)(6) 스킨 차이표 · P-37 (4)).
//
// ⚠️ **모든 값은 "UX v1.33 근사"다**(D-96 (2) — 실기 측정 전 초기값). User 실기 측정(OQ-A98 · §73.17 P-6)
// 뒤에는 값 옆 출처를 *"실측: 기종 / OS / 화면 / DPR"* 로 바꾼다. ⛔ 실기 캡처 이미지는 커밋하지 않는다
// (§73.3 A-8 — 측정값만 남긴다).
// ⭐ 접근성 하한이 정밀 재현보다 우선한다(D-96 (3) · AC-095 (b)) — `./skinTokens.test.ts`(G456)가 아래
// 대비 쌍 전부를 WCAG 상대 휘도 공식으로 계산해 막는다(글자 4.5:1 · 비텍스트 3:1). 측정값으로 바꿔도
// 같은 테스트가 막는다.
//
// 잎(leaf) 모듈 — import 0. 이번 단계(T190-1~4)가 실제로 쓰는 표면(통화 셸 · 떠 있는 배너 · 통화
// 표시줄)의 토큰만 둔다. 문자함 스레드·메신저 문자형·랜딩 브라우저 바 토큰은 그 화면을 고치는 단계
// (T190-5 · T190-6)가 같은 형식으로 더한다(쓰이지 않는 값을 미리 두면 대비 검사가 실제 화면과 어긋난다).
import type { MessengerSkin } from "../messenger/detectSkin";

export type CallSkinTokens = {
  /** 통화 셸 바탕 `call.bg`. 출처: UX v1.33 근사(UX-014 v1.33 (5)). */
  bg: string;
  /** 최대폭 430px 바깥(데스크톱) — `call.bg`보다 한 단계 어두운 단색(UX-014 v1.33 (8) Responsive). 근사. */
  outerBg: string;
  /** 발신 번호·그리드 라벨. 근사. */
  textPrimary: string;
  /** `call.textSecondary` — 번호 아래 줄·수신 버튼 라벨. UX v1.33 근사(#C9D4DB). */
  textSecondary: string;
  /** One UI형만 그리는 발신자 아바타(`call.avatarBg`) — iOS형은 아바타 없음. 근사. */
  avatarBg: string;
  avatarFg: string;
  hasAvatar: boolean;
  /** 발신 번호 글자 크기(px) — iOS형 32 · One UI형 30. 근사. */
  numberSizePx: number;
  /** 그리드 버튼 원 배경(One UI형은 원 없음 = 투명). 근사. */
  gridButtonBg: string;
  /** 눌림(음소거 켜짐·스피커 모드) 원 배경. 근사. */
  gridButtonPressedBg: string;
  gridIcon: string;
  gridIconPressed: string;
  /** `call.accept` — 받기(앱 청록 #0E6B62는 Superseded — 문제 1c). 근사. */
  accept: string;
  /** `call.end` · 거절(#C6392F 현행 유지). */
  end: string;
  /** 받기·종료 원 안 아이콘. */
  roundIcon: string;
  /** 미확인 수 배지(숫자 텍스트). */
  badgeBg: string;
  badgeText: string;
  /** 키패드 숫자 키 원 배경. 근사. */
  keypadKeyBg: string;
  /** 울림 연출 — iOS형 = 받기 버튼 맥동 · One UI형 = 아바타 둘레 파동(현행 `call-ring-pulse` 재사용). */
  ringStyle: "accept-pulse" | "avatar-ripple";
};

export type BannerSkinTokens = {
  /** 떠 있는 문자 배너 바탕(UX-014 v1.33 (6)). 근사. */
  bg: string;
  radiusPx: number;
  text: string;
  /** `banner.textSecondary` — 1줄(앱 이름·시각). 근사(#5F6368, 대비 약 6.0:1). */
  textSecondary: string;
  /** 1줄 메시지 앱 아이콘(20px 둥근 사각) 바탕·아이콘. 근사. */
  appIconBg: string;
  appIconFg: string;
};

/** P-37 (4) 통화 표시줄 — 스킨과 무관하게 같다(연속성 앵커). 이 단계에선 대비 하한 검사 대상으로만 둔다. */
export const CALL_BAR_TOKENS = { bg: "#17803A", text: "#FFFFFF" } as const;

const ONE_UI_CALL: CallSkinTokens = {
  bg: "#101418",
  outerBg: "#07090B",
  textPrimary: "#FFFFFF",
  textSecondary: "#C9D4DB",
  avatarBg: "#3A4148",
  avatarFg: "#C9D4DB",
  hasAvatar: true,
  numberSizePx: 30,
  gridButtonBg: "rgba(255,255,255,0)",
  gridButtonPressedBg: "rgba(255,255,255,0.24)",
  gridIcon: "#FFFFFF",
  gridIconPressed: "#FFFFFF",
  accept: "#1E8E3E",
  end: "#C6392F",
  roundIcon: "#FFFFFF",
  badgeBg: "#C6392F",
  badgeText: "#FFFFFF",
  keypadKeyBg: "rgba(255,255,255,0.12)",
  ringStyle: "avatar-ripple",
};

const CALL_TOKENS: Record<MessengerSkin, CallSkinTokens> = {
  ios: {
    bg: "#1C1C1E",
    outerBg: "#000000",
    textPrimary: "#FFFFFF",
    textSecondary: "#C9D4DB",
    avatarBg: "#3A4148",
    avatarFg: "#C9D4DB",
    hasAvatar: false,
    numberSizePx: 32,
    gridButtonBg: "rgba(255,255,255,0.16)",
    gridButtonPressedBg: "#FFFFFF",
    gridIcon: "#FFFFFF",
    gridIconPressed: "#1C1C1E",
    accept: "#1E8E3E",
    end: "#C6392F",
    roundIcon: "#FFFFFF",
    badgeBg: "#C6392F",
    badgeText: "#FFFFFF",
    keypadKeyBg: "rgba(255,255,255,0.16)",
    ringStyle: "accept-pulse",
  },
  samsung: ONE_UI_CALL,
  // 기본(감지 실패·데스크톱) = One UI형 골격(UX-014 v1.33 (5) 표 셋째 열 "One UI형과 같음").
  default: ONE_UI_CALL,
};

const BANNER_TOKENS: Record<MessengerSkin, BannerSkinTokens> = {
  ios: {
    bg: "rgba(245,245,247,0.96)",
    radiusPx: 18,
    text: "#1C1C1E",
    textSecondary: "#5F6368",
    appIconBg: "#4C6A85",
    appIconFg: "#FFFFFF",
  },
  samsung: {
    bg: "#FFFFFF",
    radiusPx: 22,
    text: "#1B1B1F",
    textSecondary: "#5F6368",
    appIconBg: "#4C6A85",
    appIconFg: "#FFFFFF",
  },
  default: {
    bg: "#FFFFFF",
    radiusPx: 22,
    text: "#1B1B1F",
    textSecondary: "#5F6368",
    appIconBg: "#4C6A85",
    appIconFg: "#FFFFFF",
  },
};

export function callTokensFor(skin: MessengerSkin): CallSkinTokens {
  return CALL_TOKENS[skin];
}

export function bannerTokensFor(skin: MessengerSkin): BannerSkinTokens {
  return BANNER_TOKENS[skin];
}

// ── WCAG 대비 계산(G456) ────────────────────────────────────────────────────────────

type Rgba = { r: number; g: number; b: number; a: number };

/** `#RRGGBB` 또는 `rgba(r,g,b,a)`만 받는다 — 그 밖의 형식은 던진다(조용히 통과시키지 않는다). */
export function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/.exec(value.trim());
  if (rgba) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: Number(rgba[4]) };
  }
  throw new Error(`대비 계산이 읽을 수 없는 색 형식: ${value}`);
}

/** 반투명 색을 불투명 바탕 위에 합성한다(알파 블렌딩). */
export function compositeOver(fg: string, base: string): Rgba {
  const top = parseColor(fg);
  const bottom = parseColor(base);
  if (bottom.a !== 1) throw new Error(`합성 바탕은 불투명이어야 한다: ${base}`);
  const mix = (t: number, b: number) => Math.round(t * top.a + b * (1 - top.a));
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x 상대 휘도. */
export function relativeLuminance(color: Rgba): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

/** WCAG 2.x 대비율(1~21). 두 색 모두 불투명이어야 한다. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastPair = {
  name: string;
  fg: string;
  /** 바탕. 반투명이면 `base` 위에 합성해서 잰다. */
  bg: string;
  base?: string;
  kind: "text" | "nonText";
};

export const CONTRAST_MINIMUM = { text: 4.5, nonText: 3.0 } as const;

/** 이 스킨이 실제로 그리는 (글자/아이콘, 바탕) 쌍 전부(G456의 입력). */
export function skinContrastPairs(skin: MessengerSkin): ContrastPair[] {
  const call = callTokensFor(skin);
  const banner = bannerTokensFor(skin);
  const onCall = (bg: string) => ({ bg, base: call.bg });
  return [
    { name: `${skin}.call.number`, fg: call.textPrimary, bg: call.bg, kind: "text" },
    { name: `${skin}.call.textSecondary`, fg: call.textSecondary, bg: call.bg, kind: "text" },
    { name: `${skin}.call.gridIcon`, fg: call.gridIcon, ...onCall(call.gridButtonBg), kind: "nonText" },
    {
      name: `${skin}.call.gridIconPressed`,
      fg: call.gridIconPressed,
      ...onCall(call.gridButtonPressedBg),
      kind: "nonText",
    },
    { name: `${skin}.call.acceptIcon`, fg: call.roundIcon, bg: call.accept, kind: "nonText" },
    { name: `${skin}.call.endIcon`, fg: call.roundIcon, bg: call.end, kind: "nonText" },
    { name: `${skin}.call.avatarIcon`, fg: call.avatarFg, bg: call.avatarBg, kind: "nonText" },
    { name: `${skin}.call.badge`, fg: call.badgeText, bg: call.badgeBg, kind: "text" },
    { name: `${skin}.call.keypadKey`, fg: call.textPrimary, ...onCall(call.keypadKeyBg), kind: "text" },
    { name: `${skin}.banner.text`, fg: banner.text, ...onCall(banner.bg), kind: "text" },
    { name: `${skin}.banner.textSecondary`, fg: banner.textSecondary, ...onCall(banner.bg), kind: "text" },
    { name: `${skin}.banner.appIcon`, fg: banner.appIconFg, bg: banner.appIconBg, kind: "nonText" },
    { name: "callBar.text", fg: CALL_BAR_TOKENS.text, bg: CALL_BAR_TOKENS.bg, kind: "text" },
  ];
}

/** 쌍 하나의 대비(반투명 바탕은 합성 후). */
export function pairContrast(pair: ContrastPair): number {
  const bg = pair.base ? compositeOver(pair.bg, pair.base) : parseColor(pair.bg);
  const fg = parseColor(pair.fg);
  if (fg.a !== 1) throw new Error(`글자/아이콘 색은 불투명이어야 한다: ${pair.name}`);
  return contrastRatio(fg, bg);
}

/** 하한 미달 쌍 목록 — 본 게이트와 역검증이 **같은 함수**를 쓴다(G456). */
export function contrastViolations(pairs: readonly ContrastPair[]): string[] {
  return pairs
    .map((pair) => ({ pair, ratio: pairContrast(pair) }))
    .filter(({ pair, ratio }) => ratio < CONTRAST_MINIMUM[pair.kind])
    .map(({ pair, ratio }) => `${pair.name} ${ratio.toFixed(2)}:1 < ${CONTRAST_MINIMUM[pair.kind]}:1`);
}
