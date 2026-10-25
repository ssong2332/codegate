// 개발 단계 루트 강제 지정(2026-10-25) — 화면 판정표 C1~C3 · createSession 래퍼 배선 · 서버 정규식과 같은 글자.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRouteParam } from "./devRouteOverride.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

test("[dev-route] C1~C3 — fv-xxxx는 저장 · off/none/빈 값은 지움 · 그 밖은 그대로", () => {
  assert.deepEqual(parseRouteParam("?route=fv-t8ga"), { kind: "set", variantId: "fv-t8ga" });
  assert.deepEqual(parseRouteParam("?id=x&route=FV-T8GA"), { kind: "set", variantId: "fv-t8ga" });
  for (const s of ["?route=off", "?route=none", "?route="]) assert.deepEqual(parseRouteParam(s), { kind: "clear" }, s);
  for (const s of ["", "?id=x", "?route=t8ga", "?route=fv-t8gaa"]) assert.deepEqual(parseRouteParam(s), { kind: "keep" }, s);
});

test("[dev-route] 배선 — 모든 createSession 호출이 지나는 래퍼가 싣고 · 루트 레이아웃이 어느 화면에서든 저장", () => {
  const wrapper = read("src/lib/api/createSession.ts");
  assert.ok(wrapper.includes("const payload: CreateSessionRequest = { ...request, ...devRouteOverrideRequestField() };"));
  assert.ok(!/"createSession",\s*request,/.test(wrapper) && !wrapper.includes('("createSession", request)'), "원 요청을 그대로 보내는 곳 0");
  const layout = read("src/app/layout.tsx");
  assert.ok(layout.includes("<DevRouteCapture />"));
  // 서버 판정과 같은 ID 꼴.
  assert.ok(read("functions/src/session/devRouteOverride.ts").includes("/^fv-[a-z0-9]{4}$/"));
  assert.ok(read("src/lib/devroute/devRouteOverride.ts").includes("/^fv-[a-z0-9]{4}$/"));
});
