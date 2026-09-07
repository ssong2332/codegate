import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAlreadyAnnouncedToolResponse,
  buildUnsupportedToolResponses,
  collectToolResponses,
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

// ══════════════════════════════════════════════════════════════════════════════════════════
// §59.6 갱신 2(G394) — buildAlreadyAnnouncedToolResponse(클레임 실패 조기 응답, guidance 필수).

const VERIFY_ALREADY_TEXT =
  "(그 안내는 이미 전달했다. 새로 안내하지 말고, 연결해 드리겠다는 말도 다시 하지 말고, 지금 하던 이야기를 그대로 이어가라.)";

test("[G394] buildAlreadyAnnouncedToolResponse — liveTools에 필드가 있으면 guidance를 정확히 그 값으로 채운다", () => {
  const liveTools = {
    offerVerificationDesk: "offer_verification_desk",
    verifyAlreadyAnnouncedInstruction: VERIFY_ALREADY_TEXT,
    failureInstruction: "(지금은 문자를 보낼 수 없다. 문자를 보냈다고 말하지 말고 하던 이야기를 그대로 이어가라.)",
  };
  const response = buildAlreadyAnnouncedToolResponse(
    { id: "call-1", name: "offer_verification_desk" },
    liveTools,
  );
  assert.deepEqual(response, {
    id: "call-1",
    name: "offer_verification_desk",
    response: { status: "already_announced", guidance: VERIFY_ALREADY_TEXT },
  });
});

