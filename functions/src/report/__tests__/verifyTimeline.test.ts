// 확인 무력화 스냅샷 + 기존 순간 주석 (T83, §16.3, ADR-0009, D-51 판정표, AC-071).
//
// 이 파일이 고정하는 것은 세 가지다:
//   (1) **D-51 판정표 ①②⑤가 데이터 조건으로 1:1 번역됐다**(QA가 판정할 기준 = 코드의 모양).
//   (2) **순간을 만들지도 지우지도 않는다** — 개수·turnIndex·timeLabel·wasDeceived 불변(AC-062/007/010/011/068).
//   (3) **무력감·과신 표현이 없고 가로채기의 수단을 설명하지 않는다**(AC-071/AC-005, 역방향 확인 포함).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DeceivedMomentResult } from "../analyzeConversation";
import { pickCorrectAction } from "../analyzeConversation";
import {
  VERIFY_INTERCEPT_CORRECT_ACTION,
  VERIFY_INTERCEPT_TACTIC,
  applyVerifyIntercept,
  deriveVerifyEvents,
  resolveJudgmentAnchor,
  resolveReconnectAnchor,
  resolveVerifyOutcome,
  type VerifyTimelineSource,
} from "../verifyTimeline";
import type { SmsTimelineMessage } from "../smsTimeline";

const SESSION_CREATED_MS = 1_000_000;

/** scammer(0) user(1) scammer(2) user(3) scammer(4) user(5) — 실제 저장 형태와 같은 교대 배열. */
const messages: SmsTimelineMessage[] = [
  { role: "scammer", turnIndex: 0, createdAtMs: SESSION_CREATED_MS + 5_000 },
  { role: "user", turnIndex: 1, createdAtMs: SESSION_CREATED_MS + 12_000 },
  { role: "scammer", turnIndex: 2, createdAtMs: SESSION_CREATED_MS + 20_000 },
  { role: "user", turnIndex: 3, createdAtMs: SESSION_CREATED_MS + 30_000 },
  { role: "scammer", turnIndex: 4, createdAtMs: SESSION_CREATED_MS + 40_000 },
  { role: "user", turnIndex: 5, createdAtMs: SESSION_CREATED_MS + 52_000 },
];

const moment = (turnIndex: number): DeceivedMomentResult => ({
  turnIndex,
  timeLabel: `${turnIndex * 10}초 시점`,
  tactic: "약화된 사기 수법",
  correctAction: pickCorrectAction("약화된 사기 수법"),
  tacticCategory: "other",
});

const offer = (extra: Partial<VerifyTimelineSource> = {}): VerifyTimelineSource => ({
  offerId: "institution-verify-desk",
  deskLabel: "○○금융범죄대응센터 확인창구",
  displayNumber: "1500-0000",
  offerAnchorScammerTurn: 2,
  offeredAtMs: SESSION_CREATED_MS + 22_000,
  ...extra,
});

// ── (2) 필수 회귀 테스트 2건(§16.3.3) ──────────────────────────────────────────
test("[회귀①] 확인 문서가 0건이면 리포트 산출이 도입 전과 **완전히 동일**하다", () => {
  const moments = [moment(3), moment(5)];
  const result = applyVerifyIntercept([], moments, messages, SESSION_CREATED_MS);
  assert.deepEqual(result.deceivedMoments, moments);
  assert.deepEqual(result.verifyTimeline, []);
  assert.equal(result.annotatedCount, 0);
});

test("[회귀②] 문서는 있으나 placedAt 부재(D-51 ①)면 deceivedMoments가 **완전히 동일**하다(주석 0건)", () => {
  const moments = [moment(3), moment(5)];
  const result = applyVerifyIntercept([offer()], moments, messages, SESSION_CREATED_MS);
  assert.deepEqual(result.deceivedMoments, moments, "권유만 있었을 뿐 참가자는 걸지 않았다");
  assert.equal(result.annotatedCount, 0);
  assert.equal(result.verifyTimeline[0].outcome, "offered_not_placed");
});

