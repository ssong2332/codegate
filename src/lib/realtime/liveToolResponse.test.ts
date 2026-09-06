import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUnsupportedToolResponses } from "./liveToolResponse.ts";

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
