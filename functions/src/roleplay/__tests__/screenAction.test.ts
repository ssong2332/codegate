// ⭐ 화면 행동만 인정(실기기 신고 2026-11-01 · 카드사 고급 fv-x7ue · 메인 "간소화안으로" ①) — 판정표 SA · SB · 공통 규칙 · Live 확인 결과 · 배선.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildScreenStatusLine,
  inCallScreenFacts,
  installPendingSince,
  isScreenClaim,
  messengerScreenFacts,
  planScreenAction,
  screenActionApplies,
  screenKindOf,
  sessionScreenActionOnly,
  SCREEN_ACTION_EXEMPT_VARIANTS,
  SCREEN_NOT_DONE_INSTRUCTION,
  type ScreenFact,
} from "../screenAction";
import { buildSystemPrompt, SCREEN_ACTION_ONLY_RULE } from "../promptAssembly";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { planSmsBackstop, type DeliveredSmsRecord } from "../../inCallSms/smsGate";
import { buildConfirmResultField } from "../../inCallSms/buildDoc";
import { buildLiveConfirmResultInstruction, buildLiveScreenConfirmInstruction } from "../../inCallSms/confirmResult";

const CARD = "card-company-impersonation";
const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const guard: DeliveredSmsRecord = { smsId: "card-guard-app-link", userTurnsAtArrival: 2, fakeLandingId: "card-guard-app-install" };
const relief: DeliveredSmsRecord = { smsId: "card-relief-account", userTurnsAtArrival: 6, fakeLandingId: "card-relief-transfer" };

test("[화면 종류] 카탈로그로 설치 · 이체 · 입력을 가른다 · 카탈로그 밖 = undefined", () => {
  assert.equal(screenKindOf(CARD, "card-guard-app-install"), "install");
  assert.equal(screenKindOf(CARD, "card-relief-transfer"), "transfer");
  assert.equal(screenKindOf("prosecution-cooperation-call", "case-record-view"), "form");
  assert.equal(screenKindOf(CARD, "no-such-landing"), undefined);
});

test("[완료 주장] 설치 · 이체 · 입력 — 부정 · 물음은 주장이 아니다", () => {
  for (const t of ["네, 눌러서 설치했어요.", "깔았어요", "권한 허용 눌렀어요", "설치 완료요."]) assert.ok(isScreenClaim("install", t), t);
  for (const t of ["설치 안 했어요.", "설치했어요?", "어떻게 설치해요?", "네, 말씀하세요."]) assert.equal(isScreenClaim("install", t), false, t);
  for (const t of ["네, 보냈어요.", "이체했어요", "링크는 안 눌렀고, 제 은행 앱으로 따로 보냈어요."]) assert.ok(isScreenClaim("transfer", t), t);
  for (const t of ["아직 안 보냈어요.", "보냈어요?"]) assert.equal(isScreenClaim("transfer", t), false, t);
});

test("[판정표 SA] 말로만 완료 주장 = 미완료 지시 · 화면에서 마쳤으면 말과 상관없이 없음 · 적용 제외 = 없음", () => {
  const pendingInstall: ScreenFact[] = [{ landingId: "card-guard-app-install", kind: "install", done: false }];
  // SA1 — 신고 재현 1: 권한 허용 없이 "설치했어요".
  assert.deepEqual(planScreenAction({ applies: true, facts: pendingInstall, currentUserText: "네, 눌러서 설치했어요." }), {
    kind: "install",
    instruction: SCREEN_NOT_DONE_INSTRUCTION.install,
  });
  // SA1 — 신고 재현 2: 이체 화면 없이 "보냈어요".
  const both: ScreenFact[] = [
    { landingId: "card-guard-app-install", kind: "install", done: true },
    { landingId: "card-relief-transfer", kind: "transfer", done: false },
  ];
  assert.equal(planScreenAction({ applies: true, facts: both, currentUserText: "네, 보냈어요." })?.kind, "transfer");
  // SA2 — 화면에서 마쳤다(말과 상관없이) · 주장 없음.
  assert.equal(planScreenAction({ applies: true, facts: both, currentUserText: "설치했다니까요." }), undefined);
  assert.equal(planScreenAction({ applies: true, facts: [{ ...both[1]!, done: true }], currentUserText: "네, 보냈어요." }), undefined);
  assert.equal(planScreenAction({ applies: true, facts: pendingInstall, currentUserText: "그 다음엔 어떻게 해요?" }), undefined);
  // SA0 — 적용 제외 · 화면 0.
  assert.equal(planScreenAction({ applies: false, facts: pendingInstall, currentUserText: "설치했어요." }), undefined);
  assert.equal(planScreenAction({ applies: true, facts: [], currentUserText: "설치했어요." }), undefined);
});

