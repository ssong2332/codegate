// T190-1 — 기기 재현 스킨 토큰 (docs/Architecture.md §74.4 · UX-014 v1.33 (5)(6) 스킨 차이표 · P-37 (4)).
//
// ⚠️ **모든 값은 "UX v1.33 근사"다**(D-96 (2) — 실기 측정 전 초기값). User 실기 측정(OQ-A98 · §74.17 P-6)
// 뒤에는 값 옆 출처를 *"실측: 기종 / OS / 화면 / DPR"* 로 바꾼다. ⛔ 실기 캡처 이미지는 커밋하지 않는다
// (§74.3 A-8 — 측정값만 남긴다).
// ⭐ 접근성 하한이 정밀 재현보다 우선한다(D-96 (3) · AC-095 (b)) — `./skinTokens.test.ts`(G456)가 아래
// 대비 쌍 전부를 WCAG 상대 휘도 공식으로 계산해 막는다(글자 4.5:1 · 비텍스트 3:1). 측정값으로 바꿔도
// 같은 테스트가 막는다.
//
// 잎(leaf) 모듈 — 타입 import만. 표면: 통화 셸 · 떠 있는 배너 · 통화 표시줄(T190-1~4) + 문자함 스레드 · 랜딩
// 브라우저 바·본문 · 메신저 문자형(T190-5·6). 쓰이는 값만 둔다(쓰이지 않는 값은 대비 검사가 실제 화면과 어긋난다).
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
  /** §89.5(UX D-132 (5) ⓑ) 수신 벨 바탕 그라데이션의 위 · 아래 끝. 글자 대비는 두 끝 모두에서 잰다(G456). 근사. */
  ringBgStops: readonly [string, string];
  /** 통화 셸 안 오류 · 경고 문장(종전 `#F0A79E` 하드코딩을 토큰으로). */
  alertText: string;
  /** 통화 셸 안 알약 · 보조 버튼 바탕(반투명). */
  chipBg: string;
  /** 통화 셸 안 입력칸(글자 입력 모드) 바탕 · 경계. */
  fieldBg: string;
  fieldBorder: string;
  /** §89.5 ⓒ 라이트 통화 화면의 버튼 묶음 판(One UI형 라이트만) — 없으면 null(셸 바탕 위에 바로). */
  gridPanelBg: string | null;
  /** 폴백 통화 발화 파형 막대(`CallWaveform` — P3 리뷰 Major 1: 라이트 화면에서 종전 #7CD9C2는 약 1.5:1). */
  waveBar: string;
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

/**
 * ⚠️ **추정값 모음(실기 측정 전) — UX D-132 · OQ-U100 · OQ-A98.** 공개 자료로 수치를 확인하지 못한 기기 화면 색을
 * **이 한 곳**에 모았다. 실기 스포이트 측정값이 오면 이 블록의 값만 바꾼다(출처 주석도 *"실측: 기종 / OS / 화면"* 으로).
 * 바꾼 값도 G456(`./skinTokens.test.ts`)이 WCAG 하한으로 막는다.
 */
export const ESTIMATED_DEVICE_COLORS = {
  /** 메신저형 대화방 바탕(기본 테마 회청색) — 추정 범위 #B2C7D9~#BACEE0. */
  messengerChatBg: "#BACEE0",
  /** 메신저형 발신 말풍선 · 전송 버튼(노랑) — 근사. 앱 이름 · 로고와 함께 쓰지 않는다(감사 안전선). */
  messengerOutgoingBg: "#FEE500",
  /** One UI형 라이트 테마 통화 화면 바탕 · 버튼 판 — 추정. */
  oneUiLightCallBg: "#F4F6F8",
  oneUiLightCallPanel: "#FFFFFF",
} as const;

