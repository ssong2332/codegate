// §130(UX D-161 (14) · 메인 결정 2026-10-24 — 원문 선택 "최대 4줄 자동 (권장)") — 메신저 입력칸 높이.
// 한 줄(48px)로 시작해 내용만큼 늘고 4줄에서 멈춘다(그 뒤는 칸 안 스크롤). §110.1의 한 줄 textarea(자동 채우기 줄 회피)는 그대로 — 늘어나는 건 높이뿐이다.
// ⚠️ 잎 모듈(아무것도 import하지 않는다) — 테스트가 직접 읽는다.
//
// | 입력 | 높이 |
// |---|---|
// | 빈 칸 · 한 줄 | 48px(종전 그대로) |
// | 2~4줄 | 내용 높이(`scrollHeight`) |
// | 5줄 이상 | 4줄 높이에서 멈춤 · 칸 안 스크롤 |

/** 한 줄 높이(종전 `h-[48px]`). */
export const CHAT_INPUT_MIN_PX = 48;
/** 글자 17px × 줄 간격 1.5 = 25.5px. */
export const CHAT_INPUT_LINE_PX = 25.5;
/** 위아래 안쪽 여백(`py-[11px]`) + 테두리 1px × 2. */
export const CHAT_INPUT_CHROME_PX = 24;
export const CHAT_INPUT_MAX_LINES = 4;
/** 4줄 높이 = 4 × 25.5 + 24 = 126px. */
export const CHAT_INPUT_MAX_PX = Math.ceil(CHAT_INPUT_MAX_LINES * CHAT_INPUT_LINE_PX + CHAT_INPUT_CHROME_PX);

/** 입력칸이 가질 높이(px). `scrollHeight`는 높이를 `auto`로 되돌린 뒤 잰 내용 높이다. */
export function chatInputHeight(scrollHeight: number): number {
  if (!Number.isFinite(scrollHeight)) return CHAT_INPUT_MIN_PX;
  return Math.min(CHAT_INPUT_MAX_PX, Math.max(CHAT_INPUT_MIN_PX, Math.ceil(scrollHeight)));
}
