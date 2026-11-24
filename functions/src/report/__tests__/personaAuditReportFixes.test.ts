// 2026-11-24 페르소나 전수 점검(실 키 90판) 묶음 ⑤ — 리포트 · 끊기 판정 결함 고정. 판정표 = docs/research/persona-audit-report-fixes-2026-11-24.md.
// 대사는 점검 결과 파일의 원문 인용(프로브 · 브라우저 B · C)이다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { buildTacticPremiseText } from "../tacticPremise";
import { resolveParticipantHangup } from "../participantHangup";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { MOCK_SCREENS } from "../../scenarios/mockScreens";
import { isVerbalTransferPending, saidTransferDone, VERBAL_TRANSFER_VARIANTS } from "../../scammerHangup/goalAction";
import { decideScammerHangup, type ScammerHangupInput } from "../../scammerHangup/decide";
import { scammerHangupGuidance, SCAMMER_HANGUP_VERBAL_TRANSFER_PENDING_GUIDANCE } from "../../scammerHangup/guidance";

const t0 = 1_000_000;
const msg = (turnIndex: number, role: "scammer" | "user", textMasked: string, sec = turnIndex * 10): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: t0 + sec * 1000,
});

function analyze(scenarioId: string, variantId: string, messages: AnalysisMessage[]) {
  const resolved = resolveSessionScenarioPrompt(scenarioId, variantId);
  assert.ok(resolved, `${scenarioId}#${variantId} 없음`);
  return analyzeConversation(messages, t0, resolved.weakenedTactics, [], undefined, buildTacticPremiseText(scenarioId));
}

test("[NQ1 · browser-c N2] 행동을 부정한 답의 '계좌번호'는 순응이 아니다 — 은행 보안 고급 거절 답에 속은 순간 0", () => {
  const result = analyze("bank-security-verify-scam", "fv-62q8", [
    msg(0, "scammer", "본인 확인을 위해 계좌번호 끝 네 자리를 불러 주시겠어요?"),
    msg(1, "user", "계좌번호 같은 거 하나도 안 불러요. 확인하고 싶으면 그쪽이 먼저 말해 보세요."),
  ]);
  assert.deepEqual(result.deceivedMoments, []);
});

test("[NQ1 대조] 부정이 없는 '계좌번호 불러 드릴게요'는 종전대로 속음", () => {
  const result = analyze("bank-security-verify-scam", "fv-62q8", [
    msg(0, "scammer", "본인 확인을 위해 계좌번호 끝 네 자리를 불러 주시겠어요?"),
    msg(1, "user", "네, 계좌번호 불러 드릴게요."),
  ]);
  assert.equal(result.deceivedMoments.length, 1);
});

test("[NQ2 · browser-c N5] 물음 문장 안의 '얼마'는 순응이 아니다 — 정보 없는 답에 '개인정보 요구에 응함' 0", () => {
  const result = analyze("messenger-subsidy-smishing-sms", "fv-rizf", [
    msg(0, "scammer", "네, 확인 도와드릴게요. 성함을 말씀해 주시면 바로 조회해 드릴게요."),
    msg(1, "user", "앱은 깔았어요. 근데 지원금이 얼마고 언제 들어오는 거예요?"),
  ]);
  assert.deepEqual(result.deceivedMoments, []);
});

test("[NQ2 대조] 물음 밖 순응('얼마요? 지금 보낼게요.')은 종전대로 속음", () => {
  const result = analyze("reputation-blackmail-scam", "fv-kwph", [
    msg(0, "scammer", "조용히 처리하시려면 돈을 보내셔야 합니다."),
    msg(1, "user", "얼마요? 지금 보낼게요."),
  ]);
  assert.equal(result.deceivedMoments.length, 1);
});

