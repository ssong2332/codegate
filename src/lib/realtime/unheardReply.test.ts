// §105.2.6 — "말했는데 서버가 못 들음" 화면 쪽 보완 판정표 고정 + 세션 배선(소스 스캔).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INITIAL_UNHEARD_REPLY_STATE,
  UNHEARD_COOLDOWN_MS,
  UNHEARD_MAX_PER_CALL,
  UNHEARD_REPLY_TEXT,
  UNHEARD_WAIT_MS,
  stepUnheardReply,
  type UnheardReplyEvent,
  type UnheardReplyState,
} from "./unheardReply.ts";

const FRAME_MS = 16;

/** `fromMs`부터 `durationMs` 동안 레벨 `level`로 프레임을 넣고, 마지막 결과까지 돌려준다. */
function feed(
  state: UnheardReplyState,
  fromMs: number,
  durationMs: number,
  level: number,
  blocked = false,
): { state: UnheardReplyState; fired: number; skips: string[]; endMs: number } {
  let s = state;
  let fired = 0;
  const skips: string[] = [];
  let t = fromMs;
  for (; t < fromMs + durationMs; t += FRAME_MS) {
    const step = stepUnheardReply(s, { type: "frame", nowMs: t, level, blocked } satisfies UnheardReplyEvent);
    s = step.state;
    if (step.fire) fired += 1;
    if (step.skipped) skips.push(step.skipped);
  }
  return { state: s, fired, skips, endMs: t };
}

/** 말(레벨 30 · durationMs) → 조용(레벨 2 · 대기 시간 + 여유). */
function utterance(state: UnheardReplyState, fromMs: number, durationMs: number, opts: { level?: number; asr?: boolean } = {}) {
  const spoken = feed(state, fromMs, durationMs, opts.level ?? 30);
  let s = spoken.state;
  if (opts.asr) s = stepUnheardReply(s, { type: "asr" }).state;
  const quiet = feed(s, spoken.endMs, UNHEARD_WAIT_MS + 200, 2);
  return { state: quiet.state, fired: spoken.fired + quiet.fired, skips: [...spoken.skips, ...quiet.skips], endMs: quiet.endMs };
}

test("[§105.2.6 8행] 짧은 대답(0.3초) 뒤 1.5초 동안 서버 인식 0 · 모델 무응답 → 1회 발동", () => {
  const r = utterance(INITIAL_UNHEARD_REPLY_STATE, 0, 300);
  assert.equal(r.fired, 1);
  assert.equal(r.state.fired, 1);
});

test("[§105.2.6 3행] 말이 끝나고 1.5초가 되기 전에는 발동하지 않는다", () => {
  const spoken = feed(INITIAL_UNHEARD_REPLY_STATE, 0, 300, 30);
  const early = feed(spoken.state, spoken.endMs, UNHEARD_WAIT_MS - 100, 2);
  assert.equal(early.fired, 0);
});

test("[§105.2.6 4행] 그 사이 서버 입력 인식이 오면 버린다(서버가 들었다)", () => {
  const r = utterance(INITIAL_UNHEARD_REPLY_STATE, 0, 300, { asr: true });
  assert.equal(r.fired, 0);
  assert.ok(r.skips.includes("heard"));
});

test("[§105.2.6 1행] 사기범이 말하는 중 · 반이중 게이트 · 모델 응답 중(blocked)에는 후보를 버리고 발동 0", () => {
  // 말하는 중간에 막힘이 들어오면 후보를 버린다.
  const spoken = feed(INITIAL_UNHEARD_REPLY_STATE, 0, 300, 30);
  const blocked = feed(spoken.state, spoken.endMs, 200, 30, true);
  assert.ok(blocked.skips.includes("blocked"));
  const quiet = feed(blocked.state, blocked.endMs, UNHEARD_WAIT_MS + 200, 2);
  assert.equal(spoken.fired + blocked.fired + quiet.fired, 0);
  // 막힌 동안의 큰 소리(에코)는 후보가 되지 않는다.
  const echo = feed(INITIAL_UNHEARD_REPLY_STATE, 0, 2000, 40, true);
  const after = feed(echo.state, echo.endMs, UNHEARD_WAIT_MS + 200, 2);
  assert.equal(echo.fired + after.fired, 0);
});

