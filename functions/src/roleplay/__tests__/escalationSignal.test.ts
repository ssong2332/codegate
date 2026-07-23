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
