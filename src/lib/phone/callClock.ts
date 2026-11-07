// T190-3 — 통화 경과 시간 표기 (UX-014 v1.33 (3) · D-86 · P-10 v1.33 · docs/Architecture.md §74.6 (3)).
//
// ⭐ 경과 시간은 **번호 바로 아래 한 줄 하나뿐**이다(가짜 OS 상태바 제거 — P-37 R-1). 같은 값이 통화 표시줄
// (문자함·확인 시트 — `elapsedLabel`)에도 흐른다.
// 잎(leaf) 모듈 — import 0.

const pad2 = (n: number) => n.toString().padStart(2, "0");

/**
 * `mm:ss` · 1시간 이상 `h:mm:ss`(UX-014 v1.33 (3)). 예전 `m:ss`는 60분을 넘어도 분이 계속 커졌다(§74.6 (3)).
 * 음수·비정수는 0 이상 정수로 내린다.
 */
export function formatCallElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** 스크린리더 접근 이름(UX-014 v1.33 (3) — 숫자를 매초 읽지 않는다 · 포커스 시 이 이름). */
export function spokenCallElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `통화 중, 경과 ${h > 0 ? `${h}시간 ` : ""}${m}분 ${s}초`;
}

/**
 * 2026-11-07 Edge 시험 판 1 · 26 — 통화 화면 경과는 **지금 통화가 연결된 시각부터의 벽시계 경과**다(실제 휴대폰 — 새 통화 = 00:00).
 * 종전은 1초마다 1씩 더해(`setInterval`) 탭이 멈추면 늦게 갔고(판 1 — 화면 07:27 · 실제 12:39), 다통화에서는 세션 경과가 이어졌다
 * (판 26 — 다시 걸려 온 전화 03:04 · 상담원 04:54 · 검사 14:32).
 * | # | If | Then |
 * |---|---|---|
 * | 1 | 연결 시각을 안다 | `floor((now − 연결 시각) / 1000)`(음수 = 0) |
 * | 2 | 모른다(`null`) | `fallbackSec`(종전 값) |
 */
export function callElapsedSince(nowMs: number, callStartMs: number | null, fallbackSec: number): number {
  if (callStartMs === null || !Number.isFinite(callStartMs)) return Math.max(0, Math.floor(fallbackSec));
  return Math.max(0, Math.floor((nowMs - callStartMs) / 1000));
}