const DARK_CALL_EXTRAS = {
  alertText: "#F0A79E",
  chipBg: "rgba(255,255,255,0.10)",
  fieldBg: "rgba(255,255,255,0.10)",
  // 종전 `border-white/30`은 바탕 위 약 2.7:1(비텍스트 3:1 미달) — 토큰화하며 0.45로 올렸다(G456).
  fieldBorder: "rgba(255,255,255,0.45)",
  gridPanelBg: null,
  waveBar: "#7CD9C2",
} as const;

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
  // UX D-129 — 0.24는 바탕 대비 약 2.14:1(비텍스트 3:1 미달). 0.40 = 바탕 약 3.83:1 · 흰 아이콘 약 4.83:1.
  gridButtonPressedBg: "rgba(255,255,255,0.40)",
  gridIcon: "#FFFFFF",
  gridIconPressed: "#FFFFFF",
  accept: "#1E8E3E",
  end: "#C6392F",
  roundIcon: "#FFFFFF",
  badgeBg: "#C6392F",
  badgeText: "#FFFFFF",
  keypadKeyBg: "rgba(255,255,255,0.12)",
  ringStyle: "avatar-ripple",
  ringBgStops: ["#2E4257", "#101418"],
  ...DARK_CALL_EXTRAS,
};

/**
 * §89.5 ⓒ — One UI형 + 기기 라이트 테마일 때의 통화 화면(UX D-132 (5) ⓒ). 색 원천 = `ESTIMATED_DEVICE_COLORS`(추정).
 * 받기 · 종료 원과 아이콘은 어두운 화면과 같다.
 */
