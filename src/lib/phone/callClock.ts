// T190-3 — 통화 경과 시간 표기 (UX-014 v1.33 (3) · D-86 · P-10 v1.33 · docs/Architecture.md §73.6 (3)).
//
// ⭐ 경과 시간은 **번호 바로 아래 한 줄 하나뿐**이다(가짜 OS 상태바 제거 — P-37 R-1). 같은 값이 통화 표시줄
// (문자함·확인 시트 — `elapsedLabel`)에도 흐른다.
// 잎(leaf) 모듈 — import 0.

const pad2 = (n: number) => n.toString().padStart(2, "0");

/**
 * `mm:ss` · 1시간 이상 `h:mm:ss`(UX-014 v1.33 (3)). 예전 `m:ss`는 60분을 넘어도 분이 계속 커졌다(§73.6 (3)).
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
