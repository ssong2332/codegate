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

// ⚠️ §78.4(G491 · S3) — 이 테스트는 종전에 `kind: "instruction"`(문자 · 확인 안내를 `turnComplete:true` 큐 턴으로)을
// 단언했다. §78.0 X5가 그 형태를 금지하므로 **의도적으로** 바꾼다: 큐 턴으로 남는 지시는 화자 전환 첫 발화
// (`relayGreeting`)뿐이다. "세션에 직접 보내지 않고 큐에 넣는다"는 단언 자체는 그대로 유지한다.
test("[§71.5 G431] 타이핑 · 화자 전환 지시 effect는 세션에 직접 보내지 않고 큐에 넣는다", () => {
  assert.ok(code.includes('requestClientTurnRef.current?.({ kind: "text", text: textMessage.text })'));
  assert.ok(code.includes('requestClientTurnRef.current?.({ kind: "relayGreeting", text: instructionTurn.text })'));
});

// ── §78.4.2 G491 — 문자 · 확인 권유 안내는 `turnComplete:false`로만 · `turnComplete:true` 종류는 넷뿐 ─────────
const ALLOWED_TC_TRUE_KINDS = ["opening", "text", "silence", "relayGreeting"];

/**
 * G491 소스 위반 목록(빈 배열 = 통과). 실제 소스와 **테스트 안에서만** 오염시킨 사본에 같은 함수를 돌려
 * 역방향(AC-098 (g))을 같은 실행 출력에 나란히 보인다.
 */
