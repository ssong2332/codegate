// §78.4 (T1) · §78.3.4 (N1) · §78.4.2 침묵 넛지 — S3 클라 순수 규칙(docs/Architecture.md §78.9 G488(계수) · G491 · G492).
// 배선(`GeminiVoiceSession.tsx`)의 소스 스캔은 `clientTurnQueueWiring.test.ts`, 화면(`session/play/page.tsx`)의
// 소스 스캔은 이 파일 끝에 있다. 역방향 샘플의 오염은 **이 테스트 코드 안에서만** 만든다(AC-098 (g)).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INITIAL_SILENCE_NUDGE_STATE,
  INITIAL_TURN_COUNTERS,
  LIVE_TURN_LOG_PREFIX,
  SILENCE_NUDGE_TEXT,
  SMS_MENTION_SILENCE_SEC,
  countConsecutiveScammerTurns,
  countTranscriptFlush,
  deliveryForInstruction,
  formatSilenceNudgeLog,
  isEmptyTurnComplete,
  localSpeechStarted,
  sendsAsContextInjection,
  stepSilenceNudge,
  type InstructionDelivery,
  type ObservedTurn,
  type SilenceNudgeEvent,
  type SilenceNudgeState,
  type TurnCounters,
} from "./contextInjection.ts";
import {
  INITIAL_CLIENT_TURN_QUEUE_STATE,
  stepClientTurnQueue,
  type ClientTurn,
  type ClientTurnQueueState,
} from "./clientTurnQueue.ts";
import {
  announceTurnsOnInstructionDispatch,
  deferredAnnouncePendingOnDispatch,
  isResponseInProgress,
  nextVerifyOfferStage,
  shouldRecordDeferredAnnounce,
} from "../verifyintercept/verifyIntercept.ts";

// ── (a) T1 — 안내는 turnComplete:false · 응답 대기 큐를 점유하지 않는다 ─────────────────

test("[§78.4.2 T1] 지시 → 전달 방식: 문자 안내 · 확인 권유 = 맥락 주입, 재연결 = 화자 전환 첫 발화", () => {
  assert.equal(deliveryForInstruction({ priority: "sms" }), "smsAnnounce");
  assert.equal(deliveryForInstruction({ priority: "verify" }), "verifyAnnounce");
  assert.equal(deliveryForInstruction({ priority: "verify", speakerSwitch: true }), "speakerSwitch");
  assert.equal(sendsAsContextInjection("smsAnnounce"), true);
  assert.equal(sendsAsContextInjection("verifyAnnounce"), true);
  assert.equal(sendsAsContextInjection("speakerSwitch"), false);
  assert.equal(sendsAsContextInjection(undefined), true, "전달 방식이 없으면 안전한 쪽(맥락 주입) — X5");
});

/**
 * `GeminiVoiceSession`의 전송 분기를 그대로 흉내 낸 구동기(전달 방식 판정은 **제품 함수**). 맥락 주입은 큐 이벤트가
 * 아니라 바로 `turnComplete:false` 전송이고, 화자 전환만 큐 `request`다.
 */
function routeInstruction(
  queue: ClientTurnQueueState,
  delivery: InstructionDelivery,
  text: string,
  nowMs: number,
): { queue: ClientTurnQueueState; sent: { turnComplete: boolean; kind?: string }[] } {
  if (sendsAsContextInjection(delivery)) return { queue, sent: [{ turnComplete: false }] };
  const step = stepClientTurnQueue(queue, { type: "request", turn: { kind: "relayGreeting", text }, nowMs });
  return { queue: step.state, sent: step.send ? [{ turnComplete: true, kind: step.send.kind }] : [] };
}

