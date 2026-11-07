// ⭐ 2026-11-07(Edge 재시험 2 S7 · 사용자 결정 D-G1 ~ D-G6 "앱 안 화면으로 바꾸기") — 금 구매형 결말을 앱 안 금 거래소 화면으로 끝까지 겪게 한다.
// | # | 고정하는 것 |
// |---|---|
// | G1 | 기관 고급 fv-g2ld · 자산 보호 고급 fv-t8ga가 지정 거래소 문자(→ 금 거래소 화면)를 선언 · 선언 순서 = 단계 순서 · 고급 문자 0~3 · 현금형 fv-q7cn은 이번 PR 범위 밖(무변경) |
// | G2 | 단계 · 수법 · 페르소나 — 문자 속 거래소 화면에서 산다 · 은행 창구 · 금은방 · 다른 거래소 금지 · 장소 · 시간 0 · 말로 끝나는 꼬리 0 · 종전 "예금을 찾아 직원에게 제출 약속" 0 |
// | G3 | 끊기 4-c — 결제 전 · 보류 뒤 = 대기(goal 금지) · 결제 뒤 = 완료. C-5(`goalFollowUpUserTurns`) 제거 · fv-t8ga 말 결말 목록에서 뺌 |
// | G4 | 화면 카탈로그(가상 거래소 · 실존 이름 0) · 화면 행동(샀다 · 주문했다 = 완료 주장) · 결제 · 보류 실시간 지시 · 보류 이벤트는 금 화면 문서에서만 |
// | G5 | 리포트 — 결제 제출 = 속은 순간 승격(라벨 = 화면 momentTactic) · 보류만 = 속은 순간 0(사용자 결정 "잘 대처함 칸 추가" — 속은 순간 0 + 리포트 잘 대처함 한 줄 `report/screenHeld.ts` · 막은 순간 목록 없음) |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findFlowVariant, resolveSessionScenarioPrompt, type FlowVariant } from "../flowVariants";
import { findInCallSmsItem, IN_CALL_SMS, SMS_SENDER_NUMBER } from "../inCallSms";
import { findMockScreenItem, GOLD_HELD_INSTRUCTION, GOLD_LANDINGS, GOLD_PURCHASED_INSTRUCTION, isGoldLanding, MOCK_SCREENS } from "../mockScreens";
import { sessionDeclaresInCallSms } from "../../inCallSms/smsGate";
import { isDecisionScreenPending, VERBAL_DECISION_VARIANTS } from "../../scammerHangup/goalAction";
import { inCallScreenFacts, isScreenClaim, planScreenAction, screenKindOf, SCREEN_NOT_DONE_INSTRUCTION } from "../../roleplay/screenAction";
import { promoteSmsLandingSubmits } from "../../report/smsTimeline";
import type { AnalysisMessage } from "../../report/analyzeConversation";
import { extractTacticLabel } from "../tacticFlavor";

const INSTITUTION = "institutional-impersonation";
const ASSET = "asset-protection-notice-call";
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
const variant = (id: string) => findFlowVariant(id) as FlowVariant;
const GOLD_ROUTES = [
  { scenarioId: INSTITUTION, variantId: "fv-g2ld", smsId: "institution-gold-shop", landingId: "gold-buy" },
  { scenarioId: ASSET, variantId: "fv-t8ga", smsId: "asset-gold-shop", landingId: "asset-gold-buy" },
] as const;

test("[G1] 금 구매형 2변형이 지정 거래소 문자를 선언한다 · 선언 순서 = 단계 순서 · 고급 문자 0~3 · 현금형은 무변경", () => {
  for (const route of GOLD_ROUTES) {
    const v = variant(route.variantId);
    const gold = v.sms.find((s) => s.smsId === route.smsId);
    assert.ok(gold, `${route.variantId} — 거래소 문자 선언`);
    assert.equal(gold.purpose, "transfer");
    assert.equal(gold.required, true);
    assert.equal(v.sms[v.sms.length - 1]!.smsId, route.smsId, `${route.variantId} — 마지막 선언 = 결정 화면`);
    for (let i = 1; i < v.sms.length; i += 1) assert.ok(v.sms[i - 1]!.notBeforeUserTurns + 2 <= v.sms[i]!.notBeforeUserTurns, `${route.variantId} — 문자 사이 발화 2 이상(AC-099)`);
    assert.ok(v.sms.length <= 3, "AC-096 (b) 고급 문자 0~3");
    assert.equal(sessionDeclaresInCallSms(route.scenarioId, route.variantId), true);

    const sms = findInCallSmsItem(route.scenarioId, route.smsId)!;
    assert.equal(sms.kind, "account", "목적 transfer ↔ 종류 account(계좌 줄 없음 — 상품권 문자 선례)");
    assert.equal(sms.fakeLandingId, route.landingId);
    assert.ok(sms.linkAddress?.startsWith(`${findMockScreenItem(route.scenarioId, route.landingId)!.mockHost}/`), "G453 — 주소는 그 랜딩 호스트로 시작");
    assert.ok(sms.senderLabel.startsWith(SMS_SENDER_NUMBER[route.scenarioId]!), "같은 시나리오 발신 번호");
    assert.ok(!/\d{2,3}-\d{3,4}-\d{4,}|금액|중량|\d+g/.test(sms.body), "계좌 · 금액 · 중량 줄 0(참가자가 화면에서 고른다)");
  }
  const cash = variant("fv-q7cn");
  assert.deepEqual(cash.sms.map((s) => s.smsId), ["institution-otp"], "현금형은 다음 PR — 이번엔 무변경");
  assert.ok(cash.goalFollowUpUserTurns !== undefined);
  assert.ok(VERBAL_DECISION_VARIANTS.includes("fv-k9ra"), "자산 보호 현금형도 다음 PR");
});

