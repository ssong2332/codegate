// §143.22 — 링크 열면 미리 켜기 · 받는 사람 '목소리 준비 중' 대기 화면: 판정표 WW · 제어기(요청 1개 · 2초 간격 · 150초) · 배선.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WARM_POLL_INTERVAL_MS,
  WARM_READY_FRESH_MS,
  WARM_STAGES,
  WARM_WAIT_LIMIT_MS,
  createCloneWarmup,
  decideWarmWait,
  needsFreshWarmCheck,
  warmStageIndex,
  type WarmPhase,
  type WarmSnapshot,
} from "./cloneWarmup.ts";
import { CLONE_TTS_READY_TIMEOUT_MS } from "./cloneTts.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test("[§143.22 판정표 WW] 다음에 할 일 — ready · off = 벨로 · failed · 150초 = 다시 시도 · 나머지 = 기다림", () => {
  assert.equal(decideWarmWait("ready", 0), "advance"); // WW1
  assert.equal(decideWarmWait("ready", 999_000), "advance"); // WW1이 WW4보다 먼저
  assert.equal(decideWarmWait("off", 0), "advance"); // WW2
  assert.equal(decideWarmWait("failed", 0), "give-up"); // WW3
  for (const p of ["booting", "loading", "warming"] as WarmPhase[]) {
    assert.equal(decideWarmWait(p, WARM_WAIT_LIMIT_MS - 1), "wait"); // WW5
    assert.equal(decideWarmWait(p, WARM_WAIT_LIMIT_MS), "give-up"); // WW4
  }
  assert.equal(WARM_WAIT_LIMIT_MS, CLONE_TTS_READY_TIMEOUT_MS, "대기 상한 = 연결 화면 CW3 150초(사용자 결정)");
});

test("[§143.22] 단계 = 서버 phase 순서 그대로(서버 켜기 → 모델 → 목소리 엔진 → 완료) · 서버 phase 값과 같은 이름", () => {
  assert.deepEqual(WARM_STAGES.map((s) => s.phase), ["booting", "loading", "warming", "ready"]);
  assert.deepEqual([0, 1, 2, 3], (["booting", "loading", "warming", "ready"] as WarmPhase[]).map(warmStageIndex));
  const server = read("functions/src/voice/warm.ts");
  const union = server.match(/export type WarmPhase = ([^;]+);/)![1];
  const client = read("src/lib/api/warmCloneEngine.ts").match(/export type CloneWarmPhase = ([^;]+);/)![1];
  assert.equal(client, union, "서버 · 클라 phase 값이 갈라졌다");
  assert.equal(read("src/lib/realtime/cloneWarmup.ts").match(/export type WarmPhase = ([^;]+);/)![1], union);
});

function harness(answers: WarmPhase[]) {
  let t = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  const sleeps: number[] = [];
  const w = createCloneWarmup({
    call: async () => {
      calls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      t += 1_000; // 서버 응답 1초
      inFlight -= 1;
      return answers.length > 1 ? answers.shift()! : answers[0];
    },
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
  });
  const seen: WarmPhase[] = [];
  w.subscribe((s) => seen.push(s.phase));
  const settle = async () => {
    for (let i = 0; i < 2000 && w.get().decision === "wait"; i++) await new Promise((r) => setImmediate(r));
  };
  return { w, seen, sleeps, settle, stats: () => ({ calls, maxInFlight }) };
}

test("[§143.22 제어기] 단계를 차례로 받고 ready에서 멈춘다 · 서버 요청은 늘 1개 · 2초 간격 · start 두 번 = 한 번", async () => {
  const h = harness(["booting", "loading", "loading", "warming", "ready"]);
  h.w.start();
  h.w.start(); // 같은 링크 다시 들어옴 · 동의 때 다시 부름
  await h.settle();
  assert.deepEqual(h.seen, ["booting", "loading", "loading", "warming", "ready"]);
  assert.equal(h.w.get().decision, "advance");
  assert.deepEqual(h.stats(), { calls: 5, maxInFlight: 1 });
  assert.ok(h.sleeps.every((ms) => ms === WARM_POLL_INTERVAL_MS));
  h.w.start(); // 끝난 뒤 start = 아무것도 안 함
  await h.settle();
  assert.equal(h.stats().calls, 5);
});

test("[§143.22 제어기] 150초 지나면 give-up → 다시 시도 = 시간 새로 · 다시 묻는다", async () => {
  const h = harness(["loading"]);
  h.w.start();
  await h.settle();
  const s = h.w.get();
  assert.equal(s.decision, "give-up");
  assert.ok(s.answeredAtMs - s.startedAtMs >= WARM_WAIT_LIMIT_MS);
  const before = h.stats().calls;
  h.w.retry();
  assert.equal(h.w.get().phase, "booting");
  assert.equal(h.w.get().answered, false);
  await new Promise((r) => setImmediate(r));
  assert.ok(h.stats().calls > before);
  h.w.stop();
});

