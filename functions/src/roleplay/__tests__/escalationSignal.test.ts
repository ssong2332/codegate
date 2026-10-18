import { test } from "node:test";
import assert from "node:assert/strict";
import { extractEscalationSignal } from "../escalationSignal";

test("마커가 없으면 원문을 그대로 반환하고 escalate:false다", () => {
  const result = extractEscalationSignal("엄마, 나야. 지금 좀 도와줘.");
  assert.equal(result.text, "엄마, 나야. 지금 좀 도와줘.");
  assert.equal(result.escalate, false);
});

test("[[SIGNAL:ESCALATE_VOICE]]가 있으면 텍스트에서 제거되고 escalate:true다", () => {
  const result = extractEscalationSignal("그럼 내가 지금 전화할게 [[SIGNAL:ESCALATE_VOICE]].");
  assert.equal(result.text, "그럼 내가 지금 전화할게.");
  assert.equal(result.escalate, true);
  assert.ok(!result.text.includes("SIGNAL"), "사용자에게 마커 원문이 노출되면 안 된다");
});

test("ESCALATE_VOICE가 아닌 다른 SIGNAL 값은 제거만 되고 escalate:false다", () => {
  const result = extractEscalationSignal("잠깐만요 [[SIGNAL:UNKNOWN_TAG]] 확인 중입니다.");
  assert.equal(result.text, "잠깐만요 확인 중입니다.");
  assert.equal(result.escalate, false);
});

test("여러 마커가 섞여 있어도 하나라도 ESCALATE_VOICE면 escalate:true다", () => {
  const result = extractEscalationSignal(
    "[[SIGNAL:UNKNOWN_TAG]] 그럼 전화할게요 [[SIGNAL:ESCALATE_VOICE]]",
  );
  assert.equal(result.escalate, true);
  assert.ok(!result.text.includes("[["));
});

test("문장 끝 구두점 앞 공백을 정리한다(linkMarker.ts와 동일한 정리 규칙)", () => {
  const result = extractEscalationSignal("확인해 주세요 [[SIGNAL:ESCALATE_VOICE]].");
  assert.equal(result.text, "확인해 주세요.");
});

// ── T192 C3(Architecture.md §79.6 ② · §79.19 (5) 10 · C3-6) — 끊기 신호 판별 · 정규식 · 정리 무변경 ──
test("[T192/C3] END_CALL_GOAL · END_CALL_GIVEUP은 텍스트에서 지워지고 endCall로 판별된다 · ESCALATE와 독립", () => {
  const goal = extractEscalationSignal("확인됐습니다. 그럼 이만 끊겠습니다 [[SIGNAL:END_CALL_GOAL]]");
  assert.deepEqual(goal, { text: "확인됐습니다. 그럼 이만 끊겠습니다", escalate: false, endCall: "goal" });
  const giveUp = extractEscalationSignal("알겠습니다 [[SIGNAL:END_CALL_GIVEUP]].");
  assert.deepEqual(giveUp, { text: "알겠습니다.", escalate: false, endCall: "give_up" });
  // 여러 개면 처음 나온 것(둘 다 텍스트에서는 지워진다).
  const both = extractEscalationSignal("[[SIGNAL:END_CALL_GIVEUP]] 음 [[SIGNAL:END_CALL_GOAL]]");
  assert.equal(both.endCall, "give_up");
  assert.ok(!both.text.includes("[["));
  // 기존 신호는 endCall 키를 만들지 않는다(종전 반환과 같은 모양).
  assert.deepEqual(extractEscalationSignal("전화할게 [[SIGNAL:ESCALATE_VOICE]]"), { text: "전화할게", escalate: true });
  assert.deepEqual(extractEscalationSignal("마커 없음"), { text: "마커 없음", escalate: false });
});

test("[T192/C3] 정규식은 정확 일치 그대로 — 소문자 · 공백 · 전각 흉내는 신호가 아니다(escapeSentinelLookalikes와 같은 폭)", () => {
  for (const text of ["[[signal:END_CALL_GOAL]]", "[[SIGNAL: END_CALL_GOAL]]", "［［SIGNAL：END_CALL_GOAL]]", "[[SIGNAL:END_CALL_goal]]"]) {
    assert.equal(extractEscalationSignal(text).endCall, undefined, text);
  }
});
