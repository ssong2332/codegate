// 리포트 머리의 "이번 결말" 1줄 — 순수 함수 (§119 · DECISIONS #234 · 사용자 결정 D-3 b).
//
// 같은 시나리오 · 같은 난이도라도 결말(돈 · 정보가 빠지는 방식)이 여러 갈래일 수 있고, 세션마다 그중 하나가 무작위로 정해진다.
// 서버는 결말이 2가지 이상인 칸에서만 `reports.routeSummary`(이름 · 개수)를 남긴다 — 부재 = 줄 0(무백필).
// ⚠️ 세션 **중**에는 결말을 알리지 않는다(D-50과 같은 원칙 — 끝난 뒤 리포트에서만).

export type RouteSummaryView = { label: string; routeCount: number };

/** Firestore 값 → 화면 값. 모양이 다르거나 개수가 2 미만이면 null(줄을 그리지 않는다). */
export function readRouteSummary(raw: unknown): RouteSummaryView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { label, routeCount } = raw as { label?: unknown; routeCount?: unknown };
  if (typeof label !== "string" || label.trim() === "") return null;
  if (typeof routeCount !== "number" || !Number.isInteger(routeCount) || routeCount < 2) return null;
  return { label: label.trim(), routeCount };
}

export function buildRouteSummaryLine(view: RouteSummaryView): string {
  return `이번 결말: ${view.label} · 이 시나리오에는 결말이 ${view.routeCount}가지 있어요`;
}
