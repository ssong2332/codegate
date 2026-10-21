// §95.6(UX D-139 · 사용자 결정 2026-10-21 *"1번으로 가고"* = 안내 배너안) — 브라우저 자체 "웹 페이지 다크 모드"가 훈련 화면 색을 바꾸는
// 브라우저에서, 세션 **전** 화면(메신저 시작 고지 · 통화 벨 직전 고지)에 설정 끄는 법을 한 번 알려 준다. 화면 파생 · 기기 저장 1키뿐.
//
// 진단 근거(사용자 실기 `?themedebug=1` · Chromium 138 / Whale 4 Android · §94 패널): 기기 다크(prefers-color-scheme: dark)일 때 CSS · SVG
// 색이 그리기 단계에서 어둡게 바뀌고 canvas · img는 그대로 · computed 색은 정상 · `meta color-scheme=only light`와 html color-scheme 무시.
// 웨일 설정에서 '웹 페이지를 다크 모드로 표시'를 끄거나 테마를 라이트로 바꾸면 정상(사용자 확인) ⇒ 사이트 쪽 차단 수단이 없어 안내로 대응한다.
//
// 브라우저 판정표 — 위에서부터 처음 맞는 행. ⛔ `enabled: true`는 **실기로 반전이 확인된 브라우저만**(지금은 웨일만).
// 다른 브라우저는 실기 결과가 오면 행의 enabled · 문면 · 경로를 채운다(메인 세션 전달).
// | 브라우저 | 감지(UA) | 켜짐 | 안내 문구 | 설정 경로 |
// |---|---|---|---|---|
// | 네이버 웨일 | `Whale/` | ✅ (2026-10-21 실기) | 아래 whale.body | 설정 → 테마 → 다크 모드 고급 설정 → 웹 페이지를 다크 모드로 표시 끄기 |
// | 삼성 인터넷 | `SamsungBrowser/` | ❌ 미확인 | (실기 뒤) | (실기 뒤 — 추정: 설정 → 화면 → 다크 모드 · 미확인) |
// | 그 밖 | — | — | 안내 없음 | — |
// 표시 조건 = 켜진 행 ∧ 기기 다크 ∧ 이 기기에서 아직 "확인"을 누르지 않음.

export type WebDarkBrowserId = "whale" | "samsung";

export type WebDarkBrowserRule = {
  id: WebDarkBrowserId;
  name: string;
  detect: RegExp;
  enabled: boolean;
  /** 안내 문면(어르신 읽기 — 짧은 문장 · 설정 경로는 화살표로). enabled일 때만 화면에 나온다. */
  title: string;
  body: string;
  settingsPath: readonly string[];
};

export const WEB_DARK_BROWSERS: readonly WebDarkBrowserRule[] = [
  {
    id: "whale",
    name: "웨일",
    detect: /\bWhale\//,
    enabled: true,
    title: "웨일 다크 모드를 쓰고 계세요",
    body: "다크 모드에서는 화면 색이 실제 앱과 다르게 보일 수 있어요. 실제 색으로 보려면 아래 순서로 설정을 꺼 주세요.",
    settingsPath: ["웨일 설정", "테마", "다크 모드 고급 설정", "'웹 페이지를 다크 모드로 표시' 끄기"],
  },
  {
    id: "samsung",
    name: "삼성 인터넷",
    detect: /\bSamsungBrowser\//,
    enabled: false, // ⛔ 실기 미확인 — 켜기 전에 문면 · 경로를 실기로 확인한다.
    title: "",
    body: "",
    settingsPath: [],
  },
];

/** 기기 저장 키(브라우저별) — "확인"을 누르면 이 기기에서는 다시 보이지 않는다. */
export const WEB_DARK_NOTICE_STORAGE_PREFIX = "fv.webDarkNotice.v1.";

export function matchWebDarkBrowser(
  userAgent: string,
  rules: readonly WebDarkBrowserRule[] = WEB_DARK_BROWSERS,
): WebDarkBrowserRule | null {
  return rules.find((r) => r.detect.test(userAgent)) ?? null;
}

export function decideWebDarkNotice(
  input: { userAgent: string; prefersDark: boolean; dismissed: (id: WebDarkBrowserId) => boolean },
  rules: readonly WebDarkBrowserRule[] = WEB_DARK_BROWSERS,
): WebDarkBrowserRule | null {
  const rule = matchWebDarkBrowser(input.userAgent, rules);
  if (!rule || !rule.enabled || !input.prefersDark || input.dismissed(rule.id)) return null;
  return rule;
}
