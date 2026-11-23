// 2026-11-24 페르소나 점검 묶음 ③ — 사기범 인물 · 설정 일관성(`docs/research/persona-consistency-2026-11-24.md` 판정표 OP · LV · PH · AP · TR · VS · S1b).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildLiveCallSafetyBlock,
  buildSystemPrompt,
  LIVE_CALL_NAME_CONFIRM_RULE,
  LIVE_CALL_PUBLIC_PROGRAM_RULE,
  LIVE_CALL_REASK_RULE,
} from "../promptAssembly";
import { OPENING_TURN_INSTRUCTION } from "../openingLine";
import { pinSessionAccountNumber } from "../accountPin";
import { TRANSFER_REPORTED_INSTRUCTION } from "../actionAcknowledgement";
import { asksIdentityCheck } from "../personaAuthority";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { findFlowVariant, resolveSessionScenarioPrompt, withPlaceholderNames } from "../../scenarios/flowVariants";
import { extractTacticFlavor, extractTacticLabel } from "../../scenarios/tacticFlavor";
import { MockLlmClient } from "../../llm/mockClient";
import { guardLiveScammerLine, stripForeignScript } from "../../realtime/liveTranscriptGuard";
import { REAL_COMPANY_NAME_RULES, compileCompanyRule } from "../../guardrails/realCompanyNames";
import { replaceRealFinancialNames } from "../../guardrails/realFinancialNames";
import { resolveRouteAccountNumber } from "../../inCallSms/smsGate";
import { IN_CALL_SMS } from "../../scenarios/inCallSms";

const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8");

// ── 항목 1 · 판정표 OP ──────────────────────────────────────────────
test("[OP] 첫 마디 지시 — 신원을 밝히지 않는 인물은 소속 · 이름을 지어내지 않는다(평판 협박 첫 대사 4/4 사칭 재현 원인)", () => {
  assert.ok(OPENING_TURN_INSTRUCTION.startsWith("[오프닝 지침] 지금이 이 통화/대화의 첫 마디다."), "OP1 종전 머리 유지");
  assert.match(OPENING_TURN_INSTRUCTION, /신원을 밝히지 않는 인물이면 소속·기관·이름을 지어내지 말고 연락한 이유만/);
  const blackmail = SCENARIO_PROMPTS["reputation-blackmail-scam"]!.personaPrompt;
  assert.match(blackmail, /신원을 밝히지 않는 협박범/, "전제 — 페르소나가 신원을 숨긴다");
  assert.match(blackmail, /첫 마디도 마찬가지다/);
  // 화면 Live 트리거(첫 마디의 실제 지시)도 같은 조건을 싣는다.
  const client = readFileSync(path.resolve(__dirname, "../../../../src/lib/realtime/GeminiVoiceSession.tsx"), "utf8");
  const trigger = client.slice(client.indexOf("const OPENING_TRIGGER_TURN ="), client.indexOf(";", client.indexOf("const OPENING_TRIGGER_TURN =")));
  assert.match(trigger, /신원을 밝히지 않는 인물이면 소속·기관·이름을 지어내지 말고 전화를 건 이유만/);
});

