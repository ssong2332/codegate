// T192 C7(Architecture.md §79.22 (12) ② Minor 5 · ③ · ④) — P-H 프로브 집계 모듈. ⛔ 부작용 0(lib 로드 · argv · 네트워크 · 키 0)
// — `scripts/live-hangup-probe.mjs`는 import하면 lib 마커 검사 · argv 검사 · `main()`이 돌기 때문에 집계를 여기로 뺐다.
// 테스트: `scripts/hangup-probe-summary.test.mjs`(가짜 results). 묶음별 요약 합산은 `mergeBatchSummaries`로만 한다(손 합산 금지).
//
// ⛔ 힌트는 판정이 아니다 — 최종 분류는 §79.22 (7) 분류표 + (12) ③ (vi)로 사람이 한다(오탐 · 미탐 있음).

/** §79.22 (8) P-3 — 새 요구 · 결정 재촉 **힌트**(예: "보내 드릴게요"는 오탐). */
export const DEMAND_HINTS = ["불러", "말해", "알려", "보내", "이체", "송금", "입금", "옮겨", "바꾸", "준비", "설치", "눌러", "입력", "결정", "답하", "드릴게요"];
/** §79.22 (12) ③ — 비밀 유지 · 연락 차단 당부 **힌트**(분류 (vi) — 하지 말라는 말). */
export const SECRECY_HINTS = ["말하지 마", "알리지 마", "연락하지 마", "아무한테도", "아무에게도", "누구에게도", "다른 사람", "비밀", "신고하지 마"];

const hitsOf = (words, text) => words.filter((w) => (text ?? "").includes(w));
export const demandHints = (text) => hitsOf(DEMAND_HINTS, text);
export const secrecyHints = (text) => hitsOf(SECRECY_HINTS, text);

const isGoalScript = (r) => r.script === "goal" || r.script === "idle";
const endCallsOf = (r) => (r.calls ?? []).filter((c) => c.name === "end_call");

/**
 * 사기범 턴마다 — `secrecyHints` · `endCallInTurn`(직전 사기범 턴 뒤 ~ 이 턴 끝 사이에 `end_call`) · `afterFulfillment`
 * (그 턴 앞에 보낸 사용자 발화 수 ≥ 이행 발화 순번). 텍스트는 그대로 둔다(원문은 출력 파일에만 — 호출부 책임).
 */
export function annotateScammerTurns(result, { fulfillmentUserTurn }) {
  const out = [];
  let userCount = 0;
  let prevT = -Infinity;
  (result.turns ?? []).forEach((x, turnIdx) => {
    if (x.role === "user") {
      userCount += 1;
      return;
    }
    if (x.role !== "scammer") return;
    const endCallInTurn = endCallsOf(result).some((c) => c.t > prevT && c.t <= x.t);
    out.push({
      turnIdx,
      text: x.text ?? "",
      secrecyHints: secrecyHints(x.text),
      endCallInTurn,
      afterFulfillment: userCount >= fulfillmentUserTurn,
    });
    prevT = x.t;
  });
  return out;
}

/** §79.22 (8) P-4 — ⓒ1 · ⓒ2 관측 재료. `rawTexts`(대사)는 출력 파일에만 — 로그 줄은 `forLog`로 축약한다. */
export function summarizeC7(results, mode) {
  const endCalls = results.flatMap((r) => endCallsOf(r).map((c, k) => ({ r, c, k })));
  const goalFirst = results.filter(isGoalScript).map((r) => endCallsOf(r)[0]).filter(Boolean);
  return {
    calls: endCalls.length,
    preCallDemandHintCalls: endCalls.filter(({ c }) => (c.preCallDemandHints ?? []).length > 0).length,
    postResponseDemandHintCalls: results.filter((r) => (r.h2?.postResponseDemandHints ?? []).length > 0).length,
    promiseAtCallCount: goalFirst.filter((c) => c.promiseAtCall).length,
    goalFirstCalls: goalFirst.length,
    followUpUnansweredSessions: results.filter((r) => r.followUpDemandUnanswered === true).map((r) => ({ mode, index: r.index })),
    rawTexts: endCalls.map(({ r, c, k }) => ({
      index: r.index,
      mode,
      preCallText: c.preCallText,
      postResponseText: k === 0 ? (r.h2?.postResponseText ?? null) : null,
      userLineAtCall: c.userLineAtCall ?? null,
    })),
  };
}

/**
 * §79.22 (12) ③ ⓒ3 — goal · idle 대본의 이행 발화 뒤 사기범 응답 중 `end_call` 없는 응답(분모) · 그중 당부 힌트(ⓒ3) ·
 * 당부 + 작별 어휘(ⓒ3-b 후보 — "작별 · 마무리" 류 문장은 사람이 더한다) · 대조값(당부가 든 승인 뒤 전사).
 */