// ── (1) D-51 판정표 ①②⑤ ───────────────────────────────────────────────────────
test("[D-51 ①] 권했으나 걸지 않음 → offered_not_placed · 이벤트 1건 · 되감기 진입점 미생성(AC-062)", () => {
  const result = applyVerifyIntercept([offer()], [], messages, SESSION_CREATED_MS);
  const entry = result.verifyTimeline[0];
  assert.equal(entry.outcome, "offered_not_placed");
  assert.deepEqual(
    entry.events.map((e) => e.event),
    ["verify_offer_shown"],
  );
  assert.equal(result.deceivedMoments.length, 0, "속은 순간 0건이면 되감기 진입점이 없어야 한다");
});

test("[D-51 ⑤] 걸었으나 응하지 않음 → placed_not_complied · **주석 0건** · 그래도 유효 대처는 제시된다", () => {
  const result = applyVerifyIntercept(
    [offer({ placedAtMs: SESSION_CREATED_MS + 35_000, reconnectAnchorScammerTurn: 2 })],
    // 재연결 대사(scammers[2] = turnIndex 4) **뒤**에 순간이 없다 = 응하지 않았다.
    [moment(3)],
    messages,
    SESSION_CREATED_MS,
  );
  assert.equal(result.verifyTimeline[0].outcome, "placed_not_complied");
  assert.equal(result.annotatedCount, 0, "실제로 방어에 성공한 케이스다 — 순간을 만들지 않는다");
  assert.deepEqual(result.deceivedMoments, [moment(3)]);
  // ⭐ §38.6 S3 이후 전환 이벤트는 **자기 앵커를 가진 별도 항목**에 있다.
  const reconnected = result.verifyTimeline
    .flatMap((entry) => entry.events)
    .find((e) => e.event === "verify_reconnected");
  assert.ok(reconnected, "걸었다는 사실 자체는 기록된다");
  assert.equal(
    reconnected?.correctAction,
    VERIFY_INTERCEPT_CORRECT_ACTION,
    "속지 않았어도 유효 대처가 남아야 한다(AC-071은 속았는지와 무관하게 요구)",
  );
  assert.match(reconnected?.what ?? "", /응하지 않았습니다/);
});

test("[D-51 ②] 걸고 응함 → placed_and_complied · **재연결 뒤 순간에만** 주석·덮어쓰기", () => {
  const before = moment(3);
  const after = moment(5);
  const result = applyVerifyIntercept(
    [offer({ placedAtMs: SESSION_CREATED_MS + 32_000, reconnectAnchorScammerTurn: 2 })],
    [before, after],
    messages,
    SESSION_CREATED_MS,
  );
  assert.equal(result.verifyTimeline[0].outcome, "placed_and_complied");
  assert.equal(result.annotatedCount, 1);
  // 개수·turnIndex·timeLabel 불변(구조 보호).
  assert.equal(result.deceivedMoments.length, 2);
  assert.deepEqual(
    result.deceivedMoments.map((m) => m.turnIndex),
    [3, 5],
  );
  assert.deepEqual(
    result.deceivedMoments.map((m) => m.timeLabel),
    [before.timeLabel, after.timeLabel],
  );
  // 재연결 **전** 순간은 손대지 않는다(§16.6 G28이 지목한 오분류 방지).
  assert.deepEqual(result.deceivedMoments[0], before);
  // 재연결 **뒤** 순간만 주석·덮어쓰기.
  const annotated = result.deceivedMoments[1];
  assert.equal(annotated.afterVerifyReconnect, true);
  assert.equal(annotated.tactic, VERIFY_INTERCEPT_TACTIC);
  assert.equal(annotated.tacticCategory, "verification_block");
  assert.equal(annotated.correctAction, VERIFY_INTERCEPT_CORRECT_ACTION);
});

test("[§16.6 G28] 판정 앵커는 표시 앵커가 아니다 — 재연결 대사 자체의 turnIndex다", () => {
  // reconnectAnchorScammerTurn=2 → scammers[2] = turnIndex 4가 재연결 대사.
  const judgment = resolveJudgmentAnchor(2, messages, SESSION_CREATED_MS);
  assert.equal(judgment.judgmentTurnIndex, 4);
  assert.equal(judgment.reconnectTimeLabel, "40초 시점");
  // 표시 앵커(오퍼)는 같은 값이 아니다 — 오퍼는 권유 대사 **바로 앞**에 놓인다.
  const entry = applyVerifyIntercept([offer()], [], messages, SESSION_CREATED_MS).verifyTimeline[0];
  assert.equal(entry.anchorTurnIndex, 2, "offerAnchorScammerTurn=2 → scammers[1] = turnIndex 2");
  assert.equal(entry.anchorResolved, true);
  assert.equal(entry.timeLabel, "20초 시점");
});

