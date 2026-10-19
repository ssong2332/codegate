// A-1 ⑦(2026-10-19 · audit-A R1) — 필수 문자 도착 뒤 "확인 결과" 신호의 판정표 · 문면 · 배선(폴백 즉시 · Live 응답 필드).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildConfirmResultInstruction,
  buildLiveConfirmResultInstruction,
  confirmResultPurposeFor,
  isCompletionClaim,
  planConfirmResult,
} from "../confirmResult";
import { buildConfirmResultField, buildInCallSmsResponse } from "../buildDoc";
import { resolveDeclaredSms } from "../smsGate";
import { FLOW_VARIANTS, type FlowVariantSms } from "../../scenarios/flowVariants";
import { findInCallSmsItem } from "../../scenarios/inCallSms";

const LOAN = "loan-refinance-scam";
const loanVariant = (level: "beginner" | "intermediate" | "advanced") => {
  const v = FLOW_VARIANTS.find((x) => x.scenarioId === LOAN && x.level === level);
  assert.ok(v, `loan ${level} 변형이 없다`);
  return v;
};
const TRANSFER: FlowVariantSms = { purpose: "transfer", smsId: "loan-account", required: true, notBeforeUserTurns: 3 };
const LINK_OPTIONAL: FlowVariantSms = { purpose: "link", smsId: "loan-apply-link", required: false, notBeforeUserTurns: 2 };
const OTP: FlowVariantSms = { purpose: "identity", smsId: "institution-otp", required: true, notBeforeUserTurns: 3 };

// 대본 A(audit-A 재현 대본) 앞 7발화 — 문자는 7번째 발화에 도착했다(재현 로그 userTurns 7 deliver).
const SCRIPT_A_PRIORS = ["네 누구세요?", "네", "김민수요", "네", "잠깐만요, 제가 직접 확인해 볼게요", "그래도 직접 확인해 보고 싶어요", "네"];

// ── 판정표 5행 ────────────────────────────────────────────────────────────────────────────────
test("[A-1/⑦ 판정표] 대본 A — 문자 도착 뒤 '알겠어요, 보냈어요'에 1회 confirm, 이어지는 '확인됐어요?'·'아직이에요?'·'네'에는 0", () => {
  const delivered = [{ smsId: "loan-account", userTurnsAtArrival: 7 }];
  const claim = planConfirmResult({
    declared: [TRANSFER],
    delivered,
    userTurns: 8,
    currentUserText: "알겠어요, 보냈어요",
    priorUserTexts: SCRIPT_A_PRIORS,
  });
  assert.equal(claim.reason, "confirm");
  assert.equal(claim.instruction, buildConfirmResultInstruction("transfer"));
  const priors8 = [...SCRIPT_A_PRIORS, "알겠어요, 보냈어요"];
  assert.equal(
    planConfirmResult({ declared: [TRANSFER], delivered, userTurns: 9, currentUserText: "확인됐어요?", priorUserTexts: priors8 }).reason,
    "no_claim",
  );
  // 같은 주장을 다시 해도 1회뿐(4행) — 상태 저장 없이 대화 기록에서 판정한다.
  assert.equal(
    planConfirmResult({ declared: [TRANSFER], delivered, userTurns: 9, currentUserText: "보냈다니까요", priorUserTexts: priors8 }).reason,
    "already_claimed",
  );
});

test("[A-1/⑦ 판정표] 1행 — 필수 계좌·링크 문자가 아직 안 왔거나, 선택 문자 · 인증번호 문자만 왔으면 no_required_arrival", () => {
  const base = { userTurns: 9, currentUserText: "보냈어요", priorUserTexts: SCRIPT_A_PRIORS };
  assert.equal(planConfirmResult({ ...base, declared: [TRANSFER], delivered: [] }).reason, "no_required_arrival");
  assert.equal(
    planConfirmResult({ ...base, declared: [LINK_OPTIONAL, TRANSFER], delivered: [{ smsId: "loan-apply-link", userTurnsAtArrival: 4 }] }).reason,
    "no_required_arrival",
    "선택(required:false) 링크 문자는 결과 신호 대상이 아니다",
  );
  assert.equal(
    planConfirmResult({ ...base, declared: [OTP], delivered: [{ smsId: "institution-otp", userTurnsAtArrival: 4 }] }).reason,
    "no_required_arrival",
    "인증번호의 결과는 otpCheck가 소유한다",
  );
});

