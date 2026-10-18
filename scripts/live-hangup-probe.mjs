#!/usr/bin/env node
// T192 PR B — P-H 프로브(Architecture.md §79.4): 사기범의 먼저 끊기(`end_call` · BLOCKING)가 실제 3.8 Live에서
// "승인 뒤에만 작별"하는가를 잰다. ⛔ 측정 전용 — 앱 코드를 바꾸지 않는다.
//
// 방법(§79.4): 새 `functions/lib`의 `GeminiRealtimeProvider` **기본 생성자**(= 운영값 `END_CALL_LIVE_AVAILABLE`)로
// 단기 토큰을 받는다 → 토큰에 고정된 setup(TOOL 문면 · `end_call` 선언)으로 Node에서 Live 세션을 연다 → 사용자 발화는
// 텍스트 턴(`turnComplete:true` — 앱의 타이핑 경로)으로 대본을 보낸다. 콜러블 `requestScammerHangup`은 **응답 모사**다
// (승인/거절을 실행 모드가 고른다 · 문면은 서버 상수 그대로 — `functions/lib/scammerHangup/guidance.js`).
// 하네스 형태는 `scripts/live-turn-probe.mjs`와 같다(키 읽기 · `createRequire` · 이벤트 대기).
//
// ⛔ API 키는 functions/.secret.local 의 `GEMINI_API_KEY=`(첫 값)를 메모리에서만 쓴다 — 어떤 출력·파일에도 쓰지 않는다.
//
// 사용법(저장소 루트): npm --prefix functions run build 뒤
//   node scripts/live-hangup-probe.mjs <accept|reject|silence> <n> [--out <dir>]
//     accept  — 목적 달성 대본(ⓐ) · 첫 end_call에 accepted(재호출은 already_accepted) → H1 · H2 · H4 · H5 · H6ⓐ
//     reject  — 홀수 회차 목적 달성 대본 · 짝수 회차 거절 반복 대본(ⓑ) · end_call마다 too_early → H1 · H3 · H4 · H6ⓐⓑ
//     silence — 침묵 · 소강 대본(ⓒ) · end_call이 오면 too_early → H6ⓒ(호출 0이 정상)
// 출력: <out>/hangup-<mode>-<i>-<ts>.json(세션별 원시) + <out>/hangup-<mode>-summary-<ts>.json
//
// 한계(보고서 기재): 사용자 발화는 오디오가 아니라 텍스트 턴이다 · 콜러블은 모사(서버 판정 0 — 하한 · 문자 대기 미적용) ·
// 로컬 Node · 소표본(§79.4 끝 · §71.0 7). 실기 · 브라우저 지연은 별도.

import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const fnRoot = path.join(repoRoot, "functions");
const require = createRequire(path.join(fnRoot, "package.json"));

const { GoogleGenAI, Modality } = require("@google/genai");
const { GeminiRealtimeProvider } = require(path.join(fnRoot, "lib/realtime/geminiProvider.js"));
const { END_CALL_LIVE_AVAILABLE } = require(path.join(fnRoot, "lib/realtime/liveTools.js"));
const { SCAMMER_HANGUP_ACCEPTED_GUIDANCE, SCAMMER_HANGUP_DECLINED_GUIDANCE } = require(
  path.join(fnRoot, "lib/scammerHangup/guidance.js"),
);

// src/lib/realtime/GeminiVoiceSession.tsx 의 OPENING_TRIGGER_TURN 과 같은 문자열(클라 파일이라 import 불가 — 원문 복사).
const LIVE_OPENING_TRIGGER =
  "(전화가 방금 연결됐다. 지금 막 전화를 받은 상대에게 캐릭터로서 자연스럽게 첫 마디를 건네라. 다짜고짜 요구나 압박부터 하지 말고, 먼저 신분(사칭 기관·관계)과 전화를 건 이유를 1~2문장으로 밝히며 상황을 설명한 뒤에 이어가라.)";