test("[§16.3.2] 재연결 대사가 아직 없으면 판정 앵커는 null이고 **주석 0건**이다", () => {
  // reconnectAnchorScammerTurn=3 → scammers[3]은 존재하지 않는다(사기범 문서는 3건).
  assert.equal(resolveJudgmentAnchor(3, messages, SESSION_CREATED_MS).judgmentTurnIndex, null);
  const result = applyVerifyIntercept(
    [offer({ placedAtMs: SESSION_CREATED_MS + 60_000, reconnectAnchorScammerTurn: 3 })],
    [moment(5)],
    messages,
    SESSION_CREATED_MS,
  );
  assert.equal(result.annotatedCount, 0);
  assert.equal(result.verifyTimeline[0].outcome, "placed_not_complied");
  assert.deepEqual(result.deceivedMoments, [moment(5)]);
});

test("앵커 미해결(전사 누락 등)은 조용히 버리지 않고 anchorResolved:false로 고지한다(P-4)", () => {
  const entry = applyVerifyIntercept(
    [offer({ offerAnchorScammerTurn: 99 })],
    [],
    messages,
    SESSION_CREATED_MS,
  ).verifyTimeline[0];
  assert.equal(entry.anchorResolved, false);
});

test("resolveVerifyOutcome 판정표 — 위에서 첫 매치", () => {
  assert.equal(resolveVerifyOutcome(false, 0), "offered_not_placed");
  assert.equal(resolveVerifyOutcome(false, 2), "offered_not_placed", "걸지 않았으면 응낙도 없다");
  assert.equal(resolveVerifyOutcome(true, 0), "placed_not_complied");
  assert.equal(resolveVerifyOutcome(true, 1), "placed_and_complied");
});

// ── (3) 무력감 방지·수단 미설명(AC-071/AC-005/D-52) ────────────────────────────
const ALL_SERVER_COPY = [
  VERIFY_INTERCEPT_CORRECT_ACTION,
  ...deriveVerifyEvents(offer(), "offered_not_placed").flatMap((e) => [e.what, e.correctAction ?? ""]),
  ...deriveVerifyEvents(
    offer({ placedAtMs: 1 }),
    "placed_and_complied",
  ).flatMap((e) => [e.what, e.correctAction ?? ""]),
  ...deriveVerifyEvents(
    offer({ placedAtMs: 1 }),
    "placed_not_complied",
  ).flatMap((e) => [e.what, e.correctAction ?? ""]),
];

const HELPLESSNESS = ["소용없", "막을 수 없", "어차피", "방법이 없"];

test("[AC-071/D-52] 서버 소유 문구 전체에 무력감 표현이 없다", () => {
  for (const copy of ALL_SERVER_COPY) {
    for (const banned of HELPLESSNESS) {
      assert.ok(!copy.includes(banned), `무력감 표현 금지(${banned}): ${copy}`);
    }
  }
});

test("[역검증] 무력감 표현을 넣으면 위 검사가 실패한다", () => {
  const tainted = "확인 전화를 걸어도 어차피 소용없습니다.";
  assert.ok(HELPLESSNESS.some((banned) => tainted.includes(banned)));
});

// ⚠️ 금지 대상은 **수단**이다. 결과 상황 서술("같은 요구가 이어졌습니다")은 **허용**이며 AC-071이
// 리포트 단계에서 요구하는 바다(§16.4).
const MEANS = ["착신전환", "착신 전환", "포워딩", "앱을 설치하면 통화가", "번호 목록"];

test("[AC-005/AC-071] 서버 소유 문구에 가로채기의 **수단·절차** 서술이 없다", () => {
  for (const copy of ALL_SERVER_COPY) {
    for (const means of MEANS) {
      assert.ok(!copy.includes(means), `수단 서술 금지(${means}): ${copy}`);
    }
  }
});

