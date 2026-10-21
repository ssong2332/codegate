// 시안 E2 "큰 판 한 장씩"(UX D-141 · docs/Architecture.md §97) — 판 구조의 순수 규칙(렌더 · DOM 없음 → 단위 테스트 대상).
//
// ⭐ 판 구분은 색만으로 하지 않는다: 밝기 교차(어두운 판 ↔ 옅은 판) + 번호 원 + 42px 아이콘 + 옅은 판 경계 1px.
// ⚠️ 색 값은 여기 두지 않는다 — 토큰 이름만 쓰고 값은 `siteTokens.ts`(G630)가 원천이다.

/** 판 하나의 색 조합(토큰 유틸리티 클래스). 어두운 판은 흰 글자, 옅은 판은 진한 글자 + 위 경계선. */
export type PanelTone = {
  readonly name: "brand" | "tint" | "slate" | "sand";
  /** 바탕 · 글자 · (옅은 판이면) 위 경계 */
  readonly surface: string;
  /** 설명 글자 */
  readonly sub: string;
  /** 아이콘 · 번호 원 */
  readonly accent: string;
};

/** 밝기 교차 순서 — 남색(L≈0.42) → 옅은 남색(0.95) → 회청(0.46) → 옅은 모래(0.94). 5번째부터 다시 돈다. */
export const PANEL_TONES: readonly PanelTone[] = [
  { name: "brand", surface: "bg-brand text-white", sub: "text-brand-tint", accent: "text-white" },
  { name: "tint", surface: "bg-brand-tint text-ink border-t border-panel-line", sub: "text-ink-sub", accent: "text-brand" },
  { name: "slate", surface: "bg-panel-slate text-white", sub: "text-brand-tint", accent: "text-white" },
  { name: "sand", surface: "bg-panel-sand text-ink border-t border-panel-line", sub: "text-ink-sub", accent: "text-brand" },
] as const;

export function panelTone(index: number): PanelTone {
  const n = PANEL_TONES.length;
  return PANEL_TONES[((index % n) + n) % n];
}

/**
 * 판 최소 높이(px). 판이 적으면 크게(화면을 나눠 채운다), 많으면 줄여 스크롤로 본다(열린 항목 "판 5개 이상일 때 높이" 해소).
 * 기준: 375×812에서 제목 · 단계 표시를 뺀 남는 높이 ≈ 560px — 4개까지는 한 화면에 들어오고, 5개부터는 한 판이
 * 최소 터치 영역(48px)의 두 배 이상(92px)을 지키며 스크롤된다.
 */
export function panelMinHeight(count: number): number {
  if (count <= 2) return 150;
  if (count <= 4) return 112;
  return 92;
}

/** 판 목록이 남는 높이를 나눠 채우는가(true) · 고정 높이로 쌓이고 스크롤되는가(false). */
export function panelsFillHeight(count: number): boolean {
  return count <= 4;
}

/** 리포트 큰 시계 표기 — 초 → `m:ss`(음수 · 소수는 0 · 내림). */
export function formatClock(totalSeconds: number): string {
  const s = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * 리포트 속은 순간 표기(`timeLabel` — 서버 `elapsedLabel()` = "101초 시점") → 초. 다른 꼴이면 null(시계를 그리지 않는다 —
 * 지어내지 않음). `functions/src/report/analyzeConversation.ts` elapsedLabel과 같은 꼴이어야 한다(G654).
 */
export function parseMomentSeconds(timeLabel: string | null | undefined): number | null {
  const m = typeof timeLabel === "string" ? timeLabel.trim().match(/^(\d+)초 시점$/) : null;
  return m ? Number(m[1]) : null;
}

/** 시계 굴리기 곡선(ease-out cubic) — 진행률 p(0~1) → 표시 값 비율. */
export function clockEase(p: number): number {
  const t = Math.min(1, Math.max(0, p));
  return 1 - Math.pow(1 - t, 3);
}

/** 모션 수치(UX D-141 — motion.css 상한 ≤280ms · ≤8px의 **명시 예외**). 여기와 motion.css가 같은지 G646이 본다. */
export const E2_MOTION = {
  /** 판 확장(clip-path) */
  panelExpandMs: 380,
  /** 판 확장 뒤 덮개가 걷히는 시간 */
  panelFadeMs: 220,
  /** 서랍 곡선 */
  drawerEasing: "cubic-bezier(0.32, 0.72, 0, 1)",
  /** 순차 등장 상승 거리 · 시간 · 간격 */
  riseDistancePx: 22,
  riseMs: 380,
  riseStaggerMs: 50,
  /** 설명 시트 */
  sheetMs: 320,
  /** 리포트 큰 시계 */
  clockMs: 1200,
  /** reduced-motion 대체(불투명도만) */
  reducedFadeMs: 160,
} as const;