// 문자 · 확인 도구가 없는 시나리오(선언 = end_call 하나) — 다른 도구의 왕복이 측정을 흐리지 않게.
const SCENARIO_ID = "kidnapping-threat";
const LEVEL = "intermediate";

/** H1 · H3 작별 · 종료 어휘(§79.4 "테스트 상수"). ⛔ 판정은 부분 문자열 포함. */
export const FAREWELL_WORDS = [
  "끊겠", "끊을게", "끊습니다", "끊을께", "종료하", "종료할", "이만", "들어가세요", "들어가십시오",
  "수고하", "마치겠", "마칠게", "안녕히", "연락드리겠", "통화 끝",
];

// 대본(개인정보 0 · 숫자는 가짜).
const SCRIPT_GOAL = [
  "여보세요?",
  "네? 우리 애요? 무사한 거죠?",
  "알겠어요 시키는 대로 할게요",
  "얼마를 어디로 보내면 돼요?",
  "지금 바로 보낼게요",
  "방금 말한 계좌로 다 이체했어요",
  "보냈어요 확인해 보세요",
  "이제 우리 애 보내 주세요",
  "다 보냈다니까요",
];
const SCRIPT_REFUSE = [
  "여보세요?",
  "누구세요?",
  "장난전화 하지 마세요",
  "경찰에 신고할 거예요",
  "돈 절대 안 보내요",
  "지금 아이한테 직접 전화해 볼게요",
  "거짓말인 거 다 알아요",
  "더 이상 할 말 없어요",
  "안 보낸다고요",
];
const SCRIPT_SILENCE = ["여보세요?", "...", "음...", "...", "네...", "...", "음"];

const args = process.argv.slice(2);
const mode = args[0];
const n = Number(args[1] ?? "1");
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const outDir = path.resolve(argVal("--out", path.join(repoRoot, "hangup-raw")));
if (!["accept", "reject", "silence"].includes(mode) || !Number.isInteger(n) || n < 1 || n > 10) {
  console.error("사용법: node scripts/live-hangup-probe.mjs <accept|reject|silence> <1..10> [--out <dir>]");
  process.exit(2);
}