const ONE_UI_CALL_LIGHT: CallSkinTokens = {
  ...ONE_UI_CALL,
  bg: ESTIMATED_DEVICE_COLORS.oneUiLightCallBg,
  outerBg: "#E3E7EB",
  textPrimary: "#14181D",
  textSecondary: "#4B5563",
  avatarBg: "#D5DCE3",
  avatarFg: "#5A6675",
  gridButtonBg: "rgba(255,255,255,0)",
  gridButtonPressedBg: "#3A4350",
  gridIcon: "#3A4350",
  gridIconPressed: "#FFFFFF",
  keypadKeyBg: "rgba(20,24,29,0.07)",
  ringBgStops: ["#E9EEF3", "#F4F6F8"],
  alertText: "#B3261E",
  chipBg: "rgba(20,24,29,0.07)",
  fieldBg: "#FFFFFF",
  fieldBorder: "rgba(20,24,29,0.55)",
  gridPanelBg: ESTIMATED_DEVICE_COLORS.oneUiLightCallPanel,
  waveBar: "#1F6F66",
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
    ringBgStops: ["#3C4552", "#1C1C1E"],
    ...DARK_CALL_EXTRAS,
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

/** 기기 테마(OS `prefers-color-scheme`) — 라이트 통화 화면은 One UI형에만 있다(§89.5 ⓒ · iOS형 · 기본은 늘 어둡다). */
export type DeviceTheme = "dark" | "light";

export function callTokensFor(skin: MessengerSkin, theme: DeviceTheme = "dark"): CallSkinTokens {
  if (skin === "samsung" && theme === "light") return ONE_UI_CALL_LIGHT;
  return CALL_TOKENS[skin];
}

/** 수신 벨 바탕(CSS) — 위에서 아래로 흐려지는 그라데이션(§89.5 ⓑ). */
export function ringBackground(call: CallSkinTokens): string {
  return `radial-gradient(120% 70% at 50% 0%, ${call.ringBgStops[0]} 0%, ${call.ringBgStops[1]} 72%)`;
}

export function bannerTokensFor(skin: MessengerSkin): BannerSkinTokens {
  return BANNER_TOKENS[skin];
}

// ── T190-5 — 문자함 스레드(UX-027 v1.33 (6)) · 랜딩 브라우저 바(UX-023 v1.33 (2)(8)) · 랜딩 고정 색 ──────

export type SmsThreadSkinTokens = {
  /** 대화 헤더 바탕 · 아래 구분선(One UI형은 구분선 없음 = 바탕과 같은 색). UX v1.33 근사. */
  headerBg: string;
  headerBorder: string;
  headerText: string;
  /** 헤더 발신자 배치 — iOS형 가운데(아바타 위·이름 아래) · One UI형 왼쪽(아바타 옆). */
  headerLayout: "center" | "left";
  /** 뒤로 셰브런 색. 근사. */
  chevron: string;
  /** 스레드 바탕. */
  threadBg: string;
  /** 수신 말풍선 바탕 · 글 · 테두리(기본 스킨만 1px) · 모서리. */
  bubbleBg: string;
  bubbleText: string;
  bubbleBorder: string | null;
  bubbleRadius: string;
  /** `sms.link` — 밑줄·색·아이콘 세 겹 중 색. */
  link: string;
  /** 시각 글(iOS형 구분줄 · One UI형 말풍선 옆 11px). */
  time: string;
  timeStyle: "separator" | "beside";
  /** 장식 아바타 원(스크린리더 숨김 — 대비 하한 대상 아님). */
  avatarBg: string;
};

const ONE_UI_THREAD: SmsThreadSkinTokens = {
  headerBg: "#FFFFFF",
  headerBorder: "#FFFFFF",
  headerText: "#1B1B1F",
  headerLayout: "left",
  chevron: "#1B1B1F",
  threadBg: "#F2F3F5",
  bubbleBg: "#FFFFFF",
  bubbleText: "#1B1B1F",
  bubbleBorder: null,
  bubbleRadius: "20px",
  link: "#0B57D0",
  time: "#5F6368",
  timeStyle: "beside",
  avatarBg: "#B8BEC6",
};

const SMS_THREAD_TOKENS: Record<MessengerSkin, SmsThreadSkinTokens> = {
  ios: {
    headerBg: "#F7F7F7",
    headerBorder: "#D1D1D6",
    headerText: "#1C1C1E",
    headerLayout: "center",
    chevron: "#0A63C9",
    threadBg: "#FFFFFF",
    bubbleBg: "#E9E9EB",
    bubbleText: "#1C1C1E",
    bubbleBorder: null,
    bubbleRadius: "18px 18px 18px 6px",
    link: "#0A63C9",
    time: "#6E6E73",
    timeStyle: "separator",
    avatarBg: "#B8BEC6",
  },
  samsung: ONE_UI_THREAD,
  default: { ...ONE_UI_THREAD, bubbleBorder: "#E2DDD3" },
};

export function smsThreadTokensFor(skin: MessengerSkin): SmsThreadSkinTokens {
  return SMS_THREAD_TOKENS[skin];
}

export type BrowserBarSkinTokens = {
  barBg: string;
  barBorder: string;
  fieldBg: string;
  fieldRadiusPx: number;
  /** 지구본 아이콘(비텍스트) · 주소 글. */
  icon: string;
  text: string;
  /** 브라우저 뒤로 셰브런 "문자"(UX-027에서 열었을 때만). */
  back: string;
};

const BROWSER_BAR_TOKENS: Record<MessengerSkin, BrowserBarSkinTokens> = {
  ios: {
    barBg: "#F7F7F7",
    barBorder: "#DADCE0",
    fieldBg: "#E3E3E8",
    fieldRadiusPx: 12,
    icon: "#6E6E73",
    text: "#3C3C43",
    back: "#0A63C9",
  },
  samsung: {
    barBg: "#FFFFFF",
    barBorder: "#DADCE0",
    fieldBg: "#F1F3F4",
    fieldRadiusPx: 18,
    icon: "#5F6368",
    text: "#3C3C43",
    back: "#1B1B1F",
  },
  default: {
    barBg: "#FFFFFF",
    barBorder: "#DADCE0",
    fieldBg: "#F1F3F4",
    fieldRadiusPx: 18,
    icon: "#5F6368",
    text: "#3C3C43",
    back: "#1B1B1F",
  },
};

export function browserBarTokensFor(skin: MessengerSkin): BrowserBarSkinTokens {
  return BROWSER_BAR_TOKENS[skin];
}

/**
 * 랜딩 본문 ③~⑧ — **기관 페이지**라 기기 스킨과 무관하게 같다(UX-023 v1.33 (8)). 근사.
 * 발급처 `#6B655C`(현행 `#C9C2B6` 약 1.7:1 미달 Superseded) · 입력 테두리 `#8E8E93`(현행 `#E2DDD3` 3:1 미달 Superseded).
 */
export const LANDING_PAGE_TOKENS = {
  pageBg: "#FFFFFF",
  issuerBarBg: "#1F3A5F",
  issuerBarText: "#FFFFFF",
  headline: "#22303A",
  body: "#6B655C",
  inputBorder: "#8E8E93",
  inputText: "#22303A",
  submitBg: "#41525E",
  submitText: "#FFFFFF",
  issuerFooter: "#6B655C",
} as const;

// ── T190-6 — 메신저 문자형(`surface="sms"`) 화면 문법(UX-022 v1.33 (2)) ──────────────────────────

export type MessengerSmsSkinTokens = {
  /** 화면 바탕 · 최대폭 430px 바깥(UX-022 v1.33 (5)). */
  screenBg: string;
  outerBg: string;
  incomingBg: string;
  incomingText: string;
  incomingBorder: string | null;
  outgoingBg: string;
  outgoingText: string;
  /** 말풍선 모서리 — 꼬리 쪽은 iOS형만 6px. */
  radiusPx: number;
  tailRadiusPx: number;
  inputBarBg: string;
  fieldBg: string;
  fieldBorder: string | null;
  fieldRadiusPx: number;
  fieldText: string;
  placeholder: string;
  sendBg: string;
  sendIcon: string;
};

const ONE_UI_MESSENGER: MessengerSmsSkinTokens = {
  screenBg: "#F2F3F5",
  outerBg: "#E5E7EA",
  incomingBg: "#FFFFFF",
  incomingText: "#1B1B1F",
  incomingBorder: null,
  outgoingBg: "#D3E3FD",
  outgoingText: "#1B1B1F",
  radiusPx: 20,
  tailRadiusPx: 20,
  inputBarBg: "#FFFFFF",
  fieldBg: "#F2F3F5",
  fieldBorder: null,
  fieldRadiusPx: 20,
  fieldText: "#1B1B1F",
  placeholder: "#5F6368",
  sendBg: "#0B57D0",
  sendIcon: "#FFFFFF",
};

const MESSENGER_SMS_TOKENS: Record<MessengerSkin, MessengerSmsSkinTokens> = {
  ios: {
    screenBg: "#FFFFFF",
    outerBg: "#E5E7EA",
    incomingBg: "#E9E9EB",
    incomingText: "#1C1C1E",
    incomingBorder: null,
    // UX-022 v1.33 (2) — 옛 #0B84FF + 흰 글(약 3.6:1, 4.5 미달)은 Superseded.
    outgoingBg: "#0A6CDC",
    outgoingText: "#FFFFFF",
    radiusPx: 18,
    tailRadiusPx: 6,
    inputBarBg: "#FFFFFF",
    fieldBg: "#FFFFFF",
    fieldBorder: "#D1D1D6",
    fieldRadiusPx: 20,
    fieldText: "#1C1C1E",
    placeholder: "#6E6E73",
    sendBg: "#0A6CDC",
    sendIcon: "#FFFFFF",
  },
  samsung: ONE_UI_MESSENGER,
  default: {
    ...ONE_UI_MESSENGER,
    incomingBorder: "#E2DDD3",
    outgoingBg: "#E8EAED",
    radiusPx: 16,
    tailRadiusPx: 16,
    sendBg: "#41525E",
  },
};

export function messengerSmsTokensFor(skin: MessengerSkin): MessengerSmsSkinTokens {
  return MESSENGER_SMS_TOKENS[skin];
}

// ── §89.5 ⓐ — 메신저형 대화방(카카오 표면 · UX D-132 (5) ⓐ). 앱 이름 · 로고 · 기본 프로필 그림은 쓰지 않는다. ──────────

export const MESSENGER_CHAT_TOKENS = {
  screenBg: ESTIMATED_DEVICE_COLORS.messengerChatBg,
  outerBg: "#A9BED1",
  headerText: "#1B1B1F",
  headerIcon: "#1B1B1F",
  senderName: "#1B1B1F",
  incomingBg: "#FFFFFF",
  incomingText: "#1B1B1F",
  outgoingBg: ESTIMATED_DEVICE_COLORS.messengerOutgoingBg,
  outgoingText: "#1B1B1F",
  /** 말풍선 옆 작은 시각 · 날짜 구분줄 글자 — 바탕 위. */
  time: "#33404D",
  /** 상대가 아직 답하지 않은 내 메시지 옆 숫자 "1" — 바탕 위 글자(4.5:1). 실제 앱의 노랑은 대비 미달이라 진한 황토로. */
  unread: "#6B4E00",
  dateChipBg: "rgba(0,0,0,0.10)",
  /** 둥근 사각 프로필(자체 실루엣). */
  profileBg: "#6F879E",
  profileFg: "#FFFFFF",
  linkCardBg: "#FFFFFF",
  linkCardTitle: "#1B1B1F",
  linkCardHost: "#5F6368",
  linkCardThumb: "#C3D0DC",
  inputBarBg: "#FFFFFF",
  fieldBg: "#F2F3F5",
  /** P3 리뷰 Major 2 — 입력칸 경계(입력줄 흰 바탕 위 비텍스트 3:1). 바탕 차이만으로는 약 1.1:1이라 경계를 둔다. */
  fieldBorder: "#7D8792",
  fieldText: "#1B1B1F",
  placeholder: "#5F6368",
  sendBg: ESTIMATED_DEVICE_COLORS.messengerOutgoingBg,
  sendIcon: "#1B1B1F",
  systemLineBg: "rgba(0,0,0,0.10)",
} as const;

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
    ...gridPressedPairs(skin, call),
    { name: `${skin}.call.acceptIcon`, fg: call.roundIcon, bg: call.accept, kind: "nonText" },
    { name: `${skin}.call.endIcon`, fg: call.roundIcon, bg: call.end, kind: "nonText" },
    { name: `${skin}.call.avatarIcon`, fg: call.avatarFg, bg: call.avatarBg, kind: "nonText" },
    { name: `${skin}.call.badge`, fg: call.badgeText, bg: call.badgeBg, kind: "text" },
    { name: `${skin}.call.keypadKey`, fg: call.textPrimary, ...onCall(call.keypadKeyBg), kind: "text" },
    { name: `${skin}.banner.text`, fg: banner.text, ...onCall(banner.bg), kind: "text" },
    { name: `${skin}.banner.textSecondary`, fg: banner.textSecondary, ...onCall(banner.bg), kind: "text" },
    { name: `${skin}.banner.appIcon`, fg: banner.appIconFg, bg: banner.appIconBg, kind: "nonText" },
    { name: "callBar.text", fg: CALL_BAR_TOKENS.text, bg: CALL_BAR_TOKENS.bg, kind: "text" },
    ...smsSurfacePairs(skin),
    ...ringPairs(skin, call),
    ...(skin === "samsung" ? lightCallPairs() : []),
    ...messengerChatPairs(),
  ];
}

