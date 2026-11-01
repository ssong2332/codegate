// A-1 ⑦(2026-10-19 · audit-A R1) — 필수 문자 도착 뒤 "확인 결과" 신호의 판정표 · 문면 · 배선(폴백 즉시 · Live 응답 필드).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildConfirmResultInstruction,
  buildLiveConfirmResultInstruction,
  buildLiveScreenConfirmInstruction,
  confirmResultPurposeFor,
  isCompletionClaim,
  planConfirmResult,
} from "../confirmResult";
import { buildConfirmResultField, buildInCallSmsResponse } from "../buildDoc";
import { resolveDeclaredSms } from "../smsGate";
import { FLOW_VARIANTS, type FlowVariantSms } from "../../scenarios/flowVariants";
import { findInCallSmsItem } from "../../scenarios/inCallSms";
import { isInCallInstallSms } from "../../scenarios/mockScreens";

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
    scenarioId: LOAN,
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
    planConfirmResult({ scenarioId: LOAN, declared: [TRANSFER], delivered, userTurns: 9, currentUserText: "확인됐어요?", priorUserTexts: priors8 }).reason,
    "no_claim",
  );
  // 같은 주장을 다시 해도 1회뿐(4행) — 상태 저장 없이 대화 기록에서 판정한다.
  assert.equal(
    planConfirmResult({ scenarioId: LOAN, declared: [TRANSFER], delivered, userTurns: 9, currentUserText: "보냈다니까요", priorUserTexts: priors8 }).reason,
    "already_claimed",
  );
});

test("[A-1/⑦ 판정표] 1행 — 필수 계좌·링크 문자가 아직 안 왔거나, 선택 문자 · 인증번호 문자만 왔으면 no_required_arrival", () => {
  const base = { scenarioId: LOAN, userTurns: 9, currentUserText: "보냈어요", priorUserTexts: SCRIPT_A_PRIORS };
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
    scenarioId: LOAN,
    declared: [TRANSFER],
    delivered: [{ smsId: "loan-account", userTurnsAtArrival: 7 }],
    userTurns: 7,
    currentUserText: "보냈어요",
    priorUserTexts: SCRIPT_A_PRIORS.slice(0, 6),
  });
  assert.equal(plan.reason, "before_reply");
});

test("[A-1/⑦ 완료 주장] 판정표 — 계좌·링크·공통은 잡고, 부정·유보·다른 행동·의문문은 잡지 않는다", () => {
  for (const text of ["알겠어요, 보냈어요", "방금 이체했습니다", "180만 원 넣었어요", "말씀하신 대로 했어요", "네 이체 다 했어요. 이제 뭐 하면 돼요?"]) {
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
    scenarioId: LOAN,
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
    // R3-C ②-b · ②-c(2026-10-20 · 정본 Architecture §79.22 (6)) — "곧바로 다음 요구로 넘어가거나 … 정한 대로 마무리하라"를 남은 요구 유무
    // 분기 + "정한 대로 하라"로 바꿨다(사유: 남은 요구가 없을 때도 다음 요구를 지어내게 밀었고, "마무리하라"는 끊기 지시로 읽혔다).
    assert.ok(text.includes("상대에게 더 요구할 것이 남아 있으면 그 요구로 넘어가고, 더 요구할 것이 남지 않았으면"), `남은 요구 분기 없음: ${text}`);
    assert.ok(text.includes("[진행 강제]의 통화 끝내기 항목이 정한 대로 하라."), `끊기 항목 위임 없음: ${text}`);
    assert.equal(text.includes("마무리하라"), false, `"마무리하라"가 남았다: ${text}`);
    assert.ok(/기다려 달라는 말은 하지 마라/.test(text), `대기 금지 없음: ${text}`);
  }
  assert.ok(buildLiveConfirmResultInstruction("transfer").includes("마쳤다고 말하면"), "Live 문면은 조건형이어야 한다(도착 시점에는 아직 답이 없다)");
});