test("[§78.4 T1 (a)] 문자 안내는 turnComplete:false로 나가고 응답 대기 큐를 점유하지 않는다 — 직후 타이핑이 즉시 나간다", () => {
  const routed = routeInstruction(INITIAL_CLIENT_TURN_QUEUE_STATE, "smsAnnounce", "(문자 도착 안내)", 100);
  assert.deepEqual(routed.sent, [{ turnComplete: false }]);
  assert.deepEqual(routed.queue, INITIAL_CLIENT_TURN_QUEUE_STATE, "큐 상태가 그대로다(awaitingSince 없음)");
  const typed: ClientTurn = { kind: "text", text: "네?" };
  const next = stepClientTurnQueue(routed.queue, { type: "request", turn: typed, nowMs: 200 });
  assert.deepEqual(next.send, typed, "주입이 큐를 점유했다면 타이핑이 8초 보류됐을 것이다");
});

test("[§78.4 T1 (a)] 모델 발화 도중이어도 맥락 주입은 큐에 쌓이지 않는다(보류분 0)", () => {
  const speaking = stepClientTurnQueue(INITIAL_CLIENT_TURN_QUEUE_STATE, { type: "modelAudio", nowMs: 0 }).state;
  const routed = routeInstruction(speaking, "verifyAnnounce", "(확인 권유)", 10);
  assert.deepEqual(routed.sent, [{ turnComplete: false }]);
  assert.equal(routed.queue.pending.length, 0);
});

test("[§78.4.2] 화자 전환 첫 발화(재연결 지시)는 relayGreeting 큐 턴 — 모델 발화 중이면 그 턴 뒤로 보류된다(§71.5 유지)", () => {
  const speaking = stepClientTurnQueue(INITIAL_CLIENT_TURN_QUEUE_STATE, { type: "modelAudio", nowMs: 0 }).state;
  const routed = routeInstruction(speaking, "speakerSwitch", "(재연결)", 10);
  assert.deepEqual(routed.sent, []);
  assert.equal(routed.queue.pending[0]?.kind, "relayGreeting");
  const done = stepClientTurnQueue(routed.queue, { type: "turnComplete", nowMs: 900 });
  assert.equal(done.send?.kind, "relayGreeting");
});

// ── (d) AC-098 (b)(g) — 지시 유발 연속 발화 0 · 옛 방식 샘플은 같은 검사에서 실패 ─────────────

/**
 * 모델 대역(S1 실측 규칙): `turnComplete:true` 텍스트 턴은 사용자 차례를 건너뛰고 즉시 사기범 턴 1개를 만든다
 * (§3.1 — 14/14), `turnComplete:false` 주입은 턴을 만들지 않는다(§3.2 — 0/2). 대본: 오프닝 → (사용자 → 응답) × 3,
 * 둘째 응답 직후 문자 도착 · 셋째 응답 직후 확인 권유.
 */
function simulateCall(sendAsTurnCompleteTrue: (delivery: InstructionDelivery) => boolean): ObservedTurn[] {
  const turns: ObservedTurn[] = [{ role: "scammer", cause: "opening" }];
  const arrivals: Record<number, InstructionDelivery> = { 2: "smsAnnounce", 3: "verifyAnnounce" };
  for (let round = 1; round <= 3; round += 1) {
    turns.push({ role: "user" }, { role: "scammer", cause: "reply" });
    const delivery = arrivals[round];
    if (delivery && sendAsTurnCompleteTrue(delivery)) turns.push({ role: "scammer", cause: "instruction" });
  }
  turns.push({ role: "user" }, { role: "scammer", cause: "reply" });
  return turns;
}

test("[§78.4 AC-098 (b)(g) 역방향] 제품 라우팅 = 지시 유발 연속 발화 0 · 옛 방식(turnComplete:true) 샘플 = 같은 검사에서 2", () => {
  const product = countConsecutiveScammerTurns(simulateCall((d) => !sendsAsContextInjection(d)));
  const legacy = countConsecutiveScammerTurns(simulateCall(() => true));
  console.log(
    `[AC-098 (g)] 정상(제품 라우팅) 지시 유발 ${product.instruction} · 오염(옛 방식) 지시 유발 ${legacy.instruction}`,
  );
  assert.equal(product.instruction, 0);
  assert.equal(product.other, 0);
  assert.equal(legacy.instruction, 2, "검사가 오염을 실제로 잡는다");
});

