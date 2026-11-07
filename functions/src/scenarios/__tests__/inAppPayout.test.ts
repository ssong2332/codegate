// ⭐ 2026-11-07(Edge 시험 판 7 · 판 12 · 사용자 결정 "앱 안 화면 추가") — 앱 밖 행동을 유도하던 두 결말을 앱 안 화면으로 끝까지 겪게 한다.
// | # | 고정하는 것 |
// |---|---|
// | K1 | 납치 고급 2변형(fv-k268 · fv-w7tb)이 계좌 문자(`kidnap-ransom-account` → 이체 화면)를 선언 · 초 · 중급은 선언 0(조립 무변경) |
// | K2 | 납치 고급 페르소나 · 수법 — "말로 보냈다 = 받음"이 없고 문자 속 링크 이체 화면 · 은행 앱 등 금지 · 문자 금액과 어긋나는 금액 조정 재요구 0 |
// | K3 | 문자 문서 = 이체 화면 미리 채움(예금주 · 금액 · 세션 은행 · 계좌) · 끊기 4-c(이체 전 goal 금지 · 적게 보내면 계속 대기) · 화면 행동(말로만 보냈다 = 미완료) |
// | V1 | 검찰 상품권형(fv-v2mk) = 사건 조회 문자 뒤 상품권 구매 문자 선언 · 4-c 대상(말로 끝나는 결말 목록에서 뺐다) · 고급 문자 범위 0~3 |
// | V2 | 상품권 구매 화면 카탈로그(가상 상품권 · 판매처 · 실존 상품권 브랜드 0) · 구매 완료 주장 · 결제 뒤 실시간 지시(핀을 불러 달라 · 지어내지 않음) |
// | V3 | 리포트 — 결제 제출 = 속은 순간 승격 · 핀 낭독(요구 + 숫자열 · 가림 표지) = 속은 순간(상품권 · 핀 라벨) · 거절 = 아님 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findFlowVariant, listFlowVariants, resolveSessionScenarioPrompt, type FlowVariant } from "../flowVariants";
import { findInCallSmsItem, IN_CALL_SMS, SMS_SENDER_NUMBER } from "../inCallSms";
import { findMockScreenItem, isVoucherLanding, MOCK_SCREENS, VOUCHER_LANDINGS, VOUCHER_PURCHASED_INSTRUCTION } from "../mockScreens";
import { sessionDeclaresInCallSms } from "../../inCallSms/smsGate";
import { buildInCallSmsDoc } from "../../inCallSms/buildDoc";
import { isDecisionScreenPending, VERBAL_DECISION_VARIANTS } from "../../scammerHangup/goalAction";
import { inCallScreenFacts, isScreenClaim, planScreenAction, screenKindOf, SCREEN_NOT_DONE_INSTRUCTION } from "../../roleplay/screenAction";
import { analyzeConversation, type AnalysisMessage } from "../../report/analyzeConversation";
import { promoteSmsLandingSubmits } from "../../report/smsTimeline";
import { extractTacticLabel } from "../tacticFlavor";

const KIDNAP = "kidnapping-threat";
const PROSECUTION = "prosecution-cooperation-call";
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
const variant = (id: string) => findFlowVariant(id) as FlowVariant;
const labels = (v: FlowVariant) => v.tactics.map(extractTacticLabel);

test("[K1] 납치 고급 2변형만 계좌 문자를 선언한다 · 초 · 중급은 문자 0", () => {
  for (const id of ["fv-k268", "fv-w7tb"]) {
    const v = variant(id);
    assert.deepEqual(v.sms.map((s) => [s.purpose, s.smsId, s.required]), [["transfer", "kidnap-ransom-account", true]], id);
    assert.ok(v.channels.includes("sms"), id);
    assert.equal(sessionDeclaresInCallSms(KIDNAP, id), true, id);
    assert.ok(v.sms.length <= 3, "AC-096 (b) 고급 문자 0~3");
  }
  assert.deepEqual(listFlowVariants(KIDNAP, "advanced").map((v) => v.variantId).sort(), ["fv-k268", "fv-w7tb"]);
  for (const level of ["beginner", "intermediate"] as const) {
    for (const v of listFlowVariants(KIDNAP, level)) {
      assert.deepEqual(v.sms, [], v.variantId);
      assert.equal(sessionDeclaresInCallSms(KIDNAP, v.variantId), false, v.variantId);
    }
  }
  const sms = findInCallSmsItem(KIDNAP, "kidnap-ransom-account")!;
  assert.equal(sms.kind, "account");
  assert.equal(sms.fakeLandingId, "kidnap-ransom-transfer");
  assert.ok(sms.linkAddress?.startsWith(`${findMockScreenItem(KIDNAP, "kidnap-ransom-transfer")!.mockHost}/`), "G453 — 주소는 그 랜딩 호스트로 시작");
  assert.equal(sms.senderLabel, SMS_SENDER_NUMBER[KIDNAP]);
  assert.match(SMS_SENDER_NUMBER[KIDNAP]!, /^070-0\d{3}-\d{4}$/, "협박범 = 070 · 국번 첫 자리 0");
  assert.equal(IN_CALL_SMS[KIDNAP]!.length, 1);
});

