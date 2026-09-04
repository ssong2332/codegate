// §55 D3 — "말하지 않은 첫 대사"(`MessageDoc.notSpoken`)의 **클라 소비처** 회귀 고정
// (docs/Architecture.md §55.4 (1) 7·8ⓑ·9ⓓⓔⓕ).
//
// 사용자 신고 원문: *"ai가 말을 시작하기 전에 사용자에게는 안 들리지만 실제로 기록에 남는 첫
// 메세지가 존재해"*. `createSession`은 경로와 무관하게 오프닝을 `turnIndex:0`으로 쓰지만, Gemini
// Live에는 그 텍스트를 넘길 방법이 없어(firstMessage 오버라이드 부재) **실시간 경로에서는 낭독되지
// 않는다.** 그런데 리플레이·되감기는 그것을 첫 발화로 취급했다.
//
// 이 파일이 고정하는 것:
//   ⓑ **차단** — `buildReplayTimeline`이 `notSpoken` 행을 타임라인에 넣지 않는다.
//   ⓓ ⭐ **역검증 · 앵커 불변(G350)** — 그 행을 표시에서 빼도 문자·확인·모의화면 카드의
//     `anchorTurnIndex`와 **배치 순서**가 한 칸도 밀리지 않는다. ⛔ 앵커는 서버가 문서 **개수**로
//     계산한 값이고 그 문서는 지워지지도 재인덱싱되지도 않았다(G348).
//   ⓔ ⭐ **역검증 · 회귀 0** — 필드가 없는 입력의 산출물이 도입 전과 완전히 동일하다.
//   ⓕ ⭐ **역검증 · 폴백 보존** — 마크가 없는 세션(폴백·ElevenLabs)에서는 첫 말풍선이 그대로 남는다.
//     ⛔ 이것이 후보 C2(`turnIndex:0`을 **무조건** 숨기기)를 막는 자리다 — 그 경로에서는 그 대사가
//     실제로 재생·표시되므로, 무조건 숨기면 **진짜 발화를 지운다**.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReplayTimeline,
  type ReplayMessageSource,
  type ReplayMockScreenSource,
  type ReplaySmsSource,
  type ReplayVerifySource,
} from "./buildReplayTimeline.ts";
import { buildRewindContext, type RewindMessageSource } from "../rewind/buildRewindContext.ts";

const OPENING_TEXT = "여보세요...? 고객님 계좌가 지금 위험합니다.";

/** 실시간(Gemini) 세션의 실제 모양 — `turnIndex:0`이 낭독되지 않은 오프닝이고 그 뒤가 전사다. */
const MESSAGES: ReplayMessageSource[] = [
  { id: "m0", role: "scammer", textMasked: OPENING_TEXT, turnIndex: 0, notSpoken: true },
  { id: "m1", role: "scammer", textMasked: "안녕하세요, 금융감독원입니다.", turnIndex: 1 },
  { id: "m2", role: "user", textMasked: "네 알겠습니다.", turnIndex: 2 },
  { id: "m3", role: "scammer", textMasked: "계좌 이체를 도와드리겠습니다.", turnIndex: 3 },
];

/** 같은 대화에서 마크만 없는 판본(폴백·ElevenLabs 세션 = 그 대사가 실제로 낭독된 경우). */
const MESSAGES_SPOKEN: ReplayMessageSource[] = MESSAGES.map(
  ({ notSpoken: _notSpoken, ...rest }) => rest,
);

const SMS: ReplaySmsSource = {
  smsId: "sms-1",
  kind: "account",
  senderLabel: "0507-000-0000",
  body: "안내드린 계좌입니다.",
  anchorTurnIndex: 1,
  anchorResolved: true,
  events: [{ event: "sms_arrived", what: "문자가 도착했습니다." }],
};

const VERIFY: ReplayVerifySource = {
  offerId: "verify-1",
  deskLabel: "○○은행 금융사고대응 확인창구",
  anchorTurnIndex: 1,
  anchorResolved: true,
  outcome: "placed_and_complied",
  events: [{ event: "verify_reconnected", what: "상대가 통화를 넘겼습니다." }],
};

const MOCK_SCREEN: ReplayMockScreenSource = {
  landingId: "landing-1",
  kind: "credential-form",
  anchorTurnIndex: 3,
  anchorResolved: true,
  consented: true,
};