test("[§78.4 AC-098 (a)] 연속 발화 검사: 오프닝은 제외하고 · 원인은 뒤쪽 턴으로 분류한다", () => {
  assert.deepEqual(
    countConsecutiveScammerTurns([
      { role: "scammer", cause: "opening" },
      { role: "scammer", cause: "silence" },
      { role: "user" },
      { role: "scammer", cause: "reply" },
      { role: "scammer", cause: "reply" },
    ]),
    { instruction: 0, silence: 1, other: 1 },
  );
});

// ── (b) G488 계수 — 빈 turnComplete 미계수 · 사용자 카운터 = 비어 있지 않은 사용자 flush ────────

test("[§78.3.4 G488 N1] 오디오 0 · 전사 0인 turnComplete만 빈 마감이다", () => {
  assert.equal(isEmptyTurnComplete({ audioSinceBoundary: false, scammerTextSinceBoundary: false }), true);
  assert.equal(isEmptyTurnComplete({ audioSinceBoundary: true, scammerTextSinceBoundary: false }), false);
  assert.equal(isEmptyTurnComplete({ audioSinceBoundary: false, scammerTextSinceBoundary: true }), false);
});

test("[§78.3.4 G488] 카운터는 비어 있지 않은 전사 flush만 센다(공백 flush 0)", () => {
  let c: TurnCounters = INITIAL_TURN_COUNTERS;
  c = countTranscriptFlush(c, "user", "여보세요");
  c = countTranscriptFlush(c, "user", "   ");
  c = countTranscriptFlush(c, "scammer", "네 고객님");
  c = countTranscriptFlush(c, "scammer", "");
  assert.deepEqual(c, { userTurns: 1, scammerTranscriptTurns: 1 });
  assert.deepEqual(INITIAL_TURN_COUNTERS, { userTurns: 0, scammerTranscriptTurns: 0 }, "입력을 바꾸지 않는다");
});

type LiveEvent =
  | { t: "audio" }
  | { t: "out"; text: string }
  | { t: "in"; text: string }
  | { t: "interrupted" }
  | { t: "turnComplete" };

/** `GeminiVoiceSession`의 flush · 경계 규칙을 따라 센다(판정은 제품 함수). 옛 규칙(모든 turnComplete +1)도 나란히 낸다. */
function countLive(events: LiveEvent[]) {
  let counters: TurnCounters = INITIAL_TURN_COUNTERS;
  let user = "";
  let scammer = "";
  let audio = false;
  let text = false;
  let boundaries = 0;
  let legacyScammerTurns = 0;
  for (const e of events) {
    if (e.t === "audio") audio = true;
    else if (e.t === "out") {
      scammer += e.text;
      if (e.text.trim()) text = true;
    } else if (e.t === "in") user += e.text;
    else if (e.t === "interrupted") {
      counters = countTranscriptFlush(counters, "scammer", scammer);
      scammer = "";
    } else {
      legacyScammerTurns += 1;
      const empty = isEmptyTurnComplete({ audioSinceBoundary: audio, scammerTextSinceBoundary: text });
      audio = false;
      text = false;
      counters = countTranscriptFlush(counters, "user", user);
      counters = countTranscriptFlush(counters, "scammer", scammer);
      user = "";
      scammer = "";
      if (!empty) boundaries += 1;
    }
  }
  return { counters, boundaries, legacyScammerTurns };
}

