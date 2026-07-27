import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enqueueInstruction,
  shouldOfferVerify,
  takeNextInstruction,
  type PendingInstruction,
} from "./verifyIntercept.ts";

// ── 오퍼 게이트(§16.1.3/§16.1.5) ────────────────────────────────────────────────
test("게이트가 없으면(자격 없음) 확인 권유는 **절대** 도착하지 않는다 — 컨트롤이 존재하지 않는 세션", () => {
  // 서버가 `verifyOffer`를 붙이지 않는 경우: 카탈로그 없음 / 고급 아님 / 난이도 미반영(ElevenLabs).
  assert.equal(shouldOfferVerify({ scammerTurns: 99, alreadyRequested: false }), false);
});

test("게이트 도달 전에는 도착시키지 않는다", () => {
  const trigger = { availableAfterScammerTurns: 2 };
  assert.equal(shouldOfferVerify({ trigger, scammerTurns: 0, alreadyRequested: false }), false);
  assert.equal(shouldOfferVerify({ trigger, scammerTurns: 1, alreadyRequested: false }), false);
});

test("게이트에 도달하면 한 번만 도착시킨다(중복 호출 방지)", () => {
  const trigger = { availableAfterScammerTurns: 2 };
  assert.equal(shouldOfferVerify({ trigger, scammerTurns: 2, alreadyRequested: false }), true);
  assert.equal(shouldOfferVerify({ trigger, scammerTurns: 5, alreadyRequested: true }), false);
});

// ── 지시 주입 큐(§16.6 G31 실시간 보강) ─────────────────────────────────────────
test("[G31 (1)] 같은 턴 경계에 둘 다 due면 **문자 announce가 먼저** 나간다", () => {
  let queue: PendingInstruction[] = [];
  queue = enqueueInstruction(queue, { text: "확인 권유", priority: "verify" });
  queue = enqueueInstruction(queue, { text: "문자 도착", priority: "sms" });
  const first = takeNextInstruction(queue);
  assert.equal(first.item?.text, "문자 도착");
  // [G31 (2)] 보류분은 **버려지지 않는다** — 큐에 그대로 남아 다음 턴에 나간다.
  const second = takeNextInstruction(first.rest);
  assert.equal(second.item?.text, "확인 권유");
  assert.deepEqual(second.rest, []);
});

test("같은 우선순위 안에서는 도착 순서가 보존된다(안정 삽입)", () => {
  let queue: PendingInstruction[] = [];
  queue = enqueueInstruction(queue, { text: "확인1", priority: "verify" });
  queue = enqueueInstruction(queue, { text: "확인2", priority: "verify" });
  assert.deepEqual(
    queue.map((item) => item.text),
    ["확인1", "확인2"],
  );
});

test("문자 지시가 여러 건이어도 서로를 덮어쓰지 않는다(단일 슬롯 유실 방지)", () => {
  let queue: PendingInstruction[] = [];
  queue = enqueueInstruction(queue, { text: "문자1", priority: "sms" });
  queue = enqueueInstruction(queue, { text: "문자2", priority: "sms" });
  queue = enqueueInstruction(queue, { text: "확인", priority: "verify" });
  assert.deepEqual(
    queue.map((item) => item.text),
    ["문자1", "문자2", "확인"],
  );
});

test("빈 지시는 큐에 넣지 않는다(주입해도 모델이 받을 게 없다)", () => {
  const queue = enqueueInstruction([], { text: "   ", priority: "verify" });
  assert.deepEqual(queue, []);
  assert.equal(takeNextInstruction(queue).item, null);
});

// ── 접근성(UX-031 Accessibility) ────────────────────────────────────────────────
// ⭐ T110(§22.1 C10 / §22.3 표) — *"모의 번호는 스크린리더가 한 자씩 읽도록 띄어 쓴다"* 단언은
// `spellOutDisplayNumber`와 함께 **삭제**됐다. 호 전환 모델에는 읽어 줄 번호가 없다(번호 카드
// 제거 = C4). 그 자리를 대신하는 검사는 다음 두 가지다:
//   - **G85-UI**(`verifyCallContinuity.test.ts`) — 화면 소스에 `displayNumber` 참조 0건 ·
//     렌더 문자열에 "번호" 0건. 번호가 되살아나면 여기서 걸린다.
//   - **G86-a**(`functions/src/scenarios/__tests__/verifyIntercept.test.ts`) — 카탈로그 전 문자열
//     필드에 전화번호 형태 0건.