test("§55 D3 ⓑ: 낭독되지 않은 오프닝은 리플레이 타임라인에 들어가지 않는다", () => {
  const timeline = buildReplayTimeline(MESSAGES, []);
  const messageIds = timeline.filter((i) => i.kind === "message").map((i) => i.id);

  assert.deepEqual(messageIds, ["m1", "m2", "m3"]);
  // 첫 말풍선이 **실제 첫 마디**여야 한다(사용자 신고의 정확한 지점).
  const first = timeline[0];
  assert.equal(first.kind, "message");
  assert.equal(first.kind === "message" ? first.textMasked : "", "안녕하세요, 금융감독원입니다.");
});

test("⭐ 역검증 ⓕ: 마크가 없으면(폴백·ElevenLabs) 첫 말풍선이 그대로 남는다", () => {
  const timeline = buildReplayTimeline(MESSAGES_SPOKEN, []);
  const messageIds = timeline.filter((i) => i.kind === "message").map((i) => i.id);

  assert.deepEqual(messageIds, ["m0", "m1", "m2", "m3"]);
});

test("⭐ 역검증 ⓔ: 필드가 없는 입력의 산출물은 도입 전과 완전히 동일하다(회귀 0)", () => {
  const withField = buildReplayTimeline(MESSAGES_SPOKEN, [], [SMS], [VERIFY], [MOCK_SCREEN]);
  // 필드를 아예 모르는 과거 데이터 모양(스프레드로 만든 동일 객체)과 결과가 같아야 한다.
  const legacy = buildReplayTimeline(
    MESSAGES_SPOKEN.map((m) => ({ ...m })),
    [],
    [SMS],
    [VERIFY],
    [MOCK_SCREEN],
  );
  assert.deepEqual(withField, legacy);
});

test("⭐⭐ 역검증 ⓓ(G350): 오프닝을 표시에서 빼도 카드 앵커·배치가 한 칸도 밀리지 않는다", () => {
  const marked = buildReplayTimeline(MESSAGES, [], [SMS], [VERIFY], [MOCK_SCREEN]);
  const spoken = buildReplayTimeline(MESSAGES_SPOKEN, [], [SMS], [VERIFY], [MOCK_SCREEN]);

  const anchors = (items: ReturnType<typeof buildReplayTimeline>) =>
    items.filter((i) => i.kind !== "message").map((i) => [i.kind, i.turnIndex]);

  // ① 앵커 값 자체가 같다 — 필터는 앵커 계산에 전혀 전파되지 않는다.
  assert.deepEqual(anchors(marked), anchors(spoken));
  assert.deepEqual(anchors(marked), [
    ["sms", 1],
    ["verify", 1],
    ["mockScreen", 3],
  ]);

  // ② 카드가 **여전히 같은 메시지 뒤**에 온다(한 턴 밀리지 않았다).
  const kinds = marked.map((i) => (i.kind === "message" ? `msg:${i.id}` : i.kind));
  assert.deepEqual(kinds, ["msg:m1", "sms", "verify", "msg:m2", "msg:m3", "mockScreen"]);
});

// --- 소비 ③(클라 되감기, UX-028) ---------------------------------------------------------------

const REWIND_MESSAGES: RewindMessageSource[] = [
  { id: "m0", role: "scammer", textMasked: OPENING_TEXT, turnIndex: 0, notSpoken: true },
  { id: "m1", role: "scammer", textMasked: "안녕하세요, 금융감독원입니다.", turnIndex: 1 },
  { id: "m2", role: "user", textMasked: "네 알겠습니다.", turnIndex: 2 },
];

test("§55 D3: 되감기 맥락 창에 낭독되지 않은 오프닝이 들어오지 않는다", () => {
  const moment = { turnIndex: 2, timeLabel: "9초 시점", tactic: "기관 사칭", correctAction: "끊는다" };
  const context = buildRewindContext(REWIND_MESSAGES, moment);

  assert.deepEqual(context.turns.map((t) => t.id), ["m1", "m2"]);
  // 강조 대사(그 순간 사기범이 한 말)도 실제로 들린 대사여야 한다.
  assert.equal(context.scammerLine?.id, "m1");
  assert.equal(context.hasMoreBefore, false, "빠진 행이 '맥락 더 보기'로 되살아나면 안 된다");
});

test("⭐ 역검증: 마크가 없으면 되감기 맥락이 도입 전과 동일하다(회귀 0)", () => {
  const spoken: RewindMessageSource[] = REWIND_MESSAGES.map(
    ({ notSpoken: _notSpoken, ...rest }) => rest,
  );
  const moment = { turnIndex: 2, timeLabel: "9초 시점", tactic: "기관 사칭", correctAction: "끊는다" };
  const context = buildRewindContext(spoken, moment);

  assert.deepEqual(context.turns.map((t) => t.id), ["m0", "m1", "m2"]);
  assert.equal(context.scammerLine?.id, "m1");
});
