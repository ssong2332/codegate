// §132(DECISIONS #248) — 메인 세션 라이브 확인(2026-10-24 · 기관 사칭 고급 · 텍스트 폴백 · 금 구매형) 재작업 3건 고정.
// ① "말씀하신 말씀하신 은행" 겹침 ② 문자 도착 턴의 문자 언급이 문장 상한에 잘림 ③ 금 구매형 · 현금 예탁형 루트의 '안전 계좌' 섞임.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  USER_MENTIONED_BANK,
  neutralizeUserMentionedFinancialNames,
  replaceRealFinancialNames,
} from "../../guardrails/realFinancialNames";
import { SMS_MENTION_SENTENCE, limitReplySentences, limitReplySentencesKeeping } from "../replyLength";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { resolveRouteAccountNumber } from "../../inCallSms/smsGate";
import { EXAMPLE_ACCOUNT_NUMBER } from "../../shared/fictionalBank";
import { buildSystemPrompt } from "../promptAssembly";
import { OTP_FOLLOW_UP_INSTRUCTION, planOtpFollowUp } from "../otpFollowUp";

const SRC = path.resolve(__dirname, "../../../src");

test("[§132 ①] 모델이 이미 '말씀하신 국민은행'이라고 했으면 '말씀하신'을 겹쳐 붙이지 않는다", () => {
  const users = ["국민은행 계좌만 쓰는데요"];
  // 라이브 재현 — "말씀하신 말씀하신 은행 말고도 …"
  assert.equal(
    neutralizeUserMentionedFinancialNames("말씀하신 국민은행 말고도 해담은행에 계좌가 있으신가요?", users).text,
    "말씀하신 은행 말고도 해담은행에 계좌가 있으신가요?",
  );
  for (const [reply, expected] of [
    ["고객님이 말씀하신 국민은행 계좌는 동결 대상입니다.", "고객님이 말씀하신 은행 계좌는 동결 대상입니다."],
    ["말씀하셨던 국민은행요.", "말씀하셨던 은행요."],
    ["말씀하신 그 국민은행 잔액부터 보겠습니다.", "말씀하신 그 은행 잔액부터 보겠습니다."],
    ["말씀 주신 국민은행 쪽은 확인됐습니다.", "말씀 주신 은행 쪽은 확인됐습니다."],
  ] as const) {
    assert.equal(neutralizeUserMentionedFinancialNames(reply, users).text, expected, reply);
  }
  // 앞에 "말씀하신"이 없으면 종전대로 중립 표현 전체.
  assert.equal(neutralizeUserMentionedFinancialNames("국민은행에 얼마 있으세요?", users).text, `${USER_MENTIONED_BANK}에 얼마 있으세요?`);
  // 한 대답에 두 번 — 앞은 겹침 방지, 뒤는 중립 표현 전체.
  assert.equal(
    neutralizeUserMentionedFinancialNames("말씀하신 국민은행 말고, 국민은행 적금도 있으세요?", users).text,
    "말씀하신 은행 말고, 말씀하신 은행 적금도 있으세요?",
  );
  // 결과에 "말씀하신 말씀하신"이 남지 않고, 종전 치환이 다시 건드리지 않는다.
  const out = neutralizeUserMentionedFinancialNames("말씀하신 국민은행이요.", users).text;
  assert.ok(!/말씀하신\s*말씀하신/.test(out));
  assert.equal(replaceRealFinancialNames(out).replacedCount, 0);
});