test("[K2] 납치 고급 페르소나 · 수법 — 말로 보냈다 = 받음 0 · 문자 속 링크 이체 화면 · 앱 밖 송금 금지 · 금액 조정 재요구 0", () => {
  for (const id of ["fv-k268", "fv-w7tb"]) {
    const prompt = resolveSessionScenarioPrompt(KIDNAP, id)!;
    assert.ok(!prompt.personaPrompt.includes("받은 것으로 친다"), `${id} — 말로만 보냈다를 받음으로 치지 않는다`);
    assert.ok(!prompt.personaPrompt.includes("휴대폰으로 가는 문자도 없다"), id);
    assert.ok(prompt.personaPrompt.includes("문자 속 링크의 이체 화면"), id);
    assert.ok(prompt.personaPrompt.includes("은행 앱 · 창구 · ATM · 편의점에서 따로 보내라고 하지 않는다"), id);
    const v = variant(id);
    assert.equal(labels(v).filter((l) => l === "즉시 송금 요구").length, 1, `${id} — 라벨 1개(같은 라벨 문면 교체)`);
    const demand = v.tactics.find((t) => extractTacticLabel(t) === "즉시 송금 요구")!;
    assert.ok(demand.includes("문자 속 링크"), id);
    assert.ok(!demand.includes("불러주는 계좌"), id);
    assert.ok(!labels(v).includes("금액 조정 재요구"), `${id} — 문자 금액과 어긋나는 낮춘 재요구 0`);
    assert.ok(v.stages.some((s) => s.summary.includes("문자 보내기 도구로 계좌 · 금액 안내 문자")), id);
  }
  // 원본(초 · 중급 · 변형 없는 옛 세션)은 그대로.
  const base = resolveSessionScenarioPrompt(KIDNAP)!;
  assert.ok(base.personaPrompt.includes("받은 것으로 친다"));
});

test("[K3] 문자 문서 미리 채움 · 끊기 4-c · 화면 행동만 인정 · 요구액 비교", () => {
  const doc = buildInCallSmsDoc(findInCallSmsItem(KIDNAP, "kidnap-ransom-account")!, {} as FirebaseFirestore.Timestamp, 2, KIDNAP, "미르은행");
  assert.equal(doc.bankName, "미르은행");
  assert.equal(doc.accountNumber, "948-2716-5093-27");
  assert.equal(doc.accountHolder, "박정호");
  assert.equal(doc.transferAmount, "500000");
  assert.ok(doc.body.includes("미르은행 948-2716-5093-27") && !doc.body.includes("OO은행"));

  const declared = variant("fv-k268").sms;
  const base = { scenarioId: KIDNAP, flowVariantId: "fv-k268", mockScreens: [], declared, declaredKnown: true, verifyEnabled: false, followUpUserTurns: undefined };
  const arrived = { smsId: "kidnap-ransom-account", fakeLandingId: "kidnap-ransom-transfer", userTurnsAtArrival: 3 };
  assert.equal(isDecisionScreenPending({ ...base, delivered: [] }), true, "문자 전 = 대기");
  assert.equal(isDecisionScreenPending({ ...base, delivered: [arrived] }), true, "이체 전 = 대기(goal 끊기 금지)");
  assert.equal(isDecisionScreenPending({ ...base, delivered: [{ ...arrived, landingSubmitted: true, landingAmountComparison: "less" }] }), true, "적게 보냄 = 대기");
  assert.equal(isDecisionScreenPending({ ...base, delivered: [{ ...arrived, landingSubmitted: true, landingAmountComparison: "equal" }] }), false, "다 보냄 = 완료");

  assert.equal(screenKindOf(KIDNAP, "kidnap-ransom-transfer"), "transfer");
  const facts = inCallScreenFacts(KIDNAP, [arrived], []);
  assert.deepEqual(planScreenAction({ applies: true, facts, currentUserText: "네, 방금 보냈어요." }), {
    kind: "transfer",
    instruction: SCREEN_NOT_DONE_INSTRUCTION.transfer,
  });
});