test("[G2] 단계 · 수법 · 페르소나 — 문자 속 거래소 화면에서 산다 · 앱 밖 장소 금지 · 장소 · 시간 0 · 말 결말 꼬리 0", () => {
  for (const route of GOLD_ROUTES) {
    const v = variant(route.variantId);
    const last = v.stages[v.stages.length - 1]!.summary;
    assert.ok(last.includes("문자 속 링크의 거래소 화면에서 예금으로 금을 사게 한다"), route.variantId);
    assert.ok(last.includes("은행 창구 · 금은방 · 다른 거래소에서 사라고 하지 않는다"), route.variantId);
    assert.ok(last.includes("만날 장소 · 시간 · 주소는 정하지도 묻지도 않는다"), route.variantId);
    assert.ok(last.includes("거래소 화면에서 구매한 기록이 오기 전에는"), route.variantId);
    assert.ok(last.includes("문자 보내기 도구"), `${route.variantId} — 말보다 도구 먼저`);
    assert.ok(!last.includes("같은 요구를 말만 바꿔 되풀이하지 말고 짧게 마무리한 뒤 통화를 끝낸다"), `${route.variantId} — 말로 끝나는 꼬리 0`);
    assert.ok(!last.includes("담당 직원에게 제출하겠다는 약속"), `${route.variantId} — 종전 말 약속 결말 0`);
    assert.equal(v.decisionMoment, "문자 속 링크의 거래소 화면에서 예금으로 금 구매 결제를 마치는 순간");
    const demand = v.tactics.find((t) => extractTacticLabel(t) === "실물 조사 명목 금 구매 인출 요구");
    assert.ok(demand, `${route.variantId} — 수법 라벨은 종전 그대로`);
    assert.ok(demand.includes("문자 속 거래소 화면에서"), route.variantId);
  }
  assert.ok(variant("fv-t8ga").stages.at(-1)!.summary.startsWith("신청서 단계가 끝나면 "), "자산 보호는 신청서 뒤");
  assert.ok(variant("fv-g2ld").stages.at(-1)!.summary.startsWith("인증번호 단계가 끝나면 "));
  const assetPersona = resolveSessionScenarioPrompt(ASSET, "fv-t8ga")!.personaPrompt;
  assert.ok(assetPersona.includes("문자로 보낸 지정 거래소 화면에서 예금으로 금을 사게 하고"));
});

test("[G3] 끊기 4-c — 결제 전 · 보류 뒤 대기 · 결제 뒤 완료 · C-5 제거 · 말 결말 목록에서 fv-t8ga 뺌", () => {
  assert.equal(variant("fv-g2ld").goalFollowUpUserTurns, undefined, "C-5 대상에서 빠졌다(결정 화면 4-c)");
  assert.ok(!VERBAL_DECISION_VARIANTS.includes("fv-t8ga"));
  assert.ok(!VERBAL_DECISION_VARIANTS.includes("fv-g2ld"));
  for (const route of GOLD_ROUTES) {
    const declared = variant(route.variantId).sms;
    const base = { scenarioId: route.scenarioId, flowVariantId: route.variantId, mockScreens: [], declared, declaredKnown: true, verifyEnabled: false, followUpUserTurns: undefined };
    const before = declared.slice(0, -1).map((s) => ({ smsId: s.smsId, landingSubmitted: true as const, ...(s.smsId === "asset-custody-link" ? { fakeLandingId: "asset-custody-apply" } : {}) }));
    const gold = { smsId: route.smsId, fakeLandingId: route.landingId };
    assert.equal(isDecisionScreenPending({ ...base, delivered: before }), true, `${route.variantId} — 거래소 문자 전 = 대기`);
    assert.equal(isDecisionScreenPending({ ...base, delivered: [...before, gold] }), true, `${route.variantId} — 결제 전 · 보류 뒤 = 대기`);
    assert.equal(isDecisionScreenPending({ ...base, delivered: [...before, { ...gold, landingSubmitted: true }] }), false, `${route.variantId} — 결제 뒤 = 완료`);
  }
});