test("[§143.22 제어기] failed가 와도 표시 단계는 마지막 실제 단계(어디서 멈췄는지)", async () => {
  const h = harness(["booting", "loading", "failed"]);
  h.w.start();
  await h.settle();
  assert.equal(h.w.get().decision, "give-up");
  assert.equal(h.w.get().phase, "failed");
  assert.equal(h.w.get().stage, "loading");
  assert.match(read("src/components/CloneWarmWait.tsx"), /warmStageIndex\(snap\.stage\)/);
});

test("[§143.22 제어기] off(복제 목소리 아님 · 미설정)면 한 번 묻고 끝 — 대기 화면 없이 종전 흐름", async () => {
  const h = harness(["off"]);
  h.w.start();
  await h.settle();
  assert.deepEqual(h.stats(), { calls: 1, maxInFlight: 1 });
  assert.equal(h.w.get().decision, "advance");
});

test("[§143.22] 동의 순간 다시 확인 — give-up · 4분 넘은 ready만", () => {
  const base: WarmSnapshot = { phase: "ready", stage: "ready", decision: "advance", startedAtMs: 0, answered: true, answeredAtMs: 1_000 };
  assert.equal(needsFreshWarmCheck(base, 1_000 + WARM_READY_FRESH_MS - 1), false);
  assert.equal(needsFreshWarmCheck(base, 1_000 + WARM_READY_FRESH_MS), true); // Modal scaledown 300초보다 앞
  assert.equal(needsFreshWarmCheck({ ...base, phase: "loading", decision: "give-up" }, 2_000), true);
  assert.equal(needsFreshWarmCheck({ ...base, phase: "off" }, 10 * WARM_READY_FRESH_MS), false);
  assert.equal(needsFreshWarmCheck({ ...base, phase: "loading", decision: "wait" }, 2_000), false);
  assert.ok(WARM_READY_FRESH_MS < 300_000);
});

test("[§143.22 배선] 링크 화면 — 열자마자 링크 토큰으로 켠다 · 동의 뒤 준비 전이면 벨 대신 대기 화면 · 동의 전 문구", () => {
  const page = read("src/app/challenge/join/page.tsx");
  assert.match(page, /call: \(\) => warmCloneEngineByLink\(token\)/);
  assert.match(page, /useEffect\(\(\) => \{\n\s*if \(!warmup\) return;\n\s*warmup\.start\(\);/, "링크를 열면(동의 전) 바로 켜야 한다");
  assert.doesNotMatch(page, /warmCloneEngine\(result\.sessionId\)/, "동의 뒤에야 켜던 옛 호출이 남았다");
  const consent = page.slice(page.indexOf("const handleConsent = async"), page.indexOf("const handleSubmitReport"));
  const waitAt = consent.indexOf("setVoiceWait(true)");
  const pushAt = consent.indexOf('router.push(channel === "messenger"');
  assert.ok(waitAt > 0 && waitAt < pushAt, "준비 전이면 벨(/session/play)로 가기 전에 대기 화면");
  assert.match(consent, /warmup\.get\(\)\.decision !== "advance"/);
  assert.ok(consent.indexOf("needsFreshWarmCheck(") < consent.indexOf("await consentChallenge("), "다시 확인은 동의 처리와 나란히");
  assert.match(page, /<CloneWarmWait[\s\S]*onReady=\{\(\) => router\.push\("\/session\/play"\)\}/);
  assert.doesNotMatch(page, /동의 전에는 아무것도\s*시작되지 않아요/, "서버를 미리 켜므로 '아무것도'는 사실이 아니다");
  assert.match(page, /동의 전에는 전화가 오지\s*않고, 어떤 목소리도 재생되지 않아요/);
});

test("[§143.22 배선] 대기 화면 — 실제 단계 · aria-live · 다시 시도 · 나가기 · 가짜 진행 막대 0 · 공용 모션만", () => {
  const ui = read("src/components/CloneWarmWait.tsx");
  assert.match(ui, /WARM_STAGES\.map/);
  assert.match(ui, /role="status" aria-live="polite"/);
  assert.match(ui, /onClick=\{\(\) => warmup\.retry\(\)\}>\s*다시 시도/);
  assert.match(ui, /onClick=\{onExit\}>\s*나가기/);
  assert.doesNotMatch(ui, /progressbar|width: `\$\{|%`/, "진행률(%) 막대는 쓰지 않는다 — 서버가 준 단계만");
  assert.doesNotMatch(ui, /animate-|@keyframes|transition-\[/, "모션은 공용 loading-dot · motion-reveal(reduced-motion 처리됨)만");
  assert.match(ui, /aria-current=\{active \? "step"/);
});
