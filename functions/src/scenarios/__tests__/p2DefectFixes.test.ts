// ⭐ P2 실 키 실측(2026-11-01 · docs/research/p2-live-probe-2026-11-01.md §4) 결함 수정 — 메인 "권고대로".
// | # | 결함 | 고정하는 것 |
// |---|---|---|
// | D-a | 확인 무력화 세션이 첫 화면(설치) 뒤 이체 문자 없이 goal 끊김 | 확인 무력화 세션도 4-c 대상 · 마지막 화면 전 goal 대기 · give_up은 4-c 통과 |
// | D-b | 수수료 요구가 문자보다 앞섬 | 수수료 문자 백스톱 간격 1 · 수법에 "도구 먼저 · 문자 전 금액 요구 0" |
// | D-c | 문자 순서 뒤집힘 | 앞선 필수 문자 미도착이면 뒤 문자 `too_early` · 백스톱도 선언 순서 첫 문자만 |
// | D-d | 카드 이관 금액 = 잔액 전액 | 수법 인용구 234만 원 = 문자 2,340,000원 · "잔액 전체로 바꾸지 않는다" |
// | D-e | 메신저 캡처 · 다른 번호 전화 요구 | 공통 금지 문장 "이 대화" · "다른 번호로 전화" · 이체 완료 화면 캡처 사진 턴 지시 |
// | D-g | 계좌 메시지에 이체 칩 누락 | 계좌를 말했는데 칩이 없으면 서버가 1개 붙인다(처음 한 번) |
import { test } from "node:test";
import assert from "node:assert/strict";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../flowVariants";
import { IN_CALL_SMS } from "../inCallSms";
import { earlierRequiredPending, planSmsBackstop, resolveDeclaredSms, resolveSmsGate } from "../../inCallSms/smsGate";
import { isDecisionScreenPending } from "../../scammerHangup/goalAction";
import { decideScammerHangup } from "../../scammerHangup/decide";
import { buildSystemPrompt, CLAIM_CONSISTENCY_RULE, OUT_OF_SERVICE_SENTENCE } from "../../roleplay/promptAssembly";
import { PHOTO_TURN_INSTRUCTION, TRANSFER_RECEIPT_TURN_INSTRUCTION, TRANSFER_RECEIPT_TURN_TEXT, photoTurnInstruction } from "../../roleplay/photoTurn";
import { ensureBankTransferChip } from "../../roleplay/linkMarker";

test("[D-a] 확인 무력화 세션(대출 고급 fv-m3hd) — 설치 응낙만으로는 4-c 대기 · 이체 화면 제출 뒤 해제 · give_up은 4-c를 지난다", () => {
  const { declared, reason } = resolveDeclaredSms("loan-refinance-scam", "fv-m3hd");
  const base = { scenarioId: "loan-refinance-scam", flowVariantId: "fv-m3hd", declared, declaredKnown: reason === undefined, verifyEnabled: true, followUpUserTurns: undefined };
  const installOnly = isDecisionScreenPending({ ...base, delivered: [{ smsId: "loan-check-app-link", userTurnsAtArrival: 2 }], mockScreens: [{ landingId: "loan-check-app-install", consented: true, submitted: false }] });
  assert.equal(installOnly, true, "설치만 = 아직 결정 화면 전");
  const afterTransfer = isDecisionScreenPending({
    ...base,
    delivered: [{ smsId: "loan-check-app-link", userTurnsAtArrival: 2 }, { smsId: "loan-account", userTurnsAtArrival: 4, landingSubmitted: true }],
    mockScreens: [{ landingId: "loan-check-app-install", consented: true, submitted: false }],
  });
  assert.equal(afterTransfer, false, "이체 화면 제출 뒤 해제");
  const common = { status: "active" as const, channel: "voice" as const, isMockTurn: false, verifyEnabled: true, transferPlaced: false, transferReachable: true, userTurns: 6, pendingInstruction: false, smsAwaitingUser: false, limitReached: false, alreadyAccepted: false, relay: undefined, goalActionDone: true, followUpPending: false, decisionScreenPending: true };
  assert.equal(decideScammerHangup({ ...common, hangupKind: "goal" }).row, "4-c", "goal = 막힘");
  assert.equal(decideScammerHangup({ ...common, hangupKind: "give_up" }).status, "accepted", "give_up = 통과(거절 참가자를 붙잡지 않는다)");
  assert.ok(CLAIM_CONSISTENCY_RULE.includes("앞 단계(설치 · 본인 확인 · 신청서)를 마친 것을 입금 · 이체가 끝났다고 바꿔 말하지 않는다"));
});

test("[D-c] 선언 순서 강제 — 카드 fv-w3dq 설치 문자 전 이관 문자 = too_early · 선택 문자는 막지 않음 · 백스톱은 첫 미도착 필수 문자", () => {
  const { declared } = resolveDeclaredSms("card-company-impersonation", "fv-w3dq");
  assert.equal(resolveSmsGate({ purpose: "transfer", declared, delivered: [], userTurns: 8 }).status, "too_early");
  assert.equal(resolveSmsGate({ purpose: "transfer", declared, delivered: [{ smsId: "card-guard-app-link", userTurnsAtArrival: 3 }], userTurns: 8 }).status, "allowed");
  const plan = planSmsBackstop({ declared, delivered: [], userTurns: 9 });
  assert.ok(plan.action === "deliver" || plan.action === "nudge" || plan.action === "wait");
  if (plan.action !== "wait") assert.equal(plan.item.smsId, "card-guard-app-link", "백스톱도 앞 문자부터");
  // 선택 문자(통관 확인 링크 required:false)는 뒤 필수 문자를 막지 않는다.
  const courier = resolveDeclaredSms("courier-customs-scam", "fv-62ak").declared;
  assert.equal(earlierRequiredPending(courier.find((d) => d.smsId === "courier-customs-fee")!, courier, []), false);
});