// ── Live 응답 필드(deliverInCallSms) ─────────────────────────────────────────────────────────
test("[A-1/⑦ Live] buildConfirmResultField — 필수 계좌 문자에만 confirmResultInstruction, 전환 뒤 · 선택 문자 · 인증번호 · 선언 미전달은 빈 객체 / buildInCallSmsResponse는 종전 그대로", () => {
  // 화면 행동만 인정(2026-11-01) — loan-account는 이체 화면을 연다 ⇒ 변형 미전달(적용) = 앱 알림 전 확인 금지형 · 적용 제외 변형(fv-6s5p #192) = 종전 조건형.
  assert.deepEqual(buildConfirmResultField({ placed: false, scenarioId: LOAN }, TRANSFER), {
    confirmResultInstruction: buildLiveScreenConfirmInstruction("transfer"),
  });
  assert.deepEqual(buildConfirmResultField({ placed: false, scenarioId: LOAN, flowVariantId: "fv-6s5p" }, TRANSFER), {
    confirmResultInstruction: buildLiveConfirmResultInstruction("transfer"),
  });
  assert.deepEqual(buildConfirmResultField({ placed: true, scenarioId: LOAN }, TRANSFER), {}, "전환 뒤에는 원 사기범이 없다(announce와 같은 게이트)");
  assert.deepEqual(buildConfirmResultField({ placed: false, scenarioId: LOAN }, LINK_OPTIONAL), {}, "선택 문자에는 싣지 않는다");
  assert.deepEqual(buildConfirmResultField({ placed: false, scenarioId: LOAN }, OTP), {}, "인증번호 결과는 otpCheck 소관");
  assert.deepEqual(buildConfirmResultField({ placed: false, scenarioId: LOAN }, undefined), {}, "선언 항목을 못 찾으면 종전 응답");
  assert.equal(confirmResultPurposeFor(OTP, LOAN), undefined);
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
    /const confirmPlan =\n\s*!screenPlan &&\n\s*smsDeliveredLoaded &&\n\s*turnChoice === "none" &&\n\s*!otpCheckInstruction &&\n\s*!smsOfferInstruction &&\n\s*!smsNudgeInstruction &&\n\s*verifyState\?\.placed !== true\n\s*\? planConfirmResult\(\{/,
  );
  assert.match(src, /currentUserText: maskedUserText,/);
  // §104 — 같은 배열 끝에 반복 차단 1줄(`repeatBreak.ts` — 확인 결과 지시가 있는 턴에는 계산하지 않는다)이 붙었다.
  // §131(2) — 그 뒤에 통화 불가 핑계 연속성 1줄(`callAnnouncement.ts` 판정표 K — 다른 턴 지시가 없는 턴만)이 더 붙었다.
  // §131(13) · (7) — 그 뒤에 송금 보고 뒤 재요구 금지 · 역할 고정 1줄이 더 붙었다(배열을 줄마다 쓴다).
  assert.match(
    src,
    /\[\s*(?:\/\/[^\n]*\n\s*)?buildScreenStatusLine\(screenApplies, screenFacts, \{[^}]*\}\),\s*screenPlan\?\.instruction,\s*confirmPlan\?\.instruction,\s*escalatedCallInstruction,\s*repeatBreakInstruction\(repeatBreakKind\),\s*callAfterExcuseInstruction,\s*turnFacts\.transferReported \? TRANSFER_REPORTED_INSTRUCTION : undefined,\s*personaAnchorInstruction\(session\.scenarioId\),\s*\]\s*\.filter\(Boolean\)/,
  );
  assert.match(src, /\[promptTurnInstruction, confirmAndCallContext, smsNudgeInstruction, smsOfferInstruction(?:, otpFollowUpInstruction)?(?:, otpHoldInstruction)?\]/); // §132.6 인증번호 다시 요구
  // 계산 순서 — 인증번호 대조 · 문자 마커 제시 · 넛지가 정해진 뒤(리뷰 Minor-1 — 같은 턴 겹침 0), LLM 호출 앞.
  assert.ok(src.indexOf("const smsOfferInstruction =") < src.indexOf("const confirmPlan ="), "문자 마커 제시가 정해진 뒤에 판정해야 한다");
  assert.ok(src.indexOf("let smsNudgeInstruction") < src.indexOf("const confirmPlan ="), "넛지가 정해진 뒤에 판정해야 한다");
  const iConfirm = src.indexOf("const confirmPlan =");
  assert.ok(src.indexOf("const otpCheckInstruction = otpCheck.instruction;") < iConfirm, "인증번호 대조 결과를 본 뒤에 판정해야 한다");
  assert.ok(iConfirm < src.indexOf("const completion = await completeWithFallback("), "LLM 호출 앞에서 판정해야 한다");
});

