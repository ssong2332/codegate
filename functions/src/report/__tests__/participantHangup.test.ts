// 사용자 결정 2026-11-07 — 참가자가 먼저 끊은 것 = 잘 대처함(그 전에 속은 순간이 없을 때만). `participantHangup.ts` S1~S3 · P2~P4.
//   ① "방어로 집계 (권장)" — 다통화 `relay.hungUpBy` ② "단일 통화도 집계 (권장)" — 단일 통화 = 통화 종료 버튼 서버 표식 `participantHangupButton`만(메인 지시 · G511 그대로).
// 대화 문장은 Edge 시험 판 27 · 30(docs/research/edge-scenario-test-2026-11-07.md) 그대로의 꼴을 쓴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { resolveParticipantHangup } from "../participantHangup";
import { SCENARIO_PROMPTS } from "../../scenarios";
import type { SessionDoc } from "../../shared/types";

const t0 = 1_000_000;
const CARD = SCENARIO_PROMPTS["card-company-impersonation"]!.weakenedTactics;
type HangupSession = Pick<SessionDoc, "relay" | "participantHangupButton" | "channel">;
const BUTTON: HangupSession = { participantHangupButton: true, channel: "voice" };
const m = (turnIndex: number, role: "scammer" | "user", textMasked: string, sec: number, legIndex?: number): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: t0 + sec * 1000,
  ...(legIndex !== undefined ? { legIndex } : {}),
});
const decide = (messages: AnalysisMessage[], session: HangupSession, isMultiCall: boolean) => {
  const { deceivedMoments } = analyzeConversation(messages, t0, CARD);
  return { deceivedMoments, hangup: resolveParticipantHangup({ session, isMultiCall, messages, deceivedMoments, baseMs: t0 }) };
};
const RELAY_HUNG_UP: HangupSession = { relay: { legIndex: 0, legStartUserTurns: [0], legEnded: 0, hungUpBy: "participant" } };

// 판 30(카드사 중급 · 단일 통화) — 인증번호 요구 → "그럼 제가 뭘 해야 하나요?" → 거절 → 참가자가 끊음.
const PAN30 = (legIndex?: number) => [
  m(0, "scammer", "문자로 갈 인증번호를 불러주시겠어요?", 90, legIndex),
  m(1, "user", "그럼 제가 뭘 해야 하나요?", 103, legIndex),
  m(2, "scammer", "인증번호 여섯 자리만 불러 주시면 바로 차단해 드립니다.", 110, legIndex),
  m(3, "user", "아니요, 카드 뒷면 번호로 직접 확인하겠습니다.", 120, legIndex),
];

test("[판 30 · 단일 통화 · 결정 ②] 통화 종료 버튼 표식 · 끊기 전 속음 0 → 잘 대처함(끊은 시각 = 마지막 대사)", () => {
  const { deceivedMoments, hangup } = decide(PAN30(), BUTTON, false);
  assert.equal(deceivedMoments.length, 0);
  assert.deepEqual(hangup, { legIndex: 0, timeLabel: "120초 시점" });
});

test("[S3] 단일 통화 — 표식 없음(사기범 끊기 · 한도 · 원격 끊김 · 오류 · 훈련 종료 버튼 · 표식 없는 옛 user_ended 세션) · 메신저 종료 · 0턴은 해당 없음", () => {
  assert.equal(decide(PAN30(), { channel: "voice" }, false).hangup, undefined, "표식 없음 — 옛 세션 포함(보수적)");
  assert.equal(decide(PAN30(), { participantHangupButton: true, channel: "messenger" }, false).hangup, undefined, "메신저 종료 버튼");
  assert.equal(
    decide([m(0, "scammer", "고객님, 카드 배송 건으로 연락드렸습니다.", 5)], BUTTON, false).hangup,
    undefined,
    "0턴",
  );
});

test("[판 27 · 다통화 · 결정 ①] 배송원 통화에서 응하지 않고 먼저 끊음 → 잘 대처함 · 단일 통화 사유는 보지 않는다", () => {
  const messages = [
    m(0, "scammer", "윤슬카드 배송원입니다. 성함이 어떻게 되세요? 오늘 카드 받으실 수 있으세요?", 5, 0),
    m(1, "user", "카드 신청한 적 없는데요.", 15, 0),
    m(2, "scammer", "그럼 반송 접수 안내 문자 보내 드릴 테니 거기 번호로 연락해 보세요.", 25, 0),
  ];
  const { deceivedMoments, hangup } = decide(messages, RELAY_HUNG_UP, true);
  assert.equal(deceivedMoments.length, 0);
  assert.deepEqual(hangup, { legIndex: 0, timeLabel: "25초 시점" });
  assert.equal(decide(messages, BUTTON, true).hangup, undefined, "다통화는 relay 표식만 본다");
});

test("[결정 조건] 끊기 전에 이미 속았으면 잘 대처함 0 · 속음 판정 그대로(단일 · 다통화 같음)", () => {
  const deceived = (legIndex?: number) => [
    m(0, "scammer", "문자로 간 인증번호 여섯 자리 불러 주십시오.", 30, legIndex),
    m(1, "user", "128139요", 40, legIndex),
    m(2, "scammer", "확인됐습니다. 이제 안전계좌로 옮기셔야 합니다.", 50, legIndex),
  ];
  const single = decide(deceived(), BUTTON, false);
  assert.equal(single.deceivedMoments.length, 1);
  assert.equal(single.hangup, undefined);
  const multi = decide(deceived(0), RELAY_HUNG_UP, true);
  assert.equal(multi.deceivedMoments.length, 1);
  assert.equal(multi.hangup, undefined);
});

test("[G511 판정 동일] 같은 대화를 버튼 표식만 바꿔도 속음 판정은 같다(블록만 달라진다)", () => {
  const verdicts = ([BUTTON, { channel: "voice" }] as HangupSession[]).map((session) => {
    const { deceivedMoments, hangup } = decide(PAN30(), session, false);
    return { moments: JSON.stringify(deceivedMoments), hangup: hangup !== undefined };
  });
  assert.equal(new Set(verdicts.map((v) => v.moments)).size, 1);
  assert.deepEqual(verdicts.map((v) => v.hangup), [true, false]);
});

test("[P2 · P3] 끊은 통화 = legEnded 레그 · 그 뒤(다른 레그)의 속은 순간은 '끊기 전'이 아니다 · 메시지 0 = 시각 없음", () => {
  assert.deepEqual(
    resolveParticipantHangup({
      session: RELAY_HUNG_UP,
      isMultiCall: true,
      messages: [{ createdAtMs: t0 + 60_000, legIndex: 0 }, { createdAtMs: t0 + 200_000, legIndex: 1 }],
      deceivedMoments: [{ timeLabel: "200초 시점" }],
      baseMs: t0,
    }),
    { legIndex: 0, timeLabel: "60초 시점" },
  );
  assert.deepEqual(resolveParticipantHangup({ session: RELAY_HUNG_UP, isMultiCall: true, messages: [], deceivedMoments: [], baseMs: t0 }), { legIndex: 0 });
  assert.equal(
    resolveParticipantHangup({ session: RELAY_HUNG_UP, isMultiCall: true, messages: [], deceivedMoments: [{ timeLabel: "" }], baseMs: t0 }),
    undefined,
  );
  assert.equal(resolveParticipantHangup({ session: {}, isMultiCall: true, messages: [], deceivedMoments: [], baseMs: t0 }), undefined);
});
