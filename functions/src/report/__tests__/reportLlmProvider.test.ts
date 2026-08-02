// T158(§48.2.1, AC-084) — ReportDoc.llmProvider 파생 단위 테스트.
//
// AC-084 (f) 역방향 확인: 강등 세션(llmProvider="mock")에서는 필드가 실리고, 비강등 세션
// (claude/gemini/부재)에서는 필드가 아예 생기지 않음을 같은 파일에서 나란히 증명한다.
// G274(긍정 표기 금지) 검증: 부재 입력의 결과 객체에 `llmProvider` 키 자체가 없어야 한다
// (`undefined` 값으로 존재하는 것도 위반 — Object.prototype.hasOwnProperty로 확인).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveReportLlmProviderField } from "../reportLlmProvider";

test("deriveReportLlmProviderField: llmProvider='mock'이면 그대로 복사된다(강등 세션)", () => {
  const result = deriveReportLlmProviderField({ llmProvider: "mock" });
  assert.deepEqual(result, { llmProvider: "mock" });
});

test("deriveReportLlmProviderField: llmProvider='claude'/'gemini'(실 프로바이더)면 그대로 복사된다", () => {
  assert.deepEqual(deriveReportLlmProviderField({ llmProvider: "claude" }), { llmProvider: "claude" });
  assert.deepEqual(deriveReportLlmProviderField({ llmProvider: "gemini" }), { llmProvider: "gemini" });
});

test("deriveReportLlmProviderField: llmProvider가 부재(undefined)면 필드 자체가 생기지 않는다(무백필·G274)", () => {
  const result = deriveReportLlmProviderField({ llmProvider: undefined });
  assert.deepEqual(result, {});
  assert.equal(
    Object.prototype.hasOwnProperty.call(result, "llmProvider"),
    false,
    "부재 입력에서 llmProvider 키 자체가 존재하면 안 된다(undefined 값으로도 남기지 않는다)",
  );
});

test("역방향 확인 — mock 입력과 undefined 입력을 같은 실행에서 나란히 비교(AC-084 (f))", () => {
  const degraded = deriveReportLlmProviderField({ llmProvider: "mock" });
  const notDegraded = deriveReportLlmProviderField({ llmProvider: undefined });
  assert.equal("llmProvider" in degraded, true, "강등 세션은 필드가 있어야 한다");
  assert.equal("llmProvider" in notDegraded, false, "비강등(미관측) 세션은 필드가 없어야 한다");
});

test("스프레드했을 때 리포트 리터럴에 부재 필드를 남기지 않는다(실사용 형태 재현)", () => {
  const base = { reportId: "r1", uid: "u1" };
  const withDegraded = { ...base, ...deriveReportLlmProviderField({ llmProvider: "mock" }) };
  const withoutDegraded = { ...base, ...deriveReportLlmProviderField({ llmProvider: undefined }) };
  assert.deepEqual(withDegraded, { reportId: "r1", uid: "u1", llmProvider: "mock" });
  assert.deepEqual(withoutDegraded, { reportId: "r1", uid: "u1" });
  assert.equal(Object.keys(withoutDegraded).includes("llmProvider"), false);
});