test("[화면 사실] 통화 중 문자 = 문자 기록 + mockScreens 응낙 / 메신저 = 사기범 칩 + mockScreens 제출", () => {
  const records = [{ landingId: "card-guard-app-install", consented: true, submitted: false }];
  assert.deepEqual(inCallScreenFacts(CARD, [guard, { ...relief, landingSubmitted: true }, { smsId: "x" }], records), [
    // R6(#465) — 재촉 단계 판정(SP)용으로 보낸 시점의 발화 수(문자 도착 기록)를 함께 싣는다.
    { landingId: "card-guard-app-install", kind: "install", done: true, offeredAtUserTurns: 2 },
    { landingId: "card-relief-transfer", kind: "transfer", done: true, offeredAtUserTurns: 6 },
  ]);
  assert.deepEqual(inCallScreenFacts(CARD, [guard, relief], []).map((f) => f.done), [false, false]);
  const K = "messenger-child-impersonation-kakao";
  const chip = { kind: "link" as const, displayText: "송금하기", fakeLandingId: "child-bank-transfer", harmless: true as const };
  const history = [
    { role: "scammer", attachments: [chip] },
    { role: "user" },
    { role: "scammer", attachments: [chip] },
  ];
  if (screenKindOf(K, "child-bank-transfer") === "transfer") {
    // R6 — 메신저 칩은 그 메시지 앞 참가자 메시지 수(처음 보낸 칩 = 0).
    assert.deepEqual(messengerScreenFacts(K, history, []), [{ landingId: "child-bank-transfer", kind: "transfer", done: false, offeredAtUserTurns: 0 }]);
    assert.deepEqual(messengerScreenFacts(K, history, [{ landingId: "child-bank-transfer", consented: false, submitted: true }])[0]?.done, true);
  } else {
    assert.fail("메신저 송금 칩 화면 id가 카탈로그에 없다 — 테스트 고정값 확인");
  }
});

test("[상태 줄] 폴백 매 턴 — 서버가 아는 화면 기록 그대로 · 적용 제외 · 화면 0 = 없음", () => {
  assert.equal(
    buildScreenStatusLine(true, inCallScreenFacts(CARD, [guard, relief], [])),
    "(앱 화면 기록: 설치 화면 — 권한 허용 기록 없음 · 이체 화면 — 이체 기록 없음. 기록이 없는 화면은 상대가 했다고 말해도 끝난 것으로 보지 않는다.)",
  );
  assert.equal(buildScreenStatusLine(false, inCallScreenFacts(CARD, [guard], [])), undefined);
  assert.equal(buildScreenStatusLine(true, []), undefined);
});