export function summarizeSecrecy(results, mode, { fulfillmentUserTurn, farewellWords }) {
  let afterFulfillmentTurns = 0;
  let noCallTurns = 0;
  let noCallWithSecrecyHint = 0;
  let noCallWithSecrecyAndFarewell = 0;
  const rawTexts = [];
  for (const r of results.filter(isGoalScript)) {
    for (const a of annotateScammerTurns(r, { fulfillmentUserTurn })) {
      if (!a.afterFulfillment) continue;
      afterFulfillmentTurns += 1;
      if (a.endCallInTurn) continue;
      noCallTurns += 1;
      if (a.secrecyHints.length === 0) continue;
      noCallWithSecrecyHint += 1;
      if (hitsOf(farewellWords, a.text).length > 0) noCallWithSecrecyAndFarewell += 1;
      rawTexts.push({ mode, index: r.index, turnIdx: a.turnIdx, text: a.text, endCallInTurn: false });
    }
  }
  const calledWithPost = results.filter((r) => endCallsOf(r).length > 0 && secrecyHints(r.h2?.postResponseText).length > 0);
  for (const r of calledWithPost) {
    rawTexts.push({ mode, index: r.index, turnIdx: null, text: r.h2.postResponseText, endCallInTurn: true });
  }
  return {
    afterFulfillmentTurns,
    noCallTurns,
    noCallWithSecrecyHint,
    noCallWithSecrecyAndFarewell,
    calledWithPostSecrecyHint: calledWithPost.length,
    rawTexts,
  };
}

