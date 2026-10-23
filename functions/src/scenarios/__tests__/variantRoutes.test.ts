// §119(DECISIONS #234) — 다중 루트 0차 불변식: 루트 표 · 배정 풀 안 루트 중복 0(D-11) · 끊기 할 일 완료 매핑 · 리포트 루트 줄(D-3 b).
// 설계: docs/research/scenario-multi-route-plan-2026-10.md §3.1 · §3.4.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { FLOW_VARIANTS, VARIANT_ROUTES, listFlowVariants } from "../flowVariants";
import { assignablePool } from "../variantPool";
import { hasVerifyIntercept } from "../verifyIntercept";
import { PUBLIC_SCENARIOS, isAdvancedOnlyScenario } from "../publicMeta";
import { DIFFICULTY_LEVELS } from "../../shared/difficulty";
import { resolveRouteSummary } from "../../report/routeSummary";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/** 배정 풀 칸 전부 — (시나리오 × 난이도 × {자가 · 챌린지}), 챌린지가 거부되는 조합은 뺀다(variantAssignment.test G590과 같은 규칙). */
function poolCells() {
  const cells: { id: string; level: (typeof DIFFICULTY_LEVELS)[number]; challengeId?: string }[] = [];
  for (const id of Object.keys(PUBLIC_SCENARIOS)) {
    for (const level of DIFFICULTY_LEVELS) {
      if (listFlowVariants(id, level).length === 0) continue;
      cells.push({ id, level });
      if (!PUBLIC_SCENARIOS[id].escalation && !isAdvancedOnlyScenario(id)) cells.push({ id, level, challengeId: "c1" });
    }
  }
  return cells;
}

test("[§119 루트 표] 변형 전부(은퇴 포함)가 루트 키 · 이름을 가진다 — 표와 변형 ID가 1:1 · 키는 kebab · 이름은 '~형' · 같은 (시나리오 × 키)는 같은 이름", () => {
  assert.deepEqual(Object.keys(VARIANT_ROUTES).sort(), FLOW_VARIANTS.map((v) => v.variantId).sort(), "루트 표와 변형 목록이 어긋난다");
  const labelOf = new Map<string, string>();
  for (const v of FLOW_VARIANTS) {
    assert.match(v.routeKey, /^[a-z]+(-[a-z]+)*$/, `${v.variantId}: 루트 키 형식`);
    assert.match(v.routeLabel, /^\S.*형$/, `${v.variantId}: 루트 이름은 '~형'`);
    const key = `${v.scenarioId}/${v.routeKey}`;
    const prev = labelOf.get(key);
    if (prev !== undefined) assert.equal(v.routeLabel, prev, `${key}: 같은 루트 키에 다른 이름`);
    labelOf.set(key, v.routeLabel);
  }
});

test("[§119 D-11] 배정 풀 칸마다 루트 키가 서로 다르다(같은 결말 2벌이 덱에 있으면 그 결말이 2/n로 나온다) · 역방향: fv-pgqt를 되살리면 걸린다", (t) => {
  const dupes: string[] = [];
  let cells = 0;
  let multi = 0;
  for (const { id, level, challengeId } of poolCells()) {
    const keys = assignablePool(id, level, challengeId).map((v) => v.routeKey);
    if (new Set(keys).size !== keys.length) dupes.push(`${id}/${level}/${challengeId ? "챌린지" : "자가"}: ${keys.join(",")}`);
    if (keys.length >= 2) multi += 1;
    cells += 1;
  }
  t.diagnostic(`[§119] 풀 ${cells}칸 · 루트 2개 이상 ${multi}칸`);
  assert.deepEqual(dupes, []);
  // 역방향 — 은퇴 전 기관 사칭 고급 풀(fv-c5fj · fv-pgqt)은 같은 키 2벌이다.
  const before = FLOW_VARIANTS.filter((v) => v.variantId === "fv-c5fj" || v.variantId === "fv-pgqt").map((v) => v.routeKey);
  assert.equal(before.length, 2);
  assert.equal(new Set(before).size, 1, "역방향 표본 — 은퇴 전 풀은 루트 키가 겹쳤다");
});

test("[§119 끊기 매핑] 확인 무력화 고급 풀의 변형은 '문자 선언 ≥ 1 ∧ 필수 0'이 아니다 — 그 조합이면 4행 할 일 완료(C-3 · C-5)가 영영 안 열린다", () => {
  const bad: string[] = [];
  for (const { id, level, challengeId } of poolCells()) {
    if (level !== "advanced" || !hasVerifyIntercept(id)) continue;
    for (const v of assignablePool(id, level, challengeId)) {
      if (v.sms.length > 0 && !v.sms.some((s) => s.required)) bad.push(`${id}/${v.variantId}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("[§119 D-3 b] 리포트 루트 줄 — 루트 2가지 이상인 칸만 · 부재 · 모름 · 다른 시나리오 ID · 1루트 칸은 없음", () => {
  const cc = (flowVariantId?: string, challengeId?: string) =>
    resolveRouteSummary({ scenarioId: "card-company-impersonation", difficultyLevel: "advanced", flowVariantId, challengeId });
  assert.deepEqual(cc("fv-w3dq"), { label: "카드 배송 안내형", routeCount: 2 });
  assert.deepEqual(cc("fv-x7ue"), { label: "보안 앱 설치형", routeCount: 2 });
  assert.equal(cc(undefined), undefined, "변형 도입 이전 세션 — 무소급");
  assert.equal(cc("fv-nope"), undefined);
  assert.equal(cc("fv-c5fj"), undefined, "다른 시나리오의 변형 ID");
  assert.equal(cc("fv-akj5", "c1"), undefined, "챌린지 고급 카드사 풀은 1루트");
  assert.equal(
    resolveRouteSummary({ scenarioId: "tax-refund-scam", difficultyLevel: "advanced", flowVariantId: "fv-uk7m" }),
    undefined,
    "1루트 칸은 줄 0",
  );
  // §122 — 은퇴 변형으로 진행한 옛 세션도 그 칸의 현재 결말 수로 줄을 만든다(이름은 그 변형의 루트 이름).
  assert.deepEqual(
    resolveRouteSummary({ scenarioId: "institutional-impersonation", difficultyLevel: "advanced", flowVariantId: "fv-pgqt" }),
    { label: "안전계좌 이체형", routeCount: 3 },
  );
});

test("[§119 X1 · 세션 중 비노출] 클라 소스에 루트 키 · 루트 표 참조 0 — 클라가 아는 것은 리포트의 routeSummary(이름 · 개수)뿐", () => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && /routeKey|VARIANT_ROUTES/.test(fs.readFileSync(full, "utf-8"))) hits.push(full);
    }
  };
  walk(path.join(REPO_ROOT, "src"));
  assert.deepEqual(hits, []);
  // 세션 시작 응답에는 루트 정보가 없다(createSession 응답 블록).
  const session = fs.readFileSync(path.join(REPO_ROOT, "functions/src/session/index.ts"), "utf-8");
  const handler = session.slice(session.indexOf("export const createSession"), session.indexOf("export const endSession"));
  assert.equal(/route(Summary|Label|Key)/.test(handler.slice(handler.lastIndexOf("return {"))), false);
});