// 리뷰 Minor 1 — S1 §3.5의 실제 모양은 "`interrupted` 뒤 오디오 · 전사 없는 `turnComplete` **1개**"(3/3)다.
// 그 마감은 **끊긴 턴의 마감**이다: 끊기기 전에 오디오가 나갔으면 직전 경계 이후 내용이 있으므로 빈 마감이 아니다
// (경계 1 · 끊긴 조각 전사 1). 옛 규칙과 새 규칙이 이 모양에서는 같은 수를 낸다 — 차이는 아래 "진짜 빈 마감"에서 난다.
test("[§78.3.4 G488 N1] S1 모양(오디오 뒤 끊김 → turnComplete 1개)은 빈 마감이 아니다 — 끊긴 턴의 마감 1 · 조각 전사 1", () => {
  const sample: LiveEvent[] = [
    { t: "audio" },
    { t: "out", text: "안녕하세요 서울중앙지검" },
    { t: "turnComplete" }, // 오프닝
    { t: "in", text: "네" },
    { t: "audio" },
    { t: "out", text: "본인 확인을 위해" },
    { t: "interrupted" }, // 끼어들기 — 끊긴 조각 flush(사기범 전사 1)
    { t: "turnComplete" }, // S1: 76~229ms 뒤 오디오 · 전사 없는 마감 1개 — 끊긴 턴(오디오 있었음)의 마감
    { t: "in", text: "잘 모르겠는데요" },
    { t: "audio" },
    { t: "out", text: "괜찮습니다 천천히" },
    { t: "turnComplete" },
  ];
  const r = countLive(sample);
  assert.equal(r.counters.scammerTranscriptTurns, 3, "messages의 사기범 문서 수와 1:1(오프닝 · 끊긴 조각 · 응답)");
  assert.equal(r.counters.userTurns, 2);
  assert.equal(r.boundaries, 3, "끊긴 턴의 마감은 경계다(빈 마감 아님)");
  assert.equal(r.legacyScammerTurns, 3);
});

test("[§78.3.4 G488 N1 · 역방향 ⓒ] 진짜 빈 마감(직전 경계 이후 모델 소리 0 — 첫 오디오 전 끼어들기)은 세지 않는다 · 옛 규칙은 같은 샘플에서 어긋난다", () => {
  const sample: LiveEvent[] = [
    { t: "audio" },
    { t: "out", text: "안녕하세요 서울중앙지검" },
    { t: "turnComplete" }, // 오프닝
    { t: "in", text: "잠깐만요" },
    { t: "interrupted" }, // 모델이 아직 아무 소리도 내기 전에 끊김(조각 전사 0)
    { t: "turnComplete" }, // 오디오 · 전사 0 + 직전 경계 이후 내용 0 = 빈 마감
    { t: "in", text: " 누구시라고요" },
    { t: "audio" },
    { t: "out", text: "서울중앙지검 수사관입니다" },
    { t: "turnComplete" },
  ];
  const r = countLive(sample);
  console.log(
    `[G488 역방향 ⓒ] 사기범 전사 턴 ${r.counters.scammerTranscriptTurns} · 경계 ${r.boundaries} · 옛 규칙 ${r.legacyScammerTurns}`,
  );
  assert.equal(r.counters.scammerTranscriptTurns, 2, "messages의 사기범 문서 수와 1:1");
  assert.equal(r.boundaries, 2, "빈 마감은 경계가 아니다");
  assert.equal(r.legacyScammerTurns, 3);
  assert.notEqual(r.legacyScammerTurns, r.counters.scammerTranscriptTurns, "옛 규칙은 빈 마감을 세어 어긋난다(검사가 잡는다)");
});

test("[§78.3.4 G488] 지시 · 넛지로 생긴 사기범 턴은 사용자 카운터를 올리지 않는다", () => {
  const r = countLive([
    { t: "audio" },
    { t: "out", text: "상대가 말이 없어서요, 문자 보셨어요?" },
    { t: "turnComplete" },
  ]);
  assert.equal(r.counters.userTurns, 0);
});

// ── (c) G492 침묵 넛지 — 8초 · 주입당 1회 · 사용자 발화 시 취소 · cause:"silence" ────────────────

function runNudge(events: SilenceNudgeEvent[], start: SilenceNudgeState = INITIAL_SILENCE_NUDGE_STATE) {
  let state = start;
  const fired: number[] = [];
  for (const e of events) {
    const step = stepSilenceNudge(state, e);
    state = step.state;
    if (step.fire) fired.push(e.nowMs);
  }
  return { state, fired };
}

