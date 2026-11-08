// 2026-11-08 Edge 재시험 9(기관 사칭 고급 fv-c5fj · One UI형 · 세션 ef7d1123) 관찰 c — 통화 종료(그 통화만 끊기)를 누르자
// "통화를 다시 연결하고 있어요…"가 뜨고 통화 화면이 남았다가 같은 번호의 수신 화면이 나왔다.
// 서버 로그(읽기만): 04:30:59.5 전사 제출 도착(콜드 스타트) → 04:31:04.8 제출 끝 → 04:31:05 `startCallLeg hangup` 도착(콜드 스타트)
// → 04:31:10.1 "레그 참가자 끊기 ended" → 04:31:40.3 callback(30초) → 04:31:41.5 connected · rejoin "callback".
// ⇒ 화면은 누른 순간부터 서버 응답까지(약 11초) 통화 화면 + 다시 연결 안내(`suspendForLeg` = 실시간 `reconnecting`)였다.
// 판정표 H · R은 `legTransition.ts`(`LEG_HANGUP_END_SCREEN_MS` · `showsReconnectingNotice`)가 소유한다.
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEG_CALLBACK_DELAY_MS, LEG_HANGUP_END_SCREEN_MS, showsReconnectingNotice } from "./legTransition.ts";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const page = read("src/app/session/play/page.tsx");
const slice = (from: string, to: string) => {
  const a = page.indexOf(from);
  const b = page.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `${from} ~ ${to}`);
  return page.slice(a, b);
};

test("[재시험 9 c 재현 · 표 R] 끊기 · 상대 끊기로 통화가 끝나는 중(종료 래치)에는 다시 연결 안내를 숨긴다 — 화면 꺼짐 뒤 다시 잇기만 보임", () => {
  // 재현 상태: 참가자 끊기 직후(suspendForLeg → reconnecting · 통화 사이 화면 아직 none · 새 통화 연결 아님 · 래치 걸림).
  assert.equal(showsReconnectingNotice({ reconnecting: true, legScreen: "none", legOpening: false, endLatched: true }), false, "R2 — 끝나는 통화");
  // 종전 행 그대로.
  assert.equal(showsReconnectingNotice({ reconnecting: false, legScreen: "none", legOpening: false, endLatched: false }), false, "R1");
  assert.equal(showsReconnectingNotice({ reconnecting: true, legScreen: "dialer", legOpening: false, endLatched: false }), false, "R3");
  assert.equal(showsReconnectingNotice({ reconnecting: true, legScreen: "holding", legOpening: false, endLatched: false }), false, "R3");
  assert.equal(showsReconnectingNotice({ reconnecting: true, legScreen: "none", legOpening: true, endLatched: false }), false, "R4");
  assert.equal(showsReconnectingNotice({ reconnecting: true, legScreen: "none", legOpening: false, endLatched: false }), true, "R5 — 화면 꺼짐 뒤 다시 잇기");
});

test("[표 R 배선] 통화 화면 안내는 종료 래치(endLatched)를 판정에 싣는다", () => {
  assert.ok(
    page.includes(
      'reconnecting={showsReconnectingNotice({ reconnecting: realtime.status === "reconnecting", legScreen: legScreen.kind, legOpening, endLatched })}',
    ),
  );
  // 끊기 · 상대 끊기(통화 사이)는 정리(suspendForLeg) 전에 래치를 건다 — 같은 핸들러 안이라 안내가 한 프레임도 보이지 않는다.
  const leg = slice("const hangupCurrentLeg = async", "const callNumberFromPhoneApp");
  assert.ok(leg.indexOf("setEndLatched(true);") < leg.indexOf("realtime.suspendForLeg();"));
  const accepted = slice("const handleScammerHangupAccepted = ", "const handleScammerHangupReady = ");
  assert.ok(accepted.includes("legEndRef.current = legEnd;") && accepted.includes("setEndLatched(true);"));
  // 래치는 새 통화 연결 때만 풀린다(그때는 legOpening이 R4로 숨긴다).
  const connect = slice("const connectLeg = ", "const openNextLeg = ");
  assert.ok(connect.indexOf("setEndLatched(false);") < connect.indexOf("setLegOpening(true);"));
});