test("[G394] buildAlreadyAnnouncedToolResponse — 필드가 없으면(구조적 도달 불가) unsupported로 안전하게 폴백한다", () => {
  const liveTools = {
    offerVerificationDesk: "offer_verification_desk",
    failureInstruction: "(지금은 문자를 보낼 수 없다. 문자를 보냈다고 말하지 말고 하던 이야기를 그대로 이어가라.)",
  };
  assert.deepEqual(
    buildAlreadyAnnouncedToolResponse({ id: "call-1", name: "offer_verification_desk" }, liveTools),
    buildUnsupportedToolResponses([{ id: "call-1", name: "offer_verification_desk" }])[0],
  );
  // liveTools 자체가 undefined인 경우도 같은 폴백이어야 한다(방어값).
  assert.deepEqual(
    buildAlreadyAnnouncedToolResponse({ id: "call-2", name: "offer_verification_desk" }, undefined),
    buildUnsupportedToolResponses([{ id: "call-2", name: "offer_verification_desk" }])[0],
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// §59 reviewer APPROVED Major #1 — collectToolResponses(구조적 폴백, G390).

test("[G390 구조 보장] dispatch가 reject해도 throw하지 않고 unsupported 폴백으로 떨어진다", async () => {
  const calls = [
    { id: "call-1", name: "send_prepared_sms" },
    { id: "call-2", name: "offer_verification_desk" },
  ];
  // dispatchToolCall(또는 그 안의 순수 헬퍼, 예: resolveToolCallKind)이 나중에 수정되며 throw하는
  // 경로가 생긴 상황을 강제로 재현한다 — reviewer가 지적한 정확한 시나리오다.
  const throwingDispatch = async (): Promise<never> => {
    throw new Error("resolveToolCallKind가 나중에 던지게 바뀌었다고 가정");
  };

  const responses = await collectToolResponses(calls, throwingDispatch);

  assert.deepEqual(
    responses,
    buildUnsupportedToolResponses(calls),
    "폴백은 전체 calls를 unsupported로 안전하게 떨어뜨린 것과 동일해야 한다",
  );
  assert.equal(responses.length, 2, "생략 없이 들어온 calls 전건에 응답이 있어야 한다(G390)");
});

test("[G390 구조 보장] calls 중 일부만 reject해도(Promise.all 전체 실패) 폴백으로 떨어진다", async () => {
  const calls = [{ id: "call-1", name: "send_prepared_sms" }, { id: "call-2", name: "unknown_tool" }];
  let seen = 0;
  const partiallyThrowingDispatch = async (call: { id?: string; name?: string }) => {
    seen += 1;
    if (call.id === "call-2") throw new Error("두 번째 콜러블만 던진다");
    return { id: call.id, name: call.name ?? "unknown", response: { status: "delivered" } };
  };

  const responses = await collectToolResponses(calls, partiallyThrowingDispatch);

  // Promise.all은 하나라도 reject하면 전체가 reject된다 — 첫 번째 호출의 성공 결과까지 버려지고
  // calls 전건이 안전한 unsupported 폴백으로 대체된다(부분 성공을 흉내내지 않는다, 단순하고 예측
  // 가능한 구조를 유지).
  assert.deepEqual(responses, buildUnsupportedToolResponses(calls));
  assert.ok(seen > 0, "실제로 dispatch가 호출됐어야 한다(테스트가 공회전하지 않았다는 증거)");
});

test("[회귀 0] dispatch가 정상 동작하면 폴백을 거치지 않고 실제 응답을 그대로 돌려준다", async () => {
  const calls = [{ id: "call-1", name: "send_prepared_sms" }];
  const okDispatch = async (call: { id?: string; name?: string }) => ({
    id: call.id,
    name: call.name ?? "unknown",
    response: { status: "delivered", guidance: "안내 문구" },
  });

  const responses = await collectToolResponses(calls, okDispatch);

  assert.deepEqual(responses, [
    { id: "call-1", name: "send_prepared_sms", response: { status: "delivered", guidance: "안내 문구" } },
  ]);
});

test("collectToolResponses — calls가 빈 배열이면 dispatch를 부르지 않고 빈 배열을 돌려준다", async () => {
  let called = false;
  const responses = await collectToolResponses([], async () => {
    called = true;
    return { id: undefined, name: "unknown", response: { status: "unsupported" } };
  });
  assert.deepEqual(responses, []);
  assert.equal(called, false);
});

// --- 배선(소스 수준, fallbackCredentials.test.ts와 같은 관례) ---
// GeminiVoiceSession.tsx는 브라우저 API(AudioContext·getUserMedia·GoogleGenAI)에 강하게 결합돼
// 있어 node:test로 onmessage 클로저를 직접 실행할 수 없다([[feedback_unobservable_behavior_gates]]
// 관례) — 실제 구조적 보장(위 collectToolResponses 단위 테스트)이 **호출 지점에 실제로 배선돼
// 있는지**만 소스 스캔으로 고정한다.

const geminiSession = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8");

function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

/** toolCall 분기 안에서 sendToolResponse 호출보다 앞서 collectToolResponses를 실제로 부르는가. */
function callsCollectBeforeSend(source: string): boolean {
  const code = codeOnly(source);
  const collectAt = code.indexOf("await collectToolResponses(calls, dispatchToolCall)");
  const sendAt = code.indexOf("session.sendToolResponse({ functionResponses: responses })");
  return collectAt >= 0 && sendAt >= 0 && collectAt < sendAt;
}

test("[G390 배선] GeminiVoiceSession.tsx가 collectToolResponses를 sendToolResponse보다 먼저 실제로 부른다", () => {
  assert.equal(callsCollectBeforeSend(geminiSession), true);
});

test("[G390 배선 역검증] collectToolResponses 호출을 지운 오염본은 같은 검사식이 잡아낸다", () => {
  const poisoned = geminiSession.replace(
    "await collectToolResponses(calls, dispatchToolCall)",
    "await Promise.all(calls.map((call) => dispatchToolCall(call)))",
  );
  assert.equal(
    callsCollectBeforeSend(poisoned),
    false,
    "옛 무방비 Promise.all로 되돌리면 게이트가 잡아내야 한다",
  );
  assert.equal(callsCollectBeforeSend(geminiSession), true, "정본은 같은 검사식을 통과한다");
});
