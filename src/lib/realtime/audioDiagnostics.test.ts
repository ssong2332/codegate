// `?audiodebug=1` 진단 패널 — 쿼리 없으면 렌더 0 · 금지 필드 0 · 관찰 전용 · 브라우저 식별 축약(2026-10-18).
//
// ⚠️ CRLF 체크아웃(core.autocrlf=true)에서도 맞도록 소스는 **이 파일 안에서만** `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AUDIO_DIAG_KEYS,
  buildAudioDiagRows,
  isAudioDebugEnabled,
  noteAccept,
  noteChunkReceived,
  noteChunkScheduled,
  noteCredentialSource,
  formatDbfs,
  peakOf,
  readAudioDiag,
  registerCallAudio,
  registerOutputGain,
  resetAudioDiagForTest,
  summarizeBrowser,
} from "./audioDiagnostics.ts";

const readLf = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const panel = readLf("src/components/AudioDebugPanel.tsx");
const play = readLf("src/app/session/play/page.tsx");

test("[diag] isAudioDebugEnabled — audiodebug=1일 때만 켠다", () => {
  assert.equal(isAudioDebugEnabled(""), false);
  assert.equal(isAudioDebugEnabled("?audiodebug=0"), false);
  assert.equal(isAudioDebugEnabled("?audiodebug=true"), false);
  assert.equal(isAudioDebugEnabled("?x=1"), false);
  assert.equal(isAudioDebugEnabled("?audiodebug=1"), true);
  assert.equal(isAudioDebugEnabled("?a=b&audiodebug=1"), true);
});

/** 패널 행 키 · 패널 소스에 있으면 안 되는 것(비밀값 · 토큰 · 세션 id · uid · 전사 · URL · 개인정보). */
const FORBIDDEN_KEY = /token|secret|session|uid|user.?id|transcript|text|caption|url|signed|key|email|phone|name|model/i;

function forbiddenKeys(keys: readonly string[]): string[] {
  return keys.filter((k) => FORBIDDEN_KEY.test(k));
}

test("[diag] 행 키에 금지 필드가 0이다", () => {
  assert.deepEqual(forbiddenKeys(AUDIO_DIAG_KEYS), []);
});

test("[diag 역검증] sessionId · geminiToken 키를 섞은 목록은 걸린다", () => {
  assert.deepEqual(forbiddenKeys([...AUDIO_DIAG_KEYS, "sessionId", "geminiToken"]), ["sessionId", "geminiToken"]);
});

test("[diag] 행은 고정 키 목록 그대로 · 저장소 값을 읽어 만든다(필수 항목 포함)", () => {
  resetAudioDiagForTest();
  noteAccept(1000);
  noteCredentialSource("inflight");
  const ctx = { state: "suspended", sampleRate: 24000, resume: () => Promise.resolve() };
  registerCallAudio({ output: ctx, input: null, origin: "primed", createdAtMs: 1003 });
  noteChunkReceived();
  noteChunkReceived();
  noteChunkScheduled(1500);
  const rows = buildAudioDiagRows({
    snapshot: readAudioDiag(),
    callMode: "realtime",
    status: "active",
    provider: "gemini",
    audioRoute: "call",
    credentialsPrefetched: true,
    acceptToCredentialsMs: 124,
    userActivation: { hasBeenActive: true, isActive: false },
    browser: "Whale 4 · Android",
    flags: { audioPrime: false, ringCloseImmediate: true },
  });
  assert.deepEqual(rows.map(([k]) => k), [...AUDIO_DIAG_KEYS]);
  const v = Object.fromEntries(rows);
  assert.equal(v["out.state"], "suspended");
  assert.equal(v["out.rate"], "24000");
  assert.equal(v["out.origin"], "primed");
  assert.equal(v["out.createdMs"], "3");
  assert.equal(v["chunks.rx"], "2");
  assert.equal(v["chunks.sched"], "1");
  assert.equal(v["chunk.lastMs"], "500");
  assert.equal(v["cred.source"], "inflight");
  assert.equal(v["cred.prefetched"], "true");
  assert.equal(v["provider"], "gemini");
  // reviewer M2 — 현재 적용 중인 실기 A/B 플래그가 보인다.
  assert.equal(v["flag.audioprime"], "off");
  assert.equal(v["flag.ringclose"], "immediate");
  assert.equal(v["ring.closedMs"], "-");
  // 살아 있는 객체를 다시 읽는다 — 상태가 바뀌면 다음 읽기에 반영된다(실시간 갱신).
  ctx.state = "running";
  assert.equal(Object.fromEntries(buildAudioDiagRows({ ...dummyInput(), snapshot: readAudioDiag() }))["out.state"], "running");
  resetAudioDiagForTest();
});

