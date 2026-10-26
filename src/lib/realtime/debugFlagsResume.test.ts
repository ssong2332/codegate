// ⭐ §134(2026-10-25 실기 신고 — 통화 중 주소창에 `?audiodebug=1`을 붙여 다시 열자 새로 로드돼 통화가 깨졌다 · Chrome 155 Android)
// (1) 진단 플래그를 어느 화면에서든 한 번 붙이면 탭 sessionStorage로 `/session/play`까지 유지(`debugFlags.ts` F1~F5)
// (2) 새로고침 복원 · 활성화 없음이면 "이어서 통화하기"를 누를 때까지 자동 청취를 열지 않는다(`resumeGate.ts` R1~R3)
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 이 파일 안에서만 `\r\n`→`\n`으로 정규화해 읽는다(`callAudio.test.ts` 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describeStoredDebugFlags, resolveDebugFlags } from "./debugFlags.ts";
import { isAudioDebugEnabled, AUDIO_DIAG_KEYS } from "./audioDiagnostics.ts";
import { readOutputAfterMicFlag, readVoiceTrimFlag } from "./callAudio.ts";
import { needsResumeTap } from "../session/resumeGate.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("[§134 플래그] F3 → F4 — 첫 화면에서 붙인 값이 쿼리 없는 /session/play에서도 유지된다", () => {
  const first = resolveDebugFlags("?audiodebug=1&outaftermic=0&voicetrim=0", null);
  assert.deepEqual(first.stored, { audiodebug: "1", outaftermic: "0", voicetrim: "0" });
  const later = resolveDebugFlags("", JSON.stringify(first.stored));
  assert.equal(isAudioDebugEnabled(later.effectiveSearch), true);
  assert.equal(readOutputAfterMicFlag(later.effectiveSearch), false);
  assert.equal(readVoiceTrimFlag(later.effectiveSearch), false);
  assert.equal(describeStoredDebugFlags(later.stored), "audiodebug=1,outaftermic=0,voicetrim=0");
});

test("[§134 플래그] F2 · F1 — `<키>=off`는 그 키만, `debugflags=off`는 전부 지운다", () => {
  const stored = JSON.stringify({ audiodebug: "1", voicetrim: "0" });
  const one = resolveDebugFlags("?voicetrim=off", stored);
  assert.deepEqual(one.stored, { audiodebug: "1" });
  assert.equal(readVoiceTrimFlag(one.effectiveSearch), true);
  assert.equal(isAudioDebugEnabled(one.effectiveSearch), true);
  const all = resolveDebugFlags("?debugflags=off", stored);
  assert.deepEqual(all.stored, {});
  assert.equal(all.effectiveSearch, "");
  assert.equal(describeStoredDebugFlags(all.stored), "-");
  // 같은 주소에서 지우고 다시 켤 수 있다.
  assert.deepEqual(resolveDebugFlags("?debugflags=off&audiodebug=1", stored).stored, { audiodebug: "1" });
});

test("[§134 플래그] 주소 값이 저장 값보다 우선 · 목록 밖 키와 허용 밖 값은 저장하지 않는다 · 깨진 저장 값 = 주소만(F5)", () => {
  const r = resolveDebugFlags("?outaftermic=1&sid=abc123&x=1", JSON.stringify({ outaftermic: "0" }));
  assert.deepEqual(r.stored, { outaftermic: "1" });
  assert.equal(readOutputAfterMicFlag(r.effectiveSearch), true);
  assert.equal(new URLSearchParams(r.effectiveSearch).get("x"), "1"); // 다른 쿼리는 판정에 그대로 넘긴다
  assert.equal(Object.keys(r.stored).includes("sid"), false);
  assert.deepEqual(resolveDebugFlags("?audiodebug=<script>", null).stored, {});
  assert.deepEqual(resolveDebugFlags("?voicetrim=0", "{not json").stored, { voicetrim: "0" });
  assert.deepEqual(resolveDebugFlags("", JSON.stringify({ audiodebug: "1", token: "x" })).stored, { audiodebug: "1" });
});

