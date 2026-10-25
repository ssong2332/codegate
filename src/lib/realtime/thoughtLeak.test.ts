// §116 — 실시간 통화 영어 사고 문장: 서버 사본 일치 · 재생 게이트 판정표(G1~G5) · 사고 파트 제외 · 화면 배선(소스 스캔).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INITIAL_THOUGHT_LEAK_GATE_STATE,
  THOUGHT_SPAN_MIN_WORDS,
  cleanStoredLine,
  pickLiveAudioData,
  stepThoughtLeakGate,
  stripLeakedThought,
  type ThoughtLeakGateState,
} from "./thoughtLeak.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const copyOf = (s: string) => s.slice(s.indexOf("// ── 사본 시작 ──"), s.indexOf("// ── 사본 끝 ──"));

test("[§116] 판정 구간은 서버 사본과 글자까지 같다", () => {
  const client = copyOf(read("./thoughtLeak.ts"));
  const server = copyOf(read("../../../functions/src/realtime/thoughtLeak.ts"));
  assert.ok(client.length > 200, "사본 표지를 못 찾았다 — 조용한 건너뜀 금지");
  assert.equal(client, server);
});

test("[§116] 저장 메시지 표시 — 사기범 줄만 거르고 참가자 줄은 원문", () => {
  const leak = "thought\nThe user agreed so I will now ask for the bank name politely.거래 은행이 어디세요?";
  assert.equal(cleanStoredLine("scammer", leak), "거래 은행이 어디세요?");
  assert.equal(cleanStoredLine("user", leak), leak);
  assert.equal(stripLeakedThought("고객님 OTP 확인 부탁드립니다."), "고객님 OTP 확인 부탁드립니다.");
});

function run(chunks: string[]): { state: ThoughtLeakGateState; suppressAt: number[] } {
  let state = INITIAL_THOUGHT_LEAK_GATE_STATE;
  const suppressAt: number[] = [];
  chunks.forEach((text, i) => {
    const out = stepThoughtLeakGate(state, { type: "transcript", text });
    state = out.state;
    if (out.startSuppress) suppressAt.push(i);
  });
  return { state, suppressAt };
}

test("[§116 G1 · G3] thought 표지로 시작하면 막고, 한국어 조각이 오면 푼다", () => {
  const a = run(["thou"]);
  assert.equal(a.state.suppressing, false, "표지가 완성되기 전엔 막지 않는다");
  const b = run(["thou", "ght\nThe user asked", " what to do."]);
  assert.deepEqual(b.suppressAt, [1]);
  assert.equal(b.state.suppressing, true);
  const c = run(["thought\nThe user asked", " what to do.", "협조해 주시면"]);
  assert.equal(c.state.suppressing, false);
  // 한글 인용 하나만 낀 영어 조각으로는 풀리지 않는다(한글 수 < 라틴 글자 수).
  const d = run(["thought\n", 'The user said "네" which means yes']);
  assert.equal(d.state.suppressing, true);
});

test("[§116 G2] 표지 없이 한글 없는 영어가 8단어에 이르면 막는다 · 짧은 영어는 통과", () => {
  const words = Array.from({ length: THOUGHT_SPAN_MIN_WORDS }, () => "word").join(" ");
  assert.deepEqual(run(["네, 잠시만요. ", words]).suppressAt, [1]);
  assert.deepEqual(run(["고객님 OTP ", "번호 SMS로 ", "보냈습니다"]).suppressAt, []);
  assert.deepEqual(run(["한국어 대사입니다."]).suppressAt, []);
});

test("[§116 G4] 턴 경계에서 처음 상태로", () => {
  const { state } = run(["thought\nplanning"]);
  assert.equal(state.suppressing, true);
  const next = stepThoughtLeakGate(state, { type: "boundary" });
  assert.deepEqual(next.state, INITIAL_THOUGHT_LEAK_GATE_STATE);
  assert.equal(next.startSuppress, false);
});

test("[§116] 사고 파트(thought: true)의 오디오는 고르지 않는다 · 여러 파트는 SDK 게터와 같은 방식으로 잇는다", () => {
  const b64 = (s: string) => btoa(s);
  assert.equal(pickLiveAudioData(undefined), undefined);
  assert.equal(pickLiveAudioData([{ thought: true, inlineData: { data: b64("xx") } }]), undefined);
  assert.equal(
    pickLiveAudioData([{ inlineData: { data: b64("ab") } }, { thought: true, inlineData: { data: b64("ZZ") } }, { inlineData: { data: b64("c") } }]),
    b64("abc"),
  );
});

test("[§116 배선] 통화 컴포넌트 — 전사 flush · 판정 입력은 거른 글, 오디오는 사고 파트 제외 + 게이트", () => {
  const s = read("./GeminiVoiceSession.tsx");
  assert.match(s, /const s = stripLeakedThought\(scammerBuffer\)\.trim\(\);[\s\S]*const s = stripLeakedThought\(scammerBuffer\)\.trim\(\);/, "flushTranscript · flushScammerTurn 둘 다");
  assert.match(s, /const scammerTurnText = stripLeakedThought\(scammerBuffer\);/);
  assert.match(s, /const audioData = pickLiveAudioData\(sc\?\.modelTurn\?\.parts\);/);
  assert.equal(/message\.data\b/.test(s), false, "SDK data 게터(사고 파트 포함)를 쓰지 않는다");
  assert.match(s, /if \(hasAudio && samples && !thoughtGate\.suppressing\) \{/);
  // §135 — 재생 정지 바로 앞에 진단 1줄(`noteThoughtCut`)만 허용한다.
  assert.match(s, /if \(gate\.startSuppress\) \{\s*(noteThoughtCut\(\);[^\n]*\s*)?stopAllPlayback\(\);/);
  // 경계 초기화 2곳(interrupted · turnComplete).
  assert.equal((s.match(/thoughtGate = stepThoughtLeakGate\(thoughtGate, \{ type: "boundary" \}\)\.state;/g) ?? []).length, 2);
});

test("[§116 배선] 되짚어보기 · 되감기 화면은 저장된 사기범 줄을 거른다", () => {
  for (const rel of ["../../app/report/replay/page.tsx", "../../app/report/rewind/page.tsx"]) {
    const s = read(rel);
    assert.match(s, /textMasked: cleanStoredLine\(data\.role as "scammer" \| "user", data\.textMasked as string\),/, rel);
  }
});
