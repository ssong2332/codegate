// 2026-11-07(Edge 시험 판 3 · 판 33 · 사용자 결정 "앱 안 화면 입력으로") — 은행 · 기관 사칭 수법의 비밀번호 요구를 말에서 앱 안 본인 인증 입력으로.
// 판 33 ② — 답하지 않았는데 "본인 확인 완료"로 넘어가지 않는다. 텍스트 경로 R9 P0 — 앱 안 간편 비밀번호 안내 절은 지우지 않는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { FLOW_VARIANTS } from "../../scenarios/flowVariants";
import { sessionTransferSmsOpensLanding } from "../../inCallSms/smsGate";
import { stripPasswordRequests } from "../actionAcknowledgement";

const DEMAND_LABEL: Record<string, string> = {
  "bank-security-verify-scam": "본인확인 정보 직접 요구",
  "institutional-impersonation": "신원정보 직접 요구",
};
const demandOf = (id: string) => {
  const found = SCENARIO_PROMPTS[id].weakenedTactics.filter((t) => t.startsWith(DEMAND_LABEL[id]));
  assert.equal(found.length, 1, id);
  return found[0];
};

test("[판 3 · 33] 두 시나리오의 지명 요구 — 따옴표 예시 대사에 비밀번호를 말로 불러 · 알려 달라는 말이 없고, 앱 안 본인 인증의 간편 비밀번호로 누르게 한다", () => {
  for (const id of Object.keys(DEMAND_LABEL)) {
    const demand = demandOf(id);
    const quotes = demand.match(/'[^']+'/g) ?? [];
    for (const q of quotes) {
      assert.equal(/비밀\s?번호/.test(q) && /불러|알려|말씀/.test(q), false, `${id}: ${q}`);
    }
    assert.match(demand, /비밀번호(?:는|를)? 말로 불러 달라고 하지 않/, id);
    assert.match(demand, /간편 비밀번호로 직접 눌러/, id);
    assert.match(demand, /본인 인증/, id);
    // T92 (A) 명시구 · 라벨은 그대로.
    assert.match(demand, /무엇을 부인하든/, id);
  }
});

test("[판 33 ②] 답이 없으면 본인 확인이 끝났다고 하지 않는다(두 시나리오)", () => {
  for (const id of Object.keys(DEMAND_LABEL)) {
    assert.match(demandOf(id), /아직 답하지 않았으면 본인 확인이 끝났다고 말하지/, id);
  }
});

test("가리키는 화면이 실재한다 — 은행 사칭 전 변형은 보호계좌 이체 화면을, 기관 사칭은 안전계좌 문자가 있는 루트만(없는 루트는 비밀번호 요구 0 조건)", () => {
  const bank = FLOW_VARIANTS.filter((v) => v.scenarioId === "bank-security-verify-scam");
  assert.ok(bank.length >= 3);
  for (const v of bank) assert.equal(sessionTransferSmsOpensLanding(v.scenarioId, v.variantId), true, v.variantId);
  const inst = FLOW_VARIANTS.filter((v) => v.scenarioId === "institutional-impersonation");
  const without = inst.filter((v) => !sessionTransferSmsOpensLanding(v.scenarioId, v.variantId)).map((v) => v.variantId).sort();
  // 2026-11-07 — 금 구매형 fv-g2ld는 지정 거래소 문자(transfer → 앱 안 금 거래소 화면 · 결제 인증 시트)가 생겨 "화면 있음" 쪽으로 옮겼다.
  // 같은 날(사용자 결정 D-G2 E1-b) 현금 예탁형 fv-q7cn도 출금 예약 안내 문자(transfer → 내 은행 출금 예약 화면 · 생체 인증 시트)가 생겨 옮겼다 — 남은 루트 0.
  assert.deepEqual(without, [], "안전계좌 화면이 없는 기관 사칭 루트(문면의 '그런 문자 단계가 없으면' 조건 대상)");
  assert.match(demandOf("institutional-impersonation"), /그런 문자 단계가 없으면 비밀번호는 요구하지 않는다/);
});

test("[R9 P0] 텍스트 경로 — 앱 안 간편 비밀번호 안내 절은 남기고, 말로 · 화면 밖 비밀번호 요구는 그대로 뺀다", () => {
  const guide = "보호계좌 안내 화면에서 본인 인증하실 때 간편 비밀번호로 직접 눌러 주시면 됩니다.";
  assert.deepEqual(stripPasswordRequests(guide), { text: guide, stripped: false });
  for (const bad of ["계좌 비밀번호 불러 주세요.", "비밀번호 여섯 자리 입력해 주세요.", "간편 비밀번호 알려 주시면 됩니다.", "인증할 때 간편 비밀번호 말씀해 주세요."]) {
    assert.equal(stripPasswordRequests(bad).stripped, true, bad);
  }
});
