import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAlreadyAnnouncedToolResponse,
  buildUnsupportedToolResponses,
  collectToolResponses,
  endCallBatchHasOtherCalls,
  readEndCallReasonArg,
  readSmsPurposeArg,
  resolveToolCallKind,
} from "./liveToolResponse.ts";
import { INITIAL_CLIENT_TURN_QUEUE_STATE, stepClientTurnQueue } from "./clientTurnQueue.ts";

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

// ⭐ T191(문자 도달 조건 · G538) — 예전 `pickModelToolSmsId`(화면이 카탈로그 순서로 smsId를 고름) 테스트 4건은 함수
// 폐기와 함께 지웠다. 화면은 모델이 고른 `purpose` 원값을 꺼내 넘기기만 하고 검증은 서버가 한다.
test("[G538] readSmsPurposeArg — args.purpose 문자열을 그대로 꺼낸다(enum 검증은 서버 몫이라 enum 밖 값도 그대로)", () => {
  assert.equal(readSmsPurposeArg({ purpose: "transfer" }), "transfer");
  assert.equal(readSmsPurposeArg({ purpose: "anything" }), "anything");
});

test("readSmsPurposeArg — args 부재 · 객체 아님 · purpose 비문자열이면 undefined(서버가 not_allowed로 거부)", () => {
  assert.equal(readSmsPurposeArg(undefined), undefined);
  assert.equal(readSmsPurposeArg(null), undefined);
  assert.equal(readSmsPurposeArg("transfer"), undefined);
  assert.equal(readSmsPurposeArg({}), undefined);
  assert.equal(readSmsPurposeArg({ purpose: 3 }), undefined);
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
  // T192 C5(G555) — dispatch가 같은 배치를 함께 받는다(배치 항). 호출 형태만 바뀌었고 순서 단언은 그대로다.
  const collectAt = code.indexOf("await collectToolResponses(calls, (call) => dispatchToolCall(call, calls))");
  const sendAt = code.indexOf("session.sendToolResponse({ functionResponses: responses })");
  return collectAt >= 0 && sendAt >= 0 && collectAt < sendAt;
}

test("[G390 배선] GeminiVoiceSession.tsx가 collectToolResponses를 sendToolResponse보다 먼저 실제로 부른다", () => {
  assert.equal(callsCollectBeforeSend(geminiSession), true);
});

test("[G390 배선 역검증] collectToolResponses 호출을 지운 오염본은 같은 검사식이 잡아낸다", () => {
  const poisoned = geminiSession.replace(
    "await collectToolResponses(calls, (call) => dispatchToolCall(call, calls))",
    "await Promise.all(calls.map((call) => dispatchToolCall(call, calls)))",
  );
  assert.equal(
    callsCollectBeforeSend(poisoned),
    false,
    "옛 무방비 Promise.all로 되돌리면 게이트가 잡아내야 한다",
  );
  assert.equal(callsCollectBeforeSend(geminiSession), true, "정본은 같은 검사식을 통과한다");
});

// ── T192 C5 — 실시간 `end_call` 라우팅(Architecture.md §79.8 R1 · R3 · §79.19 (3) · G504 · G555) ─────────────────────
const LIVE_TOOLS_WITH_END_CALL = {
  ...LIVE_TOOLS_BOTH,
  endCall: "end_call",
  endCallFailureInstruction: "(지금은 통화를 끝낼 수 없다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)",
};

test("[§79.8 R1 · G385] resolveToolCallKind — liveTools.endCall과 일치할 때만 end_call · 미선언 세션은 unsupported", () => {
  assert.equal(resolveToolCallKind("end_call", LIVE_TOOLS_WITH_END_CALL), "end_call");
  assert.equal(resolveToolCallKind("end_call", LIVE_TOOLS_BOTH), "unsupported", "선언되지 않은 세션에서 라우팅했다");
  assert.equal(resolveToolCallKind("send_prepared_sms", LIVE_TOOLS_WITH_END_CALL), "send_prepared_sms", "기존 라우팅 회귀");
});

test("[G555 ⓑ] endCallBatchHasOtherCalls 진리표 — 단독 거짓 · 다른 도구 동반 참 · end_call 2개 거짓 · 이름 없음 참", () => {
  const rows: ReadonlyArray<readonly [string, { id?: string; name?: string }[], boolean]> = [
    ["단독 end_call", [{ id: "a", name: "end_call" }], false],
    ["send_prepared_sms 동반", [{ id: "a", name: "end_call" }, { id: "b", name: "send_prepared_sms" }], true],
    ["offer_verification_desk 동반", [{ id: "b", name: "offer_verification_desk" }, { id: "a", name: "end_call" }], true],
    ["end_call 2개", [{ id: "a", name: "end_call" }, { id: "b", name: "end_call" }], false],
    ["이름 없는 호출 동반(무엇인지 모르면 막는다)", [{ id: "a", name: "end_call" }, { id: "b" }], true],
  ];
  for (const [label, calls, expected] of rows) {
    assert.equal(endCallBatchHasOtherCalls(calls, LIVE_TOOLS_WITH_END_CALL), expected, label);
  }
  // liveTools에 endCall이 없으면 무엇이든 "다른 호출"이다(라우팅도 unsupported라 도달하지 않는다 — 막는 쪽).
  assert.equal(endCallBatchHasOtherCalls([{ name: "end_call" }], LIVE_TOOLS_BOTH), true);
});

test("[G555 ⓒ 역검증] 큐의 toolPending을 OR한 사본은 단독 end_call에서도 참이 된다(= 끊기 0) — 같은 출력에", (t) => {
  // `toolCall` 이벤트가 오면 큐는 분기 **전에** toolPending=true가 된다(`GeminiVoiceSession`: dispatchClientTurn("toolCall") → collect).
  const afterToolCall = stepClientTurnQueue(INITIAL_CLIENT_TURN_QUEUE_STATE, { type: "toolCall", nowMs: 0 }).state;
  const batch = [{ id: "a", name: "end_call" }];
  const parentPending = false; // 지시 큐 비어 있음 · busy 아님 · 교대 아님
  const correct = parentPending || endCallBatchHasOtherCalls(batch, LIVE_TOOLS_WITH_END_CALL);
  const poisoned = parentPending || afterToolCall.toolPending || endCallBatchHasOtherCalls(batch, LIVE_TOOLS_WITH_END_CALL);
  t.diagnostic(`[G555] 단독 end_call — 정본 pending=${correct} · toolPending OR 사본 pending=${poisoned}`);
  assert.equal(afterToolCall.toolPending, true, "전제 — toolCall 직후 큐는 도구 대기다");
  assert.equal(correct, false, "정본은 단독 end_call을 막지 않는다");
  assert.equal(poisoned, true, "toolPending을 OR하면 자기 자신 때문에 항상 막힌다(자기참조 결함)");
});

/** `if (kind === "end_call") {` 분기 본문(다음 `if (kind === "send_prepared_sms")` 앞까지 · 주석 제외). */
function endCallBranch(source: string): string {
  const code = codeOnly(source);
  const start = code.indexOf('if (kind === "end_call") {');
  assert.ok(start >= 0, "end_call 분기를 찾지 못했다");
  return code.slice(start, code.indexOf('if (kind === "send_prepared_sms") {', start));
}

test("[G555 ⓐ · G552 ⓒ · R1] end_call 분기 — 클라 항 = 부모 getter ∨ 배치 항 · toolPending 0 · 사용자 발화는 claimedUserTurns() 하나", () => {
  const branch = endCallBranch(geminiSession);
  assert.match(branch, /handlersRef\.current\.getPendingInstruction\(\) \|\| endCallBatchHasOtherCalls\(batch, liveTools\)/);
  assert.equal(branch.includes("toolPending"), false, "end_call 분기가 큐의 toolPending을 읽는다(G555 ⓐ)");
  assert.match(branch, /userTurns: claimedUserTurns\(\),/);
  assert.match(branch, /kind: readEndCallReasonArg\(call\.args\),/);
  assert.ok(branch.includes("requestScammerHangup({"), "서버 판정 콜러블을 부르지 않는다");
  // 컴포넌트 전체에서도 지역 사용자 발화 사본 · 지역 승인 래치가 없다(G528 ⓐ ⓑ).
  const code = codeOnly(geminiSession);
  assert.equal(/let \w*UserTurns\b/.test(code), false, "지역 사용자 발화 카운터가 되살아났다(G528 ⓐ)");
  assert.equal(/\bhangupPending\b/.test(code), false, "컴포넌트 지역 승인 래치가 있다(G528 ⓑ — 래치는 부모 callEnding.ts)");
});

test("[G555 ⓐ 역검증] end_call 분기에 toolPending을 넣은 사본은 같은 검사식이 잡는다", () => {
  const poisoned = geminiSession.replace(
    "handlersRef.current.getPendingInstruction() || endCallBatchHasOtherCalls(batch, liveTools)",
    "handlersRef.current.getPendingInstruction() || clientTurnState.toolPending || endCallBatchHasOtherCalls(batch, liveTools)",
  );
  assert.notEqual(poisoned, geminiSession, "주입 앵커가 없다");
  assert.equal(endCallBranch(poisoned).includes("toolPending"), true);
});

test("[G504 · R3 · G386] end_call — 승인이면 응답 전에 부모 래치 · 콜러블 throw = endCallFailureInstruction(문면 저작 0) · 응답 생략 0", () => {
  const branch = endCallBranch(geminiSession);
  const acceptedAt = branch.indexOf('result.status === "accepted" || result.status === "already_accepted"');
  // §142 — 다통화 변형은 통화 끝(`legEnd`)을 같은 래치 호출로 넘긴다(부재 = 종전).
  const latchAt = branch.indexOf("handlersRef.current.onScammerHangupAccepted(result.legEnd);");
  const returnAt = branch.indexOf("response: { status: result.status, guidance: result.guidance }");
  assert.ok(acceptedAt >= 0 && latchAt > acceptedAt && returnAt > latchAt, "래치가 응답 반환(= sendToolResponse) 앞이 아니다(R2)");
  assert.match(branch, /guidance: liveTools\.endCallFailureInstruction \?\? liveTools\.failureInstruction,/);
  assert.equal(/["'`][^"'`]*[가-힣][^"'`]*["'`]/.test(branch), false, "end_call 분기에 한국어 리터럴이 있다(G386)");
});

test("[R1] readEndCallReasonArg — 문자열만 넘기고 판정 · 정규화는 서버", () => {
  assert.equal(readEndCallReasonArg({ reason: "goal" }), "goal");
  assert.equal(readEndCallReasonArg({ reason: "아무거나" }), "아무거나");
  for (const bad of [undefined, null, "goal", { reason: 1 }, {}]) assert.equal(readEndCallReasonArg(bad), undefined);
});