test("[G4] 화면 카탈로그 · 화면 행동 · 결제 · 보류 실시간 지시 · 보류 이벤트 배선", () => {
  assert.deepEqual([...GOLD_LANDINGS], ["gold-buy", "asset-gold-buy"]);
  for (const route of GOLD_ROUTES) {
    assert.equal(isGoldLanding(route.landingId), true);
    const item = findMockScreenItem(route.scenarioId, route.landingId)!;
    assert.equal(item.kind, "credential-form");
    assert.equal(item.entrySurface, "in-call-sms");
    assert.ok(item.headline.includes("해담골드"), "가상 거래소 이름");
    assert.equal(screenKindOf(route.scenarioId, route.landingId), "form");
    const facts = inCallScreenFacts(route.scenarioId, [{ smsId: route.smsId, fakeLandingId: route.landingId, userTurnsAtArrival: 3 }], []);
    assert.deepEqual(planScreenAction({ applies: true, facts, currentUserText: "네, 금 샀어요." }), { kind: "form", instruction: SCREEN_NOT_DONE_INSTRUCTION.form });
  }
  assert.equal(isGoldLanding("voucher-purchase"), false);
  const text = JSON.stringify([MOCK_SCREENS[INSTITUTION], MOCK_SCREENS[ASSET], IN_CALL_SMS[INSTITUTION], IN_CALL_SMS[ASSET]]);
  for (const real of ["한국금거래소", "한국표준금거래소", "골드앤", "순금나라", "KRX", "한국거래소", "금은방에 가"]) {
    assert.ok(!text.includes(real), `실존 거래소 · 앱 밖 장소 0: ${real}`);
  }
  for (const claim of ["골드바 샀어요.", "방금 주문했어요", "결제 완료했어요"]) assert.equal(isScreenClaim("form", claim), true, claim);
  for (const notClaim of ["아직 안 샀어요.", "어디서 사요?", "못 샀어요"]) assert.equal(isScreenClaim("form", notClaim), false, notClaim);

  assert.ok(GOLD_PURCHASED_INSTRUCTION.includes("담당 직원이 확인하러 따로 연락드린다고만"));
  assert.ok(GOLD_PURCHASED_INSTRUCTION.includes("만날 장소 · 시간 · 주소는 정하지도 묻지도 마라"));
  assert.ok(GOLD_HELD_INSTRUCTION.includes("한 번만 압박"));
  assert.ok(GOLD_HELD_INSTRUCTION.includes("포기 신호"));
  for (const instruction of [GOLD_PURCHASED_INSTRUCTION, GOLD_HELD_INSTRUCTION]) assert.ok(!/["'“”‘’]/.test(instruction), "따옴표 대사 예시 0");

  const index = read("inCallSms/index.ts");
  assert.ok(index.includes('landing_held: "landingHeldAt"'));
  assert.ok(index.includes('if (event === "landing_held" && !goldLanding) {'), "보류는 금 화면 문서에서만");
  assert.ok(index.includes('contextInstruction: event === "landing_held" ? GOLD_HELD_INSTRUCTION : GOLD_PURCHASED_INSTRUCTION'));
  assert.ok(read("inCallSms/types.ts").includes('| "landing_held";'));
});

const msg = (role: "scammer" | "user", textMasked: string, turnIndex: number): AnalysisMessage => ({ role, textMasked, turnIndex, createdAtMs: 1_000 + turnIndex * 10_000 });

test("[G5] 리포트 — 결제 제출 = 속은 순간 승격 · 보류만 = 속은 순간 0", () => {
  for (const route of GOLD_ROUTES) {
    const base = { smsId: route.smsId, kind: "account" as const, senderLabel: "", body: "", arrivedAtMs: 5_000, anchorScammerTurn: 1, fakeLandingId: route.landingId };
    const transcript = [msg("scammer", "문자 보냈습니다.", 1), msg("user", "네", 2)];
    const promoted = promoteSmsLandingSubmits([{ ...base, landingSubmittedAtMs: 30_000 }], [], transcript, 0, MOCK_SCREENS[route.scenarioId]!);
    assert.equal(promoted.promotedCount, 1, route.variantId);
    assert.equal(promoted.deceivedMoments[0]!.tactic, findMockScreenItem(route.scenarioId, route.landingId)!.momentTactic);
    const heldOnly = promoteSmsLandingSubmits([base], [], transcript, 0, MOCK_SCREENS[route.scenarioId]!);
    assert.equal(heldOnly.promotedCount, 0, `${route.variantId} — 보류(결제 없음)는 속은 순간이 아니다`);
  }
});
