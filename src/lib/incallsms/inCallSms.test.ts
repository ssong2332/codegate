import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countUnread,
  latestSmsId,
  pickDueInCallSms,
  sortByArrival,
  spellOutOtp,
  takeNewlyVisibleSmsIds,
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

// ── T103 QA 지적 회귀 방어 — **AC-026 과다 기록** ────────────────────────────────
//
// 아코디언을 없애면서 "스레드에 그려진 문자 전부"를 열람으로 기록했더니, 문자함을 한 번 열기만
// 해도 **스크롤조차 안 한 하단 문자까지** `openedAt`이 박혔다. 서버는 그 값을 최초 1회만 세팅하고
// 되돌리지 않으며, 리포트·리플레이는 그것만 보고 *"화면에 인증번호가 표시됐습니다"* 캡션을 만든다.
// ⇒ 보지도 못한 인증번호에 "표시됐다"가 붙는다. 판정 기준은 **"뷰포트에 들어왔는가" 하나**다.

test("[T103/AC-026⭐] 뷰포트에 들어오지 않은 문자는 기록 대상이 아니다", () => {
  const picked = takeNewlyVisibleSmsIds(
    [
      { isIntersecting: true, smsId: "seen" },
      { isIntersecting: false, smsId: "below-the-fold" },
    ],
    new Set(),
  );
  assert.deepEqual(picked, ["seen"], "스크롤 아래의 문자를 열람으로 기록하면 리포트가 거짓을 말한다");
});

test("[T103/AC-026] 나중에 스크롤해 들어오면 그때 기록 대상이 된다", () => {
  const recorded = new Set<string>();
  for (const id of takeNewlyVisibleSmsIds([{ isIntersecting: false, smsId: "otp" }], recorded)) {
    recorded.add(id);
  }
  assert.deepEqual([...recorded], [], "아직 안 봤다");
  const later = takeNewlyVisibleSmsIds([{ isIntersecting: true, smsId: "otp" }], recorded);
  assert.deepEqual(later, ["otp"], "스크롤해서 들어온 순간 기록된다");
});

test("[T103/AC-026] 같은 문자를 두 번 기록하지 않는다(재교차·중복 항목 모두)", () => {
  assert.deepEqual(
    takeNewlyVisibleSmsIds([{ isIntersecting: true, smsId: "a" }], new Set(["a"])),
    [],
    "이미 보낸 건 다시 보내지 않는다",
  );
  assert.deepEqual(
    takeNewlyVisibleSmsIds(
      [
        { isIntersecting: true, smsId: "a" },
        { isIntersecting: true, smsId: "a" },
      ],
      new Set(),
    ),
    ["a"],
    "한 배치에 같은 id가 두 번 와도 한 번만",
  );
});

test("[T103/AC-026] id를 못 읽은 항목은 조용히 건너뛴다(잘못된 id를 서버로 보내지 않는다)", () => {
  assert.deepEqual(takeNewlyVisibleSmsIds([{ isIntersecting: true, smsId: undefined }], new Set()), []);
});