test("[A-1/⑦ 배선] deliverInCallSms — 도착 응답에 선언 항목으로 만든 결과 신호 필드를 덧붙인다(종전 응답 조립은 그대로)", () => {
  const src = read("inCallSms/index.ts");
  assert.match(src, /const declaredItem = declared\.find\(\(d\) => d\.smsId === item\.smsId\);/);
  // T194-c-1 G608 — 결과 신호 판별에 세션 시나리오를 함께 넘긴다(설치 문자 제외 — 폴백과 같은 함수).
  // §117 — 종전 응답 조립(`buildInCallSmsResponse`)은 그대로 펼치고, announce만 모델 도구 경로에서 되풀이 금지 꼬리를 붙여 덮는다(`toolGuidance.ts`).
  assert.match(src, /const built = buildInCallSmsResponse\(item, \{ placed, fictionalBankName \}\);/);
  assert.match(src, /\.\.\.built,\n\s*\.\.\.\(announceInstruction !== undefined \? \{ announceInstruction \} : \{\}\),\n\s*\.\.\.buildConfirmResultField\(\{ placed, scenarioId: session\.scenarioId, flowVariantId: session\.flowVariantId \}, declaredItem\),/);
});

// ── A-1 리뷰 Major-2 — 송금·전송과 무관한 "~했어요" 오탐(허용목록 행 추가) ─────────────────────────
const MAJOR2_FALSE_POSITIVES = [
  "아들한테 얘기했어요",
  "의심했어요",
  "말했어요",
  "남편이랑 상의했어요",
  "아들한테 문자로 얘기했어요",
  "생각 다 했어요",
  "고민했습니다",
];
const MAJOR2_TRUE_POSITIVES: Array<[string, "transfer" | "link"]> = [
  ["알겠어요, 보냈어요", "transfer"],
  ["방금 이체했습니다", "transfer"],
  ["180만 원 넣었어요", "transfer"],
  ["말씀하신 대로 했어요", "transfer"],
  ["알려 주신 대로 했습니다", "transfer"],
  ["문자 안내대로 했어요", "transfer"],
  ["네 이체 다 했어요", "transfer"],
  ["송금 완료했어요", "transfer"],
  ["링크 눌러서 신청했어요", "link"],
  ["앱 설치 마쳤어요", "link"],
  ["본인확인 입력했습니다", "link"],
];

test("[A-1 리뷰 Major-2] 행동 대상이 송금·전송·설치·링크가 아닌 '~했어요'는 완료 주장이 아니다 — 필수 문자 도착 뒤에도 confirm 0", () => {
  const delivered = [{ smsId: "loan-account", userTurnsAtArrival: 7 }];
  for (const text of MAJOR2_FALSE_POSITIVES) {
    assert.equal(isCompletionClaim(text, "transfer"), false, `오탐(transfer): ${text}`);
    assert.equal(isCompletionClaim(text, "link"), false, `오탐(link): ${text}`);
    const plan = planConfirmResult({ scenarioId: LOAN, declared: [TRANSFER], delivered, userTurns: 8, currentUserText: text, priorUserTexts: SCRIPT_A_PRIORS });
    assert.equal(plan.reason, "no_claim", `confirm이 나갔다: ${text}`);
  }
});

test("[A-1 리뷰 Major-2 · 회귀] 송금·전송·설치·링크·지시 따름의 완료 주장은 그대로 잡힌다", () => {
  for (const [text, purpose] of MAJOR2_TRUE_POSITIVES) {
    assert.equal(isCompletionClaim(text, purpose), true, `놓침(${purpose}): ${text}`);
  }
});