function dummyInput() {
  return {
    snapshot: readAudioDiag(),
    callMode: "-",
    status: "-",
    provider: "-",
    audioRoute: "-",
    credentialsPrefetched: null,
    acceptToCredentialsMs: null,
    userActivation: null,
    browser: "-",
    flags: { audioPrime: true, ringCloseImmediate: false },
  };
}

test("[diag] summarizeBrowser — 계열 + 주 버전 + OS 계열만(모델명 · 빌드 번호 0)", () => {
  const whale =
    "Mozilla/5.0 (Linux; Android 15; SM-S931N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Whale/4.29.282.14 Mobile Safari/537.36";
  assert.equal(summarizeBrowser({ userAgent: whale }), "Whale 4 · Android");
  const samsung =
    "Mozilla/5.0 (Linux; Android 15; SM-S931N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36";
  assert.equal(summarizeBrowser({ userAgent: samsung }), "SamsungBrowser 27 · Android");
  const chrome = "Mozilla/5.0 (Linux; Android 15; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
  assert.equal(summarizeBrowser({ userAgent: chrome }), "Chrome 141 · Android");
  const brands = [
    { brand: "Not)A;Brand", version: "99" },
    { brand: "Whale", version: "4.29.282.14" },
    { brand: "Chromium", version: "130" },
  ];
  assert.equal(summarizeBrowser({ brands, userAgent: whale }), "Whale 4 / Chromium 130 · Android");
  for (const out of [summarizeBrowser({ userAgent: whale }), summarizeBrowser({ brands, userAgent: whale })]) {
    assert.equal(out.includes("SM-"), false, "기기 모델명이 새면 안 된다");
    assert.equal(/\d+\.\d+/.test(out), false, "주 버전 밖의 세부 버전이 새면 안 된다");
  }
});

