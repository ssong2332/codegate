// 개발 단계 루트 강제 지정(2026-10-25 · 사용자 지시 "현재는 개발 중이니까 다중 루트 강제화 해서 테스트 진행").
// 서버 판정표는 `functions/src/session/devRouteOverride.ts`(서버 파라미터 `DEV_ROUTE_OVERRIDE=true` ∧ 풀에 있을 때만 적용).
//
// | # | If(어느 화면이든 주소의 `route` 쿼리) | Then |
// |---|---|---|
// | C1 | `fv-` + 영숫자 4자 | 이 탭 sessionStorage에 저장 — 이후 화면 이동으로 쿼리가 사라져도 `createSession` 요청에 `forceVariantId`로 싣는다(통화 · 메신저 공통 래퍼) |
// | C2 | `off` · `none` · 빈 값 | 저장값을 지운다(종전 회전 배정) |
// | C3 | 그 밖 · 쿼리 없음 | 저장값을 바꾸지 않는다 |
// ⛔ 화면은 고르지 않는다 — 적용 여부는 서버가 정한다(꺼져 있거나 다른 시나리오의 ID면 서버가 무시 · 경고 로그 1줄).
// ⛔ 저장소를 쓸 수 없으면 아무것도 하지 않는다(비차단).

const STORAGE_KEY = "fv.devRouteOverride";
const VARIANT_ID_RE = /^fv-[a-z0-9]{4}$/;

export type RouteParamAction = { kind: "set"; variantId: string } | { kind: "clear" } | { kind: "keep" };

/** C1~C3 — 순수 함수(`search` = `location.search`). */
export function parseRouteParam(search: string): RouteParamAction {
  const params = new URLSearchParams(search);
  if (!params.has("route")) return { kind: "keep" };
  const value = (params.get("route") ?? "").trim().toLowerCase();
  if (VARIANT_ID_RE.test(value)) return { kind: "set", variantId: value };
  if (value === "" || value === "off" || value === "none") return { kind: "clear" };
  return { kind: "keep" };
}

/** 현재 주소의 `route` 쿼리를 이 탭에 반영한다(C1~C3). */
export function captureDevRouteOverride(): void {
  try {
    const action = parseRouteParam(window.location.search);
    if (action.kind === "set") window.sessionStorage.setItem(STORAGE_KEY, action.variantId);
    else if (action.kind === "clear") window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 비차단.
  }
}

/** createSession 요청에 붙이는 필드(저장값 없음 = 빈 객체 — 필드 부재). 부르는 순간의 주소도 먼저 반영한다. */
export function devRouteOverrideRequestField(): { forceVariantId?: string } {
  try {
    captureDevRouteOverride();
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored && VARIANT_ID_RE.test(stored) ? { forceVariantId: stored } : {};
  } catch {
    return {};
  }
}
