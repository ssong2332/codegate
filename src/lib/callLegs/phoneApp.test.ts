// 2026-11-07 실기기 신고(카드사 고급 R1) — 다통화 세션의 전화 앱 경험을 실제 휴대폰과 같게(통화 종료 ≠ 훈련 종료 · 기기 스킨 · 연락처 미리 저장 0).
// 사용자 원문: "통화 하다가 다른 곳으로 통화하라고 했을 때, 내가 통화를 종료하면 훈련이 종료가 돼서 상대방이 끊을 때까지 기다려야 하고,
// 그렇게 넘어간 화면도 실제 통화앱과 다르니까 이질감이 들고, 통화를 걸었을 때도 효과음은 나지만 검은 화면이라 실제와 경험이 다르잖아"
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OFFICIAL_LISTINGS,
  buildRecents,
  dialableDigits,
  formatCallDuration,
  formatRecentTime,
  officialNumberForTitle,
  recentSubtitle,
  searchOfficialListings,
  searchSuggestions,
} from "./phoneApp.ts";
import {
  afterHangupResponse,
  callDisplayNumber,
  hangupMeaning,
  screenAfterParticipantHangup,
  LEG_GENUINE_COPY,
} from "./legTransition.ts";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const CARD = "card-company-impersonation";

test("[R1 표] 빨간 종료의 뜻 — 다통화 통화 중 · 넘김 대기 = 그 통화만 · 메신저발 = 대화방 · 그 밖 · 끝나는 중 = 훈련 종료", () => {
  const base = { endLatched: false, messengerReturn: false, multiCall: true, legScreen: "none" as const };
  assert.equal(hangupMeaning(base), "end_leg");
  assert.equal(hangupMeaning({ ...base, legScreen: "holding" }), "end_leg");
  assert.equal(hangupMeaning({ ...base, legScreen: "dialer" }), "end_training");
  assert.equal(hangupMeaning({ ...base, endLatched: true }), "end_training");
  assert.equal(hangupMeaning({ ...base, messengerReturn: true }), "messenger");
  assert.equal(hangupMeaning({ ...base, multiCall: false }), "end_training", "한 통화 시나리오는 종전 그대로");
});

test("[R1 표] 끊은 뒤 서버 응답 — ended = 전화 앱 최근 기록 · 그 밖(서버 배포 전 · 실패) = 종전 훈련 종료", () => {
  assert.equal(afterHangupResponse({ status: "ended" }), "phone_app");
  assert.equal(afterHangupResponse({ status: "not_ready" }), "end_training");
  assert.equal(afterHangupResponse(null), "end_training");
  assert.deepEqual(screenAfterParticipantHangup(), { kind: "dialer", digits: "", view: "recents" });
});

test("[R1 미러] 공식 번호 검색 결과 = 서버 번호부의 진짜 안내 항목(번호 · 가상 기관명) · 가짜 번호 · 실제 번호 0", () => {
  const server = read("functions/src/scenarios/dialDirectory.ts");
  const names = read("functions/src/scenarios/fictionalNames.ts");
  const listings = OFFICIAL_LISTINGS[CARD];
  assert.equal(listings.length, 3);
  for (const listing of listings) assert.ok(server.includes(`number: "${listing.number}"`), `서버 번호부에 ${listing.number}가 없다`);
  assert.ok(names.includes('cardCompany: "윤슬카드"') && names.includes('supervisor: "금융감독기관"') && names.includes('office: "한빛지방검찰청"'));
  assert.ok(server.includes("`${CARD} 고객센터`") && server.includes("`${SUPERVISOR} 대표번호`") && server.includes("`${PROSECUTION} 대표번호`"));
  assert.deepEqual(
    listings.map((l) => l.title),
    ["윤슬카드 고객센터", "금융감독기관 대표번호", "한빛지방검찰청 대표번호"],
  );
  // 문자로 받은 가짜 카드사 번호는 검색에 나오지 않는다(그 번호로 다시 거는 것이 사기 수법).
  assert.ok(server.includes('{ numberId: CARD_FAKE_CALLBACK_NUMBER_ID, number: "02-0762-5513" }'));
  assert.ok(!listings.some((l) => l.number === "02-0762-5513"));
  for (const list of Object.values(OFFICIAL_LISTINGS)) {
    for (const { number } of list) assert.ok(!["1332", "1301", "112", "15881688"].includes(number.replace(/\D/g, "")), "실제 기관 번호 금지");
  }
});

