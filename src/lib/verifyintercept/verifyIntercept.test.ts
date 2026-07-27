import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enqueueInstruction,
  shouldOfferVerify,
  shouldReinjectTransferState,
  shouldRetryVerifyOffer,
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

// ── T118 / 층 A5 발동 조건(§25.3 (3) · §25.9 ⑥) ──────────────────────────────────
//
// ⚠️ 이 세 조건은 **각각 다른 사고를 막는다**. 하나씩 독립으로 고정한다 — 한 테스트에 섞으면
// 어느 조건이 죽었는지 알 수 없다(이 저장소가 오염 샘플에서 반복해 배운 형식).

test("[T118/G99] 직전 주입 이후 **사용자 발화가 0회**면 재주입하지 않는다 — 자기 구동 루프 차단", () => {
  // ⛔ 이 단언이 무너지면 "매 사기범 턴마다 재주입"이 되고, 주입이 발화를 유발할 경우
  // 주입 → 발화 → 턴 완료 → 주입의 무한 루프가 된다. **에러가 나지 않아 조용히 망가진다.**
  assert.equal(
    shouldReinjectTransferState({
      placed: true,
      userTurnsSinceLastInjection: 0,
      atScammerTurnBoundary: true,
    }),
    false,
  );
});

test("[T118] 사용자가 1회 이상 말한 뒤의 사기범 턴 경계에서는 재주입한다(상한 없음)", () => {
  for (const turns of [1, 2, 7]) {
    assert.equal(
      shouldReinjectTransferState({
        placed: true,
        userTurnsSinceLastInjection: turns,
        atScammerTurnBoundary: true,
      }),
      true,
      `userTurns=${turns}`,
    );
  }
});

test("[T118/§25.9 ④-A 역검증] `placed` 분기를 뒤집은 **사본**에서는 재주입이 0건이다", () => {
  // 오염은 테스트 코드 안의 사본으로만 만든다(실제 소스를 고쳤다 되돌리는 방식 금지 —
  // `callContinuity.test.ts:161-162` 관례). 사본은 `placed`를 무시하는 구현이다.
  const withoutPlacedGuard = (input: { userTurnsSinceLastInjection: number }) =>
    input.userTurnsSinceLastInjection >= 1;
  const boundary = { userTurnsSinceLastInjection: 3, atScammerTurnBoundary: true };
  // 전환 **전**(placed:false)에는 실제 구현이 0건이어야 하고,
  assert.equal(shouldReinjectTransferState({ placed: false, ...boundary }), false);
  // 가드를 없앤 사본은 같은 입력에서 주입해 버린다 = 이 가드가 살아 있다는 증명.
  assert.equal(withoutPlacedGuard(boundary), true);
});

test("[T118] 사기범 턴 경계가 아니면 재주입하지 않는다(기존 주입과 같은 경계만 쓴다)", () => {
  assert.equal(
    shouldReinjectTransferState({
      placed: true,
      userTurnsSinceLastInjection: 5,
      atScammerTurnBoundary: false,
    }),
    false,
  );
});

// ── T118 / R-2 오퍼 실패 롤백 범위(§25.5 (4)) ────────────────────────────────────

test("[T118/R-2] 재시도해도 같은 결과인 오류에서는 재시도 창을 다시 열지 않는다", () => {
  for (const code of ["failed-precondition", "invalid-argument", "permission-denied"]) {
    assert.equal(shouldRetryVerifyOffer({ code: `functions/${code}` }), false, code);
    assert.equal(shouldRetryVerifyOffer({ code }), false, `접두사 없는 ${code}`);
  }
});

test("[T118/R-2] 일시 오류·네트워크 실패에서는 반드시 되돌린다(기능 소실 > 중복 주입)", () => {
  // ⛔ 롤백을 통째로 없애면 이 세션에서 확인 무력화가 **영영 뜨지 않는다**.
  assert.equal(shouldRetryVerifyOffer({ code: "functions/unavailable" }), true);
  assert.equal(shouldRetryVerifyOffer({ code: "functions/internal" }), true);
  assert.equal(shouldRetryVerifyOffer(new Error("network request failed")), true);
  assert.equal(shouldRetryVerifyOffer(null), true);
});

// ── 접근성(UX-031 Accessibility) ────────────────────────────────────────────────
// ⭐ T110(§22.1 C10 / §22.3 표) — *"모의 번호는 스크린리더가 한 자씩 읽도록 띄어 쓴다"* 단언은
// `spellOutDisplayNumber`와 함께 **삭제**됐다. 호 전환 모델에는 읽어 줄 번호가 없다(번호 카드
// 제거 = C4). 그 자리를 대신하는 검사는 다음 두 가지다:
//   - **G85-UI**(`verifyCallContinuity.test.ts`) — 화면 소스에 `displayNumber` 참조 0건 ·
//     렌더 문자열에 "번호" 0건. 번호가 되살아나면 여기서 걸린다.
//   - **G86-a**(`functions/src/scenarios/__tests__/verifyIntercept.test.ts`) — 카탈로그 전 문자열
//     필드에 전화번호 형태 0건.
