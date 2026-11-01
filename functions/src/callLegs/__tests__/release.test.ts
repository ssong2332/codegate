import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { CARD_REBUILD_REPORT_LESSONS, findFlowVariant, listFlowVariants } from "../../scenarios/flowVariants";
import { findInCallSmsItem } from "../../scenarios/inCallSms";
import { buildInCallSmsDoc } from "../../inCallSms/buildDoc";
import { withRouteLessons } from "../../report/generateReportCore";
import { Timestamp } from "firebase-admin/firestore";

// §142 PR-4(사용자 승인 설계 #470 · "권고대로") — 카드사 고급 재구성 배정 해제 · 옛 루트 은퇴 · R2 시작 문자 · 리포트 교육 포인트.

const SCENARIO = "card-company-impersonation";
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");

test("[§142 PR-4 배정] 카드사 고급 배정 풀 = 재구성 2루트(fv-k3dn · fv-r8vb) · fv-x7ue · fv-w3dq는 은퇴(옛 세션 해석은 그대로)", () => {
  const pool = listFlowVariants(SCENARIO, "advanced").map((v) => v.variantId);
  assert.ok(pool.includes("fv-k3dn") && pool.includes("fv-r8vb"), `배정 풀: ${pool.join(", ")}`);
  assert.ok(!pool.includes("fv-x7ue") && !pool.includes("fv-w3dq"));
  for (const id of ["fv-x7ue", "fv-w3dq"]) {
    assert.equal(findFlowVariant(id)?.retired, true, `${id}는 은퇴 표식`);
    assert.ok(findFlowVariant(id), `${id} 옛 세션 해석은 남는다`);
  }
  for (const id of ["fv-k3dn", "fv-r8vb"]) assert.equal(findFlowVariant(id)?.pendingRollout, undefined);
});

test("[§142 PR-4 R2] 시작 문자 = 카탈로그 번호 안내 문자(가짜 대표번호) · 세션 생성이 도착시키고 startSurface를 쓴다", () => {
  const r2 = findFlowVariant("fv-r8vb")!;
  assert.equal(r2.openerSmsId, "card-issue-notice");
  const item = findInCallSmsItem(SCENARIO, r2.openerSmsId!)!;
  assert.equal(item.kind, "callback");
  const doc = buildInCallSmsDoc(item, Timestamp.fromMillis(0), 0, SCENARIO);
  assert.equal(doc.dialNumber, "02-0762-5513");
  assert.ok(doc.body.includes(doc.dialNumber!), "본문에 같은 번호가 있어야 화면이 누를 수 있게 그린다");
  const session = read("session/index.ts");
  assert.ok(session.includes("findInCallSmsItem(scenarioId, openerVariant.openerSmsId)"));
  assert.ok(session.includes('await sessionRef.set({ startSurface: "sms" }, { merge: true });'));
  // 시작 문자는 확정 배정 뒤에 쓴다(회전 트랜잭션이 고른 변형 기준).
  assert.ok(session.indexOf("sessionDoc.flowVariantId = await commitSessionWithVariant(") < session.indexOf("const openerVariant = findFlowVariant("));
});

test("[§142 PR-4 리포트] 교육 포인트 4개는 마무리 문장 앞에 붙는다 · 중복 0 · 부재 = 입력 그대로", () => {
  assert.equal(CARD_REBUILD_REPORT_LESSONS.length, 4);
  const base = ["수법 조언 A", CARD_REBUILD_REPORT_LESSONS[0]!, "마무리"];
  const out = withRouteLessons(base, CARD_REBUILD_REPORT_LESSONS);
  assert.equal(out[out.length - 1], "마무리");
  assert.equal(out.filter((line) => line === CARD_REBUILD_REPORT_LESSONS[0]).length, 1);
  assert.equal(out.length, 1 + 4 + 1);
  assert.deepEqual(withRouteLessons(base, undefined), base);
  for (const id of ["fv-k3dn", "fv-r8vb"]) assert.deepEqual(findFlowVariant(id)?.reportLessons, CARD_REBUILD_REPORT_LESSONS);
  // 다통화 변형 리포트는 레그 0 합성본이 아니라 변형 전체 수법으로 해석한다.
  const core = read("report/generateReportCore.ts");
  assert.ok(core.includes("const weakenedTactics = multiCallVariant ? [...multiCallVariant.tactics] : (scenarioPrompt?.weakenedTactics ?? []);"));
});