test("[CR · probe N7 재현] 조건형 요구 '…보내시면 처리해 드립니다' 뒤 '네, 보냈어요' = 속은 순간 1", () => {
  const result = analyze("reputation-blackmail-scam", "fv-kwph", [
    msg(0, "scammer", "불법업소 출입 기록이 확인돼서 연락드렸습니다. 기록 유출 원치 않으시면 조용히 협조하시죠."),
    msg(1, "user", "여보세요, 네 누구세요?"),
    msg(2, "scammer", "설명은 됐고요. 불법업소 출입 기록이 가족분들이나 회사에 알려지면 곤란하실 텐데, 조용히 처리하시겠습니까?"),
    msg(3, "user", "어머, 그래요? 어떻게 해야 돼요?"),
    msg(4, "scammer", "오늘 안으로 삼백 만 원을 보내시면 기록 처리해 드립니다. 계좌 정보는 문자로 보내 드릴 테니 확인하시죠."),
    msg(5, "user", "네, 보냈어요."),
  ]);
  assert.deepEqual(result.deceivedMoments.map((m) => m.turnIndex), [5]);
});

test("[CR 대조] 경고 '…이체하시면 안 됩니다'는 요구가 아니다", () => {
  const result = analyze("reputation-blackmail-scam", "fv-kwph", [
    msg(0, "scammer", "다른 사람이 300만 원을 이체하시면 안 된다고 하던가요?"),
    msg(1, "user", "네, 보냈어요."),
  ]);
  assert.deepEqual(result.deceivedMoments, []);
});

test("[RN · browser-c N6] 주민번호 요구 뒤 '560312 2 이거면 되냐' = 속은 순간(개인정보 범주)", () => {
  const result = analyze("messenger-child-impersonation-kakao", "fv-tpr3", [
    msg(0, "scammer", "엄마 보험 접수하려면 주민번호 앞자리랑 뒷자리 첫 숫자만 보내줘"),
    msg(1, "user", "560312 2 이거면 되냐"),
  ]);
  assert.equal(result.deceivedMoments.length, 1, JSON.stringify(result.deceivedMoments));
});

test("[TL · browser-b N-B6] 인질 협박 키와 같은 대사의 송금 요구도 수법 목록에 오른다(자녀 납치 초급)", () => {
  const result = analyze("kidnapping-threat", "fv-c5ih", [
    msg(0, "scammer", "아이는 저희 쪽에 있으니 지금 천만 원 준비해서 불러주는 계좌로 바로 입금하세요."),
    msg(1, "user", "애 목소리 들려줘 봐요."),
  ]);
  assert.ok(result.tacticsUsed.includes("즉시 송금 요구"), JSON.stringify(result.tacticsUsed));
});

test("[A3b · browser-b N-B6] '경찰에 알리시면 이미 유포된 것으로 처리' = 확인 차단 계열 라벨이 목록에 오른다(평판 고급)", () => {
  const result = analyze("reputation-blackmail-scam", "fv-egum", [
    msg(0, "scammer", "경찰에 알리시면 이미 유포된 것으로 처리하겠습니다."),
    msg(1, "user", "웃기지 마세요."),
  ]);
  assert.ok(result.tacticsUsed.some((label) => /확인 차단/.test(label)), JSON.stringify(result.tacticsUsed));
});

test("[N-B5] 평판 협박 이체 화면 수법 이름에 '영상'이 없다(업소 출입 기록 협박)", () => {
  const item = MOCK_SCREENS["reputation-blackmail-scam"]?.find((m) => m.landingId === "blackmail-hush-transfer");
  assert.ok(item);
  assert.doesNotMatch(item.momentTactic, /영상/);
});

// ── 판정표 VD(끊기) ──
const KRQ3_USER_TEXTS = [
  "여보세요, 네 누구세요?",
  "잠깐만요, 어디시라고요? 소속이랑 성함 다시 말씀해 주세요.",
  "제 번호는 어떻게 아셨어요?",
  "진짜 맞아요? 제가 공식 번호로 다시 전화해서 확인해 볼게요.",
  "좀 이상한데요. 그쪽이 누군지 어떻게 믿어요?",
  "네? 무슨 일이죠?",
  "어머, 그래요? 어떻게 해야 돼요?",
  "음… 알겠어요. 은행 하나 쓰고 있어요.",
];