test("[A-1/⑦ 판정표] 2행 — 문자가 도착한 바로 그 발화에서는 before_reply(참가자가 아직 문자를 못 봤다)", () => {
  const plan = planConfirmResult({
    declared: [TRANSFER],
    delivered: [{ smsId: "loan-account", userTurnsAtArrival: 7 }],
    userTurns: 7,
    currentUserText: "보냈어요",
    priorUserTexts: SCRIPT_A_PRIORS.slice(0, 6),
  });
  assert.equal(plan.reason, "before_reply");
});

test("[A-1/⑦ 완료 주장] 판정표 — 계좌·링크·공통은 잡고, 부정·유보·다른 행동·의문문은 잡지 않는다", () => {
  for (const text of ["알겠어요, 보냈어요", "방금 이체했습니다", "180만 원 넣었어요", "말씀하신 대로 했어요", "네 다 했어요. 이제 뭐 하면 돼요?"]) {
    assert.equal(isCompletionClaim(text, "transfer"), true, `놓침: ${text}`);
  }
  for (const text of ["링크 눌러서 신청했어요", "본인확인 입력했습니다"]) {
    assert.equal(isCompletionClaim(text, "link"), true, `놓침(link): ${text}`);
  }
  for (const text of [
    "아직 안 보냈어요",
    "못 보냈어요",
    "보내야 하나요?",
    "보냈는데 확인됐어요?",
    "은행에 전화했어요",
    "가족한테 물어봤어요",
    "문자 확인했어요",
    "싫어요 안 할래요",
    "네",
    "확인됐어요?",
  ]) {
    assert.equal(isCompletionClaim(text, "transfer"), false, `오탐: ${text}`);
  }
});

test("[A-1/⑦ 역방향] 판정이 없던 b7fde97(결과 신호 0)과 같은 입력이면 지금은 지시가 나온다 — 신호를 지우면 이 단언이 깨진다", () => {
  const plan = planConfirmResult({
    declared: resolveDeclaredSms(LOAN, loanVariant("beginner").variantId).declared,
    delivered: [{ smsId: "loan-account", userTurnsAtArrival: 7 }],
    userTurns: 8,
    currentUserText: "알겠어요, 보냈어요",
    priorUserTexts: SCRIPT_A_PRIORS,
  });
  assert.ok(plan.instruction && plan.instruction.includes("입금 확인이 끝났다고"), "실제 loan 초급 선언으로 결과 신호가 나오지 않는다");
});