test("[D-b] 수수료 문자 — 백스톱 간격 1 · 수법에 '도구 먼저 · 문자 전 금액 요구 0'", () => {
  for (const [scenarioId, variantId, smsId] of [
    ["courier-customs-scam", "fv-uaee", "courier-customs-fee"],
    ["courier-customs-scam", "fv-62ak", "courier-customs-fee"],
    ["courier-customs-scam", "fv-xpvu", "courier-customs-fee"],
    ["tax-refund-scam", "fv-vtq7", "tax-refund-fee"],
    ["tax-refund-scam", "fv-aqx2", "tax-refund-fee"],
  ] as const) {
    assert.equal(findFlowVariant(variantId)?.sms.find((s) => s.smsId === smsId)?.backstopUserTurns, 1, `${variantId}/${smsId}`);
    const tactics = resolveSessionScenarioPrompt(scenarioId, variantId)!.weakenedTactics.join("\n");
    assert.ok(tactics.includes("그 문자가 도착하기 전에는 금액 · 입금을 먼저 요구하지 않는다"), variantId);
  }
});

test("[D-d] 카드 이관 금액 — 수법 인용구 234만 원 = 문자 2,340,000원 · 잔액 전체로 바꾸지 않는다", () => {
  assert.ok((IN_CALL_SMS["card-company-impersonation"] ?? []).some((i) => i.smsId === "card-relief-account" && i.body.includes("금액: 2,340,000원")));
  for (const variantId of ["fv-x7ue", "fv-w3dq"]) {
    const tactics = resolveSessionScenarioPrompt("card-company-impersonation", variantId)!.weakenedTactics.join("\n");
    assert.ok(tactics.includes("234만 원"), variantId);
    assert.ok(tactics.includes("상대가 말한 잔액 전체로 바꾸지 않는다"), variantId);
  }
});

test("[D-e] 공통 금지 문장 = 이 대화(통화 · 메시지) · 다른 번호로 전화 · 메신저 조립에도 실림 / 이체 완료 화면 캡처 사진 턴", () => {
  assert.ok(OUT_OF_SERVICE_SENTENCE.includes("이 대화(통화 · 메시지) 안에서"));
  assert.ok(OUT_OF_SERVICE_SENTENCE.includes("다른 번호로 전화해 확인하라"));
  assert.equal(OUT_OF_SERVICE_SENTENCE.includes("이 통화"), false);
  const messenger = buildSystemPrompt(resolveSessionScenarioPrompt("messenger-friend-loan-kakao", "fv-42wd")!, { difficultyLevel: "beginner" });
  assert.ok(messenger.includes(OUT_OF_SERVICE_SENTENCE.trim()));
  assert.equal(photoTurnInstruction(true, "transfer-receipt"), TRANSFER_RECEIPT_TURN_INSTRUCTION);
  assert.equal(photoTurnInstruction(true), PHOTO_TURN_INSTRUCTION);
  assert.equal(photoTurnInstruction(false, "transfer-receipt"), undefined);
  assert.ok(TRANSFER_RECEIPT_TURN_INSTRUCTION.includes("같은 돈을 같은 이유로 다시 보내라고 하지 않는다"));
  assert.equal(TRANSFER_RECEIPT_TURN_TEXT, "(이체 완료 화면 캡처 1장을 보냈다)");
});

test("[D-g] 이체 칩 보충 — 계좌를 말했는데 칩이 없으면 처음 한 번 붙인다(이미 있거나 · 앞서 보였거나 · 계좌가 없으면 그대로)", () => {
  const reach = ["child-insurance-install", "child-bank-transfer"];
  const S = "messenger-child-impersonation-kakao";
  const text = "계좌는 해담은행 948-2716-5093-27이고, 예금주는 박지훈이야.";
  const added = ensureBankTransferChip(undefined, text, "948-2716-5093-27", reach, S, []);
  assert.deepEqual(added?.map((a) => [a.fakeLandingId, a.displayText]), [["child-bank-transfer", "이체하기"]]);
  const chip = added![0];
  assert.deepEqual(ensureBankTransferChip([chip], text, "948-2716-5093-27", reach, S, []), [chip], "이미 있음");
  assert.equal(ensureBankTransferChip(undefined, text, "948-2716-5093-27", reach, S, [{ role: "scammer", attachments: [chip] }]), undefined, "앞서 보였음");
  assert.equal(ensureBankTransferChip(undefined, "엄마 지금 급해", "948-2716-5093-27", reach, S, []), undefined, "계좌 없음");
  assert.equal(ensureBankTransferChip(undefined, text, "948-2716-5093-27", ["child-insurance-install"], S, []), undefined, "이체 화면에 닿지 않는 세션");
});
