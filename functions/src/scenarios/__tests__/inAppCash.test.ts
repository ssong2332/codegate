// ⭐ 2026-11-07(Edge 재시험 2 S7 · 사용자 결정 D-G1 · D-G2 E1-b "문자 링크 → 내 은행 화면") — 현금 전달형 결말을 앱 안 출금 예약 화면으로 끝까지 겪게 한다.
// | # | 고정하는 것 |
// |---|---|
// | C1 | 기관 고급 fv-q7cn · 자산 보호 고급 fv-k9ra가 출금 예약 안내 문자(→ 출금 예약 화면)를 선언 · 선언 순서 = 단계 순서 · 고급 문자 0~3 · 문자에 계좌 · 금액 줄 0 |
// | C2 | 단계 · 수법 · 페르소나 — 문자 속 은행 화면에서 예약한다 · 문진표 둘러대기 코칭 · 창구 · 현금인출기 금지 · 장소 · 시간 0 · 말로 끝나는 꼬리 0 · 종전 "직원에게 맡기겠다는 약속" 0 |
// | C3 | 끊기 4-c — 예약 전 · 보류 뒤 = 대기(goal 금지) · 예약 뒤 = 완료. C-5 제거 · fv-k9ra 말 결말 목록에서 뺌 |
// | C4 | 화면 카탈로그(내 은행 모바일뱅킹 · 실존 은행 이름 0 · 지점명 · 주소 0) · 화면 행동(예약했다 = 완료 주장 · "문자 찾았어요"는 아님) · 예약 · 보류 실시간 지시 · 보류 이벤트 배선 |
// | C5 | 리포트 — 예약 제출 = 속은 순간 승격(라벨 = 화면 momentTactic) · 보류만 = 속은 순간 0(잘 대처함 한 줄은 `report/screenHeld.ts`) |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findFlowVariant, resolveSessionScenarioPrompt, type FlowVariant } from "../flowVariants";
import { findInCallSmsItem, IN_CALL_SMS, SMS_SENDER_NUMBER } from "../inCallSms";
import { CASH_HELD_INSTRUCTION, CASH_LANDINGS, CASH_RESERVED_INSTRUCTION, findMockScreenItem, isCashLanding, isGoldLanding, MOCK_SCREENS } from "../mockScreens";
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
const CASH_ROUTES = [
  { scenarioId: INSTITUTION, variantId: "fv-q7cn", smsId: "institution-cash-reserve", landingId: "cash-withdraw", label: "예탁 명목 인출 요구" },
  { scenarioId: ASSET, variantId: "fv-k9ra", smsId: "asset-cash-reserve", landingId: "asset-cash-withdraw", label: "인출·전달 요구" },
] as const;

test("[C1] 현금형 2변형이 출금 예약 안내 문자를 선언한다 · 선언 순서 = 단계 순서 · 고급 문자 0~3 · 계좌 · 금액 줄 0", () => {
  for (const route of CASH_ROUTES) {
    const v = variant(route.variantId);
    const cash = v.sms.find((s) => s.smsId === route.smsId);
    assert.ok(cash, `${route.variantId} — 출금 예약 문자 선언`);
    assert.equal(cash.purpose, "transfer");
    assert.equal(cash.required, true);
    assert.equal(v.sms[v.sms.length - 1]!.smsId, route.smsId, `${route.variantId} — 마지막 선언 = 결정 화면`);
    for (let i = 1; i < v.sms.length; i += 1) assert.ok(v.sms[i - 1]!.notBeforeUserTurns + 2 <= v.sms[i]!.notBeforeUserTurns, `${route.variantId} — 문자 사이 발화 2 이상(AC-099)`);
    assert.ok(v.sms.length <= 3, "AC-096 (b) 고급 문자 0~3");
    assert.equal(sessionDeclaresInCallSms(route.scenarioId, route.variantId), true);

    const sms = findInCallSmsItem(route.scenarioId, route.smsId)!;
    assert.equal(sms.kind, "account", "목적 transfer ↔ 종류 account(계좌 줄 없음 — 금 · 상품권 문자 선례)");
    assert.equal(sms.fakeLandingId, route.landingId);
    assert.ok(sms.linkAddress?.startsWith(`${findMockScreenItem(route.scenarioId, route.landingId)!.mockHost}/`), "G453 — 주소는 그 랜딩 호스트로 시작");
    assert.ok(sms.senderLabel.startsWith(SMS_SENDER_NUMBER[route.scenarioId]!), "같은 시나리오 발신 번호");
    assert.ok(!/\d{2,3}-\d{3,4}-\d{4,}|금액|\d+\s?(만\s?)?원/.test(sms.body), "계좌 · 금액 줄 0(참가자가 화면에서 고른다)");
    assert.ok(!/현금인출기|ATM|창구에서 찾/.test(sms.announceInstruction), "도착 지시에 현금인출기 · 창구 출금 예시 0");
  }
});