function readApiKey() {
  const text = readFileSync(path.join(fnRoot, ".secret.local"), "utf8");
  const line = text.split(/\r?\n/).find((l) => l.startsWith("GEMINI_API_KEY="));
  if (!line) throw new Error("functions/.secret.local 에 GEMINI_API_KEY 줄이 없습니다.");
  let v = line.slice("GEMINI_API_KEY=".length).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v.split(",")[0].trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const farewellHits = (text) => FAREWELL_WORDS.filter((w) => text.includes(w));
const sentenceCount = (text) => text.split(/[.?!。？！]+/).map((s) => s.trim()).filter(Boolean).length;
/** 24kHz · 16bit · mono PCM(base64) → 초. */
const audioSecondsOfBase64 = (b64) => (b64.length * 3) / 4 / 2 / 24000;

async function runSession(index, apiKey) {
  const t0 = Date.now();
  const now = () => Date.now() - t0;
  const script = mode === "accept" ? SCRIPT_GOAL : mode === "silence" ? SCRIPT_SILENCE : index % 2 === 1 ? SCRIPT_GOAL : SCRIPT_REFUSE;
  const scriptName = script === SCRIPT_GOAL ? "goal" : script === SCRIPT_REFUSE ? "refuse" : "silence";

  // ⭐ 운영과 같은 발급 — 기본 생성자(스위치 = 운영 상수) · 음성 채널 · 릴레이 없음.
  const provider = new GeminiRealtimeProvider(apiKey);
  const creds = await provider.createCallCredentials({
    sessionId: `hangup-probe-${mode}-${index}-${t0}`,
    scenarioId: SCENARIO_ID,
    voiceId: "",
    difficultyLevel: LEVEL,
    channel: undefined,
    hangupRelay: undefined,
  });
  if (creds.liveTools?.endCall !== "end_call") throw new Error("토큰에 end_call이 선언되지 않았다(운영 스위치 확인)");

  const events = [];
  const turns = [];
  let buf = "";
  let turnAudioSec = 0;
  let audioChunksTotal = 0;
  // H2 — 응답 전송 뒤 받은 오디오만(같은 턴의 호출 전 발화는 빼고 잰다).
  let audioAfterResponseSec = 0;
  let waiters = [];
  let closed = false;
  const calls = []; // end_call 호출 기록
  let hangupAccepted = false;
  let lastResponseSentAt = null;
  let lastResponseBufLen = 0;
  const notify = (ev) => waiters.forEach((w) => w(ev));
  const waitFor = (pred, ms) =>
    new Promise((resolve) => {
      const fn = (ev) => {
        if (pred(ev) || ev.type === "close") {
          clearTimeout(timer);
          waiters = waiters.filter((w) => w !== fn);
          resolve(ev);
        }
      };
      const timer = setTimeout(() => {
        waiters = waiters.filter((w) => w !== fn);
        resolve({ type: "timeout" });
      }, ms);
      waiters.push(fn);
    });

  const ai = new GoogleGenAI({ apiKey: creds.geminiToken, httpOptions: { apiVersion: "v1alpha" } });
  const session = await ai.live.connect({
    model: creds.geminiModel,
    config: { responseModalities: [Modality.AUDIO] },
    callbacks: {
      onopen: () => events.push({ t: now(), ev: "open" }),
      onmessage: (m) => {
        if (m.toolCall) {
          const fcs = m.toolCall.functionCalls ?? [];
          for (const fc of fcs) {
            const preText = buf;
            const call = {
              t: now(),
              name: fc.name,
              reason: fc.args?.reason,
              preCallText: preText,
              preCallFarewell: farewellHits(preText),
              userTurnsSent: turns.filter((x) => x.role === "user").length,
            };
            calls.push(call);
            events.push({ t: now(), ev: "toolCall", name: fc.name, reason: call.reason });
          }
          void respondTools(fcs);
          return;
        }
        const sc = m.serverContent;
        if (!sc) return;
        for (const p of sc.modelTurn?.parts ?? []) {
          if (p.inlineData?.data) {
            audioChunksTotal += 1;
            turnAudioSec += audioSecondsOfBase64(p.inlineData.data);
            if (lastResponseSentAt !== null) audioAfterResponseSec += audioSecondsOfBase64(p.inlineData.data);
            notify({ type: "audio" });
          }
        }
        if (sc.outputTranscription?.text) buf += sc.outputTranscription.text;
        if (sc.interrupted) events.push({ t: now(), ev: "interrupted" });
        if (sc.turnComplete) {
          turns.push({ role: "scammer", t: now(), text: buf, audioSec: Number(turnAudioSec.toFixed(2)) });
          events.push({ t: now(), ev: "turnComplete", chars: buf.length });
          buf = "";
          turnAudioSec = 0;
          notify({ type: "turnComplete" });
        }
      },
      onerror: (e) => events.push({ t: now(), ev: "error", msg: String(e?.message ?? e).slice(0, 200) }),
      onclose: (e) => {
        closed = true;
        events.push({ t: now(), ev: "close", code: e?.code, reason: String(e?.reason ?? "").slice(0, 200) });
        notify({ type: "close" });
      },
    },
  });

  async function respondTools(fcs) {
    const responses = fcs.map((fc) => {
      if (fc.name !== "end_call") return { id: fc.id, name: fc.name ?? "unknown", response: { status: "unsupported" } };
      if (mode === "accept") {
        const status = hangupAccepted ? "already_accepted" : "accepted";
        hangupAccepted = true;
        return { id: fc.id, name: fc.name, response: { status, guidance: SCAMMER_HANGUP_ACCEPTED_GUIDANCE } };
      }
      return { id: fc.id, name: fc.name, response: { status: "too_early", guidance: SCAMMER_HANGUP_DECLINED_GUIDANCE } };
    });
    await sleep(300); // 콜러블 왕복 흉내
    try {
      session.sendToolResponse({ functionResponses: responses });
      lastResponseSentAt = now();
      audioAfterResponseSec = 0;
      lastResponseBufLen = buf.length;
      events.push({ t: now(), ev: "toolResponse", statuses: responses.map((r) => r.response.status) });
      notify({ type: "toolResponse" });
    } catch (e) {
      events.push({ t: now(), ev: "toolResponseError", msg: String(e?.message ?? e).slice(0, 200) });
    }
  }
  const send = (text) => {
    turns.push({ role: "user", t: now(), text });
    session.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
  };

  const result = { index, mode, script: scriptName, scenarioId: SCENARIO_ID, level: LEVEL, model: creds.geminiModel };
  send(LIVE_OPENING_TRIGGER);
  turns.pop(); // 트리거는 사용자 발화가 아니다
  await waitFor((e) => e.type === "turnComplete", 30000);

  let userIdx = 0;
  let firstCallSeen = false;
  let afterReject = null; // { startTurns, responseAt }
  while (!closed && userIdx < script.length) {
    if (calls.length > 0 && !firstCallSeen) {
      firstCallSeen = true;
      if (mode === "accept") break;
    }
    // 거절 경로: 첫 거절 뒤 사용자 발화 2개까지만 더 보내고 끝낸다(H3 = 거절 뒤 다음 2턴).
    if (mode !== "accept" && calls.length > 0 && afterReject === null) {
      afterReject = { scammerTurnsAtReject: turns.filter((x) => x.role === "scammer").length, userSentAfter: 0 };
    }
    if (afterReject && afterReject.userSentAfter >= 2) break;
    await sleep(800);
    send(script[userIdx]);
    userIdx += 1;
    if (afterReject) afterReject.userSentAfter += 1;
    // 도구 호출이 끼면 응답 → 같은 턴 계속 → turnComplete 순이다.
    await waitFor((e) => e.type === "turnComplete", 30000);
  }
  // 승인 경로: 첫 호출이 마지막 대기 안에서 왔을 수 있다 — 승인 응답 뒤 turnComplete까지 기다린다.
  if (mode === "accept" && calls.length > 0) {
    const firstCall = calls[0];
    // 응답이 아직 안 나갔으면 기다린다.
    if (lastResponseSentAt === null) await waitFor((e) => e.type === "toolResponse", 5000);
    const respAt = lastResponseSentAt;
    // 응답 뒤 첫 turnComplete(이미 왔으면 그 턴).
    let tc = turns.find((x) => x.role === "scammer" && respAt !== null && x.t >= respAt);
    if (!tc) {
      await waitFor((e) => e.type === "turnComplete", 10000);
      tc = turns.find((x) => x.role === "scammer" && respAt !== null && x.t >= respAt);
    }
    const postText = tc ? tc.text.slice(lastResponseBufLen) : null;
    result.h2 = tc
      ? {
          turnCompleteMs: tc.t - respAt,
          audioSec: tc.audioSec,
          audioAfterResponseSec: Number(audioAfterResponseSec.toFixed(2)),
          sentences: sentenceCount(postText ?? ""),
          postResponseText: postText,
        }
      : { turnCompleteMs: null, note: "응답 뒤 turnComplete 미수신(10초)" };
    // H5 — 승인 뒤 turnComplete 이후 10초 무입력 동안 모델 오디오.
    const chunksBefore = audioChunksTotal;
    const turnsBefore = turns.length;
    await sleep(10000);
    result.h5 = { audioChunksIn10s: audioChunksTotal - chunksBefore, newTurnsIn10s: turns.length - turnsBefore };
    result.firstCallReason = firstCall.reason;
  }
  if (mode !== "accept" && calls.length > 0) {
    // H3 — 첫 거절 응답 뒤: 그 턴의 남은 말 + 다음 2턴의 작별 어휘 · 대화 계속 여부.
    await waitFor((e) => e.type === "turnComplete", 8000);
    const firstRejectAt = calls[0].t;
    const after = turns.filter((x) => x.role === "scammer" && x.t >= firstRejectAt).slice(0, 3);
    const texts = after.map((x) => x.text);
    result.h3 = {
      turnsObserved: after.length,
      farewellHits: texts.flatMap((tx) => farewellHits(tx)),
      continued: after.some((x) => x.text.trim().length > 0),
    };
  }
  try {
    session.close();
  } catch {}
  await sleep(300);
  result.calls = calls.map((c) => ({ ...c, preCallText: c.preCallText }));
  result.endCallCount = calls.filter((c) => c.name === "end_call").length;
  result.userTurnsSent = turns.filter((x) => x.role === "user").length;
  result.turns = turns;
  result.events = events;
  return result;
}

async function main() {
  console.log(`[hangup-probe] mode=${mode} n=${n} END_CALL_LIVE_AVAILABLE=${END_CALL_LIVE_AVAILABLE}`);
  const apiKey = readApiKey();
  mkdirSync(outDir, { recursive: true });
  const ts = Date.now();
  const results = [];
  for (let i = 1; i <= n; i++) {
    let r;
    try {
      r = await runSession(i, apiKey);
    } catch (e) {
      r = { index: i, mode, error: String(e?.message ?? e).slice(0, 300) };
    }
    writeFileSync(path.join(outDir, `hangup-${mode}-${i}-${ts}.json`), JSON.stringify(r, null, 2));
    results.push(r);
    console.log(
      `[hangup-probe] #${i} script=${r.script ?? "-"} calls=${r.endCallCount ?? "-"} ` +
        `preFarewell=${(r.calls ?? []).map((c) => c.preCallFarewell.length).join("/") || "-"} ` +
        `h2=${r.h2 ? `${r.h2.turnCompleteMs}ms/${r.h2.audioSec}s/${r.h2.sentences}문` : "-"} ` +
        `h5=${r.h5 ? r.h5.audioChunksIn10s : "-"} h3=${r.h3 ? `${r.h3.farewellHits.length}/${r.h3.continued}` : "-"}` +
        (r.error ? ` error=${r.error}` : ""),
    );
  }
  // 요약(대사 텍스트 제외).
  const called = results.filter((r) => (r.endCallCount ?? 0) > 0);
  const allCalls = results.flatMap((r) => r.calls ?? []);
  const summary = {
    mode,
    n,
    sessionsWithError: results.filter((r) => r.error).length,
    sessionsWithEndCall: called.length,
    endCallTotal: allCalls.length,
    H1_preCallFarewell: { violations: allCalls.filter((c) => c.preCallFarewell.length > 0).length, calls: allCalls.length },
    H2: mode === "accept"
      ? {
          samples: called.filter((r) => r.h2?.turnCompleteMs != null).length,
          within8000: called.filter((r) => r.h2?.turnCompleteMs != null && r.h2.turnCompleteMs <= 8000).length,
          audioLe6s: called.filter((r) => r.h2?.audioSec != null && r.h2.audioSec <= 6).length,
          sentencesLe2: called.filter((r) => r.h2?.sentences != null && r.h2.sentences <= 2).length,
          turnCompleteMs: called.map((r) => r.h2?.turnCompleteMs ?? null),
          audioSec: called.map((r) => r.h2?.audioSec ?? null),
          sentences: called.map((r) => r.h2?.sentences ?? null),
        }
      : undefined,
    H3: mode !== "accept"
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
    H6_callRateByScript: Object.fromEntries(
      ["goal", "refuse", "silence"].map((s) => {
        const of = results.filter((r) => r.script === s);
        return [s, { sessions: of.length, called: of.filter((r) => (r.endCallCount ?? 0) > 0).length }];
      }),
    ),
    reasons: allCalls.map((c) => c.reason ?? null),
    userTurnsAtFirstCall: called.map((r) => r.calls[0].userTurnsSent),
  };
  writeFileSync(path.join(outDir, `hangup-${mode}-summary-${ts}.json`), JSON.stringify(summary, null, 2));
  console.log(`[hangup-probe] summary ${JSON.stringify(summary)}`);
}

main().catch((e) => {
  console.error("[hangup-probe] 실패:", String(e?.message ?? e).slice(0, 300));
  process.exit(1);
});
