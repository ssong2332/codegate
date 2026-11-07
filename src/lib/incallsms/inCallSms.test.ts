import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  countUnread,
  formatSmsClock,
  groupSmsThreads,
  initialThreadNumber,
  latestSmsId,
  threadKeyOf,
  threadPreviewText,
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
  // 2026-11-07 — 섞인 한 스레드(제목 "메시지" + 말풍선 위 발신 줄)를 없애고 번호별 대화방으로 나눴다. 나누는 판정도 같은 번호 판정이다.
  assert.ok(overlay.includes("const threads = groupSmsThreads(messages);"), "문자함은 번호별 대화방으로 나눈다");
  assert.ok(!overlay.includes("mixedSenders"), "한 스레드에 섞어 말풍선 위에 발신처를 다시 적는 옛 방식이 남았다");
});

// ── 2026-11-07 실기기 신고(카드사 고급 R1) — "문자 발신처는 다른데 한 곳에서 오는 걸로 되어 있다" ─────────────────
// 실제 메시지 앱 = 보낸 번호마다 대화방 하나 · 첫 화면은 번호별 목록(가장 최근이 위) · 알림을 누르면 그 번호의 대화방.
const R1 = [
  view({ smsId: "r1-a", senderLabel: "02-0762-4180", body: "[윤슬카드 배송] 반송 · 사고 접수\n접수번호 안내", arrivedAtMs: 1_000 }),
  view({ smsId: "r1-b", senderLabel: "1600-0000", body: "[윤슬카드] 보안 점검 · 원격 지원 링크", arrivedAtMs: 2_000, openedAtMs: 2_500 }),
  view({ smsId: "r1-c", senderLabel: "02-0715-8800", body: "[자산보호 안내] 안전계좌", arrivedAtMs: 3_000 }),
];

test("[11-07 묶기] 발신 번호가 다르면 대화방이 따로다 — 3번호 = 3방 · 각 방은 그 번호의 문자만", () => {
  const threads = groupSmsThreads(R1);
  assert.equal(threads.length, 3);
  for (const item of threads) {
    assert.equal(item.messages.length, 1);
    assert.equal(threadKeyOf(item.messages[0].senderLabel), item.number);
  }
  // 머리줄 = 번호만(서버가 번호만 보내면 괄호 이름이 생기지 않는다).
  assert.deepEqual(threads.map((t) => t.title).sort(), ["02-0715-8800", "02-0762-4180", "1600-0000"]);
});

test("[11-07 정렬] 목록 = 가장 최근 문자가 온 방이 위 · 방 안은 도착 순 · 입력 순서와 무관", () => {
  const extra = view({ smsId: "r1-d", senderLabel: "02-0762-4180", body: "[윤슬카드 배송] 재배송 안내", arrivedAtMs: 4_000 });
  const forward = groupSmsThreads([...R1, extra]);
  const reversed = groupSmsThreads([extra, ...R1].reverse());
  assert.deepEqual(forward.map((t) => t.number), ["02-0762-4180", "02-0715-8800", "1600-0000"]);
  assert.deepEqual(reversed.map((t) => t.number), forward.map((t) => t.number));
  const card = forward[0];
  assert.deepEqual(card.messages.map((m) => m.smsId), ["r1-a", "r1-d"], "방 안은 오래된 것부터");
  assert.equal(card.latest.smsId, "r1-d", "미리보기 · 시각은 그 방의 가장 최근 문자");
  // 같은 시각이면 smsId로 안정 정렬(결과가 흔들리지 않는다).
  const tie = groupSmsThreads([view({ smsId: "x", senderLabel: "A", arrivedAtMs: 5 }), view({ smsId: "y", senderLabel: "B", arrivedAtMs: 5 })]);
  assert.deepEqual(tie.map((t) => t.number), ["B", "A"]);
  assert.deepEqual(groupSmsThreads([]), []);
});

test("[11-07 안 읽음] 방마다 아직 열어 보지 않은 문자 수(countUnread와 같은 판정)", () => {
  const threads = groupSmsThreads([
    ...R1,
    view({ smsId: "r1-e", senderLabel: "02-0762-4180", arrivedAtMs: 6_000 }),
  ]);
  const by = Object.fromEntries(threads.map((t) => [t.number, t.unreadCount]));
  assert.deepEqual(by, { "02-0762-4180": 2, "1600-0000": 0, "02-0715-8800": 1 });
  assert.equal(threads.reduce((sum, t) => sum + t.unreadCount, 0), countUnread(threads.flatMap((t) => t.messages)));
});

