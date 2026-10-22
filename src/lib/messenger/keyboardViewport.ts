// §95(UX D-138 · 실기 신고 9 — 2026-10-21 · 갤럭시 S25 · 라이브 eacf9af) — 메신저 대화방의 키보드 처리. 화면 파생만 한다 — 저장 0 · 서버 0.
//
// 신고 원문: *"카톡형에서 키보드를 입력하려고 하면 화면 전체가 올라가게 되고, 이는 카카오톡 경험과는 전혀 다르다"*.
// 원인: 대화방이 **문서 전체 스크롤**(min-h-screen + sticky 머리줄 · 입력줄)이었다. 안드로이드 Chrome · 웨일의 기본값
// (`interactive-widget=resizes-visual`)은 키보드가 보이는 영역(visual viewport)만 줄이고 레이아웃은 그대로 둔다 ⇒ 입력칸에
// 초점이 가면 브라우저가 문서를 끌어올려 머리줄까지 화면 밖으로 밀린다. iOS Safari도 같은 방식으로 문서를 민다.
//
// 처리 판정표 — 대화방 상자(fixed)의 위치 · 높이:
// | 환경 | visualViewport | 상자 top | 상자 높이 | 문서 스크롤 |
// |---|---|---|---|---|
// | 안드로이드 Chrome · 웨일 · 삼성(resizes-visual) | 있음 | offsetTop(보통 0) | vv.height(키보드만큼 줄어듦) | 잠금 |
// | `interactive-widget=resizes-content` 브라우저 | 있음 | 0 | vv.height(= innerHeight) | 잠금 |
// | iOS Safari(문서를 밀어 offsetTop > 0) | 있음 | offsetTop | vv.height | 잠금 |
// | visualViewport 없음(구형) | 없음 | 0 | 100dvh(CSS) | 잠금 |
// | 서버 렌더 · 첫 그리기 전 | — | 0 | 100dvh(CSS) | — |
// ⇒ 머리줄은 상자 맨 위에 고정, 대화 목록만 줄어들고(내부 스크롤), 입력줄은 키보드 바로 위.
// ⚠️ transform을 쓰지 않고 top을 쓴다 — transform은 안쪽 fixed 오버레이(가짜 페이지 · 전이 연출 · 프로필 시트)의 기준 상자를 바꾼다.
// ⚠️ 공용 레이아웃 · globals.css · viewport meta는 건드리지 않는다(사이트 전반 주소창 · dvh 처리는 다른 작업 — §95.5 충돌 표).

export type KeyboardViewportBox = { heightPx: number; offsetTopPx: number };

type VisualViewportLike = { height: number; offsetTop: number };

/** useSyncExternalStore용 스냅샷(원시값 — 같은 크기면 같은 문자열이라 다시 그리지 않는다). */
export function snapshotOf(vv: VisualViewportLike | null | undefined): string {
  if (!vv || !Number.isFinite(vv.height) || vv.height <= 0) return "";
  return `${Math.round(vv.height)}|${Math.max(0, Math.round(vv.offsetTop))}`;
}

/** 빈 스냅샷(서버 · visualViewport 없음) = null → CSS 100dvh로 둔다. */
export function parseSnapshot(snapshot: string): KeyboardViewportBox | null {
  const [h, top] = snapshot.split("|").map(Number);
  if (!Number.isFinite(h) || h <= 0) return null;
  return { heightPx: h, offsetTopPx: Number.isFinite(top) ? top : 0 };
}

/** 대화방 상자 style — 키보드 상태와 무관하게 "보이는 영역" 하나를 꽉 채운다. */
export function chatBoxStyle(box: KeyboardViewportBox | null): { top: string; height: string } {
  return box ? { top: `${box.offsetTopPx}px`, height: `${box.heightPx}px` } : { top: "0px", height: "100dvh" };
}

/** 목록 맨 아래에 붙어 있다고 볼 거리(px) — 그 안이면 키보드가 열려 목록이 줄어도 마지막 메시지를 입력줄 바로 위에 둔다. */
export const STICK_TO_BOTTOM_PX = 80;

export function isNearBottom(el: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_PX;
}

/**
 * UX D-144(docs/Architecture.md §103.5 · 실기 신고 2026-10-22 · 갤럭시 S25 삼성 키보드) — 훈련 대화 입력칸(메신저 · 통화 텍스트)에
 * 붙이는 키보드 힌트. 키보드가 대화를 읽고 답장 알약("그래 3만원 정도")이나 예측 단어를 띄우면 참가자 스스로 판단하는 훈련이
 * 흐려진다.
 * - `autoComplete="off"` — Chromium 안드로이드가 `EditorInfo.TYPE_TEXT_FLAG_NO_SUGGESTIONS`로 넘기는 **유일한** 웹 신호
 *   (`ImeUtils.computeEditorInfo`). 브라우저 자동 채우기도 끈다.
 * - `autoCorrect="off"` — 같은 함수가 `TYPE_TEXT_FLAG_AUTO_CORRECT`를 빼는 신호.
 * - `spellCheck` · `autoCapitalize`(한글은 영향 없음) — 밑줄 · 영문 대문자 시작을 끈다.
 * - `enterKeyHint="send"` — 엔터 자리를 "보내기"로(입력 형태는 그대로 `text`).
 * ⛔ `autocomplete="one-time-code"` · `type="password"` 같은 우회는 쓰지 않는다 — 인증번호 칸 · 비밀번호 칸으로 알려져
 *   키보드 모양 · 자동 채우기 제안이 바뀌고(문자 인증번호 제안 등), 비밀번호 칸은 한글 입력이 막힌다.
 * ⚠️ 키보드가 이 신호를 지키는지는 키보드 몫이다(웹에서 강제 불가 — §103.5).
 */
export const TRAINING_INPUT_NO_SUGGEST = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  inputMode: "text",
  enterKeyHint: "send",
} as const;