test("[AC-071] correctAction은 실행 가능한 대처를 **1개 이상**(실제로는 4개) 담고 신고처를 명시한다", () => {
  // ⚠️ 112·1332는 AC-071이 **명시 요구**한 신고처다 — 카탈로그에 적용되는 실존 번호 금지 규칙을
  // 이 문구에 적용하면 AC-071을 스스로 위반한다(§16.1.3 경고).
  assert.ok(VERIFY_INTERCEPT_CORRECT_ACTION.includes("112"));
  assert.ok(VERIFY_INTERCEPT_CORRECT_ACTION.includes("1332"));
  assert.ok(VERIFY_INTERCEPT_CORRECT_ACTION.includes("다른 기기"));
  assert.ok(VERIFY_INTERCEPT_CORRECT_ACTION.includes("이미 알고 있는 번호"));
  assert.ok(VERIFY_INTERCEPT_CORRECT_ACTION.includes("창구"));
});

test("[§16.6 G27] 덮어쓰기가 없으면 '확인 전화를 걸라'는 해로운 조언이 나간다 — 실측 대조", () => {
  // 이 단언이 이 기능의 **출발점**이다: pickCorrectAction의 첫 규칙이 확인 무력화 순간에 붙으면
  // 방금 확인 전화가 소용없던 참가자에게 "확인 전화를 걸라"고 답하는 꼴이 된다.
  const naive = pickCorrectAction(VERIFY_INTERCEPT_TACTIC);
  assert.match(naive, /직접 전화해 사실을 확인하세요/);
  assert.notEqual(naive, VERIFY_INTERCEPT_CORRECT_ACTION);

  const result = applyVerifyIntercept(
    [offer({ placedAtMs: 1, reconnectAnchorScammerTurn: 2 })],
    [moment(5)],
    messages,
    SESSION_CREATED_MS,
  );
  assert.equal(result.deceivedMoments[0].correctAction, VERIFY_INTERCEPT_CORRECT_ACTION);
  assert.ok(!/직접 전화해 사실을 확인하세요/.test(result.deceivedMoments[0].correctAction));
});

test("[ADR-0009] 스냅샷에 모델 지시·원시 타임스탬프·발신 필드가 실리지 않는다", () => {
  const entry = applyVerifyIntercept(
    [offer({ placedAtMs: 1, reconnectAnchorScammerTurn: 2 })],
    [],
    messages,
    SESSION_CREATED_MS,
  ).verifyTimeline[0] as unknown as Record<string, unknown>;
  for (const banned of [
    "announceInstruction",
    "reconnectInstruction",
    "offeredAt",
    "offeredAtMs",
    "placedAt",
    "placedAtMs",
    "url",
    "tel",
  ]) {
    assert.equal(entry[banned], undefined, `스냅샷 금지 필드: ${banned}`);
  }
  // ⭐ T110(§22.3 하위호환) — 이 fixture는 **과거 문서**를 흉내 낸다(`displayNumber` 보유).
  // 값이 있으면 그대로 통과시켜 *"그때 실제로 본 번호"* 를 정직하게 보여준다. **백필 0건.**
  assert.equal(entry.displayNumber, "1500-0000", "과거 문서의 번호는 표시용으로 그대로 실린다");
});

test("[T110/§22.3] 신규 문서(번호 없음)에서는 스냅샷에 displayNumber 키 자체가 없다", () => {
  const { displayNumber: _drop, ...withoutNumber } = offer({ placedAtMs: SESSION_CREATED_MS + 40_000 });
  void _drop;
  const result = applyVerifyIntercept([withoutNumber], [moment(3)], messages, SESSION_CREATED_MS);
  const entry = result.verifyTimeline[0] as unknown as Record<string, unknown>;
  assert.ok(!("displayNumber" in entry), "호 전환 모델의 신규 리포트에는 번호가 실리지 않는다");
});