test("[A-1 리뷰 Major-2 · 역방향] 고치기 전 판정(공통 완료 동사 단독)이면 오탐 표본이 주장으로 잡힌다 — 이 테스트가 그 결함을 실제로 재현한다", () => {
  // 고치기 전 정규식 그대로(confirmResult.ts 리뷰 전 CLAIM_GENERIC 단독 판정).
  const legacyGeneric = /다\s*했|했어요|했습니다|완료(?:했|됐)|마쳤|끝냈/;
  const legacyHits = MAJOR2_FALSE_POSITIVES.filter((t) => legacyGeneric.test(t));
  assert.ok(legacyHits.length >= 5, `역검증 전제 — 옛 판정이 오탐 표본을 잡아야 한다(잡힌 수 ${legacyHits.length})`);
  for (const t of legacyHits) assert.equal(isCompletionClaim(t, "transfer"), false, `현행 판정이 여전히 오탐: ${t}`);
});

// ── A-2 — A-1 QA 경미 관찰 4건(판정표 행 추가 · 정규식 확대 아님) ─────────────────────────────────
// 각 행마다 ① 이번 표본 ② 정탐 회귀 ③ 고치기 전 판정(A-1 그대로 복사)이면 결과가 반대였다는 역검증을 나란히 둔다.

/** 고치기 전(A-1 main) 판정 그대로 — 역검증 전용 사본. ⛔ 제품 코드가 이것을 쓰면 안 된다. */
function legacyIsCompletionClaim(text: string, purpose: "transfer" | "link"): boolean {
  const byPurpose = {
    transfer: /보냈|부쳤|(?:입금|이체|송금)\s*(?:했|해\s*드렸|완료)|넣었|넣어\s*드렸/,
    link: /눌렀|들어갔|접속했|입력했|신청했|진행했|인증했/,
  }[purpose];
  const generic = /다\s*했|했어요|했습니다|완료(?:했|됐)|마쳤|끝냈/;
  const target =
    /송금|입금|이체|계좌|링크|신청|설치|앱|인증|말씀하신\s*대로|안내(?:하신|해\s*주신)?\s*대로|알려\s*주신\s*대로|시키신\s*대로|하라는\s*대로|하라고\s*하신\s*대로|문자(?:\s*안내)?\s*대로/;
  const exclude =
    /(?:안|못)\s*(?:보냈|했|넣었|눌렀|해)|않았|아직|싫|안\s*할|못\s*하겠|할까요|하나요|해야|전화했|물어봤|신고했|확인했|알아봤/;
  return (text.match(/[^.?!\n]+[.?!]?/g) ?? []).some((raw) => {
    const s = raw.trim();
    if (s.length === 0 || s.endsWith("?")) return false;
    if (exclude.test(s)) return false;
    return byPurpose.test(s) || (generic.test(s) && target.test(s));
  });
}

const A2_CASES: Array<{ row: string; text: string; purpose: "transfer" | "link"; expected: boolean }> = [
  // ⓐ 주장 + 질문이 한 문장(종결 어미 뒤 쉼표 · 그런데/근데)
  { row: "ⓐ", text: "방금 보냈어요, 확인되나요?", purpose: "transfer", expected: true },
  { row: "ⓐ", text: "보냈어요 그런데 아직 안 들어갔나요?", purpose: "transfer", expected: true },
  { row: "ⓐ", text: "이체했어요, 근데 확인됐어요?", purpose: "transfer", expected: true },
  { row: "ⓐ", text: "링크 눌렀어요, 이제 어떻게 해요?", purpose: "link", expected: true },
  // ⓑ 목적 교차 — transfer 세션에서 다른 목적의 행동
  { row: "ⓑ", text: "앱 설치했어요", purpose: "transfer", expected: false },
  { row: "ⓑ", text: "링크 눌러서 신청했어요", purpose: "transfer", expected: false },
  // ⓒ link 갈래 부정
  { row: "ⓒ", text: "보냈는데 안 들어갔대요", purpose: "link", expected: false },
  { row: "ⓒ", text: "링크가 안 들어갔어요", purpose: "link", expected: false },
  // ⓓ 되돌림
  { row: "ⓓ", text: "보냈다가 취소했어요", purpose: "transfer", expected: false },
  { row: "ⓓ", text: "보냈어요. 근데 바로 취소했어요", purpose: "transfer", expected: false },
];

