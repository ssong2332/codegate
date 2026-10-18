import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_LIVE_LATENCY_STATE,
  buildCallSetupRecord,
  formatLatencyLine,
  markCallSetup,
  markCredentialsPrefetched,
  noteModelAudio,
  noteSentTurn,
  noteToolCall,
  noteToolResponseSent,
  noteTurnEnd,
  readCallSetupMarks,
  resetCallSetupMarks,
  summarizeLatency,
  type LiveLatencyTurnRecord,
} from "./liveLatency.ts";

test("[§71.6] 오프닝: 보낸 시각 → 첫 오디오 도착이 firstAudioMs다", () => {
  let s = noteSentTurn(INITIAL_LIVE_LATENCY_STATE, "opening", 1000);
  s = noteModelAudio(s, { nowMs: 1900, audioMs: 300, lastLoudAt: null });
  s = noteModelAudio(s, { nowMs: 1950, audioMs: 400, lastLoudAt: null });
  const { record } = noteTurnEnd(s, { nowMs: 9000, endedBy: "turnComplete" });
  assert.deepEqual(record, {
    type: "turn",
    seq: 1,
    anchor: "opening",
    firstAudioMs: 900,
    toolCalls: 0,
    toolWaitMs: 0,
    audioMs: 700,
    endedBy: "turnComplete",
  });
});

test("[§71.6] 음성 턴: 앵커는 직전 턴 끝 이후의 로컬 RMS 마지막 문턱 초과 시각이다", () => {
  let s = noteSentTurn(INITIAL_LIVE_LATENCY_STATE, "opening", 0);
  s = noteModelAudio(s, { nowMs: 900, audioMs: 1000, lastLoudAt: null });
  s = noteTurnEnd(s, { nowMs: 5000, endedBy: "turnComplete" }).state;
  s = noteModelAudio(s, { nowMs: 8200, audioMs: 500, lastLoudAt: 7000 });
  const { record } = noteTurnEnd(s, { nowMs: 12000, endedBy: "turnComplete" });
  assert.equal(record?.anchor, "voice");
  assert.equal(record?.firstAudioMs, 1200);
  assert.equal(record?.seq, 2);
});

test("[§71.6] 직전 턴 끝보다 이른 RMS 값은 앵커가 아니다(이전 발화가 다음 턴에 묻어오지 않게)", () => {
  let s = noteTurnEnd(noteModelAudio(INITIAL_LIVE_LATENCY_STATE, { nowMs: 100, audioMs: 1, lastLoudAt: null }), {
    nowMs: 5000,
    endedBy: "turnComplete",
  }).state;
  s = noteModelAudio(s, { nowMs: 6000, audioMs: 100, lastLoudAt: 4000 });
  const { record } = noteTurnEnd(s, { nowMs: 7000, endedBy: "turnComplete" });
  assert.equal(record?.anchor, "none");
  assert.equal(record?.firstAudioMs, null);
});

test("[§71.6] 보낸 텍스트와 음성이 둘 다 있으면 늦은 쪽이 앵커다", () => {
  let s = noteSentTurn(INITIAL_LIVE_LATENCY_STATE, "text", 3000);
  s = noteModelAudio(s, { nowMs: 4000, audioMs: 10, lastLoudAt: 2000 });
  assert.equal(noteTurnEnd(s, { nowMs: 5000, endedBy: "turnComplete" }).record?.anchor, "text");
  let v = noteSentTurn(INITIAL_LIVE_LATENCY_STATE, "instruction", 1000);
  v = noteModelAudio(v, { nowMs: 4000, audioMs: 10, lastLoudAt: 2500 });
  assert.equal(noteTurnEnd(v, { nowMs: 5000, endedBy: "turnComplete" }).record?.anchor, "voice");
});

test("[§71.6] 도구 턴: 도구 대기(toolCall → toolResponse)를 따로 합산하고 firstAudioMs에는 포함된다", () => {
  let s = noteToolCall(INITIAL_LIVE_LATENCY_STATE, { nowMs: 1900, lastLoudAt: 1000 });
  s = noteToolResponseSent(s, 3900);
  s = noteModelAudio(s, { nowMs: 4500, audioMs: 2000, lastLoudAt: 1000 });
  const { record } = noteTurnEnd(s, { nowMs: 9000, endedBy: "turnComplete" });
  assert.equal(record?.anchor, "voice");
  assert.equal(record?.toolCalls, 1);
  assert.equal(record?.toolWaitMs, 2000);
  assert.equal(record?.firstAudioMs, 3500);
});

test("[§71.6] 오디오도 도구도 없던 턴(끊긴 직후의 빈 turnComplete)은 레코드를 내지 않는다", () => {
  const out = noteTurnEnd(noteSentTurn(INITIAL_LIVE_LATENCY_STATE, "text", 10), { nowMs: 20, endedBy: "turnComplete" });
  assert.equal(out.record, null);
  assert.equal(out.state.seq, 0);
  assert.equal(out.state.lastSend, null);
});

