// ⭐ PR-A(2026-11-07 사용자 신고 — 기관 사칭 고급 *"이체 금액을 적게 보내도 그냥 넘어가는 문제와 대출 관련돼서 안내하다가 그냥 전화 끊는 문제"* ·
// Edge 시험 판 10 택배 통관 고급 — 10만 원만 보내도 통과). 설계 docs/research/institution-advanced-loan-design-2026-11-07.md §1.
// | # | 고정하는 것 |
// |---|---|
// | P1 | 후속 단계 변형(`fv-c5fj`)도 4-c 결정 화면 판정을 받는다 — 미제출 · 적게 보냄 = 대기, 다 보냄 = 완료 (종전 D-1 = 늘 거짓) |
// | P2 | 마무리 지시(`planGoalWrapUp`)는 이체 전 · 적게 보낸 상태에서 `pending` — 다 보낸 뒤에만 C-5로 `wrap_up` · `scenarioId`를 안 넘기면 종전 |
// | P3 | 금액을 말 · 문자 · 화면에서 하나로 — 기관 고급 980만 원(고급 전용 문자) · 택배 고급 760만 원 · 은퇴 `fv-pgqt`와 초급 · 중급 문자 무변경 |
// | P4 | 서버 요구액 판독이 한글 수사를 읽는다(메신저 칩 요구액 · 클라와 같은 규칙) |
// | P5 | 문자 문서 `transferAmount` = 금액 줄(요구액 판정표 R2 원천) |
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDecisionScreenPending, planGoalWrapUp } from "../goalAction";
import { findFlowVariant } from "../../scenarios/flowVariants";
import { findInCallSmsItem } from "../../scenarios/inCallSms";
import { demandAmountFrom } from "../../roleplay/linkMarker";
import { buildInCallSmsDoc } from "../../inCallSms/buildDoc";
import type { DeliveredSmsRecord } from "../../inCallSms/smsGate";

const SCENARIO = "institutional-impersonation";
const c5fj = findFlowVariant("fv-c5fj")!;
// ⭐ PR-B — fv-c5fj가 3통화(후속 단계 값 없음)로 바뀌어 P1 · P2(후속 단계 변형의 판정)는 같은 구조의 은퇴 fv-pgqt로 고정한다.
const pgqt = findFlowVariant("fv-pgqt")!;

function screenInput(delivered: DeliveredSmsRecord[]) {
  return {
    scenarioId: SCENARIO,
    flowVariantId: "fv-pgqt",
    delivered,
    mockScreens: [],
    declared: pgqt.sms,
    declaredKnown: true,
    verifyEnabled: true,
    followUpUserTurns: pgqt.goalFollowUpUserTurns,
  };
}
const otp: DeliveredSmsRecord = { smsId: "institution-otp", userTurnsAtArrival: 5 };
const safe = (extra: Partial<DeliveredSmsRecord> = {}): DeliveredSmsRecord => ({ smsId: "institution-safe-account", userTurnsAtArrival: 7, ...extra });

test("[P1] 후속 단계 변형도 4-c 결정 화면 판정 — 미제출 · 적게 보냄 = 대기 · 다 보냄 = 완료", () => {
  assert.ok(pgqt.goalFollowUpUserTurns !== undefined, "전제: fv-pgqt는 후속 단계 변형");
  assert.equal(isDecisionScreenPending(screenInput([otp, safe()])), true, "문자만 도착 · 미제출");
  assert.equal(isDecisionScreenPending(screenInput([otp, safe({ landingSubmitted: true, landingAmountComparison: "less" })])), true, "적게 보냄(D-4a)");
  assert.equal(isDecisionScreenPending(screenInput([otp, safe({ landingSubmitted: true, landingAmountComparison: "equal" })])), false, "다 보냄");
  assert.equal(isDecisionScreenPending(screenInput([otp, safe({ landingSubmitted: true })])), false, "비교 모름(C1) = 제출로 본다(종전 D-4)");
});

test("[P2] 마무리 지시 — 이체 전 · 적게 보냄 = pending · 다 보낸 뒤 C-5 = wrap_up · scenarioId 없으면 종전", () => {
  const base = { declared: pgqt.sms, declaredKnown: true, userTurns: 12, followUpUserTurns: pgqt.goalFollowUpUserTurns, placed: false };
  assert.equal(planGoalWrapUp({ ...base, delivered: [otp, safe()], scenarioId: SCENARIO }), "pending", "도착 + 5발화여도 미제출이면 지시 0");
  assert.equal(
    planGoalWrapUp({ ...base, delivered: [otp, safe({ landingSubmitted: true, landingAmountComparison: "less" })], scenarioId: SCENARIO }),
    "pending",
    "적게 보냄",
  );
  assert.equal(
    planGoalWrapUp({ ...base, delivered: [otp, safe({ landingSubmitted: true, landingAmountComparison: "equal" })], scenarioId: SCENARIO }),
    "wrap_up",
  );
  assert.equal(planGoalWrapUp({ ...base, delivered: [otp, safe()] }), "wrap_up", "scenarioId를 안 넘기는 호출부 = 종전(도착 기준)");
  assert.equal(
    planGoalWrapUp({ ...base, userTurns: 8, delivered: [otp, safe({ landingSubmitted: true, landingAmountComparison: "equal" })], scenarioId: SCENARIO }),
    "pending",
    "다 보냈어도 C-5(도착 + 3발화) 전이면 대기",
  );
});