test("[§132 ②] 문자 도착 턴 — 상한이 문자 언급 문장을 잘라 내지 않는다(앞 2문장 + 문자 문장) · 그 밖은 종전과 같다", () => {
  // 라이브 재현 형태 — 5문장 중 문자 언급이 4번째.
  const reply =
    "고객님 자산은 저희가 보호해 드립니다. 걱정 마십시오. 다만 절차가 하나 남았습니다. 방금 인증번호 문자를 보내 드렸습니다. 확인되시면 불러 주십시오.";
  const kept = limitReplySentencesKeeping(reply, SMS_MENTION_SENTENCE);
  assert.equal(kept.text, "고객님 자산은 저희가 보호해 드립니다. 걱정 마십시오. 방금 인증번호 문자를 보내 드렸습니다.");
  assert.equal(kept.trimmed, true);
  assert.equal(kept.keptSentences, 3);
  assert.equal(kept.originalSentences, 5);
  // 종전 상한은 문자 문장을 잘랐다(재현).
  assert.ok(!SMS_MENTION_SENTENCE.test(limitReplySentences(reply).text));
  // 남는 앞 문장에 이미 있으면 종전과 같다.
  const early = "방금 문자 보내 드렸습니다. 번호 불러 주세요. 급합니다. 서둘러 주십시오.";
  assert.deepEqual(limitReplySentencesKeeping(early, SMS_MENTION_SENTENCE), limitReplySentences(early));
  // 어디에도 없으면 종전과 같다(지어내지 않는다).
  const none = "하나. 둘. 셋. 넷.";
  assert.deepEqual(limitReplySentencesKeeping(none, SMS_MENTION_SENTENCE), limitReplySentences(none));
  // 상한 이하면 입력 그대로.
  assert.equal(limitReplySentencesKeeping("짧습니다. 문자 확인하세요.", SMS_MENTION_SENTENCE).text, "짧습니다. 문자 확인하세요.");
  // 쉼표 경계로 끝난 문자 문장은 마침표로 닫는다.
  assert.equal(
    limitReplySentencesKeeping("하나. 둘. 셋. 인증번호 문자 보냈습니다, 넷.", SMS_MENTION_SENTENCE).text,
    "하나. 둘. 인증번호 문자 보냈습니다.",
  );
  // 배선 — sendMessage는 문자 도착 턴(`sms_announce`)에는 문자 언급 문장을 지킨다. §131(8) — 그 밖 턴은 요구 문장(`DEMAND_SENTENCE`)을 지킨다.
  const src = readFileSync(path.join(SRC, "roleplay/index.ts"), "utf8");
  assert.match(
    src,
    /shouldLimitReplySentences\(turnChoice\)\s*\?\s*limitReplySentences\([\s\S]{0,200}?realNameFreeReplyText,\s*MAX_SCAMMER_REPLY_SENTENCES,[\s\S]{0,120}?turnChoice === "sms_announce" \? SMS_MENTION_SENTENCE : DEMAND_SENTENCE,?\s*\)/,
  );
  // 같은 결과 — 공개 함수의 keep 인자 = 전용 함수.
  assert.deepEqual(limitReplySentences(reply, 3, SMS_MENTION_SENTENCE), kept);
});

test("[§132 ③] 현금 예탁형 · 금 구매형은 안심 단계에 계좌 이체 금지 1문장 · 안전계좌 이체형은 그대로 · 단계 문면에 '안전계좌 이체' 요구 0", () => {
  const rule = "이 통화에서는 돈을 다른 계좌로 옮기라는 말(안전계좌 · 보호 계좌 · 국가 계좌)을 어느 단계에서도 하지 않는다.";
  for (const id of ["fv-q7cn", "fv-g2ld"]) {
    const v = findFlowVariant(id)!;
    assert.equal(v.stages.filter((s) => s.summary.includes(rule)).length, 1, `${id}: 1번만`);
    assert.ok(v.stages[1].summary.startsWith("협조하면 조용히 끝난다며 안심시키고"), `${id}: 안심 단계에`);
    // 이 문장을 뺀 나머지 단계 · 수법 문면에 안전계좌 요구가 없다.
    const rest = [...v.stages.map((s) => s.summary.replace(rule, "")), ...v.tactics].join("\n");
    assert.ok(!/안전\s*계좌/.test(rest), `${id}: 안전계좌 문면 0`);
    assert.ok(!/§/.test(v.stages[1].summary), `${id}: 모델 문면에 내부 표기 0`);
  }
  const c5fj = findFlowVariant("fv-c5fj")!;
  assert.ok(!c5fj.stages.some((s) => s.summary.includes(rule)), "안전계좌 이체형은 그대로");
  assert.equal(c5fj.stages[1].summary, "협조하면 조용히 끝난다며 안심시키고, 금융감독기관이 자산 보호를 돕는다고 말한다.");
});

// ── §132.5 · §132.6 — 2차 라이브 확인(운영 세션 659702ea · 현금 예탁형 · 텍스트 폴백) ──────────────────────────────

