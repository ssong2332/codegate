// §128(2026-10-24 메인 세션 라이브 실측 — 자녀 사칭 카톡 고급 · 텍스트 폴백) — 메신저 결함 3 · 5 · 6 · 7의 화면 쪽 판정 · 배선을 고정한다.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachQueuedPhotos, releaseSessionPhotos, sessionPhotoStore } from "./sessionPhotos.ts";
import { contrastViolations, voiceTalkCallPairs, voiceTalkCallTokens } from "../phone/skinTokens.ts";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

test("[§128(6) 표] 같은 세션이면 대화방을 다시 그려도 사진 URL이 남는다 · 다른 세션 · 훈련 종료에서만 정리한다", () => {
  const revoked: string[] = [];
  const revoke = (url: string) => revoked.push(url);
  releaseSessionPhotos(undefined, revoke);
  revoked.length = 0;

  const store = sessionPhotoStore("s1", revoke);
  store.all.push("blob:a");
  store.queue.push({ url: "blob:a", minTurnIndex: 5 });
  assert.equal(attachQueuedPhotos(store, [3]), false, "보낸 시점 이전 사진 턴에는 붙지 않는다");
  assert.equal(attachQueuedPhotos(store, [5]), true);
  assert.deepEqual(store.byTurn, { 5: "blob:a" });

  // 통화 화면 → 겹친 대화방(새 컴포넌트)도 같은 보관소를 본다.
  assert.equal(sessionPhotoStore("s1", revoke), store);
  assert.deepEqual(sessionPhotoStore("s1", revoke).byTurn, { 5: "blob:a" });
  assert.deepEqual(revoked, []);

  releaseSessionPhotos("other", revoke);
  assert.deepEqual(revoked, [], "다른 세션 id면 정리하지 않는다");

  const next = sessionPhotoStore("s2", revoke);
  assert.notEqual(next, store);
  assert.deepEqual(revoked, ["blob:a"], "다른 세션을 열면 앞 세션 URL 정리");
  next.all.push("blob:b");
  releaseSessionPhotos(undefined, revoke);
  assert.deepEqual(revoked, ["blob:a", "blob:b"]);
});

test("[§128(6) 배선] 대화방은 사진 URL을 세션 보관소에 두고 언마운트 때 revoke하지 않는다 · 훈련 종료 화면이 정리한다", () => {
  const room = read("src/components/MessengerChatRoom.tsx");
  assert.match(room, /sessionId \? \{ \.\.\.sessionPhotoStore\(sessionId\)\.byTurn \} : \{\}/);
  assert.match(room, /if \(attachQueuedPhotos\(store, photoTurns\)\) setPhotoUrls\(\{ \.\.\.store\.byTurn \}\);/);
  assert.match(room, /sessionPhotoStore\(sessionId\)\.all\.push\(url\);/);
  assert.equal(room.includes("URL.revokeObjectURL"), false, "대화방 컴포넌트는 revoke하지 않는다");
  assert.match(read("src/app/session/end/page.tsx"), /releaseSessionPhotos\(\);/);
  // ⛔ 업로드 · 저장 경로 0(§113 결정).
  const store = read("src/lib/messenger/sessionPhotos.ts");
  assert.equal(/firebase|fetch\(|localStorage|sessionStorage|indexedDB/.test(store.replace(/^\/\/.*$/gm, "")), false);
});

test("[§128(5) 토큰] 보이스톡 통화 셸 — 발신 화면 그라데이션 · 둥근 사각 프로필 · 세 스킨 대비 위반 0", () => {
  for (const skin of ["ios", "samsung", "default"] as const) {
    const call = voiceTalkCallTokens(skin);
    assert.equal(call.hasAvatar, true, skin);
    assert.deepEqual(contrastViolations(voiceTalkCallPairs(skin)), [], skin);
  }
});

test("[§128(5) 배선] 참가자가 건 보이스톡 통화만 카톡 보이스톡 셸 · 번호 대신 대화방 이름", () => {
  const play = read("src/app/session/play/page.tsx");
  assert.match(play, /const voiceTalkCall = callCaller === "participant" && scenario\.channel === "messenger";/);
  assert.match(play, /voiceTalkCall \? voiceTalkCallTokens\(deviceSkin\.skin\) : callTokensFor\(deviceSkin\.skin, deviceTheme\)/);
  // §130(UX D-161 (2)) — 같은 식을 `shellBackground`로 뽑아 하단 판도 같은 바탕을 칠한다.
  assert.match(play, /const shellBackground = voiceTalkCall \? voiceTalkCallBackground\(\) : isRinging \? ringBackground\(callTokens\) : callTokens\.bg;/);
  assert.match(play, /background: shellBackground,/);
  assert.match(play, /\{voiceTalkCall \? \(scenario\.chatDisplayName \?\? callerLabel\) : callerLabel\}/);
  assert.equal(/kakao|카카오/i.test(play.replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")), false, "로고 · 상표 0");
});

test("[§128(3) 배선] 통화 위 대화방에서 사기범이 나가면 '나갔습니다' 뒤 통화를 끝내고 결과로(대화방 복귀 없음)", () => {
  const room = read("src/components/MessengerChatRoom.tsx");
  assert.match(room, /const scammerLeftDuringCall = inCall && chatEnded && pending\?\.outcome\?\.scammerEnded === true;/);
  assert.match(room, /setTimeout\(\(\) => duringCallRef\.current\?\.onScammerLeft\(\), SCAMMER_LEFT_CALL_END_MS\)/);
  const play = read("src/app/session/play/page.tsx");
  assert.match(play, /onScammerLeft: \(\) => void endCall\("scammer", \{ sessionAlreadyEnded: true \}\),/);
  assert.match(play, /returnsToMessengerOnHangup && !opts\?\.sessionAlreadyEnded && \(await returnToMessengerAfterScammerHangup/);
});

test("[§128(7) 배선] 설치 응낙 · 입력 제출 기록 뒤 사기범 먼저 보내기 요청 — 통화 겹침 중 0 · 전환 응답이면 전화 연출", () => {
  const room = read("src/components/MessengerChatRoom.tsx");
  assert.match(room, /if \(!sessionId \|\| inCall\) return;\n\s*void requestScreenActionFollowUp\(\{ sessionId, landingId \}\)/);
  assert.match(room, /const followUp = event === "consented" \|\| event === "submitted";/);
  assert.equal((room.match(/if \(followUp\) requestFollowUpAfterScreen\(landingId\);/g) ?? []).length, 2, "기록 성공 뒤(재시도 포함)");
  assert.match(room, /if \(result\.escalation\?\.toChannel === "voice"\) setEscalating\(true\);/);
  assert.match(read("src/lib/api/index.ts"), /export \{ requestScreenActionFollowUp \} from "\.\/requestScreenActionFollowUp";/);
});