test("[§105.2.6 5행] 짧은 피크(기침 · 탁 소리 < 120ms) · 작은 소음(최대 레벨 < 14)은 거른다", () => {
  const click = utterance(INITIAL_UNHEARD_REPLY_STATE, 0, 64);
  assert.equal(click.fired, 0);
  assert.ok(click.skips.includes("short"));
  const faint = utterance(INITIAL_UNHEARD_REPLY_STATE, 0, 600, { level: 12 });
  assert.equal(faint.fired, 0);
  assert.ok(faint.skips.includes("short"));
});

test("[§105.2.6 6행] 발동 뒤 20초 쿨다운 안에는 다시 발동하지 않고, 지나면 다시 발동한다", () => {
  const first = utterance(INITIAL_UNHEARD_REPLY_STATE, 0, 300);
  assert.equal(first.fired, 1);
  const second = utterance(first.state, first.endMs, 300);
  assert.equal(second.fired, 0);
  assert.ok(second.skips.includes("cooldown"));
  const later = utterance(second.state, first.endMs + UNHEARD_COOLDOWN_MS, 300);
  assert.equal(later.fired, 1);
});

test("[§105.2.6 7행] 한 통화 상한 5회", () => {
  let s = INITIAL_UNHEARD_REPLY_STATE;
  let t = 0;
  let total = 0;
  for (let i = 0; i < UNHEARD_MAX_PER_CALL + 2; i += 1) {
    const r = utterance(s, t, 300);
    s = r.state;
    total += r.fired;
    t = r.endMs + UNHEARD_COOLDOWN_MS;
  }
  assert.equal(total, UNHEARD_MAX_PER_CALL);
});

test("[§105.2.6] 단어 사이 짧은 쉼(1.5초 미만)은 한 발화로 합친다 — 긴 말 1번에 1회만", () => {
  let s = feed(INITIAL_UNHEARD_REPLY_STATE, 0, 400, 30).state;
  s = feed(s, 400, 600, 2).state; // 0.6초 쉼
  const r = utterance(s, 1000, 400);
  assert.equal(r.fired, 1);
});

test("[§105.2.6] 문구는 중립 — 맞장구 · 긍정을 가정하지 않고 되묻기 또는 이어가기", () => {
  assert.ok(UNHEARD_REPLY_TEXT.startsWith("(") && UNHEARD_REPLY_TEXT.endsWith(")"));
  assert.ok(UNHEARD_REPLY_TEXT.includes("잘 들리지 않았다"));
  assert.ok(UNHEARD_REPLY_TEXT.includes("되묻"));
  for (const word of ["맞장구", "긍정", "동의", "네라고"]) assert.ok(!UNHEARD_REPLY_TEXT.includes(word), word);
});

test("[§105.2.6 배선] 세션: 레벨 프레임마다 판정 · 막힘 조건 · 서버 인식 이벤트 · silence 종류 턴 · 진단 횟수", () => {
  const src = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8").replace(/\r\n/g, "\n");
  const sampler = src.slice(src.indexOf("const sampleUserLevel = () => {"), src.indexOf("userLevelRafId = requestAnimationFrame(sampleUserLevel);\n        };"));
  assert.ok(/stepUnheardReply\(unheardReplyState, \{\s*type: "frame"/.test(sampler), "레벨 프레임 판정이 없다");
  for (const cond of [
    "agentSpeaking",
    "mutedRef.current",
    "handlersRef.current.isHangupLatched()",
    "clientTurnState.modelTurnActive",
    "clientTurnState.awaitingSince !== null",
    'document.visibilityState === "hidden"',
  ]) {
    assert.ok(sampler.includes(cond), `막힘 조건 누락: ${cond}`);
  }
  assert.ok(sampler.includes('turn: { kind: "silence", text: UNHEARD_REPLY_TEXT }'), "전사에 남지 않는 silence 종류로 보내야 한다");
  assert.ok(sampler.includes("noteUnheardReplyFired()"), "진단 횟수가 없다");
  const asrAt = src.indexOf('unheardReplyState = stepUnheardReply(unheardReplyState, { type: "asr" }).state;');
  assert.ok(asrAt > src.indexOf("if (sc?.inputTranscription?.text) {"), "서버 인식 이벤트 배선이 없다");
});
