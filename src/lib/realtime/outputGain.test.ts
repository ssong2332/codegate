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
  LIMITER_INPUT_RANGE,
  LIMITER_KNEE,
  SPEAKER_BOOST_GAIN,
  buildLimiterCurve,
  SPEAKER_COMPRESSOR,
  liveStageFor,
  softLimit,
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
  if (!strip(geminiSource).includes("node.gain.setTargetAtTime(outputVolumeRef.current.gain")) out.push("Gemini 게인 노드 갱신이 없다");
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

// ── 2026-10-20 실기 신고(S25 · Chrome/웨일 — "AI 음성이 작다 · 스피커 눌러도 변화 없다") ─────────────────────────────
// 가설(오케스트레이터 · 추정): #301이 받기 탭에서 미리 만든 출력 컨텍스트와, 스피커 버튼이 갱신하는 게인 노드가 서로 다른
// 그래프에 있어 스피커 전환이 재생에 닿지 않는다. 아래 판정은 그 사슬을 소스에서 한 고리씩 고정한다:
// 빌린(또는 새) outputContext → 그 컨텍스트의 outputGain → 같은 노드를 ref에 담음 → 재생 소스가 같은 노드에 연결 →
// outputVolume 변경 effect가 ref의 노드를 갱신.
function gainIdentityViolations(geminiSource: string): string[] {
  const c = geminiSource.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
  const out: string[] = [];
  // §122.2.2 — 마이크 뒤 새 출력 컨텍스트(`freshOutput`)가 앞에 온다. 그것이 없을 때 빌리기는 종전 그대로.
  if (!/outputContext =\s*freshOutput \?\?\s*\(outputBorrowed && primedOutput \? primedOutput : new AudioContext\(/.test(c)) {
    out.push("출력 컨텍스트가 미리 만든 컨텍스트를 빌리지 않는다");
  }
  if (!c.includes("outputGain = outputContext.createGain();")) out.push("게인 노드가 출력 컨텍스트에서 만들어지지 않는다");
  const refAssigns = c.match(/outputGainNodeRef\.current = [^;]+;/g) ?? [];
  const nonNull = refAssigns.filter((a) => !a.endsWith("= null;"));
  if (nonNull.length !== 1 || nonNull[0] !== "outputGainNodeRef.current = outputGain;") {
    out.push(`스피커 갱신용 ref가 재생 게인 노드와 다르다: ${JSON.stringify(nonNull)}`);
  }
  if (!c.includes("registerOutputGain(outputGain);")) out.push("진단에 재생 게인 노드를 등록하지 않는다");
  if (!c.includes("const source = outputContext.createBufferSource();")) out.push("재생 소스가 출력 컨텍스트에서 만들어지지 않는다");
  if (!c.includes("source.connect(outputGain ?? outputContext.destination)")) out.push("재생 소스가 게인 노드에 연결되지 않는다");
  const eff = c.indexOf("const node = outputGainNodeRef.current;");
  const effEnd = c.indexOf("}, [outputVolume]);", eff);
  if (eff < 0 || effEnd < 0) {
    out.push("outputVolume 변경 effect가 ref의 노드를 읽지 않는다");
  } else if (!c.slice(eff, effEnd).includes("node.gain.setTargetAtTime(outputVolumeRef.current.gain, node.context.currentTime")) {
    out.push("outputVolume 변경 effect가 노드 게인을 바꾸지 않는다");
  }
  return out;
}

test("[2026-10-20 음량 신고] 스피커 갱신 노드 = 재생 소스가 붙는 게인 노드 = 미리 만든 컨텍스트의 노드", () => {
  assert.deepEqual(gainIdentityViolations(session), []);
});

test("[2026-10-20 음량 신고 역검증] ref에 다른 노드를 담거나 · effect 의존성을 지우거나 · 빌리기를 끊으면 실패한다", (t) => {
  const otherNode = session.replace("outputGainNodeRef.current = outputGain;", "outputGainNodeRef.current = outputContext.createGain();");
  const noDeps = session.replace("}, [outputVolume]);", "}, []);");
  const noPrime = session.replace("outputBorrowed && primedOutput ? primedOutput : new AudioContext(", "new AudioContext(");
  for (const [name, poisoned] of [["otherNode", otherNode], ["noDeps", noDeps], ["noPrime", noPrime]] as const) {
    assert.notEqual(poisoned, session, `${name}: 오염 지점을 찾지 못했다`);
    const v = gainIdentityViolations(poisoned);
    t.diagnostic(`[역검증 ${name}] ${JSON.stringify(v)}`);
    assert.equal(v.length, 1, name);
  }
});

// ── §105 — 스피커 모드 증폭(실시간 Web Audio 경로) + 리미터 ─────────────────────────────────────────────
test("[§105 · §108] 실시간 경로: 통화 모드는 그대로(압축 0 · 보정 1) · 스피커 모드는 압축 + 보정 2.5(측정 상한)", () => {
  assert.deepEqual(liveStageFor(gainFor("call")), { gain: CALL_MODE_GAIN, compressorRatio: 1, makeup: 1 });
  assert.deepEqual(liveStageFor(gainFor("speaker")), {
    gain: SPEAKER_MODE_GAIN,
    compressorRatio: SPEAKER_COMPRESSOR.ratio,
    makeup: SPEAKER_BOOST_GAIN,
  });
  // §108.1 측정 — 천장(1.0)에 닿는 샘플 0인 가장 큰 보정이 2.5였다(3.0부터 닿음). 값을 바꾸면 다시 재고 이 줄을 고친다.
  assert.equal(SPEAKER_BOOST_GAIN, 2.5);
  assert.deepEqual({ ...SPEAKER_COMPRESSOR }, { threshold: -24, knee: 6, ratio: 12, attack: 0.003, release: 0.15 });
  assert.ok(SPEAKER_BOOST_GAIN <= LIMITER_INPUT_RANGE + 1, "보정 뒤 진폭은 압축 덕분에 리미터 범위 안(측정 꼭대기 −0.1dBFS)");
  // 미디어 경로(`<audio>.volume` · ElevenLabs)는 1.0 상한 그대로(G455).
  assert.equal(gainFor("speaker"), SPEAKER_MODE_GAIN);
});

test("[§105] 리미터: 무릎(0.7)까지 그대로 · 그 위는 단조 증가 · 출력 < 1.0(클리핑 0) · 이음매 연속", () => {
  for (const a of [0, 0.1, 0.3, 0.6, LIMITER_KNEE]) assert.equal(softLimit(a), a);
  assert.equal(softLimit(-0.5), -0.5);
  let prev = softLimit(LIMITER_KNEE);
  for (let a = LIMITER_KNEE; a <= LIMITER_INPUT_RANGE; a += 0.01) {
    const y = softLimit(a);
    assert.ok(y < 1, `${a} → ${y}`);
    assert.ok(y >= prev - 1e-12, "단조");
    prev = y;
  }
  assert.ok(Math.abs(softLimit(LIMITER_KNEE + 1e-6) - (LIMITER_KNEE + 1e-6)) < 1e-6, "무릎에서 끊김 0");
  // 원본 최대(1.0) × 통화 모드(0.6) = 0.6 → 리미터 영향 0. 범위 끝까지 1.0 미만으로 눌린다.
  assert.equal(softLimit(1.0 * CALL_MODE_GAIN), CALL_MODE_GAIN);
  assert.ok(softLimit(LIMITER_INPUT_RANGE) < 1);
});

test("[§105] 리미터 곡선: 가운데 = 0 · 양끝 = ±softLimit(범위) · 입력 축 [-1,1] ↔ 진폭 [-범위, 범위]", () => {
  const curve = buildLimiterCurve();
  const mid = (curve.length - 1) / 2;
  assert.equal(curve[mid], 0);
  assert.ok(Math.abs(curve[curve.length - 1] - softLimit(LIMITER_INPUT_RANGE)) < 1e-6);
  assert.ok(Math.abs(curve[0] + softLimit(LIMITER_INPUT_RANGE)) < 1e-6);
  // 진폭 0.5 지점(입력 축 0.25)은 그대로 0.5다.
  const idx = Math.round(mid + 0.25 * mid);
  assert.ok(Math.abs(curve[idx] - 0.5) < 1e-3);
});

test("[§105 · §108 배선] Gemini 세션: 게인 → 컴프레서 → 보정 → 1/범위 → 곡선 → 출력 · prop 값은 liveStageFor를 거친다", () => {
  assert.ok(code.includes("limiterScale.gain.value = 1 / LIMITER_INPUT_RANGE;"));
  assert.ok(code.includes("limiter.curve = buildLimiterCurve();"));
  assert.ok(code.includes("outputGain.connect(compressor);"));
  assert.ok(code.includes("compressor.connect(makeup);"));
  assert.ok(code.includes("makeup.connect(limiterScale);"));
  assert.ok(!code.includes("outputGain.connect(limiterScale);"), "컴프레서를 건너뛰는 직결 0");
  assert.ok(code.includes("limiter.connect(outputContext.destination);"));
  assert.ok(code.includes("outputVolumeRef.current = liveStageFor(outputVolume ?? GEMINI_OUTPUT_GAIN);"));
  assert.ok(code.includes("applySpeakerDynamics(dynamics, outputVolumeRef.current);"), "모드 전환 때 압축 · 보정도 바뀐다");
});
