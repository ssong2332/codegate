// ⭐ Edge 시험 2026-11-07(docs/research/edge-scenario-test-2026-11-07.md 판 11 · 20 · 22 · 23 · 24 · 25 · 26) — 메신저 · 문자 · 통화 흐름의 막다른 길.
// ① 말로만 송금 통과(판 20) · ② 계좌 전 이체 칩 · 빈 계좌 화면(판 25) · ③ 통화 중 통화 넘김 대사(판 23 · 24) · ④ 화면에 없는 요구(판 11 · 22 · 23 · 26) ·
// ⑤ 스미싱 첫 문자에 링크 없음(판 22 · 23 · 24).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assertsTransferConfirmed, guardUnconfirmedTransfer, TRANSFER_NOT_CONFIRMED_REPLY } from "../actionAcknowledgement";
import { messengerScreenFacts, planScreenAction, sessionScreenActionOnly } from "../screenAction";
import { finalizeBankTransferChips } from "../linkMarker";
import { CALL_PHASE_BLOCK, CALL_PHASE_NO_LINK_LINE, callPhaseScenarioPrompt } from "../escalatedCall";
import { buildSystemPrompt, NO_ACCOUNT_ENDING_SENTENCE, SCREEN_ACTION_ONLY_RULE } from "../promptAssembly";
import { generateOpeningLine, MESSENGER_OPENING_TURN_INSTRUCTION, SMS_SMISHING_OPENING_TURN_INSTRUCTION, smsOpeningLinkBackstop } from "../openingLine";
import { findFlowVariant, resolveSessionScenarioPrompt, routeEndsWithoutAccount } from "../../scenarios/flowVariants";
import { resolveRouteAccountNumber } from "../../inCallSms/smsGate";
import { findMockScreenItem } from "../../scenarios/mockScreens";
import { CARD_REBUILD_TACTICS } from "../../scenarios/cardRebuildLegs.prompt";
import type { MessengerAttachment } from "../../shared/types";

