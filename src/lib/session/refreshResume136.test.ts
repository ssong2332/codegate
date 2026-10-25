// ⭐ §136(2026-10-25 실기 신고 · 갤럭시 Chrome 155) — 통화 중 새로고침 뒤 "이어서 통화하기"를 눌러도 사기범 소리가 안 들렸다.
// 확인된 원인: 복원이 글 대화로 갔고 그 경로의 상대 음성은 서버 `MockVoiceProvider` 무음 WAV다. ⇒ 복원 뒤 실시간을 다시 연다
// (`resumeGate.ts` S1 ~ S3 · W1). 버튼은 화면에 고정(스크롤 없이 보임) · 버튼이 떠 있는 동안 파형 · "말씀하세요" 0.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 이 파일 안에서만 `\r\n`→`\n`으로 정규화해 읽는다(`callAudio.test.ts` 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { showsCallWaveform } from "./resumeGate.ts";
import { openingTurnFor } from "../realtime/escalatedOpening.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("[§136 원인] 글 대화 경로의 합성은 늘 무음 목업이다(이 전제가 바뀌면 이 수정의 근거를 다시 볼 것)", () => {
  const provider = read("../../../functions/src/voice/provider.ts");
  assert.match(provider, /export function getVoiceProvider\(\): VoiceProvider \{\n\s+return new MockVoiceProvider\(\);\n\}/);
  const mock = read("../../../functions/src/voice/mockProvider.ts");
  assert.ok(mock.includes("audioUrl: buildMockSilentWavDataUri(),"));
});

test("[§136 W1] 버튼이 떠 있으면 파형 0 · 실시간이면 종전대로 0 · 그 밖 종전", () => {
  assert.equal(showsCallWaveform({ phaseShowsWave: true, callMode: "fallback", resumeTapNeeded: true }), false);
  assert.equal(showsCallWaveform({ phaseShowsWave: true, callMode: "fallback", resumeTapNeeded: false }), true);
  assert.equal(showsCallWaveform({ phaseShowsWave: true, callMode: "realtime", resumeTapNeeded: false }), false);
  assert.equal(showsCallWaveform({ phaseShowsWave: false, callMode: "fallback", resumeTapNeeded: false }), false);
});

test("[§136 첫 턴] 복원 뒤 첫 연결은 되살린 대화 맥락 · 맥락이 없으면 종전 판정 · 다시 연결은 종전", () => {
  const base = { connectionSeq: 0, resumeTurn: null, escalatedFromMessenger: false } as const;
  assert.equal(openingTurnFor({ ...base, restoredResumeTurn: "(맥락)" }), "(맥락)");
  assert.equal(openingTurnFor({ ...base, restoredResumeTurn: null }), null);
  assert.notEqual(openingTurnFor({ ...base, escalatedFromMessenger: true, restoredResumeTurn: null }), null);
  assert.equal(openingTurnFor({ ...base, connectionSeq: 1, resumeTurn: "(재연결)", restoredResumeTurn: "(맥락)" }), "(재연결)");
});

test("[§136 배선] 다시 열기 — 복원 분기에서 예약 · 탭/자동 둘 다 한 함수 · 그 안에서 동기 준비 → realtime → start", () => {
  const page = read("../../app/session/play/page.tsx");
  assert.ok(page.includes("restoredCallRef.current = true;\n          restoredResumePendingRef.current = true;"));
  const fn = page.indexOf("const resumeRestoredCall = () => {");
  assert.ok(fn > 0);
  const body = page.slice(fn, page.indexOf("\n  };", fn));
  const order = [
    "restoredResumePendingRef.current = false;",
    "primeCallAudio(GEMINI_OUTPUT_SAMPLE_RATE, performance.now())",
    "setResumeTurn(buildResumeTurn(transcriptRef.current));",
    'setCallMode("realtime");',
    "void realtime.start(sessionId);",
  ].map((s) => body.indexOf(s));
  assert.ok(order.every((i) => i >= 0), "모든 단계가 있다");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "순서");
  assert.equal(/await /.test(body.slice(0, order[4])), false, "start 전 await 0(탭 활성화 유지)");
  assert.equal(page.split("resumeRestoredCall();").length - 1, 2, "탭 1 · 자동(R2) 1");
  // S3 — 실패로 글 대화로 내려가면 오프닝 음성을 다시 틀지 않는다.
  assert.ok(page.includes("const audio = restoredCallRef.current ? null : consumeOpeningAudioUrl();"));
  // 첫 턴 — 복원된 통화만 되살린 맥락을 넘긴다.
  assert.ok(page.includes("restoredResumeTurn: restoredCall ? resumeTurn : null,"));
});

test("[§136 화면] 버튼은 화면에 고정 · 바깥 눌림 통과 · 파형은 판정 함수만", () => {
  const page = read("../../app/session/play/page.tsx");
  const at = page.indexOf("{resumeTapNeeded && phase === \"live\" && (");
  assert.ok(at > 0);
  const block = page.slice(at, page.indexOf("{RESUME_TAP_COPY.action}", at));
  assert.ok(block.includes("pointer-events-none fixed inset-x-0"));
  assert.ok(block.includes("pointer-events-auto"));
  assert.ok(page.includes("showsCallWaveform({ phaseShowsWave: phase === \"live\" || phase === \"opening\", callMode, resumeTapNeeded })"));
  assert.equal(page.includes('(phase === "live" || phase === "opening") && callMode !== "realtime" && ('), false);
});
