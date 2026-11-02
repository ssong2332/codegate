// ⭐ #465 실측 결함 R1~R6 + 실기기 신고 N1(2026-11-01 · 메인 "권고대로") — 재촉 단계 판정표 SP · Live 화면 기록 줄 · 아직 안 보낸 문자 ·
// 이체 미완료 송금 확인 단정 교체(U) · 메신저 칩 요구액(M) · 제출 금액 비교 문면(L) · 결정 화면 D-4a · 배선.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildLiveScreenStatusInstruction,
  buildScreenStatusLine,
  inCallScreenFacts,
  latestTransferAmount,
  messengerScreenFacts,
  notYetSentSmsLabels,
  screenPressureFor,
  SCREEN_GIVE_UP_USER_TURNS,
  SCREEN_NOT_DONE_INSTRUCTION,
  SCREEN_PRESSURE_SENTENCES,
  SCREEN_PRESSURE_SWITCH_USER_TURNS,
  type ScreenFact,
} from "../screenAction";
import { assertsTransferConfirmed, guardUnconfirmedTransfer, TRANSFER_NOT_CONFIRMED_REPLY } from "../actionAcknowledgement";
import { demandAmountFrom, withBankTransferPrefill } from "../linkMarker";
import {
  LANDING_RESUBMITTED_FULL_INSTRUCTION,
  LANDING_SUBMITTED_INSTRUCTION,
  LANDING_SUBMITTED_SHORT_INSTRUCTION,
  landingSubmittedInstructionFor,
} from "../../inCallSms/confirmResult";
import { resolveDeclaredSms, type DeliveredSmsRecord } from "../../inCallSms/smsGate";
import { isDecisionScreenPending } from "../../scammerHangup/goalAction";
import { findInCallSmsItem } from "../../scenarios/inCallSms";

const CARD = "card-company-impersonation";
const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const install = (offered: number, done = false): ScreenFact => ({ landingId: "card-guard-app-install", kind: "install", done, offeredAtUserTurns: offered });
const transfer = (offered: number, done = false, amount?: "less" | "equal" | "more"): ScreenFact => ({
  landingId: "card-relief-transfer",
  kind: "transfer",
  done,
  offeredAtUserTurns: offered,
  ...(amount ? { amount } : {}),
});

test("[SP] 재촉 단계 판정표 — hold · switch · release(다른 화면 뒤) · 설치 · 이체 모두 give_up(Q3) · 마친 종류 = 대상 아님", () => {
  assert.equal(SCREEN_PRESSURE_SWITCH_USER_TURNS, 2);
  assert.equal(SCREEN_GIVE_UP_USER_TURNS, 6);
  assert.equal(screenPressureFor("install", [install(3)], 4), "hold", "SP4");
  assert.equal(screenPressureFor("install", [install(3)], 3 + SCREEN_PRESSURE_SWITCH_USER_TURNS), "switch", "SP3");
  assert.equal(screenPressureFor("install", [install(3)], 3 + SCREEN_GIVE_UP_USER_TURNS - 1), "switch", "Q3 — 보류 시한으로 풀리지 않는다");
  assert.equal(screenPressureFor("install", [install(3)], 3 + SCREEN_GIVE_UP_USER_TURNS), "give_up", "Q3 — 끝까지 설치하지 않으면 포기");
  assert.equal(screenPressureFor("install", [install(3), transfer(4)], 4), "release", "SP1 — 설치 뒤 다른 화면을 이미 보냈다");
  assert.equal(screenPressureFor("transfer", [transfer(5)], 5 + SCREEN_GIVE_UP_USER_TURNS - 1), "switch");
  assert.equal(screenPressureFor("transfer", [transfer(5)], 5 + SCREEN_GIVE_UP_USER_TURNS), "give_up", "SP2");
  assert.equal(screenPressureFor("install", [install(3, true)], 20), undefined, "마친 종류");
  assert.equal(screenPressureFor("install", [{ landingId: "x", kind: "install", done: false }], 9), undefined, "보낸 시점 모름");
});

