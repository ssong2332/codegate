// §130.6(N7 · UX D-161 (16) — 재측정 2026-10-24b: 글자 200% · 360×640 통화에서 화면 아래에 붙은 하단 판이 통화 시간 글자를 덮었다).
// 통화 화면 위쪽(번호 · 경과 시간)이 하단 판 밑으로 들어가면 아바타를 접어 그 자리를 위쪽에 준다. 글자 크기는 화면 높이 media로 알 수 없어
// 실제 위치로 판정한다. ⚠️ 잎 모듈(아무것도 import하지 않는다) — 테스트가 직접 읽는다.
//
// | 지금 아바타 | If | Then |
// |---|---|---|
// | 보임 | 번호 · 시간 묶음 아래 끝 > 하단 판 위 끝(겹침) | 접는다 |
// | 보임 | 겹치지 않음 | 그대로(글자 100%에서는 늘 여기 — 종전 화면 그대로) |
// | 접힘 | 아바타 자리(`AVATAR_BLOCK_PX`)를 되돌려도 겹치지 않음 | 다시 보인다 |
// | 접힘 | 되돌리면 다시 겹침 | 접힌 채(왔다 갔다 0) |

/** 아바타 원 88px + 아래 여백 20px(`mb-5`). */
export const AVATAR_BLOCK_PX = 108;

export function shouldHideCallAvatar(input: { hidden: boolean; infoBottom: number; panelTop: number }): boolean {
  const { hidden, infoBottom, panelTop } = input;
  if (!Number.isFinite(infoBottom) || !Number.isFinite(panelTop)) return hidden;
  return hidden ? infoBottom + AVATAR_BLOCK_PX > panelTop : infoBottom > panelTop;
}