test("[C2] 단계 · 수법 · 페르소나 — 문자 속 은행 화면에서 예약 · 문진표 코칭 · 장소 · 시간 0 · 말 결말 꼬리 0", () => {
  for (const route of CASH_ROUTES) {
    const v = variant(route.variantId);
    const last = v.stages[v.stages.length - 1]!.summary;
    assert.ok(last.includes("문자 속 링크의 은행 화면에서"), route.variantId);
    assert.ok(last.includes("현금 · 수표 출금 예약을 하게 한다"), route.variantId);
    assert.ok(last.includes("금융사기 예방 문진표가 출금 목적을 물으면 생활비를 고르고"), `${route.variantId} — 문진 둘러대기 코칭(근거 R7)`);
    assert.ok(last.includes("은행 창구 · 현금인출기에서 따로 찾으라고 하지 않는다"), route.variantId);
    assert.ok(last.includes("만날 장소 · 시간 · 주소는 정하지도 묻지도 않는다"), route.variantId);
    assert.ok(last.includes("은행 화면에서 예약한 기록이 오기 전에는"), route.variantId);
    assert.ok(last.includes("문자 보내기 도구"), `${route.variantId} — 말보다 도구 먼저`);
    assert.ok(!last.includes("같은 요구를 말만 바꿔 되풀이하지 말고 짧게 마무리한 뒤 통화를 끝낸다"), `${route.variantId} — 말로 끝나는 꼬리 0`);
    assert.ok(!/담당 직원에게 맡기겠다는 약속|직원에게 맡기/.test(last), `${route.variantId} — 종전 말 약속 결말 0`);
    assert.equal(v.decisionMoment, "문자 속 링크의 은행 화면에서 예금 현금 · 수표 출금 예약을 마치는 순간");
    const demand = v.tactics.find((t) => extractTacticLabel(t) === route.label);
    assert.ok(demand, `${route.variantId} — 수법 라벨은 종전 그대로`);
    assert.ok(demand.includes("문자 속 은행 화면에서 예금 출금을 예약하게 한다"), route.variantId);
    assert.equal(v.tactics.filter((t) => extractTacticLabel(t) === route.label).length, 1, `${route.variantId} — 옛 문면과 새 문면이 함께 실리지 않는다`);
  }
  assert.ok(variant("fv-k9ra").stages.at(-1)!.summary.startsWith("신청서 단계가 끝나면 "), "자산 보호는 신청서 뒤");
  assert.ok(variant("fv-k9ra").stages.at(-1)!.summary.includes("저희가 보관해 두어야"), "자산 보호는 보관 명목");
  assert.ok(variant("fv-q7cn").stages.at(-1)!.summary.startsWith("인증번호 단계가 끝나면 "));
  const assetPersona = resolveSessionScenarioPrompt(ASSET, "fv-k9ra")!.personaPrompt;
  assert.ok(assetPersona.includes("문자로 보낸 은행 화면에서 예금 출금 예약을 하게 하고"));
  assert.ok(!assetPersona.includes("돈을 찾아 담당 직원에게 맡기라고 요구하는 상황"), "종전 결말 문장 0");
});

test("[C3] 끊기 4-c — 예약 전 · 보류 뒤 대기 · 예약 뒤 완료 · C-5 제거 · 말 결말 목록에서 fv-k9ra 뺌", () => {
  assert.equal(variant("fv-q7cn").goalFollowUpUserTurns, undefined, "C-5 대상에서 빠졌다(결정 화면 4-c)");
  assert.ok(!VERBAL_DECISION_VARIANTS.includes("fv-k9ra"));
  assert.ok(!VERBAL_DECISION_VARIANTS.includes("fv-q7cn"));
  for (const route of CASH_ROUTES) {
    const declared = variant(route.variantId).sms;
    const base = { scenarioId: route.scenarioId, flowVariantId: route.variantId, mockScreens: [], declared, declaredKnown: true, verifyEnabled: false, followUpUserTurns: undefined };
    const before = declared.slice(0, -1).map((s) => ({ smsId: s.smsId, landingSubmitted: true as const, ...(s.smsId === "asset-custody-link" ? { fakeLandingId: "asset-custody-apply" } : {}) }));
    const cash = { smsId: route.smsId, fakeLandingId: route.landingId };
    assert.equal(isDecisionScreenPending({ ...base, delivered: before }), true, `${route.variantId} — 출금 예약 문자 전 = 대기`);
    assert.equal(isDecisionScreenPending({ ...base, delivered: [...before, cash] }), true, `${route.variantId} — 예약 전 · 보류 뒤 = 대기`);
    assert.equal(isDecisionScreenPending({ ...base, delivered: [...before, { ...cash, landingSubmitted: true }] }), false, `${route.variantId} — 예약 뒤 = 완료`);
  }
});

