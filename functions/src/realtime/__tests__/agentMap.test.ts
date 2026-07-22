import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAgentMap, resolveAgentId } from "../agentMap";

test("parseAgentMap: 쉼표로 구분된 scenarioId:agentId 목록을 파싱한다", () => {
  const map = parseAgentMap("family-accident-deepvoice:agent_a,tax-refund-scam:agent_b");
  assert.deepEqual(map, {
    "family-accident-deepvoice": "agent_a",
    "tax-refund-scam": "agent_b",
  });
});

test("parseAgentMap: 공백과 빈 항목을 허용한다(설정 실수로 전체가 깨지지 않게)", () => {
  const map = parseAgentMap(" a:agent_1 , , b:agent_2 ,");
  assert.deepEqual(map, { a: "agent_1", b: "agent_2" });
});

test("parseAgentMap: 미설정/빈 문자열이면 빈 매핑(→ 호출부가 Mock으로 강등)", () => {
  assert.deepEqual(parseAgentMap(undefined), {});
  assert.deepEqual(parseAgentMap(""), {});
});

test("parseAgentMap: 형식이 잘못된 항목은 건너뛴다(콜론 없음·키 없음)", () => {
  const map = parseAgentMap("broken,:agent_x,ok:agent_ok");
  assert.deepEqual(map, { ok: "agent_ok" });
});

test("parseAgentMap: agentId에 콜론이 들어가도 첫 콜론만 구분자로 쓴다", () => {
  assert.deepEqual(parseAgentMap("s:agent:with:colon"), { s: "agent:with:colon" });
});

test("resolveAgentId: 매핑에 없는 시나리오는 undefined를 반환한다(엉뚱한 에이전트 연결 방지)", () => {
  const raw = "family-accident-deepvoice:agent_a";
  assert.equal(resolveAgentId(raw, "family-accident-deepvoice"), "agent_a");
  assert.equal(resolveAgentId(raw, "loan-refinance-scam"), undefined);
});
