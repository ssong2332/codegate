// §125(DECISIONS #240) — 다중 루트 1b(확인 무력화 밖 고급 6종) · 사용자 실기 신고 (3) · (9) · (11) 반영 고정.
// 설계: docs/research/scenario-multi-route-plan-2026-10.md §5(1차) · Architecture §125.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findFlowVariant } from "../flowVariants";
import { assignablePool } from "../variantPool";
import { CASE_RECORD_NAMES } from "../fictionalNames";

const CALL_FIRST = /말보다 먼저 문자 보내기 도구를 불러 시작/;

test("[§125 루트] 1b 자가 고급 배정 풀 — 납치 2 · 가족 사고 2 · 자산 보호 3 · 검찰 3 · 손주 · 유포 협박 1(근거 없음 · 약)", () => {
  const keys = (id: string) => assignablePool(id, "advanced").map((v) => v.routeKey).sort();
  assert.deepEqual(keys("kidnapping-threat"), ["instant-transfer", "petty-dispute"]);
  assert.deepEqual(keys("family-accident-deepvoice"), ["settlement", "small-instant"]);
  assert.deepEqual(keys("asset-protection-notice-call"), ["cash-handoff", "court-deposit", "gold"]);
  assert.deepEqual(keys("prosecution-cooperation-call"), ["coin-site", "loan-cash", "voucher"]);
  assert.equal(assignablePool("grandchild-impersonation", "advanced").length, 1);
  assert.equal(assignablePool("reputation-blackmail-scam", "advanced").length, 1);
});

test("[§125 신고 (11)] 검찰 고급 추가 검수 — 이유(다른 계좌 · 적금 · 대출 한도로 같은 흐름)를 먼저 말하고 이유 없는 되풀이 금지 · 은퇴 fv-c8wq는 그대로", () => {
  const h3vn = findFlowVariant("fv-h3vn")!;
  const follow = h3vn.stages.find((s) => s.summary.startsWith("사이트에서 이체를 마치면"))!;
  assert.ok(follow);
  assert.match(follow.summary, /같은 흐름으로 빠져나간 기록/);
  assert.match(follow.summary, /왜 추가 검수가 필요한지부터 분명히 설명/);
  assert.match(follow.summary, /같은 추가 요구를 이유 없이 되풀이하지 않고/);
  const c8wq = findFlowVariant("fv-c8wq")!;
  assert.ok(c8wq.stages.every((s) => !/이유 없이 되풀이/.test(s.summary)), "은퇴 변형 바이트 무변경");
  assert.ok(c8wq.sms.every((s) => s.backstopUserTurns === undefined));
});

test("[§125 신고 (3) · (9)] 수사기관 루트 첫 단계 내 정보 활용 · 문자 단계 도구 먼저 · 필수 문자 백스톱 간격 1", () => {
  for (const id of ["fv-h3vn", "fv-v2mk", "fv-a6lq", "fv-p3jx", "fv-t8ga"]) {
    const v = findFlowVariant(id)!;
    assert.match(v.stages[0]!.summary, /그 지역 관할로 사건이 넘어와/, id);
    assert.ok(v.stages.some((s) => CALL_FIRST.test(s.summary)), `${id}: 문자 단계 도구 먼저`);
    for (const item of v.sms.filter((s) => s.required)) assert.equal(item.backstopUserTurns, 1, `${id}/${item.smsId}`);
  }
});

test("[§125 페르소나] 새 결말 루트의 페르소나는 원본 결말 문장을 바꾸고 가상 고유명 · 만날 곳 금지는 그대로", () => {
  const persona = (id: string) => findFlowVariant(id)!.legs[0]!.personaPrompt!;
  for (const id of ["fv-v2mk", "fv-a6lq"]) {
    const p = persona(id);
    assert.equal(p.includes("자산 검수 명목으로 코인 구매·송금을 요구하는 상황"), false, id);
    assert.ok(p.includes(`${CASE_RECORD_NAMES.office} ${CASE_RECORD_NAMES.department} ${CASE_RECORD_NAMES.investigator} 수사관`), `${id}: 가상 고유명`);
    assert.ok(p.includes("사건 조회 안내 문자 말고는"), `${id}: 화면은 사건 조회 문자 1건`);
  }
  assert.match(persona("fv-v2mk"), /문화상품권을 사서 그 핀 번호를 불러 달라고/);
  assert.match(persona("fv-a6lq"), /대출을 받게 하고 그 대출금을 담당 직원에게 맡기라고/);
  for (const id of ["fv-p3jx", "fv-t8ga"]) {
    const p = persona(id);
    assert.equal(p.includes("돈을 찾아 담당 직원에게 맡기라고 요구하는 상황"), false, id);
    assert.ok(p.includes("만날 장소·시간·주소를 정하거나 묻지 않는다"), `${id}: 만날 곳 금지 유지`);
  }
});

test("[§125 결말] 말로 끝나는 결말 — 결정 순간 · 출처(C · S) · 거절 시 마무리 · 장소 · 시간 0", () => {
  for (const id of ["fv-w7tb", "fv-h5sz", "fv-p3jx", "fv-t8ga", "fv-v2mk", "fv-a6lq"]) {
    const v = findFlowVariant(id)!;
    assert.ok(v.sources && v.sources.length > 0, id);
    assert.match(v.stages[v.stages.length - 1]!.summary, /더 조르지 않고 마무리한다/, id);
  }
  for (const id of ["fv-p3jx", "fv-t8ga", "fv-v2mk", "fv-a6lq"]) {
    const v = findFlowVariant(id)!;
    assert.ok(v.decisionMoment, id);
    assert.ok(v.sources!.some((s) => /^C\d+$/.test(s)) && v.sources!.some((s) => /^S\d+$/.test(s)), `${id}: AC-097 (c)`);
  }
  for (const id of ["fv-t8ga", "fv-a6lq"]) {
    assert.match(findFlowVariant(id)!.stages.at(-1)!.summary, /장소 · 시간 · 주소[^.]*정하지도 묻지도 않는다/, id);
  }
});

test("[§125 실측 반영] 말로 끝나는 결말 4벌(상품권 · 대출금 · 금 · 공탁금) — 약속하면 되풀이 없이 마무리 · 답을 미루면 한 번만 다시", () => {
  for (const id of ["fv-v2mk", "fv-a6lq", "fv-t8ga", "fv-p3jx"]) {
    const v = findFlowVariant(id)!;
    assert.ok(v.stages.some((s) => /같은 요구를 말만 바꿔 되풀이하지 말고 짧게 마무리한 뒤 통화를 끝낸다/.test(s.summary)), id);
  }
  // 1a 기관 사칭 금 구매(fv-g2ld)는 같은 결말 문면을 공유하지만 이 줄은 자산 보호 쪽에서만 붙였다(1a 실측에서 되풀이 관측 0).
  assert.ok(findFlowVariant("fv-g2ld")!.stages.every((s) => !/짧게 마무리한 뒤 통화를 끝낸다/.test(s.summary)));
});