test("[R1 검색] 기관 이름으로 찾는다 · 빈 검색어 = 0 · 엉뚱한 검색어 = 0 · 추천어는 2자부터", () => {
  assert.deepEqual(searchOfficialListings(CARD, "윤슬카드 고객센터").map((l) => l.number), ["02-0715-8800"]);
  assert.deepEqual(searchOfficialListings(CARD, "금융감독기관 전화번호").map((l) => l.number), ["02-0700-3324"]);
  assert.deepEqual(searchOfficialListings(CARD, "한빛 지방 검찰청").map((l) => l.number), ["02-0746-2108"]);
  assert.deepEqual(searchOfficialListings(CARD, "   "), []);
  assert.deepEqual(searchOfficialListings(CARD, "날씨"), []);
  assert.deepEqual(searchOfficialListings("unknown", "윤슬"), []);
  assert.deepEqual(searchSuggestions(CARD, "윤"), []);
  assert.deepEqual(searchSuggestions(CARD, "윤슬"), ["윤슬카드 고객센터"]);
});

test("[R1 번호 표시] 연락처가 없으니 번호가 보인다 — 건 번호 · 번호 라벨 · 기관 라벨 → 공식 번호", () => {
  assert.equal(callDisplayNumber({ label: "금융감독기관 대표번호", dialed: "0207003324" }), "02-0700-3324");
  assert.equal(callDisplayNumber({ label: "02-0762-5513" }), "02-0762-5513");
  const official = officialNumberForTitle(CARD, "금융감독기관 대표번호");
  assert.equal(official, "02-0700-3324");
  assert.equal(callDisplayNumber({ label: "금융감독기관 대표번호", officialNumber: official }), "02-0700-3324");
  assert.equal(callDisplayNumber({ label: "카드 배송 안내", officialNumber: officialNumberForTitle(CARD, "카드 배송 안내") }), "카드 배송 안내");
});

test("[R1 최근 기록] 통화 + 문자 온 번호 · 최근 것이 위 · 문자는 번호마다 1줄 · 걸 수 있는 번호만", () => {
  const recents = buildRecents(
    [
      { number: "010-0794-2261", direction: "in", atMs: 1_000, durationSec: 95 },
      { number: "02-0762-5513", direction: "out", atMs: 5_000, durationSec: 30 },
      { number: "02-0700-3324", direction: "declined", atMs: 9_000 },
    ],
    [
      { senderLabel: "02-0762-5513", arrivedAtMs: 2_000 },
      { senderLabel: "02-0762-5513", arrivedAtMs: 3_000 },
      { senderLabel: "#1588", arrivedAtMs: 0 },
    ],
  );
  assert.deepEqual(
    recents.map((r) => `${r.kind}:${r.number}`),
    ["call:02-0700-3324", "call:02-0762-5513", "sms:02-0762-5513", "call:010-0794-2261", "sms:#1588"],
  );
  assert.equal(recentSubtitle(recents[0]), "거절한 전화");
  assert.equal(recentSubtitle(recents[1]), "발신 · 30초");
  assert.equal(recentSubtitle(recents[2]), "문자 메시지");
  assert.equal(recentSubtitle(recents[3]), "수신 · 1분 35초");
  assert.equal(recentSubtitle({ kind: "call", number: "x", direction: "out", atMs: 1 }), "발신 · 연결 안 됨");
  assert.equal(dialableDigits("02-0762-5513"), "0207625513");
  assert.equal(dialableDigits("카드 배송 안내"), null);
  assert.equal(formatCallDuration(59.6), "59초");
  assert.equal(formatRecentTime(0), "");
  assert.match(formatRecentTime(new Date(2026, 10, 7, 15, 4).getTime()), /^오후 3:04$/);
  assert.match(formatRecentTime(new Date(2026, 10, 7, 0, 9).getTime()), /^오전 12:09$/);
});