/** §89.5 ⓑ — 수신 벨 그라데이션 두 끝 · 통화 셸 안 경고 문장 · 알약 · 입력칸(G456). */
function ringPairs(skin: string, call: CallSkinTokens): ContrastPair[] {
  const [top, bottom] = call.ringBgStops;
  return [
    { name: `${skin}.ring.number@top`, fg: call.textPrimary, bg: top, kind: "text" },
    { name: `${skin}.ring.number@bottom`, fg: call.textPrimary, bg: bottom, kind: "text" },
    { name: `${skin}.ring.textSecondary@top`, fg: call.textSecondary, bg: top, kind: "text" },
    { name: `${skin}.ring.textSecondary@bottom`, fg: call.textSecondary, bg: bottom, kind: "text" },
    { name: `${skin}.call.alertText`, fg: call.alertText, bg: call.bg, kind: "text" },
    { name: `${skin}.call.chipText`, fg: call.textPrimary, bg: call.chipBg, base: call.bg, kind: "text" },
    { name: `${skin}.call.fieldText`, fg: call.textPrimary, ...fieldBgPair(call), kind: "text" },
    { name: `${skin}.call.fieldBorder`, fg: compositeHex(call.fieldBorder, call.bg), bg: call.bg, kind: "nonText" },
    { name: `${skin}.call.waveBar`, fg: call.waveBar, bg: call.bg, kind: "nonText" },
  ];
}

