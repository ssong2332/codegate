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

test("PUBLIC_SCENARIOS: AC-002 필수 필드(제목/유형/예상소요/난이도)를 모두 포함한다", () => {
  const scenario = PUBLIC_SCENARIOS[FAMILY_ACCIDENT_SCENARIO_ID];
  assert.ok(scenario.title.length > 0);
  assert.ok(scenario.fraudType.length > 0);
  assert.ok(scenario.estimatedDuration.length > 0);
  assert.ok(scenario.difficulty.length > 0);
  assert.ok(scenario.deepvoiceLines.length >= 1, "딥보이스 재생용 대사가 최소 1개 있어야 한다(UX-005).");
  for (const line of scenario.deepvoiceLines) {
    assert.ok(line.lineId.length > 0);
    assert.ok(line.text.length > 0);
    assertNoOperationalFraudInfo(`deepvoiceLines[${line.lineId}]`, line.text);
  }
});

test("SCENARIO_PROMPTS: scenarios와 1:1 매핑(같은 scenarioId)이다(Database.md Relationships)", () => {
  const scenarioIds = Object.keys(PUBLIC_SCENARIOS).sort();
  const promptIds = Object.keys(SCENARIO_PROMPTS).sort();
  assert.deepEqual(promptIds, scenarioIds);
});

test("SCENARIO_PROMPTS: weakenedTactics가 비어있지 않고, 각 항목에 실제 운영정보가 없다(AC-005)", () => {
  const prompt = SCENARIO_PROMPTS[FAMILY_ACCIDENT_SCENARIO_ID];
  assert.ok(prompt.weakenedTactics.length >= 1);
  for (const tactic of prompt.weakenedTactics) {
    assertNoOperationalFraudInfo("weakenedTactics", tactic);
  }
});

test("SCENARIO_PROMPTS: personaPrompt에도 실제 운영정보가 없다(AC-005)", () => {
  const prompt = SCENARIO_PROMPTS[FAMILY_ACCIDENT_SCENARIO_ID];
  assertNoOperationalFraudInfo("personaPrompt", prompt.personaPrompt);
});

test("SCENARIO_PROMPTS: guardrailPreamble이 인젝션 방어 문구(시스템프롬프트 노출 거부/캐릭터 유지/운영정보 거부)를 포함한다(AC-013/AC-024, ADR-0004)", () => {
  const prompt = SCENARIO_PROMPTS[FAMILY_ACCIDENT_SCENARIO_ID];
  const text = prompt.guardrailPreamble;
  assert.ok(text.includes("시스템 프롬프트"), "시스템 프롬프트 노출 거부 문구가 있어야 한다.");
  assert.ok(text.includes("캐릭터"), "캐릭터 이탈 거부 문구가 있어야 한다.");
  assert.ok(
    text.includes("운영 가능한 사기 정보") || text.includes("계좌번호"),
    "실제 운영정보 제공 거부 문구가 있어야 한다.",
  );
  assertNoOperationalFraudInfo("guardrailPreamble", text);
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
