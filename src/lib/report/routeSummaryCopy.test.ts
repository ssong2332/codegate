// 리포트 "이번 결말" 1줄 — §119(D-3 b).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRouteSummaryLine, readRouteSummary } from "./routeSummaryCopy.ts";

test("[§119 D-3 b] 결말 2가지 이상 — 이름과 개수를 한 줄로", () => {
  const view = readRouteSummary({ label: "카드 배송 안내형", routeCount: 2 });
  assert.deepEqual(view, { label: "카드 배송 안내형", routeCount: 2 });
  assert.equal(buildRouteSummaryLine(view!), "이번 결말: 카드 배송 안내형 · 이 시나리오에는 결말이 2가지 있어요");
});

test("[§119 D-3 b] 부재 · 모양 다름 · 1가지 — 줄 0(과거 리포트 무백필)", () => {
  for (const raw of [undefined, null, "x", {}, { label: "" }, { label: "A형", routeCount: 1 }, { label: "A형", routeCount: 2.5 }, { label: 3, routeCount: 2 }]) {
    assert.equal(readRouteSummary(raw), null, JSON.stringify(raw));
  }
});
