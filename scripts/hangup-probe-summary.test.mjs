// T192 C7(docs/Architecture.md §79.22 (12) ② Minor 5 · ③ · ④) — P-H 프로브 집계 모듈 회귀 테스트.
// 가짜 results 3벌(실호출 0 · 키 0): ⓐ 도구 앞 요구 1 · 승인 뒤 당부 1 · 약속 시점 1 ⓑ 미호출 + 후속 요구 미응답
// ⓒ 당부 + 작별 어휘 + 미호출. 묶음 합산은 mergeBatchSummaries로만 한다 — 같은 (mode, index) 중복은 실패해야 한다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEMAND_HINTS,
  SECRECY_HINTS,
  annotateScammerTurns,
  forLog,
  mergeBatchSummaries,
  summarizeResults,
} from "./lib/hangupProbeSummary.mjs";

const OPTS = { fulfillmentUserTurn: 5, farewellWords: ["끊겠", "이만", "안녕히", "통화 끝"] };

/** 사용자 · 사기범이 번갈아 오는 턴 목록(t = 1, 2, 3 …). `scammerTexts[i]`는 i+1번째 사용자 발화 뒤 사기범 응답. */
function turnsOf(scammerTexts, tStep = 10) {
  const turns = [];
  let t = 0;
  for (const text of scammerTexts) {
    t += tStep;
    turns.push({ role: "user", t, text: "u" });
    t += tStep;
    turns.push({ role: "scammer", t, text, audioSec: 1 });
  }
  return turns;
}

// ⓐ accept 묶음 1 — #1: 이행 뒤 호출(도구 앞 요구 힌트 · 승인 뒤 당부) · #2: 약속 시점 호출(사용자 발화 4).
const BATCH_A = [
  {
    index: 1,
    mode: "accept",
    script: "goal",
    turns: turnsOf(["s1", "s2", "s3", "s4", "주민번호 불러 주세요"]), // 5번째 사기범 턴 t=100
    calls: [
      {
        t: 95,
        name: "end_call",
        reason: "goal",
        preCallText: "주민번호 불러 주세요",
        preCallFarewell: [],
        preCallDemandHints: ["불러"],
        userTurnsSent: 5,
        promiseAtCall: false,
        userLineAtCall: "방금 말한 계좌로 전액 다 이체했어요",
      },
    ],
    endCallCount: 1,
    h2: {
      turnCompleteMs: 3000,
      audioSec: 4,
      audioAfterResponseSec: 1,
      sentences: 1,
      postResponseText: "다른 사람에게 말하지 마세요.",
      postResponseDemandHints: [],
    },
    h5: { audioChunksIn10s: 0 },
  },
  {
    index: 2,
    mode: "accept",
    script: "goal",
    turns: turnsOf(["s1", "s2", "s3", "알겠습니다"]),
    calls: [
      {
        t: 75,
        name: "end_call",
        reason: "goal",
        preCallText: "",
        preCallFarewell: [],
        preCallDemandHints: [],
        userTurnsSent: 4,
        promiseAtCall: true,
        userLineAtCall: "지금 바로 그 계좌로 보낼게요",
      },
    ],
    endCallCount: 1,
    h2: { turnCompleteMs: 9000, audioSec: 7, audioAfterResponseSec: 2, sentences: 3, postResponseText: "확인됐습니다.", postResponseDemandHints: [] },
    h5: { audioChunksIn10s: 2 },
  },
];
// ⓑ accept 묶음 2(--start-index 3) — #3: 미호출 · 이행 뒤 요구 반복 · 대본 소진.
const BATCH_B = [
  {
    index: 3,
    mode: "accept",
    script: "goal",
    turns: turnsOf(["s1", "s2", "s3", "s4", "주민번호 불러요", "빨리 불러요"]),
    calls: [],
    endCallCount: 0,
    followUpDemandUnanswered: true,
  },
];
// ⓒ accept 묶음 3(--start-index 4) — #4: 미호출 · 이행 뒤 당부 + 작별 어휘 1 · 당부만 1.
const BATCH_C = [
  {
    index: 4,
    mode: "accept",
    script: "goal",
    turns: turnsOf(["s1", "s2", "s3", "s4", "이제 아무한테도 말하지 마세요. 그럼 이만.", "다른 사람에게는 비밀로 해요"]),
    calls: [],
    endCallCount: 0,
    followUpDemandUnanswered: false,
  },
];

