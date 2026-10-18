// §71.7(G433) — AI 음성 기본 음량 · GainNode 배선 회귀. `GeminiVoiceSession.tsx`는 AudioContext에 강결합돼
// 이 러너로 실행할 수 없어(`toolWindowWiring.test.ts`와 같은 관례) 배선은 소스 스캔으로만 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CALL_MODE_GAIN,
  GEMINI_OUTPUT_GAIN,
  SPEAKER_MODE_GAIN,
  gainFor,
  gainModeViolations,
  isVolumeApplied,
  isVolumeSettable,
  VOLUME_PROBE,
} from "./outputGain.ts";

const session = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8");
const code = session
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");

test("[§71.7 G433] 기본 출력 게인은 User가 정한 검토 범위(0.5~0.7) 안이다", () => {
  assert.ok(GEMINI_OUTPUT_GAIN >= 0.5 && GEMINI_OUTPUT_GAIN <= 0.7, `실측 ${GEMINI_OUTPUT_GAIN}`);
});

test("[§71.7 G433] 받은 오디오 소스는 destination이 아니라 게인 노드에 연결된다", () => {
  assert.equal(code.includes("source.connect(outputContext.destination)"), false, "destination 직결이 남아 있다");
  assert.ok(code.includes("source.connect(outputGain ?? outputContext.destination)"));
});

test("[§71.7 G433] 게인 노드는 GEMINI_OUTPUT_GAIN 값으로 만들어 destination에 1번 연결된다", () => {
  assert.ok(code.includes("outputGain = outputContext.createGain();"));
  assert.ok(code.includes("outputGain.gain.value = GEMINI_OUTPUT_GAIN;"));
  assert.equal(code.split("outputGain.connect(outputContext.destination)").length - 1, 1);
});

// ── T190-3 — G455 스피커 버튼 음량 모드(docs/Architecture.md §74.3 표 S · §74.14 G455 · UX D-98 · PRD AC-093 (c)(g)ⓒ) ──
test("[T190/G455] 통화 모드 = 기본 음량(0.6) · 0 < 통화 < 스피커 ≤ 1.0 · User 확정값", () => {
  assert.equal(CALL_MODE_GAIN, GEMINI_OUTPUT_GAIN);
  assert.equal(CALL_MODE_GAIN, 0.6, "User 확정(2026-10-18 · OQ-A94) 통화 모드 0.6");
  assert.equal(SPEAKER_MODE_GAIN, 1.0, "User 확정(2026-10-18 · OQ-A94) 스피커 모드 1.0");
  assert.deepEqual(gainModeViolations({ call: CALL_MODE_GAIN, speaker: SPEAKER_MODE_GAIN, base: GEMINI_OUTPUT_GAIN }), []);
  assert.equal(gainFor("call"), CALL_MODE_GAIN);
  assert.equal(gainFor("speaker"), SPEAKER_MODE_GAIN);
});

test("[T190/G455 역검증 — AC-093 (g)ⓒ] 스피커 1.5 사본 · 스피커 ≤ 통화 사본은 실패한다(정상은 통과)", (t) => {
  const over = gainModeViolations({ call: CALL_MODE_GAIN, speaker: 1.5, base: GEMINI_OUTPUT_GAIN });
  const under = gainModeViolations({ call: CALL_MODE_GAIN, speaker: 0.5, base: GEMINI_OUTPUT_GAIN });
  const drift = gainModeViolations({ call: 0.7, speaker: 1.0, base: GEMINI_OUTPUT_GAIN });
  t.diagnostic(`[G455] 1.5 → ${JSON.stringify(over)} / 0.5 → ${JSON.stringify(under)} / 통화≠기본 → ${JSON.stringify(drift)}`);
  assert.equal(over.length, 1);
  assert.equal(under.length, 1);
  assert.equal(drift.length, 1);
});

test("[T190/D-103 · 표 S S-5] 음량 반영 판정 — 다시 읽어 같아야 반영(iOS는 늘 1을 돌려준다)", () => {
  assert.equal(isVolumeApplied(0.6, 0.6), true);
  assert.equal(isVolumeApplied(0.6, 1), false);
  assert.equal(isVolumeApplied(1, 1), true);
});

