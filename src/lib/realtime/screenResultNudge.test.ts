// ⭐ 2026-11-08(Edge 라이브 재시험 7 관찰 d · 사용자 결정 "전부 수정") — 화면 결과 뒤 사기범 침묵.
//
// 재시험 7(기관 사칭 고급 현금 전달형 · Gemini Live): 참가자가 출금 예약 문진표에 사실대로 답해 "출금 예약이 보류되었습니다" 화면이 떴고,
// 통화로 돌아온 뒤 사기범이 40초 넘게 말하지 않았다. 참가자가 "보류됐다"고 말하자 그제야 반응했다.
//
// 원인(코드 확인): 서버 `recordInCallSmsEvent`가 돌려준 결과 지시(`CASH_HELD_INSTRUCTION` 등 — 전부 "(앱 확인: … 이번 대답에서 …)")를 클라가
// `pushContextTurn(…, "landingSubmitted")` → `injectContext` → `sendClientContent({ turnComplete: false })`로 넣는다. 이 형태는 응답을 부르지 않고
// (§82.4.1 S1 — 응답 유발 0/2), 침묵 넛지는 문자 안내(`smsAnnounce`)에만 걸렸다 ⇒ 참가자가 말하기 전까지 모델 차례가 오지 않는다.
//
// 고침(판정표 N — `contextInjection.ts`): 전송은 그대로 맥락 주입(X5)이고, `landingSubmitted` 뒤 4초 침묵 · 모델 유휴면 기존 침묵 넛지 길로
// `SCREEN_RESULT_NUDGE_TEXT` 1회. 기존 판정(보류 직후 끊지 않음 H1 · 이중 발화 금지 §117 · 끊기 래치 G510 · G31 큐)은 그대로다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INITIAL_SILENCE_NUDGE_STATE,
  SCREEN_RESULT_NUDGE_TEXT,
  SCREEN_RESULT_SILENCE_SEC,
  SILENCE_NUDGE_RULES,
  SILENCE_NUDGE_TEXT,
  SMS_MENTION_SILENCE_SEC,
  sendsAsContextInjection,
  silenceNudgeDelayMs,
  silenceNudgeReasonFor,
  stepSilenceNudge,
  type InstructionDelivery,
  type SilenceNudgeEvent,
  type SilenceNudgeState,
  type SilenceNudgeStep,
} from "./contextInjection.ts";

const ALL_DELIVERIES: readonly InstructionDelivery[] = [
  "smsAnnounce",
  "verifyAnnounce",
  "speakerSwitch",
  "smsNudge",
  "confirmResult",
  "verifyReconnectFailed",
  "repeatBreak",
  "chatDuringCall",
  "landingSubmitted",
  "installConsented",
  "screenStatus",
];

type Stepper = (state: SilenceNudgeState, event: SilenceNudgeEvent) => SilenceNudgeStep;

function run(events: SilenceNudgeEvent[], step: Stepper = stepSilenceNudge) {
  let state: SilenceNudgeState = INITIAL_SILENCE_NUDGE_STATE;
  const fired: { at: number; text: string | undefined }[] = [];
  for (const e of events) {
    const s = step(state, e);
    state = s.state;
    if (s.fire) fired.push({ at: e.nowMs, text: s.text });
  }
  return { state, fired };
}

/** 1초 간격 점검(모델 유휴 · 로컬 발화 없음) — 호출부 `runSilenceNudgeCheck`의 재점검 간격과 같다. */
function idleTicks(fromMs: number, toMs: number): SilenceNudgeEvent[] {
  const out: SilenceNudgeEvent[] = [];
  for (let t = fromMs; t <= toMs; t += 1000) out.push({ type: "tick", nowMs: t, modelIdle: true, userSpeakingLocally: false });
  return out;
}

/** 고치기 전 규칙(문자 안내만 대기 · 8초 · 문면 고정)을 그대로 옮긴 사본 — 역검증 전용. */
const preFixStep: Stepper = (state, event) => {
  switch (event.type) {
    case "injected":
      if (event.delivery !== "smsAnnounce") return { state, fire: false };
      return { state: { armedAt: event.nowMs }, fire: false };
    case "userSpeech":
      return { state: { armedAt: null }, fire: false };
    case "tick":
      if (state.armedAt === null) return { state, fire: false };
      if (event.nowMs - state.armedAt < SMS_MENTION_SILENCE_SEC * 1000) return { state, fire: false };
      if (!event.modelIdle || event.userSpeakingLocally) return { state, fire: false };
      return { state: { armedAt: null }, fire: true };
  }
};