const SRC = path.join(__dirname, "..", "..", "..", "src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
const ACCOUNT = "948-2716-5093-27";

// ── ① 판 20 — 지인 사칭 중급 · 말로만 송금 ────────────────────────────────────────────────
test("[Edge ①] 추정 원인 반증 — 지인 사칭 중급 fv-fvsc도 화면 행동 판정을 받고 SA1 미완료 지시가 나온다", () => {
  assert.equal(findFlowVariant("fv-fvsc")?.scenarioId, "messenger-friend-loan-kakao", "중급도 변형이 있다(변형 없는 세션이 아니다)");
  assert.equal(sessionScreenActionOnly("messenger-friend-loan-kakao", "fv-fvsc"), true);
  const chip: MessengerAttachment = { kind: "link", displayText: "송금하기", fakeLandingId: "friend-bank-transfer", harmless: true };
  const facts = messengerScreenFacts(
    "messenger-friend-loan-kakao",
    [
      { role: "user", attachments: [] },
      { role: "scammer", attachments: [chip] },
    ],
    [],
  );
  assert.deepEqual(facts.map((f) => [f.kind, f.done]), [["transfer", false]]);
  assert.equal(planScreenAction({ applies: true, facts, currentUserText: "방금 150만원 보냈어 확인해봐" })?.kind, "transfer");
});

test("[Edge ①] U1b — 돈 낱말 없는 도착 · 수령 단정(판 20 원문)을 이체 미완료 세션에서 되돌림 1줄로 바꾼다", () => {
  const reply = "지금 보니까 들어온 것 같아. 진짜 살려줬다";
  assert.equal(assertsTransferConfirmed(reply), true);
  assert.deepEqual(guardUnconfirmedTransfer(reply, true), { text: TRANSFER_NOT_CONFIRMED_REPLY.casual, replaced: true });
  assert.equal(guardUnconfirmedTransfer(reply, false).replaced, false, "U2 — 이체 화면을 마쳤으면 그대로");
  for (const yes of ["어 들어왔어 고마워ㅠㅠ", "잘 받았어", "받은 거 같아 진짜 고마워"]) assert.equal(assertsTransferConfirmed(yes), true, yes);
});

test("[Edge ①] U1b 오탐 0 — 부정 · 물음 · 사진 · 메시지 도착은 송금 확인이 아니다", () => {
  for (const no of [
    "아직 안 들어왔어. 다시 해 줘",
    "아직 안 들어온 것 같아",
    "들어왔는지 확인해볼게",
    "들어온 거 맞아?",
    "사진 잘 받았어",
    "문자 들어왔어? 링크 눌러 봐",
    "신분증 사진 보내줘서 고마워ㅠㅠ",
  ]) {
    assert.equal(assertsTransferConfirmed(no), false, no);
  }
});

// ── ② 판 25 — 계좌 전 이체 칩 · 빈 계좌 화면 ───────────────────────────────────────────────
const transferChip = (): MessengerAttachment => ({ kind: "link", displayText: "이체하기", fakeLandingId: "child-bank-transfer", harmless: true });

test("[Edge ②] F2 — 최종 대사(문장 상한 · 교체 뒤)에 계좌가 없으면 이체 칩을 뺀다(원 대사에 있었어도)", () => {
  const out = finalizeBankTransferChips([transferChip()], "엄마 나 급해ㅠㅠ 200만 원만 보내줘. 계좌 알려줄게.", {
    accountNumber: ACCOUNT,
    bankName: "가온은행",
    history: [],
  });
  assert.equal(out, undefined);
});

test("[Edge ②] F4 — 계좌가 나온 대사 · 앞선 대사면 은행 · 계좌 · 예금주 · 요구액을 싣는다(모든 경로 같은 함수)", () => {
  const out = finalizeBankTransferChips([transferChip()], `가온은행 ${ACCOUNT}이야. 예금주는 이서준이야. 200만 원 보내줘`, {
    accountNumber: ACCOUNT,
    bankName: "가온은행",
    accountHolder: "이서준",
    history: [],
  });
  assert.deepEqual(out?.[0], { ...transferChip(), bankName: "가온은행", accountNumber: ACCOUNT, accountHolder: "이서준", transferAmount: "2,000,000" });
  const fromHistory = finalizeBankTransferChips([transferChip()], "빨리 보내줘ㅠㅠ", {
    accountNumber: ACCOUNT,
    bankName: "가온은행",
    history: [{ role: "scammer", textMasked: `가온은행 ${ACCOUNT}` }],
  });
  assert.equal(fromHistory?.[0]?.accountNumber, ACCOUNT, "P3 — 앞선 사기범 메시지에 계좌");
});

test("[Edge ②] F3 — 세션 은행명을 모르면(빈 칸 화면이 된다) 이체 칩만 뺀다 · 다른 칩은 그대로", () => {
  const other: MessengerAttachment = { kind: "link", displayText: "앱 설치하기", fakeLandingId: "child-insurance-install", harmless: true };
  const out = finalizeBankTransferChips([transferChip(), other], `가온은행 ${ACCOUNT}`, { accountNumber: ACCOUNT, bankName: undefined, history: [] });
  assert.deepEqual(out, [other]);
});

test("[Edge ②] 배선 — 칩을 내는 5경로가 저장 직전 최종 대사로 finalizeBankTransferChips를 부른다(선판정만 하던 경로 0)", () => {
  for (const file of ["roleplay/callReturnLine.ts", "roleplay/chatDuringCall.ts", "roleplay/screenActionFollowUp.ts", "roleplay/openingLine.ts"]) {
    const src = read(file);
    assert.ok(src.includes("finalizeBankTransferChips("), file);
    assert.ok(!src.includes("dropPrematureBankTransferChip("), `${file} — 선판정 제거`);
  }
  const index = read("roleplay/index.ts");
  const finalizeAt = index.indexOf("finalizeBankTransferChips(replyAttachments, finalReplyText");
  assert.ok(finalizeAt > index.indexOf("const finalReplyText = finalizeScammerReplyText(shapedReplyText);"), "최종 대사 뒤");
  assert.equal((index.match(/attachments: savedReplyAttachments/g) ?? []).length, 2, "저장 · 응답 둘 다");
});

// ── ③ 판 23 · 24 — 통화 중 통화 넘김 ──────────────────────────────────────────────────────
for (const [scenarioId, variantId] of [
  ["messenger-parcel-smishing-sms", "fv-g454"],
  ["messenger-subsidy-smishing-sms", "fv-afbr"],
] as const) {
  test(`[Edge ③] C1 ~ C4 — ${scenarioId} ${variantId} 통화 단계는 [에스컬레이션] 절 · 전환 신호 · 전화 예고를 싣지 않는다`, () => {
    const prompt = resolveSessionScenarioPrompt(scenarioId, variantId)!;
    assert.match(prompt.personaPrompt, /ESCALATE_VOICE/, "전제 — 문자 단계 프롬프트에는 있다");
    const call = callPhaseScenarioPrompt(prompt, { escalatedCall: true, inCallSmsEnabled: false });
    assert.doesNotMatch(call.personaPrompt, /ESCALATE_VOICE|\n\[에스컬레이션|전화\s*드릴게요/);
    assert.ok(!call.weakenedTactics.some((t) => t.includes("ESCALATE_VOICE")));
    assert.ok(call.weakenedTactics.length > 0);
    assert.ok(call.personaPrompt.endsWith(`${CALL_PHASE_BLOCK}\n${CALL_PHASE_NO_LINK_LINE}`));
    assert.match(call.personaPrompt, /\[링크 표현 규칙/, "다른 절은 그대로");
    assert.equal(callPhaseScenarioPrompt(prompt, { escalatedCall: false, inCallSmsEnabled: false }), prompt, "C0 — 문자 단계 같은 객체");
  });
}

test("[Edge ③] C0 — 처음부터 통화인 시나리오 · 전환 지시 없는 프롬프트는 같은 객체", () => {
  const card = resolveSessionScenarioPrompt("card-company-impersonation", undefined)!;
  assert.equal(callPhaseScenarioPrompt(card, { escalatedCall: true, inCallSmsEnabled: true }), card);
});

test("[Edge ③] 배선 — Live 토큰 · 폴백 턴이 메신저에서 넘어온 통화에서 callPhaseScenarioPrompt를 쓴다", () => {
  const gemini = read("realtime/geminiProvider.ts");
  assert.match(gemini, /callPhaseScenarioPrompt\(resolvedScenarioPrompt, \{\s*escalatedCall: input\.escalatedCall === true/);
  assert.match(read("realtime/index.ts"), /!callLeg && isEscalatedVoiceCall\(session\.channel, session\.channelHistory\) \? \{ escalatedCall: true \}/);
  assert.match(read("roleplay/index.ts"), /callPhaseScenarioPrompt\(resolvedScenarioPrompt, \{\s*escalatedCall: isEscalatedVoiceCall\(session\.channel, session\.channelHistory\)/);
});

// ── ④ 화면에 없는 요구 ─────────────────────────────────────────────────────────────────
test("[Edge ④] 판 22 · 23 · 26 — [화면 행동 확인]에 화면에 없는 단계 요구 금지 줄", () => {
  assert.match(SCREEN_ACTION_ONLY_RULE, /그 화면에 없는 단계\(권한을 하나 더 허용, 화면에 뜬 번호 불러 주기, 화면에 없는 인증번호 입력, 이미 마친 화면 다시 작성\)를 지어내 요구하지 않는다/);
});

test("[Edge ④] 판 23 — 택배 고급 4단계가 설치 화면에 없는 '권한 하나 더'를 요구하지 않는다", () => {
  const stages = findFlowVariant("fv-g454")!.stages.map((s) => s.summary).join("\n");
  assert.doesNotMatch(stages, /하나 더/);
  assert.match(stages, /앞서 문자로 보낸 링크 화면에서 마치라고/);
});

test("[Edge ④] 판 26 — 카드사 원격 앱 수법이 설치 화면에 없는 접속번호를 묻지 않는다", () => {
  assert.doesNotMatch(CARD_REBUILD_TACTICS.remoteApp, /접속번호/);
});

test("[Edge ④] 판 11 — 보관 신청서 칸이 금 구매형에도 맞는다(서버 카탈로그 = 화면 문구)", () => {
  const item = findMockScreenItem("asset-protection-notice-call", "asset-custody-apply");
  assert.ok(item?.fields?.includes("보관 방법(현금 · 수표 · 금 실물)"));
  assert.ok(!item?.fields?.some((f) => f.includes("현금 또는 수표")));
  const client = readFileSync(path.join(SRC, "..", "..", "src", "components", "MessengerFakeLanding.tsx"), "utf8");
  assert.ok(client.includes('{ label: "보관 방법(현금 · 수표 · 금 실물)"'));
});

test("[Edge ④] 판 31 — 지원금 · 택배 문자 루트(이체 수단 0) 조립 프롬프트에 예시 계좌 · '이 번호를 그대로 쓴다' 0 · 계좌 결말 금지 1문장", () => {
  for (const [scenarioId, variantId] of [
    ["messenger-subsidy-smishing-sms", "fv-hu8w"],
    ["messenger-parcel-smishing-sms", "fv-tvq2"],
  ] as const) {
    assert.equal(routeEndsWithoutAccount(scenarioId, variantId), true, variantId);
    const assembled = buildSystemPrompt(resolveSessionScenarioPrompt(scenarioId, variantId)!, {
      difficultyLevel: "advanced",
      fictionalBankName: "다온은행",
      sessionAccountNumber: resolveRouteAccountNumber(scenarioId, variantId),
      noAccountEnding: routeEndsWithoutAccount(scenarioId, variantId),
      screenActionOnly: true,
    });
    assert.ok(!assembled.includes(ACCOUNT), variantId);
    assert.ok(!assembled.includes("이 번호를 그대로 쓴다"), variantId);
    assert.ok(assembled.includes(NO_ACCOUNT_ENDING_SENTENCE), variantId);
  }
  assert.equal(routeEndsWithoutAccount("messenger-friend-loan-kakao", "fv-fvsc"), false, "송금 칩이 있는 지인 사칭은 그대로");
});

// ── ⑤ 판 22 · 23 · 24 — 스미싱 첫 문자───────────────────────────────────────────────────
test("[Edge ⑤] O1s — 문자 스미싱 첫 문자 지시는 사유 · 기한 · 링크를 한 통에 · '보낸 링크' 금지", () => {
  assert.match(SMS_SMISHING_OPENING_TURN_INSTRUCTION, /한 통 안에/);
  assert.match(SMS_SMISHING_OPENING_TURN_INSTRUCTION, /인사만 보내고 답을 기다리지 않는다/);
  assert.match(SMS_SMISHING_OPENING_TURN_INSTRUCTION, /앞서 보낸 링크라고 말하지 않는다/);
  assert.notEqual(SMS_SMISHING_OPENING_TURN_INSTRUCTION, MESSENGER_OPENING_TURN_INSTRUCTION);
  assert.match(read("roleplay/openingLine.ts"), /isSmsSmishingOpening\s*\?\s*SMS_SMISHING_OPENING_TURN_INSTRUCTION/);
});

test("[Edge ⑤] 백스톱 — 세션이 링크로 여는 화면이 1개면 그 칩(택배 중급 · 고급 · 지원금)", () => {
  const ids = (s: string, v: string, level: "intermediate" | "advanced") =>
    smsOpeningLinkBackstop(s, v, { difficultyLevel: level, flowVariantId: v })?.map((a) => a.fakeLandingId);
  assert.deepEqual(ids("messenger-parcel-smishing-sms", "fv-tvq2", "intermediate"), ["parcel-redelivery"]);
  assert.deepEqual(ids("messenger-parcel-smishing-sms", "fv-g454", "advanced"), ["parcel-install"]);
  assert.deepEqual(ids("messenger-subsidy-smishing-sms", "fv-afbr", "intermediate"), ["subsidy-install"]);
});

test("[Edge ⑤] 첫 문자(Mock)에 링크 칩이 붙는다 — 택배 중급 · 지원금 중급", async () => {
  for (const [scenarioId, variantId] of [
    ["messenger-parcel-smishing-sms", "fv-tvq2"],
    ["messenger-subsidy-smishing-sms", "fv-afbr"],
  ] as const) {
    const opening = await generateOpeningLine(scenarioId, "intermediate", variantId);
    assert.ok((opening.message.attachments ?? []).length > 0, scenarioId);
  }
});
