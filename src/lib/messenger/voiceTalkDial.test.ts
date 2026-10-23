// §121(1)(UX D-154) — 사용자가 거는 보이스톡 = 발신 화면 → 상대가 받음. 판정표 · 오디오 인계 · 화면 배선을 고정한다.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearVoiceTalkDial,
  decideVoiceTalkOutcome,
  peekVoiceTalkDial,
  stashVoiceTalkDial,
  VOICE_TALK_HANDOFF_TTL_MS,
} from "./voiceTalkDial.ts";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

test("[§121 표] 통화로 이어지는 세션 = 상대가 받음 · 그 밖 = 응답 없음(#368 종전)", () => {
  assert.equal(decideVoiceTalkOutcome({ canVoiceTalk: true }), "answer");
  assert.equal(decideVoiceTalkOutcome({ canVoiceTalk: false }), "unanswered");
});

test("[§121 인계] 같은 세션 · 유효 시간 안에서만 넘겨받는다 · 엿보기는 지우지 않는다 · 비우면 없다", () => {
  clearVoiceTalkDial();
  assert.equal(peekVoiceTalkDial("s1", 0), null);
  const audio = { output: null, input: null, createdAtMs: 0 };
  stashVoiceTalkDial({ sessionId: "s1", audio, atMs: 1000 });
  assert.equal(peekVoiceTalkDial("s2", 1000), null, "다른 세션");
  assert.equal(peekVoiceTalkDial("s1", 1000 + VOICE_TALK_HANDOFF_TTL_MS + 1), null, "오래된 값");
  assert.equal(peekVoiceTalkDial("s1", 1500)?.audio, audio);
  assert.equal(peekVoiceTalkDial("s1", 1500)?.audio, audio, "개발 모드 초기화 2회에도 같은 값");
  clearVoiceTalkDial();
  assert.equal(peekVoiceTalkDial("s1", 1500), null);
});

test("[§121 대화방] 보이스톡(이어지는 세션) = 발신 처리기 · 오디오 준비가 첫 await 앞 · 실패하면 닫고 비운다", () => {
  const src = read("src/components/MessengerChatRoom.tsx");
  const body = src.slice(src.indexOf("const handleVoiceTalkDial = async () => {"), src.indexOf("// 전이 연출(P-18)"));
  assert.ok(body.length > 0);
  const prime = body.indexOf("primeCallAudio(GEMINI_OUTPUT_SAMPLE_RATE, performance.now())");
  const stash = body.indexOf("stashVoiceTalkDial({ sessionId, audio, atMs: Date.now() })");
  const firstAwait = body.indexOf("await ");
  assert.ok(prime > 0 && stash > prime && firstAwait > stash, "탭 안 동기 준비 → 맡김 → 전환 요청");
  assert.match(body, /router\.push\("\/session\/play"\)/);
  assert.match(body, /clearVoiceTalkDial\(\);\s*closePrimedCallAudio\(audio\);/);
  // "전화가 옵니다" 연출(setEscalating)은 사기범이 거는 경우에만 — 발신 처리기는 쓰지 않는다.
  assert.ok(!body.includes("setEscalating(true)"));
});

test("[§121 통화 화면] 발신이면 벨 대신 연결음 · 시간 뒤 받기 · 받을 때 맡긴 오디오를 넘겨받음 · 취소 = 역전환(복귀 메시지 없음)", () => {
  const src = read("src/app/session/play/page.tsx");
  assert.match(src, /peekVoiceTalkDial<PrimedCallAudio>\(sessionId, Date\.now\(\)\)/);
  // 실측(에뮬레이터) — 같은 세션 두 번째 보이스톡이 앞선 '받음' 기록 때문에 곧장 통화 중으로 복원됐다. 발신이면 그 기록을 보지 않는다.
  assert.match(src, /const answered =\n\s*!voiceTalkDial && \(isSessionAnswered\(sessionId\) \|\|/);
  assert.match(src, /if \(pageState !== "ready" \|\| phase !== "incoming"\) return;\n\s*\/\/ §121\(1\)[^\n]*\n\s*if \(voiceTalkDial\) return;/);
  assert.match(src, /startRingback\(voiceTalkDial\.audio\.output, RINGBACK_TONE\)/);
  assert.match(src, /if \(!voiceTalkDialCancellingRef\.current\) answerRef\.current\(\);\n\s*\}, VOICE_TALK_CONNECT_MS\);/);
  const answer = src.slice(src.indexOf("const handleAnswer = () => {"), src.indexOf("const handleDecline"));
  const adopt = answer.indexOf("primedCallAudioRef.current = voiceTalkDial.audio;");
  const guard = answer.indexOf("let primedAudio = primedCallAudioRef.current;");
  assert.ok(adopt > 0 && guard > adopt, "넘겨받기가 재진입 가드 앞");
  const cancelAt = src.indexOf("const handleCancelVoiceTalkDial = async () => {");
  assert.ok(cancelAt > src.indexOf("const handleDecline"), "비동기 취소 처리기는 받기 동기 구간(handleAnswer~handleDecline) 밖");
  const cancel = src.slice(cancelAt, src.indexOf("const handleOpenSmsOverlay"));
  assert.match(cancel, /requestReverseEscalation\(\{ sessionId \}\)/);
  assert.ok(!cancel.includes("followUp"), "사용자가 건 전화를 스스로 끊었다 — 복귀 메시지 없음");
  assert.match(src, /\{voiceTalkDial && phase === "incoming" && \(/);
  assert.match(src, /보이스톡 연결 중…/);
});