function fieldBgPair(call: CallSkinTokens): { bg: string; base?: string } {
  return parseColor(call.fieldBg).a === 1 ? { bg: call.fieldBg } : { bg: call.fieldBg, base: call.bg };
}

/** §89.5 ⓒ — One UI형 라이트 통화 화면 전체(셸 · 버튼 판 · 눌림). */
export function lightCallPairs(): ContrastPair[] {
  const call = ONE_UI_CALL_LIGHT;
  const panel = call.gridPanelBg ?? call.bg;
  return [
    { name: "samsung-light.call.number", fg: call.textPrimary, bg: call.bg, kind: "text" },
    { name: "samsung-light.call.textSecondary", fg: call.textSecondary, bg: call.bg, kind: "text" },
    { name: "samsung-light.call.gridLabel", fg: call.textPrimary, bg: panel, kind: "text" },
    { name: "samsung-light.call.gridIcon", fg: call.gridIcon, bg: panel, kind: "nonText" },
    { name: "samsung-light.call.gridPressedIndicator", fg: call.gridButtonPressedBg, bg: panel, kind: "nonText" },
    { name: "samsung-light.call.gridIconPressed", fg: call.gridIconPressed, bg: call.gridButtonPressedBg, kind: "nonText" },
    { name: "samsung-light.call.avatarIcon", fg: call.avatarFg, bg: call.avatarBg, kind: "nonText" },
    { name: "samsung-light.call.keypadKey", fg: call.textPrimary, bg: call.keypadKeyBg, base: call.bg, kind: "text" },
    { name: "samsung-light.call.acceptIcon", fg: call.roundIcon, bg: call.accept, kind: "nonText" },
    { name: "samsung-light.call.endIcon", fg: call.roundIcon, bg: call.end, kind: "nonText" },
    ...ringPairs("samsung-light", call),
  ];
}