test("[§78.4.2 G492] 설계값: 8초 · 문면은 설계 표 원문", () => {
  assert.equal(SMS_MENTION_SILENCE_SEC, 8);
  assert.equal(SILENCE_NUDGE_TEXT, "(상대가 말이 없다. 방금 보낸 문자를 한 문장으로 언급하고 기다려라.)");
});

test("[§78.4.2 G492] 문자 안내 뒤 8초 침묵 · 모델 유휴면 넛지 1회 — 7.999초에는 없다", () => {
  const { fired } = runNudge([
    { type: "injected", delivery: "smsAnnounce", nowMs: 1000 },
    { type: "tick", nowMs: 8999, modelIdle: true, userSpeakingLocally: false },
    { type: "tick", nowMs: 9000, modelIdle: true, userSpeakingLocally: false },
  ]);
  assert.deepEqual(fired, [9000]);
});

test("[§78.4.2 G492] 주입 1건당 최대 1회 — 넛지 뒤 계속 침묵해도 다시 나가지 않는다", () => {
  const { fired } = runNudge([
    { type: "injected", delivery: "smsAnnounce", nowMs: 0 },
    { type: "tick", nowMs: 8000, modelIdle: true, userSpeakingLocally: false },
    { type: "tick", nowMs: 16000, modelIdle: true, userSpeakingLocally: false },
    { type: "tick", nowMs: 60000, modelIdle: true, userSpeakingLocally: false },
  ]);
  assert.deepEqual(fired, [8000]);
});

test("[§78.4.2 G492] 사용자 발화가 오면 취소된다", () => {
  const { fired, state } = runNudge([
    { type: "injected", delivery: "smsAnnounce", nowMs: 0 },
    { type: "userSpeech", nowMs: 3000 },
    { type: "tick", nowMs: 8000, modelIdle: true, userSpeakingLocally: false },
    { type: "tick", nowMs: 20000, modelIdle: true, userSpeakingLocally: false },
  ]);
  assert.deepEqual(fired, []);
  assert.equal(state.armedAt, null);
});

test("[§78.4.2 G492] 기한이 지나도 모델이 말하는 중이면 기다렸다가 유휴가 되는 첫 점검에서 1회", () => {
  const { fired } = runNudge([
    { type: "injected", delivery: "smsAnnounce", nowMs: 0 },
    { type: "tick", nowMs: 8000, modelIdle: false, userSpeakingLocally: false },
    { type: "tick", nowMs: 9000, modelIdle: false, userSpeakingLocally: false },
    { type: "tick", nowMs: 10000, modelIdle: true, userSpeakingLocally: false },
    { type: "tick", nowMs: 11000, modelIdle: true, userSpeakingLocally: false },
  ]);
  assert.deepEqual(fired, [10000]);
});

test("[§78.4.2 G492] 문자 안내만 대상 — 확인 권유 · 화자 전환은 넛지를 걸지 않는다", () => {
  for (const delivery of ["verifyAnnounce", "speakerSwitch"] as const) {
    const { fired } = runNudge([
      { type: "injected", delivery, nowMs: 0 },
      { type: "tick", nowMs: 30000, modelIdle: true, userSpeakingLocally: false },
    ]);
    assert.deepEqual(fired, [], delivery);
  }
});

test("[§78.4.2 G492] 새 문자 안내는 새 대기를 건다(주입 1건당 1회)", () => {
  const { fired } = runNudge([
    { type: "injected", delivery: "smsAnnounce", nowMs: 0 },
    { type: "tick", nowMs: 8000, modelIdle: true, userSpeakingLocally: false },
    { type: "injected", delivery: "smsAnnounce", nowMs: 20000 },
    { type: "tick", nowMs: 27999, modelIdle: true, userSpeakingLocally: false },
    { type: "tick", nowMs: 28000, modelIdle: true, userSpeakingLocally: false },
  ]);
  assert.deepEqual(fired, [8000, 28000]);
});

