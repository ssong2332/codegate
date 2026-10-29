// 받기→첫소리 지연 수정(2026-10-21) — 마이크 1회 획득 · 세션 핸드오프 · 연결 병렬화 · 짧은 오프닝.
// ① 핸드오프 소유권 규칙은 실제 실행으로, ② 배선(순서)은 소스 단언 + 역검증으로 고정한다.
//
// ⚠️ CRLF 체크아웃(core.autocrlf=true)에서도 맞도록 소스는 **이 파일 안에서만** `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMicHandoff, requestMicrophone, stopStream } from "./micHandoff.ts";

type FakeStream = { stopped: number; getTracks: () => Array<{ stop: () => void }> };
function fakeStream(): FakeStream {
  const s: FakeStream = {
    stopped: 0,
    getTracks: () => [{ stop: () => void (s.stopped += 1) }, { stop: () => void (s.stopped += 1) }],
  };
  return s;
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("① 핸드오프: 맡긴 요청은 한 번만 가져갈 수 있고, 가져간 뒤에는 release가 트랙을 닫지 않는다(소유자 = 세션)", async () => {
  const handoff = createMicHandoff<FakeStream>();
  const stream = fakeStream();
  handoff.offer(Promise.resolve(stream));
  const claimed = handoff.claim();
  assert.ok(claimed);
  assert.equal(handoff.claim(), null, "두 번째 claim은 null");
  handoff.release();
  assert.equal(await claimed, stream);
  await flush();
  assert.equal(stream.stopped, 0);
});

test("① 핸드오프: 아무도 안 가져간 요청은 release가 도착 뒤 트랙을 닫는다 · 새 offer는 앞의 것을 정리한다", async () => {
  const handoff = createMicHandoff<FakeStream>();
  const first = fakeStream();
  const second = fakeStream();
  let resolveFirst!: (s: FakeStream) => void;
  handoff.offer(new Promise<FakeStream>((resolve) => (resolveFirst = resolve)));
  handoff.offer(Promise.resolve(second)); // 앞의 요청은 버려진다
  resolveFirst(first);
  await flush();
  assert.equal(first.stopped, 2, "버려진 요청의 트랙 2개가 닫힌다");
  handoff.release();
  await flush();
  assert.equal(second.stopped, 2);
  assert.equal(handoff.claim(), null, "release 뒤에는 가져갈 것이 없다");
  // 거부(null)로 끝난 요청을 버려도 던지지 않는다.
  handoff.offer(Promise.resolve(null));
  handoff.release();
  await flush();
});

test("① requestMicrophone: 거부(rejection) · 동기 throw 모두 null로 끝난다 · stopStream은 null을 허용한다", async () => {
  const stream = fakeStream();
  assert.equal(await requestMicrophone(() => Promise.resolve(stream)), stream);
  assert.equal(await requestMicrophone(() => Promise.reject(new Error("NotAllowedError"))), null);
  assert.equal(
    await requestMicrophone(() => {
      throw new Error("no mediaDevices");
    }),
    null,
  );
  stopStream(null);
  stopStream(stream);
  assert.equal(stream.stopped, 2);
});

// --- ② 배선 ---

const readLf = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const hook = readLf("src/lib/realtime/useRealtimeCall.ts");
const session = readLf("src/lib/realtime/GeminiVoiceSession.tsx");

function between(code: string, start: string, end: string): string {
  const i = code.indexOf(start);
  const j = i >= 0 ? code.indexOf(end, i + start.length) : -1;
  return i >= 0 && j > i ? code.slice(i, j) : "";
}

/** 받기(start): 마이크를 Live 제약으로 1회만 열고, 자격증명 꺼내기보다 먼저 걸되 기다리지 않는다. Gemini는 세션에 넘긴 뒤 기다린다. */
function startViolations(code: string): string[] {
  const out: string[] = [];
  const start = between(code, "const start = useCallback(async (sessionId: string) => {", "const stop = useCallback");
  if (!start) return ["start를 찾지 못했다"];
  const gum = start.match(/getUserMedia\(/g) ?? [];
  if (gum.length !== 1) out.push("start의 getUserMedia가 1회가 아니다");
  if (!start.includes("getUserMedia(LIVE_MIC_CONSTRAINTS)")) out.push("start가 Live 제약으로 마이크를 열지 않는다");
  if (/await navigator\.mediaDevices\.getUserMedia/.test(start)) out.push("start가 마이크를 기다린 뒤에 진행한다(직렬)");
  const request = start.indexOf("requestMicrophone(");
  const take = start.indexOf("await getPrefetchSlot().take(sessionId)");
  if (request < 0 || take < 0 || request > take) out.push("마이크 요청이 자격증명 꺼내기보다 먼저 걸리지 않는다");
  const offer = start.indexOf("liveMicHandoff.offer(mic)");
  const setCreds = start.lastIndexOf("setCredentials(issued);");
  const lastAwait = start.lastIndexOf("await mic;");
  if (offer < 0) out.push("Gemini 경로가 마이크를 세션에 넘기지 않는다");
  if (!(offer < setCreds && setCreds < lastAwait)) out.push("Gemini 경로가 연결(자격증명 세팅) 전에 마이크를 기다린다");
  return out;
}

test("② 받기(start)는 마이크를 1회만 열고 자격증명 · Live 연결과 병렬로 진행한다", () => {
  assert.deepEqual(startViolations(hook), []);
});

test("② 역검증 — 권한 확인용으로 기다려 열던 옛 start 사본은 실패한다", (t) => {
  const anchor = "    const mic = requestMicrophone(() => navigator.mediaDevices.getUserMedia(LIVE_MIC_CONSTRAINTS));\n";
  assert.ok(hook.includes(anchor), "오염 지점을 찾지 못했다 — 역검증이 공회전한다");
  const poisoned = startViolations(
    hook.replace(
      anchor,
      "    await navigator.mediaDevices.getUserMedia({ audio: true });\n" +
        "    const mic = requestMicrophone(() => navigator.mediaDevices.getUserMedia(LIVE_MIC_CONSTRAINTS));\n",
    ),
  );
  t.diagnostic(`[start] 정상 0 / 옛 직렬 ${JSON.stringify(poisoned)}`);
  assert.deepEqual(poisoned, ["start의 getUserMedia가 1회가 아니다", "start가 마이크를 기다린 뒤에 진행한다(직렬)"]);
});

/** 세션: 넘겨받은 마이크를 기다리지 않고 연결부터 한다. 오프닝은 연결 뒤 · 마이크 준비 뒤에만 보낸다. */
function sessionViolations(code: string): string[] {
  const out: string[] = [];
  if (!code.includes("liveMicHandoff.claim()")) out.push("세션이 받기 때 연 마이크를 넘겨받지 않는다");
  if (/await navigator\.mediaDevices\.getUserMedia/.test(code)) out.push("세션이 연결 전에 마이크를 기다린다");
  const connect = code.indexOf("session = await openLive(0);"); // §140 — 첫 연결(세대 0)
  const mic = code.indexOf("const micStream = await micRequest;");
  const opening = code.indexOf('turn: { kind: "opening", text: OPENING_TRIGGER_TURN }');
  const wire = code.indexOf("inputContext.createMediaStreamSource(micStream)");
  if (!(connect >= 0 && connect < mic)) out.push("마이크를 Live 연결보다 먼저 기다린다");
  if (!(mic >= 0 && mic < opening)) out.push("오프닝이 마이크 준비 전에 나간다");
  if (!(opening >= 0 && opening < wire)) out.push("마이크 배선이 오프닝 뒤가 아니다");
  if (!between(code, "const micStream = await micRequest;", "stream = micStream;").includes("if (cancelled || !micStream)")) {
    out.push("거부 · 취소 시 오프닝을 막지 않는다");
  }
  return out;
}

test("② 세션은 Live 연결을 마이크와 병렬로 하고, 오프닝은 마이크가 준비된 뒤에만 보낸다", () => {
  assert.deepEqual(sessionViolations(session), []);
});

test("② 역검증 — 연결 전에 마이크를 다시 여는 옛 세션 사본은 실패한다", (t) => {
  const anchor = "        const handedMic = liveMicHandoff.claim();\n";
  assert.ok(session.includes(anchor), "오염 지점을 찾지 못했다 — 역검증이 공회전한다");
  const poisoned = sessionViolations(
    session.replace(anchor, "        stream = await navigator.mediaDevices.getUserMedia(LIVE_MIC_CONSTRAINTS);\n        const handedMic = null;\n"),
  );
  t.diagnostic(`[session] 정상 0 / 옛 직렬 ${JSON.stringify(poisoned)}`);
  assert.deepEqual(poisoned, ["세션이 받기 때 연 마이크를 넘겨받지 않는다", "세션이 연결 전에 마이크를 기다린다"]);
});

test("③ 오프닝 트리거는 첫 마디를 짧게 하고 멈춰서 대답을 기다리게 한다(첫 턴 12.3초 실측 → 한 턴 6초 이하 기준)", () => {
  const trigger = between(session, "const OPENING_TRIGGER_TURN =\n", ";\n");
  assert.ok(trigger, "OPENING_TRIGGER_TURN을 찾지 못했다");
  assert.ok(trigger.includes("첫 마디는 짧게"));
  assert.ok(trigger.includes("멈춰서 상대의 대답을 기다려라"));
  assert.ok(!trigger.includes("상황을 설명한 뒤에 이어가라"), "첫 턴을 늘이던 옛 문구가 남아 있다");
  // 종전 취지(다짜고짜 요구 금지 · 신분과 이유 먼저)는 유지한다.
  assert.ok(trigger.includes("다짜고짜 요구나 압박부터 하지 말고"));
  assert.ok(trigger.includes("신분(사칭 기관·관계)과 전화를 건 이유"));
});