/** §89.5 ⓐ — 메신저형 대화방(G456). */
export function messengerChatPairs(): ContrastPair[] {
  const t = MESSENGER_CHAT_TOKENS;
  return [
    { name: "chat.headerText", fg: t.headerText, bg: t.screenBg, kind: "text" },
    { name: "chat.headerIcon", fg: t.headerIcon, bg: t.screenBg, kind: "nonText" },
    { name: "chat.senderName", fg: t.senderName, bg: t.screenBg, kind: "text" },
    { name: "chat.incoming", fg: t.incomingText, bg: t.incomingBg, kind: "text" },
    { name: "chat.outgoing", fg: t.outgoingText, bg: t.outgoingBg, kind: "text" },
    { name: "chat.time", fg: t.time, bg: t.screenBg, kind: "text" },
    { name: "chat.unread", fg: t.unread, bg: t.screenBg, kind: "text" },
    { name: "chat.dateChip", fg: t.time, bg: t.dateChipBg, base: t.screenBg, kind: "text" },
    { name: "chat.systemLine", fg: t.time, bg: t.systemLineBg, base: t.screenBg, kind: "text" },
    { name: "chat.profileIcon", fg: t.profileFg, bg: t.profileBg, kind: "nonText" },
    { name: "chat.linkTitle", fg: t.linkCardTitle, bg: t.linkCardBg, kind: "text" },
    { name: "chat.linkHost", fg: t.linkCardHost, bg: t.linkCardBg, kind: "text" },
    { name: "chat.fieldText", fg: t.fieldText, bg: t.fieldBg, kind: "text" },
    { name: "chat.fieldBorder", fg: t.fieldBorder, bg: t.inputBarBg, kind: "nonText" },
    { name: "chat.placeholder", fg: t.placeholder, bg: t.fieldBg, kind: "text" },
    { name: "chat.sendIcon", fg: t.sendIcon, bg: t.sendBg, kind: "nonText" },
  ];
}