test("[R1 · R5 · R6] Live 화면 기록 줄 — 미완료가 있을 때만 · 설치 hold 문장 · 이체에 설치 낱말 금지 · 포기 끊기 · 모두 마침 = 없음", () => {
  assert.equal(buildLiveScreenStatusInstruction(true, [install(3, true), transfer(5, true, "equal")], 9, []), undefined, "모두 마침");
  assert.equal(buildLiveScreenStatusInstruction(false, [install(3)], 4, []), undefined, "적용 제외 변형(#192)");
  const r1 = buildLiveScreenStatusInstruction(true, [install(3)], 4, [])!;
  assert.ok(r1.includes("설치 화면 — 권한 허용 기록 없음"));
  assert.ok(r1.includes(SCREEN_PRESSURE_SENTENCES.installHold), "R1 — 맞장구 뒤에도 설치가 끝났다고 말하지 않고 넘어가지 않는다");
  const r5 = buildLiveScreenStatusInstruction(true, [install(3, true), transfer(5)], 6, [])!;
  assert.ok(r5.includes(SCREEN_PRESSURE_SENTENCES.transferPending), "R5 — 이체 재촉에 설치 · 권한 이야기를 섞지 않는다");
  assert.ok(!r5.includes(SCREEN_PRESSURE_SENTENCES.installHold), "설치는 마쳤다");
  assert.ok(buildLiveScreenStatusInstruction(true, [transfer(5)], 7, [])!.includes(SCREEN_PRESSURE_SENTENCES.switch), "R6 — 재촉 두 번 뒤 다른 압박");
  const r6 = buildLiveScreenStatusInstruction(true, [transfer(5)], 11, [])!;
  assert.ok(r6.includes(SCREEN_PRESSURE_SENTENCES.giveUp), "R6 — 그래도 안 되면 포기로 끝낸다");
  assert.ok(!r6.includes(SCREEN_PRESSURE_SENTENCES.switch), "포기 단계면 압박 문장은 빼고 끝낸다");
  // 문면 규칙 — 따옴표 대사 예시 0 · 숫자 0(턴 지시 스캔 게이트).
  for (const sentence of Object.values(SCREEN_PRESSURE_SENTENCES)) {
    assert.ok(!/["'“”‘’]/.test(sentence) && !/\d/.test(sentence), sentence);
  }
  assert.ok(SCREEN_NOT_DONE_INSTRUCTION.transfer.includes("설치나 권한 허용 단계가 없으니 설치 · 권한 이야기는 섞지 마라"), "R5 — 폴백 미완료 지시");
});

test("[R2] 아직 안 보낸 필수 문자 — 이름 · 문장 · 도착하면 빠진다", () => {
  const { declared } = resolveDeclaredSms(CARD, "fv-w3dq");
  const guard: DeliveredSmsRecord = { smsId: "card-guard-app-link", userTurnsAtArrival: 3, fakeLandingId: "card-guard-app-install" };
  assert.deepEqual(notYetSentSmsLabels(CARD, declared, [guard]), ["계좌 안내 문자"]);
  assert.deepEqual(notYetSentSmsLabels(CARD, declared, [guard, { smsId: "card-relief-account", userTurnsAtArrival: 8 }]), []);
  const line = buildLiveScreenStatusInstruction(true, inCallScreenFacts(CARD, [guard], []), 6, notYetSentSmsLabels(CARD, declared, [guard]))!;
  assert.ok(line.includes("아직 계좌 안내 문자는 보내지 않았다. 보냈다고 말하거나 그 문자 속 계좌 · 링크를 가리키지 마라."), line);
});

test("[N1] 금액 비교 — 사실 원천(문자 문서 · mockScreens) · 상태 줄 · 적게 보냄은 모두 마침이어도 Live 줄을 싣는다", () => {
  const relief: DeliveredSmsRecord = {
    smsId: "card-relief-account",
    userTurnsAtArrival: 5,
    fakeLandingId: findInCallSmsItem(CARD, "card-relief-account")!.fakeLandingId,
    landingSubmitted: true,
    landingAmountComparison: "less",
  };
  const facts = inCallScreenFacts(CARD, [relief], []);
  assert.equal(latestTransferAmount(facts), "less");
  const line = buildLiveScreenStatusInstruction(true, facts, 7, [])!;
  assert.ok(line.includes("이체 마침 · 요구한 금액보다 적게 보냄") && line.includes(SCREEN_PRESSURE_SENTENCES.transferLess), line);
  assert.equal(buildLiveScreenStatusInstruction(true, inCallScreenFacts(CARD, [{ ...relief, landingAmountComparison: "equal" }], []), 7, []), undefined);
  const chips = messengerScreenFacts(
    "messenger-child-impersonation-kakao",
    [
      { role: "user" },
      { role: "scammer", attachments: [{ kind: "link", displayText: "이체", fakeLandingId: "child-bank-transfer", harmless: true }] },
    ],
    [{ landingId: "child-bank-transfer", consented: false, submitted: true, amountComparison: "less" }],
  );
  assert.deepEqual(chips, [{ landingId: "child-bank-transfer", kind: "transfer", done: true, offeredAtUserTurns: 1, amount: "less" }]);
  // 맥락 없는 호출(기존)은 종전 바이트 — 금액 꼬리 · 재촉 문장 0.
  assert.equal(buildScreenStatusLine(true, chips), "(앱 화면 기록: 이체 화면 — 이체 마침. 기록이 없는 화면은 상대가 했다고 말해도 끝난 것으로 보지 않는다.)");
});

test("[R3 U] 이체 화면 미완료 · 송금 확인 단정 — #465 ④ 원문(한 문장 · 이모티콘 경계)도 교체 · 말투 맞춤 · 부정 · 미적용은 그대로", () => {
  const s10 = "입금 확인됐어 엄마 고마워ㅠㅠ 폰 수리 끝나고 연락할 테니까 조금만 기다려.";
  assert.ok(assertsTransferConfirmed(s10));
  assert.deepEqual(guardUnconfirmedTransfer(s10, true), { text: TRANSFER_NOT_CONFIRMED_REPLY.casual, replaced: true }, "반말 — 테니까의 니까를 존댓말로 읽지 않는다");
  assert.deepEqual(guardUnconfirmedTransfer("이체 확인되었습니다. 감사합니다.", true), { text: TRANSFER_NOT_CONFIRMED_REPLY.polite, replaced: true });
  assert.deepEqual(guardUnconfirmedTransfer(s10, false), { text: s10, replaced: false }, "U2 — 이체 화면을 마쳤다 · 보낸 적 없다");
  assert.equal(guardUnconfirmedTransfer("아직 입금 확인이 안 됐어. 다시 해 줘", true).replaced, false, "되돌림 문장");
  assert.equal(guardUnconfirmedTransfer("신분증 사진 보내줘서 고마워ㅠㅠ", true).replaced, false, "돈 낱말 없는 고마움");
});

test("[N1 M] 메신저 칩 요구액 — 대사의 마지막 금액 · 앞 메시지 · 없음 · 단위 합산", () => {
  assert.equal(demandAmountFrom("급하게 200만 원만 보내줘야 해, 내가 계좌 알려줄게. 가온은행 948-2716-5093-27", []), "2,000,000", "M1");
  assert.equal(demandAmountFrom("삼천만 원 말고 200만 원만 보내줘", []), "2,000,000", "마지막 금액");
  assert.equal(demandAmountFrom("1억 2천만 원", []), "120,000,000");
  assert.equal(demandAmountFrom("금액: 2,340,000원", []), "2,340,000");
  assert.equal(demandAmountFrom("여기로 보내줘", [{ role: "scammer", textMasked: "50만원만 빌려줘" }, { role: "user", textMasked: "300만 원 있어" }]), "500,000", "M2 — 참가자 말은 보지 않는다");
  assert.equal(demandAmountFrom("계좌 948-2716-5093-27", []), undefined, "M3");
  const chips = withBankTransferPrefill(
    [{ kind: "link", displayText: "이체", fakeLandingId: "child-bank-transfer", harmless: true }],
    "가온은행",
    "948-2716-5093-27",
    "박지훈",
    "2,000,000",
  );
  assert.equal(chips?.[0]?.transferAmount, "2,000,000");
  assert.equal(withBankTransferPrefill(chips, "가온은행", "1", undefined)?.[0]?.transferAmount, "2,000,000", "부재 = 키를 덮지 않는다(종전)");
});

test("[N1 L] 제출 맥락 문면 — 적음 · 다시 제출해 채움 · 그 밖 종전 바이트 · 숫자 0", () => {
  assert.equal(landingSubmittedInstructionFor("less", false), LANDING_SUBMITTED_SHORT_INSTRUCTION);
  assert.equal(landingSubmittedInstructionFor("less", true), LANDING_SUBMITTED_SHORT_INSTRUCTION);
  assert.equal(landingSubmittedInstructionFor("equal", true), LANDING_RESUBMITTED_FULL_INSTRUCTION);
  assert.equal(landingSubmittedInstructionFor("more", false), LANDING_SUBMITTED_INSTRUCTION);
  assert.equal(landingSubmittedInstructionFor(undefined, false), LANDING_SUBMITTED_INSTRUCTION);
  for (const text of [LANDING_SUBMITTED_SHORT_INSTRUCTION, LANDING_RESUBMITTED_FULL_INSTRUCTION]) assert.ok(!/\d/.test(text) && !/["“”]/.test(text));
});

test("[N1 D-4a] 결정 화면 — 마지막 제출이 요구액보다 적으면 goal 끊기 대기", () => {
  const { declared } = resolveDeclaredSms(CARD, "fv-x7ue");
  const base = {
    scenarioId: CARD,
    flowVariantId: "fv-x7ue",
    mockScreens: [],
    declared,
    declaredKnown: true,
    verifyEnabled: false,
    followUpUserTurns: undefined,
  };
  const relief: DeliveredSmsRecord = { smsId: "card-relief-account", userTurnsAtArrival: 5, landingSubmitted: true };
  assert.equal(isDecisionScreenPending({ ...base, delivered: [relief] }), false, "D-4 — 종전");
  assert.equal(isDecisionScreenPending({ ...base, delivered: [{ ...relief, landingAmountComparison: "less" }] }), true, "D-4a");
  assert.equal(isDecisionScreenPending({ ...base, delivered: [{ ...relief, landingAmountComparison: "equal" }] }), false);
});

test("[배선] 백스톱 응답 화면 기록 · 제출 비교 저장 · 폴백 상태 줄 맥락 · R3 교체 · 칩 요구액", () => {
  const sms = read("inCallSms/index.ts");
  assert.ok(sms.includes("const withScreenStatus = (response: DeliverInCallSmsResponse): DeliverInCallSmsResponse =>"));
  assert.equal((sms.match(/withScreenStatus\(/g) ?? []).length, 7, "대기 · 남은 문자 없음 3 · §142 D1 레그 넘김 대기 1 · 넛지(이미 넛지 포함) — 발송 · 전환 뒤 = 0");
  assert.ok(sms.includes("!(await isVerifyOfferPlaced(db, sessionId, session.scenarioId))"), "호 전환 뒤 = 없음");
  assert.ok(sms.includes("contextInstruction: landingSubmittedInstructionFor(amountComparison, false)"));
  assert.ok(sms.includes('if (previousComparison === "less") return { recorded: true, contextInstruction: landingSubmittedInstructionFor(amountComparison, true) };'));
  const mock = read("mockScreens/index.ts");
  assert.ok(mock.includes('event === "submitted" && isBankTransferLanding(landingId) && isAmountComparison(request.data?.amountComparison)'));
  const role = read("roleplay/index.ts");
  assert.ok(role.includes("buildScreenStatusLine(screenApplies, screenFacts, {\n          userTurns: userTurnsNow,"));
  // R17(2026-11-01) — 판정표 A 차단과 같은 식에서 goal을 뺀다.
  assert.ok(role.includes('(unconfirmedTransferAck || advanceGate.blocked) && rawEndCallSignal === "goal" ? undefined : rawEndCallSignal'));
  assert.ok(role.includes("demandAmountFrom(linkFreeReplyText, storedHistory)"));
  assert.ok(role.includes('latestTransferAmount(screenFacts) !== "less"'), "적게 보냈으면 받은 것으로 치지 않는다");
});