// ══════════════════════════════════════════════════════════════════════════════
// ⭐ T110 / §22.7 G88 — **리포트 서술이 세션에서 실제로 일어난 일과 같아야 한다**
// 세션은 "상대가 확인 부서로 통화를 넘겼다"인데 리포트가 "안내받은 번호로 걸었다"고 말하면
// **참가자가 겪지 않은 일을 리포트가 서술**하게 된다(기록 정직성).
// ══════════════════════════════════════════════════════════════════════════════
test("[T110/G88] 리포트 `what` 3종이 호 전환으로 서술된다 — 신규 발신 전제 0건", () => {
  const whats = [
    ...deriveVerifyEvents(offer(), "offered_not_placed"),
    ...deriveVerifyEvents(offer({ placedAtMs: 1 }), "placed_and_complied"),
    ...deriveVerifyEvents(offer({ placedAtMs: 1 }), "placed_not_complied"),
  ].map((event) => event.what);

  for (const what of whats) {
    for (const premise of [/안내받은\s*번호/, /확인\s*전화를\s*걸/, /걸어\s*보라고/]) {
      assert.ok(!premise.test(what), `폐기된 dial-out 서술이 남아 있다(${premise}): ${what}`);
    }
  }
  // ⭐ §38.6 S1 — 호 전환 서술 자체는 유지되지만 **자리가 바뀌었다**(오퍼 → 전환 이벤트).
  assert.ok(whats.some((what) => /통화를\s*넘겼습니다/.test(what)), "전환 서술은 호 전환이다");
  assert.ok(
    whats.filter((what) => /넘겨받은\s*담당자/.test(what)).length === 2,
    "전환 이후 서술 2종(응함/응하지 않음)이 모두 '넘겨받은 담당자'로 서술돼야 한다",
  );
});

test("[T110/G88 역검증] 폐기된 dial-out 서술을 되살린 샘플은 실제로 실패한다", () => {
  const tainted = "안내받은 번호로 확인 전화를 걸었고, 같은 요구가 이어졌습니다.";
  assert.ok([/안내받은\s*번호/, /확인\s*전화를\s*걸/].some((premise) => premise.test(tainted)));
});

// ══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §38.6 S1·S3 (E1) — **리포트가 일어나지 않은 전환을 단언하지 않는다 + 전환은 자기 앵커에 놓인다**
//
// 출발점(라이브 0회 실측, 오케스트레이터): `placedAt`이 **부재**인 세션의 리포트에
// *"… 확인창구로 통화를 넘겼습니다"* 가 실려 있었다. 원인은 그 문면이 `verify_offer_shown`
// (= "오퍼 카드가 떴다")에 붙어 있고 `placedAtMs` 조기 반환보다 **위**에 있었던 것이다.
// ══════════════════════════════════════════════════════════════════════════════
const TRANSFER_ASSERTION = /넘겼|넘겨받은/;

test("[§38.6 S1 / E1-ⓐ] placedAt 부재면 **어떤 이벤트 문면에도** 전환 단언이 없다", () => {
  const events = deriveVerifyEvents(offer(), "offered_not_placed");
  assert.equal(events.length, 1, "전환이 없으면 이벤트는 오퍼 1건뿐이다");
  for (const event of events) {
    assert.ok(
      !TRANSFER_ASSERTION.test(event.what),
      `전환한 적 없는 세션에 전환 단언이 남아 있다: ${event.what}`,
    );
  }
  // 스냅샷 종단에서도 같아야 한다(applyVerifyIntercept 경유 — 화면이 읽는 값 그대로).
  const timeline = applyVerifyIntercept([offer()], [], messages, SESSION_CREATED_MS).verifyTimeline;
  assert.equal(timeline.length, 1, "전환이 없으면 항목도 1건이다");
  for (const what of timeline.flatMap((entry) => entry.events).map((e) => e.what)) {
    assert.ok(!TRANSFER_ASSERTION.test(what), `스냅샷에 전환 단언이 남아 있다: ${what}`);
  }
});

test("[§38.6 S1 역검증] 종전 문면(오퍼에 전환 단언)을 되살린 샘플은 위 검사에 실제로 걸린다", () => {
  const previous = "상대가 '확인 부서로 바로 연결해 드리겠다'며 ○○확인창구로 통화를 넘겼습니다.";
  assert.ok(
    TRANSFER_ASSERTION.test(previous),
    "역검증이 죽어 있으면 S1은 조용히 되돌아갈 수 있다",
  );
});

test("[§38.6 S1] placedAt이 **있으면** 전환은 그대로 서술된다(정보 손실 0건)", () => {
  for (const outcome of ["placed_and_complied", "placed_not_complied"] as const) {
    const whats = deriveVerifyEvents(offer({ placedAtMs: 1 }), outcome).map((e) => e.what);
    assert.ok(
      whats.some((what) => /통화를\s*넘겼습니다/.test(what)),
      `전환이 실제로 있었던 경로에서는 전환을 서술해야 한다(${outcome})`,
    );
  }
});

