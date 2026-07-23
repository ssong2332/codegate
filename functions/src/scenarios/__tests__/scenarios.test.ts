// T6 콘텐츠 안전성/정합성 테스트 (node:test — 저장소에 별도 테스트 프레임워크 없음, T19 memory
// 참고). AC-001/AC-002(공개 메타 필수 필드) + AC-005/AC-013(약화된 수법·운영정보 배제) 근거.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { SCENARIO_PROMPTS, FAMILY_ACCIDENT_SCENARIO_ID } from "../index";
import { PUBLIC_SCENARIOS } from "../publicMeta";

// AC-005: 실제 운영 가능한 사기 정보(실계좌번호 패턴·실제 송금 절차 지시·실제 URL)가 절대
// 포함되면 안 된다. 계좌번호형 숫자(8자리 이상 연속 숫자)와 http(s) 링크를 금지 패턴으로 검사한다.
const LONG_DIGIT_SEQUENCE = /\d{8,}/;
const URL_PATTERN = /https?:\/\//i;

function assertNoOperationalFraudInfo(label: string, text: string): void {
  assert.equal(
    LONG_DIGIT_SEQUENCE.test(text),
    false,
    `${label}에 계좌번호로 보이는 8자리 이상 연속 숫자가 있으면 안 됩니다(AC-005): ${text}`,
  );
  assert.equal(
    URL_PATTERN.test(text),
    false,
    `${label}에 실제 URL이 있으면 안 됩니다(AC-005): ${text}`,
  );
}

test("PUBLIC_SCENARIOS: 가족 납치/사고 시나리오가 최소 1종 존재한다(AC-001)", () => {
  assert.ok(PUBLIC_SCENARIOS[FAMILY_ACCIDENT_SCENARIO_ID]);
});

test("PUBLIC_SCENARIOS: AC-002 필수 필드(제목/유형/예상소요/난이도)를 모두 포함한다(전체 시나리오, T27부터 메신저 포함)", () => {
  for (const [scenarioId, scenario] of Object.entries(PUBLIC_SCENARIOS)) {
    assert.ok(scenario.title.length > 0, `${scenarioId}: title 누락`);
    assert.ok(scenario.fraudType.length > 0, `${scenarioId}: fraudType 누락`);
    assert.ok(scenario.estimatedDuration.length > 0, `${scenarioId}: estimatedDuration 누락`);
    assert.ok(scenario.difficulty.length > 0, `${scenarioId}: difficulty 누락`);
    assert.ok(
      scenario.deepvoiceLines.length >= 1,
      `${scenarioId}: 딥보이스 재생용 대사가 최소 1개 있어야 한다(UX-005).`,
    );
    for (const line of scenario.deepvoiceLines) {
      assert.ok(line.lineId.length > 0, `${scenarioId}: deepvoiceLines lineId 누락`);
      assert.ok(line.text.length > 0, `${scenarioId}: deepvoiceLines text 누락`);
      assertNoOperationalFraudInfo(`${scenarioId}.deepvoiceLines[${line.lineId}]`, line.text);
    }
  }
});

test("SCENARIO_PROMPTS: scenarios와 1:1 매핑(같은 scenarioId)이다(Database.md Relationships)", () => {
  const scenarioIds = Object.keys(PUBLIC_SCENARIOS).sort();
  const promptIds = Object.keys(SCENARIO_PROMPTS).sort();
  assert.deepEqual(promptIds, scenarioIds);
});

test("SCENARIO_PROMPTS: weakenedTactics가 비어있지 않고, 각 항목에 실제 운영정보가 없다(AC-005, 전체 시나리오)", () => {
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    assert.ok(prompt.weakenedTactics.length >= 1, `${scenarioId}: weakenedTactics 비어있음`);
    for (const tactic of prompt.weakenedTactics) {
      assertNoOperationalFraudInfo(`${scenarioId}.weakenedTactics`, tactic);
    }
  }
});

