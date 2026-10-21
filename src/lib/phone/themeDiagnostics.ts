// `?themedebug=1` 화면 색 진단(2026-10-21 · S25 웨일 다크 실기 신고 — 카톡 노랑 → 갈색 · 하늘색 바탕 → 남색). UX D-137 (B) · §94.
//
// 목적: 웨일 안드로이드가 다크 모드에서 페이지에 **무엇을** 하는지 실기 캡처 한 장으로 가른다.
// | 관찰 | 뜻 | 대응 후보 |
// |---|---|---|
// | computed 색 = 토큰, 캡처 픽셀 ≠ 토큰 | 그리기 단계 변환(Blink 자동 다크 계열 · 자체 필터) — CSS로 못 본다 | 견본 4종 중 살아남는 그리기 방식으로 핵심 색 칠하기 |
// | computed 색 ≠ 토큰 | 주입 CSS(스타일 태그 · 속성) — 목록에 낯선 시트가 보인다 | 주입 표식(속성 · 클래스)을 무력화하는 규칙 |
// | html/body filter ≠ none | filter 반전 | 역필터 보정 |
// | 견본 css · svg · canvas · img 중 일부만 바뀜 | 변환이 요소 종류를 가린다 | 바뀌지 않는 종류로 칠하기 |
//
// ⛔ 관찰만 한다(아무것도 바꾸지 않는다). ⛔ 비밀값 · 토큰 · 세션 id · uid · 대화 내용을 싣지 않는다 — 행은 아래 함수가
// 고정 키로만 만든다. 스타일 시트는 출처 경로와 길이 · 첫 40자만(앱 CSS 아니면 주입 흔적).
// ⚠️ 값 import 0 — 이 파일은 Next 빌드와 `node --test`(확장자 .ts 필요)가 함께 읽는다. 토큰은 호출부가 넘긴다.

export function isThemeDebugEnabled(search: string): boolean {
  try {
    return new URLSearchParams(search).get("themedebug") === "1";
  } catch {
    return false;
  }
}

/** UA의 웨일 주 버전(없으면 null). */
export function whaleMajorVersion(userAgent: string): string | null {
  return /\bWhale\/(\d+)/.exec(userAgent)?.[1] ?? null;
}

export type SheetInfo = { tag: string; href?: string | null; id?: string | null; text?: string | null };

/** 스타일 시트 1개 → 짧은 설명. 같은 출처 링크는 경로만, 다른 출처는 호스트만. 인라인은 길이 + 첫 40자(공백 접음). */
export function describeSheet(sheet: SheetInfo, origin: string): string {
  if (sheet.href) {
    try {
      const url = new URL(sheet.href, origin);
      return `${sheet.tag}:${url.origin === origin ? url.pathname.slice(0, 48) : url.host}`;
    } catch {
      return `${sheet.tag}:?`;
    }
  }
  const text = (sheet.text ?? "").replace(/\s+/g, " ").trim();
  return `${sheet.tag}${sheet.id ? `#${sheet.id}` : ""} len=${text.length} "${text.slice(0, 40)}"`;
}

/** 요소 속성 목록 → 이름=값(값 24자) — 웨일이 html/body에 붙이는 표식을 본다. */
export function describeAttributes(attrs: ReadonlyArray<{ name: string; value: string }>): string {
  return attrs.length === 0 ? "-" : attrs.map((a) => `${a.name}=${a.value.slice(0, 24)}`).join(" ");
}

export type ThemeSwatch = { key: string; hex: string };

/** 견본 색 — 실기 캡처의 픽셀과 맞대 본다(값은 화면 토큰 그대로 — `MESSENGER_CHAT_TOKENS` · One UI 라이트 통화 토큰). */
export function themeSwatches(
  chat: { outgoingBg: string; screenBg: string; incomingBg: string },
  oneUiLightCall: { bg: string; accept: string },
): ThemeSwatch[] {
  return [
    { key: "kakaoOut", hex: chat.outgoingBg },
    { key: "kakaoBg", hex: chat.screenBg },
    { key: "white", hex: chat.incomingBg },
    { key: "oneUiBg", hex: oneUiLightCall.bg },
    { key: "accept", hex: oneUiLightCall.accept },
  ];
}

/** 견본을 칠하는 방식 — 변환이 요소 종류를 가리는지 본다. */
export const SWATCH_METHODS = ["css", "svg", "canvas", "img"] as const;