test("[§38.6 S3 / E1-ⓑ] 전환 이벤트는 **reconnectAnchorScammerTurn에서 해결된 앵커**를 갖는다", () => {
  // offerAnchorScammerTurn=2 → scammers[1] = turnIndex 2 / reconnectAnchorScammerTurn=2 →
  // resolveAnchor(3) = scammers[2] = turnIndex 4. **두 항목의 앵커가 서로 다르다**가 이 절의 본체다.
  const timeline = applyVerifyIntercept(
    [offer({ placedAtMs: SESSION_CREATED_MS + 32_000, reconnectAnchorScammerTurn: 2 })],
    [],
    messages,
    SESSION_CREATED_MS,
  ).verifyTimeline;

  assert.equal(timeline.length, 2, "오퍼 항목 + 전환 항목");
  assert.deepEqual(
    timeline.map((entry) => entry.events.map((e) => e.event)),
    [["verify_offer_shown"], ["verify_reconnected"]],
    "항목당 이벤트 1건 · 오퍼가 먼저(G182)",
  );
  assert.equal(timeline[0].anchorTurnIndex, 2);
  assert.equal(timeline[0].timeLabel, "20초 시점");
  assert.equal(timeline[1].anchorTurnIndex, 4, "전환은 재연결 대사 앵커에 놓인다");
  assert.equal(timeline[1].anchorResolved, true);
  assert.equal(timeline[1].reconnectTimeLabel, "40초 시점");
  assert.ok(
    timeline[0].anchorTurnIndex < timeline[1].anchorTurnIndex,
    "⭐ 전환 서술이 오퍼보다 뒤에 놓인다 — 이것이 §38.6의 '순서만 바로잡는다'의 표시 층 본체다",
  );
});

test("[§38.6 S3 역검증] 종전 배치(두 이벤트가 오퍼 앵커 하나)는 위 단언을 통과하지 못한다", () => {
  // 종전 산출을 그대로 재구성한 값 — 항목 1건 · 이벤트 2건 · 앵커 1개.
  const previous = [{ anchorTurnIndex: 2, events: ["verify_offer_shown", "verify_reconnected"] }];
  assert.notEqual(previous.length, 2);
  assert.equal(previous[0].events.length, 2, "종전에는 전환이 오퍼와 같은 앵커에 묶여 있었다");
});

test("[§38.6 S3 / 무백필] 재연결 앵커가 미해결이면 전환 항목이 anchorResolved:false로 고지된다", () => {
  // 과거 문서에는 `reconnectAnchorScammerTurn`이 아예 없을 수 있다 ⇒ 조용히 버리지 않는다(P-4).
  const timeline = applyVerifyIntercept(
    [offer({ placedAtMs: SESSION_CREATED_MS + 32_000 })],
    [],
    messages,
    SESSION_CREATED_MS,
  ).verifyTimeline;
  assert.equal(timeline.length, 2, "앵커를 못 찾아도 전환 사실 자체는 기록된다");
  assert.equal(timeline[1].anchorResolved, false);
  assert.equal(timeline[1].reconnectTimeLabel, undefined);
});

test("[§38.6 S3 / G183] resolveReconnectAnchor는 0-기반 문서 수를 1-기반 리졸버로 넘긴다", () => {
  assert.equal(
    resolveReconnectAnchor(2, messages, SESSION_CREATED_MS).anchorTurnIndex,
    4,
    "N=2 → resolveAnchor(3) → scammers[2] = turnIndex 4",
  );
  // ⛔ 음수·부재를 `N + 1`로 만들면 -1이 "대화 맨 앞(resolved:true)"으로 **잘못 해결**된다.
  assert.equal(resolveReconnectAnchor(-1, messages, SESSION_CREATED_MS).anchorResolved, false);
  assert.equal(resolveReconnectAnchor(undefined, messages, SESSION_CREATED_MS).anchorResolved, false);
  // 판정 앵커와 값이 갈라지지 않는다(리졸버는 하나 — §16.3.2).
  assert.equal(
    resolveJudgmentAnchor(2, messages, SESSION_CREATED_MS).judgmentTurnIndex,
    resolveReconnectAnchor(2, messages, SESSION_CREATED_MS).anchorTurnIndex,
  );
});