test("[표 H] 끊은 뒤 통화 종료 화면은 짧게 · 전화 앱은 서버 응답을 기다리지 않는다 · 다시 걸려 오는 시간은 종전", () => {
  assert.ok(LEG_HANGUP_END_SCREEN_MS >= 500 && LEG_HANGUP_END_SCREEN_MS <= 2000, "H1 — 눌린 것이 보일 만큼 · 서버 지연(재시험 9 약 11초)보다 훨씬 짧게");
  assert.ok(LEG_HANGUP_END_SCREEN_MS < LEG_CALLBACK_DELAY_MS);
});

test("[재시험 9 c 재현 · 표 H 배선] 참가자 끊기 — 전화 앱 전환이 전사 제출 · 서버 끊기 응답보다 먼저 예약된다", () => {
  const leg = slice("const hangupCurrentLeg = async", "const callNumberFromPhoneApp");
  const at = (s: string) => {
    const i = leg.indexOf(s);
    assert.ok(i >= 0, s);
    return i;
  };
  // H2 — 고정 시간 뒤 전화 앱(서버 응답 대기 0). 재시험 9: 화면 전환이 `await startCallLeg` 뒤에만 있었다.
  const schedule = 'if (kind === "hangup") legTimeout(() => setLegScreen(screenAfterParticipantHangup()), LEG_HANGUP_END_SCREEN_MS);';
  assert.ok(at(schedule) < at("await flushTranscript(legDiag);"), "H2");
  assert.ok(at("clearLegTimers();") < at(schedule), "예약은 앞 타이머 정리 뒤");
  // 응답 뒤 전환은 다시 걸려 온 전화 거절 · 발신 취소만(끊기는 위 예약이 맡는다).
  assert.ok(leg.includes('if (kind !== "hangup") setLegScreen(screenAfterParticipantHangup());'));
  // H3 · H4 종전.
  assert.ok(leg.includes('if (callbackAfterHangupRef.current) legTimeout(() => void openNextLeg("callback"), LEG_CALLBACK_DELAY_MS);'));
  assert.ok(leg.includes("endTrainingFromLeg();"));
  // H6 — 가려진 통화 화면의 경과 시간이 다시 흐르지 않는다(응답 뒤 "통화 종료" 표시를 내리지 않는다).
  assert.ok(!leg.includes("setLocalHangup(false);"), "H6");
  const connect = slice("const connectLeg = ", "const openNextLeg = ");
  assert.ok(connect.includes("setLocalHangup(false);"), "H6 — 다음 통화가 연결될 때 내린다");
});

test("[표 H5 배선] 끊기 기록이 서버에 닿기 전에 건 번호는 그 기록이 끝난 뒤 서버로 간다", () => {
  const leg = slice("const hangupCurrentLeg = async", "const callNumberFromPhoneApp");
  assert.ok(leg.includes("legHangupPendingRef.current = pending;"));
  assert.ok(leg.includes("legHangupPendingRef.current = null;"));
  const open = slice("const openNextLeg = async", "const beginLegTransition = async");
  const wait = open.indexOf("await legHangupPendingRef.current;");
  assert.ok(wait >= 0 && wait < open.indexOf("await startCallLeg({ sessionId, action"), "H5 — 서버 호출 전에 기다린다");
  assert.ok(open.includes("if (!endCallMountedRef.current || isEndLatched(callEndingRef.current)) {"), "끊기 응답이 훈련 종료였으면 걸지 않는다");
});

test("[G437] 이 변경 문구에 세션 중 표식 낱말 0", () => {
  const src = read("src/lib/callLegs/legTransition.ts");
  const block = src.slice(src.indexOf("export const LEG_HANGUP_END_SCREEN_MS"), src.indexOf("export function showsReconnectingNotice"));
  assert.ok(!/모의|훈련용|시뮬레이션/.test(block));
});