test("[§134 플래그] 배선 — 전역 셸이 남기고 · 패널 · 출력 경로 · 감쇠가 저장 값을 읽는다", () => {
  const layout = read("../../app/layout.tsx");
  assert.ok(layout.includes("<DebugFlagCapture />"));
  const panel = read("../../components/AudioDebugPanel.tsx");
  assert.ok(panel.includes("isAudioDebugEnabled(readDebugFlagSearch())"));
  assert.ok(panel.includes("outputAfterMic: readOutputAfterMicFlag(debugSearch)"));
  assert.ok(panel.includes("voiceTrim: readVoiceTrimFlag(debugSearch)"));
  const live = read("./GeminiVoiceSession.tsx");
  assert.ok(live.includes("readOutputAfterMicFlag(readDebugFlagSearch())"));
  assert.ok(live.includes("readVoiceTrimFlag(readDebugFlagSearch())"));
  assert.equal(/read(OutputAfterMic|VoiceTrim)Flag\(window\.location\.search\)/.test(live), false);
  const i = AUDIO_DIAG_KEYS.indexOf("flag.ringclose");
  // §137 — `flag.voicetrim` 뒤에 출력 싱크 A/B `flag.outelement`가 들어갔다(`outputElementSink.test.ts`).
  assert.deepEqual(AUDIO_DIAG_KEYS.slice(i, i + 5), ["flag.ringclose", "flag.outaftermic", "flag.voicetrim", "flag.outelement", "flag.saved"]);
});

test("[§134 이어서] R1 ~ R3 — 새로고침 복원 · 활성화 없음(또는 판별 불가)일 때만 버튼", () => {
  assert.equal(needsResumeTap({ restored: false, userActivation: { hasBeenActive: false } }), false); // R1
  assert.equal(needsResumeTap({ restored: true, userActivation: { hasBeenActive: true } }), false); // R2
  assert.equal(needsResumeTap({ restored: true, userActivation: { hasBeenActive: false } }), true); // R3
  assert.equal(needsResumeTap({ restored: true, userActivation: undefined }), true); // R3(판별 API 없음)
});

test("[§134 이어서] 배선 — 복원 분기에서만 판정 · 누르기 전 자동 청취 0 · 버튼이 해제 · 막힌 재생을 다시 튼다", () => {
  const page = read("../../app/session/play/page.tsx");
  // §136 — 복원 분기의 글 대화 전환과 판정 사이에 실시간 다시 열기 준비(ref · 받기 시각)가 들어갔다.
  const fallbackAt = page.indexOf('setCallMode("fallback");\n          // §136');
  const restore = page.indexOf("setResumeTapNeeded(\n            needsResumeTap({\n              restored: true,", fallbackAt);
  assert.ok(fallbackAt > 0 && restore > fallbackAt, "새로고침 복원 분기 안에서 판정한다");
  assert.equal(page.split("setResumeTapNeeded(").length - 1, 2, "판정 1곳 + 버튼 해제 1곳뿐");
  const effect = page.indexOf('if (callMode !== "fallback" || phase !== "live" || verifyOverlayOpen) return;');
  const gate = page.indexOf("if (resumeTapNeeded) return;", effect);
  const start = page.indexOf("const timer = setTimeout(() => speech.start(), 400);", effect);
  assert.ok(effect > 0 && gate > effect && gate < start, "자동 청취 effect가 speech.start 전에 막는다");
  assert.ok(page.includes("verifyOverlayOpen, endLatched, resumeTapNeeded]);"));
  assert.ok(page.includes("onClick={handleResumeTap}"));
  // §136 S2 — 탭은 막힌 글 대화 재생이 아니라 실시간 다시 열기를 부른다(`refreshResume136.test.ts`).
  assert.ok(/const handleResumeTap = \(\) => \{\n\s+setResumeTapNeeded\(false\);\n\s+resumeRestoredCall\(\);/.test(page));
});
