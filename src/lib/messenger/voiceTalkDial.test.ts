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
  assert.match(src, /<VoiceTalkDialScreen\n\s*name=\{scenario\.chatDisplayName \?\? callerLabel\}\n\s*status="보이스톡 연결 중…"/);
});

// §123(실기 신고 *"내가 보이스톡을 했는데, AI가 전화를 본인이 했다고 이야기하는 것도 수정하자"*) — 통화를 건 쪽에 맞춘 첫 연결 신호.
test("[§123 첫마디] 참가자가 건 보이스톡 = 받는 사람 첫마디 신호 · 사기범이 건 통화 = 종전 신호 · 재연결 = 종전", async () => {
  const { openingTurnFor, callCallerFrom, ESCALATED_CALL_OPENING_TURN, PARTICIPANT_CALLED_OPENING_TURN } = await import(
    "../realtime/escalatedOpening.ts"
  );
  assert.equal(openingTurnFor({ connectionSeq: 0, resumeTurn: null, escalatedFromMessenger: true, caller: "participant" }), PARTICIPANT_CALLED_OPENING_TURN);
  assert.equal(openingTurnFor({ connectionSeq: 0, resumeTurn: null, escalatedFromMessenger: true, caller: "scammer" }), ESCALATED_CALL_OPENING_TURN);
  assert.equal(openingTurnFor({ connectionSeq: 0, resumeTurn: null, escalatedFromMessenger: true }), ESCALATED_CALL_OPENING_TURN);
  assert.equal(openingTurnFor({ connectionSeq: 1, resumeTurn: "R", escalatedFromMessenger: true, caller: "participant" }), "R");
  assert.ok(PARTICIPANT_CALLED_OPENING_TURN.includes("네가 전화한 것이 아니다"));
  assert.ok(PARTICIPANT_CALLED_OPENING_TURN.includes("어, 전화했네? 나 지금…"));
  assert.ok(!PARTICIPANT_CALLED_OPENING_TURN.includes("네가 건 전화"));
  assert.equal(callCallerFrom(undefined), "scammer");
  assert.equal(callCallerFrom([{ from: "messenger", to: "voice", caller: "participant" }]), "participant");
  assert.equal(
    callCallerFrom([{ from: "messenger", to: "voice", caller: "participant" }, { from: "voice", to: "messenger" }, { from: "messenger", to: "voice" }]),
    "scammer",
  );
  const room = read("src/components/MessengerChatRoom.tsx");
  assert.match(room, /requestEscalation\(\{ sessionId, via: "voice_talk_dial" \}\)/);
  const play = read("src/app/session/play/page.tsx");
  assert.match(play, /if \(!voiceTalkDial\) setCallCaller\(callCallerFrom\(data\.channelHistory\)\);/);
  assert.match(play, /escalatedFromMessenger: scenario\.channel === "messenger",\n\s*caller: callCaller,/);
});

// §123(UX D-156 · 실기 신고 *"보이스톡 연결되는 과정의 웹사이트도 실제 카카오톡에서 제공하는 것과 동일하게 디자인하자"*) — 발신 화면 구성.
test("[§123 발신 화면] 전체 화면 그라데이션 · 위 프로필 · 이름 · 상태 · 아래 스피커 · 마이크 끄기 · 빨간 종료 · 로고 0 · 표식 문구 0 · 대비 하한", async () => {
  const screen = read("src/components/VoiceTalkDialScreen.tsx");
  assert.match(screen, /fixed inset-0 z-50/);
  assert.match(screen, /linear-gradient\(180deg, \$\{t\.voiceTalkBgTop\} 0%, \$\{t\.voiceTalkBgBottom\} 100%\)/);
  const order = ['name="person"', "{name}", "{status}", 'label="스피커"', 'label="마이크 끄기"', 'aria-label="보이스톡 취소"'].map((needle) => screen.indexOf(needle));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1]!)), `배치 순서: ${order.join(",")}`);
  const code = screen.replace(/\/\/.*$/gm, "");
  assert.ok(!/kakao|카카오|<img|\.png|\.svg/i.test(code), "로고 · 상표 이미지 · 이름 0");
  assert.ok(!/모의|훈련용|재현/.test(code), "세션 중 표식 문구 0(G437)");
  // 통화 화면 발신 덮개는 스피커 · 마이크 끄기를 실제 통화 상태에 묶는다(받은 뒤에도 이어진다).
  const play = read("src/app/session/play/page.tsx");
  assert.match(play, /mute=\{\{ on: muted, onToggle: handleToggleMute \}\}/);
  assert.match(play, /speaker=\{\{ on: audioRoute === "speaker", onToggle: \(\) => setAudioRoute\(/);
  const { contrastViolations, voiceTalkDialContrastPairs } = await import("../phone/skinTokens.ts");
  assert.equal(voiceTalkDialContrastPairs().length, 6);
  assert.deepEqual(contrastViolations(voiceTalkDialContrastPairs()), []);
});