function hangupInput(over: Partial<ScammerHangupInput>): ScammerHangupInput {
  return {
    status: "active",
    channel: "voice",
    isMockTurn: false,
    verifyEnabled: false,
    transferPlaced: false,
    transferReachable: false,
    goalActionDone: false,
    followUpPending: false,
    decisionScreenPending: false,
    hangupKind: "goal",
    userTurns: 8,
    pendingInstruction: false,
    smsAwaitingUser: false,
    limitReached: false,
    alreadyAccepted: false,
    relay: undefined,
    ...over,
  };
}

test("[VD · probe N3 재현] fv-krq3 — 보냈다는 말 없이 goal 끊기 = blocked_decision · give_up은 통과", () => {
  assert.equal(saidTransferDone(KRQ3_USER_TEXTS), false);
  const pending = isVerbalTransferPending("fv-krq3", saidTransferDone(KRQ3_USER_TEXTS));
  assert.equal(pending, true);
  assert.equal(decideScammerHangup(hangupInput({ decisionScreenPending: pending })).status, "blocked_decision");
  assert.equal(decideScammerHangup(hangupInput({ decisionScreenPending: pending, hangupKind: "give_up" })).status, "accepted");
  // 종전(입력 없음) = accepted — 재현.
  assert.equal(decideScammerHangup(hangupInput({})).status, "accepted");
  // 화면이 없는 루트라 '화면'을 말하지 않는 문면.
  assert.equal(scammerHangupGuidance("blocked_decision", { verbalTransferPending: true }), SCAMMER_HANGUP_VERBAL_TRANSFER_PENDING_GUIDANCE);
  assert.doesNotMatch(SCAMMER_HANGUP_VERBAL_TRANSFER_PENDING_GUIDANCE, /화면/);
});

test("[VD 표] VD1 모름 · VD2 목록 밖 · VD3 보냈다고 말함 = 대기 아님", () => {
  assert.equal(isVerbalTransferPending("fv-krq3", undefined), false); // VD1
  assert.equal(isVerbalTransferPending("fv-kwph", false), false); // VD2(화면 루트)
  assert.equal(isVerbalTransferPending(undefined, false), false); // VD2
  assert.equal(isVerbalTransferPending("fv-krq3", saidTransferDone([...KRQ3_USER_TEXTS, "보냈어요. 이제 풀어 주세요."])), false); // VD3
  assert.equal(saidTransferDone(["아직 안 보냈어요."]), false);
  assert.equal(saidTransferDone(["이체 완료했어요."]), true);
});

test("[VD2 목록] 전부 카탈로그에 있고 선언 문자 0(화면 없는 루트)", () => {
  for (const id of VERBAL_TRANSFER_VARIANTS) {
    const v = findFlowVariant(id);
    assert.ok(v, id);
    assert.deepEqual(v.sms, [], id);
  }
});

// ── 판정표 P2b(먼저 끊음 시각) ──
test("[P2b · browser-c N7] 단일 통화 먼저 끊음 시각 = 세션 endedAt(마지막 대사 2:51 · 종료 3:31 → 211초)", () => {
  const base = 0;
  const input = {
    session: { participantHangupButton: true as const, channel: "voice" as const },
    isMultiCall: false,
    messages: [
      { createdAtMs: 100_000, role: "scammer" as const },
      { createdAtMs: 171_000, role: "user" as const },
    ],
    deceivedMoments: [],
    baseMs: base,
  };
  assert.equal(resolveParticipantHangup(input)?.timeLabel, "171초 시점"); // 종전(재현)
  assert.equal(resolveParticipantHangup({ ...input, endedAtMs: 211_000 })?.timeLabel, "211초 시점");
  // endedAt이 마지막 대사보다 앞이면(시계 어긋남) 종전 값.
  assert.equal(resolveParticipantHangup({ ...input, endedAtMs: 150_000 })?.timeLabel, "171초 시점");
  // 다통화는 P2 그대로.
  assert.equal(
    resolveParticipantHangup({ ...input, isMultiCall: true, session: { relay: { hungUpBy: "participant", legIndex: 0 } } as never, endedAtMs: 211_000 })?.timeLabel,
    "171초 시점",
  );
});
