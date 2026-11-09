import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  findFlowVariant,
  listFlowVariants,
  MULTI_CALL_CASE_BRIEF_HEADER,
  MULTI_CALL_IDENTITY_FIRST_RULE,
  MULTI_CALL_NO_PRIOR_TALK_RULE,
  resolveSessionScenarioPrompt,
  type FlowVariant,
} from "../../scenarios/flowVariants";
import { assignablePool } from "../../scenarios/variantPool";
import {
  CARD_FAKE_CALLBACK_NUMBER_ID,
  dialNumberOf,
  PROSECUTOR_OFFICIAL_NUMBER_ID,
  spokenDialNumber,
  SUPERVISOR_OFFICIAL_NUMBER_ID,
} from "../../scenarios/dialDirectory";
import { CARD_R1_SMS_SENDER, findInCallSmsItem, IN_CALL_SMS, INSTITUTION_LOAN_SMS_SENDER, SMS_SENDER_NUMBER } from "../../scenarios/inCallSms";
import { buildInCallSmsDoc } from "../../inCallSms/buildDoc";
import * as legPlan from "../legPlan";

// 2026-11-07 카드사 고급 실기기 시험 뒤 사용자 결정 "R1로 축소·진행" — 서버 쪽 4건.
// (1) R1만 배정 (2) 새 통화 = 앞 통화 대화 모름 + 본인 확인부터 (3) 공식 대표번호는 말로 불러 준다(클라 연락처 제거) (4) R1 문자 발신처 분리 · 번호만.

const SCENARIO = "card-company-impersonation";
const R1 = () => findFlowVariant("fv-k3dn") as FlowVariant;
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
const FICTIONAL_NUMBER = /^(?:02|0[3-6][1-5]|070)-0\d{3}-\d{4}$/;

test("[R1 축소 1] 카드사 고급 배정 풀 = R1(fv-k3dn) 하나 · R2(fv-r8vb)는 배정 은퇴 · 옛 세션 해석은 그대로", () => {
  assert.deepEqual(assignablePool(SCENARIO, "advanced").map((v) => v.variantId), ["fv-k3dn"]);
  // 허용 변형 = R1 + 챌린지 수신자 base(fv-akj5 · #192 무변경) — R2는 어느 쪽에도 없다.
  assert.deepEqual(listFlowVariants(SCENARIO, "advanced").map((v) => v.variantId), ["fv-akj5", "fv-k3dn"]);
  assert.deepEqual(assignablePool(SCENARIO, "advanced", "challenge-1").map((v) => v.variantId), ["fv-akj5"], "챌린지 수신자 풀 무변경");
  const r2 = findFlowVariant("fv-r8vb");
  assert.equal(r2?.retired, true);
  assert.equal(r2?.openerSmsId, "card-issue-notice", "옛 R2 세션의 시작 문자 해석");
  assert.ok(resolveSessionScenarioPrompt(SCENARIO, "fv-r8vb", 0)!.personaPrompt.length > 0, "옛 R2 세션 프롬프트 해석");
  assert.equal(R1().retired, undefined);
  assert.equal(R1().pendingRollout, undefined);
});

