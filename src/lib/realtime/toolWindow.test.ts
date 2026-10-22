// §59.10 커밋 D — 천장(백스톱) 순수 판정 회귀(§59.9 R6 · G388 · G390).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOOL_WINDOW_MAX_BOUNDARIES,
  TOOL_WINDOW_STALL_SEC,
  shouldFireBackstop,
  shouldRequestSmsBackstop,
  scammerClaimsSmsSent,
} from "./toolWindow.ts";
import { readFileSync } from "node:fs";

test("[상수] 판단값이 architect 원문과 같다(§59.8)", () => {
  assert.equal(TOOL_WINDOW_MAX_BOUNDARIES, 2);
  assert.equal(TOOL_WINDOW_STALL_SEC, 90);
});

// (b) 상한 전에는 발동하지 않는다 — 도구가 있고, 실패하지 않았고, 경계·초 둘 다 상한 미만.
test("[(b) 상한 전 미발동] toolAvailable && 경계 0/실패 없음 ⇒ false", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: 0,
      secondsSinceLastBoundary: 0,
      toolCallFailed: false,
    }),
    false,
  );
});

test("[(b) 상한 전 미발동] 경계 1(< 2)·초 89(< 90) ⇒ false", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: TOOL_WINDOW_MAX_BOUNDARIES - 1,
      secondsSinceLastBoundary: TOOL_WINDOW_STALL_SEC - 1,
      toolCallFailed: false,
    }),
    false,
  );
});

// (a) 하한 이후 상한(경계) 초과 시 강제 발동.
test("[(a) 상한(경계) 도달] boundariesSinceDue === TOOL_WINDOW_MAX_BOUNDARIES ⇒ true", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: TOOL_WINDOW_MAX_BOUNDARIES,
      secondsSinceLastBoundary: 0,
      toolCallFailed: false,
    }),
    true,
  );
});

test("[(a) 상한(경계) 초과] boundariesSinceDue > TOOL_WINDOW_MAX_BOUNDARIES ⇒ true", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: TOOL_WINDOW_MAX_BOUNDARIES + 5,
      secondsSinceLastBoundary: 0,
      toolCallFailed: false,
    }),
    true,
  );
});

// (a) 하한 이후 상한(시간) 초과 시 강제 발동.
test("[(a) 상한(시간) 도달] secondsSinceLastBoundary === TOOL_WINDOW_STALL_SEC ⇒ true", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: 0,
      secondsSinceLastBoundary: TOOL_WINDOW_STALL_SEC,
      toolCallFailed: false,
    }),
    true,
  );
});

test("[(a) 상한(시간) 초과] secondsSinceLastBoundary > TOOL_WINDOW_STALL_SEC ⇒ true", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: 0,
      secondsSinceLastBoundary: TOOL_WINDOW_STALL_SEC + 30,
      toolCallFailed: false,
    }),
    true,
  );
});

// (c) 도구 미선언 ⇒ 지연 0(즉시) — G388 회귀 0의 유일한 레버. 다른 값이 전부 "닫힌 창"이어도 true.
test("[(c)/G388] toolAvailable=false ⇒ 다른 값과 무관하게 항상 즉시(true)", () => {
  const combos = [
    { boundariesSinceDue: 0, secondsSinceLastBoundary: 0, toolCallFailed: false },
    { boundariesSinceDue: 0, secondsSinceLastBoundary: 0, toolCallFailed: true },
    { boundariesSinceDue: 99, secondsSinceLastBoundary: 999, toolCallFailed: false },
  ];
  for (const combo of combos) {
    assert.equal(
      shouldFireBackstop({ toolAvailable: false, ...combo }),
      true,
      `toolAvailable=false, ${JSON.stringify(combo)}에서도 즉시 발동해야 한다`,
    );
  }
});

// G390 — 도구 경로 실패는 창을 즉시 닫는다(경계·초가 전부 0이어도).
test("[G390] toolCallFailed=true ⇒ 경계·초가 0이어도 즉시 발동", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: 0,
      secondsSinceLastBoundary: 0,
      toolCallFailed: true,
    }),
    true,
  );
});

