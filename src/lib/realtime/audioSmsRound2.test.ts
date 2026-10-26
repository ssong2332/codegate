// ⭐ §126(2026-10-24 실기 신고 *"기본 음량이 커진 거 같고, 여전히 볼륨 조절이 안 되고, 문자가 바로 오지는 않아"* · 갤럭시 S25 크롬 · 기관 사칭 고급 3회)
// (1) '통화' 스트림(`after-mic`) 통화 모드 기준 레벨 −6dB · `?voicetrim=0` (2) 진단 `out.freshMs` · `out.trimDb`
// (3) 사기범이 **말하는 도중** "문자를 보냈다"가 보이면 턴 끝을 기다리지 않고 주장 백스톱을 묻는다.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 이 파일 안에서만 `\r\n`→`\n`으로 정규화해 읽는다(`callAudio.test.ts` 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CALL_MODE_GAIN,
  SPEAKER_MODE_GAIN,
  VOICE_STREAM_CALL_TRIM,
  callStreamTrimFor,
  liveStageFor,
  trimGainFor,
} from "./outputGain.ts";
import { readVoiceTrimFlag } from "./callAudio.ts";
import { AUDIO_DIAG_KEYS, formatDbfs } from "./audioDiagnostics.ts";
import { scammerClaimsSmsSent, shouldRequestSmsBackstop } from "./toolWindow.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("[§126 · §138 음량] '통화' 스트림 감쇠 — after-mic만 −9.1dB · 그 밖 · 플래그 끔은 1", () => {
  assert.equal(VOICE_STREAM_CALL_TRIM, 0.35);
  assert.equal(formatDbfs(VOICE_STREAM_CALL_TRIM), "-9.1");
  assert.equal(callStreamTrimFor("after-mic", true), 0.35);
  assert.equal(callStreamTrimFor("after-mic", false), 1);
  assert.equal(callStreamTrimFor("before-mic", true), 1);
  assert.equal(callStreamTrimFor("fallback-primed", true), 1);
  assert.equal(callStreamTrimFor(null, true), 1);
});

test("[§126 음량] 감쇠는 통화 모드에서만 — 스피커 모드(컴프레서 · 보정)는 무변경", () => {
  assert.equal(trimGainFor(liveStageFor(CALL_MODE_GAIN), 0.5), 0.5);
  assert.equal(trimGainFor(liveStageFor(SPEAKER_MODE_GAIN), 0.5), 1);
  assert.equal(trimGainFor(liveStageFor(CALL_MODE_GAIN), 1), 1);
});

test("[§126 음량] `?voicetrim=0`만 끈다 · 기본 켬", () => {
  assert.equal(readVoiceTrimFlag(""), true);
  assert.equal(readVoiceTrimFlag("?audiodebug=1"), true);
  assert.equal(readVoiceTrimFlag("?voicetrim=0"), false);
  assert.equal(readVoiceTrimFlag("?audiodebug=1&voicetrim=0"), false);
});

test("[§126 진단] out.freshMs · out.trimDb 행이 out.path 바로 뒤에 있다", () => {
  const i = AUDIO_DIAG_KEYS.indexOf("out.path");
  assert.deepEqual(AUDIO_DIAG_KEYS.slice(i, i + 3), ["out.path", "out.freshMs", "out.trimDb"]);
});

test("[§126 배선] 세션 — 감쇠 노드는 컴프레서와 보정 게인 사이 · 경로가 정해진 뒤 값 · 새 컨텍스트 running ms 기록", () => {
  const src = read("./GeminiVoiceSession.tsx");
  assert.ok(src.includes("compressor.connect(streamTrim);\n          streamTrim.connect(makeup);"));
  assert.ok(src.includes("streamTrimRef.current = callStreamTrimFor(outputPath, readVoiceTrimFlag(readDebugFlagSearch()));"));
  assert.ok(src.indexOf("noteOutputPath(outputPath);") < src.indexOf("streamTrimRef.current = callStreamTrimFor("));
  assert.ok(src.includes('freshOutput.state === "running" ? String(Math.round(performance.now() - freshStartedAt)) : "timeout"'));
  // 모드 전환 effect도 감쇠 노드를 갱신한다(스피커 ↔ 통화).
  assert.ok(src.includes("trimGainFor(outputVolumeRef.current, streamTrimRef.current), trimNode.context.currentTime, 0.03"));
});

test("[§126 문자] 운영 로그 형태 문장은 말하는 도중에도 주장으로 잡힌다", () => {
  assert.ok(scammerClaimsSmsSent("그럼 명의 도용 여부를 최종 확인하기 위해 방금 문자로 발송해 드린 인증번호"));
  assert.ok(!scammerClaimsSmsSent("잠시 후 문자로"));
});

test("[§126 문자] 말하는 도중 주장 — 응답 중인 발화 수(flush + 1)로 한 번 묻는다 · 같은 수로 두 번은 묻지 않는다", () => {
  const base = { enabled: true, lastRequestedUserTurns: 4, nonePending: false, inFlight: false, claimPending: true };
  assert.equal(shouldRequestSmsBackstop({ ...base, userTurns: 5, lastClaimRequestedUserTurns: 4 }), true);
  assert.equal(shouldRequestSmsBackstop({ ...base, userTurns: 5, lastClaimRequestedUserTurns: 5 }), true, "flush 질의(종전 행)는 그대로");
  assert.equal(
    shouldRequestSmsBackstop({ ...base, lastRequestedUserTurns: 5, userTurns: 5, lastClaimRequestedUserTurns: 5 }),
    false,
  );
});

test("[§126 배선] 세션은 출력 전사에서 턴당 1회 알리고 · 화면은 같은 주장을 턴 끝에서 다시 세지 않는다", () => {
  const session = read("./GeminiVoiceSession.tsx");
  assert.ok(session.includes("if (!smsClaimRaisedThisTurn && scammerClaimsSmsSent(stripLeakedThought(scammerBuffer))) {"));
  assert.ok(session.includes("handlersRef.current.onScammerSmsClaim?.(claimedUserTurns());"));
  // 선언 1 + flushTranscript · flushScammerTurn 초기화 2.
  assert.equal((session.match(/smsClaimRaisedThisTurn = false;/g) ?? []).length, 3, "선언 · flushTranscript · flushScammerTurn");
  const page = read("../../app/session/play/page.tsx");
  assert.ok(page.includes("onScammerSmsClaim={handleScammerSmsClaim}"));
  assert.ok(page.includes('if (role === "scammer" && !claimRaisedMidTurn && scammerClaimsSmsSent(text)) {'));
  assert.ok(
    page.includes(
      "userTurns: smsClaimPendingRef.current ? Math.max(counters.userTurns, smsClaimUserTurnsRef.current) : counters.userTurns,",
    ),
  );
});