test("[§78.4.2 G492 · 리뷰 M3] 로컬 입력 레벨이 임계를 넘는 동안(참가자가 말하는 중)은 기한이 지나도 보류한다", () => {
  const { fired, state } = runNudge([
    { type: "injected", delivery: "smsAnnounce", nowMs: 0 },
    { type: "tick", nowMs: 8000, modelIdle: true, userSpeakingLocally: true },
    { type: "tick", nowMs: 9000, modelIdle: true, userSpeakingLocally: true },
  ]);
  assert.deepEqual(fired, []);
  assert.equal(state.armedAt, 0, "보류는 취소가 아니다 — 전사가 오면 userSpeech가 취소한다");
  const after = runNudge([{ type: "tick", nowMs: 10000, modelIdle: true, userSpeakingLocally: false }], state);
  assert.deepEqual(after.fired, [10000], "레벨이 내려가고 전사도 없으면(소음 등) 그때 1회");
});

test("[§78.4.2 G492 · 리뷰 M3] 발화 시작(레벨 꺼짐→켜짐)만 사용자 발화로 본다", () => {
  assert.equal(localSpeechStarted(false, true), true);
  assert.equal(localSpeechStarted(true, true), false, "이어지는 발화는 시작이 아니다");
  assert.equal(localSpeechStarted(true, false), false);
  assert.equal(localSpeechStarted(false, false), false);
});

test("[§78.4.2 G492] 로그: cause:\"silence\" 범주 · 숫자만(전사 0)", () => {
  assert.equal(LIVE_TURN_LOG_PREFIX, "[live-turn]");
  assert.equal(formatSilenceNudgeLog({ sinceInjectionMs: 8012.6 }), 'cause:"silence" sinceInjectionMs=8013');
});

// ── §78.4 T1 — 맥락 주입된 확인 권유의 예고 시점(§38.4 후보 E 순서 유지) ──────────────────────

test("[§78.4 T1 · 리뷰 M2] 예고 기록 대기는 맥락 주입된 확인 권유(announced)에서만 · 응답 진행 중이면 한 번 더 기다린다", () => {
  const base = { userTurns: 4, current: null, responseInProgress: false };
  assert.equal(deferredAnnouncePendingOnDispatch({ ...base, priority: "verify", phase: "announced" }), 4);
  assert.equal(
    deferredAnnouncePendingOnDispatch({ ...base, priority: "verify", phase: "announced", responseInProgress: true }),
    5,
  );
  assert.equal(deferredAnnouncePendingOnDispatch({ ...base, priority: "sms", phase: "announced" }), null);
  assert.equal(
    deferredAnnouncePendingOnDispatch({ ...base, priority: "verify", speakerSwitch: true, phase: "committed" }),
    null,
  );
  assert.equal(deferredAnnouncePendingOnDispatch({ ...base, priority: "verify", phase: "idle" }), null);
  assert.equal(shouldRecordDeferredAnnounce({ pendingAtUserTurns: 4, userTurns: 4 }), false);
  assert.equal(shouldRecordDeferredAnnounce({ pendingAtUserTurns: 4, userTurns: 5 }), true);
  assert.equal(shouldRecordDeferredAnnounce({ pendingAtUserTurns: null, userTurns: 9 }), false);
  assert.equal(isResponseInProgress({ modelResponding: false, userSpeechBuffered: false }), false);
  assert.equal(isResponseInProgress({ modelResponding: true, userSpeechBuffered: false }), true);
  assert.equal(isResponseInProgress({ modelResponding: false, userSpeechBuffered: true }), true);
});

type AnchorEvent =
  /** 확인 권유가 큐를 떠나 맥락 주입된다. `responseInProgress` = 그 순간의 턴 위상. */
  | { type: "inject"; responseInProgress: boolean }
  /** `turnComplete` — 사용자 발화 flush(있으면) → 사기범 응답 flush → 경계. `announce` = 그 응답에 예고가 실렸다. */
  | { type: "reply"; userFlush: boolean; announce: boolean };