// (d)의 전제 — "모델이 정상 처리"는 이 함수 바깥(호출부가 아예 이 함수를 부르지 않게 되는 것,
// pickDueInCallSms류의 "이미 처리됨" 필터)에서 보장된다. 이 순수 함수 자신은 입력이 "아직 처리
// 안 됨 + 창 안"이면 항상 false를 내야 그 보장이 성립한다 — 위 (b) 테스트가 그 조건을 고정한다.
test("[경계값] 경계·초 모두 상한 바로 아래 + 도구 있음 + 실패 없음 ⇒ false(마지막 안전 여유)", () => {
  assert.equal(
    shouldFireBackstop({
      toolAvailable: true,
      boundariesSinceDue: TOOL_WINDOW_MAX_BOUNDARIES - 1,
      secondsSinceLastBoundary: TOOL_WINDOW_STALL_SEC - 1,
      toolCallFailed: false,
    }),
    false,
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// ⭐ T191 문자 도달 조건 — 화면의 문자 백스톱 질의 규칙(`shouldRequestSmsBackstop`). 무엇을 넛지/발송할지는 서버
// (`functions/src/inCallSms/__tests__/smsGate.test.ts`)가 고정한다. 여기서는 "사용자 발화 1회당 최대 1회 묻는다"만.
const smsBase = { enabled: true, userTurns: 3, lastRequestedUserTurns: 2, nonePending: false, inFlight: false };

test("[T191 백스톱 질의] 새 사용자 발화면 묻는다", () => {
  assert.equal(shouldRequestSmsBackstop(smsBase), true);
  assert.equal(shouldRequestSmsBackstop({ ...smsBase, userTurns: 0, lastRequestedUserTurns: -1 }), true, "통화 시작 직후 1회");
});

test("[T191 백스톱 질의] 같은 발화 수로는 다시 묻지 않는다(서버 넛지가 '정확히 그 발화'에서 1회가 되는 근거)", () => {
  assert.equal(shouldRequestSmsBackstop({ ...smsBase, lastRequestedUserTurns: 3 }), false);
});

test("[T191 백스톱 질의] 문자 선언 없음 · none_pending · 진행 중이면 묻지 않는다", () => {
  assert.equal(shouldRequestSmsBackstop({ ...smsBase, enabled: false }), false);
  assert.equal(shouldRequestSmsBackstop({ ...smsBase, nonePending: true }), false);
  assert.equal(shouldRequestSmsBackstop({ ...smsBase, inFlight: true }), false);
});

test("[T191 백스톱 질의 역검증] 발화 수 비교를 지운 오염본은 같은 발화에 두 번 묻는다 — 정본은 한 번", () => {
  const poisoned = (i: typeof smsBase) => i.enabled && !i.nonePending && !i.inFlight; // 오염: 발화 수 비교 삭제
  const sameTurn = { ...smsBase, lastRequestedUserTurns: 3 };
  assert.deepEqual(
    { poisoned: poisoned(sameTurn), canonical: shouldRequestSmsBackstop(sameTurn) },
    { poisoned: true, canonical: false },
  );
});

// ── §104 — 사기범 "문자 보냈다" 주장(사용자 실기 신고 "문자를 보냈다고 하는데, 실제로는 안 와 있는") ─────────────────────────
test("[§104 문자 주장] 보냈다는 말은 잡고 · 보내겠다는 말 · 일반 언급은 잡지 않는다", () => {
  for (const t of [
    "문자로 보내드린 사건 조회 링크를 통해 확인하세요.",
    "방금 문자 보내 드렸습니다.",
    "보내 드린 링크 누르시고 본인 확인부터 하시면 됩니다.",
    "자산 검수 안내 문자 발송했습니다.",
    "보낸 문자 확인해 보세요.",
  ]) {
    assert.equal(scammerClaimsSmsSent(t), true, t);
  }
  for (const t of ["지금 문자로 보내 드리겠습니다.", "문자 오면 말씀해 주세요.", "곧 안내 문자가 갈 겁니다.", "계좌로 보내 주세요."]) {
    assert.equal(scammerClaimsSmsSent(t), false, t);
  }
});

test("[§104 문자 주장 배선] 화면 — 사기범 전사에서 주장을 표시하고 다음 백스톱 질의에 싣는다 · 도착 · none_pending이면 내린다", () => {
  const page = readFileSync("src/app/session/play/page.tsx", "utf8").replace(/\r\n/g, "\n");
  // §108 — 블록 형태로 바뀌었다(주장 표시 + 즉시 질의 깨우기).
  assert.match(page, /if \(role === "scammer" && scammerClaimsSmsSent\(text\)\) \{\n\s+smsClaimPendingRef\.current = true;/);
  assert.ok(page.includes("...(smsClaimPendingRef.current ? { smsClaimed: true } : {}),"));
  assert.ok(page.includes('if (result.status === "delivered" || result.status === "none_pending") smsClaimPendingRef.current = false;'));
  const types = readFileSync("src/lib/api/types.ts", "utf8");
  const serverTypes = readFileSync("functions/src/inCallSms/types.ts", "utf8");
  assert.ok(types.includes("smsClaimed?: boolean;") && serverTypes.includes("smsClaimed?: boolean;"), "요청 키가 클라 · 서버 타입에 같다");
});

// ── §108 — 주장이 생긴 사기범 턴에 바로 묻는다(실기 신고 "문자 발송이 여전히 느리게 온다") ─────────────────────────
test("[§108 주장 즉시 질의] 같은 발화 수로 이미 물었어도 주장이 새로 생기면 한 번 더 묻는다 · 주장당 1회", () => {
  const asked = { ...smsBase, lastRequestedUserTurns: 3 };
  assert.equal(shouldRequestSmsBackstop(asked), false, "주장 없음 — 종전");
  assert.equal(shouldRequestSmsBackstop({ ...asked, claimPending: true, lastClaimRequestedUserTurns: 2 }), true);
  assert.equal(shouldRequestSmsBackstop({ ...asked, claimPending: true, lastClaimRequestedUserTurns: 3 }), false, "주장당 1회");
  assert.equal(shouldRequestSmsBackstop({ ...asked, claimPending: true }), true, "부재 = -1");
});

test("[§108 주장 즉시 질의] 문자 선언 없음 · none_pending · 진행 중이면 주장이 있어도 묻지 않는다", () => {
  const claim = { ...smsBase, lastRequestedUserTurns: 3, claimPending: true, lastClaimRequestedUserTurns: -1 };
  assert.equal(shouldRequestSmsBackstop({ ...claim, enabled: false }), false);
  assert.equal(shouldRequestSmsBackstop({ ...claim, nonePending: true }), false);
  assert.equal(shouldRequestSmsBackstop({ ...claim, inFlight: true }), false);
});

test("[§108 배선] 통화 화면 — 사기범 주장 턴에서 깨우기 값이 오르고, 백스톱 effect가 그 값에 의존한다", () => {
  const page = readFileSync("src/app/session/play/page.tsx", "utf8").replace(/\r\n/g, "\n");
  const claimAt = page.indexOf("if (role === \"scammer\" && scammerClaimsSmsSent(text)) {");
  assert.ok(claimAt > 0);
  assert.ok(page.slice(claimAt, claimAt + 300).includes("setSmsClaimTick((n) => n + 1);"));
  assert.ok(page.includes("claimPending: smsClaimPendingRef.current,"));
  assert.ok(page.includes("if (smsClaimPendingRef.current) state.lastClaimRequestedUserTurns = userTurnCount;"));
  assert.match(page, /userTurnCount,\n\s+smsClaimTick,\n\s+realtime\.credentials\?\.inCallSmsBackstop,/);
});
