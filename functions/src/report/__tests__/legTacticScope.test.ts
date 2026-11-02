import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { findFlowVariant, multiCallLegTactics, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { messageLegIndex } from "../../callLegs/legPlan";

// §142 N3(R2 재실측 2026-11-02 — `docs/research/card-rebuild-probe-2026-11-02.md`) — 다통화 변형 리포트는 대사의 수법을 **그 대사가 오간 통화**의
// 목록에서만 고른다(서버가 메시지에 쓴 `legIndex`). 마지막 통화의 안전계좌 이체 응답이 상담원 통화의 "보안 점검 앱 설치 요구"로 분류되던 결함.

const SCENARIO = "card-company-impersonation";
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
const R2 = () => findFlowVariant("fv-r8vb")!;
const msgs = (rows: [AnalysisMessage["role"], string, number | undefined][]): AnalysisMessage[] =>
  rows.map(([role, textMasked, legIndex], i) => ({ role, textMasked, turnIndex: i, createdAtMs: i * 1000, ...(legIndex !== undefined ? { legIndex } : {}) }));
// R2 재실측 실제 대사(레그 3 — 감독기관 두 번째 통화).
const SAFE_ACCOUNT_LINE = "조사가 끝날 때까지 자산을 안전하게 보호해야 합니다. 방금 보내 드린 안전계좌 안내 문자 링크를 통해 구백팔십만 원을 옮겨 주세요.";

test("[§142 N3 재현 · 수정] 마지막 통화 안전계좌 이체 응답 — 통화 범위 없음 = 설치 요구(결함) · 통화 범위 = 자산 보호 이체 요구", () => {
  const v = R2();
  const m = msgs([["scammer", SAFE_ACCOUNT_LINE, 3], ["user", "네, 보냈어요.", 3]]);
  assert.deepEqual(analyzeConversation(m, 0, [...v.tactics]).deceivedMoments.map((d) => d.tactic), ["보안 점검 앱 설치 요구"]);
  assert.deepEqual(analyzeConversation(m, 0, [...v.tactics], [], multiCallLegTactics(v)).deceivedMoments.map((d) => d.tactic), ["자산 보호 이체 요구"]);
});

test("[§142 N3] 상담원 통화의 설치 요구 응답은 그대로 설치 요구 · 시도된 수법은 통화별 목록 안에서만", () => {
  const v = R2();
  const m = msgs([
    ["scammer", "피해가 번지지 않게 휴대폰 보안 점검부터 하셔야 합니다, 방금 보내 드린 문자의 링크에서 원격 지원 도우미를 설치해 주세요.", 0],
    ["user", "네, 눌러서 설치했어요.", 0],
    ["scammer", SAFE_ACCOUNT_LINE, 3],
    ["user", "네, 보냈어요.", 3],
  ]);
  const a = analyzeConversation(m, 0, [...v.tactics], [], multiCallLegTactics(v));
  assert.deepEqual(a.deceivedMoments.map((d) => d.tactic), ["보안 점검 앱 설치 요구", "자산 보호 이체 요구"]);
  const legLabels = multiCallLegTactics(v)!.map((tactics) => tactics.map((t) => t.split(" — ")[0]));
  for (const label of a.tacticsUsed) assert.ok(legLabels.some((labels) => labels.includes(label)), label);
});

test("[§142 N3 하위호환] legIndex 없는 메시지(옛 문서) · 통화 범위 인자 부재 = 종전 판정 그대로", () => {
  const v = R2();
  const rows: [AnalysisMessage["role"], string, number | undefined][] = [["scammer", SAFE_ACCOUNT_LINE, undefined], ["user", "네, 보냈어요.", undefined]];
  const legacy = analyzeConversation(msgs(rows), 0, [...v.tactics]);
  assert.deepEqual(analyzeConversation(msgs(rows), 0, [...v.tactics], [], multiCallLegTactics(v)), legacy);
  // 범위 밖 legIndex도 종전.
  const outOfRange = msgs([["scammer", SAFE_ACCOUNT_LINE, 9], ["user", "네, 보냈어요.", 9]]);
  assert.deepEqual(analyzeConversation(outOfRange, 0, [...v.tactics], [], multiCallLegTactics(v)).deceivedMoments, legacy.deceivedMoments);
});

test("[§142 N3] 통화별 수법 목록 = 레그 프롬프트가 모델에게 주는 목록 · 다통화 아님 = undefined", () => {
  for (const id of ["fv-k3dn", "fv-r8vb"]) {
    const v = findFlowVariant(id)!;
    const legTactics = multiCallLegTactics(v)!;
    assert.equal(legTactics.length, v.legs.length);
    legTactics.forEach((tactics, i) => assert.deepEqual(tactics, resolveSessionScenarioPrompt(SCENARIO, id, i)!.weakenedTactics));
  }
  assert.equal(multiCallLegTactics(findFlowVariant("fv-akj5")), undefined);
  assert.equal(multiCallLegTactics(undefined), undefined);
});

test("[§142 N3 메시지 통화 번호] 서버 relay 기준 · 다통화 아님 · 다른 시나리오 = undefined", () => {
  assert.equal(messageLegIndex(R2(), { scenarioId: SCENARIO, relay: { legIndex: 3, legStartUserTurns: [0, 7, 9, 11], legEnded: 3 } }), 3);
  assert.equal(messageLegIndex(R2(), { scenarioId: SCENARIO }), 0);
  assert.equal(messageLegIndex(findFlowVariant("fv-akj5"), { scenarioId: SCENARIO }), undefined);
  assert.equal(messageLegIndex(R2(), { scenarioId: "institutional-impersonation" }), undefined);
});

test("[§142 N3 배선] 전사 제출 · 폴백 턴이 legIndex를 쓰고 리포트가 읽어 통화 범위로 넘긴다", () => {
  const submit = read("realtime/submitTranscript.ts");
  assert.ok(submit.includes("const legIndex = messageLegIndex(findFlowVariant(session.flowVariantId), session);"));
  assert.ok(submit.includes("...(legIndex !== undefined ? { legIndex } : {}),"));
  const roleplay = read("roleplay/index.ts");
  assert.equal((roleplay.match(/\.\.\.\(sessionCallLeg \? \{ legIndex: sessionCallLeg\.legIndex \} : \{\}\),/g) ?? []).length, 2, "참가자 턴 · 사기범 턴");
  const core = read("report/generateReportCore.ts");
  assert.ok(core.includes('...(typeof data.legIndex === "number" ? { legIndex: data.legIndex } : {}),'));
  assert.ok(core.includes("multiCallLegTactics(multiCallVariant),"));
});