const sumA = () => ({ mode: "accept", n: 2, startIndex: 1, ...summarizeResults(BATCH_A, "accept", OPTS) });
const sumB = () => ({ mode: "accept", n: 1, startIndex: 3, ...summarizeResults(BATCH_B, "accept", OPTS) });
const sumC = () => ({ mode: "accept", n: 1, startIndex: 4, ...summarizeResults(BATCH_C, "accept", OPTS) });

test("힌트 상수 — 정본 목록(§79.22 (8) P-3 · (12) ③) 그대로", () => {
  assert.deepEqual(DEMAND_HINTS, ["불러", "말해", "알려", "보내", "이체", "송금", "입금", "옮겨", "바꾸", "준비", "설치", "눌러", "입력", "결정", "답하", "드릴게요"]);
  assert.deepEqual(SECRECY_HINTS, ["말하지 마", "알리지 마", "연락하지 마", "아무한테도", "아무에게도", "누구에게도", "다른 사람", "비밀", "신고하지 마"]);
});

test("annotateScammerTurns — endCallInTurn은 직전 사기범 턴 뒤 ~ 이 턴 끝 사이의 end_call · afterFulfillment는 사용자 발화 수 기준", () => {
  const a = annotateScammerTurns(BATCH_A[0], OPTS);
  assert.equal(a.length, 5);
  assert.deepEqual(a.map((x) => x.endCallInTurn), [false, false, false, false, true]);
  assert.deepEqual(a.map((x) => x.afterFulfillment), [false, false, false, false, true]);
  const c = annotateScammerTurns(BATCH_C[0], OPTS);
  assert.deepEqual(c[4].secrecyHints, ["말하지 마", "아무한테도"]);
});

test("ⓐ c7 — 호출 2 · 도구 앞 요구 힌트 1 · 약속 시점 1/2 · H1 0/2 · H2 2표본 중 8초 이내 1 · 6초 이하 1 · 2문장 이하 1 · 조기 끊김 1/2", () => {
  const s = sumA();
  assert.deepEqual(
    { ...s.c7, rawTexts: s.c7.rawTexts.length },
    { calls: 2, preCallDemandHintCalls: 1, postResponseDemandHintCalls: 0, promiseAtCallCount: 1, goalFirstCalls: 2, followUpUnansweredSessions: [], rawTexts: 2 },
  );
  assert.deepEqual(s.c7.rawTexts[1], { index: 2, mode: "accept", preCallText: "", postResponseText: "확인됐습니다.", userLineAtCall: "지금 바로 그 계좌로 보낼게요" });
  assert.deepEqual(s.H1_preCallFarewell, { violations: 0, calls: 2 });
  assert.equal(s.H2.samples, 2);
  assert.equal(s.H2.within8000, 1);
  assert.equal(s.H2.audioLe6s, 1);
  assert.equal(s.H2.sentencesLe2, 1);
  assert.deepEqual(s.H5, { samples: 2, zeroAudio: 1 });
  assert.deepEqual(s.earlyHangup, { fulfillmentUserTurn: 5, goalSessionsWithCall: 2, early: 1, ratio: 0.5 });
  assert.equal(s.H3, undefined, "accept 모드에는 H3이 없다");
  // ⓒ3 대조값 — 승인 뒤 전사에 당부 힌트 1(#1).
  assert.equal(s.secrecy.calledWithPostSecrecyHint, 1);
  assert.equal(s.secrecy.afterFulfillmentTurns, 1);
  assert.equal(s.secrecy.noCallTurns, 0);
});

test("ⓑ 미호출 + 후속 요구 미응답 — followUpUnansweredSessions = [(accept, 3)] · 당부 0", () => {
  const s = sumB();
  assert.deepEqual(s.c7.followUpUnansweredSessions, [{ mode: "accept", index: 3 }]);
  assert.equal(s.c7.calls, 0);
  assert.deepEqual(
    { ...s.secrecy, rawTexts: s.secrecy.rawTexts.length },
    { afterFulfillmentTurns: 2, noCallTurns: 2, noCallWithSecrecyHint: 0, noCallWithSecrecyAndFarewell: 0, calledWithPostSecrecyHint: 0, rawTexts: 0 },
  );
});

