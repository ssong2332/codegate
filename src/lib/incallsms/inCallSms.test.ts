import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  countUnread,
  formatSmsClock,
  latestSmsId,
  needsTimeSeparator,
  sortByArrival,
  spellOutOtp,
  splitBodyAtOtp,
  takeNewlyVisibleSmsIds,
  threadHeaderLabel,
  sameSenderNumber,
  senderNumberOf,
  type InCallSmsView,
} from "./inCallSms.ts";

// T191(문자 도달 조건) — `pickDueInCallSms`(고정 턴 발송) 테스트 5건은 함수 폐기와 함께 지웠다. 대체 판정은
// 서버 `functions/src/inCallSms/__tests__/smsGate.test.ts`, 화면 쪽 백스톱 질의 규칙은 `src/lib/realtime/toolWindow.test.ts`.

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

// ── T190-1 — G459(함수) · 문자함 헤더 라벨 (docs/Architecture.md §74.4 · §74.14 G459 · UX D-89/D-90 · AC-061) ──
// ⚠️ 문자함의 박스 분기 배선(`splitBodyAtOtp`가 null일 때만 박스)은 T190-5(문자함 개편)가 같은 G459로 더한다.
test("[T190/G459] splitBodyAtOtp — 정확 일치 **첫 1회**로 가르고, 없으면 null(→ 박스 폴백)", () => {
  assert.deepEqual(splitBodyAtOtp("[본인확인] 인증번호 [048231]\n타인에게", "048231"), {
    before: "[본인확인] 인증번호 [",
    code: "048231",
    after: "]\n타인에게",
  });
  // 첫 1회만 — 뒤쪽 같은 숫자는 after에 남는다.
  assert.deepEqual(splitBodyAtOtp("코드 1234 다시 1234", "1234"), { before: "코드 ", code: "1234", after: " 다시 1234" });
  assert.equal(splitBodyAtOtp("본문에 코드가 없다", "048231"), null);
  assert.equal(splitBodyAtOtp("본문", undefined), null);
  assert.equal(splitBodyAtOtp("본문", ""), null);
});

test("[T190/G459 역검증 — AC-061] 본문에 코드가 없는 샘플에서 분할이 null이 아니면 '인증번호가 화면 어디에도 없는' 상태가 된다", () => {
  // 화면 규칙: 분할 성공 → 본문 안 강조 · 분할 null → 박스. 두 갈래 중 하나에는 반드시 코드가 있다.
  const shown = (body: string, code: string) => {
    const split = splitBodyAtOtp(body, code);
    return split ? split.code : code; // null이면 박스가 code를 그린다
  };
  assert.equal(shown("본문에 코드가 없다", "048231"), "048231");
  // 오염: 박스 분기를 뺀 사본(= null일 때 아무것도 안 그림)
  const shownWithoutBox = (body: string, code: string) => splitBodyAtOtp(body, code)?.code ?? "";
  assert.equal(shownWithoutBox("본문에 코드가 없다", "048231"), "", "박스 분기가 빠지면 코드가 사라진다 — G459가 막는 상태");
});

test("[T190/UX-027 v1.33 (3)] threadHeaderLabel — 모두 같은 발신처면 그 값, 섞이면 '메시지'", () => {
  assert.equal(threadHeaderLabel([]), "메시지");
  assert.equal(threadHeaderLabel([view({ smsId: "a", senderLabel: "A" }), view({ smsId: "b", senderLabel: "A" })]), "A");
  assert.equal(threadHeaderLabel([view({ smsId: "a", senderLabel: "A" }), view({ smsId: "b", senderLabel: "B" })]), "메시지");
});

test("[T190-5/UX-027 v1.33 (4)] formatSmsClock — 기기 현지 '오전/오후 h:mm' · 서버 시각 전(0)이면 null", () => {
  // 2026-10-18T06:05:00Z = KST(+9, offset -540) 15:05
  const at = Date.UTC(2026, 9, 18, 6, 5);
  assert.equal(formatSmsClock(at, -540), "오후 3:05");
  assert.equal(formatSmsClock(Date.UTC(2026, 9, 18, 15, 0), -540), "오전 12:00");
  assert.equal(formatSmsClock(Date.UTC(2026, 9, 18, 3, 9), -540), "오후 12:09");
  assert.equal(formatSmsClock(0), null);
});

test("[T190-5/UX-027 v1.33 (4)] needsTimeSeparator — 첫 문자 · 5분 이상 간격일 때만", () => {
  const t0 = Date.UTC(2026, 9, 18, 6, 0);
  assert.equal(needsTimeSeparator(null, t0), true);
  assert.equal(needsTimeSeparator(t0, t0 + 4 * 60 * 1000), false);
  assert.equal(needsTimeSeparator(t0, t0 + 5 * 60 * 1000), true);
  assert.equal(needsTimeSeparator(t0, 0), false, "시각을 모르면 구분줄을 지어내지 않는다");
});

// ⭐ S3(실기기 확인 2026-11-01) — 같은 번호 02-0762-4180인데 두 번째 문자부터 제목이 "메시지" · 말풍선 위 발신 줄이 바뀌었다(안내 이름이 문자마다 달라서).
// 실제 휴대폰은 번호로 방을 가른다 — 같은 번호 = 한 방 · 첫 문자의 발신 라벨을 제목으로 고정. 번호가 다르면 종전대로 "메시지".
test("[S3] threadHeaderLabel — 같은 번호 · 다른 안내 이름 = 첫 문자 라벨 · 다른 번호 = '메시지'", () => {
  const first = view({ smsId: "a", senderLabel: "02-0762-4180 (카드 명의보호 안내)" });
  const second = view({ smsId: "b", senderLabel: "02-0762-4180 (피해금 이관 안내)" });
  assert.equal(threadHeaderLabel([first, second]), "02-0762-4180 (카드 명의보호 안내)");
  assert.equal(threadHeaderLabel([first, view({ smsId: "c", senderLabel: "1588-0000 (통관 안내)" })]), "메시지");
  assert.equal(senderNumberOf("02-0762-4180 (피해금 이관 안내)"), "02-0762-4180");
  assert.equal(senderNumberOf("A"), "A", "안내 이름 없는 라벨");
  assert.equal(sameSenderNumber(first.senderLabel, second.senderLabel), true);
  const overlay = readFileSync("src/components/InCallSmsOverlay.tsx", "utf8").replace(/\r\n/g, "\n");
  assert.ok(overlay.includes("sorted.some((sms) => !sameSenderNumber(sms.senderLabel, sorted[0].senderLabel))"), "섞임 판정도 번호로");
  assert.ok(overlay.includes("!sameSenderNumber(previous.senderLabel, sms.senderLabel)"), "말풍선 위 발신 줄도 번호로");
});
