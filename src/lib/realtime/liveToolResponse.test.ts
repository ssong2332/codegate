import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildUnsupportedToolResponses,
  pickModelToolSmsId,
  resolveToolCallKind,
} from "./liveToolResponse.ts";

// §59.10 커밋 A — 도구가 아직 선언되지 않은 단계의 유일한 분기(G383/G386/G390).

test("functionCalls가 없으면 응답도 없다(빈 배열)", () => {
  assert.deepEqual(buildUnsupportedToolResponses(undefined), []);
  assert.deepEqual(buildUnsupportedToolResponses([]), []);
});

test("[G390] 들어온 functionCalls 전건에 반드시 응답이 생긴다(생략 0건)", () => {
  const responses = buildUnsupportedToolResponses([
    { id: "call-1", name: "send_prepared_sms" },
    { id: "call-2", name: "offer_verification_desk" },
  ]);
  assert.equal(responses.length, 2);
  assert.deepEqual(responses, [
    { id: "call-1", name: "send_prepared_sms", response: { status: "unsupported" } },
    { id: "call-2", name: "offer_verification_desk", response: { status: "unsupported" } },
  ]);
});

test("[G386] 응답에 한국어 문자열이 0건이다(모델 대면 콘텐츠는 서버가 소유 — 아직 없다)", () => {
  const responses = buildUnsupportedToolResponses([{ id: "call-1", name: "send_prepared_sms" }]);
  const serialized = JSON.stringify(responses);
  assert.ok(!/[가-힣]/.test(serialized), `응답에 한글이 섞여 있으면 안 된다: ${serialized}`);
});

test("name이 없는 functionCall도 응답을 생략하지 않는다(unknown으로 떨어진다)", () => {
  const responses = buildUnsupportedToolResponses([{ id: "call-3" }]);
  assert.deepEqual(responses, [{ id: "call-3", name: "unknown", response: { status: "unsupported" } }]);
});

test("id가 없어도 응답을 만든다(id는 그대로 undefined로 통과)", () => {
  const responses = buildUnsupportedToolResponses([{ name: "send_prepared_sms" }]);
  assert.deepEqual(responses, [
    { id: undefined, name: "send_prepared_sms", response: { status: "unsupported" } },
  ]);
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// §59.6 ②~③ — reviewer Critical #1(§59 커밋 C 리뷰) 라우팅 판정 함수.

const LIVE_TOOLS_BOTH = {
  sendPreparedSms: "send_prepared_sms",
  offerVerificationDesk: "offer_verification_desk",
  failureInstruction: "(지금은 문자를 보낼 수 없다. 문자를 보냈다고 말하지 말고 하던 이야기를 그대로 이어가라.)",
};

test("[G385] resolveToolCallKind — credentials.liveTools 값과 일치하는 이름만 라우팅한다(하드코딩 금지)", () => {
  assert.equal(resolveToolCallKind("send_prepared_sms", LIVE_TOOLS_BOTH), "send_prepared_sms");
  assert.equal(
    resolveToolCallKind("offer_verification_desk", LIVE_TOOLS_BOTH),
    "offer_verification_desk",
  );
});

test("resolveToolCallKind — liveTools 부재·name 부재·불일치는 모두 unsupported다", () => {
  assert.equal(resolveToolCallKind("send_prepared_sms", undefined), "unsupported");
  assert.equal(resolveToolCallKind(undefined, LIVE_TOOLS_BOTH), "unsupported");
  assert.equal(resolveToolCallKind("some_other_tool", LIVE_TOOLS_BOTH), "unsupported");
});

test("resolveToolCallKind — 도구 1개만 선언된 세션(sendPreparedSms만)은 나머지 이름을 unsupported로 떨어뜨린다", () => {
  const smsOnly = { sendPreparedSms: "send_prepared_sms", failureInstruction: "x" };
  assert.equal(resolveToolCallKind("send_prepared_sms", smsOnly), "send_prepared_sms");
  assert.equal(resolveToolCallKind("offer_verification_desk", smsOnly), "unsupported");
});

const TRIGGERS_TWO = [
  { smsId: "sms-a", afterScammerTurns: 3 },
  { smsId: "sms-b", afterScammerTurns: 5 },
];

test("[§59.6 ③] pickModelToolSmsId — 게이트 도달 전이어도 가장 이른 미도착 항목을 고른다(하한 재검증은 서버 몫)", () => {
  // scammerTurns가 아무리 낮아도(=아직 이르더라도) 후보에서 제외하지 않는다 — 이 함수는 턴 게이트를
  // 보지 않는다(§59.7 하한 재검증은 deliverInCallSms의 model_tool 경로가 진다).
  assert.equal(pickModelToolSmsId(TRIGGERS_TWO, []), "sms-a");
});

test("pickModelToolSmsId — 이미 도착한 항목은 건너뛰고 다음 항목을 고른다", () => {
  assert.equal(pickModelToolSmsId(TRIGGERS_TWO, ["sms-a"]), "sms-b");
});

test("pickModelToolSmsId — 전부 이미 도착했으면 카탈로그에서 가장 이른 항목을 다시 돌려준다(서버가 already_delivered로 응답 — none_pending과 동일 문면)", () => {
  assert.equal(pickModelToolSmsId(TRIGGERS_TWO, ["sms-a", "sms-b"]), "sms-a");
});

test("pickModelToolSmsId — 카탈로그 자체가 비어 있으면 null이다(도구 선언 조건상 오늘 도달 불가, 방어값)", () => {
  assert.equal(pickModelToolSmsId([], []), null);
});