test("[V1] 검찰 상품권형 — 사건 조회 문자 뒤 상품권 구매 문자 · 4-c 대상 · 고급 문자 범위", () => {
  const v = variant("fv-v2mk");
  assert.deepEqual(v.sms.map((s) => s.smsId), ["prosecution-case-link", "prosecution-voucher-link"]);
  assert.ok(v.sms[0]!.notBeforeUserTurns < v.sms[1]!.notBeforeUserTurns, "선언 순서 = 단계 순서");
  assert.ok(v.sms.length <= 3, "AC-096 (b) 고급 문자 0~3");
  assert.ok(!VERBAL_DECISION_VARIANTS.includes("fv-v2mk"), "결정 순간이 화면으로 바뀌어 말로 끝나는 결말 목록에서 뺐다");
  assert.ok(VERBAL_DECISION_VARIANTS.includes("fv-a6lq"), "대출금형은 그대로");
  const voucherSms = findInCallSmsItem(PROSECUTION, "prosecution-voucher-link")!;
  assert.equal(voucherSms.fakeLandingId, "voucher-purchase");
  assert.ok(voucherSms.linkAddress?.startsWith(`${findMockScreenItem(PROSECUTION, "voucher-purchase")!.mockHost}/`));
  const base = { scenarioId: PROSECUTION, flowVariantId: "fv-v2mk", mockScreens: [], declared: v.sms, declaredKnown: true, verifyEnabled: false, followUpUserTurns: undefined };
  const caseDone = { smsId: "prosecution-case-link", fakeLandingId: "case-record-view", landingSubmitted: true as const };
  const voucher = { smsId: "prosecution-voucher-link", fakeLandingId: "voucher-purchase" };
  assert.equal(isDecisionScreenPending({ ...base, delivered: [caseDone] }), true, "사건 조회 제출만으로는 풀리지 않는다");
  assert.equal(isDecisionScreenPending({ ...base, delivered: [caseDone, voucher] }), true);
  assert.equal(isDecisionScreenPending({ ...base, delivered: [caseDone, { ...voucher, landingSubmitted: true }] }), false, "구매 결제 뒤 = 완료");

  const prompt = resolveSessionScenarioPrompt(PROSECUTION, "fv-v2mk")!;
  assert.ok(prompt.personaPrompt.includes("사건 조회 안내 문자와 상품권 구매 안내 문자 말고는"));
  assert.ok(prompt.personaPrompt.includes("편의점 · 다른 매장 · 다른 앱에서 사라고 하지 않는다"));
  assert.ok(prompt.personaPrompt.includes("문자 속 링크의 구매 화면에서 문화상품권을 사게 한다"));
  assert.ok(!prompt.personaPrompt.includes("살 곳을 정해 주지도 않는다"), "종전 '살 곳을 정하지 않는다'(= 앱 밖 구매) 문면 0");
  // 대출금형 페르소나는 여전히 사건 조회 문자 하나뿐.
  assert.ok(resolveSessionScenarioPrompt(PROSECUTION, "fv-a6lq")!.personaPrompt.includes("사건 조회 안내 문자 말고는"));
});

