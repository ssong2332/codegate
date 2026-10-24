// §127(DECISIONS #243) — 메인 세션 라이브 확인(2026-10-24 · 기관 사칭 고급 · 텍스트 폴백 · 현금 전달형) 결함 4건 고정.
// ① 폴백 경로 끊지 않음 ② 인증번호 문자가 흐름보다 먼저 와 언급 · 요구 0 ③ 참가자가 말한 실존 은행명이 가상 은행명으로 바뀜 ④ 속은 순간 라벨 빈칸.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { FALLBACK_GOAL_WRAP_UP_INSTRUCTION } from "../../scammerHangup/guidance";
import {
  USER_MENTIONED_BANK,
  USER_MENTIONED_CARD,
  neutralizeUserMentionedFinancialNames,
  replaceRealFinancialNames,
} from "../../guardrails/realFinancialNames";
import { buildSystemPrompt } from "../promptAssembly";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { resolveDemandFallbackTactic } from "../../report/analyzeConversation";
import { planSmsBackstop, resolveDeclaredSms } from "../../inCallSms/smsGate";

const SRC = path.resolve(__dirname, "../../../src");

test("[§127 ①] 폴백 마무리 지시 — 신호 모드 ∧ 할 일 완료 ∧ 후속 단계 변형일 때만 턴 지시에 실린다 · 신호를 붙이라고 한다 · 숫자 0", () => {
  assert.match(FALLBACK_GOAL_WRAP_UP_INSTRUCTION, /\[\[SIGNAL:END_CALL_GOAL\]\]을 붙여 통화를 끝내라/);
  assert.match(FALLBACK_GOAL_WRAP_UP_INSTRUCTION, /되풀이하지 말고/);
  assert.ok(!/\d/.test(FALLBACK_GOAL_WRAP_UP_INSTRUCTION));
  const src = readFileSync(path.join(SRC, "roleplay/index.ts"), "utf8");
  assert.ok(
    src.includes('hangupMode === "signal" && goalActionDone && goalFollowUpFor(session.scenarioId, session.flowVariantId) !== undefined'),
    "조건 3항",
  );
  assert.ok(src.includes("participantCalledInstruction, fallbackWrapUp]"), "턴 지시 끝에 붙는다");
});

test("[§127 ②] 다시 쓴 기관 사칭 고급 3루트 — 인증번호 하한 5(강제 도착 7 — 흐름의 인증번호 단계 무렵) · 도착 안내를 받으면 하던 질문보다 먼저 번호 요구", () => {
  for (const id of ["fv-c5fj", "fv-q7cn", "fv-g2ld"]) {
    const v = findFlowVariant(id)!;
    const otp = v.sms.find((s) => s.smsId === "institution-otp")!;
    assert.equal(otp.notBeforeUserTurns, 5, id);
    assert.equal(otp.backstopUserTurns, 1, id);
    const { declared } = resolveDeclaredSms(v.scenarioId, id);
    assert.equal(planSmsBackstop({ declared, delivered: [], userTurns: 4 }).action, "wait", `${id}: 발화 4엔 아직(라이브 재현 시점)`);
    assert.equal(planSmsBackstop({ declared, delivered: [], userTurns: 7 }).action, "deliver", `${id}: 발화 7 강제`);
    const stage = v.stages.find((s) => s.summary.startsWith("본인 확인 마지막 절차"))!;
    assert.match(stage.summary, /인증번호 문자가 도착했다는 안내를 받으면 하던 질문보다 먼저 그 응답에서 번호를 불러 달라고 요구한다/, id);
    assert.ok(!/§/.test(stage.summary), `${id}: 모델 문면에 내부 표기 0`);
  }
  // 은퇴 fv-pgqt는 그대로(하한 3 · 간격 부재).
  const pgqt = findFlowVariant("fv-pgqt")!.sms.find((s) => s.smsId === "institution-otp")!;
  assert.equal(pgqt.notBeforeUserTurns, 3);
  assert.equal(pgqt.backstopUserTurns, undefined);
});

test("[§127 ③] 참가자가 먼저 말한 실존 은행 · 카드사는 '말씀하신 은행 · 카드사'로 받고, 사기범이 스스로 꺼낸 이름만 가상 이름으로", () => {
  const users = ["국민은행이고 예금은 3천만원이에요"];
  const echo = neutralizeUserMentionedFinancialNames("국민은행에 3천만 원 정도 있으시군요.", users);
  assert.equal(echo.text, `${USER_MENTIONED_BANK}에 3천만 원 정도 있으시군요.`);
  assert.equal(replaceRealFinancialNames(echo.text).replacedCount, 0, "중립 표현은 다시 치환되지 않는다");
  // 참가자가 말하지 않은 실존명은 이 함수가 건드리지 않는다 → 종전 치환(OO은행)이 받는다.
  const own = neutralizeUserMentionedFinancialNames("신한은행 계좌로 옮기셔야 합니다.", users);
  assert.equal(own.replacedCount, 0);
  assert.match(replaceRealFinancialNames(own.text).text, /OO은행 계좌/);
  // 카드사.
  assert.equal(
    neutralizeUserMentionedFinancialNames("삼성카드로 결제된 건 확인됩니다.", ["삼성카드 써요"]).text,
    `${USER_MENTIONED_CARD}로 결제된 건 확인됩니다.`,
  );
  // 참가자 발화가 없으면 입력 그대로.
  assert.deepEqual(neutralizeUserMentionedFinancialNames("국민은행이요?", []), { text: "국민은행이요?", replacedCount: 0 });
  // 배선 — sendMessage 후처리가 종전 치환보다 먼저 부른다(참가자 발화 = 저장 이력 + 이번 발화).
  const src = readFileSync(path.join(SRC, "roleplay/index.ts"), "utf8");
  const at = src.indexOf("neutralizeUserMentionedFinancialNames(markupTidyReplyText");
  assert.ok(at > 0 && at < src.indexOf("replaceRealFinancialNames(markupFreeReplyText)"));
  // Live(오디오 — 후처리 불가)는 프롬프트 문면이 유일한 층이다.
  const prompt = buildSystemPrompt(resolveSessionScenarioPrompt("institutional-impersonation", "fv-q7cn")!, {
    fictionalBankName: "보담은행",
    difficultyLevel: "advanced",
  });
  assert.ok(prompt.includes('상대가 먼저 말한 은행·카드사를 되받을 때는 다른 이름으로 바꾸지 말고 "말씀하신 은행"처럼 받는다.'));
});

test("[§127 ④] 속은 순간 라벨 보정 — 본인 확인 요구 어형 '확인해 주시겠습니까' · '확인 부탁드립니다' · '뒷자리' · 신원 명사 없는 '확인해 주세요'는 그대로 폴백", () => {
  const tactics = resolveSessionScenarioPrompt("institutional-impersonation", "fv-q7cn")!.weakenedTactics;
  for (const line of [
    "본인 확인을 위해 성함과 생년월일, 주민번호 뒷자리 확인 부탁드립니다.",
    "생년월일 확인해 주시겠습니까?",
    "주민등록번호 뒷자리 말씀 부탁드립니다.",
  ]) {
    assert.equal(resolveDemandFallbackTactic(line, tactics), "신원정보 직접 요구", line);
  }
  assert.equal(resolveDemandFallbackTactic("잠시만요, 확인해 주세요.", tactics), undefined, "신원 명사 없는 확인 요청은 그대로");
});
