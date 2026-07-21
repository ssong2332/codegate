import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDefenseGrade } from "../computeDefenseGrade";

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