/** H1 ~ H7 · 조기 끊김 · reason 분포 — 프로브 본체에 있던 집계를 그대로 옮겼다(동작 0 변경). */
export function summarizeHard(results, mode, { fulfillmentUserTurn }) {
  const called = results.filter((r) => (r.endCallCount ?? 0) > 0);
  const allCalls = results.flatMap((r) => r.calls ?? []);
  return {
    scriptDistribution: results.reduce((acc, r) => {
      const key = r.script ?? "error";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    sessionsWithError: results.filter((r) => r.error).length,
    sessionsWithEndCall: called.length,
    endCallTotal: allCalls.length,
    H1_preCallFarewell: { violations: allCalls.filter((c) => (c.preCallFarewell ?? []).length > 0).length, calls: allCalls.length },
    // ⭐ C6 리뷰 — H2 하한 집계는 accept 모드만. 오디오 통과 조건 = **그 턴 전체** `audioSec ≤ 6초`(정본 §79.4 H2).
    H2: mode === "accept"
      ? {
          samples: called.filter((r) => r.h2?.turnCompleteMs != null).length,
          within8000: called.filter((r) => r.h2?.turnCompleteMs != null && r.h2.turnCompleteMs <= 8000).length,
          audioLe6s: called.filter((r) => r.h2?.audioSec != null && r.h2.audioSec <= 6).length,
          sentencesLe2: called.filter((r) => r.h2?.sentences != null && r.h2.sentences <= 2).length,
          turnCompleteMs: called.map((r) => r.h2?.turnCompleteMs ?? null),
          audioSec: called.map((r) => r.h2?.audioSec ?? null),
          audioAfterResponseSecReference: called.map((r) => r.h2?.audioAfterResponseSec ?? null),
          sentences: called.map((r) => r.h2?.sentences ?? null),
          audioCriterion: "audioSec(그 턴 전체) <= 6초 — 정본 §79.4 H2",
        }
      : undefined,
    H3: mode !== "accept" && mode !== "idle"
      ? {
          samples: called.filter((r) => r.h3).length,
          farewellViolations: called.filter((r) => r.h3 && r.h3.farewellHits.length > 0).length,
          continued: called.filter((r) => r.h3?.continued).length,
        }
      : undefined,
    H4_recalls: results.map((r) => Math.max(0, (r.endCallCount ?? 0) - 1)),
    H5: mode === "accept"
      ? { samples: called.filter((r) => r.h5).length, zeroAudio: called.filter((r) => r.h5?.audioChunksIn10s === 0).length }
      : undefined,
    // idle 모드 승인 세션은 H5 **보조** 표본(하한 집계에 넣지 않는다).
    H5_auxiliary: mode === "idle"
      ? { samples: called.filter((r) => r.h5).length, zeroAudio: called.filter((r) => r.h5?.audioChunksIn10s === 0).length }
      : undefined,
    H7: mode === "idle"
      ? {
          sessions: results.filter((r) => !r.error).length,
          calledInIdleSegment: results.filter((r) => r.h7?.inIdleSegment).length,
          calledBeforeIdleSegment: results.filter((r) => r.h7 && !r.h7.inIdleSegment).length,
          notCalled: results.filter((r) => !r.error && (r.endCallCount ?? 0) === 0).length,
          reasons: results.filter((r) => r.h7).map((r) => r.h7.reason),
        }
      : undefined,
    H6_callRateByScript: Object.fromEntries(
      ["goal", "refuse", "silence", "idle"].map((s) => {
        const of = results.filter((r) => r.script === s);
        return [s, { sessions: of.length, called: of.filter((r) => (r.endCallCount ?? 0) > 0).length }];
      }),
    ),
    reasons: allCalls.map((c) => c.reason ?? null),
    userTurnsAtFirstCall: called.map((r) => r.calls[0].userTurnsSent),
    // C6 리뷰 — goal · idle 대본에서 첫 end_call이 이행 발화보다 앞이면 조기 끊김.
    earlyHangup: (() => {
      const goalCalled = called.filter(isGoalScript);
      const early = goalCalled.filter((r) => r.calls[0].userTurnsSent < fulfillmentUserTurn).length;
      return {
        fulfillmentUserTurn,
        goalSessionsWithCall: goalCalled.length,
        early,
        ratio: goalCalled.length > 0 ? Number((early / goalCalled.length).toFixed(3)) : null,
      };
    })(),
    // C6 리뷰 — reject 모드 refuse 대본 호출의 reason 분포(give_up이 기대값).
    refuseReasonDistribution:
      mode === "reject"
        ? results
            .filter((r) => r.script === "refuse")
            .flatMap((r) => r.calls ?? [])
            .reduce((acc, c) => {
              const key = c.reason ?? "missing";
              acc[key] = (acc[key] ?? 0) + 1;
              return acc;
            }, {})
        : undefined,
  };
}

/** 한 묶음(1회 실행)의 집계 — 프로브 본체가 메타(마커 · 스위치 · startIndex)를 앞에 붙인다. */
export function summarizeResults(results, mode, { fulfillmentUserTurn, farewellWords }) {
  return {
    sessionIndices: results.map((r) => r.index ?? null),
    ...summarizeHard(results, mode, { fulfillmentUserTurn }),
    c7: summarizeC7(results, mode),
    secrecy: summarizeSecrecy(results, mode, { fulfillmentUserTurn, farewellWords }),
  };
}

/** 로그 줄용 축약 — 대사(rawTexts)를 건수로 바꾼다(G170). */
export function forLog(summary) {
  const shrink = (block) => (block ? { ...block, rawTexts: `(${block.rawTexts.length}건 — 출력 파일에만)` } : block);
  return { ...summary, c7: shrink(summary.c7), secrecy: shrink(summary.secrecy) };
}

/** 합산하지 않고 같아야 하는 키(다르면 실패) · 합산 뒤 다시 계산하는 키. */
const SAME_KEYS = new Set(["fulfillmentUserTurn", "audioCriterion"]);
const RECOMPUTED_KEYS = new Set(["ratio"]);
const SKIP_KEYS = new Set(["mode", "n", "startIndex", "sessionIndices", "libMarkers", "endCallLiveForcedOn", "endCallLiveAvailableProduction", "limitations"]);

function mergeValue(a, b, key) {
  if (a === undefined || a === null) return b;
  if (b === undefined || b === null) return a;
  if (SAME_KEYS.has(key)) {
    if (a !== b) throw new Error(`mergeBatchSummaries: ${key} 값이 묶음마다 다르다(${a} ≠ ${b})`);
    return a;
  }
  if (RECOMPUTED_KEYS.has(key)) return null;
  if (typeof a === "number" && typeof b === "number") return a + b;
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (typeof a === "object" && typeof b === "object") {
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = mergeValue(a[k], b[k], k);
    return out;
  }
  throw new Error(`mergeBatchSummaries: ${key}를 합칠 수 없다(${typeof a} · ${typeof b})`);
}

/**
 * §79.22 (12) ④ — 묶음별 요약 합산. 수치 = 합 · 목록 = 이어 붙이기 · ⛔ 같은 `(mode, index)`가 두 번 나오면 실패
 * (`--start-index` 누락 신호 — 덮어쓰지 않는다). `earlyHangup.ratio`는 합산 뒤 다시 계산한다.
 */
export function mergeBatchSummaries(summaries) {
  if (!Array.isArray(summaries) || summaries.length === 0) throw new Error("mergeBatchSummaries: 요약이 0개다");
  const seen = new Set();
  const sessions = [];
  for (const s of summaries) {
    for (const index of s.sessionIndices ?? []) {
      const key = `${s.mode}:${index}`;
      if (seen.has(key)) throw new Error(`mergeBatchSummaries: 같은 (mode, index)가 두 번 들어왔다 — ${key}(--start-index 누락?)`);
      seen.add(key);
      sessions.push({ mode: s.mode, index });
    }
  }
  let merged = {};
  for (const s of summaries) {
    const body = Object.fromEntries(Object.entries(s).filter(([k]) => !SKIP_KEYS.has(k)));
    merged = mergeValue(merged, body, "");
  }
  if (merged.earlyHangup) {
    const { early, goalSessionsWithCall } = merged.earlyHangup;
    merged.earlyHangup.ratio = goalSessionsWithCall > 0 ? Number((early / goalSessionsWithCall).toFixed(3)) : null;
  }
  return { batches: summaries.length, modes: [...new Set(summaries.map((s) => s.mode))], sessions, ...merged };
}
