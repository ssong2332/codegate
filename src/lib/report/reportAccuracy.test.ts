// 2026-11-07 Edge 시험 — 리포트 화면이 실제로 일어난 일만, 시간순으로 보여 주게 한 수정 고정(`reportAccuracy.ts` 판정표).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareTimelineEntries } from "./timelineOrder.ts";
import {
  mockScreenDeclinedText,
  mockScreenSubmittedText,
  mockScreenWhat,
  momentAmountText,
  officialCheckText,
  participantHangupText,
  pickFirstDeceivedIndex,
  readParticipantHangup,
  readOfficialCheck,
  readScreenHeld,
  SCREEN_HELD_TITLE,
  screenHeldText,
  splitSmsEvents,
} from "./reportAccuracy.ts";

const read = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");

test("[판 9 · 26] F1 — '처음 속은 시각'은 배열 첫 순간이 아니라 실제 시각이 가장 이른 순간", () => {
  // 판 26 모양: 앵커 대사 순 배열 첫 항목이 19분 7초(이체) · 9분 28초 · 13분 45초가 뒤에 있다.
  const moments = [{ timeLabel: "1147초 시점" }, { timeLabel: "568초 시점" }, { timeLabel: "825초 시점" }];
  assert.equal(pickFirstDeceivedIndex(moments), 1);
  // 판 9 모양: 90초(시간 압박)가 앞, 76초(이체)가 뒤.
  assert.equal(pickFirstDeceivedIndex([{ timeLabel: "90초 시점" }, { timeLabel: "76초 시점" }]), 1);
});

test("F2 · F3 — 시각을 읽을 수 없으면 첫 순간(종전) · 0건이면 -1 · 같은 초면 앞쪽", () => {
  assert.equal(pickFirstDeceivedIndex([{ timeLabel: "" }, { timeLabel: "어딘가" }]), 0);
  assert.equal(pickFirstDeceivedIndex([]), -1);
  assert.equal(pickFirstDeceivedIndex([{ timeLabel: "30초 시점" }, { timeLabel: "30초 시점" }]), 0);
  assert.equal(pickFirstDeceivedIndex([{}, { timeLabel: "40초 시점" }]), 1);
});

test("[판 1 · 5] S1 — 문자 이벤트를 줄마다 나누면 다른 항목과 실제 시각 순으로 섞인다(문자별 묶음 해제)", () => {
  const sms = {
    timeLabel: "300초 시점",
    events: [
      { event: "sms_received", timeLabel: "311초 시점" },
      { event: "sms_opened", timeLabel: "322초 시점" },
      { event: "sms_link_tapped", timeLabel: "759초 시점" },
    ],
  };
  const rows = splitSmsEvents(sms).map((row, i) => ({ label: row.event.event, timeLabel: row.timeLabel, sortKey: [5, 1, i] as const }));
  const moment = { label: "moment", timeLabel: "336초 시점", sortKey: [7, 0, 0] as const };
  const later = { label: "later", timeLabel: "809초 시점", sortKey: [9, 0, 0] as const };
  const ordered = [...rows, moment, later].sort(compareTimelineEntries).map((e) => e.label);
  assert.deepEqual(ordered, ["sms_received", "sms_opened", "moment", "sms_link_tapped", "later"]);
  // 옛 리포트(이벤트 시각 없음) = 항목 시각.
  assert.equal(splitSmsEvents({ timeLabel: "50초 시점", events: [{ event: "sms_received" }] })[0]?.timeLabel, "50초 시점");
});

test("[판 19] M1~M5 — 이체 화면은 '본인확인 입력 화면 · 열었습니다'가 아니라 이체 사실 · 금액 비교로 쓴다", () => {
  assert.equal(mockScreenWhat({ kind: "credential-form", bankTransfer: true }), "훈련용 이체 화면이 표시됐습니다.");
  assert.equal(mockScreenWhat({ kind: "credential-form" }), "본인확인 입력 화면이 표시됐습니다.");
  assert.equal(mockScreenWhat({ kind: "app-install" }), "앱 설치 안내 화면이 표시됐습니다.");
  assert.equal(
    mockScreenSubmittedText({ kind: "credential-form", bankTransfer: true, submitted: true, amountComparison: "less" }),
    "이 화면에서 이체를 진행했습니다. 요구받은 금액보다 적게 보냈습니다.",
  );
  assert.equal(mockScreenSubmittedText({ kind: "credential-form", bankTransfer: true, submitted: true }), "이 화면에서 이체를 진행했습니다.");
  assert.equal(mockScreenSubmittedText({ kind: "credential-form", submitted: true }), "이 화면에서 입력 내용을 제출했습니다.");
  assert.equal(mockScreenSubmittedText({ kind: "credential-form", bankTransfer: true }), null, "제출 기록 없음 = 종전 문구");
});

test("[판 27] O1 — 공식 번호 확인 기록 읽기 · 문장(모양이 다르면 블록 0)", () => {
  const view = readOfficialCheck({ label: "윤슬카드 고객센터", number: "02-0715-8800" });
  assert.deepEqual(view, { label: "윤슬카드 고객센터", number: "02-0715-8800" });
  assert.match(officialCheckText(view!), /윤슬카드 고객센터\(02-0715-8800\)로 직접 걸어/);
  assert.equal(readOfficialCheck(undefined), null);
  assert.equal(readOfficialCheck({ label: "", number: "1" }), null);
  assert.equal(readOfficialCheck({ label: "x" }), null);
});