test("[§71.6] 요약: 앵커별 n · 중앙값 · 최댓값, firstAudioMs가 없는 턴은 집계에서 뺀다", () => {
  const rec = (anchor: LiveLatencyTurnRecord["anchor"], firstAudioMs: number | null): LiveLatencyTurnRecord => ({
    type: "turn",
    seq: 1,
    anchor,
    firstAudioMs,
    toolCalls: 0,
    toolWaitMs: 0,
    audioMs: 0,
    endedBy: "turnComplete",
  });
  const summary = summarizeLatency([rec("voice", 1000), rec("voice", 3000), rec("voice", 1200), rec("opening", 900), rec("none", null)]);
  assert.deepEqual(summary, {
    type: "summary",
    turns: 5,
    byAnchor: { voice: { n: 3, medianMs: 1200, maxMs: 3000 }, opening: { n: 1, medianMs: 900, maxMs: 900 } },
  });
});

test("[§71.6 P-0] 준비 구간 레코드: 표시 순서대로 차이를 계산하고 빠진 표시는 null이다", () => {
  resetCallSetupMarks();
  markCallSetup("accept", 0);
  markCredentialsPrefetched(true);
  markCallSetup("credentialsReady", 120);
  markCallSetup("mount", 150);
  markCallSetup("micReady", 400);
  markCallSetup("connectResolved", 1900);
  markCallSetup("openingSent", 1905);
  markCallSetup("firstAudio", 2800);
  markCallSetup("firstAudio", 9999); // 두 번째 값은 무시한다(첫 오디오는 1회)
  const record = buildCallSetupRecord(readCallSetupMarks(), { baseLatencySec: 0.0107, outputLatencySec: undefined });
  assert.deepEqual(record, {
    type: "setup",
    credentialsPrefetched: true,
    credentialSource: null, // 출처를 안 찍은 호출(1인자) — 종전 호출과 호환
    acceptToCredentialsMs: 120,
    credentialsToMountMs: 30,
    mountToMicMs: 250,
    micToConnectMs: 1500,
    connectToOpeningSentMs: 5,
    openingSentToFirstAudioMs: 895,
    totalMs: 2800,
    outputBaseLatencyMs: 11,
    outputLatencyMs: null,
  });
  resetCallSetupMarks();
  assert.deepEqual(readCallSetupMarks(), {});
});

/** setup 레코드 로그 줄의 문자열 필드 — 종류 문자열만 허용(식별자 · 전사 0). */
function setupStringFields(record: Record<string, unknown>): string[] {
  const parsed = JSON.parse(formatLatencyLine("gemini-3.8-live", record as never)) as Record<string, unknown>;
  return Object.entries(parsed)
    .filter(([, value]) => typeof value === "string")
    .map(([key]) => key)
    .sort();
}

test("[§71.6 G432 · reviewer m3] setup 레코드에 credentialSource(종류 문자열)가 실리고, 문자열 필드는 출처 · 모델 · 종류뿐이다", () => {
  for (const source of ["settled", "inflight", "mint"] as const) {
    resetCallSetupMarks();
    markCallSetup("accept", 0);
    markCredentialsPrefetched(source !== "mint", source);
    markCallSetup("credentialsReady", 50);
    const record = buildCallSetupRecord(readCallSetupMarks(), {});
    assert.equal(record.credentialSource, source);
    assert.equal(record.credentialsPrefetched, source !== "mint");
    assert.deepEqual(setupStringFields(record), ["credentialSource", "model", "type"]);
  }
  resetCallSetupMarks();
});

test("[§71.6 G432 역검증] setup 레코드에 식별자 문자열을 섞은 사본은 문자열 필드 검사에서 걸린다", () => {
  resetCallSetupMarks();
  markCredentialsPrefetched(true, "inflight");
  const record = { ...buildCallSetupRecord(readCallSetupMarks(), {}), sessionId: "s1" };
  assert.deepEqual(setupStringFields(record), ["credentialSource", "model", "sessionId", "type"]);
  resetCallSetupMarks();
});

test("[§71.6 G432] 로그 줄에 실리는 문자열 값은 모델명 · 종류 · 앵커 · 종료 사유뿐이다(전사 · 식별자 0)", () => {
  let s = noteSentTurn(INITIAL_LIVE_LATENCY_STATE, "text", 0);
  s = noteModelAudio(s, { nowMs: 10, audioMs: 10, lastLoudAt: null });
  const { record } = noteTurnEnd(s, { nowMs: 20, endedBy: "interrupted" });
  assert.ok(record);
  const parsed = JSON.parse(formatLatencyLine("gemini-3.8-live", record)) as Record<string, unknown>;
  const stringKeys = Object.entries(parsed)
    .filter(([, value]) => typeof value === "string")
    .map(([key]) => key)
    .sort();
  assert.deepEqual(stringKeys, ["anchor", "endedBy", "model", "type"]);
});