test("[P3] 금액을 말 · 문자 · 화면에서 하나로 — 기관 고급 980만 원 · 택배 고급 760만 원", () => {
  const transfer = c5fj.sms.find((s) => s.purpose === "transfer")!;
  assert.equal(transfer.smsId, "institution-asset-safe-account");
  assert.ok(findInCallSmsItem(SCENARIO, transfer.smsId)!.body.includes("금액: 9,800,000원"));
  assert.equal(findInCallSmsItem(SCENARIO, transfer.smsId)!.fakeLandingId, "safe-account-transfer", "같은 이체 화면");
  assert.ok(c5fj.stages.some((s) => s.summary.includes("980만 원")), "단계");
  assert.ok(c5fj.tactics.some((t) => t.startsWith("이체 화면 유도 — ") && t.includes("980만 원")), "수법 인용구");
  // 초급 · 중급 · 은퇴 변형은 종전 문자(금액 줄 없음) 그대로.
  for (const id of ["fv-5cn4", "fv-hktx", "fv-pgqt"]) {
    assert.ok(findFlowVariant(id)!.sms.some((s) => s.smsId === "institution-safe-account"), id);
  }
  assert.ok(!findInCallSmsItem(SCENARIO, "institution-safe-account")!.body.includes("금액:"), "종전 문자 무변경");
  assert.ok(!findFlowVariant("fv-pgqt")!.tactics.some((t) => t.includes("980만 원")), "은퇴 변형 수법 무변경");

  const y3ks = findFlowVariant("fv-y3ks")!;
  assert.ok(findInCallSmsItem("courier-customs-scam", "courier-safe-account")!.body.includes("금액: 7,600,000원"));
  assert.ok(y3ks.stages.some((s) => s.summary.includes("760만 원")), "택배 고급 단계");
  assert.ok(y3ks.tactics.some((t) => t.startsWith("국가 안전계좌 이체 요구 — ") && t.includes("760만 원")), "택배 고급 수법");
});

test("[P4] 서버 요구액 판독 — 한글 수사 · 섞임 · 금액 아닌 낱말", () => {
  const cases: Array<[string, string | undefined]> = [
    ["우선 구백팔십만 원을 옮기셔야 합니다", "9,800,000"],
    ["처리 수수료는 구만 구천 원입니다", "99,000"],
    ["5백만 원만 먼저", "5,000,000"],
    ["9백8십만 원", "9,800,000"],
    ["삼천만 원 말고 200만 원만", "2,000,000"],
    ["1억 2천만 원", "120,000,000"],
    ["금액: 2,340,000원", "2,340,000"],
    ["저희 사원 한 명이 연락드립니다", undefined],
    ["계좌 948-2716-5093-27", undefined],
  ];
  for (const [text, want] of cases) assert.equal(demandAmountFrom(text, []), want, text);
});

// ⭐ 2026-11-07(Edge 재시험 2) — 주겠다는 돈(환급금 · 지원금 · 조회 금액)은 요구액이 아니다(판정표 D — 클라 `bankApp.ts`와 같은 원문).
test("[재시험 2 D] 메신저 칩 요구액 — 주겠다는 돈은 건너뛰고 앞 대사의 요구액 · 없으면 없음", () => {
  assert.equal(demandAmountFrom("지원금 300만 원이 지급될 예정이에요", []), undefined, "D1 · M3");
  assert.equal(demandAmountFrom("지원금 300만 원 받으시려면 보증금 30만 원 먼저 보내 주세요", []), "300,000", "M1 D2");
  assert.equal(
    demandAmountFrom("미수령 환급금이 오만 원 정도 조회됩니다", [{ role: "scammer", textMasked: "처리 수수료 99,000원 입금해 주세요" }]),
    "99,000",
    "M1 건너뜀 → M2 앞 대사",
  );
});

test("[P5] 문자 문서 transferAmount = 금액 줄", () => {
  const ts = { seconds: 0, nanoseconds: 0 } as unknown as FirebaseFirestore.Timestamp;
  const inst = buildInCallSmsDoc(findInCallSmsItem(SCENARIO, "institution-asset-safe-account")!, ts, 0, SCENARIO, "새솔은행");
  assert.equal(inst.transferAmount, "9800000");
  const courier = buildInCallSmsDoc(findInCallSmsItem("courier-customs-scam", "courier-safe-account")!, ts, 0, "courier-customs-scam", "새솔은행");
  assert.equal(courier.transferAmount, "7600000");
});