test("ⓒ 당부 + 작별 어휘 + 미호출 — ⓒ3 2 · ⓒ3-b 후보 1(⑪ 모양)", () => {
  const s = sumC();
  assert.deepEqual(
    { ...s.secrecy, rawTexts: s.secrecy.rawTexts.length },
    { afterFulfillmentTurns: 2, noCallTurns: 2, noCallWithSecrecyHint: 2, noCallWithSecrecyAndFarewell: 1, calledWithPostSecrecyHint: 0, rawTexts: 2 },
  );
  assert.equal(s.secrecy.rawTexts[0].text, "이제 아무한테도 말하지 마세요. 그럼 이만.");
});

test("mergeBatchSummaries — 묶음 3개 합 · 목록 이어 붙이기 · 조기 끊김 비율 다시 계산", () => {
  const m = mergeBatchSummaries([sumA(), sumB(), sumC()]);
  assert.equal(m.batches, 3);
  assert.deepEqual(m.sessions, [1, 2, 3, 4].map((index) => ({ mode: "accept", index })));
  assert.deepEqual(
    { ...m.c7, rawTexts: m.c7.rawTexts.length },
    {
      calls: 2,
      preCallDemandHintCalls: 1,
      postResponseDemandHintCalls: 0,
      promiseAtCallCount: 1,
      goalFirstCalls: 2,
      followUpUnansweredSessions: [{ mode: "accept", index: 3 }],
      rawTexts: 2,
    },
  );
  assert.deepEqual(
    { ...m.secrecy, rawTexts: m.secrecy.rawTexts.length },
    { afterFulfillmentTurns: 5, noCallTurns: 4, noCallWithSecrecyHint: 2, noCallWithSecrecyAndFarewell: 1, calledWithPostSecrecyHint: 1, rawTexts: 3 },
  );
  assert.equal(m.sessionsWithEndCall, 2);
  assert.deepEqual(m.H6_callRateByScript.goal, { sessions: 4, called: 2 });
  assert.deepEqual(m.earlyHangup, { fulfillmentUserTurn: 5, goalSessionsWithCall: 2, early: 1, ratio: 0.5 });
  assert.deepEqual(m.H5, { samples: 2, zeroAudio: 1 });
  assert.deepEqual(m.scriptDistribution, { goal: 4 });
});

test("mergeBatchSummaries 역검증 — 같은 (mode, index)가 두 번이면 실패(--start-index 누락) · 다른 mode의 같은 index는 통과", () => {
  assert.throws(() => mergeBatchSummaries([sumA(), sumA()]), /같은 \(mode, index\)가 두 번/);
  assert.throws(() => mergeBatchSummaries([sumB(), { ...sumC(), sessionIndices: [3] }]), /accept:3/);
  const reject = { mode: "reject", n: 1, startIndex: 1, ...summarizeResults([{ index: 1, mode: "reject", script: "goal", turns: [], calls: [], endCallCount: 0 }], "reject", OPTS) };
  const m = mergeBatchSummaries([sumA(), reject]);
  assert.deepEqual(m.modes, ["accept", "reject"]);
  assert.equal(m.sessions.length, 3);
  assert.throws(() => mergeBatchSummaries([]), /0개/);
  // 같아야 하는 키가 다르면 실패(fulfillmentUserTurn).
  const other = { mode: "accept", n: 1, startIndex: 9, ...summarizeResults([], "accept", { ...OPTS, fulfillmentUserTurn: 6 }) };
  assert.throws(() => mergeBatchSummaries([sumA(), other]), /fulfillmentUserTurn/);
});

test("forLog — 로그 줄에는 대사 0(rawTexts는 건수로)", () => {
  const line = JSON.stringify(forLog(sumC()));
  assert.equal(line.includes("아무한테도 말하지"), false);
  assert.match(line, /2건 — 출력 파일에만/);
});

test("프로브 본체 배선 — 집계 모듈을 import하고 힌트 · 집계를 다시 정의하지 않는다 · FAREWELL_WORDS는 본체에 남는다", () => {
  const probe = readFileSync(new URL("./live-hangup-probe.mjs", import.meta.url), "utf8");
  assert.match(probe, /from "\.\/lib\/hangupProbeSummary\.mjs"/);
  assert.equal(/const DEMAND_HINTS\s*=|const SECRECY_HINTS\s*=/.test(probe), false, "본체가 힌트 상수를 다시 정의했다");
  assert.match(probe, /\.\.\.summarizeResults\(results, mode,/);
  assert.match(probe, /forLog\(summary\)/);
  assert.match(probe, /export const FAREWELL_WORDS = \[/);
});
