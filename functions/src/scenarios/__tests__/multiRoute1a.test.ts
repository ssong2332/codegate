// §122(DECISIONS #237) — 다중 루트 1a(확인 무력화 고급 7종) · 사용자 실기 신고 (2) · (3) · (9) 반영 고정.
// 설계: docs/research/scenario-multi-route-plan-2026-10.md §3 · §5(1차) · Architecture §122.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FLOW_VARIANTS, findFlowVariant } from "../flowVariants";
import { assignablePool } from "../variantPool";
import { BACKSTOP_USER_TURNS, planSmsBackstop, resolveDeclaredSms } from "../../inCallSms/smsGate";

/** 1a에서 새로 쓰거나 다시 쓴 변형(문자가 필요한 단계 문면 · 백스톱 간격 대상). */
const REWRITTEN = ["fv-c5fj", "fv-q7cn", "fv-g2ld", "fv-d8pw", "fv-r4hc", "fv-y3ks", "fv-e5mv", "fv-u9fz"];
const CALL_FIRST = /말보다 먼저 문자 보내기 도구를 불러 시작/;

test("[§122 루트] 1a 새 루트가 자가 고급 배정 풀에 있다 — 기관 3 · 대출 3 · 카드 배송 3 · 택배 2 · 루트 키는 칸 안에서 서로 다르다", () => {
  const keys = (id: string) => assignablePool(id, "advanced").map((v) => v.routeKey).sort();
  assert.deepEqual(keys("institutional-impersonation"), ["cash-handoff", "gold", "safe-account"]);
  assert.deepEqual(keys("loan-refinance-scam"), ["cash-repay", "deposit", "repay"]);
  assert.deepEqual(keys("card-delivery-call"), ["leak-opener", "loan-cash", "remote-app-protect"]);
  assert.deepEqual(keys("courier-customs-scam"), ["customs-link", "identity-theft"]);
  // 은행 · 환급 · 카드사는 1a에서 새 루트 0(근거 · 안전 규칙 — Architecture §122.2).
  assert.equal(assignablePool("bank-security-verify-scam", "advanced").length, 1);
  assert.equal(assignablePool("tax-refund-scam", "advanced").length, 1);
});

test("[§122 신고 (9)] 다시 쓴 변형 — 문자를 보내는 단계마다 '도구 먼저' 문면 · 필수 문자는 백스톱 간격 1", () => {
  for (const id of REWRITTEN) {
    const v = findFlowVariant(id)!;
    assert.ok(v, id);
    const smsStages = v.stages.filter((s) => /문자|인증번호|앱을 설치|앱 설치/.test(s.summary) && !/^이체가 끝났다고/.test(s.summary));
    assert.ok(smsStages.some((s) => CALL_FIRST.test(s.summary)), `${id}: 문자 단계에 도구 먼저 문면`);
    for (const item of v.sms.filter((s) => s.required)) assert.equal(item.backstopUserTurns, 1, `${id}/${item.smsId}`);
  }
  // 은퇴 fv-pgqt는 바이트 무변경 — 종전 간격 · 종전 대출 단계 문면.
  const pgqt = findFlowVariant("fv-pgqt")!;
  assert.ok(pgqt.sms.every((s) => s.backstopUserTurns === undefined));
  assert.ok(pgqt.stages.every((s) => !CALL_FIRST.test(s.summary)));
});

