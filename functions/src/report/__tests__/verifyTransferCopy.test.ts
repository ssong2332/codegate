// §55 D4(R-D) — 전환 이벤트 문면의 **연결 문장 1개**(docs/Architecture.md §55.7 (1)).
//
// 사용자 신고: 전환 완료 후 대사가 리플레이에서 **원 사기범 번호로 라벨링된다**.
// ⛔ 처방은 **라벨 교체가 아니다(G349)** — ① 어느 말풍선부터가 데스크인지 오늘 어느 층도
// 관측하지 않고 ② 두 번째 발신자 소스 금지(§22.4 C2·G87) ③ *"번호가 끝까지 하나였다"* 는
// 이 시나리오의 학습 포인트 자체를 지운다. 빠진 것은 라벨이 아니라 **연결 문장**이므로
// 서버 스냅샷의 문면으로 닫는다. **화면 코드 0줄**(§16.3.5).
//
// 이 파일이 고정하는 것:
//   ⓐ `placedAt`이 있는 `verify_reconnected`에만 그 문장이 붙는다.
//   ⓐ' ⭐ 역검증 — `placedAt`이 **없는** 오퍼 항목에는 **없다**(§38.6 S1 재발 경로, G352).
//   ⓒ 이벤트 이름·개수·`correctAction`·`outcome` 3분류 **무변경**.
//   ⭐ 새 문장이 **특정 말풍선을 지목하지 않는다**(경계 미관측 — §55.5 ⑤⑥).
// ⚠️ 무력감 표현·수단 서술 금지 스캔은 `verifyTimeline.test.ts`의 `ALL_SERVER_COPY`가
//    `deriveVerifyEvents` 산출을 그대로 훑으므로 **새 문장도 자동으로 그 게이트를 지난다**.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VERIFY_INTERCEPT_CORRECT_ACTION,
  deriveVerifyEvents,
  resolveVerifyOutcome,
  type VerifyTimelineSource,
} from "../verifyTimeline";

const SESSION_CREATED_MS = 1_000_000;

const offer = (extra: Partial<VerifyTimelineSource> = {}): VerifyTimelineSource => ({
  offerId: "institution-verify-desk",
  deskLabel: "○○금융범죄대응센터 확인창구",
  displayNumber: "1500-0000",
  offerAnchorScammerTurn: 2,
  offeredAtMs: SESSION_CREATED_MS + 22_000,
  ...extra,
});

/** 연결 문장의 두 축: ⓐ 이 뒤의 상대 대사 = 넘겨받은 담당자 / ⓑ 참가자는 새로 걸지 않았다. */
const CONTINUITY_AXIS_B = "참가자가 새로 전화를 건 것이 아니라 같은 통화가 그대로 이어졌고";
const CONTINUITY_AXIS_A = "넘겨받은 담당자의 말입니다";

test("[§55 D4 ⓐ] 전환이 실제로 있었던 이벤트에만 연결 문장이 붙는다", () => {
  for (const outcome of ["placed_and_complied", "placed_not_complied"] as const) {
    const events = deriveVerifyEvents(offer({ placedAtMs: 1 }), outcome);
    const reconnected = events.find((e) => e.event === "verify_reconnected");
    assert.ok(reconnected, `verify_reconnected 이벤트가 없다(outcome=${outcome})`);
    assert.ok(
      reconnected.what.includes(CONTINUITY_AXIS_B),
      `연결 문장(축 ⓑ)이 없다(outcome=${outcome}): ${reconnected.what}`,
    );
    assert.ok(
      reconnected.what.includes(CONTINUITY_AXIS_A),
      `연결 문장(축 ⓐ)이 없다(outcome=${outcome}): ${reconnected.what}`,
    );
  }
});

test("⭐ 역검증 [§55 D4 ⓐ' / G352] placedAt이 없는 항목에는 그 문장이 **없다**", () => {
  // ⛔ §38.6 S1이 고친 결함(오퍼 항목이 전환을 단언)의 재발 경로다 — 오퍼 카드가 서술하는 사실은
  // "카드가 떴다"뿐이고, 참가자가 전환을 요청한 적 없는 세션에서도 그 항목은 만들어진다.
  const events = deriveVerifyEvents(offer(), "offered_not_placed");
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "verify_offer_shown");
  for (const e of events) {
    assert.ok(!e.what.includes(CONTINUITY_AXIS_B), `오퍼 항목이 전환 연결을 단언했다: ${e.what}`);
    assert.ok(!e.what.includes("넘겨받은 담당자"), `오퍼 항목이 전환을 단언했다: ${e.what}`);
  }
});

test("⭐ 역검증 [§55 D4 ⓒ] 이벤트 이름·개수·correctAction·outcome 3분류가 무변경이다", () => {
  // ⚠️ 이벤트 이름은 리플레이의 `hasVerifyTransfer`(= `event === "verify_reconnected"`)가 읽는
  // 유일한 판별자다(§38.6 S2) — 바뀌면 화면이 전환 서술을 통째로 잃는다.
  assert.deepEqual(
    deriveVerifyEvents(offer({ placedAtMs: 1 }), "placed_and_complied").map((e) => e.event),
    ["verify_offer_shown", "verify_reconnected"],
  );
  assert.deepEqual(
    deriveVerifyEvents(offer(), "offered_not_placed").map((e) => e.event),
    ["verify_offer_shown"],
  );
  // ⛔ `correctAction` 문자열은 0줄 변경(§55.7 (1) 1).
  const reconnected = deriveVerifyEvents(offer({ placedAtMs: 1 }), "placed_not_complied")[1];
  assert.equal(reconnected.correctAction, VERIFY_INTERCEPT_CORRECT_ACTION);
  // outcome 3분류 자체도 무변경.
  assert.equal(resolveVerifyOutcome(false, 0), "offered_not_placed");
  assert.equal(resolveVerifyOutcome(true, 0), "placed_not_complied");
  assert.equal(resolveVerifyOutcome(true, 1), "placed_and_complied");
});

test("⭐ [§55 D4 / G349] 새 문장은 특정 말풍선을 지목하지 않는다(경계 미관측)", () => {
  // 어느 말풍선부터가 데스크인지는 오늘 어느 층도 관측하지 않는다(§55.5 ⑤⑥ — 표시 앵커는 요청
  // 시점의 사기범 턴 수 + 1이며 데스크 첫 발화가 실제로 그 턴에 나오는지를 보증하지 않는다).
  // 지목하면 리포트가 "이 대사는 데스크가 했다"를 근거 없이 단언한다.
  const what = deriveVerifyEvents(offer({ placedAtMs: 1 }), "placed_and_complied")[1].what;
  for (const pointing of ["번째 말풍선", "번째 대사", "다음 대사부터", "바로 다음 문장"]) {
    assert.ok(!what.includes(pointing), `말풍선 지목 금지(${pointing}): ${what}`);
  }
  // ⛔ 라벨 교체를 유도하는 서술도 없어야 한다 — 전사의 발신자 표기는 끝까지 하나가 맞다.
  assert.ok(!what.includes("발신번호가 바뀌"), `번호 변경을 단언했다: ${what}`);
});