test("[§132.5] 세션 계좌번호는 변형이 선언한 문자로만 — 현금 예탁 · 금 구매 루트 프롬프트에 안전계좌 문자 번호 0 · 안전계좌 이체형 · 변형 없는 세션은 종전", () => {
  const SAFE = "210-3391-5540-08";
  assert.equal(resolveRouteAccountNumber("institutional-impersonation", "fv-c5fj"), SAFE);
  assert.equal(resolveRouteAccountNumber("institutional-impersonation", undefined), SAFE, "무소급");
  assert.equal(resolveRouteAccountNumber("institutional-impersonation", "fv-nope"), SAFE, "알 수 없는 변형 = 종전");
  for (const id of ["fv-q7cn", "fv-g2ld"]) {
    assert.equal(resolveRouteAccountNumber("institutional-impersonation", id), EXAMPLE_ACCOUNT_NUMBER, id);
    const prompt = buildSystemPrompt(resolveSessionScenarioPrompt("institutional-impersonation", id)!, {
      fictionalBankName: "늘봄은행",
      difficultyLevel: "advanced",
      sessionAccountNumber: resolveRouteAccountNumber("institutional-impersonation", id),
    });
    assert.ok(!prompt.includes(SAFE), `${id}: 안전계좌 문자 번호 0`);
  }
  // 배선 — 프롬프트를 조립하는 6곳 전부 변형을 넘긴다(시나리오만 넘기는 호출 0).
  for (const rel of [
    "roleplay/index.ts",
    "roleplay/openingLine.ts",
    "roleplay/callReturnLine.ts",
    "roleplay/chatDuringCall.ts",
    "roleplay/screenActionFollowUp.ts",
    "realtime/geminiProvider.ts",
  ]) {
    const src = readFileSync(path.join(SRC, rel), "utf8");
    assert.ok(!src.includes("resolveSessionAccountNumber("), `${rel}: 시나리오 단위 호출 0`);
    assert.match(src, /sessionAccountNumber: resolveRouteAccountNumber\([^,]+, [^)]*flowVariantId\)/, rel);
  }
});

test("[§132.6] 인증번호 문자가 도착했는데 아직 묻지 않았으면 다음 턴(최대 2)에 다시 요구 1줄", () => {
  const base = {
    otpSmsIds: ["institution-otp"],
    delivered: [{ smsId: "institution-otp", userTurnsAtArrival: 7 }],
    userTurns: 8,
    scammerTextsSinceArrival: ["(역할 이탈 해설)"],
    userTextsSinceArrival: ["보냈어요. 이제 된 거죠?"],
  };
  // 라이브 재현 — 발화 7 도착 · 발화 8 응답 전.
  assert.equal(planOtpFollowUp(base), OTP_FOLLOW_UP_INSTRUCTION);
  assert.equal(planOtpFollowUp({ ...base, userTurns: 9, scammerTextsSinceArrival: ["a", "b"] }), OTP_FOLLOW_UP_INSTRUCTION, "2번째 턴까지");
  assert.equal(planOtpFollowUp({ ...base, userTurns: 10 }), undefined, "3번째부터는 없음");
  assert.equal(planOtpFollowUp({ ...base, userTurns: 7 }), undefined, "도착 턴은 도착 지시가 맡는다");
  assert.equal(planOtpFollowUp({ ...base, scammerTextsSinceArrival: ["문자로 받은 인증번호 불러 주세요."] }), undefined, "이미 물었다");
  assert.equal(planOtpFollowUp({ ...base, userTextsSinceArrival: ["253295요"] }), undefined, "이미 불렀다");
  assert.equal(planOtpFollowUp({ ...base, delivered: [] }), undefined, "도착 전");
  assert.equal(planOtpFollowUp({ ...base, otpSmsIds: [] }), undefined, "인증번호 문자 선언 없음");
  assert.equal(
    planOtpFollowUp({ ...base, delivered: [...base.delivered, { smsId: "institution-safe-account", userTurnsAtArrival: 8 }] }),
    undefined,
    "다음 문자가 왔다",
  );
  assert.ok(!/\d/.test(OTP_FOLLOW_UP_INSTRUCTION), "번호 0");
  // 배선 — 앱 진행 지시가 없는 턴만 · 턴 지시 목록 끝.
  const src = readFileSync(path.join(SRC, "roleplay/index.ts"), "utf8");
  assert.ok(src.includes('turnChoice === "none" && !otpCheckInstruction && !confirmPlan?.instruction && verifyState?.placed !== true && otpArrivedSince > 0'));
  assert.ok(src.includes("smsNudgeInstruction, smsOfferInstruction, otpFollowUpInstruction, otpHoldInstruction]") /* §132.19 판정표 B가 뒤에 붙었다 */);
});