test("[11-07 옛 형식 호환] `번호 (안내 이름)` 라벨 — 같은 번호면 이름이 달라도 한 방 · 제목은 첫 문자 라벨 그대로(종전 표기)", () => {
  const threads = groupSmsThreads([
    view({ smsId: "a", senderLabel: "02-0762-4180 (카드 명의보호 안내)", arrivedAtMs: 1 }),
    view({ smsId: "b", senderLabel: "02-0762-4180 (피해금 이관 안내)", arrivedAtMs: 2 }),
    view({ smsId: "c", senderLabel: "1588-0000 (통관 안내)", arrivedAtMs: 3 }),
    // 새 형식(번호만)과 옛 형식이 같은 번호로 섞여도 한 방이다.
    view({ smsId: "d", senderLabel: "02-0762-4180", arrivedAtMs: 4 }),
  ]);
  assert.deepEqual(threads.map((t) => [t.number, t.title, t.messages.map((m) => m.smsId).join("")]), [
    ["02-0762-4180", "02-0762-4180 (카드 명의보호 안내)", "abd"],
    ["1588-0000", "1588-0000 (통관 안내)", "c"],
  ]);
});

test("[11-07 처음 보일 방] 배너가 준 라벨 · 번호가 있는 방이면 그 방 · 없거나 비면 목록(null)", () => {
  const threads = groupSmsThreads(R1);
  assert.equal(initialThreadNumber(threads, "02-0715-8800"), "02-0715-8800");
  assert.equal(initialThreadNumber(threads, "02-0715-8800 (자산보호 안내)"), "02-0715-8800", "옛 꼴 라벨 전체여도 번호로 맞춘다");
  assert.equal(initialThreadNumber(threads, "010-0000-0000"), null);
  assert.equal(initialThreadNumber(threads, null), null);
  assert.equal(initialThreadNumber(threads, undefined), null);
  assert.equal(initialThreadNumber(threads, ""), null);
});

test("[11-07 미리보기] 줄바꿈을 한 칸으로 편다(잘라 내기는 화면의 두 줄 제한)", () => {
  assert.equal(threadPreviewText({ body: "[윤슬카드 배송] 반송 · 사고 접수\n\n  접수번호 안내 " }), "[윤슬카드 배송] 반송 · 사고 접수 접수번호 안내");
  assert.equal(threadPreviewText({ body: "한 줄" }), "한 줄");
});

test("[11-07 배선] 문자함 = 목록 · 대화방 · 랜딩 세 보기(hidden 토글) · 대화방 뒤로 = 목록 · 목록 뒤로 · 하단 = 통화 복귀", () => {
  const overlay = readFileSync("src/components/InCallSmsOverlay.tsx", "utf8").replace(/\r\n/g, "\n");
  assert.ok(overlay.includes('hidden={view !== "list"}'), "목록 보기");
  assert.ok(overlay.includes("useState<string | null>(() => initialThreadNumber(threads, initialThread))"), "열 때 배너가 준 방(없으면 목록)");
  assert.ok(overlay.includes('onClick={() => setView("list")}') && overlay.includes('aria-label="메시지 목록으로"'), "대화방 뒤로 = 목록");
  assert.ok(overlay.includes("onClick={() => openThreadOf(item.number)}"), "행 누름 = 그 번호의 대화방");
  assert.ok(overlay.includes('else if (view === "thread") setView("list");'), "Esc(뒤로 키) — 대화방 → 목록");
  assert.ok(overlay.includes("{threadPreviewText(item.latest)}"), "행 미리보기 = 그 방 최신 문자");
});

test("[11-07 배선] 배너 누름 = 그 문자를 보낸 번호의 대화방 · 그 밖 여는 곳 = 목록(page.tsx)", () => {
  const page = readFileSync("src/app/session/play/page.tsx", "utf8").replace(/\r\n/g, "\n");
  assert.ok(page.includes("handleOpenSmsOverlay(event.currentTarget, latestSms.senderLabel)"), "배너는 보낸 라벨을 넘긴다");
  assert.ok(page.includes("setSmsOverlayThread(thread);"), "열 때마다 방을 새로 정한다(이전 배너 값이 남지 않는다)");
  assert.ok(page.includes("initialThread={smsOverlayThread}"), "문자함에 전달");
  assert.equal((page.match(/handleOpenSmsOverlay\([^)]*latestSms/g) ?? []).length, 1, "보낸 라벨을 넘기는 곳은 배너 하나");
});