/** 반투명 색을 불투명 바탕 위에 합성한 결과를 `#RRGGBB`로 — 합성 색을 `ContrastPair.fg`(불투명 전용)로 쓰기 위함. */
export function compositeHex(fg: string, base: string): string {
  const c = compositeOver(fg, base);
  return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * 그리드 버튼 **눌림(켜짐) 상태**의 대비 쌍 2개(UX D-129 (3) · D-96 (3)) — 토큰을 직접 받는 순수 함수라
 * 역검증이 옛 값 사본을 같은 함수에 넣을 수 있다.
 * ⓐ 눌림 원(`call.bg` 위 합성) ↔ `call.bg` — 상태 표시 자체의 비텍스트 대비(WCAG 1.4.11).
 * ⓑ 눌림 아이콘 ↔ 눌림 원(합성).
 */
export function gridPressedPairs(skin: MessengerSkin, call: CallSkinTokens): ContrastPair[] {
  return [
    {
      name: `${skin}.call.gridPressedIndicator`,
      fg: compositeHex(call.gridButtonPressedBg, call.bg),
      bg: call.bg,
      kind: "nonText",
    },
    {
      name: `${skin}.call.gridIconPressed`,
      fg: call.gridIconPressed,
      bg: call.gridButtonPressedBg,
      base: call.bg,
      kind: "nonText",
    },
  ];
}

/** T190-5·6 표면(문자함 스레드 · 브라우저 바 · 랜딩 본문 · 메신저 문자형)의 대비 쌍. */
function smsSurfacePairs(skin: MessengerSkin): ContrastPair[] {
  const thread = smsThreadTokensFor(skin);
  const bar = browserBarTokensFor(skin);
  const page = LANDING_PAGE_TOKENS;
  const chat = messengerSmsTokensFor(skin);
  return [
    { name: `${skin}.thread.headerText`, fg: thread.headerText, bg: thread.headerBg, kind: "text" },
    { name: `${skin}.thread.chevron`, fg: thread.chevron, bg: thread.headerBg, kind: "nonText" },
    { name: `${skin}.thread.bubbleText`, fg: thread.bubbleText, bg: thread.bubbleBg, kind: "text" },
    { name: `${skin}.thread.link`, fg: thread.link, bg: thread.bubbleBg, kind: "text" },
    { name: `${skin}.thread.time`, fg: thread.time, bg: thread.threadBg, kind: "text" },
    { name: `${skin}.thread.senderLabel`, fg: thread.headerText, bg: thread.threadBg, kind: "text" },
    { name: `${skin}.browserBar.text`, fg: bar.text, bg: bar.fieldBg, kind: "text" },
    { name: `${skin}.browserBar.globe`, fg: bar.icon, bg: bar.fieldBg, kind: "nonText" },
    { name: `${skin}.browserBar.back`, fg: bar.back, bg: bar.barBg, kind: "text" },
    { name: "landing.issuerBar", fg: page.issuerBarText, bg: page.issuerBarBg, kind: "text" },
    { name: "landing.headline", fg: page.headline, bg: page.pageBg, kind: "text" },
    { name: "landing.body", fg: page.body, bg: page.pageBg, kind: "text" },
    { name: "landing.inputBorder", fg: page.inputBorder, bg: page.pageBg, kind: "nonText" },
    { name: "landing.submit", fg: page.submitText, bg: page.submitBg, kind: "text" },
    { name: "landing.issuerFooter", fg: page.issuerFooter, bg: page.pageBg, kind: "text" },
    { name: `${skin}.messenger.incoming`, fg: chat.incomingText, bg: chat.incomingBg, kind: "text" },
    { name: `${skin}.messenger.outgoing`, fg: chat.outgoingText, bg: chat.outgoingBg, kind: "text" },
    { name: `${skin}.messenger.fieldText`, fg: chat.fieldText, bg: chat.fieldBg, kind: "text" },
    { name: `${skin}.messenger.placeholder`, fg: chat.placeholder, bg: chat.fieldBg, kind: "text" },
    { name: `${skin}.messenger.sendIcon`, fg: chat.sendIcon, bg: chat.sendBg, kind: "nonText" },
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
