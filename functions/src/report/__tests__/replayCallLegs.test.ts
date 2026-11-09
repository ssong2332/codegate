// Edge 재시험 19 ②(2026-11-09) — 리플레이 통화별 발신 표시 스냅샷(`replayCallLegs.ts` 판정표 C) · 리포트 문서 배선.
// 화면 쪽 판정표 R은 루트 `src/lib/replay/replayCaller.test.ts`(같은 fv-c5fj 값).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replayCallLegs } from "../replayCallLegs";
import { findFlowVariant, listFlowVariants } from "../../scenarios/flowVariants";

test("[재시험 19 ② 재현 · C2] fv-c5fj = 통화 1 · 3 사칭 번호 · 통화 2 캐피탈 상담원 번호 + genuine", () => {
  assert.deepEqual(replayCallLegs(findFlowVariant("fv-c5fj")), [
    { callerLabel: "02-6478-2718" },
    { callerLabel: "02-0719-3300", genuine: true },
    { callerLabel: "02-6478-2718" },
  ]);
});

test("[C1 · C2] 다통화 아님 = 필드 0 · 다통화 = 레그 수만큼 · genuine은 정당한 제3자 레그만", () => {
  assert.equal(replayCallLegs(undefined), undefined);
  assert.equal(replayCallLegs(findFlowVariant("fv-5cn4")), undefined, "기관 사칭 초급(1통화)");
  const k3dn = findFlowVariant("fv-k3dn")!;
  const legs = replayCallLegs(k3dn)!;
  assert.equal(legs.length, k3dn.legs.length);
  assert.equal(legs.some((l) => l.genuine), false, "카드사 R1 = 정당한 통화 0");
  for (const id of ["institutional-impersonation", "card-company-impersonation"]) {
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      for (const variant of listFlowVariants(id, level)) {
        const snap = replayCallLegs(variant);
        if (!variant.multiCall) assert.equal(snap, undefined, variant.variantId);
        else assert.deepEqual(snap!.map((l) => l.genuine === true), variant.legs.map((l) => l.genuine === true), variant.variantId);
      }
    }
  }
});

test("[재시험 19 ② 배선] 리포트 문서가 다통화 변형 스냅샷을 싣는다(부재 = 필드 0)", () => {
  const src = readFileSync(join(__dirname, "..", "..", "..", "src", "report", "generateReportCore.ts"), "utf8");
  assert.ok(src.includes("const callLegs = replayCallLegs(multiCallVariant);"));
  assert.ok(src.includes("...(callLegs ? { callLegs } : {}),"));
});
