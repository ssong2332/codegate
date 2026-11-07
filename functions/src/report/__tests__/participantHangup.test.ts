// 사용자 결정 2026-11-07("방어로 집계 (권장)") — 참가자가 먼저 끊은 것 = 잘 대처함(그 전에 속은 순간이 없을 때만). `participantHangup.ts` P1~P4.
// 대화 문장은 Edge 시험 판 27 · 30(docs/research/edge-scenario-test-2026-11-07.md) 그대로의 꼴을 쓴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { resolveParticipantHangup } from "../participantHangup";
import { SCENARIO_PROMPTS } from "../../scenarios";

const t0 = 1_000_000;
const CARD = SCENARIO_PROMPTS["card-company-impersonation"]!.weakenedTactics;
const m = (turnIndex: number, role: "scammer" | "user", textMasked: string, sec: number, legIndex = 0): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: t0 + sec * 1000,
  legIndex,
});
const decide = (messages: AnalysisMessage[], relay: Parameters<typeof resolveParticipantHangup>[0]["relay"]) => {
  const { deceivedMoments } = analyzeConversation(messages, t0, CARD);
  return { deceivedMoments, hangup: resolveParticipantHangup({ relay, messages, deceivedMoments, baseMs: t0 }) };
};

test("[판 27] 배송원 통화에서 응하지 않고 먼저 끊음 → 잘 대처함(끊은 시각 = 그 통화 마지막 대사)", () => {
  const { deceivedMoments, hangup } = decide(
    [
      m(0, "scammer", "윤슬카드 배송원입니다. 성함이 어떻게 되세요? 오늘 카드 받으실 수 있으세요?", 5),
      m(1, "user", "카드 신청한 적 없는데요.", 15),
      m(2, "scammer", "그럼 반송 접수 안내 문자 보내 드릴 테니 거기 번호로 연락해 보세요.", 25),
    ],
    { hungUpBy: "participant", legEnded: 0, legIndex: 0 },
  );
  assert.equal(deceivedMoments.length, 0);
  assert.deepEqual(hangup, { legIndex: 0, timeLabel: "25초 시점" });
});

test("[판 30] 인증번호 요구 → 방법 질문(위험 신호) → '카드 뒷면 번호로 직접 확인' 뒤 끊음 → 잘 대처함", () => {
  const { deceivedMoments, hangup } = decide(
    [
      m(0, "scammer", "문자로 갈 인증번호를 불러주시겠어요?", 90),
      m(1, "user", "그럼 제가 뭘 해야 하나요?", 103),
      m(2, "scammer", "인증번호 여섯 자리만 불러 주시면 바로 차단해 드립니다.", 110),
      m(3, "user", "카드 뒷면 번호로 직접 확인하겠습니다.", 120),
    ],
    { hungUpBy: "participant", legEnded: 0, legIndex: 0 },
  );
  assert.equal(deceivedMoments.length, 0);
  assert.equal(hangup?.legIndex, 0);
});

test("[결정 조건] 끊기 전에 이미 속았으면 잘 대처함 0 · 속음 판정은 그대로", () => {
  const { deceivedMoments, hangup } = decide(
    [
      m(0, "scammer", "문자로 간 인증번호 여섯 자리 불러 주십시오.", 30),
      m(1, "user", "128139요", 40),
      m(2, "scammer", "확인됐습니다. 이제 안전계좌로 옮기셔야 합니다.", 50),
    ],
    { hungUpBy: "participant", legEnded: 0, legIndex: 0 },
  );
  assert.equal(deceivedMoments.length, 1);
  assert.equal(hangup, undefined);
});

test("[P2 · P3] 끊은 통화 = legEnded 레그 · 그 뒤(다른 레그)의 속은 순간은 '끊기 전'이 아니다", () => {
  const hangup = resolveParticipantHangup({
    relay: { hungUpBy: "participant", legEnded: 0, legIndex: 0 },
    messages: [{ createdAtMs: t0 + 60_000, legIndex: 0 }, { createdAtMs: t0 + 200_000, legIndex: 1 }],
    deceivedMoments: [{ timeLabel: "200초 시점" }],
    baseMs: t0,
  });
  assert.deepEqual(hangup, { legIndex: 0, timeLabel: "60초 시점" });
});

test("[P1 · 시각 없음] hungUpBy 부재 = 없음 · 메시지 0 = 순간 없을 때만 시각 없이", () => {
  assert.equal(resolveParticipantHangup({ messages: [], deceivedMoments: [], baseMs: t0 }), undefined);
  assert.equal(resolveParticipantHangup({ relay: { legEnded: 0 }, messages: [], deceivedMoments: [], baseMs: t0 }), undefined);
  assert.deepEqual(resolveParticipantHangup({ relay: { hungUpBy: "participant", legEnded: 1 }, messages: [], deceivedMoments: [], baseMs: t0 }), { legIndex: 1 });
  assert.equal(
    resolveParticipantHangup({ relay: { hungUpBy: "participant", legEnded: 1 }, messages: [], deceivedMoments: [{ timeLabel: "" }], baseMs: t0 }),
    undefined,
  );
});
