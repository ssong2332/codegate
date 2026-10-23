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

// §112.5(실기 신고 2026-10-23 · 크롬 · 갤럭시 S25 — *"메신저에서 통화로 넘어온 후 사용자가 전화 끊으니까 훈련이 종료되었어"*).
// 화면 경로: 빨간 종료 → handleHangup → handleRequestReverseEscalation("hangup") → realtime.stop() → 실시간 상태 "ended" → 상태 effect.
// 예전에는 그 effect가 래치 없는 "ended"를 서버 close로 읽어 endCall("remote")(종료 셸 "통화가 종료되었습니다 · 결과 확인하러 가기")로 갔다.
function realtimeEndedBranch(play: string): string {
  const at = play.indexOf('} else if (realtime.status === "ended") {');
  assert.ok(at > 0, "실시간 상태 effect의 ended 분기를 못 찾았다");
  return play.slice(at, play.indexOf("}", play.indexOf('await endCall("remote");', at)));
}

test("[§112.5] 사용자 끊기 → 대화방: 전환 표시가 realtime.stop()보다 먼저 서고, 상태 effect는 그때 endCall(remote)로 가지 않는다", () => {
  const play = read("src/app/session/play/page.tsx");
  // 1) 종료 버튼 → handleHangup → 메신저발이면 역전환(hangup).
  assert.match(play, /onClick=\{\(\) => void handleHangup\(\)\}/);
  const hangup = play.slice(play.indexOf("const handleHangup = async"), play.indexOf("const handleEndedShellProceed"));
  assert.match(hangup, /if \(returnsToMessengerOnHangup && !isEndLatched\(callEndingRef\.current\)\) \{\s*await handleRequestReverseEscalation\("hangup"\);/);
  // 2) 역전환은 전환 표시 → 멈춤 순서.
  const reverse = play.slice(play.indexOf("const handleRequestReverseEscalation = async"), play.indexOf("const handleToggleMute"));
  const flagAt = reverse.indexOf("switchingToMessengerRef.current = true;");
  assert.ok(flagAt > 0 && flagAt < reverse.indexOf("realtime.stop();"), "전환 표시가 realtime.stop() 뒤다");
  assert.match(reverse, /\} catch \{\s*switchingToMessengerRef\.current = false;/);
  // 3) 상태 effect의 ended 분기는 전환 중이면 아무것도 하지 않는다.
  const branch = realtimeEndedBranch(play);
  assert.ok(branch.indexOf("if (switchingToMessengerRef.current) return;") >= 0);
  assert.ok(branch.indexOf("if (switchingToMessengerRef.current) return;") < branch.indexOf('await endCall("remote");'));
  // 4) 사기범 끊기(§112)는 endCall 래치로 같은 effect를 막는다 — 서버 판정(decideCallReturn)은 두 경로 공통(같은 콜러블 · followUp).
  assert.match(play, /const result = await requestReverseEscalation\(\{ sessionId, followUp: true \}\);[\s\S]*const result = await requestReverseEscalation\(\{ sessionId, followUp: true \}\);/);
});

test("[§112.5 역검증] ended 분기의 전환 가드를 지운 사본은 위 검사식에 걸린다(그 사본이 신고 상태다)", () => {
  const play = read("src/app/session/play/page.tsx");
  const poisoned = play.replace("        if (switchingToMessengerRef.current) return;\n", "");
  assert.notEqual(poisoned, play, "주입 앵커가 없다");
  assert.equal(realtimeEndedBranch(poisoned).includes("if (switchingToMessengerRef.current) return;"), false);
});