// ── 재현 · 역검증 ────────────────────────────────────────────────────────────────────

test("[관찰 d 재현] 보류 결과 주입 뒤 참가자가 40초 말이 없다 — 4초에 화면 결과 넛지 1회 · 고치기 전 규칙은 0회", () => {
  const events: SilenceNudgeEvent[] = [{ type: "injected", delivery: "landingSubmitted", nowMs: 0 }, ...idleTicks(1000, 40000)];
  const after = run(events);
  assert.deepEqual(after.fired, [{ at: 4000, text: SCREEN_RESULT_NUDGE_TEXT }], "4초에 먼저 말하게 하고 · 그 뒤 다시 조르지 않는다");
  const before = run(events, preFixStep);
  assert.deepEqual(before.fired, [], "역검증: 고치기 전 규칙이면 40초 동안 넛지 0 — 재시험 7의 침묵과 같다");
});

test("[관찰 d 재현] 4초 전에는 나가지 않는다", () => {
  const { fired } = run([{ type: "injected", delivery: "landingSubmitted", nowMs: 0 }, ...idleTicks(1000, 3000), { type: "tick", nowMs: 3999, modelIdle: true, userSpeakingLocally: false }]);
  assert.deepEqual(fired, []);
});

// ── 판정표 N 전수 ────────────────────────────────────────────────────────────────────

test("[판정표 N] 주입 종류 전수 — N1 문자 안내 8초 · N2 화면 결과 4초 · N3 그 밖은 넛지 없음 · 전송은 전부 맥락 주입(X5) 유지", () => {
  for (const delivery of ALL_DELIVERIES) {
    const reason = silenceNudgeReasonFor(delivery);
    const { fired } = run([{ type: "injected", delivery, nowMs: 0 }, ...idleTicks(1000, 30000)]);
    if (delivery === "smsAnnounce") {
      assert.equal(reason, "smsAnnounce");
      assert.deepEqual(fired, [{ at: 8000, text: SILENCE_NUDGE_TEXT }], delivery);
    } else if (delivery === "landingSubmitted") {
      assert.equal(reason, "landingSubmitted");
      assert.deepEqual(fired, [{ at: 4000, text: SCREEN_RESULT_NUDGE_TEXT }], delivery);
    } else {
      assert.equal(reason, null, delivery);
      assert.deepEqual(fired, [], `${delivery}: N3는 넛지를 걸지 않는다`);
    }
    if (delivery !== "speakerSwitch") assert.equal(sendsAsContextInjection(delivery), true, `${delivery}: turnComplete:false 유지`);
  }
  assert.equal(SILENCE_NUDGE_RULES.smsAnnounce.silenceSec, SMS_MENTION_SILENCE_SEC, "문자 안내 대기는 종전 설계값 그대로");
  assert.equal(SCREEN_RESULT_SILENCE_SEC, 4);
  assert.ok(SCREEN_RESULT_SILENCE_SEC < SMS_MENTION_SILENCE_SEC, "화면 결과는 몇 초 안에");
  assert.equal(silenceNudgeDelayMs(INITIAL_SILENCE_NUDGE_STATE), null);
  assert.equal(silenceNudgeDelayMs({ armedAt: 5 }), SMS_MENTION_SILENCE_SEC * 1000, "종류 없는 상태 = 문자 안내(N1)");
});

// ── 기존 판정 유지 ───────────────────────────────────────────────────────────────────

test("[기존 판정] 참가자가 먼저 말하면(예: '보류됐어요') 넛지 취소 — 그 대답에 주입이 반영되는 종전 길 그대로", () => {
  const { fired, state } = run([
    { type: "injected", delivery: "landingSubmitted", nowMs: 0 },
    { type: "userSpeech", nowMs: 2500 },
    ...idleTicks(3000, 20000),
  ]);
  assert.deepEqual(fired, []);
  assert.equal(state.armedAt, null);
});