/**
 * 화면의 기록 순서를 흉내 낸다(판정은 제품 함수). 반환: 2단계(commit)가 열린 응답에 예고가 실려 있었는가.
 * `mode`: `product` = 제품 그대로 · `ignorePhase` = 위상을 무시(리뷰 전 S3) · `dispatch` = 큐 이탈 시점 기록(S3 이전).
 */
function commitOpensAfterAnnounce(events: AnchorEvent[], mode: "product" | "ignorePhase" | "dispatch"): boolean | null {
  let scammerTurns = 3;
  let userTurns = 2;
  let anchor: number | null = null;
  let pending: number | null = null;
  for (const e of events) {
    if (e.type === "inject") {
      if (mode === "dispatch") {
        anchor = announceTurnsOnInstructionDispatch({ priority: "verify", phase: "announced", completedScammerTurns: scammerTurns, current: anchor });
      } else {
        pending = deferredAnnouncePendingOnDispatch({
          priority: "verify",
          phase: "announced",
          userTurns,
          responseInProgress: mode === "product" ? e.responseInProgress : false,
          current: pending,
        });
      }
      continue;
    }
    if (e.userFlush) {
      userTurns += 1;
      if (shouldRecordDeferredAnnounce({ pendingAtUserTurns: pending, userTurns })) {
        anchor = announceTurnsOnInstructionDispatch({ priority: "verify", phase: "announced", completedScammerTurns: scammerTurns, current: anchor });
        pending = null;
      }
    }
    scammerTurns += 1;
    const stage = nextVerifyOfferStage({ phase: "announced", announceTurnComplete: anchor !== null && scammerTurns > anchor });
    if (stage === "commit") return e.announce;
  }
  return null;
}

// ① 경계 시점 주입: 사기범 턴이 막 끝나 유휴 · 사용자 버퍼 빔 → 참가자 발화 → 그 응답에 예고.
const BOUNDARY: AnchorEvent[] = [
  { type: "inject", responseInProgress: false },
  { type: "reply", userFlush: true, announce: true },
];
// ② 응답 생성 중 주입: 참가자 발화 U0에 대한 응답 R0가 생성 중(U0는 아직 버퍼) → R0 마감(예고 없음) → U1 → R1에 예고.
const MID_RESPONSE: AnchorEvent[] = [
  { type: "inject", responseInProgress: true },
  { type: "reply", userFlush: true, announce: false },
  { type: "reply", userFlush: true, announce: true },
];

test("[§78.4 T1 · 리뷰 M2 역방향] 경계 시점 주입 · 응답 생성 중 주입 모두 2단계는 예고가 실린 응답 뒤에 열린다 — 위상을 무시하거나 큐 이탈 시점에 기록하면 응답 생성 중 주입에서 순서가 뒤집힌다", () => {
  const rows = {
    "경계 · 제품": commitOpensAfterAnnounce(BOUNDARY, "product"),
    "생성 중 · 제품": commitOpensAfterAnnounce(MID_RESPONSE, "product"),
    "생성 중 · 위상 무시": commitOpensAfterAnnounce(MID_RESPONSE, "ignorePhase"),
    "생성 중 · 큐 이탈 기록": commitOpensAfterAnnounce(MID_RESPONSE, "dispatch"),
  };
  console.log(`[M2 예고 시점] ${Object.entries(rows).map(([k, v]) => `${k}=${v}`).join(" · ")}`);
  assert.equal(rows["경계 · 제품"], true);
  assert.equal(rows["생성 중 · 제품"], true);
  assert.equal(rows["생성 중 · 위상 무시"], false, "검사가 리뷰 전 S3 결함을 실제로 잡는다");
  assert.equal(rows["생성 중 · 큐 이탈 기록"], false, "검사가 S3 이전 기록 시점을 실제로 잡는다");
});

// ── 화면 배선(소스 스캔) — `session/play/page.tsx`는 이 러너로 렌더할 수 없다 ────────────────────

const page = readFileSync("src/app/session/play/page.tsx", "utf8").replace(/\r\n/g, "\n")
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");

