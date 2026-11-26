// §143 — GPT-SoVITS 복제 공급자 · 합성 토큰 · 데우기 판정표 · 통화 공급자 선택(RP3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sealGsvToken } from "../gsvToken";
import { buildCloneTtsCredentials, GsvVoiceProvider, isGsvVoiceId, type GsvDeps } from "../gsvProvider";
import { phaseFromModal, planWarm, WARM_DAILY_LIMIT, type WarmRecord } from "../warm";
import { getRealtimeProvider } from "../../realtime/provider";

const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="; // 시험 전용(0..31) — services/gsv/test_gsv.py와 같은 값
const REPO = join(__dirname, "..", "..", "..", "..");

function open(token: string): Record<string, unknown> {
  const raw = Buffer.from(token, "base64url");
  const d = createDecipheriv("aes-256-gcm", Buffer.from(KEY, "base64"), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(raw.length - 16));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString("utf8"));
}

test("[§143 토큰] Node 고정 벡터 = Python 시험의 NODE_VECTOR(언어 간 호환)", () => {
  const t = sealGsvToken({ kind: "synth", exp: 2000000000 }, KEY, Buffer.alloc(12));
  const py = readFileSync(join(REPO, "services", "gsv", "test_gsv.py"), "utf8");
  assert.ok(py.includes(`NODE_VECTOR = "${t}"`), "Python 시험의 벡터가 Node 출력과 다르다");
  assert.deepEqual(open(t), { kind: "synth", exp: 2000000000 });
});

function fakeDeps(prepare: unknown) {
  const files = new Map<string, Buffer>();
  const calls: { url: string; body: unknown }[] = [];
  const deps: GsvDeps & { readText(p: string): Promise<string | null> } = {
    endpoint: "https://x.modal.run",
    key: KEY,
    nowMs: () => 1_000_000,
    signedReadUrl: async (p) => `https://signed/${p}`,
    writeFile: async (p, d) => void files.set(p, d),
    listFiles: async (prefix) => [...files.keys()].filter((k) => k.startsWith(prefix)),
    deleteFile: async (p) => void files.delete(p),
    fetchJson: async (url, body) => {
      calls.push({ url, body });
      return prepare;
    },
    readText: async (p) => files.get(p)?.toString("utf8") ?? null,
  };
  return { deps, files, calls };
}

const OK_PREPARE = {
  ok: true,
  clips: [0, 1, 2, 3].map((i) => ({ line: i + 1, text: `글${i}`, sec: 4, wav: Buffer.from(`wav${i}`).toString("base64") })),
};

test("[§143 createClone] 참조 4개 + ref.json을 voices/{voiceId}/에 쓰고, prepare 토큰에 녹음 서명 URL을 암호문으로 싣는다", async () => {
  const { deps, files, calls } = fakeDeps(OK_PREPARE);
  const r = await new GsvVoiceProvider(deps).createClone({ sessionId: "s", uid: "u", voiceInputStoragePath: "users/u/sessions/s/voice_input.webm" });
  assert.equal(r.cloneStatus, "ready");
  assert.equal(r.isMock, false);
  assert.ok(isGsvVoiceId(r.voiceId));
  assert.deepEqual([...files.keys()].sort(), ["c0.wav", "c1.wav", "c2.wav", "c3.wav", "ref.json"].map((f) => `voices/${r.voiceId}/${f}`));
  assert.equal(calls[0].url, "https://x.modal.run/prepare");
  const body = calls[0].body as { token: string };
  assert.ok(!JSON.stringify(body).includes("signed/"), "서명 URL이 평문으로 나가면 안 된다");
  assert.equal(open(body.token).audioUrl, "https://signed/users/u/sessions/s/voice_input.webm");
});

test("[§143 createClone] prepare 실패(말소리 부족 등) = failed · 저장 0", async () => {
  const { deps, files } = fakeDeps({ ok: false, reason: "too_little_speech" });
  const r = await new GsvVoiceProvider(deps).createClone({ sessionId: "s", uid: "u", voiceInputStoragePath: "p" });
  assert.equal(r.cloneStatus, "failed");
  assert.equal(files.size, 0);
});

test("[§143.7 P2] deleteVoice = 그 voiceId 접두만 지운다 · gsv 아닌 id(옛 Mock)는 아무것도 안 지운다", async () => {
  const { deps, files } = fakeDeps(OK_PREPARE);
  const p = new GsvVoiceProvider(deps);
  const a = await p.createClone({ sessionId: "s", uid: "u", voiceInputStoragePath: "p" });
  const b = await p.createClone({ sessionId: "s2", uid: "u", voiceInputStoragePath: "p" });
  await p.deleteVoice("mock-voice-123");
  assert.equal(files.size, 10);
  await p.deleteVoice(a.voiceId);
  assert.equal(files.size, 5);
  assert.ok([...files.keys()].every((k) => k.startsWith(`voices/${b.voiceId}/`)));
});

