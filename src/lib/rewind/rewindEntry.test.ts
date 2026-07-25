import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRewindEntry, type RewindEntryInput } from "./rewindEntry.ts";

// T70 / AC-062 · AC-042 — 되감기 진입점 노출 규칙(UX D-39/D-40).

const BASE: RewindEntryInput = {
  reportStatus: "ready",
  deceivedMomentCount: 2,
  isChallengeSession: false,
  afterForcedReplay: false,
};

test("속은 순간이 1건 이상이고 리포트가 준비되면 진입점을 노출한다(AC-062)", () => {
  assert.equal(resolveRewindEntry(BASE), "available");
});

test("속은 순간이 0건이면 진입점을 아예 노출하지 않는다(near-miss를 발명하지 않음, D-40)", () => {
  assert.equal(resolveRewindEntry({ ...BASE, deceivedMomentCount: 0 }), "hidden");
});

test("리포트 준비 중에는 비활성 상태로 알린다(침묵 실패 금지, UF-009 Failure (a))", () => {
  assert.equal(resolveRewindEntry({ ...BASE, reportStatus: "pending" }), "pending");
});

test("리포트 로드에 실패하면 진입점을 노출하지 않는다(없는 데이터로 드릴을 열지 않음)", () => {
  assert.equal(resolveRewindEntry({ ...BASE, reportStatus: "error" }), "hidden");
});

test("2인 챌린지 사용자2는 강제 해설(UX-018) 이전 화면에서 진입점이 보이지 않는다(AC-042)", () => {
  assert.equal(
    resolveRewindEntry({ ...BASE, isChallengeSession: true, afterForcedReplay: false }),
    "hidden",
  );
  // 리포트가 준비 중이어도 마찬가지 — 강제 순서가 준비 상태보다 우선한다.
  assert.equal(
    resolveRewindEntry({
      ...BASE,
      isChallengeSession: true,
      afterForcedReplay: false,
      reportStatus: "pending",
    }),
    "hidden",
  );
});

test("2인 챌린지 사용자2도 강제 해설 이후에는 선택 단계로 진입할 수 있다(AC-062)", () => {
  assert.equal(
    resolveRewindEntry({ ...BASE, isChallengeSession: true, afterForcedReplay: true }),
    "available",
  );
});

test("강제 해설 이후라도 속은 순간이 0건이면 노출하지 않는다", () => {
  assert.equal(
    resolveRewindEntry({
      ...BASE,
      isChallengeSession: true,
      afterForcedReplay: true,
      deceivedMomentCount: 0,
    }),
    "hidden",
  );
});
