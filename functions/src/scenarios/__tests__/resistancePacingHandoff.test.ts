// ⭐ 실기기 신고(2026-11-01) U1 · U6 — 메인 "권고대로"(docs/research/resistance-pacing-and-handoff-2026-11-01.md §3 1 · 2단계).
// | # | 신고 | 고정하는 것 |
// |---|---|---|
// | H3 (U1) | 확인 창구로 넘긴 뒤 원래 인물로 돌아갈 여지(예외가 "그 턴"뿐) | 2인 루트 단일 화자 예외 = 넘겨받은 뒤 통화 끝까지 창구 담당자 · 확인 창구 없는 2인 루트에는 붙지 않는다 |
// | P1 (U6) | 거절 · 의심 뒤 설득 없이 다음 단계로 넘어감 | 기관 중급 fv-hktx · 카드사 중급 fv-35f2 · 기관 고급 머리 단계(V2) = 한 번 더 설득 → 그래도 거부면 넘어감 · 세 번째 요구 없음 |
// | P1 은퇴 | 은퇴 변형 fv-pgqt 바이트 | 종전 문면 그대로(설득 1회 문면 없음) |
// | P4 (U6) | 의심 중에 인증번호 문자 요구가 끼어듦 | 카드사 인증번호 도착 지시 = 의심 · 거절에 먼저 답한 뒤 번호 요구 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { FLOW_VARIANTS, findFlowVariant, listFlowVariants, resolveSessionScenarioPrompt } from "../flowVariants";
import { hasVerifyIntercept } from "../verifyIntercept";
import { findInCallSmsItem } from "../inCallSms";

const PERSUADE = "곧바로 넘어가지 말고 먼저 그 말에 답한 뒤 다른 근거로 한 번만 더 설득한다";
const NO_THIRD = "같은 요구를 세 번째로 하지 않는다";
const H3_EXCEPTION = "확인 창구로 넘겨받은 뒤에는 통화가 끝날 때까지 그 창구 담당자로만 응대한다.";

const stagesOf = (variantId: string) => findFlowVariant(variantId)!.stages.map((s) => s.summary);

test("[P1] 기관 중급 fv-hktx · 카드사 중급 fv-35f2 — 인증번호 거부 · 의심이면 한 번 더 설득한 뒤에만 넘어간다", () => {
  for (const id of ["fv-hktx", "fv-35f2"]) {
    const stage = stagesOf(id).find((s) => s.includes("인증번호를 요구한다"));
    assert.ok(stage, id);
    assert.ok(stage.includes("거부하거나 의심하면"), `${id}: 의심도 저항으로 본다`);
    assert.ok(stage.includes(PERSUADE), `${id}: 설득 1회`);
    assert.ok(stage.includes(NO_THIRD), `${id}: 세 번째 요구 없음(카드사 페르소나 '한 번 더 설득' 줄과의 우선순위)`);
    assert.ok(stage.indexOf(PERSUADE) < stage.indexOf("인증번호 없이 다음 단계로 넘어간다"), `${id}: 설득이 넘어가기보다 앞`);
    assert.ok(stage.includes("전화번호는 말하지 않는다"), `${id}: 확인 권유에 번호를 지어내지 않는다`);
  }
});

test("[P1 · P4] 기관 고급 현행 루트(머리 단계 공유) — 설득 1회형 · 문자 도착 뒤에도 의심에 먼저 답한다", () => {
  const current = listFlowVariants("institutional-impersonation", "advanced");
  assert.ok(current.length > 0);
  let checked = 0;
  for (const v of current) {
    const otp = v.stages.map((s) => s.summary).find((s) => s.includes("본인 확인 마지막 절차라며"));
    if (!otp) continue;
    checked += 1;
    assert.ok(otp.includes(PERSUADE), v.variantId);
    assert.ok(otp.includes("상대가 방금 의심하거나 거절하는 말을 했다면 그 말에 먼저 답한 뒤 요구한다"), v.variantId);
  }
  assert.ok(checked >= 3, `머리 단계를 쓰는 현행 루트 수 ${checked}`);
});

test("[P1 은퇴] fv-pgqt(은퇴)는 종전 문면 그대로다", () => {
  const v = findFlowVariant("fv-pgqt")!;
  assert.equal(v.retired, true);
  const otp = v.stages.map((s) => s.summary).find((s) => s.includes("본인 확인 마지막 절차라며"))!;
  assert.equal(
    otp,
    "본인 확인 마지막 절차라며 문자로 간 인증번호를 불러 달라고 요구한다. 상대가 거부하면 불이익을 한 번 더 암시한 뒤 인증번호 없이 다음 단계로 넘어간다.",
  );
});

test("[P4] 카드사 인증번호 도착 지시 — 의심 · 거절에 먼저 답한 뒤 번호를 요구한다(발송 시점 · 번호 창작 금지 무변경)", () => {
  const item = findInCallSmsItem("card-company-impersonation", "card-otp")!;
  const text = item.announceInstruction;
  const answerFirst = text.indexOf("상대가 방금 의심하거나 거절하는 말을 했다면 문자 이야기보다 먼저 그 말에 답하고");
  assert.ok(answerFirst > 0);
  assert.ok(answerFirst < text.indexOf("이것만 말하려고 지금 따로 말을 꺼내지는 마라"));
  assert.ok(text.includes("**번호를 네가 지어내서 말하지 마라**"));
  assert.equal(item.afterScammerTurns, 3);
});

test("[H3] 확인 창구가 있는 2인 루트 — 넘겨받은 뒤 통화 끝까지 창구 담당자 · 창구 없는 2인 루트에는 예외가 없다", () => {
  // §142 — 다통화 변형은 레그마다 다른 인물이라 한 화자 규칙 · 창구 예외를 싣지 않는다(flowVariants.test.ts [§142 레그 합성]).
  const twoLeg = FLOW_VARIANTS.filter((v) => v.legs.length > 1 && !v.multiCall);
  assert.ok(twoLeg.length > 0);
  let withDesk = 0;
  for (const v of twoLeg) {
    const prompt = resolveSessionScenarioPrompt(v.scenarioId, v.variantId)!.personaPrompt;
    assert.ok(prompt.includes("통화는 처음부터 끝까지 너 혼자 맡는다"), v.variantId);
    const count = prompt.split(H3_EXCEPTION).length - 1;
    assert.equal(count, hasVerifyIntercept(v.scenarioId) ? 1 : 0, v.variantId);
    if (count === 1) withDesk += 1;
  }
  assert.ok(withDesk >= 1, "확인 창구가 있는 2인 루트가 하나 이상 있어야 이 테스트가 산다");
});