test("[§78.3.4 G488 배선] 사기범 턴 수는 비어 있지 않은 전사 flush 한 곳에서만 갱신된다(turnComplete +1 폐기)", () => {
  assert.equal(/scammerTurnsRef\.current \+= 1/.test(page), false, "옛 규칙(모든 turnComplete +1)이 남아 있으면 안 된다");
  assert.equal((page.match(/scammerTurnsRef\.current = /g) ?? []).length, 1);
  assert.ok(page.includes("turnCountersRef.current = countTranscriptFlush(turnCountersRef.current, role, text);"));
  assert.ok(page.includes("scammerTurnsRef.current = turnCountersRef.current.scammerTranscriptTurns;"));
  const handler = page.slice(page.indexOf("const handleScammerTurnComplete"), page.indexOf("const handleModelToolSmsDelivered"));
  assert.equal(handler.includes("setScammerTurns("), false);
  assert.equal((page.match(/setScammerTurns\(/g) ?? []).length, 1);
});

test("[§78.4 T1 배선] 드레인은 전달 방식을 실어 보내고 · 확인 권유는 다음 사용자 발화에서 예고 시점을 기록한다", () => {
  assert.ok(page.includes("const delivery = deliveryForInstruction(item);"));
  assert.ok(page.includes("setInstructionTurn((prev) => ({ text: item.text, seq: (prev?.seq ?? 0) + 1, delivery }));"));
  assert.ok(page.includes("pendingVerifyAnnounceUserTurnsRef.current = deferredAnnouncePendingOnDispatch({"));
  assert.ok(page.includes("responseInProgress: isResponseInProgress(liveTurnPhaseRef.current),"), "리뷰 M2 — 위상을 넘긴다");
  assert.ok(page.includes("turnPhaseRef={liveTurnPhaseRef}"), "리뷰 M2 — 세션 컴포넌트가 위상을 써 넣을 ref를 넘긴다");
  const transcript = page.slice(page.indexOf("const handleTranscriptTurn"), page.indexOf("const flushTranscript"));
  assert.ok(transcript.includes("shouldRecordDeferredAnnounce({"));
  assert.ok(transcript.includes("pendingVerifyAnnounceUserTurnsRef.current = null;"));
  assert.ok(
    page.includes('enqueueTurnInstruction(result.reconnectInstruction, "verify", { speakerSwitch: true });'),
    "재연결 지시는 화자 전환 첫 발화로 표시한다",
  );
  assert.ok(page.includes('enqueueTurnInstruction(result.announceInstruction, "sms");'), "문자 안내는 표시 없이(맥락 주입)");
  assert.ok(page.includes('enqueueTurnInstruction(result.announceInstruction, "verify");'), "확인 권유는 표시 없이(맥락 주입)");
});

// ⭐ T191(문자 도달 조건 · 설계 "백스톱" 표) — 문자 백스톱 넛지는 맥락 주입이되 침묵 넛지 대상이 아니다(문자가 아직 안 갔다).
test("[T191 smsNudge] 넛지 항목은 smsNudge로 · 맥락 주입으로 나가고 침묵 넛지를 걸지 않는다", () => {
  const delivery = deliveryForInstruction({ priority: "sms", smsNudge: true });
  assert.equal(delivery, "smsNudge");
  assert.equal(sendsAsContextInjection(delivery), true, "turnComplete:false(X5)");
  const step = stepSilenceNudge(INITIAL_SILENCE_NUDGE_STATE, { type: "injected", delivery, nowMs: 1000 });
  assert.equal(step.state.armedAt, null, "넛지는 '방금 보낸 문자' 침묵 넛지를 걸지 않는다");
  // 대조 — 문자 도착 안내는 침묵 넛지를 건다.
  const announce = stepSilenceNudge(INITIAL_SILENCE_NUDGE_STATE, {
    type: "injected",
    delivery: deliveryForInstruction({ priority: "sms" }),
    nowMs: 1000,
  });
  assert.equal(announce.state.armedAt, 1000);
});
