// 2026-10-27 실기 신고(첫 발화까지 17초) — §122.2.2가 통화 출력 컨텍스트를 마이크 뒤에 만들면서 Live 연결도 마이크를 기다리게 됐다
// (2026-10-21 받기→첫소리 병렬화가 다시 직렬). ① 조기 메시지 문(표 G1~G4)은 실제 실행으로, ② 배선(순서)은 소스 단언 + 역검증으로 고정한다.
//
// ⚠️ CRLF 체크아웃(core.autocrlf=true)에서도 맞도록 소스는 **이 파일 안에서만** `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEarlyMessageGate } from "./earlyMessageGate.ts";

test("① 문 G1~G4 — 열기 전 메시지는 쌓이고, 열 때 받은 순서대로 처리된 뒤, 그 다음 메시지가 이어진다", () => {
  const handled: string[] = [];
  const gate = createEarlyMessageGate<string>((m) => handled.push(m));
  gate.push("setupComplete");
  gate.push("audio-1");
  gate.push("audio-2");
  assert.deepEqual(handled, [], "G1 — 열기 전에는 처리하지 않는다(버리지도 않는다)");
  assert.equal(gate.pending, 3);
  assert.equal(gate.isOpen, false);
  gate.open();
  assert.deepEqual(handled, ["setupComplete", "audio-1", "audio-2"], "G2 — 받은 순서 그대로");
  assert.equal(gate.pending, 0);
  gate.push("audio-3");
  assert.deepEqual(handled, ["setupComplete", "audio-1", "audio-2", "audio-3"], "G3 — 연 뒤에는 바로");
  gate.open();
  assert.equal(handled.length, 4, "G4 — 다시 열어도 다시 처리하지 않는다");
});

test("① 문 G2 — 쌓인 메시지를 처리하는 도중 들어온 메시지도 뒤에 붙는다(순서 역전 0)", () => {
  const handled: string[] = [];
  let reentered = false;
  const gate = createEarlyMessageGate<string>((m) => {
    handled.push(m);
    if (m === "a" && !reentered) {
      reentered = true;
      gate.push("c");
    }
  });
  gate.push("a");
  gate.push("b");
  gate.open();
  assert.deepEqual(handled, ["a", "b", "c"]);
});

const session = readFileSync(new URL("./GeminiVoiceSession.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function between(code: string, start: string, end: string): string {
  const i = code.indexOf(start);
  const j = i >= 0 ? code.indexOf(end, i + start.length) : -1;
  return i >= 0 && j > i ? code.slice(i, j) : "";
}

/** 연결은 출력 준비(마이크 대기)를 기다리지 않고, 오프닝 · 맥락 주입 · 정리는 출력 준비 뒤에 온다. 출력 준비 전 메시지는 문이 받는다. */
function parallelViolations(code: string): string[] {
  const out: string[] = [];
  const mount = code.indexOf('markCallSetup("mount", performance.now());');
  const handlerDef = code.indexOf("const handleLiveMessage = (message: LiveServerMessageLike): void => {");
  const setupDef = code.indexOf("const setupCallOutput = async (): Promise<void> => {");
  const start = code.indexOf("outputReady = setupCallOutput();");
  const connect = code.indexOf("await ai.live.connect(");
  const awaitReady = code.indexOf("await outputReady;");
  const micWaitInSetup = code.indexOf("(await micRequest.catch(() => null)) !== null");
  const freshCtx = code.indexOf("freshOutput = new AudioContext({ sampleRate: GEMINI_OUTPUT_SAMPLE_RATE });");
  const pendingContext = code.indexOf("const pendingContext = pendingContextTurnRef.current;");
  const micStream = code.indexOf("const micStream = await micRequest;");
  const opening = code.indexOf('turn: { kind: "opening", text: OPENING_TRIGGER_TURN }');
  if (!(mount >= 0 && setupDef > mount && start > setupDef && connect > start)) out.push("출력 준비를 연결 전에 시작하지 않는다");
  // 마운트 → 연결 사이에서, 메시지 처리 · 출력 준비 함수 몸체 밖에 `await`가 있으면 연결이 무언가를 기다린다(직렬).
  const outside = handlerDef > mount && handlerDef < setupDef ? (code.slice(mount, handlerDef) + code.slice(start, connect)).replace(/\/\/.*$/gm, "") : "await";
  if (/\bawait\b/.test(outside)) out.push("Live 연결이 출력 준비 · 마이크를 기다린다(직렬)");
  if (!(micWaitInSetup > setupDef && micWaitInSetup < start)) out.push("마이크 대기가 출력 준비 함수 밖에 있다");
  if (!(freshCtx > micWaitInSetup && freshCtx < start)) out.push("§122.2.2 — 새 출력 컨텍스트가 마이크 대기 뒤가 아니다");
  if (!(awaitReady > connect && awaitReady < pendingContext && pendingContext < micStream && micStream < opening)) {
    out.push("맥락 주입 · 오프닝이 출력 준비 뒤가 아니다");
  }
  const wrapper = between(code, "onmessage: (message: LiveServerMessageLike) => {", "onerror:");
  if (!wrapper.includes("liveMessageGate.push(message);")) out.push("연결 콜백이 메시지를 문으로 보내지 않는다");
  if (/handleLiveMessage\(/.test(wrapper)) out.push("연결 콜백이 문을 건너뛰고 바로 처리한다");
  const setupBody = between(code, "const setupCallOutput = async (): Promise<void> => {", "outputReady = setupCallOutput();");
  const openAt = setupBody.lastIndexOf("liveMessageGate.open();");
  if (!(openAt > setupBody.indexOf('markCallSetup("micReady"'))) out.push("출력 노드가 다 붙기 전에 문을 연다");
  if (!setupBody.includes("if (cancelled) return;\n          noteOutputPath(outputPath);")) {
    out.push("정리 뒤에 출력 컨텍스트를 새로 만든다(닫을 주체 없음)");
  }
  const failure = between(code, 'log("connect threw", err);', "})();");
  if (!(failure.indexOf("await outputReady?.catch(() => {});") >= 0 && failure.indexOf("await outputReady?.catch") < failure.indexOf("cleanup();"))) {
    out.push("연결 실패 정리가 출력 준비를 기다리지 않는다(뒤늦은 컨텍스트가 남는다)");
  }
  return out;
}

test("② 세션은 Live 연결을 출력 준비(마이크 대기)와 병렬로 하고, 맥락 주입 · 오프닝은 출력 준비 뒤에만 보낸다", () => {
  assert.deepEqual(parallelViolations(session), []);
});

test("② 역검증 — 연결 전에 출력 준비를 기다리는 옛 직렬 사본 · 문을 건너뛰는 사본은 실패한다", (t) => {
  const anchor = "        session = (await ai.live.connect({\n";
  assert.ok(session.includes(anchor), "오염 지점을 찾지 못했다 — 역검증이 공회전한다");
  const serial = parallelViolations(session.replace(anchor, "        await outputReady;\n" + anchor));
  const bypass = parallelViolations(session.replace("liveMessageGate.push(message);", "handleLiveMessage(message);"));
  t.diagnostic(`정상 0 / 직렬 ${JSON.stringify(serial)} / 문 건너뜀 ${JSON.stringify(bypass)}`);
  assert.ok(serial.includes("Live 연결이 출력 준비 · 마이크를 기다린다(직렬)"));
  assert.deepEqual(bypass, ["연결 콜백이 메시지를 문으로 보내지 않는다", "연결 콜백이 문을 건너뛰고 바로 처리한다"]);
});