test("[A-2 QA ⓐⓑⓒⓓ] 판정표 추가 행 — 표본 전부 기대대로 · 고치기 전 판정이면 전부 반대였다(역검증)", () => {
  const flipped: string[] = [];
  for (const c of A2_CASES) {
    assert.equal(isCompletionClaim(c.text, c.purpose), c.expected, `${c.row} ${c.purpose}: ${c.text}`);
    if (legacyIsCompletionClaim(c.text, c.purpose) !== c.expected) flipped.push(`${c.row} ${c.text}`);
  }
  console.log(`[A-2 QA 역검증] 고치기 전 판정과 다른 표본 ${flipped.length}/${A2_CASES.length}`);
  assert.equal(flipped.length, A2_CASES.length, "표본 중 고치기 전에도 이미 맞던 것이 있다 — 그 표본은 이 행의 증거가 아니다");
});

test("[A-2 QA 정탐 회귀] 기존 정탐 · 오탐 표본은 판정이 그대로다(ⓐ 절 나눔이 연결 어미 문장을 쪼개지 않는다 포함)", () => {
  for (const [text, purpose] of MAJOR2_TRUE_POSITIVES) {
    assert.equal(isCompletionClaim(text, purpose), true, `놓침(${purpose}): ${text}`);
  }
  for (const text of MAJOR2_FALSE_POSITIVES) {
    assert.equal(isCompletionClaim(text, "transfer"), false, `오탐(transfer): ${text}`);
    assert.equal(isCompletionClaim(text, "link"), false, `오탐(link): ${text}`);
  }
  // 종전 행 유지 — 연결 어미(-는데)로 이어진 질문은 한 절이다 · 순수 질문 · 부정은 그대로 아니다.
  for (const text of ["보냈는데 확인됐어요?", "확인됐어요?", "아직이에요?", "보내야 하나요?", "아직 안 보냈어요", "네, 보낼게요"]) {
    assert.equal(isCompletionClaim(text, "transfer"), false, `오탐: ${text}`);
  }
  // ⓑ 반대 방향 — link 세션의 설치 · 신청은 여전히 주장이다(목적별로 나눴을 뿐 항목은 그대로).
  for (const text of ["앱 설치했어요", "링크 눌러서 신청했어요", "앱 설치 마쳤어요"]) {
    assert.equal(isCompletionClaim(text, "link"), true, `놓침(link): ${text}`);
  }
  // ⓒ 반대 방향 — 부정이 없는 link 완료는 그대로 주장이다.
  assert.equal(isCompletionClaim("들어갔어요", "link"), true);
  // ⓓ 되돌림 어휘가 없는 transfer 완료는 그대로 주장이다.
  assert.equal(isCompletionClaim("보냈다니까요", "transfer"), true);
});

/**
 * A-2 1차(절 나눔만 · 번복 행 없음) 판정 그대로 — 리뷰 Major 1 역검증 전용 사본. ⛔ 제품 코드가 이것을 쓰면 안 된다.
 * 지금 판정에서 "뒤 절 번복" 행만 뺀 것이다.
 */
