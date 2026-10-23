// §112(사용자 결정 2026-10-23 *"ai가 먼저 끊는 경우도 메신저로 넘어가도록"*) — 화면 쪽 배선 고정.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chatEndedNotice } from "./chatPresentation.ts";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

test("[§112] 통화 화면 — 메신저발 통화의 사기범 끊기: 끊김 안내 · 전사 제출 → 역전환(followUp) → 대화방 · 실패면 종전 종료", () => {
  const play = read("src/app/session/play/page.tsx");
  const endCall = play.slice(play.indexOf("const endCall = async"), play.indexOf("const handleEndTraining"));
  const branchLine =
    'if (ending.endedBy === "scammer" && returnsToMessengerOnHangup && (await returnToMessengerAfterScammerHangup(noticeWait))) return;';
  const branchAt = endCall.indexOf(branchLine);
  assert.ok(branchAt > 0, "사기범 끊기 대화방 분기가 없다");
  // 끊김 안내(noticeWait)가 분기보다 먼저 · 종전 종료 순서(전사 제출 try)가 뒤다(실패하면 그대로 종료).
  assert.ok(endCall.indexOf("noticeWait = waitForEndStep(") < branchAt);
  assert.ok(branchAt < endCall.indexOf("const flushDone = flushTranscript();"));
  const helper = play.slice(play.indexOf("const returnToMessengerAfterScammerHangup = async"), play.indexOf("const handleScammerHangupAccepted"));
  assert.match(helper, /await Promise\.all\(\[flushTranscript\(\), noticeWait \?\? Promise\.resolve\(\)\]\);\s*const result = await requestReverseEscalation\(\{ sessionId, followUp: true \}\);/);
  assert.match(helper, /if \(endCallMountedRef\.current\) router\.push\("\/session\/messenger"\);\s*return true;/);
  assert.match(helper, /catch \{\s*return false;/);
  // 폴백 끊기(scammerHungUp)도 같은 종료 순서(endCall("scammer") · 마지막 대사 재생 뒤)를 탄다.
  assert.match(play, /if \(result\.scammerHungUp === true\) \{\s*if \(result\.audioUrl\) setPlaybackUrl\(result\.audioUrl\);\s*void endCall\("scammer", \{ fallbackLastLine: \{ hasAudio: Boolean\(result\.audioUrl\) \} \}\);/);
});

test("[§112] 대화방 — 이미 끝난 세션이 사기범 종료면 '상대방이 채팅방을 나갔습니다'(카톡형) · '상대가 더 이상 답장하지 않습니다'(문자형)", () => {
  const messenger = read("src/app/session/messenger/page.tsx");
  assert.match(messenger, /setEndedByScammer\(data\.endReason === "scammer_ended"\);/);
  assert.match(messenger, /chatEndedNotice\(pending\?\.outcome\?\.scammerEnded === true \|\| endedByScammer, isSms \? "sms" : "kakao"\)/);
  assert.equal(chatEndedNotice(true, "kakao"), "상대방이 채팅방을 나갔습니다.");
  assert.equal(chatEndedNotice(true, "sms"), "상대가 더 이상 답장하지 않습니다.");
});
