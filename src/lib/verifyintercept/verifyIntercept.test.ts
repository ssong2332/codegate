import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  announceTurnsOnInstructionDispatch,
  enqueueInstruction,
  INSTRUCTION_DRAIN_BACKSTOP_SEC,
  INSTRUCTION_DRAIN_MAX_SUPPRESSED_BOUNDARIES,
  nextVerifyOfferStage,
  rollbackVerifyOfferPhase,
  shouldAnnounceVerifyOffer,
  shouldDrainInstructionQueue,
  shouldOfferVerify,
  shouldReinjectTransferState,
  shouldRetryVerifyOffer,
  shouldRevealVerifyOffer,
  takeNextInstruction,
  verifySeriesFor,
  type PendingInstruction,
  type VerifyOfferPhase,
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

// ══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §47.3 C1~C2 — 오퍼 개시를 참가자 구조화 이벤트로 옮긴다(턴 게이트는 AND로 남는다)
//
// 사용자 신고 2회째(§26.2 ㉡) — "의심하지도 않았는데 사기범이 먼저 확인 창구를 제안했다."
// ⛔ `shouldOfferVerify`(위) 자체는 이 절 전체에서 **한 글자도 바뀌지 않는다**(G263). 아래는
// 그 위에 참가자 조건을 조합하는 `shouldAnnounceVerifyOffer`와 계열 판별 `verifySeriesFor`다.
// ══════════════════════════════════════════════════════════════════════════════

test("[§47.6 P-5] 계열 판별 — bank-security-verify-scam만 계열 A, 나머지는 전부 계열 B", () => {
  assert.equal(verifySeriesFor("bank-security-verify-scam"), "A");
  assert.equal(verifySeriesFor("institutional-impersonation"), "B");
  assert.equal(verifySeriesFor("family-accident-deepvoice"), "B");
  // 카탈로그 미로드 등으로 scenarioId가 아직 없을 때도 계열 B(참가자 조건이 걸리는 쪽 = 더 안전한
  // 기본값)로 취급한다 — 계열 A 예외가 조용히 새어 나가지 않게 한다.
  assert.equal(verifySeriesFor(undefined), "B");
});

test("[§47.3 C1/P-6 ⓐ] 계열 B: 게이트에 도달해도 참가자 의사가 없으면 오퍼가 뜨지 않는다", () => {
  assert.equal(
    shouldAnnounceVerifyOffer({ series: "B", gateReached: true, intentExpressed: false }),
    false,
    "AND 조건의 절반(참가자 의사)이 없으면 개시하지 않는다 — 이것이 ③-a를 닫는 바로 그 조건이다",
  );
});

test("[§47.3 C2/G264/P-6 ⓑ 역검증] 계열 A: 참가자 의사가 없어도 게이트 도달만으로 뜬다(현행 무변경)", () => {
  assert.equal(
    shouldAnnounceVerifyOffer({ series: "A", gateReached: true, intentExpressed: false }),
    true,
    "계열 A(확인 우회가 본론)는 예외다 — 참가자 조건을 걸면 그 시나리오의 존재 이유가 사라진다(G264)",
  );
});

test("[§47.3 C1] 계열 B — 게이트와 참가자 의사가 둘 다 있어야 뜬다(AND, 편측 결여 전수)", () => {
  assert.equal(
    shouldAnnounceVerifyOffer({ series: "B", gateReached: true, intentExpressed: true }),
    true,
  );
  assert.equal(
    shouldAnnounceVerifyOffer({ series: "B", gateReached: false, intentExpressed: true }),
    false,
    "참가자가 먼저 탭해도 턴 게이트에 아직 안 왔으면 뜨지 않는다 — 게이트 값은 무변경이다(G263)",
  );
  assert.equal(
    shouldAnnounceVerifyOffer({ series: "B", gateReached: false, intentExpressed: false }),
    false,
  );
});