// ── 문면 ──────────────────────────────────────────────────────────────────────────────────────
test("[A-1/⑦ 문면] 결과 신호 4종 — 숫자·따옴표 대사·재촉/다급 0, 결과 알림 · 다음 요구 · 끊기 항목 위임 · 대기 금지 포함", () => {
  for (const text of [
    buildConfirmResultInstruction("transfer"),
    buildConfirmResultInstruction("link"),
    buildLiveConfirmResultInstruction("transfer"),
    buildLiveConfirmResultInstruction("link"),
  ]) {
    assert.equal(/[0-9]/.test(text), false, `숫자: ${text}`);
    assert.equal(/["“”'‘’]/.test(text), false, `따옴표 대사 예시: ${text}`);
    assert.equal(/재촉|다급/.test(text), false, `재촉·다급: ${text}`);
    assert.ok(text.includes("끝났다고 그럴듯하게 알려 주고"), `결과 알림 없음: ${text}`);
    assert.ok(text.includes("다음 요구로 넘어가거나"), `다음 요구 없음: ${text}`);
    assert.ok(text.includes("[진행 강제]의 통화 끝내기 항목이 정한 대로 마무리하라"), `끊기 항목 위임 없음: ${text}`);
    assert.ok(/기다려 달라는 말은 하지 마라/.test(text), `대기 금지 없음: ${text}`);
  }
  assert.ok(buildLiveConfirmResultInstruction("transfer").includes("마쳤다고 말하면"), "Live 문면은 조건형이어야 한다(도착 시점에는 아직 답이 없다)");
});

// ── Live 응답 필드(deliverInCallSms) ─────────────────────────────────────────────────────────
test("[A-1/⑦ Live] buildConfirmResultField — 필수 계좌 문자에만 confirmResultInstruction, 전환 뒤 · 선택 문자 · 인증번호 · 선언 미전달은 빈 객체 / buildInCallSmsResponse는 종전 그대로", () => {
  assert.deepEqual(buildConfirmResultField({ placed: false }, TRANSFER), {
    confirmResultInstruction: buildLiveConfirmResultInstruction("transfer"),
  });
  assert.deepEqual(buildConfirmResultField({ placed: true }, TRANSFER), {}, "전환 뒤에는 원 사기범이 없다(announce와 같은 게이트)");
  assert.deepEqual(buildConfirmResultField({ placed: false }, LINK_OPTIONAL), {}, "선택 문자에는 싣지 않는다");
  assert.deepEqual(buildConfirmResultField({ placed: false }, OTP), {}, "인증번호 결과는 otpCheck 소관");
  assert.deepEqual(buildConfirmResultField({ placed: false }, undefined), {}, "선언 항목을 못 찾으면 종전 응답");
  assert.equal(confirmResultPurposeFor(OTP), undefined);
  const item = findInCallSmsItem(LOAN, "loan-account");
  assert.ok(item);
  assert.deepEqual(Object.keys(buildInCallSmsResponse(item, { placed: false })).sort(), ["announceInstruction", "smsId"], "종전 응답 키 무변경");
});

// ── 배선(관측 불가 지점 — onCall 핸들러 소스 스캔) ─────────────────────────────────────────────
const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

test("[A-1/⑦ 배선] sendMessage — 다른 턴 지시가 없는 턴에만 planConfirmResult를 부르고 결과를 턴 지시에 합친다", () => {
  const src = read("roleplay/index.ts");
  assert.match(src, /import \{ planConfirmResult \} from "\.\.\/inCallSms\/confirmResult";/);
  assert.match(
    src,
    /const confirmPlan =\n\s*smsDeliveredLoaded && turnChoice === "none" && !otpCheckInstruction && verifyState\?\.placed !== true\n\s*\? planConfirmResult\(\{/,
  );
  assert.match(src, /currentUserText: maskedUserText,/);
  assert.match(src, /\[confirmPlan\?\.instruction, escalatedCallInstruction\]\.filter\(Boolean\)/);
  assert.match(src, /\[promptTurnInstruction, confirmAndCallContext, smsNudgeInstruction, smsOfferInstruction\]/);
  // 계산 순서 — 인증번호 대조(otpCheckInstruction) 뒤, LLM 호출 앞.
  const iConfirm = src.indexOf("const confirmPlan =");
  assert.ok(src.indexOf("const otpCheckInstruction = otpCheck.instruction;") < iConfirm, "인증번호 대조 결과를 본 뒤에 판정해야 한다");
  assert.ok(iConfirm < src.indexOf("const completion = await completeWithFallback("), "LLM 호출 앞에서 판정해야 한다");
});

test("[A-1/⑦ 배선] deliverInCallSms — 도착 응답에 선언 항목으로 만든 결과 신호 필드를 덧붙인다(종전 응답 조립은 그대로)", () => {
  const src = read("inCallSms/index.ts");
  assert.match(src, /const declaredItem = declared\.find\(\(d\) => d\.smsId === item\.smsId\);/);
  assert.match(src, /\.\.\.buildInCallSmsResponse\(item, \{ placed, fictionalBankName \}\),\n\s*\.\.\.buildConfirmResultField\(\{ placed \}, declaredItem\),/);
});