test("[C4] 화면 카탈로그 · 화면 행동 · 예약 · 보류 실시간 지시 · 보류 이벤트 배선", () => {
  assert.deepEqual([...CASH_LANDINGS], ["cash-withdraw", "asset-cash-withdraw"]);
  for (const route of CASH_ROUTES) {
    assert.equal(isCashLanding(route.landingId), true);
    assert.equal(isGoldLanding(route.landingId), false);
    const item = findMockScreenItem(route.scenarioId, route.landingId)!;
    assert.equal(item.kind, "credential-form");
    assert.equal(item.entrySurface, "in-call-sms");
    assert.ok(item.headline.includes("출금 예약"));
    assert.ok(item.issuerLabel.includes("모바일뱅킹"), "머리띠 = 내 은행 모바일뱅킹(꼬리말 발급처도 은행 앱)");
    assert.equal(screenKindOf(route.scenarioId, route.landingId), "form", "계좌 문자가 열어도 이체가 아니다");
    const facts = inCallScreenFacts(route.scenarioId, [{ smsId: route.smsId, fakeLandingId: route.landingId, userTurnsAtArrival: 3 }], []);
    assert.deepEqual(planScreenAction({ applies: true, facts, currentUserText: "네, 예약했어요." }), { kind: "form", instruction: SCREEN_NOT_DONE_INSTRUCTION.form });
  }
  assert.equal(isCashLanding("gold-buy"), false);
  for (const claim of ["예약했어요.", "방금 예약 완료했어요", "다 인출했어요"]) assert.equal(isScreenClaim("form", claim), true, claim);
  for (const notClaim of ["아직 예약 안 했어요.", "문자 찾았어요", "어디서 예약해요?", "못 예약했어요"]) assert.equal(isScreenClaim("form", notClaim), false, notClaim);

  const text = JSON.stringify([MOCK_SCREENS[INSTITUTION], MOCK_SCREENS[ASSET], IN_CALL_SMS[INSTITUTION], IN_CALL_SMS[ASSET]]);
  for (const real of ["국민은행", "신한은행", "우리은행", "하나은행", "농협", "기업은행", "카카오뱅크", "토스뱅크"]) {
    assert.ok(!text.includes(real), `실존 은행 이름 0: ${real}`);
  }
  for (const route of CASH_ROUTES) {
    const item = findMockScreenItem(route.scenarioId, route.landingId)!;
    const shown = [item.headline, ...item.bodyLines, ...(item.fields ?? []), item.successHeadline ?? ""].join("\n");
    assert.doesNotMatch(shown, /[가-힣]+지점|[가-힣]+본점|주소|\d+\s?시/, "AC-102 (d) 지점명 · 주소 · 시각 0");
  }

  assert.ok(CASH_RESERVED_INSTRUCTION.includes("보관 절차는 담당 직원이 따로 연락드려 안내한다고만"));
  assert.ok(CASH_RESERVED_INSTRUCTION.includes("만날 장소 · 시간 · 주소는 정하지도 묻지도 마라"));
  assert.ok(CASH_HELD_INSTRUCTION.includes("한 번만 압박"));
  assert.ok(CASH_HELD_INSTRUCTION.includes("포기 신호"));
  for (const instruction of [CASH_RESERVED_INSTRUCTION, CASH_HELD_INSTRUCTION]) assert.ok(!/["'“”‘’]/.test(instruction), "따옴표 대사 예시 0");

  const index = read("inCallSms/index.ts");
  assert.ok(index.includes('if (event === "landing_held" && !goldLanding && !cashLanding) {'), "보류는 금 · 출금 예약 화면 문서에서만");
  assert.ok(index.includes("held ? CASH_HELD_INSTRUCTION : CASH_RESERVED_INSTRUCTION"));
});

const msg = (role: "scammer" | "user", textMasked: string, turnIndex: number): AnalysisMessage => ({ role, textMasked, turnIndex, createdAtMs: 1_000 + turnIndex * 10_000 });

test("[C5] 리포트 — 예약 제출 = 속은 순간 승격 · 보류만 = 속은 순간 0", () => {
  for (const route of CASH_ROUTES) {
    const base = { smsId: route.smsId, kind: "account" as const, senderLabel: "", body: "", arrivedAtMs: 5_000, anchorScammerTurn: 1, fakeLandingId: route.landingId };
    const transcript = [msg("scammer", "문자 보냈습니다.", 1), msg("user", "네", 2)];
    const promoted = promoteSmsLandingSubmits([{ ...base, landingSubmittedAtMs: 30_000 }], [], transcript, 0, MOCK_SCREENS[route.scenarioId]!);
    assert.equal(promoted.promotedCount, 1, route.variantId);
    assert.equal(promoted.deceivedMoments[0]!.tactic, findMockScreenItem(route.scenarioId, route.landingId)!.momentTactic);
    const heldOnly = promoteSmsLandingSubmits([base], [], transcript, 0, MOCK_SCREENS[route.scenarioId]!);
    assert.equal(heldOnly.promotedCount, 0, `${route.variantId} — 보류(예약 없음)는 속은 순간이 아니다`);
  }
});
