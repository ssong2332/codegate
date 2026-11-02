// 개발 단계 루트 강제 지정(2026-10-25) — 판정표 F0~F4(`devRouteOverride.ts`) · 회전 덱 무접촉 · createSession 배선.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { decideDevRouteOverride } from "../devRouteOverride";
import { commitSessionWithVariant } from "../variantAssignment";
import { assignablePool } from "../../scenarios/variantPool";
import { isDevRouteOverrideEnabled } from "../../shared/config";

const base = { enabled: true, scenarioId: "institutional-impersonation", level: "advanced" as const };

test("[dev-route] F0~F4 — 부재 · 꺼짐 · 형식 · 풀 밖은 무시, 풀 안이면 적용", () => {
  const pool = assignablePool(base.scenarioId, base.level).map((v) => v.variantId);
  assert.ok(pool.length >= 2, "다중 루트 풀");
  const target = pool[pool.length - 1]!;
  assert.deepEqual(decideDevRouteOverride({ ...base, requested: undefined }), { applied: false });
  assert.deepEqual(decideDevRouteOverride({ ...base, requested: "" }), { applied: false });
  assert.deepEqual(decideDevRouteOverride({ ...base, enabled: false, requested: target }), { applied: false, reason: "disabled" });
  for (const bad of ["FV-ABCD", "fv-abc", "fv-abcde", 42, "q7cn"]) {
    assert.deepEqual(decideDevRouteOverride({ ...base, requested: bad }), { applied: false, reason: "malformed" }, String(bad));
  }
  // 다른 시나리오의 ID · 같은 시나리오의 다른 난이도 ID는 풀 밖.
  assert.deepEqual(decideDevRouteOverride({ ...base, requested: "fv-c5ih" }), { applied: false, reason: "not-in-pool" });
  assert.deepEqual(decideDevRouteOverride({ ...base, requested: "fv-zzzz" }), { applied: false, reason: "not-in-pool" });
  for (const id of pool) assert.deepEqual(decideDevRouteOverride({ ...base, requested: id }), { applied: true, variantId: id });
});

test("[dev-route] 서버 파라미터는 바인딩 전(단위 테스트)에는 꺼짐", () => {
  assert.equal(isDevRouteOverrideEnabled(), false);
});

test("[dev-route] 강제 배정(후보 1 · rotationRef 없음)은 회전 문서를 읽지도 쓰지도 않는다", async () => {
  const writes: string[] = [];
  let reads = 0;
  const sessionRef = { path: "sessions/s1" };
  const db = {
    runTransaction: async (fn: (tx: unknown) => Promise<string>) =>
      fn({
        get: async () => {
          reads += 1;
          return { exists: false, get: () => undefined };
        },
        set: (ref: { path: string }) => writes.push(ref.path),
      }),
  };
  const id = await commitSessionWithVariant(
    db as never,
    sessionRef as never,
    { uid: "u" },
    { flowVariantId: "fv-q7cn", candidates: ["fv-q7cn"] },
    0,
  );
  assert.equal(id, "fv-q7cn");
  assert.equal(reads, 0);
  assert.deepEqual(writes, ["sessions/s1"]);
});

test("[dev-route] createSession 배선 — 적용 시 회전 배정을 건너뛰고 세션 문서에 routeOverride 표식", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/session/index.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.ok(src.includes("requested: forceVariantId,"));
  assert.ok(
    src.includes(
      // 보안 점검 후속(2026-11-02) — 예약 뒤 본문이 try/finally 안으로 들어가 들여쓰기가 2칸 늘었다.
      "const variantAssignment = routeOverride.applied\n        ? { flowVariantId: routeOverride.variantId, candidates: [routeOverride.variantId] }\n        : await assignFlowVariantForSession(",
    ),
  );
  assert.ok(src.includes('...(routeOverride.applied ? { routeOverride: "forced" as const } : {}),'));
});
