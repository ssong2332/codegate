// ⭐ 2026-11-24(페르소나 전수 점검 묶음 ① — 서비스 밖 행동 유도) — 실 키 점검에서 관측된 앱 밖 유도를 앱 안 화면 쪽으로 옮긴 것을 고정한다.
// | # | 관측(점검 기록) | 고정하는 것 |
// |---|---|---|
// | O1 | N1 · 대출 고급 fv-r4hc "기존 대출금 전액을 현금으로 찾아두시면 저희 담당 직원이 직접 방문" | 출금 예약 문자(`loan-cash-reserve`) → 앱 안 출금 예약 화면(`loan-cash-withdraw`) · 결정 화면 4-c · 말 약속 · 후속 값 0 |
// | O2 | N4 · 자산 보호 고급 fv-k9ra "은행에서 돈을 찾는 이유를 물어보면, 개인 용도로 둘러대시면 됩니다" | 현행 3변형 조립 프롬프트에 은행 둘러대기 코칭 0 · 은퇴 fv-bmiq · 원본 프롬프트는 그대로(역검증) |
// | O3 | N4 · 메신저 fv-bxvp "모바일뱅킹으로 … 앱 켜서 이체" · fv-tdgg "은행 앱 열어서 … 이체" | 지인 · 자녀 사칭 페르소나 · fv-tdgg 송금 단계 · 이체 재촉 문장이 송금 화면 링크만 가리킨다 |
// | O4 | N2 · 카드 배송 고급 fv-tvnj 말뿐인 "보냈어요"를 완료로 받음 | 원인 고정 — 시나리오가 카드사 고급에 합쳐져 새 세션 거부(운영 도달 0) · 이체 문자 선언 0이라 화면 행동 판정(SA)에 이체 화면이 없다 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { findFlowVariant, resolveSessionScenarioPrompt, type FlowVariant } from "../flowVariants";
import { findInCallSmsItem } from "../inCallSms";
import { CASH_LANDINGS, findMockScreenItem, isCashLanding } from "../mockScreens";
import { isMergedScenario } from "../publicMeta";
import { SCENARIO_PROMPTS } from "../index";
import { screenKindOf, SCREEN_PRESSURE_SENTENCES } from "../../roleplay/screenAction";
import { VERBAL_DECISION_VARIANTS } from "../../scammerHangup/goalAction";

const LOAN = "loan-refinance-scam";
const variant = (id: string) => findFlowVariant(id) as FlowVariant;
const assembled = (scenarioId: string, id: string) => {
  const p = resolveSessionScenarioPrompt(scenarioId, id)!;
  return `${p.personaPrompt}\n${p.weakenedTactics.join("\n")}`;
};
const BANK_COVER_STORY = /은행에서[^.]*(?:물으면|물어보면)[^.]*둘러/;
const BANK_APP_TRANSFER = /(?:은행 앱|모바일뱅킹)[^.]*(?:열어|켜서)[^.]*(?:보내|이체)/;