test("[G264] 계열 A는 게이트 미도달이면 참가자 의사와 무관하게 뜨지 않는다(AND의 게이트 절반은 계열 불문)", () => {
  assert.equal(
    shouldAnnounceVerifyOffer({ series: "A", gateReached: false, intentExpressed: true }),
    false,
    "계열 A 예외는 '참가자 조건을 생략한다'이지 '게이트까지 생략한다'가 아니다",
  );
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

// ── §52.7 (5) 가·나 / §57.5 — G31 큐 드레인 참가자 턴 조건(T-4) ───────────────────

test("[§52.7 가] 첫 지시(게이트 열림)는 참가자가 말하지 않았어도 내보낸다 — 미루면 안 된다", () => {
  // ⛔ 이 단언이 무너지면 문자가 이미 화면에 도착해 있는데 announce가 미뤄져 §53.6 (4)의
  // "문자는 이미 도착해 있다"는 전제와 어긋난다.
  assert.equal(
    shouldDrainInstructionQueue({
      userSpokeSinceLastInjection: true,
      suppressedBoundaryStreak: 0,
    }),
    true,
  );
});

test("[§52.7 가/T-4] 직전 주입 이후 참가자가 한 번도 말하지 않았으면 다음 경계에서는 억제한다", () => {
  // ⛔ 이 단언이 무너지면 연속 강제 발화(T-4)가 그대로 재현된다 — bank 시나리오의 턴3→턴4.
  assert.equal(
    shouldDrainInstructionQueue({
      userSpokeSinceLastInjection: false,
      suppressedBoundaryStreak: 0,
    }),
    false,
  );
});

test("[§52.7 가] 참가자가 말한 뒤에는 다시 내보낸다(게이트가 열린다)", () => {
  assert.equal(
    shouldDrainInstructionQueue({
      userSpokeSinceLastInjection: true,
      suppressedBoundaryStreak: 3,
    }),
    true,
  );
});

test("[§52.7 나] 참가자가 끝내 말하지 않아도 상한(N=1) 경계 뒤에는 강제 방출한다 — 무한 대기 금지", () => {
  // agentSpeechGate.ts의 STALL_GRACE_MS와 같은 이유(정지 대비 안전장치) — 상한 없는 대기는
  // 원래 증상(연속 강제 발화)보다 나쁜 고장(큐 적체 항목이 영영 안 나감)이 된다.
  assert.equal(INSTRUCTION_DRAIN_MAX_SUPPRESSED_BOUNDARIES, 1);
  assert.equal(
    shouldDrainInstructionQueue({
      userSpokeSinceLastInjection: false,
      suppressedBoundaryStreak: INSTRUCTION_DRAIN_MAX_SUPPRESSED_BOUNDARIES,
    }),
    true,
  );
});

test("[§52.7/§25.9 ④-A 역검증] 상한 조건을 뒤집은 **사본**에서는 상한이 되어도 계속 억제한다", () => {
  // 오염은 테스트 코드 안의 사본으로만 만든다(실제 소스를 고쳤다 되돌리는 방식 금지).
  const withoutCapGuard = (input: { userSpokeSinceLastInjection: boolean }) =>
    input.userSpokeSinceLastInjection;
  const stalled = { userSpokeSinceLastInjection: false, suppressedBoundaryStreak: 99 };
  // 실제 구현은 상한에 도달하면 강제 방출하고,
  assert.equal(shouldDrainInstructionQueue(stalled), true);
  // 상한 가드를 없앤 사본은 같은 입력에서도 계속 억제한다 = 이 상한이 실제로 살아 있다는 증명.
  assert.equal(withoutCapGuard(stalled), false);
});

// ── Action Item 1(reviewer REJECTED, e4414c3 후속) — 상한 재평가 안전장치 ──────────
//
// ⛔ 배경: `drainInstructionQueue`는 `handleScammerTurnComplete`(모델이 실제로 말해야 온다)와
// `enqueueTurnInstruction`(새 지시가 생겨야 온다)에서만 다시 불린다. 억제된 항목은 스스로
// 발화를 만들지 못하므로, 이게 큐의 **마지막** 항목이고(예: `handlePlaceVerifyCall`의 재연결
// 지시) 참가자가 계속 침묵하면 상한(나)에 닿아도 재판정할 다음 호출이 **영영 오지 않을 수 있다.**
//
// 아래 시뮬레이션은 `play/page.tsx`의 ref 상태 기계(스트릭·상한 도달 시각·통화 경과 타이머)를
// **순수 함수만으로** 재현한다 — `shouldDrainInstructionQueue` 자체는 건드리지 않는다(위 [§52.7
// 가/T-4] 테스트가 이미 그 함수를 고정한다).

/**
 * `play/page.tsx`의 억제 스트릭 + `instructionCapReachedAtSecRef` + 통화 경과 타이머(1초 틱)
 * 배선을 순수 함수로 재현한다. `ticksAfterSuppression`은 최초 억제 이후 "자연적인 호출"(모델
 * 발화·새 지시) 없이 흐르는 통화 경과 타이머 틱 횟수다.
 */
function simulateOrphanedInstructionDrain(input: {
  ticksAfterSuppression: number;
  backstopSec: number;
}): { drainedAtTick: number | null } {
  let streak = 0;
  let capReachedAtSec: number | null = null;
  let elapsedSec = 0;
  let drainedAtTick: number | null = null;

  // 최초(그리고 이 시나리오에서는 유일한) 자연적 드레인 시도 — 큐의 마지막 항목이 off-boundary로
  // 들어와 게이트가 닫힌 채(참가자 미발화) 억제된다(guarded [§52.7 가/T-4] 테스트와 같은 입력).
  const firstAttempt = shouldDrainInstructionQueue({
    userSpokeSinceLastInjection: false,
    suppressedBoundaryStreak: streak,
  });
  assert.equal(firstAttempt, false, "전제: 첫 억제는 그대로 억제여야 한다(T-4 가드)");
  streak += 1;
  if (streak >= INSTRUCTION_DRAIN_MAX_SUPPRESSED_BOUNDARIES && capReachedAtSec === null) {
    capReachedAtSec = elapsedSec;
  }

  // 그 뒤로는 **자연적 호출이 0건**이다(참가자 침묵·신규 지시 없음) — 오직 통화 경과 타이머 틱만
  // `drainInstructionQueue`를 다시 불러 재판정을 시도한다.
  for (let tick = 1; tick <= input.ticksAfterSuppression; tick += 1) {
    elapsedSec += 1;
    if (capReachedAtSec === null) continue;
    if (elapsedSec - capReachedAtSec < input.backstopSec) continue;
    const drained = shouldDrainInstructionQueue({
      userSpokeSinceLastInjection: false,
      suppressedBoundaryStreak: streak,
    });
    if (drained) {
      drainedAtTick = tick;
      break;
    }
  }
  return { drainedAtTick };
}

test("[Action Item 1] 유예 시간 전에는 재판정을 강제하지 않는다 — 참가자 턴 대기가 살아 있다", () => {
  const result = simulateOrphanedInstructionDrain({
    ticksAfterSuppression: INSTRUCTION_DRAIN_BACKSTOP_SEC - 1,
    backstopSec: INSTRUCTION_DRAIN_BACKSTOP_SEC,
  });
  assert.equal(result.drainedAtTick, null, "유예 시간 전에는 방출되면 안 된다");
});

test("[Action Item 1] 자연적 호출이 0건이어도 유예 시간 뒤에는 방출된다 — 정체 재현·해소", () => {
  // ⛔ 역검증: 안전장치 없이(=틱을 전혀 안 준다) 자연적 호출도 0건이면 영영 방출되지 않는다(구
  // 결함 재현) — reviewer가 보고한 그 정체다.
  const stalledForever = simulateOrphanedInstructionDrain({
    ticksAfterSuppression: 0,
    backstopSec: INSTRUCTION_DRAIN_BACKSTOP_SEC,
  });
  assert.equal(stalledForever.drainedAtTick, null, "안전장치가 틱을 못 받으면 여전히 정체된다");

  // 실제 배선(통화 경과 타이머가 매초 틱)에서는 유예 시간만큼 틱이 쌓이면 방출된다.
  const resolved = simulateOrphanedInstructionDrain({
    ticksAfterSuppression: INSTRUCTION_DRAIN_BACKSTOP_SEC + 2,
    backstopSec: INSTRUCTION_DRAIN_BACKSTOP_SEC,
  });
  assert.equal(resolved.drainedAtTick, INSTRUCTION_DRAIN_BACKSTOP_SEC, "유예 시간 도달 즉시 방출");
});

test("[Action Item 1 배선] page.tsx가 상한 도달 시각을 기록하고, 통화 경과 타이머로 재판정한다", () => {
  const src = readFileSync(PLAY_PAGE_SRC, "utf8");
  assert.ok(
    /instructionCapReachedAtSecRef\.current\s*=\s*elapsedSecRef\.current/.test(src),
    "상한 도달 시각을 기록하는 지점이 있어야 한다",
  );
  assert.ok(
    /elapsedSec\s*-\s*capReachedAtSec\s*<\s*INSTRUCTION_DRAIN_BACKSTOP_SEC/.test(src),
    "유예 시간 미도달이면 재시도하지 않는 가드가 있어야 한다",
  );
  assert.ok(
    /if\s*\(elapsedSec - capReachedAtSec < INSTRUCTION_DRAIN_BACKSTOP_SEC\) return;\s*\n\s*drainInstructionQueue\(\);/.test(
      src,
    ),
    "유예 시간이 지나면 drainInstructionQueue를 다시 불러야 한다",
  );
  // ⛔ 이번 처방은 판정 함수 자체를 바꾸지 않는다 — 상한 경계 조건은 여전히 사전(pre-increment)
  // 비교다(post-increment로 바꾸면 bank 턴3→턴4가 참가자 발화 없이 매번 즉시 통과해 T-4가
  // 일반 경로에서 재현된다, verifyIntercept.ts의 INSTRUCTION_DRAIN_BACKSTOP_SEC 주석 참고).
  assert.ok(
    /if \(input\.suppressedBoundaryStreak >= INSTRUCTION_DRAIN_MAX_SUPPRESSED_BOUNDARIES\) return true;/.test(
      readFileSync(path.resolve(import.meta.dirname, "./verifyIntercept.ts"), "utf8"),
    ),
    "shouldDrainInstructionQueue의 상한 비교(사전값, >=)는 그대로여야 한다",
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

// ══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §38 런타임 층 (E3) — **컨트롤은 예고보다 먼저 열리지 않는다**
//
// 사용자 신고: *"내가 보안확인창구로 넘긴다고 한 적이 없는데, 연결한다고 혼자서 하면서…"*
// 종전 조건은 `verifyOffer !== null && placedAtMs === undefined`뿐이었고, 그 문서는 예고가
// **큐에 들어가기도 전에** 쓰였다 ⇒ 아무도 말하지 않았는데 버튼이 떠 있었다(§38.1 (3)).
//
// ⛔ **이 테스트가 증명하지 않는 것**: *"사기범이 실제로 그 대사를 말했다"*. 관측되는 것은
// **턴 완료**(실시간) / **프롬프트 적재**(폴백)이지 대사 내용이 아니다(§38.11 (c)).
// ══════════════════════════════════════════════════════════════════════════════

// ── E3-ⓐ/ⓑ 실시간(후보 E — 판별자는 **문서 존재**) ──────────────────────────────
test("[§38 / E3-ⓐ] 실시간: 예고 턴이 끝나 문서가 생긴 뒤에는 컨트롤이 열린다", () => {
  assert.equal(
    shouldRevealVerifyOffer({ callMode: "realtime", offer: { announcedAtMs: undefined } }),
    true,
    "실시간에서 문서 존재 자체가 '예고 턴 완료'다(2단 오퍼의 commit 단계에서만 만들어진다)",
  );
});

test("[§38 / E3-ⓑ 역검증] ⛔ 예고 미완(문서 부재)에서 true가 나오면 실패다", () => {
  // 이 단언이 없으면 게이트가 조용히 죽어도 아무도 모른다(반려 사유 — §38.12 implementer ⓒ).
  assert.equal(shouldRevealVerifyOffer({ callMode: "realtime", offer: null }), false);
  assert.equal(shouldRevealVerifyOffer({ callMode: "fallback", offer: null }), false);
  // 종전 구현을 테스트 코드 안에서만 재현한다 — 그것은 이 입력에서 **true를 냈다**.
  const beforeS38 = (offer: { placedAtMs?: number } | null) =>
    offer !== null && offer.placedAtMs === undefined;
  assert.equal(beforeS38({}), true, "종전 동작 재현: 문서만 있으면 열렸다");
  assert.equal(
    shouldRevealVerifyOffer({ callMode: "fallback", offer: {} }),
    false,
    "⭐ 같은 입력에서 새 게이트는 닫는다 — 죽은 게이트가 아니다",
  );
});

test("[§38 / E3-ⓒ · G184] 새로고침 시나리오(문서만 있고 클라 ref 없음)에서도 값이 유지된다", () => {
  // ⭐ 이 함수의 입력에는 ref·타이머·렌더 상태가 **하나도 없다** — 새로고침 후 문서 구독만으로
  // 같은 값이 나온다. 후보 D(클라 ref 단독)를 단독 기각한 판별자가 바로 이 성질이다.
  const afterReload = { announcedAtMs: 1_700_000_000_000 };
  assert.equal(shouldRevealVerifyOffer({ callMode: "realtime", offer: afterReload }), true);
  assert.equal(shouldRevealVerifyOffer({ callMode: "fallback", offer: afterReload }), true);
});

// ── 폴백(후보 C — 판별자는 `announcedAt`) ────────────────────────────────────────
test("[§38 / 후보 C] 폴백: 문서가 있어도 announcedAt 전에는 컨트롤이 열리지 않는다", () => {
  assert.equal(shouldRevealVerifyOffer({ callMode: "fallback", offer: {} }), false);
  assert.equal(
    shouldRevealVerifyOffer({ callMode: "fallback", offer: { announcedAtMs: 1 } }),
    true,
    "서버가 예고 지시를 **이번 턴 프롬프트에 실은 자리**에서 마크한다 — 폴백은 응답이 곧 대사다",
  );
});

test("[§38] 전환이 끝나면(placedAt) 경로와 무관하게 컨트롤이 사라진다(종전 규칙 유지)", () => {
  for (const callMode of ["realtime", "fallback"] as const) {
    assert.equal(
      shouldRevealVerifyOffer({ callMode, offer: { placedAtMs: 1, announcedAtMs: 1 } }),
      false,
      callMode,
    );
  }
});

// ── G187 — 단계 상태(⛔ boolean 금지) ────────────────────────────────────────────
test("[§38 / G187] 2단 오퍼의 단계 전이표", () => {
  assert.equal(nextVerifyOfferStage({ phase: "idle", announceTurnComplete: false }), "announce");
  assert.equal(
    nextVerifyOfferStage({ phase: "announced", announceTurnComplete: false }),
    null,
    "⭐ 예고 턴이 끝나기 전에는 기다린다 — 이 대기가 곧 순서 교정이다",
  );
  assert.equal(nextVerifyOfferStage({ phase: "announced", announceTurnComplete: true }), "commit");
  assert.equal(nextVerifyOfferStage({ phase: "committed", announceTurnComplete: true }), null);
});

test("[§38 / G187] 2단계 실패는 idle이 아니라 announced로 되돌린다(중복 예고 금지)", () => {
  assert.equal(
    rollbackVerifyOfferPhase({ currentPhase: "committed", stage: "commit", retryable: true }),
    "announced",
    "⛔ idle로 되돌리면 예고가 두 번 나간다 — 예고는 이미 발화됐다",
  );
  assert.equal(
    rollbackVerifyOfferPhase({ currentPhase: "announced", stage: "announce", retryable: true }),
    "idle",
    "1단계 실패는 처음부터 다시 — 아직 아무 말도 안 나갔다",
  );
  // 재시도 불가 오류(세션 비활성·카탈로그 불일치·소유권)는 단계를 굳힌다.
  assert.equal(
    rollbackVerifyOfferPhase({ currentPhase: "committed", stage: "commit", retryable: false }),
    "committed",
  );
  assert.equal(
    rollbackVerifyOfferPhase({ currentPhase: "announced", stage: "announce", retryable: false }),
    "announced",
  );
});

test("[§38 / G187 역검증] boolean 하나로는 '1단계 성공 · 2단계 실패'를 표현하지 못한다", () => {
  // 종전 boolean 재현: 값이 true로 굳으면 commit을 다시 시도할 방법이 없다.
  let requested = false;
  requested = true; // 1단계 성공
  assert.equal(requested, true, "boolean은 '어느 단계까지 갔는가'를 담지 못한다");
  // 단계 상태는 같은 상황에서 **commit만** 다시 시도한다.
  assert.equal(
    nextVerifyOfferStage({
      phase: rollbackVerifyOfferPhase({
        currentPhase: "committed",
        stage: "commit",
        retryable: true,
      }),
      announceTurnComplete: true,
    }),
    "commit",
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// §45.7 V2 — 예고 시점 기록을 **큐를 떠난 시점**으로 옮긴다(§45.6 (3) F2-a)
//
// ⛔ **G251** — F2-a는 큐 경합 의존이라 **간헐**이다. *"고친 뒤 안 났다"* 는 증거가 되지 못한다.
// 결정적 증거는 아래 시뮬레이션이며, **경합이 없는 회차에서는 종전 배선도 통과한다**는 것까지
// 함께 못박는다(그것이 이 결함이 몇 달간 안 보인 이유다).
// ══════════════════════════════════════════════════════════════════════════════

/**
 * `session/play/page.tsx`의 큐·ref 배선을 **순수 함수만으로** 재현한다.
 * 좌표계는 "완료된 Live 사기범 턴 수"이고, 사기범 문서의 1-기반 순번은 `1 + 턴번호`다
 * (오프닝 사기범 행이 turnIndex 0으로 먼저 있기 때문 — `realtimeVerifyAnchor`의 +1과 같은 사실).
 */
function simulateRealtimeOffer(input: {
  gate: number;
  /** 게이트 턴에 문자 announce가 그 턴의 지시 슬롯을 먼저 차지하는가(G31 경합). */
  smsCollision: boolean;
  /** `dispatch` = §45.7 V2(현행) · `request` = 종전 배선(요청 발신 시점 기록). */
  recordAt: "dispatch" | "request";
  maxTurns?: number;
}): { anchorScammerDoc: number | null; announceSpokenScammerDoc: number | null } {
  let scammerTurns = 0;
  let phase: VerifyOfferPhase = "idle";
  let queue: PendingInstruction[] = [];
  let busy = false;
  let announceTurns: number | null = null;
  let anchorScammerDoc: number | null = null;
  let announceSpokenScammerDoc: number | null = null;
  /** 예고 지시가 주입됐으므로 **이 턴 번호에** 예고 대사가 발화된다. */
  let speakAtTurn: number | null = null;

  const drain = () => {
    if (busy) return;
    const { item, rest } = takeNextInstruction(queue);
    if (!item) return;
    queue = rest;
    busy = true;
    if (input.recordAt === "dispatch") {
      announceTurns = announceTurnsOnInstructionDispatch({
        priority: item.priority,
        phase,
        completedScammerTurns: scammerTurns,
        current: announceTurns,
      });
    }
    if (item.priority === "verify" && phase === "announced") speakAtTurn = scammerTurns + 1;
  };

  const runEffect = () => {
    const completed = scammerTurns;
    const announceTurnComplete = announceTurns !== null && completed > announceTurns;
    const stage = nextVerifyOfferStage({ phase, announceTurnComplete });
    if (stage === null) return;
    if (
      stage === "announce" &&
      !shouldOfferVerify({
        trigger: { availableAfterScammerTurns: input.gate },
        scammerTurns: completed,
        alreadyRequested: phase !== "idle",
      })
    ) {
      return;
    }
    phase = stage === "announce" ? "announced" : "committed";
    if (stage === "announce") {
      if (input.recordAt === "request") announceTurns = completed;
      queue = enqueueInstruction(queue, { text: "예고 지시", priority: "verify" });
      drain();
    } else {
      // 서버의 `realtimeVerifyAnchor(scammerTurns)` = completed + 1 (1-기반 사기범 문서 순번).
      anchorScammerDoc = completed + 1;
    }
  };

  for (let turn = 1; turn <= (input.maxTurns ?? 10); turn += 1) {
    if (speakAtTurn === turn) announceSpokenScammerDoc = 1 + turn;
    scammerTurns = turn;
    busy = false;
    drain();
    if (input.smsCollision && turn === input.gate) {
      queue = enqueueInstruction(queue, { text: "문자 announce", priority: "sms" });
      drain();
    }
    runEffect();
  }
  return { anchorScammerDoc, announceSpokenScammerDoc };
}

test("[§45.7 V2] 큐 경합이 있으면 종전 배선은 앵커가 예고 대사보다 **한 턴 앞**이다(F2-a 재현)", () => {
  const before = simulateRealtimeOffer({ gate: 4, smsCollision: true, recordAt: "request" });
  assert.equal(before.announceSpokenScammerDoc, 7, "예고 대사는 7번째 사기범 문서다");
  assert.equal(before.anchorScammerDoc, 6, "⛔ 그런데 앵커는 6을 가리킨다 = 카드가 대사보다 앞");
});

test("[§45.7 V2] 같은 경합에서 현행 배선은 앵커가 **예고 대사 바로 그 자리**에 놓인다", () => {
  const after = simulateRealtimeOffer({ gate: 4, smsCollision: true, recordAt: "dispatch" });
  assert.equal(after.announceSpokenScammerDoc, 7);
  assert.equal(after.anchorScammerDoc, 7, "⭐ 앵커 == 예고 대사");
});

test("[§45.7 V2 / G251] ⛔ 경합이 없는 회차에서는 **종전 배선도 통과한다** — 그래서 1회 통과가 증거가 못 된다", () => {
  const before = simulateRealtimeOffer({ gate: 4, smsCollision: false, recordAt: "request" });
  const after = simulateRealtimeOffer({ gate: 4, smsCollision: false, recordAt: "dispatch" });
  assert.deepEqual(before, { anchorScammerDoc: 6, announceSpokenScammerDoc: 6 });
  assert.deepEqual(after, { anchorScammerDoc: 6, announceSpokenScammerDoc: 6 });
});

test("[§45.7 V2] 기록 판정표 — verify 지시가 announced 단계에서 큐를 떠날 때만 기록한다", () => {
  assert.equal(
    announceTurnsOnInstructionDispatch({
      priority: "verify",
      phase: "announced",
      completedScammerTurns: 5,
      current: null,
    }),
    5,
  );
  assert.equal(
    announceTurnsOnInstructionDispatch({
      priority: "sms",
      phase: "announced",
      completedScammerTurns: 5,
      current: null,
    }),
    null,
    "문자 지시가 큐를 떠난 것은 예고가 나간 것이 아니다",
  );
  assert.equal(
    announceTurnsOnInstructionDispatch({
      priority: "verify",
      phase: "committed",
      completedScammerTurns: 9,
      current: 4,
    }),
    4,
    "⛔ 재연결 지시도 같은 verify 우선순위로 큐를 탄다 — 기록을 덮어쓰면 안 된다",
  );
  assert.equal(
    announceTurnsOnInstructionDispatch({
      priority: "verify",
      phase: "idle",
      completedScammerTurns: 3,
      current: null,
    }),
    null,
  );
});

/**
 * ⭐⭐ **배선 게이트 — 순수 함수만으로는 V2를 지킬 수 없다.**
 *
 * 위 시뮬레이션은 *"이렇게 배선하면 옳다"* 를 보일 뿐, **page.tsx가 실제로 그렇게 배선돼 있는지**는
 * 보지 못한다. 그 배선은 브라우저 이벤트(턴 완료 콜백) 위에서만 관측되는 자리라 유닛으로 잡히지
 * 않는다 ⇒ **소스 스캔**으로 두 가지를 함께 고정한다: (a) 새 기록 지점이 있다, (b) **옛 기록
 * 지점이 없다**. (b)가 없으면 두 지점이 공존해도 게이트가 초록이다.
 */
const PLAY_PAGE_SRC = path.resolve(import.meta.dirname, "../../app/session/play/page.tsx");

test("[§45.7 V2 배선] 예고 시점은 큐 드레인에서 기록되고, 요청 발신 시점 기록은 **남아 있지 않다**", () => {
  const src = readFileSync(PLAY_PAGE_SRC, "utf8");
  assert.ok(
    /verifyAnnounceTurnsRef\.current\s*=\s*announceTurnsOnInstructionDispatch\(/.test(src),
    "드레인 시점 기록이 있어야 한다(§45.7 V2)",
  );
  assert.ok(
    src.includes("completedScammerTurns: scammerTurnsRef.current"),
    "⛔ state가 아니라 ref로 재야 한다 — 턴 완료 콜백 안에서는 state가 한 턴 낡았다",
  );
  assert.equal(
    /verifyAnnounceTurnsRef\.current\s*=\s*completedScammerTurns/.test(src),
    false,
    "⛔ 요청 발신 시점 기록(종전 배선)이 되살아나면 F2-a가 그대로 돌아온다 — §45.6 (3) F2-a c",
  );
});
