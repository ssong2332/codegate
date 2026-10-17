import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { computeDefenseGrade, selectGradeReports } from "../computeDefenseGrade";

// T13, AC-010/AC-011. OQ-5 미확정 임시 산정식(v1)의 계약만 검증한다 — 정확한 임계값은
// 최종안이 아니므로, 여기서는 "sessionCount가 누적 개수와 정확히 일치한다"/"등급명에 항상
// (v1) 표기가 붙는다"/"방어율이 높을수록 더 높은 등급이 나온다"는 구조적 성질을 검증한다.

test("computeDefenseGrade(): reports가 비어 있으면 sessionCount=0을 반환한다", () => {
  const result = computeDefenseGrade([]);
  assert.equal(result.sessionCount, 0);
  assert.ok(result.defenseGrade.length > 0);
});

test("computeDefenseGrade(): sessionCount는 누적 리포트 개수와 정확히 일치한다(AC-011)", () => {
  const reports = [{ wasDeceived: true }, { wasDeceived: false }, { wasDeceived: false }];
  const result = computeDefenseGrade(reports);
  assert.equal(result.sessionCount, 3);
});

test("computeDefenseGrade(): 한 번도 속지 않았으면(방어율 100%) 가장 높은 등급을 받는다", () => {
  const reports = [{ wasDeceived: false }, { wasDeceived: false }];
  const result = computeDefenseGrade(reports);
  assert.equal(result.defenseGrade, "사기 방어 마스터 (v1)");
});

test("computeDefenseGrade(): 매번 속았으면(방어율 0%) 가장 낮은 등급을 받는다", () => {
  const reports = [{ wasDeceived: true }, { wasDeceived: true }];
  const result = computeDefenseGrade(reports);
  assert.equal(result.defenseGrade, "초보 방어자 (v1)");
});

test("computeDefenseGrade(): 방어율이 높을수록 더 높은(또는 같은) 등급 순위를 받는다(단조성)", () => {
  const low = computeDefenseGrade([{ wasDeceived: true }, { wasDeceived: true }, { wasDeceived: false }]);
  const high = computeDefenseGrade([{ wasDeceived: false }, { wasDeceived: false }, { wasDeceived: true }]);
  const order = ["초보 방어자 (v1)", "주의가 필요한 방어자 (v1)", "성장하는 방어자 (v1)", "능숙한 방어자 (v1)", "사기 방어 마스터 (v1)"];
  assert.ok(order.indexOf(high.defenseGrade) >= order.indexOf(low.defenseGrade));
});

test("computeDefenseGrade(): 모든 등급명에 임시값 표기 '(v1)'이 붙는다(투명 고지, OQ-5 미확정)", () => {
  const cases = [
    [],
    [{ wasDeceived: true }],
    [{ wasDeceived: false }],
    [{ wasDeceived: true }, { wasDeceived: false }],
  ];
  for (const reports of cases) {
    const result = computeDefenseGrade(reports);
    assert.match(result.defenseGrade, /\(v1\)$/);
  }
});

// T186(R-5 · User 결정 2026-10-17) — Google 계정으로 동의한 2인 챌린지 체험 리포트는 등급 · sessionCount에서 빠진다.
test("[T186 R-5] selectGradeReports(): challengeId가 있는 리포트를 빼고, 나머지는 순서 그대로 남긴다", () => {
  const reports = [
    { id: "own-1", wasDeceived: false },
    { id: "challenge", wasDeceived: true, challengeId: "ch1" },
    { id: "own-2", wasDeceived: true },
  ];
  assert.deepEqual(
    selectGradeReports(reports).map((r) => r.id),
    ["own-1", "own-2"],
  );
  assert.deepEqual(selectGradeReports([{ wasDeceived: true, challengeId: "ch1" }]), []);
});

test("[T186 R-5] 체험 리포트가 섞여도 등급 · sessionCount는 자기 훈련 리포트만으로 산정된다(AC-011)", () => {
  const own = [{ wasDeceived: false }, { wasDeceived: false }];
  const withChallenge: { wasDeceived: boolean; challengeId?: string }[] = [...own, { wasDeceived: true, challengeId: "ch1" }];
  assert.deepEqual(computeDefenseGrade(selectGradeReports(withChallenge)), computeDefenseGrade(own));
  assert.equal(computeDefenseGrade(selectGradeReports(withChallenge)).sessionCount, 2);
});

test("[T186 R-5 배선] updateDefenseGrade가 selectGradeReports를 거친 리포트로 computeDefenseGrade를 부른다", () => {
  const source = readFileSync(path.join(__dirname, "../../../src/report/generateReportCore.ts"), "utf8");
  const start = source.indexOf("async function updateDefenseGrade");
  assert.ok(start >= 0, "updateDefenseGrade를 찾지 못했다");
  const body = source.slice(start, source.indexOf("\n}\n", start));
  const selectAt = body.indexOf("selectGradeReports(");
  const computeAt = body.indexOf("computeDefenseGrade(results)");
  assert.ok(selectAt >= 0, "updateDefenseGrade가 selectGradeReports를 거치지 않는다 — 체험 리포트가 등급에 섞인다");
  assert.ok(computeAt > selectAt, "computeDefenseGrade가 거르기 전에 불린다");
});