test("[R1 화면] 통화 사이 화면 = 기기 스킨(통화 화면 토큰) · 검은 고정 바탕 0 · 발신 중 화면 · 전화 앱 탭 · 홈 · 검색", () => {
  const screens = read("src/components/CallLegScreens.tsx");
  const code = screens.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(code.includes("const tokens = callTokensFor(props.skin);"), "통화 화면과 같은 스킨 토큰");
  assert.ok(code.includes("background={tokens.shellGradient ?? tokens.bg}"), "발신 중 = 통화 화면 바탕");
  assert.ok(code.includes("background={ringBackground(tokens)}"), "다시 걸려 온 전화 = 수신 벨 바탕");
  assert.ok(!code.includes('const SHELL = "fixed inset-0 z-[35] flex flex-col bg-[#101418]'), "종전 검은 고정 셸 0");
  assert.ok(code.includes('"발신 중…"'));
  assert.ok(code.includes("onCancelDial") && code.includes("onDecline"), "발신 취소 · 거절은 그 통화만");
  assert.ok(code.includes('view === "recents"') && code.includes("<HomeScreen") && code.includes("<SearchScreen"));
  assert.ok(!code.includes("tel:"), "실제 전화 발신 0");
  assert.ok(!/모의|훈련용|시뮬레이션/.test(code), "세션 중 표식 낱말 0(G437)");
  for (const text of [LEG_GENUINE_COPY.defenseBody]) assert.ok(!text.includes("저장해 둔"), "연락처에 저장된 번호가 없다");
});

test("[R1 배선] 빨간 종료 → 그 통화만 끊기 · 정리 → 전사 제출 → 서버 hangup → 표대로(전화 앱 · 종전 종료) · 다시 걸려 옴 예약", () => {
  const page = read("src/app/session/play/page.tsx");
  const hangup = page.slice(page.indexOf("const handleHangup = async () => {"), page.indexOf("const handleEndedShellProceed"));
  assert.ok(hangup.includes("multiCall: multiCallSession,"));
  const leg = page.slice(page.indexOf("const hangupCurrentLeg = async"), page.indexOf("const callNumberFromPhoneApp"));
  const at = (s: string) => {
    const i = leg.indexOf(s);
    assert.ok(i >= 0, s);
    return i;
  };
  assert.ok(at("realtime.suspendForLeg();") < at("await flushTranscript(legDiag);"));
  assert.ok(at("await flushTranscript(legDiag);") < at('await startCallLeg({ sessionId, action: "hangup" });'), "서버가 발화 수를 messages로 센다 — 제출 먼저");
  assert.ok(leg.includes('if (afterHangupResponse(response) === "end_training") {\n      // 서버가 이 행동을 모른다'));
  assert.ok(leg.includes("endTrainingFromLeg();"));
  assert.ok(leg.includes("setLegScreen(screenAfterParticipantHangup());"));
  assert.ok(leg.includes('if (callbackAfterHangupRef.current) legTimeout(() => void openNextLeg("callback"), LEG_CALLBACK_DELAY_MS);'));
  // 통화 화면 종료 버튼 이름 — 다통화 세션은 "통화 종료"(훈련이 끝나지 않는다).
  assert.ok(page.includes('aria-label={returnsToMessengerOnHangup || multiCallSession ? "통화 종료" : "통화 종료 — 훈련 종료"}'));
  // 건 통화의 화면 번호 = 건 번호.
  assert.ok(page.includes("dialed: action === \"dial\" ? dialed : undefined,"));
  // 클라 계약 타입(서버 구현 전 — 서버가 모르면 invalid-argument).
  const types = read("src/lib/api/types.ts");
  assert.ok(types.includes('action: "dial" | "transfer" | "callback" | "hangup"') && types.includes('| { status: "ended" }'));
});