test("[배선] 리포트 화면이 판정 함수를 쓴다 — 첫 순간 · 문자 이벤트 펼침 · 이체 화면 문면 · 공식 번호 블록", () => {
  const page = read("src/app/report/page.tsx");
  assert.match(page, /report\.deceivedMoments\[pickFirstDeceivedIndex\(report\.deceivedMoments\)\]/);
  assert.doesNotMatch(page, /const firstDeceivedMoment = report\.deceivedMoments\[0\]/);
  assert.match(page, /splitSmsEvents\(sms\)/);
  assert.match(page, /mockScreenWhat\(mockScreen\)/);
  assert.match(page, /mockScreenSubmittedText\(mockScreen\)/);
  assert.match(page, /readOfficialCheck\(data\.officialCheck\)/);
  assert.match(page, /officialCheckText\(report\.officialCheck\)/);
});

test("[판 32] M6 · M7 — 이체 화면을 열고 보내지 않은 것은 '권한 허용' 문구가 아니다 · 설치 화면은 종전", () => {
  assert.equal(mockScreenDeclinedText({ kind: "credential-form", bankTransfer: true }), "잘 대응한 지점입니다 — 이체하지 않고 화면을 닫았습니다.");
  assert.equal(mockScreenDeclinedText({ kind: "credential-form" }), "잘 대응한 지점입니다 — 입력 내용을 보내지 않았습니다.");
  assert.equal(mockScreenDeclinedText({ kind: "app-install" }), null);
  assert.match(read("src/app/report/page.tsx"), /mockScreenDeclinedText\(mockScreen\)/);
});

test("[2026-11-07 재시험] M8 — 문자 링크 이체 화면 제출 순간 카드에 금액 문장 · 값이 없거나 이상하면 문장 0", () => {
  assert.equal(momentAmountText({ amountComparison: "less" }), "요구받은 금액보다 적게 보냈습니다.");
  assert.equal(momentAmountText({ amountComparison: "equal" }), "요구받은 금액을 그대로 보냈습니다.");
  assert.equal(momentAmountText({}), null);
  assert.equal(momentAmountText({ amountComparison: "3000000" }), null, "금액 값 같은 다른 모양은 싣지 않는다");
  assert.match(read("src/app/report/page.tsx"), /momentAmountText\(entry\.moment\)/);
});

test("[사용자 결정 2026-11-07 방어로 집계] H1 — 먼저 끊음 기록 읽기 · 문장 · 화면 배선", () => {
  assert.deepEqual(readParticipantHangup({ legIndex: 0, timeLabel: "120초 시점" }), { legIndex: 0, timeLabel: "120초 시점" });
  assert.deepEqual(readParticipantHangup({ legIndex: 2 }), { legIndex: 2 });
  assert.equal(readParticipantHangup({ legIndex: -1 }), null);
  assert.equal(readParticipantHangup(undefined), null);
  assert.equal(
    participantHangupText("2분 시점"),
    "2분 시점에 상대의 요구에 응하기 전에 먼저 전화를 끊었습니다. 의심이 들면 바로 끊는 것이 가장 빠르고 확실한 대처입니다.",
  );
  assert.match(participantHangupText(null), /^상대의 요구에 응하기 전에/);
  const page = read("src/app/report/page.tsx");
  assert.match(page, /readParticipantHangup\(data\.participantHangup\)/);
  assert.match(page, /participantHangupText\(/);
});

test("[사용자 결정 2026-11-07 잘 대처함 칸 추가] Q1 · Q2 — 보류 기록 읽기 · 제목 · 문장 · 화면 배선", () => {
  assert.deepEqual(readScreenHeld({ timeLabel: "95초 시점" }), { timeLabel: "95초 시점" });
  assert.equal(readScreenHeld({ timeLabel: "어딘가" }), null);
  assert.equal(readScreenHeld({}), null);
  assert.equal(readScreenHeld(undefined), null);
  assert.equal(readScreenHeld("95초 시점"), null);
  assert.equal(SCREEN_HELD_TITLE, "잘 대처함 · 확인 질문에 사실대로 답함");
  assert.equal(
    screenHeldText("1분 35초 시점"),
    "1분 35초 시점에 거래 전 확인 질문에 수사기관 · 금융기관의 요구를 받았다고 사실대로 답해 거래가 보류됐습니다. 수사기관 · 금융기관은 전화로 금 구매나 현금 인출을 요구하지 않습니다.",
  );
  assert.match(screenHeldText(null), /^거래 전 확인 질문에/);
  // 문진 답 · 금액을 말하지 않는다(G138 — 서버에 없다).
  assert.equal(/\d+\s?(원|g|돈)/.test(screenHeldText(null)), false);
  const page = read("src/app/report/page.tsx");
  assert.match(page, /readScreenHeld\(data\.screenHeld\)/);
  assert.match(page, /\{SCREEN_HELD_TITLE\}/);
  assert.match(page, /screenHeldText\(formatMomentLabel\(report\.screenHeld\.timeLabel\)\)/);
});