// ── 항목 2 · 3 · 6 · 판정표 LV ──────────────────────────────────────
test("[LV] Live 블록 L5 · L6 · L7 — 전 시나리오 Live에 1회씩 · 폴백(비 Live)에는 0회", () => {
  for (const [id, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const opts = { difficultyLevel: "advanced" as const, identityCheckAllowed: asksIdentityCheck(id) };
    const live = buildSystemPrompt(prompt, { ...opts, liveSpeechStyle: true });
    const text = buildSystemPrompt(prompt, opts);
    for (const rule of [LIVE_CALL_REASK_RULE, LIVE_CALL_NAME_CONFIRM_RULE, LIVE_CALL_PUBLIC_PROGRAM_RULE]) {
      assert.equal(live.split(rule).length - 1, 1, `${id}: Live 1회`);
      assert.equal(text.includes(rule), false, `${id}: 폴백 0회(바이트 고정 조립 무변경)`);
    }
  }
});

test("[LV] L5 되묻기는 인물 말투 · L6 이름 확인 꼴 금지 · L7 일반 이름 — 실존 회사 · 은행 이름 예시 0", () => {
  assert.match(LIVE_CALL_REASK_RULE, /알아들었으면 되묻지 말고/);
  assert.match(LIVE_CALL_REASK_RULE, /인물의 말투 그대로 짧게/);
  assert.match(LIVE_CALL_NAME_CONFIRM_RULE, /이름을 넣어 확인하지 않는다/);
  assert.match(LIVE_CALL_NAME_CONFIRM_RULE, /\[미리 확보한 상대 정보\]/, "카드에 적힌 이름은 예외");
  assert.match(LIVE_CALL_PUBLIC_PROGRAM_RULE, /공공 기금/);
  const block = buildLiveCallSafetyBlock(false);
  for (const rule of REAL_COMPANY_NAME_RULES) {
    const pattern = compileCompanyRule(rule);
    pattern.lastIndex = 0;
    assert.equal(pattern.test(block), false, rule.label);
  }
  assert.equal(replaceRealFinancialNames(block).replacedCount, 0, "실존 은행 · 카드사 이름 0");
});

test("[S1b] Live 자막 · 저장 전사 — 외국 문자 묶음만 지운다(실측 '지금 결정 안하시면 이 조건' 재현)", () => {
  const persian = String.fromCharCode(0x627, 0x6cc, 0x646);
  const line = `지금 결정 안하시면 ${persian} 조건으로는 어렵습니다.`;
  assert.equal(guardLiveScammerLine(line), "지금 결정 안하시면 조건으로는 어렵습니다.");
  const cyrillic = String.fromCharCode(0x434, 0x430);
  assert.equal(stripForeignScript(`네, ${cyrillic} 맞습니다.`), "네, 맞습니다.");
  for (const keep of ["고객님 OK 확인됐습니다.", "사건번호 2026형제1234 입니다.", "金融 관련 건입니다."]) {
    assert.equal(stripForeignScript(keep), keep, `무변경: ${keep}`);
  }
});

// ── 항목 4 · 판정표 AP ──────────────────────────────────────────────
test("[AP] 지어낸 계좌번호 → 세션 계좌(실측 fv-bxvp S4 재현) · 문자 속 계좌 · 전화 · 카드 · 날짜 · 맥락 없음 = 그대로", () => {
  const scenarioId = "messenger-friend-loan-kakao";
  const session = resolveRouteAccountNumber(scenarioId, "fv-bxvp");
  assert.match(session, /^\d{3}-\d{4}-\d{4}-\d{2}$/);
  const invented = "아 맞다ㅠ 그럼 한결은행로 보내줘. 계좌는 한결은행 9012-3456-7890-12인데, 예금주가 한승우야.";
  assert.equal(pinSessionAccountNumber(invented, scenarioId, session), invented.replace("9012-3456-7890-12", session), "AP3");
  assert.equal(pinSessionAccountNumber(`계좌는 한결은행 ${session}이야`, scenarioId, session), `계좌는 한결은행 ${session}이야`, "AP2 세션 계좌");
  // AP2 — 같은 시나리오 문자 본문 속 다른 계좌는 그대로(두 계좌 루트 보호).
  const card = "card-company-impersonation";
  const smsAccounts = (IN_CALL_SMS[card] ?? []).flatMap((item) => item.body.match(/\d{3}-\d{4}-\d{4}-\d{2}/g) ?? []);
  assert.ok(smsAccounts.length > 0, "전제 — 문자 계좌가 있는 시나리오");
  for (const acct of smsAccounts) {
    assert.equal(pinSessionAccountNumber(`이체 계좌는 ${acct}입니다`, card, "111-2222-3333-44"), `이체 계좌는 ${acct}입니다`);
  }
  for (const keep of [
    "이체 문의는 070-0438-9172로 하세요.", // 0 시작 = 전화
    "이체하신 카드 1234-5678-9012-3456 맞으시죠?", // 16자리 = 카드
    "접수번호 2026-1124-0042-77 확인됐습니다.", // 계좌 낱말 없음
    "송금은 2026-11-24까지 하셔야 해요.", // 10자리 미만 = 날짜
  ]) {
    assert.equal(pinSessionAccountNumber(keep, scenarioId, session), keep, `AP4: ${keep}`);
  }
});

test("[AP 배선] 텍스트 sendMessage · 오프닝 둘 다 가상 은행명 맞춤 뒤에 계좌를 고정한다", () => {
  assert.match(read("roleplay/index.ts"), /pinSessionAccountNumber\(\s*applyFictionalBank\(realNameReplacedText, fictionalBankName\),\s*session\.scenarioId,\s*routeAccountNumber,\s*\)/);
  assert.match(read("roleplay/openingLine.ts"), /pinSessionAccountNumber\(\s*fictionalBankName \? applyFictionalBank\(realNameReplacedText, fictionalBankName\) : realNameReplacedText,\s*scenarioId,\s*resolveRouteAccountNumber\(scenarioId, flowVariantId\),\s*\)/);
});

// ── 항목 5 · 판정표 PH ──────────────────────────────────────────────
test("[PH] 카드 배송 변형은 자리표시 앱 이름 0 · 설치 화면 이름 / 카드사 fv-akj5(바이트 고정)는 원문 그대로", () => {
  for (const variantId of ["fv-tvnj", "fv-e5mv", "fv-u9fz"]) {
    const prompt = resolveSessionScenarioPrompt("card-delivery-call", variantId)!;
    const all = [prompt.personaPrompt, ...prompt.weakenedTactics].join("\n");
    assert.equal(all.includes("○○안심보안"), false, `${variantId}: 자리표시 0`);
    assert.ok(all.includes("보안 점검 앱"), `${variantId}: 화면 이름`);
  }
  // 역검증 — 변환 전 원문에는 자리표시가 있었다(이 시험이 빈 통과가 아님).
  assert.ok(SCENARIO_PROMPTS["card-delivery-call"]!.personaPrompt.includes("○○안심보안"));
  const akj5 = findFlowVariant("fv-akj5")!;
  assert.ok(akj5.tactics.some((t) => t.includes("○○안심보안")), "PH2 — fv-akj5 원문 유지");
  assert.ok(resolveSessionScenarioPrompt("card-company-impersonation", "fv-akj5")!.weakenedTactics.some((t) => t.includes("○○안심보안")));
  assert.equal(withPlaceholderNames("loan-refinance-scam", "○○안심보안 점검 앱"), "○○안심보안 점검 앱", "PH2 — fv-6s5p 시나리오 무변경");
});

// ── 항목 7 ────────────────────────────────────────────────────────
test("[N12] 메신저 자녀 사칭 '다급함 조성' — Mock 강등 대사가 한 문장(종전 '지금 당장, 더 늦으면 큰일난다.')", async () => {
  const tactics = SCENARIO_PROMPTS["messenger-child-impersonation-kakao"]!.weakenedTactics;
  const urgency = tactics.find((t) => extractTacticLabel(t) === "다급함 조성")!;
  assert.equal(extractTacticFlavor(urgency), "지금 당장 도와줘야 돼, 더 늦으면 큰일 나");
  const reply = await new MockLlmClient().complete({ systemPrompt: "", messages: [], mockTacticHints: [urgency], mockChannel: "messenger" });
  assert.equal(reply.text, "지금 당장 도와줘야 돼, 더 늦으면 큰일 나.");
  assert.notEqual(reply.text, "지금 당장, 더 늦으면 큰일난다.");
});

// ── 항목 8 · 판정표 TR ──────────────────────────────────────────────
test("[TR] 이체 화면을 마친 기록만 있어도 '받은 것으로 친다'(말로 보냈다고 안 해도) — 배선 · 문면", () => {
  assert.match(
    read("roleplay/index.ts"),
    /\(userReportedTransfer\(storedHistory, maskedUserText\) \|\| screenFacts\.some\(\(f\) => f\.kind === "transfer" && f\.done\)\) &&\s*!transferScreenPending &&\s*latestTransferAmount\(screenFacts\) !== "less"/,
  );
  assert.match(TRANSFER_REPORTED_INSTRUCTION, /이체 화면에서 이체를 마쳤다/);
  assert.match(TRANSFER_REPORTED_INSTRUCTION, /같은 돈을 같은 이유로 다시 보내라고 요구하지 않는다/);
});

// ── 항목 9 · 판정표 VS ──────────────────────────────────────────────
test("[VS] 확인 창구 오퍼가 시작만 돼도 실시간 화면 상태 줄(포기 단계 포함)을 돌려주지 않는다 · 다른 placedAt 판정은 그대로", () => {
  const sms = read("inCallSms/index.ts");
  assert.match(sms, /if \(!verifySnap\.exists\) return "none";\s*return verifySnap\.get\("placedAt"\) \? "placed" : "offered";/);
  assert.ok(sms.includes('(await readVerifyOfferStage(db, sessionId, session.scenarioId)) === "none" ? rawScreenStatus : undefined'));
  assert.ok(sms.includes('return (await readVerifyOfferStage(db, sessionId, scenarioId)) === "placed";'), "isVerifyOfferPlaced 의미 무변경");
});

// ── 항목 10 ───────────────────────────────────────────────────────
test("[항목 10] 평판 협박 송금 요구 — 문자가 도착하기 전에는 '보냈다'고 말하지 않게(계좌 문자 확인 절은 유지)", () => {
  const demand = SCENARIO_PROMPTS["reputation-blackmail-scam"]!.weakenedTactics.find((t) => extractTacticLabel(t) === "입막음 송금 요구")!;
  assert.ok(demand.includes("문자로 보낸 것을 확인하게"), "2026-10-17 계좌 문자 절(음성 계좌 금지) 유지");
  assert.match(demand, /문자가 실제로 도착했다는 안내를 받기 전에는 '계좌는 문자로 보내 드리겠습니다'처럼 보낼 것이라고만 말하고 이미 보냈다고 말하지 않는다/);
  assert.ok(demand.includes("'조용히 정리하시려면 300만 원을 오늘 안에 보내세요'"), "수법 인용구(리포트 키) 무변경");
});