test("[§117 이중 발화 금지] 모델이 말하는 중 · 응답 대기 중이면 기한이 지나도 보류 — 유휴가 된 첫 점검에 1회", () => {
  const { fired } = run([
    { type: "injected", delivery: "landingSubmitted", nowMs: 0 },
    { type: "tick", nowMs: 4000, modelIdle: false, userSpeakingLocally: false },
    { type: "tick", nowMs: 5000, modelIdle: false, userSpeakingLocally: false },
    { type: "tick", nowMs: 6000, modelIdle: true, userSpeakingLocally: false },
    ...idleTicks(7000, 20000),
  ]);
  assert.deepEqual(fired, [{ at: 6000, text: SCREEN_RESULT_NUDGE_TEXT }]);
});

test("[기존 판정] 참가자가 말하는 중(로컬 입력 레벨)이면 보류", () => {
  const { fired, state } = run([
    { type: "injected", delivery: "landingSubmitted", nowMs: 0 },
    { type: "tick", nowMs: 4000, modelIdle: true, userSpeakingLocally: true },
    { type: "tick", nowMs: 5000, modelIdle: true, userSpeakingLocally: true },
  ]);
  assert.deepEqual(fired, []);
  assert.equal(state.armedAt, 0, "보류는 취소가 아니다");
});

test("[기존 판정] 새 주입이 이전 대기를 대신한다 — 화면 결과 뒤 문자 안내 = 8초 문자 넛지 · 문자 안내 뒤 화면 결과 = 4초 화면 넛지", () => {
  const a = run([
    { type: "injected", delivery: "landingSubmitted", nowMs: 0 },
    { type: "injected", delivery: "smsAnnounce", nowMs: 1000 },
    ...idleTicks(2000, 30000),
  ]);
  assert.deepEqual(a.fired, [{ at: 9000, text: SILENCE_NUDGE_TEXT }]);
  const b = run([
    { type: "injected", delivery: "smsAnnounce", nowMs: 0 },
    { type: "injected", delivery: "landingSubmitted", nowMs: 3000 },
    ...idleTicks(4000, 30000),
  ]);
  assert.deepEqual(b.fired, [{ at: 7000, text: SCREEN_RESULT_NUDGE_TEXT }]);
  const c = run([
    { type: "injected", delivery: "landingSubmitted", nowMs: 0 },
    { type: "injected", delivery: "screenStatus", nowMs: 1000 },
    ...idleTicks(2000, 10000),
  ]);
  assert.deepEqual(c.fired, [{ at: 4000, text: SCREEN_RESULT_NUDGE_TEXT }], "N3 주입은 걸린 대기를 바꾸지 않는다");
});

test("[O1 H1 · H2 보호] 넛지 문면은 '지금 먼저 말하라'만 — 끊기 · 포기 · 마무리 · 횟수를 말하지 않는다(보류 지시가 정한다)", () => {
  assert.ok(SCREEN_RESULT_NUDGE_TEXT.startsWith("(") && SCREEN_RESULT_NUDGE_TEXT.endsWith(")"), "오케스트레이션 지문 형식");
  assert.ok(SCREEN_RESULT_NUDGE_TEXT.includes("앱 확인"));
  assert.ok(SCREEN_RESULT_NUDGE_TEXT.includes("먼저 말하라"));
  for (const word of ["끊", "포기", "마무리", "끝내", "한 번", "두 번", "문자"]) assert.ok(!SCREEN_RESULT_NUDGE_TEXT.includes(word), word);
});

test("[서버 문면 대조] landingSubmitted로 들어오는 결과 지시는 전부 '(앱 확인:'으로 시작한다 — 넛지 문면이 가리키는 것이 실제로 있다", () => {
  const sources = [
    readFileSync("functions/src/scenarios/mockScreens.ts", "utf8"),
    readFileSync("functions/src/inCallSms/confirmResult.ts", "utf8"),
  ].join("\n").replace(/\r\n/g, "\n");
  const names = [
    "VOUCHER_PURCHASED_INSTRUCTION",
    "GOLD_PURCHASED_INSTRUCTION",
    "GOLD_HELD_INSTRUCTION",
    "CASH_RESERVED_INSTRUCTION",
    "CASH_HELD_INSTRUCTION",
    "LOAN_APPLY_SUBMITTED_INSTRUCTION",
    "LANDING_FORM_SUBMITTED_INSTRUCTION",
    "LANDING_SUBMITTED_SHORT_INSTRUCTION",
    "LANDING_RESUBMITTED_FULL_INSTRUCTION",
    "LANDING_SUBMITTED_INSTRUCTION",
  ];
  for (const name of names) {
    const m = new RegExp(`export const ${name} =\\n\\s*"([^"]{0,8})`).exec(sources);
    assert.ok(m, `${name} 선언을 찾지 못했다`);
    assert.equal(m[1].startsWith("(앱 확인:"), true, `${name}: '(앱 확인:'으로 시작하지 않는다`);
  }
  // 보류 지시는 H1(이번 대답에서 끊지 않음)을 그대로 갖는다 — 넛지가 부른 대답이 그 '이번 대답'이다.
  for (const name of ["GOLD_HELD_INSTRUCTION", "CASH_HELD_INSTRUCTION"]) {
    const decl = new RegExp(`export const ${name} =\\n\\s*"([^"]+)"`).exec(sources);
    assert.ok(decl && decl[1].includes("이번 대답에서는 통화를 끝내지 말고 상대의 대답을 기다려라"), name);
  }
});