function g491Violations(sessionCode: string, queueSource: string): string[] {
  const out: string[] = [];
  // (1) 큐 종류 선언 ⊆ 허용 4종.
  const union = /export type ClientTurnKind = ([^;]+);/.exec(queueSource)?.[1] ?? "";
  const declared = [...union.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
  if (declared.length === 0) out.push("ClientTurnKind 선언을 찾지 못했다");
  for (const kind of declared) if (!ALLOWED_TC_TRUE_KINDS.includes(kind)) out.push(`허용 밖 종류: ${kind}`);
  // (2) 세션 코드의 ClientTurn 리터럴 종류 ⊆ 허용 4종(`instruction` 등 옛 종류 0).
  for (const m of sessionCode.matchAll(/kind: "([a-zA-Z]+)", text:/g)) {
    if (!ALLOWED_TC_TRUE_KINDS.includes(m[1])) out.push(`허용 밖 ClientTurn 리터럴: ${m[1]}`);
  }
  // (3) 문자 · 확인 권유 안내 = 맥락 주입 함수 안의 `turnComplete: false` 전송.
  const inject = sessionCode.slice(
    sessionCode.indexOf("const injectContext = "),
    sessionCode.indexOf("const injectContext = ") + 600,
  );
  if (!sessionCode.includes("const injectContext = ")) out.push("맥락 주입 함수가 없다");
  else if (!inject.includes("sendClientContent({ turns: text, turnComplete: false })")) {
    out.push("맥락 주입이 turnComplete:false가 아니다");
  }
  // (4) 지시 effect는 안내를 맥락 주입으로 보낸다(전달 방식 판정은 순수 함수).
  const effect = sessionCode.slice(
    sessionCode.indexOf("if (!instructionTurn || !instructionTurn.text.trim()) return;"),
    sessionCode.indexOf("}, [instructionTurn?.seq]"),
  );
  if (!effect.includes("if (sendsAsContextInjection(instructionTurn.delivery)) {")) out.push("지시 effect가 전달 방식을 판정하지 않는다");
  if (!effect.includes("injectContextRef.current?.(instructionTurn.text")) out.push("지시 effect가 맥락 주입을 부르지 않는다");
  // (5) `turnComplete: true`는 여전히 sendClientTurn 한 곳뿐(G431).
  const tcTrue = sessionCode.split("turnComplete: true").length - 1;
  if (tcTrue !== 1) out.push(`turnComplete: true ${tcTrue}곳`);
  return out;
}

const queueSource = readFileSync("src/lib/realtime/clientTurnQueue.ts", "utf8");

test("[§78.4 G491] 문자 · 확인 권유 안내는 turnComplete:false로만 · turnComplete:true 종류는 opening/text/silence/relayGreeting뿐", () => {
  assert.deepEqual(g491Violations(code, queueSource), []);
});

test("[§78.4 G491 · AC-098 (g) 역방향] 옛 방식(안내를 instruction 큐 턴으로)으로 오염시킨 사본은 같은 검사에서 실패한다", () => {
  const contaminatedSession = code
    .replace(
      "sendClientContent({ turns: text, turnComplete: false })",
      "sendClientContent({ turns: text, turnComplete: true })",
    )
    .replace(
      "injectContextRef.current?.(instructionTurn.text",
      'requestClientTurnRef.current?.({ kind: "instruction", text: instructionTurn.text }); void (instructionTurn.text',
    );
  const contaminatedQueue = queueSource.replace(
    '"opening" | "text" | "silence" | "relayGreeting"',
    '"opening" | "text" | "instruction" | "silence" | "relayGreeting"',
  );
  const normal = g491Violations(code, queueSource);
  const bad = g491Violations(contaminatedSession, contaminatedQueue);
  console.log(`[G491 역방향] 정상 위반 ${normal.length}건 · 오염 위반 ${bad.length}건: ${bad.join(" / ")}`);
  assert.equal(normal.length, 0);
  assert.ok(bad.includes("허용 밖 종류: instruction"));
  assert.ok(bad.includes("허용 밖 ClientTurn 리터럴: instruction"));
  assert.ok(bad.includes("맥락 주입이 turnComplete:false가 아니다"));
  assert.ok(bad.includes("지시 effect가 맥락 주입을 부르지 않는다"));
  assert.ok(bad.some((v) => v.startsWith("turnComplete: true ")));
});

test("[§78.4 T1] 맥락 주입은 응답 대기 큐(dispatchClientTurn)를 거치지 않는다", () => {
  const inject = code.slice(code.indexOf("const injectContext = "), code.indexOf("const injectContext = ") + 900);
  assert.equal(inject.includes("dispatchClientTurn("), false, "주입이 큐를 점유하면 오지 않을 응답을 기다린다");
  assert.equal(inject.includes("requestClientTurnRef"), false);
});

test("[§78.4.2 G492 배선] 침묵 넛지는 silence 큐 턴으로만 나가고 · 사용자 발화(음성 전사 · 타이핑)가 취소하며 · cause 로그를 남긴다", () => {
  assert.ok(code.includes('dispatchClientTurn({ type: "request", turn: { kind: "silence", text: SILENCE_NUDGE_TEXT }, nowMs })'));
  assert.ok(code.includes("console.info(LIVE_TURN_LOG_PREFIX, formatSilenceNudgeLog("));
  assert.ok(code.includes("if (sc.inputTranscription.text.trim()) noteUserSpeechForNudge();"));
  const sendFn = code.slice(code.indexOf("const sendClientTurn = "), code.indexOf("const dispatchClientTurn = "));
  assert.ok(sendFn.includes("noteUserSpeechForNudge();"), "타이핑 전송도 참가자 발화다");
  assert.ok(code.includes("}, SMS_MENTION_SILENCE_SEC * 1000);"), "대기는 설계값 상수로만 건다");
  assert.ok(code.includes("clearSilenceNudgeTimer();\n      logLatencySummary();"), "언마운트 때 넛지 타이머를 지운다");
});

test("[리뷰 M2 배선] 턴 위상은 큐 전이 · 사용자 버퍼 변화마다 화면 ref에 기록된다", () => {
  const report = code.slice(code.indexOf("const reportTurnPhase = "), code.indexOf("const reportTurnPhase = ") + 400);
  assert.ok(report.includes("modelResponding: clientTurnState.modelTurnActive || clientTurnState.awaitingSince !== null,"));
  assert.ok(report.includes("userSpeechBuffered: userBuffer.trim().length > 0,"));
  const dispatch = code.slice(code.indexOf("const dispatchClientTurn = "), code.indexOf("const dispatchClientTurn = ") + 250);
  assert.ok(dispatch.includes("reportTurnPhase();"), "큐 전이 직후 기록");
  const append = code.slice(code.indexOf("const appendUserBuffer = "), code.indexOf("const appendUserBuffer = ") + 120);
  assert.ok(append.includes("reportTurnPhase();"), "사용자 버퍼 적립 직후 기록");
  const flush = code.slice(code.indexOf("const flushTranscript = "), code.indexOf("const flushScammerTurn = "));
  assert.ok(flush.includes("reportTurnPhase();"), "flush 직후 기록");
});

test("[리뷰 M3 배선] 침묵 넛지 점검은 로컬 입력 레벨로 보류하고 · 발화 시작을 사용자 발화로 넣는다", () => {
  assert.ok(code.includes("userSpeakingLocally: userSpeechDebounceState.speaking,"));
  assert.ok(code.includes("if (localSpeechStarted(userSpeechDebounceState.speaking, nextState.speaking)) noteUserSpeechForNudge();"));
});

test("[§78.3.4 G488 배선] 빈 turnComplete(N1)는 경계 콜백을 부르지 않고 · 도구 경로 사본도 전사 flush에서만 오른다", () => {
  assert.ok(code.includes("const emptyTurn = isEmptyTurnComplete({ audioSinceBoundary, scammerTextSinceBoundary });"));
  assert.ok(code.includes("if (!emptyTurn) handlersRef.current.onScammerTurnComplete?.();"));
  assert.equal(
    (code.match(/handlersRef\.current\.onScammerTurnComplete\?\.\(\)/g) ?? []).length,
    1,
    "경계 콜백 호출부는 빈 마감 판정 뒤 한 곳뿐이다",
  );
  // `modelToolScammerTurns += 1`은 비어 있지 않은 사기범 전사 flush 두 곳(정상 마감 · 끊긴 조각)뿐이다.
  assert.equal((code.match(/modelToolScammerTurns \+= 1;/g) ?? []).length, 2);
  for (const fn of ["const flushTranscript = ", "const flushScammerTurn = "]) {
    const body = code.slice(code.indexOf(fn), code.indexOf(fn) + 400);
    assert.ok(/if \(s\) \{\s*modelToolScammerTurns \+= 1;/.test(body), `${fn} — 비어 있을 때 오르면 안 된다`);
  }
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