test("[O1] fv-r4hc — 출금 예약 문자 → 앱 안 출금 예약 화면 · 결정 화면 · 말 약속 0", () => {
  const v = variant("fv-r4hc");
  assert.equal(v.routeKey, "cash-repay", "루트 키 유지(회전 문서 · 리포트 연속성)");
  const last = v.sms[v.sms.length - 1]!;
  assert.deepEqual([last.purpose, last.smsId, last.required], ["transfer", "loan-cash-reserve", true], "마지막 선언 = 결정 화면");
  assert.ok(v.sms.length <= 3, "AC-096 (b) 고급 문자 0~3");
  for (let i = 1; i < v.sms.length; i += 1) assert.ok(v.sms[i - 1]!.notBeforeUserTurns + 2 <= v.sms[i]!.notBeforeUserTurns, "AC-099 문자 사이 발화 2");

  const sms = findInCallSmsItem(LOAN, "loan-cash-reserve")!;
  assert.equal(sms.kind, "account");
  assert.equal(sms.fakeLandingId, "loan-cash-withdraw");
  assert.ok(sms.linkAddress?.startsWith(`${findMockScreenItem(LOAN, "loan-cash-withdraw")!.mockHost}/`), "G453 주소 = 랜딩 호스트");
  assert.ok(!/\d+\s?(만\s?)?원|\d{2,3}-\d{3,4}-\d{4,}/.test(sms.body), "계좌 · 금액 줄 0");
  assert.ok(CASH_LANDINGS.includes("loan-cash-withdraw") && isCashLanding("loan-cash-withdraw"));
  assert.equal(screenKindOf(LOAN, "loan-cash-withdraw"), "form", "예약했어요 = 입력 화면 완료 주장(말만으로는 미완료)");

  assert.equal(v.goalFollowUpUserTurns, undefined, "C-5 후속 값 제거 → 4-c");
  assert.ok(!VERBAL_DECISION_VARIANTS.includes("fv-r4hc"));
  assert.doesNotMatch(v.decisionMoment ?? "", /약속/);
  const stage = v.stages[v.stages.length - 1]!.summary;
  assert.match(stage, /문자 속 링크의 은행 화면에서/);
  assert.match(stage, /장소 · 시간 · 주소[^.]*정하지도 묻지도 않는다/);
  const prompt = assembled(LOAN, "fv-r4hc");
  assert.doesNotMatch(prompt, /현금으로 찾아|직접 방문|직원에게 직접 상환/, "실제 인출 · 대면 전달 문면 0");
});

test("[O2] 자산 보호 고급 현행 3변형 — 은행 둘러대기 코칭 0 · 은퇴 fv-bmiq · 원본은 그대로(역검증)", () => {
  for (const id of ["fv-k9ra", "fv-p3jx", "fv-t8ga"]) {
    const prompt = assembled("asset-protection-notice-call", id);
    assert.doesNotMatch(prompt, BANK_COVER_STORY, id);
    assert.match(prompt, /비밀 유지 요구 — /, `${id}: 라벨은 남는다(리포트 연속성)`);
  }
  // 역검증 — 같은 정규식이 원본(변형 없음)과 은퇴 변형에서는 잡힌다(정규식이 공허하지 않다 · 은퇴 바이트 무변경).
  assert.match(assembled("asset-protection-notice-call", "fv-bmiq"), BANK_COVER_STORY);
  assert.match(SCENARIO_PROMPTS["asset-protection-notice-call"]!.weakenedTactics.join("\n"), BANK_COVER_STORY);
});

test("[O3] 메신저 지인 · 자녀 사칭 — 송금 화면 링크만 · 은행 앱 · 모바일뱅킹 이체 지시 0", () => {
  for (const [scenarioId, id] of [["messenger-friend-loan-kakao", "fv-bxvp"], ["messenger-child-impersonation-kakao", "fv-tdgg"]] as const) {
    const prompt = assembled(scenarioId, id);
    assert.match(prompt, /은행 앱 · 모바일뱅킹을 켜서 계좌번호를 넣으라는 말은 하지 말고, 송금 화면 링크를 다시 보내/, id);
    assert.doesNotMatch(prompt.replace(/[^.\n]*(?:하지 말고|않는다|하지 마)[^.\n]*/g, ""), BANK_APP_TRANSFER, `${id}: 규칙 문장 밖 은행 앱 이체 지시 0`);
  }
  assert.match(variant("fv-tdgg").stages.at(-1)!.summary, /송금 화면 링크를 함께 보내 그 화면에서 보내 달라고 한다/);
  assert.match(SCREEN_PRESSURE_SENTENCES.transferPending, /은행 앱이나 모바일뱅킹을 따로 켜서 보내라는 말도 하지 마라/);
});

test("[O4] fv-tvnj 원인 고정 — 합쳐진 시나리오(새 세션 거부) · 이체 문자 선언 0", () => {
  const v = variant("fv-tvnj");
  assert.equal(isMergedScenario(v.scenarioId), true, "운영에서 새 세션이 만들어지지 않는다(session/index.ts assertScenarioNotMerged)");
  assert.equal(v.sms.some((s) => s.purpose === "transfer"), false, "이체 화면이 없어 말로 보냈다는 주장을 비교할 화면이 없다(판정표 SA0 · SA2)");
});