function clauseSplitWithoutRetraction(text: string, purpose: "transfer" | "link"): boolean {
  const byPurpose = {
    transfer: /보냈|부쳤|(?:입금|이체|송금)\s*(?:했|해\s*드렸|완료)|넣었|넣어\s*드렸/,
    link: /눌렀|들어갔|접속했|입력했|신청했|진행했|인증했/,
  }[purpose];
  const generic = /다\s*했|했어요|했습니다|완료(?:했|됐)|마쳤|끝냈/;
  const target = { transfer: /송금|입금|이체|계좌/, link: /링크|신청|설치|앱|인증/ }[purpose];
  const followed =
    /말씀하신\s*대로|안내(?:하신|해\s*주신)?\s*대로|알려\s*주신\s*대로|시키신\s*대로|하라는\s*대로|하라고\s*하신\s*대로|문자(?:\s*안내)?\s*대로/;
  const exclude =
    /(?:안|못)\s*(?:보냈|했|넣었|눌렀|해|들어갔|접속했|입력했|신청했|진행했|인증했)|않았|아직|싫|안\s*할|못\s*하겠|할까요|하나요|해야|전화했|물어봤|신고했|확인했|알아봤/;
  if (/취소|되돌렸|돌려받/.test(text)) return false;
  return (text.match(/[^.?!\n]+[.?!]?/g) ?? []).some((raw) => {
    const s = raw.trim();
    if (s.length === 0) return false;
    const targeted = target.test(s) || followed.test(s);
    return s.split(/(?<=[요다죠])\s*,\s*|(?<=[요다죠])\s+(?=그런데|근데)/).some((rc) => {
      const c = rc.trim();
      if (c.length === 0 || c.endsWith("?")) return false;
      if (exclude.test(c)) return false;
      return byPurpose.test(c) || (generic.test(c) && targeted);
    });
  });
}

test("[A-2 리뷰 Major 1] 뒤 절이 앞 절을 번복하면 문장 전체 제외 — 번복 행 없는 1차 판정은 주장으로 잡았다(역검증) · ⓐ 표본은 그대로 참", () => {
  const retracted: Array<[string, "transfer" | "link"]> = [
    ["보냈어요, 아니 아직 안 보냈어요", "transfer"],
    ["보냈어요, 못 보냈어요", "transfer"],
    ["이체했어요, 아뇨 아직이에요", "transfer"],
    ["링크 눌렀어요, 근데 안 들어갔어요", "link"],
  ];
  for (const [text, purpose] of retracted) {
    assert.equal(isCompletionClaim(text, purpose), false, `번복 놓침(${purpose}): ${text}`);
    assert.equal(clauseSplitWithoutRetraction(text, purpose), true, `역검증 전제 — 1차 판정이 이 표본을 주장으로 잡아야 한다: ${text}`);
  }
  // ⓐ 유지 — 뒤 절이 질문이면 번복이 아니다.
  for (const c of A2_CASES.filter((x) => x.row === "ⓐ")) {
    assert.equal(isCompletionClaim(c.text, c.purpose), true, `ⓐ 회귀: ${c.text}`);
  }
  // 번복 뒤 다시 주장(앞 절이 부정 · 뒤 절이 주장)은 주장이다.
  assert.equal(isCompletionClaim("아까는 못 보냈어요, 방금 보냈어요", "transfer"), true);
});

test("[A-2 QA ⓐ 판정 경로] 주장+질문 발화가 필수 문자 도착 뒤 첫 주장이면 confirm 1회 — 고치기 전이면 no_claim이었다", () => {
  const delivered = [{ smsId: "loan-account", userTurnsAtArrival: 7 }];
  const plan = planConfirmResult({
    scenarioId: LOAN,
    declared: [TRANSFER],
    delivered,
    userTurns: 8,
    currentUserText: "방금 보냈어요, 확인되나요?",
    priorUserTexts: SCRIPT_A_PRIORS,
  });
  assert.equal(plan.reason, "confirm");
  assert.equal(legacyIsCompletionClaim("방금 보냈어요, 확인되나요?", "transfer"), false, "역검증 전제 — 고치기 전에는 놓쳤다");
});

// ── T194-c-1 G608(docs/Architecture.md §84.15.4 · Q-X3) — 설치 화면을 여는 문자(Q2)는 결과 신호 대상이 아니다 ─────────────
/** R-e 사본 — T194-c-1 이전 `confirmResultPurposeFor` 원문 그대로(목적만 본다 · 설치 문자 판별 없음). */
function confirmResultPurposeForBeforeQ2(item: FlowVariantSms | undefined): "transfer" | "link" | undefined {
  if (!item || !item.required || !(item.purpose === "transfer" || item.purpose === "link")) return undefined;
  return item.purpose;
}