// ── 배선 ─────────────────────────────────────────────────────────────────────────────

const voice = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8").replace(/\r\n/g, "\n");
const page = readFileSync("src/app/session/play/page.tsx", "utf8").replace(/\r\n/g, "\n");

/** 배선 검사 — 위반 목록을 돌려준다(역검증에서 오염 사본에 같은 검사를 돌린다). */
function wiringViolations(code: string): string[] {
  const bad: string[] = [];
  const check = code.slice(code.indexOf("const runSilenceNudgeCheck = "), code.indexOf("const injectContext = "));
  if (!check.includes('dispatchClientTurn({ type: "request", turn: { kind: "silence", text: step.text ?? SILENCE_NUDGE_TEXT }, nowMs });'))
    bad.push("넛지 문면이 대기를 건 종류를 따르지 않는다");
  if (!check.includes("if (handlersRef.current.isHangupLatched()) return;")) bad.push("넛지 점검에 끊기 래치(G510)가 없다");
  if (!check.includes("!clientTurnState.modelTurnActive &&")) bad.push("넛지 점검이 모델 유휴(§117)를 보지 않는다");
  const inject = code.slice(code.indexOf("const injectContext = "), code.indexOf("const injectContext = ") + 1400);
  if (!inject.includes("activeSession.sendClientContent({ turns: text, turnComplete: false });")) bad.push("결과 주입이 맥락 주입(X5)이 아니다");
  if (!inject.includes("}, silenceNudgeDelayMs(silenceNudgeState) ?? SMS_MENTION_SILENCE_SEC * 1000);")) bad.push("대기가 판정표 N 값이 아니다");
  const send = code.slice(code.indexOf("const sendClientTurn = "), code.indexOf("const dispatchClientTurn = "));
  if (!send.includes("if (handlersRef.current.isHangupLatched()) return;")) bad.push("큐 전송에 끊기 래치(G510)가 없다");
  return bad;
}

test("[배선] 넛지는 기존 silence 큐 턴 하나로만 — 문면 · 대기는 판정표 N · 래치(G510) · 모델 유휴(§117) 그대로", () => {
  assert.deepEqual(wiringViolations(voice), []);
  // 화면 결과는 종전대로 실시간에서만 landingSubmitted로 주입된다(page.tsx 무변경).
  assert.ok(page.includes('if (callMode === "realtime" && res.contextInstruction) pushContextTurn(res.contextInstruction, "landingSubmitted");'));
});

test("[배선 역검증] 문면을 고정 상수로 · 대기를 8초 고정으로 되돌린 사본은 위반으로 잡힌다", () => {
  const fixedText = voice.replace("text: step.text ?? SILENCE_NUDGE_TEXT }", "text: SILENCE_NUDGE_TEXT }");
  assert.ok(fixedText !== voice);
  assert.ok(wiringViolations(fixedText).includes("넛지 문면이 대기를 건 종류를 따르지 않는다"));
  const fixedDelay = voice.replace("}, silenceNudgeDelayMs(silenceNudgeState) ?? SMS_MENTION_SILENCE_SEC * 1000);", "}, SMS_MENTION_SILENCE_SEC * 1000);");
  assert.ok(fixedDelay !== voice);
  assert.ok(wiringViolations(fixedDelay).includes("대기가 판정표 N 값이 아니다"));
});