test("[R1 축소 2] 앞 통화 대화 인계 0 — 인계 함수 · 메시지 읽기 · 폴백 인계 블록이 없다", () => {
  assert.equal("buildPriorLegContext" in legPlan, false, "legPlan 인계 함수 제거");
  const realtime = read("realtime/index.ts");
  const legBranch = realtime.slice(realtime.indexOf("if (callLeg && callLeg.legIndex > 0) {"), realtime.indexOf("} else if (isEscalatedVoiceCall("));
  assert.ok(legBranch.length > 0);
  // Edge 재시험 19 ③(2026-11-09) — 같은 인물이 다시 건 레그(기관 고급 통화 3)는 앞 통화 신분 이름 판정(`legPriorIdentity` 고정 이름표)에만 메시지를 읽는다.
  // 읽기는 그 판정 입력 1곳뿐이고 대화 원문은 맥락에 싣지 않는다(`loanLegIdentity.test.ts` 원문 0 단언). 그 밖의 메시지 읽기는 종전대로 0.
  assert.equal(legBranch.split('collection("messages")').length - 1, 1, "Live 다음 레그 — 메시지 읽기는 신분 판정 1곳만");
  const messagesRead = legBranch.slice(legBranch.indexOf('collection("messages")'));
  assert.ok(/^collection\("messages"\)[\s\S]*?loanReviewLine = buildLegLoanReviewContext\(/.test(messagesRead), "읽은 메시지는 확인 결과 줄 판정 입력으로만");
  assert.ok(legBranch.includes("if (legVariant && loanReviewLine) {"), "확인 결과 줄이 실리는 레그(판정표 K)만 읽는다");
  assert.ok(legBranch.includes("priorChatContext = undefined"));
  const fallback = read("roleplay/index.ts");
  assert.ok(!fallback.includes("buildPriorLegContext"), "폴백 인계 블록 0");
  assert.ok(!/\[priorLegBlock,/.test(fallback), "폴백 턴 지시에 인계 블록 0");
  assert.ok(fallback.includes("toLlmHistory(legHistory ? legHistory.current : storedHistory)"), "폴백 모델 이력 = 현재 통화만");
});

test("[R1 축소 2] 다음 통화 프롬프트 — 사건 골격만 · 앞 통화 대화 모름 규칙 · 참가자 발화 0(입력이 레그 번호뿐)", () => {
  const v = R1();
  const prompts = v.legs.map((_, i) => resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", i)!.personaPrompt);
  // 첫 수신 레그(배송원)에는 블록이 없다.
  assert.equal(v.legs[0].caseBrief, undefined);
  assert.ok(!prompts[0]!.includes(MULTI_CALL_CASE_BRIEF_HEADER));
  for (let i = 1; i < v.legs.length; i += 1) {
    const prompt = prompts[i]!;
    const leg = v.legs[i]!;
    assert.ok(leg.caseBrief && leg.caseBrief.length > 0, `레그 ${i} 사건 골격`);
    assert.ok(prompt.includes(MULTI_CALL_CASE_BRIEF_HEADER), `레그 ${i} 머리`);
    assert.ok(prompt.includes(`- ${leg.caseBrief}`), `레그 ${i} 골격`);
    assert.ok(prompt.includes(MULTI_CALL_NO_PRIOR_TALK_RULE), `레그 ${i} 앞 통화 대화 모름`);
    assert.ok(prompt.includes(MULTI_CALL_IDENTITY_FIRST_RULE), `레그 ${i} 본인 확인부터`);
    // 골격은 블록 · 흐름보다 앞(골격 → 흐름 1단계 본인 확인).
    assert.ok(prompt.indexOf(MULTI_CALL_CASE_BRIEF_HEADER) < prompt.indexOf("[이번 통화의 흐름]"), `레그 ${i} 순서`);
    // 종전 인계 블록 문면 0.
    assert.ok(!prompt.includes("[앞선 통화 기록]") && !prompt.includes("참가자: "), `레그 ${i} 앞 통화 기록 0`);
    // 같은 레그 번호면 같은 문자열(세션 대화와 무관 — 참가자 발화가 들어갈 입력이 없다).
    assert.equal(resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", i)!.personaPrompt, prompt);
  }
});

test("[R1 축소 2] 새 통화 첫 단계 = 본인 확인(성함 · 생년월일) · 사건 이야기는 그 뒤 · 거부 시 한 번 설득 뒤 진행", () => {
  const v = R1();
  for (let i = 1; i < v.legs.length; i += 1) {
    const first = v.legs[i]!.stages![0]!;
    assert.ok(first.includes("먼저 본인 확인부터 한다"), `레그 ${i}: ${first}`);
    assert.ok(first.includes("성함과 생년월일을 확인한다"), `레그 ${i}`);
    assert.ok(first.includes("본인 확인을 마치기 전에는 사건 내용을 먼저 꺼내지 않는다"), `레그 ${i}`);
    assert.ok(first.includes("본인 확인 없이 다음 단계로 넘어간다"), `레그 ${i} 거부 처리`);
    const prompt = resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", i)!.personaPrompt;
    assert.ok(prompt.includes(`1. ${first}`), `레그 ${i} 흐름 1단계`);
    // 사건 고지(명의 도용 · 접수 · 구속 수사)는 2단계부터.
    assert.ok(v.legs[i]!.stages![1]!.startsWith("조회해 보니"), `레그 ${i} 2단계 = 조회 결과`);
  }
  // 첫 레그(배송원)는 종전 그대로 성함만 묻는다.
  assert.ok(v.legs[0]!.stages![0]!.includes("성함을 묻는다"));
});

test("[R1 축소 2] #498 '신청했다' 갈래 · 같은 미끼 반복 금지 유지 — 배송원 · (이제 앞 통화를 모르는) 상담원 둘 다", () => {
  for (const leg of [0, 1]) {
    const prompt = resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", leg)!.personaPrompt;
    assert.ok(prompt.includes("같은 말로 되풀이하지 않는다"), `레그 ${leg}`);
    assert.ok(prompt.includes("두 장 신청했다"), `레그 ${leg}`);
  }
});

test("[R1 축소 2] 본인 확인 단계 하나만큼 문자 하한 +1 — 원격 지원 3 · 안전계좌 4 · 번호 안내 문자 1 그대로", () => {
  const byId = Object.fromEntries(R1().sms.map((s) => [s.smsId, [s.leg, s.notBeforeUserTurns]]));
  assert.deepEqual(byId, { "card-callback-number": [0, 1], "card-remote-support-link": [1, 3], "card-safe-account": [3, 4] });
});

test("[R1 축소 3] 공식 대표번호는 말로 불러 준다 — 상담원 → 감독기관 번호 · 조사관 → 검찰청 번호 · 한 자리씩 읽는 꼴 · 다른 번호 0", () => {
  assert.equal(spokenDialNumber("02-0700-3324"), "공이, 공칠공공, 삼삼이사");
  assert.equal(spokenDialNumber("02-0746-2108"), "공이, 공칠사육, 이일공팔");
  const supNumber = dialNumberOf(SCENARIO, SUPERVISOR_OFFICIAL_NUMBER_ID);
  const proNumber = dialNumberOf(SCENARIO, PROSECUTOR_OFFICIAL_NUMBER_ID);
  const agent = resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", 1)!.personaPrompt;
  const sup = resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", 2)!.personaPrompt;
  assert.ok(agent.includes(supNumber) && agent.includes(spokenDialNumber(supNumber)), "상담원 — 감독기관 번호");
  assert.ok(!agent.includes(proNumber), "상담원은 검찰청 번호를 모른다");
  assert.ok(sup.includes(proNumber) && sup.includes(spokenDialNumber(proNumber)), "조사관 — 검찰청 번호");
  assert.ok(!sup.includes(supNumber), "조사관은 자기 번호를 다시 불러 주지 않는다");
  for (const p of [agent, sup]) {
    assert.ok(p.includes("직접 찾아보셔도 같은 번호입니다"), "직접 찾아 걸어도 된다");
    assert.ok(!p.includes("번호는 네가 불러 주지 않는다"), "종전 '불러 주지 않는다' 0");
  }
  // 배송원은 종전 그대로 — 가짜 고객센터 번호는 문자에만(말로 불러 주지 않는다).
  const courier = resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", 0)!.personaPrompt;
  assert.ok(!courier.includes(dialNumberOf(SCENARIO, CARD_FAKE_CALLBACK_NUMBER_ID)));
  // 검사(마지막)는 번호를 안내하지 않는다.
  const pro = resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", 3)!.personaPrompt;
  assert.ok(!pro.includes(supNumber) && !pro.includes(proNumber));
});

test("[R1 축소 4] R1 문자 3통 — 발신 번호가 서로 다르다 · 번호만(괄호 이름 0) · 가상 번호 꼴 · 문서에도 그대로", () => {
  const ids = R1().sms.map((s) => s.smsId);
  assert.deepEqual(ids, ["card-callback-number", "card-remote-support-link", "card-safe-account"]);
  const labels = ids.map((id) => findInCallSmsItem(SCENARIO, id)!.senderLabel);
  assert.equal(new Set(labels).size, 3, labels.join(" / "));
  for (const [i, label] of labels.entries()) {
    assert.match(label, FICTIONAL_NUMBER, ids[i]);
    assert.equal(label, CARD_R1_SMS_SENDER[ids[i]!]);
    assert.ok(!label.includes("(") && !/[가-힣A-Za-z]/.test(label), `${ids[i]} 번호만`);
    // 종전 공통 번호(한 대화방으로 묶이던 값)는 쓰지 않는다.
    assert.notEqual(label, SMS_SENDER_NUMBER[SCENARIO]);
    // 세션 가상 은행명 치환을 거쳐도 번호 그대로(클라 대화방 키).
    const doc = buildInCallSmsDoc(findInCallSmsItem(SCENARIO, ids[i]!)!, {} as FirebaseFirestore.Timestamp, 1, SCENARIO, "미르은행");
    assert.equal(doc.senderLabel, label);
  }
  // 고객센터 문자 = 참가자가 방금 건 가짜 고객센터 번호.
  assert.equal(labels[1], dialNumberOf(SCENARIO, CARD_FAKE_CALLBACK_NUMBER_ID));
});

test("[R1 축소 4] R1 밖 카드사 문자 · 다른 시나리오 문자의 발신 표시는 무변경", () => {
  const r1Ids = new Set(Object.keys(CARD_R1_SMS_SENDER));
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) {
      if (scenarioId === SCENARIO && r1Ids.has(item.smsId)) continue;
      // PR-B — 기관 사칭 고급 입금 안내(가상 캐피탈 발신 — `INSTITUTION_LOAN_SMS_SENDER` 표 · 단언은 `smsSenderNumber.test.ts`).
      if (scenarioId === "institutional-impersonation" && INSTITUTION_LOAN_SMS_SENDER[item.smsId] !== undefined) continue;
      const expected = SMS_SENDER_NUMBER[scenarioId]!;
      assert.ok(item.senderLabel === expected || item.senderLabel.startsWith(`${expected} (`), `${scenarioId}/${item.smsId}: ${item.senderLabel}`);
    }
  }
  assert.equal(findInCallSmsItem(SCENARIO, "card-issue-notice")!.senderLabel, "02-0762-4180 (윤슬카드)", "R2 시작 문자(은퇴) 무변경");
});