test("SCENARIO_PROMPTS: personaPrompt에도 실제 운영정보가 없다(AC-005, 전체 시나리오)", () => {
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    assertNoOperationalFraudInfo(`${scenarioId}.personaPrompt`, prompt.personaPrompt);
  }
});

test("SCENARIO_PROMPTS: guardrailPreamble이 인젝션 방어 문구(시스템프롬프트 노출 거부/캐릭터 유지/운영정보 거부)를 포함한다(AC-013/AC-024, ADR-0004, 전체 시나리오)", () => {
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const text = prompt.guardrailPreamble;
    assert.ok(text.includes("시스템 프롬프트"), `${scenarioId}: 시스템 프롬프트 노출 거부 문구가 있어야 한다.`);
    assert.ok(text.includes("캐릭터"), `${scenarioId}: 캐릭터 이탈 거부 문구가 있어야 한다.`);
    assert.ok(
      text.includes("운영 가능한 사기 정보") || text.includes("계좌번호"),
      `${scenarioId}: 실제 운영정보 제공 거부 문구가 있어야 한다.`,
    );
    assertNoOperationalFraudInfo(`${scenarioId}.guardrailPreamble`, text);
  }
});

test("SCENARIO_PROMPTS: suspicionKeywords가 있으면(에스컬레이션 가능 시나리오) 비어있지 않고 실제 운영정보가 없다(AC-034, T27)", () => {
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    if (prompt.suspicionKeywords === undefined) continue;
    assert.ok(prompt.suspicionKeywords.length >= 1, `${scenarioId}: suspicionKeywords가 정의됐다면 비어있으면 안 된다.`);
    for (const keyword of prompt.suspicionKeywords) {
      assertNoOperationalFraudInfo(`${scenarioId}.suspicionKeywords`, keyword);
    }
  }
});

test("PUBLIC_SCENARIOS: escalation이 있는 시나리오는 channel='messenger'이고 escalation 대상 시나리오 프롬프트에 suspicionKeywords가 정의돼 있다(AC-034/046, T27)", () => {
  for (const [scenarioId, scenario] of Object.entries(PUBLIC_SCENARIOS)) {
    if (scenario.escalation === undefined) continue;
    assert.equal(scenario.channel, "messenger", `${scenarioId}: escalation은 메신저 시나리오에만 존재해야 한다.`);
    assert.equal(scenario.escalation.toChannel, "voice", `${scenarioId}: escalation.toChannel은 항상 voice다(MVP 단방향, AC-039).`);
    const prompt = SCENARIO_PROMPTS[scenarioId];
    assert.ok(prompt, `${scenarioId}: escalation 시나리오도 SCENARIO_PROMPTS에 존재해야 한다.`);
    assert.ok(
      prompt.suspicionKeywords && prompt.suspicionKeywords.length >= 1,
      `${scenarioId}: escalation이 있는 시나리오는 suspicionKeywords를 정의해야 한다(T27).`,
    );
  }
});

test("publicMeta.ts는 src/content/scenarios/familyAccidentDeepvoice.ts와 드리프트 없이 동기화되어 있다", () => {
  // functions/(별도 TS 빌드 루트)라 직접 import 대신 소스 텍스트를 비교해 두 사본의 드리프트를
  // 탐지한다(publicMeta.ts 상단 주석 참고).
  const mirrorSourcePath = path.resolve(__dirname, "../../../../src/content/scenarios/familyAccidentDeepvoice.ts");
  const mirrorSource = fs.readFileSync(mirrorSourcePath, "utf-8");
  const scenario = PUBLIC_SCENARIOS[FAMILY_ACCIDENT_SCENARIO_ID];

  assert.ok(mirrorSource.includes(scenario.title), "title이 원본 파일과 다릅니다 — 두 파일을 함께 갱신하세요.");
  assert.ok(mirrorSource.includes(scenario.fraudType), "fraudType이 원본 파일과 다릅니다.");
  for (const line of scenario.deepvoiceLines) {
    assert.ok(mirrorSource.includes(line.text), `deepvoiceLines 텍스트(${line.lineId})가 원본 파일과 다릅니다.`);
  }
});