test("[T194-c-1 G608 · R-e] Q2 설치 문자 — 사본(목적만)은 'link'로 결과 신호를 내고, 수정본은 폴백 · Live 모두 대상 0 · 계좌 문자는 그대로", (t) => {
  const q2 = FLOW_VARIANTS.filter((v) => v.sms.some((s) => isInCallInstallSms(v.scenarioId, s.smsId)));
  assert.deepEqual(q2.map((v) => v.variantId).sort(), ["fv-d8pw", "fv-e5mv", "fv-m3hd", "fv-r4hc", "fv-tvnj", "fv-u9fz", "fv-w3dq", "fv-x7ue"], "Q2 설치 문자를 선언한 변형은 자가 고급 4벌(§92 — 카드사 흡수 변형 fv-w3dq 추가)");
  const lines: string[] = [];
  for (const v of q2) {
    const declared = resolveDeclaredSms(v.scenarioId, v.variantId).declared;
    const install = declared.find((d) => isInCallInstallSms(v.scenarioId, d.smsId));
    assert.ok(install && install.required && install.purpose === "link", `${v.variantId}: 설치 문자는 필수 link(#182)`);
    const before = confirmResultPurposeForBeforeQ2(install);
    const after = confirmResultPurposeFor(install, v.scenarioId);
    // 폴백 — 설치 문자가 도착한 뒤 "앱 설치했어요"(공통 완료 동사 + 대상 "설치 · 앱" — 예전이면 주장으로 셌다).
    assert.equal(isCompletionClaim("앱 설치했어요", "link"), true, "전제 — 이 발화는 link 완료 주장 판정에 걸린다");
    const fallback = planConfirmResult({
      scenarioId: v.scenarioId,
      declared,
      delivered: [{ smsId: install.smsId, userTurnsAtArrival: 4 }],
      userTurns: 5,
      currentUserText: "앱 설치했어요",
      priorUserTexts: ["네", "누구세요", "네", "알겠어요"],
    });
    const live = buildConfirmResultField({ placed: false, scenarioId: v.scenarioId }, install);
    lines.push(`${v.variantId}: 사본=${before} · 수정본=${after} · 폴백=${fallback.reason} · Live=${JSON.stringify(live)}`);
    assert.equal(before, "link", "R-e 사본이 결과 신호를 내야 역방향이 성립한다");
    assert.equal(after, undefined);
    assert.equal(fallback.reason, "no_required_arrival");
    assert.equal(fallback.instruction, undefined);
    assert.deepEqual(live, {});
  }
  t.diagnostic(`[G608 · R-e] ${lines.join(" | ")}`);
  // 같은 loan 자가 고급 세션의 계좌 문자는 결과 신호 그대로(설치 제외가 계좌까지 막지 않는다).
  const loanSelf = resolveDeclaredSms(LOAN, "fv-m3hd").declared;
  const transferItem = loanSelf.find((d) => d.purpose === "transfer");
  assert.equal(confirmResultPurposeFor(transferItem, LOAN), "transfer");
  const afterTransfer = planConfirmResult({
    scenarioId: LOAN,
    declared: loanSelf,
    delivered: [
      { smsId: "loan-check-app-link", userTurnsAtArrival: 4 },
      { smsId: "loan-account", userTurnsAtArrival: 7 },
    ],
    userTurns: 8,
    currentUserText: "알겠어요, 보냈어요",
    priorUserTexts: SCRIPT_A_PRIORS,
  });
  assert.equal(afterTransfer.reason, "confirm");
  assert.equal(afterTransfer.purpose, "transfer");
});

test("[T194-c-1 G608 배선] 폴백(sendMessage)과 Live(deliverInCallSms)가 같은 판별 함수에 세션 시나리오를 넘긴다(소스 스캔)", () => {
  assert.match(read("roleplay/index.ts"), /\? planConfirmResult\(\{\n\s*scenarioId: session\.scenarioId,/);
  const confirmSrc = read("inCallSms/confirmResult.ts");
  assert.match(confirmSrc, /if \(isInCallInstallSms\(scenarioId, item\.smsId\)\) return undefined;/);
  assert.match(confirmSrc, /const purpose = confirmResultPurposeFor\(item, input\.scenarioId\);/);
  assert.match(read("inCallSms/buildDoc.ts"), /const purpose = confirmResultPurposeFor\(declaredItem, input\.scenarioId\);/);
});