test("[§122 신고 (9)] 백스톱 간격 — 1이면 열린 뒤 1발화 넛지 · 2발화 강제, 부재면 종전 2 · 4(하한은 그대로)", () => {
  const fast = resolveDeclaredSms("courier-customs-scam", "fv-y3ks").declared;
  const openAt = 4;
  assert.equal(planSmsBackstop({ declared: fast, delivered: [], userTurns: openAt - 1 }).action, "wait", "하한 전은 그대로");
  assert.equal(planSmsBackstop({ declared: fast, delivered: [], userTurns: openAt }).action, "wait");
  assert.equal(planSmsBackstop({ declared: fast, delivered: [], userTurns: openAt + 1 }).action, "nudge");
  assert.equal(planSmsBackstop({ declared: fast, delivered: [], userTurns: openAt + 2 }).action, "deliver");
  const slow = resolveDeclaredSms("courier-customs-scam", "fv-xpvu").declared; // 계좌 문자 하한 3 · 간격 부재
  assert.equal(planSmsBackstop({ declared: slow, delivered: [], userTurns: 3 + BACKSTOP_USER_TURNS }).action, "nudge");
  assert.equal(planSmsBackstop({ declared: slow, delivered: [], userTurns: 3 + 2 * BACKSTOP_USER_TURNS - 1 }).action, "wait");
  assert.equal(planSmsBackstop({ declared: slow, delivered: [], userTurns: 3 + 2 * BACKSTOP_USER_TURNS }).action, "deliver");
  // 사기범이 "보냈다"고 말하면(claimed) 게이트가 열린 순간 바로 — 종전 그대로.
  assert.equal(planSmsBackstop({ declared: fast, delivered: [], userTurns: openAt, claimed: true }).action, "deliver");
});

test("[§122 신고 (2)] 대출 단계 — 실제 논리(부정 사기 대출 연루 → 정상 대출로 입증)를 먼저 말하고, 거절 · 망설임이면 더 조르지 않고 마무리(사용자 확인 동작 유지)", () => {
  for (const id of ["fv-c5fj", "fv-e5mv"]) {
    const v = findFlowVariant(id)!;
    const stage = v.stages.find((s) => s.summary.includes("대출을 한 번 받아 보시면"))!;
    assert.ok(stage, `${id}: 대출 단계`);
    assert.match(stage.summary, /부정 사기 대출에 연루/);
    assert.match(stage.summary, /명의 도용 여부가 입증/);
    assert.match(stage.summary, /왜 대출을 받아야 하는지부터 분명히 설명한다/);
    assert.match(stage.summary, /더 조르지 않고 마무리한다/);
  }
  assert.equal(findFlowVariant("fv-c5fj")!.goalFollowUpUserTurns, 3, "§117 값 유지 — 코칭 직후 바로 끊는 동작");
});

test("[§122 신고 (3)] 수사기관 사칭 루트 첫 단계 — 내 정보 목록의 사는 곳 · 이름 · 생년월일을 사건 설명에 섞되 지어내지 않는다", () => {
  for (const id of ["fv-c5fj", "fv-q7cn", "fv-g2ld"]) {
    const first = findFlowVariant(id)!.stages[0]!.summary;
    assert.match(first, /그 지역 관할로 사건이 넘어와/, id);
    assert.match(first, /목록에 없는 값은 지어내지 않고/, id);
    assert.match(first, /실제 기관 이름은 쓰지 않는다/, id);
  }
});

test("[§122 말로 끝나는 결말] 현금 · 금 · 대출금 전달 약속 · 현금 상환 루트 — 후속 값(C-5) · 결정 순간 '약속' · 장소 · 시간 0 문면", () => {
  for (const id of ["fv-q7cn", "fv-g2ld", "fv-r4hc", "fv-e5mv"]) {
    const v = findFlowVariant(id)!;
    assert.equal(v.goalFollowUpUserTurns, 4, id);
    assert.match(v.decisionMoment ?? "", /약속/, id);
    const last = v.stages[v.stages.length - 1]!.summary;
    assert.match(last, /장소 · 시간 · 주소[^.]*정하지도 묻지도 않는다/, `${id}: 만날 곳 0(AC-102 (c))`);
    assert.match(last, /더 조르지 않고 마무리한다/, id);
  }
  // 새 루트는 모두 출처를 단다(사례 카드 S35 ~ S43 · 기존 C · S).
  for (const v of FLOW_VARIANTS.filter((x) => REWRITTEN.includes(x.variantId) && x.variantId !== "fv-c5fj")) {
    assert.ok(v.sources && v.sources.length > 0, v.variantId);
  }
});
