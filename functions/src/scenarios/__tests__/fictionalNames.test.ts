// §118(DECISIONS #233, 2026-10-23) — 사기범 대사·프롬프트의 "OO" 가림 명칭 → 가상 고유명. 정확 일치 허용 · 역검증 · 시나리오별 일치.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIO_PROMPTS } from "../index";
import { ASSET_PROTECTION_CENTER_NAME, CASE_RECORD_NAMES, FSS_CALLER_NAMES } from "../fictionalNames";
import { PROSECUTION_CASE_LINK_PERSONA } from "../prosecutionCooperationCall.prompt";
import { FICTIONAL_INSTITUTION_NAMES, maskFictionalInstitutionNames, REAL_WORLD_INSTITUTION_NAMES } from "./harmlessnessPatterns";

const PROS = "prosecution-cooperation-call";
const persona = (id: string): string => SCENARIO_PROMPTS[id]!.personaPrompt;
const REAL_OFFICE = /서울중앙지검|중앙지검|[가-힣]{1,6}지방검찰청|[가-힣]{1,6}지청|대검찰청/;

test("[§118 N1] 검찰 기본 페르소나(초급 · 중급) = 열람본 · 현행 변형과 같은 이름 · 'OO지방검찰청' 0", () => {
  const self = `${CASE_RECORD_NAMES.office} ${CASE_RECORD_NAMES.department} ${CASE_RECORD_NAMES.investigator} 수사관`;
  assert.ok(persona(PROS).includes(self));
  assert.ok(persona(PROS).includes(`${CASE_RECORD_NAMES.prosecutor} 검사`));
  assert.equal(persona(PROS).includes("OO지방검찰청"), false);
  assert.equal(REAL_OFFICE.test(maskFictionalInstitutionNames(persona(PROS))), false, "허용 이름 밖의 청 이름 꼴 0");
});

test("[§118 N2] 은퇴 변형 원천(PROSECUTION_CASE_LINK_PERSONA)은 옛 OO 줄 그대로 — 바이트 무변경", () => {
  assert.ok(PROSECUTION_CASE_LINK_PERSONA.includes('"OO지방검찰청"·"OO수사본부"처럼 앞에 OO를 붙인 이름으로만 말한다.'));
  assert.equal(PROSECUTION_CASE_LINK_PERSONA.includes(CASE_RECORD_NAMES.office), false);
});

test("[§118 N3] 기관 사칭 — 검찰은 열람본과 같은 이름, 금융감독원은 가상 팀 · 조사관 · 'OO팀' 0", () => {
  const p = persona("institutional-impersonation");
  assert.ok(p.includes(`${CASE_RECORD_NAMES.office} ${CASE_RECORD_NAMES.department} ${CASE_RECORD_NAMES.investigator} 수사관`));
  assert.ok(p.includes(`금융감독원 ${FSS_CALLER_NAMES.team} ${FSS_CALLER_NAMES.investigator} 조사관`));
  assert.equal(/OO(지방검찰청|팀)/.test(p), false);
});

test("[§118 N4] 자산 보호 — 가상 센터 · 담당관 · 'OO자산보호센터' 0", () => {
  const p = persona("asset-protection-notice-call");
  assert.ok(p.includes(`${ASSET_PROTECTION_CENTER_NAME} ${FSS_CALLER_NAMES.investigator} 담당관`));
  assert.equal(p.includes("OO자산보호센터"), false);
});

test("[§118 N5] 허용 목록은 닫힌 열거 — 가상 이름은 실존 기관명 목록과 겹치지 않고 다른 지역명 + 지방검찰청은 걸린다", () => {
  assert.deepEqual([...FICTIONAL_INSTITUTION_NAMES], ["한빛지방검찰청"], "검찰 1벌만 허용(새 가상명은 실존 기관명 검사에 걸리는 글자가 없어 목록 추가 불요)");
  for (const name of [ASSET_PROTECTION_CENTER_NAME, FSS_CALLER_NAMES.team, FSS_CALLER_NAMES.investigator]) {
    assert.equal(REAL_WORLD_INSTITUTION_NAMES.some((real) => name.includes(real)), false, name);
  }
  assert.equal(REAL_OFFICE.test(maskFictionalInstitutionNames("부산지방검찰청 수사관")), true);
  assert.equal(REAL_OFFICE.test(maskFictionalInstitutionNames("한빛지방검찰청 수사관")), false);
});
