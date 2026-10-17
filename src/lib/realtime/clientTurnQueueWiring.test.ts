// §71.5(G431) — 보류 큐 배선 회귀(소스 스캔). `GeminiVoiceSession.tsx`는 마이크 · AudioContext · WebSocket에
// 강결합돼 이 러너로 실행할 수 없다(`toolWindowWiring.test.ts`와 같은 관례). 이 파일은 "turnComplete:true
// 전송이 큐 밖에서 새지 않는다"는 구조만 고정한다 — 큐의 전이 자체는 `clientTurnQueue.test.ts`가 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const session = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8");
const code = session
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");

test("[§71.5 G431] turnComplete: true 전송은 sendClientTurn 한 곳뿐이다", () => {
  const occurrences = code.split("turnComplete: true").length - 1;
  assert.equal(occurrences, 1, `실측 ${occurrences}곳 — 큐를 우회하는 직접 전송이 생겼다`);
  const sendFn = code.slice(code.indexOf("const sendClientTurn = "), code.indexOf("const dispatchClientTurn = "));
  assert.ok(sendFn.includes("sendClientContent({ turns: turn.text, turnComplete: true })"));
});

test("[§71.5 G431] 타이핑 · 지시 effect는 세션에 직접 보내지 않고 큐에 넣는다", () => {
  assert.ok(code.includes('requestClientTurnRef.current?.({ kind: "text", text: textMessage.text })'));
  assert.ok(code.includes('requestClientTurnRef.current?.({ kind: "instruction", text: instructionTurn.text })'));
});

test("[§71.5] 오프닝 트리거도 큐로 보낸다", () => {
  assert.ok(/turn: \{ kind: "opening", text: OPENING_TRIGGER_TURN \}/.test(code));
});

test("[§71.5] 큐에 모델 이벤트 6종(오디오 · turnComplete · interrupted · stall · 도구 호출 · 도구 응답)이 모두 들어간다", () => {
  for (const type of ["modelAudio", "turnComplete", "interrupted", "stall", "toolCall", "toolResponseSent"]) {
    assert.ok(code.includes(`dispatchClientTurn({ type: "${type}"`), `${type} 배선이 없다`);
  }
});

test("[§71.5 · §57.4 D3] 타이핑 전사는 실제 전송 시점(sendClientTurn)에서만 적립된다", () => {
  const sendFn = code.slice(code.indexOf("const sendClientTurn = "), code.indexOf("const dispatchClientTurn = "));
  assert.ok(sendFn.includes('if (turn.kind === "text") appendUserBuffer(turn.text.trim());'));
  const textEffect = code.slice(code.indexOf("if (!textMessage || !textMessage.text.trim()) return;"));
  assert.equal(textEffect.slice(0, 300).includes("appendUserBuffer"), false);
});

test("[§71.5] turnComplete:false 전환 상태 주입(A5-α)은 큐 밖에 그대로 있다", () => {
  assert.ok(code.includes("session.sendClientContent({ turns: personaStateTurn.text, turnComplete: false })"));
});

test("[§71.6 G432] 지연 로그는 전용 접두어 한 줄이고 production에서도 남는다(log()의 NODE_ENV 게이트 밖)", () => {
  const fn = code.slice(code.indexOf("const logLatency = "), code.indexOf("const logLatency = ") + 120);
  assert.ok(fn.includes("console.info(LIVE_LATENCY_LOG_PREFIX, line)"));
  assert.equal(fn.includes("NODE_ENV"), false);
});