test("[§143 RP3 · D4] 합성 토큰 — 참조 없음 · gsv 아님 = null, 있으면 25분 · 3,000자 · 금지어 · 참조 URL은 암호문 안", async () => {
  const { deps } = fakeDeps(OK_PREPARE);
  const { voiceId } = await new GsvVoiceProvider(deps).createClone({ sessionId: "s", uid: "u", voiceInputStoragePath: "p" });
  assert.equal(await buildCloneTtsCredentials("mock-voice-1", deps, []), null);
  assert.equal(await buildCloneTtsCredentials("gsv_00000000-0000-0000-0000-000000000000", deps, []), null);
  const c = await buildCloneTtsCredentials(voiceId, deps, ["국민은행"]);
  assert.ok(c);
  assert.equal(c.url, "wss://x.modal.run/ws");
  assert.ok(!c.token.includes("signed"));
  const body = open(c.token) as { kind: string; exp: number; charBudget: number; banned: string[]; refs: { url: string; text: string }[] };
  assert.equal(body.kind, "synth");
  assert.equal(body.exp, Math.floor((1_000_000 + 25 * 60_000) / 1000));
  assert.equal(body.charBudget, 3000);
  assert.deepEqual(body.banned, ["국민은행"]);
  assert.deepEqual(body.refs.map((r) => r.text), ["글0", "글1", "글2", "글3"]);
});

test("[§143.22 판정표 WT] 새 데우기는 하루 20회 · 5분 창 안 다시 부르기는 횟수 안 셈 · 1.5초 안 · 응답 대기 중이면 Modal 0", () => {
  const t = Date.UTC(2026, 10, 26, 1);
  const r1 = planWarm(undefined, t); // WT4
  assert.equal(r1.act, "call");
  const rec1 = (r1 as { record: WarmRecord }).record;
  assert.deepEqual({ ...rec1, inflightUntilMs: 0 }, { startAtMs: t, lastAtMs: t, day: "2026-11-26", count: 1, phase: "booting", inflightUntilMs: 0 });
  // WT5 — 첫 응답을 기다리는 중(새로고침 · 두 탭) = 기록된 단계만, Modal 요청은 늘 1개
  assert.deepEqual(planWarm(rec1, t + 5_000), { act: "cached", phase: "booting" });
  const answered: WarmRecord = { ...rec1, phase: "loading", inflightUntilMs: 0 };
  // WT2 — 1.5초 안
  assert.deepEqual(planWarm({ ...answered, lastAtMs: t + 9_000 }, t + 10_000), { act: "cached", phase: "loading" });
  // WT6 — 창 안 다시 부르기 = 호출 · 횟수 그대로
  const r2 = planWarm(answered, t + 12_000);
  assert.equal(r2.act, "call");
  assert.equal((r2 as { record: WarmRecord }).record.count, 1);
  assert.equal((r2 as { record: WarmRecord }).record.startAtMs, t);
  // 창(5분) 지나면 새 데우기 = 횟수 +1
  assert.equal((planWarm(answered, t + 5 * 60_000) as { record: WarmRecord }).record.count, 2);
  // WT3 — 새 데우기 20회째 다음은 거절 · 날짜 바뀌면 다시 센다 · 옛 기록(startAtMs 없음)은 새 데우기로
  const full: WarmRecord = { lastAtMs: t, day: "2026-11-26", count: WARM_DAILY_LIMIT };
  assert.deepEqual(planWarm(full, t + 200_000), { act: "refuse" });
  assert.equal((planWarm(full, t + 86_400_000) as { record: WarmRecord }).record.count, 1);
});

test("[§143.22] Modal /warm 응답 → 단계(phase 없는 옛 서비스 = 기동 끝 = ready)", () => {
  assert.equal(phaseFromModal(true, { ok: true, phase: "loading" }), "loading");
  assert.equal(phaseFromModal(true, { ok: true, phase: "warming" }), "warming");
  assert.equal(phaseFromModal(true, { ok: true }), "ready");
  assert.equal(phaseFromModal(true, { phase: "weird" }), "failed");
  assert.equal(phaseFromModal(false, null), "failed");
});

test("[§143 RP3 · RP5] clone 세션 = 합성 자격이 있고 Gemini 키가 있을 때만 gemini, 아니면 종전(mock)", () => {
  const before = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    assert.equal(getRealtimeProvider("family-accident-deepvoice", "clone", false, true).providerName, "gemini");
    assert.equal(getRealtimeProvider("family-accident-deepvoice", "clone", false, false).providerName, "mock");
    assert.equal(getRealtimeProvider("family-accident-deepvoice").providerName, "mock");
  } finally {
    if (before === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = before;
  }
});