test("[문면 게이트] 미완료 지시 · 공통 규칙 · Live 화면형 — 따옴표 대사 예시 0 · 숫자 0 · 다음 단계 금지 · 화면 버튼 문구", () => {
  const texts = [...Object.values(SCREEN_NOT_DONE_INSTRUCTION), SCREEN_ACTION_ONLY_RULE, buildLiveScreenConfirmInstruction("transfer")];
  for (const t of texts) {
    assert.equal(/["“”'‘’]/.test(t), false, t);
    assert.equal(/[0-9]/.test(t), false, t);
  }
  for (const t of Object.values(SCREEN_NOT_DONE_INSTRUCTION)) assert.ok(t.includes("다음 단계로 넘어가지 마라"), t);
  assert.ok(SCREEN_NOT_DONE_INSTRUCTION.install.includes("권한 허용하고 계속하기"));
  assert.ok(SCREEN_ACTION_ONLY_RULE.includes("앱이 마쳤다고 알려 주면 상대가 무슨 말을 하든"));
});

test("[판정표 SB] 설치 화면 권한 허용 기록 없음 = 백스톱이 다음 필수 문자를 보류(Q3 — 시한 없음) · 허용하면 종전", () => {
  const declared = findFlowVariant("fv-x7ue")!.sms;
  const delivered = [guard];
  const pending = installPendingSince(true, CARD, delivered, []);
  assert.equal(pending, 2);
  const plan = (userTurns: number, since?: number) =>
    planSmsBackstop({ declared, delivered, userTurns, ...(since !== undefined ? { installPendingSince: since } : {}) }).action;
  // 종전(보류 없음): 이관 문자 하한 4 · 간격 1 → 넛지 5 · 발송 6.
  assert.deepEqual([4, 5, 6].map((u) => plan(u)), ["wait", "nudge", "deliver"]);
  // 보류: 권한 허용 기록이 생길 때까지 wait(Q3 2026-11-01 — 시한 없음 · 끝까지 안 하면 재촉 단계가 포기로 끝낸다).
  assert.deepEqual([4, 5, 6, 20].map((u) => plan(u, pending)), ["wait", "wait", "wait", "wait"]);
  // 허용했으면 보류 0 · 적용 제외면 보류 0.
  assert.equal(installPendingSince(true, CARD, delivered, [{ landingId: "card-guard-app-install", consented: true, submitted: false }]), undefined);
  assert.equal(installPendingSince(false, CARD, delivered, []), undefined);
  // 주장 백스톱도 보류 안에서는 밀지 않는다.
  assert.equal(planSmsBackstop({ declared, delivered, userTurns: 5, claimed: true, installPendingSince: 2 }).action, "wait");
});

test("[Live 확인 결과] 화면을 여는 문자 = 앱 알림 전 확인 금지형 · 화면 없는 문자 · 적용 제외 변형 = 종전 조건형", () => {
  const reliefItem = findFlowVariant("fv-x7ue")!.sms.find((s) => s.smsId === "card-relief-account");
  assert.deepEqual(buildConfirmResultField({ placed: false, scenarioId: CARD, flowVariantId: "fv-x7ue" }, reliefItem), {
    confirmResultInstruction: buildLiveScreenConfirmInstruction("transfer"),
  });
  const loan = findFlowVariant("fv-6s5p")!.sms.find((s) => s.purpose === "transfer");
  assert.deepEqual(buildConfirmResultField({ placed: false, scenarioId: "loan-refinance-scam", flowVariantId: "fv-6s5p" }, loan), {
    confirmResultInstruction: buildLiveConfirmResultInstruction("transfer"),
  });
  assert.deepEqual(buildConfirmResultField({ placed: true, scenarioId: CARD, flowVariantId: "fv-x7ue" }, reliefItem), {}, "호 전환 뒤 = 종전(없음)");
});

test("[공통 규칙] 화면이 있는 세션만 · #192 바이트 고정 2벌 제외 · 부재 = 블록 0(종전 바이트)", () => {
  assert.deepEqual([...SCREEN_ACTION_EXEMPT_VARIANTS], ["fv-akj5", "fv-6s5p"]);
  assert.equal(screenActionApplies("fv-akj5"), false);
  assert.equal(screenActionApplies(undefined), true);
  assert.equal(sessionScreenActionOnly(CARD, "fv-x7ue"), true);
  assert.equal(sessionScreenActionOnly(CARD, "fv-w3dq"), true);
  assert.equal(sessionScreenActionOnly("messenger-child-impersonation-kakao", "fv-tdgg"), true);
  assert.equal(sessionScreenActionOnly(CARD, "fv-akj5"), false);
  assert.equal(sessionScreenActionOnly("loan-refinance-scam", "fv-6s5p"), false);
  const base = { difficultyLevel: "advanced" as const };
  const prompt = resolveSessionScenarioPrompt(CARD, "fv-x7ue")!;
  const without = buildSystemPrompt(prompt, base);
  const withRule = buildSystemPrompt(prompt, { ...base, screenActionOnly: true });
  assert.equal(without.includes("[화면 행동 확인]"), false);
  assert.ok(withRule.includes(SCREEN_ACTION_ONLY_RULE));
  assert.equal(buildSystemPrompt(prompt, { ...base, screenActionOnly: false }), without, "거짓 = 종전 바이트");
});

test("[배선] 호출부 6곳 같은 술어 · 폴백 SA가 확인 결과 · 송금 사실보다 앞 · Live 콜러블 보류 · 변형 전달", () => {
  const callers: [string, string][] = [
    ["realtime/geminiProvider.ts", "input.scenarioId, input.flowVariantId"],
    ["roleplay/callReturnLine.ts", "session.scenarioId, session.flowVariantId"],
    ["roleplay/chatDuringCall.ts", "session.scenarioId, session.flowVariantId"],
    ["roleplay/index.ts", "session.scenarioId, session.flowVariantId"],
    ["roleplay/openingLine.ts", "scenarioId, flowVariantId"],
    ["roleplay/screenActionFollowUp.ts", "session.scenarioId, session.flowVariantId"],
  ];
  for (const [file, args] of callers) assert.ok(read(file).includes(`screenActionOnly: sessionScreenActionOnly(${args}),`), file);
  const send = read("roleplay/index.ts");
  assert.ok(send.includes("const confirmPlan =\n      !screenPlan &&"), "말로만 주장한 턴엔 확인 결과 신호 0");
  // N1 — 요구액보다 적게 보냈으면 받은 것으로 치지 않는다 · R1 등 — 상태 줄에 재촉 단계 맥락을 넘긴다.
  assert.ok(send.includes('userReportedTransfer(storedHistory, maskedUserText) && !transferScreenPending && latestTransferAmount(screenFacts) !== "less",'));
  assert.ok(send.indexOf("buildScreenStatusLine(screenApplies, screenFacts, {") < send.indexOf("confirmPlan?.instruction,\n        escalatedCallInstruction,"));
  assert.ok(send.includes("...(installPending !== undefined ? { installPendingSince: installPending } : {}),"));
  const live = read("inCallSms/index.ts");
  assert.ok(live.includes("...(installPending !== undefined ? { installPendingSince: installPending } : {}),"));
  assert.ok(live.includes("buildConfirmResultField({ placed, scenarioId: session.scenarioId, flowVariantId: session.flowVariantId }, declaredItem)"));
});