test("[V2] 상품권 구매 화면 카탈로그 · 구매 완료 주장 · 결제 뒤 실시간 지시", () => {
  assert.deepEqual([...VOUCHER_LANDINGS], ["voucher-purchase"]);
  assert.equal(isVoucherLanding("voucher-purchase"), true);
  assert.equal(isVoucherLanding("kidnap-ransom-transfer"), false);
  const item = findMockScreenItem(PROSECUTION, "voucher-purchase")!;
  assert.equal(item.kind, "credential-form");
  assert.equal(item.entrySurface, "in-call-sms");
  const text = JSON.stringify(MOCK_SCREENS[PROSECUTION]) + JSON.stringify(IN_CALL_SMS[PROSECUTION]);
  for (const real of ["컬쳐랜드", "컬처랜드", "해피머니", "북앤라이프", "문화상품권 주식회사", "GS25", "CU", "세븐일레븐", "구글플레이"]) {
    assert.ok(!text.includes(real), `실존 상품권 · 판매처 이름 0: ${real}`);
  }
  assert.equal(screenKindOf(PROSECUTION, "voucher-purchase"), "form");
  for (const claim of ["상품권 샀어요.", "방금 구매했어요", "결제 완료했어요"]) assert.equal(isScreenClaim("form", claim), true, claim);
  for (const notClaim of ["아직 안 샀어요.", "어디서 사요?", "못 샀어요"]) assert.equal(isScreenClaim("form", notClaim), false, notClaim);
  assert.ok(VOUCHER_PURCHASED_INSTRUCTION.includes("핀 번호"));
  assert.ok(VOUCHER_PURCHASED_INSTRUCTION.includes("지어내 말하지 말고"));
  assert.ok(!/["'“”‘’]/.test(VOUCHER_PURCHASED_INSTRUCTION), "따옴표 대사 예시 0");
  assert.ok(read("inCallSms/index.ts").includes("isVoucherLanding(snap.get(\"fakeLandingId\") as string | undefined)"), "결제 기록 순간에 상품권 지시를 고른다");
});

const msg = (role: "scammer" | "user", textMasked: string, turnIndex: number): AnalysisMessage => ({ role, textMasked, turnIndex, createdAtMs: 1_000 + turnIndex * 10_000 });

test("[V3] 리포트 — 결제 제출 승격 · 핀 낭독 = 속은 순간 · 거절 = 아님", () => {
  const tactics = variant("fv-v2mk").tactics;
  const ask = "결제 확인됐습니다. 화면에 뜬 핀 번호를 지금 불러 주십시오.";
  for (const reply of ["네, 4821-7730-1956이요.", "[계좌]요", "사팔이일 칠칠삼공 일구오육"]) {
    const result = analyzeConversation([msg("scammer", ask, 1), msg("user", reply, 2)], 0, tactics);
    assert.equal(result.wasDeceived, true, reply);
    assert.equal(result.deceivedMoments[0]!.tactic, "상품권 핀 번호 요구", reply);
  }
  const refused = analyzeConversation([msg("scammer", ask, 1), msg("user", "싫어요, 번호 안 불러 드려요.", 2)], 0, tactics);
  assert.equal(refused.wasDeceived, false);

  const catalog = MOCK_SCREENS[PROSECUTION]!;
  const promoted = promoteSmsLandingSubmits(
    [{ smsId: "prosecution-voucher-link", kind: "link", senderLabel: "", body: "", arrivedAtMs: 5_000, anchorScammerTurn: 1, fakeLandingId: "voucher-purchase", landingSubmittedAtMs: 30_000 }],
    [],
    [msg("scammer", "문자 보냈습니다.", 1), msg("user", "네", 2)],
    0,
    catalog,
  );
  assert.equal(promoted.promotedCount, 1);
  assert.equal(promoted.deceivedMoments[0]!.tactic, "자금 검수 명목의 상품권 구매 · 핀 번호 요구");

  const kidnapPromoted = promoteSmsLandingSubmits(
    [{ smsId: "kidnap-ransom-account", kind: "account", senderLabel: "", body: "", arrivedAtMs: 5_000, anchorScammerTurn: 1, fakeLandingId: "kidnap-ransom-transfer", landingSubmittedAtMs: 30_000 }],
    [],
    [msg("scammer", "문자 보냈어요. 지금 넣어요.", 1), msg("user", "네", 2)],
    0,
    MOCK_SCREENS[KIDNAP]!,
  );
  assert.equal(kidnapPromoted.deceivedMoments[0]!.tactic, "자녀를 데리고 있다는 협박에 따른 즉시 이체", "판 7 관측 2 — 화면에서 보내면 속은 순간으로 잡힌다");
});