/** G455 배선 — 두 세션 컴포넌트가 prop을 받고, play가 둘 다에 넘기고, 폴백 `<audio>`에도 대입한다. */
function gainWiringViolations(pageSource: string, geminiSource: string, elevenSource: string): string[] {
  const strip = (s: string) => s.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
  const page = strip(pageSource);
  const out: string[] = [];
  if ((page.match(/outputVolume=\{gainFor\(audioRoute\)\}/g) ?? []).length !== 2) out.push("play가 두 세션 컴포넌트에 outputVolume을 넘기지 않는다");
  if (!page.includes("audio.volume = requested;")) out.push("폴백 <audio> 음량 대입이 없다");
  if (!/outputVolume\?: number;/.test(strip(geminiSource))) out.push("GeminiVoiceSession이 outputVolume prop을 받지 않는다");
  if (!strip(geminiSource).includes("node.gain.setTargetAtTime(outputVolumeRef.current")) out.push("Gemini 게인 노드 갱신이 없다");
  if (!/outputVolume\?: number;/.test(strip(elevenSource))) out.push("RealtimeVoiceSession이 outputVolume prop을 받지 않는다");
  if (!strip(elevenSource).includes("volume: outputVolume,")) out.push("ElevenLabs volume 옵션 배선이 없다");
  return out;
}

const pageSource = readFileSync("src/app/session/play/page.tsx", "utf8");
const elevenSource = readFileSync("src/lib/realtime/RealtimeVoiceSession.tsx", "utf8");

test("[T190/G455 배선] play → 두 실시간 경로 + 폴백 <audio>가 같은 음량 모드를 쓴다", () => {
  assert.deepEqual(gainWiringViolations(pageSource, session, elevenSource), []);
});

test("[T190/G455 배선 역검증] 폴백 음량 대입을 지운 사본은 실패한다", () => {
  const poisoned = pageSource.replace("audio.volume = requested;", "");
  assert.notEqual(poisoned, pageSource, "오염 지점을 찾지 못했다");
  assert.deepEqual(gainWiringViolations(poisoned, session, elevenSource), ["폴백 <audio> 음량 대입이 없다"]);
});

// ── reviewer Minor(D-103 거짓 양성) — 판정은 1이 아닌 값으로 프로브한다 ─────────────────────────────────────────
/** iOS Safari처럼 `volume` 대입이 무시되고 늘 1을 읽어 주는 가짜 미디어. */
const iosLikeMedia = () => ({
  get volume() {
    return 1;
  },
  set volume(value: number) {
    // 무시(iOS — Apple 문서 "The volume property is not settable in JavaScript")
    void value;
  },
});
/** 대입이 그대로 반영되는 가짜 미디어(Android·데스크톱). */
const settableMedia = () => {
  let v = 1;
  return {
    get volume() {
      return v;
    },
    set volume(value: number) {
      v = value;
    },
  };
};

test("[T190/D-103 프로브] 1이 아닌 값으로 재므로 스피커(1.0)를 먼저 켜 둔 iOS에서도 잠긴다", (t) => {
  assert.notEqual(VOLUME_PROBE, 1, "프로브가 1이면 iOS(늘 1)에서 거짓 양성이 난다");
  // 옛 판정(요청값 그대로 대입 후 재기)의 거짓 양성을 같은 출력에 보인다 — 스피커 1.0이면 iOS도 '반영됨'.
  const ios = iosLikeMedia();
  ios.volume = 1.0;
  const oldVerdict = isVolumeApplied(1.0, ios.volume);
  const newVerdict = isVolumeSettable(iosLikeMedia());
  t.diagnostic(`[D-103] 옛 판정(스피커 1.0 · iOS) 반영됨=${oldVerdict} / 프로브 판정 iOS=${newVerdict} · 반영 가능 기기=${isVolumeSettable(settableMedia())}`);
  assert.equal(oldVerdict, true, "옛 판정이 거짓 양성이었다는 대조군");
  assert.equal(newVerdict, false);
  assert.equal(isVolumeSettable(settableMedia()), true);
});

test("[T190/D-103 배선] 폴백 <audio>는 프로브로 판정하고, 잠기면 모드를 통화로 되돌린다(aria-pressed와 상태 일치)", () => {
  const code = pageSource.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
  const start = code.indexOf("const settable = isVolumeSettable(audio);");
  assert.ok(start > 0, "폴백 음량 effect가 프로브 판정을 쓰지 않는다");
  const block = code.slice(start, code.indexOf("}, [playbackUrl, audioRoute]);", start));
  assert.ok(block.includes("if (!settable) {"));
  assert.ok(block.includes("setFallbackVolumeLocked(true);"));
  assert.ok(block.includes('setAudioRoute("call");'), "잠길 때 모드를 통화로 되돌리지 않으면 aria-pressed가 실제와 어긋난다");
  assert.equal(code.includes("isVolumeApplied(requested, audio.volume)"), false, "요청값으로 재는 옛 판정이 남았다");
});
