import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countUnread,
  latestSmsId,
  pickDueInCallSms,
  sortByArrival,
  spellOutOtp,
  type InCallSmsView,
} from "./inCallSms.ts";

const triggers = [
  { smsId: "a", afterScammerTurns: 3 },
  { smsId: "b", afterScammerTurns: 5 },
];

test("pickDueInCallSms: 트리거 턴에 도달하기 전에는 아무것도 도착시키지 않는다", () => {
  assert.equal(pickDueInCallSms({ triggers, scammerTurns: 0, deliveredSmsIds: [] }), null);
  assert.equal(pickDueInCallSms({ triggers, scammerTurns: 2, deliveredSmsIds: [] }), null);
});

test("pickDueInCallSms: 트리거 턴에 도달하면 그 문자를 고른다", () => {
  assert.equal(pickDueInCallSms({ triggers, scammerTurns: 3, deliveredSmsIds: [] }), "a");
});

test("pickDueInCallSms: 이미 도착한 문자는 다시 고르지 않는다(중복 도착 방지)", () => {
  assert.equal(pickDueInCallSms({ triggers, scammerTurns: 3, deliveredSmsIds: ["a"] }), null);
  assert.equal(pickDueInCallSms({ triggers, scammerTurns: 5, deliveredSmsIds: ["a"] }), "b");
  assert.equal(pickDueInCallSms({ triggers, scammerTurns: 9, deliveredSmsIds: ["a", "b"] }), null);
});

test("pickDueInCallSms: 턴 경계 이벤트를 놓쳐 훌쩍 넘어가도 문자가 조용히 건너뛰어지지 않는다(가장 이른 것부터)", () => {
  // 사기범 턴이 0 → 7로 점프한 상황(재연결·이벤트 유실). a를 건너뛰고 b부터 오면 안 된다.
  assert.equal(pickDueInCallSms({ triggers, scammerTurns: 7, deliveredSmsIds: [] }), "a");
  assert.equal(pickDueInCallSms({ triggers, scammerTurns: 7, deliveredSmsIds: ["a"] }), "b");
});

test("pickDueInCallSms: 카탈로그가 없는 시나리오(트리거 0건)에서는 아무 일도 일어나지 않는다", () => {
  assert.equal(pickDueInCallSms({ triggers: [], scammerTurns: 99, deliveredSmsIds: [] }), null);
});

test("spellOutOtp: 인증번호를 한 자씩 읽도록 띄어 쓴다(UX-027 Accessibility)", () => {
  assert.equal(spellOutOtp("482917"), "4 8 2 9 1 7");
  assert.equal(spellOutOtp(""), "");
});

const view = (over: Partial<InCallSmsView> & { smsId: string }): InCallSmsView => ({
  kind: "account",
  senderLabel: "0000-0000",
  body: "본문",
  arrivedAtMs: 0,
  ...over,
});

test("sortByArrival: 도착 순으로 정렬하고 같은 시각이면 id로 안정 정렬한다", () => {
  const sorted = sortByArrival([
    view({ smsId: "c", arrivedAtMs: 300 }),
    view({ smsId: "a", arrivedAtMs: 100 }),
    view({ smsId: "b", arrivedAtMs: 100 }),
  ]);
  assert.deepEqual(
    sorted.map((s) => s.smsId),
    ["a", "b", "c"],
  );
});

test("countUnread / latestSmsId: 미확인 배지와 기본 펼침 대상", () => {
  const items = [
    view({ smsId: "a", arrivedAtMs: 100, openedAtMs: 150 }),
    view({ smsId: "b", arrivedAtMs: 200 }),
  ];
  assert.equal(countUnread(items), 1);
  assert.equal(countUnread([]), 0);
  assert.equal(latestSmsId(items), "b");
  assert.equal(latestSmsId([]), null);
});