/** 패널 위반 — 쿼리 없으면 DOM 0(첫 return 전 JSX 0) · 관찰 전용 · 금지 식별자 0 · 탭 가로채기 0. */
function panelViolations(code: string): string[] {
  const out: string[] = [];
  const gate = code.indexOf("if (!enabled) return null;");
  const firstJsx = code.indexOf("return (\n");
  if (gate < 0) out.push("쿼리가 없을 때 null을 돌려주는 분기가 없다");
  else if (firstJsx >= 0 && firstJsx < gate) out.push("null 분기보다 먼저 JSX를 돌려준다");
  if (!code.includes("isAudioDebugEnabled(window.location.search)")) out.push("쿼리로 켜지 않는다");
  if (!code.includes("pointer-events-none")) out.push("패널이 탭을 가로챈다(AC-006)");
  if (!code.includes("flags: readAudioFlags(window.location.search)")) out.push("패널이 적용 중인 플래그를 보이지 않는다");
  // 관찰 전용 — 저장소에 적는 함수(note*/register*) · 제품 상태 변경 호출 0.
  if (/\b(note[A-Z]\w*|register[A-Z]\w*|reset[A-Z]\w*)\(/.test(code)) out.push("패널이 진단 저장소에 적는다(읽기 전용이어야 한다)");
  if (/\.(resume|close|play|pause)\(/.test(code)) out.push("패널이 오디오를 조작한다(관찰 전용이어야 한다)");
  // 금지 식별자 — 토큰 · 세션 id · uid · 전사 · 자격증명.
  const codeOnly = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const word of ["sessionId", "uid", "geminiToken", "signedUrl", "credentials", "transcript", "Transcript"]) {
    if (new RegExp(`\\b${word}\\b`).test(codeOnly)) out.push(`패널 코드가 ${word}를 다룬다`);
  }
  return out;
}

test("[diag] 패널 — 쿼리 없으면 렌더 0 · 관찰 전용 · 금지 필드 0 · 탭 가로채기 0", () => {
  assert.deepEqual(panelViolations(panel), []);
});

test("[diag 역검증] null 분기를 지운 사본 · 세션 id를 그리는 사본 · resume을 부르는 사본은 각각 실패한다", (t) => {
  const gate = "  if (!enabled) return null;\n";
  assert.ok(panel.includes(gate), "오염 지점(null 분기)을 찾지 못했다 — 역검증이 공회전한다");
  const a = panelViolations(panel.replace(gate, ""));
  const anchor = "  const nav = navigator as NavigatorWithExtras;\n";
  assert.ok(panel.includes(anchor));
  const b = panelViolations(panel.replace(anchor, `${anchor}  const sessionId = "x";\n`));
  const c = panelViolations(panel.replace(anchor, `${anchor}  void readAudioDiag().output?.resume();\n`));
  t.diagnostic(`[diag] 정상 0 / null 분기 삭제 ${JSON.stringify(a)} / 세션 id ${JSON.stringify(b)} / resume ${JSON.stringify(c)}`);
  assert.deepEqual(a, ["쿼리가 없을 때 null을 돌려주는 분기가 없다"]);
  assert.deepEqual(b, ["패널 코드가 sessionId를 다룬다"]);
  assert.deepEqual(c, ["패널이 오디오를 조작한다(관찰 전용이어야 한다)"]);
});

test("[diag] 통화 화면은 패널을 1곳에서만 그리고 세션 식별자를 넘기지 않는다", () => {
  const uses = play.match(/<AudioDebugPanel[\s\S]*?\/>/g) ?? [];
  assert.equal(uses.length, 1);
  assert.equal(/sessionId|uid|credentials=|token/i.test(uses[0]), false, uses[0]);
});

// ── 2026-10-20 음량 신고 — 게인 노드 컨텍스트 동일성(`out.gainCtx`) · 원본 PCM 최대 진폭(`pcm.peakDb`) ──────────────
test("[diag 음량] out.gainCtx — 게인 노드 컨텍스트가 등록된 출력 컨텍스트와 같으면 same · 다르면 diff", () => {
  resetAudioDiagForTest();
  noteAccept(0);
  const ctx = { state: "running", sampleRate: 24000, resume: () => Promise.resolve() };
  const other = { state: "running", sampleRate: 24000, resume: () => Promise.resolve() };
  const row = () => Object.fromEntries(buildAudioDiagRows({ ...dummyInput(), snapshot: readAudioDiag() }));
  assert.equal(row()["out.gainCtx"], "-");
  registerCallAudio({ output: ctx, input: null, origin: "primed", createdAtMs: 0 });
  registerOutputGain({ gain: { value: 0.6 }, context: ctx });
  assert.equal(row()["out.gainCtx"], "same");
  assert.equal(row()["out.gain"], "0.60");
  registerOutputGain({ gain: { value: 0.6 }, context: other });
  assert.equal(row()["out.gainCtx"], "diff", "역검증 — 다른 컨텍스트의 노드는 diff");
  resetAudioDiagForTest();
});

test("[diag 음량] pcm.peakDb — 통화 중 받은 청크의 최대 진폭(게인 전)을 dBFS로 · 받기마다 비운다", () => {
  resetAudioDiagForTest();
  noteAccept(0);
  const row = () => Object.fromEntries(buildAudioDiagRows({ ...dummyInput(), snapshot: readAudioDiag() }));
  assert.equal(row()["pcm.peakDb"], "-");
  noteChunkReceived(new Float32Array([0, 0.1, -0.25]));
  assert.equal(row()["pcm.peakDb"], "-12.0");
  noteChunkReceived(new Float32Array([0.5, -0.05]));
  noteChunkReceived(new Float32Array([0.2]));
  assert.equal(row()["pcm.peakDb"], "-6.0", "최대값 유지");
  noteChunkReceived();
  assert.equal(row()["chunks.rx"], "4");
  noteAccept(10);
  assert.equal(row()["pcm.peakDb"], "-", "다음 통화에서 비운다");
  assert.equal(peakOf([]), 0);
  assert.equal(formatDbfs(0), "-inf");
  assert.equal(formatDbfs(1), "0.0");
  resetAudioDiagForTest();
});
