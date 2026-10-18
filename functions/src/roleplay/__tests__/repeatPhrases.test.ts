// T191 S4 — 반복 유도 문면 0건 게이트(사용자 신고 2026-10-18 "AI가 같은 말을 반복한다").
//
// 근거: docs/ScenarioDifficultyRedesign.md §1.4 R1~R4 · §2.5 A1~A4 · docs/PRD.md AC-100 (a)(b)(f) ·
// AC-096 (d) · docs/DECISIONS.md #131(D4).
//
// 판정 대상은 **소스가 아니라 조립 산출물**이다 — 모델에게 실제로 도달하는 문자열(시스템 프롬프트 +
// 턴 지시 + 도구 거절 지시)만 본다. 소스 주석에는 변경 이력 설명으로 옛 문구가 남아 있을 수 있고,
// 그것은 모델에게 닿지 않는다.
//
// ⚠️ 정직 고지: 문자열 검사라 **표기**를 본다(의미가 아니다). 금지 목록 밖의 다른 표현으로 같은 지시를
// 다시 쓰면 이 게이트는 잡지 못한다. 반복 감소 자체의 효과는 AC-100 (d) — S1 측정 before/after로만
// 판정한다(이 테스트는 그 충족 근거가 아니다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../promptAssembly";
import { asksIdentityCheck } from "../personaAuthority";
import { isL3Procedural } from "../l3Depth";
import { SCENARIO_PROMPTS } from "../../scenarios";
import {
  IN_CALL_SMS,
  SMS_DECLINE_ALREADY,
  SMS_DECLINE_TOO_EARLY,
  buildOtpCheckInstruction,
  hasInCallSms,
  listOtpItems,
} from "../../scenarios/inCallSms";
import { VERIFY_INTERCEPT, hasVerifyIntercept } from "../../scenarios/verifyIntercept";
import { MOCK_INSTALL_CONSENT_INSTRUCTION, MOCK_SCREENS } from "../../scenarios/mockScreens";

/**
 * 반복을 유도하는 금지 문구(AC-100 (a) "금지 문구 목록은 테스트 상수에 명시한다").
 * 앞 5개 = 오케스트레이터 지정 목록, 뒤 2개 = 이번에 함께 제거한 같은 원인의 문구.
 */
const REPEAT_INDUCING_PHRASES = [
  "다시 불러 달라", // R1 — 받은 값을 "조회가 안 된다며" 재요구(IDENTITY_CHECK_HANDLING_TRUE)
  "다시 말해 달라고", // R1 — 같은 재요구(IDENTITY_CHECK_HANDLING_FALSE)
  "그대로 다시", // R3 — "같은 요구를 그대로 다시 꺼낸다"
  "계속 밀어붙", // R2 — 페르소나 지속 압박 절(D4로 난이도 축 이관)
  "재촉하라", // R4 — 문자 도착 안내의 재촉 지시
  "이미 보낸 문자를 확인해 달라", // R4 — SMS_DECLINE_ALREADY 옛 문면(AC-100 (a)③)
  "같은 말을 반복해", // R2 — familyAccidentDeepvoice의 반복 몰아붙이기 지시
] as const;

function findRepeatInducingPhrases(text: string): string[] {
  return REPEAT_INDUCING_PHRASES.filter((phrase) => text.includes(phrase));
}

const LEVELS = ["beginner", "intermediate", "advanced"] as const;

/** 이 시나리오가 실제로 `turnInstruction`에 싣는 문구 전부 + 인증번호 대조 지시(§77, 텍스트 경로). */
function realTurnInstructionsFor(scenarioId: string): string[] {
  const out: string[] = [];
  const verify = VERIFY_INTERCEPT[scenarioId];
  if (verify) out.push(verify.announceInstruction, verify.reconnectInstruction);
  for (const sms of IN_CALL_SMS[scenarioId] ?? []) out.push(sms.announceInstruction);
  for (const otp of listOtpItems(scenarioId)) out.push(buildOtpCheckInstruction(otp.otpCode ?? ""));
  if ((MOCK_SCREENS[scenarioId] ?? []).length > 0) out.push(MOCK_INSTALL_CONSENT_INSTRUCTION);
  return out;
}

test("[T191/S4 · AC-100 (a)] 전 시나리오 × 3난이도 × 실제 턴 지시의 조립 산출물에 반복 유도 문구가 0건이다", () => {
  const ids = Object.keys(SCENARIO_PROMPTS);
  assert.ok(ids.length >= 14, `시나리오가 14종 이상이어야 한다(현재 ${ids.length}종)`);
  let combos = 0;
  const violations: string[] = [];
  for (const id of ids) {
    const prompt = SCENARIO_PROMPTS[id];
    for (const difficultyLevel of LEVELS) {
      for (const identityCheckAllowed of [asksIdentityCheck(id), !asksIdentityCheck(id)]) {
        for (const toolDrivenTiming of [false, true]) {
          for (const turnInstruction of [undefined, ...realTurnInstructionsFor(id)]) {
            const verifyInterceptEnabled = hasVerifyIntercept(id) && difficultyLevel === "advanced";
            const assembled = buildSystemPrompt(prompt, {
              difficultyLevel,
              inCallSmsEnabled: hasInCallSms(id),
              verifyInterceptEnabled,
              l3Procedural: isL3Procedural(id),
              identityCheckAllowed,
              toolDrivenTiming,
              offerToolDeclared: verifyInterceptEnabled,
              ...(turnInstruction ? { turnInstruction } : {}),
            });
            combos += 1;
            const found = findRepeatInducingPhrases(assembled);
            if (found.length > 0) {
              violations.push(
                `${id}/${difficultyLevel}/identity=${identityCheckAllowed}/tool=${toolDrivenTiming}/` +
                  `turn=${turnInstruction ? turnInstruction.slice(0, 20) : "-"} → ${found.join(", ")}`,
              );
            }
          }
        }
      }
    }
  }
  assert.ok(combos >= 14 * 3 * 2 * 2, `조합 수가 너무 적다(${combos}) — 매트릭스가 비어 있으면 거짓 OK다`);
  assert.deepEqual(violations, [], `반복 유도 문구가 조립 산출물에 남아 있다:\n${violations.join("\n")}`);
});

test("[T191/S4 · AC-100 (a)] 서버가 모델에 직접 돌려주는 문자 지시(도착 안내·거절 지시)에도 반복 유도 문구가 0건이다", () => {
  const texts: [string, string][] = [
    ["SMS_DECLINE_ALREADY", SMS_DECLINE_ALREADY],
    ["SMS_DECLINE_TOO_EARLY", SMS_DECLINE_TOO_EARLY],
  ];
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) texts.push([`${scenarioId}/${item.smsId}`, item.announceInstruction]);
  }
  assert.ok(texts.length >= 2 + 10, `검사 대상이 너무 적다(${texts.length})`);
  for (const [where, text] of texts) {
    assert.deepEqual(findRepeatInducingPhrases(text), [], `${where}: 반복 유도 문구가 있다`);
  }
});

test("[T191/S4 · AC-100 (f)ⓐ] 역방향 — 금지 문구를 하나씩 넣은 오염 샘플은 검사에 걸리고, 정상 샘플은 통과한다(같은 실행 출력)", (t) => {
  const clean = buildSystemPrompt(SCENARIO_PROMPTS["institutional-impersonation"], {
    difficultyLevel: "beginner",
    inCallSmsEnabled: true,
    identityCheckAllowed: true,
  });
  const cleanResult = findRepeatInducingPhrases(clean);
  t.diagnostic(`정상 샘플: 검출 ${cleanResult.length}건`);
  assert.deepEqual(cleanResult, []);
  for (const phrase of REPEAT_INDUCING_PHRASES) {
    const mid = Math.floor(clean.length / 2);
    const contaminated = `${clean.slice(0, mid)} ${phrase} ${clean.slice(mid)}`;
    const found = findRepeatInducingPhrases(contaminated);
    t.diagnostic(`오염 샘플("${phrase}"): 검출 ${found.length}건 → ${found.join(", ")}`);
    assert.deepEqual(found, [phrase], `"${phrase}"를 넣은 샘플이 검사에 걸려야 한다`);
  }
});

test("[T191/S4 · A1] 본인확인 처리 항목은 되읽기/되짚기 확인 + 추가 항목 1개만 남는다(재요구 선택지 0)", () => {
  const prompt = SCENARIO_PROMPTS["institutional-impersonation"];
  const withTrue = buildSystemPrompt(prompt, { identityCheckAllowed: true });
  const withFalse = buildSystemPrompt(prompt, { identityCheckAllowed: false });
  assert.ok(withTrue.includes('받은 값을 되읽어 확인시키거나("○○○님 맞으시죠?"), 추가 항목을 하나 더 요구한다.'));
  assert.ok(withFalse.includes("받은 답을 되짚어 확인하거나, 요구를 하나 더 얹는다."));
  for (const text of [withTrue, withFalse]) {
    assert.ok(!text.includes("조회가 안 된다며"), "재요구 명목(\"조회가 안 된다며\")이 남아 있으면 안 된다");
  }
});

test("[T191/S4 · #300 공존] 인증번호가 **틀렸을 때** 다시 확인해 불러 달라는 대조 지시(§77)는 그대로 살아 있다", () => {
  const instruction = buildOtpCheckInstruction("048231");
  assert.ok(instruction.includes("번호가 안 맞는데요, 문자 다시 확인해서 불러 주세요."));
  const assembled = buildSystemPrompt(SCENARIO_PROMPTS["institutional-impersonation"], {
    inCallSmsEnabled: true,
    identityCheckAllowed: true,
    turnInstruction: instruction,
  });
  assert.ok(assembled.includes("번호가 안 맞는데요, 문자 다시 확인해서 불러 주세요."));
  assert.deepEqual(findRepeatInducingPhrases(assembled), []);
  for (const otp of [...listOtpItems("institutional-impersonation"), ...listOtpItems("card-company-impersonation")]) {
    assert.match(otp.announceInstruction, /번호를 불러 달라고 요구하라/);
    assert.match(otp.announceInstruction, /번호를 네가 지어내서 말하지 마라/);
  }
});

const D4_SCENARIOS = [
  "institutional-impersonation",
  "bank-security-verify-scam",
  "card-company-impersonation",
  "family-accident-deepvoice",
  "kidnapping-threat",
] as const;

test("[T191/S4 · A2/D4 · AC-096 (d) · AC-100 (b)] 압박 지속성은 난이도 블록이 정한다 — 페르소나는 중급 L2, 초급은 물러서고 고급은 다른 근거로", (t) => {
  for (const id of D4_SCENARIOS) {
    const prompt = SCENARIO_PROMPTS[id];
    assert.ok(prompt, `${id}: SCENARIO_PROMPTS에 있어야 한다`);
    assert.ok(!prompt.personaPrompt.includes("밀어붙"), `${id}: 페르소나에 "밀어붙" 지속 압박 문구가 남아 있다`);
    assert.ok(
      !prompt.personaPrompt.includes("물러서지 않고 강도를 높인다"),
      `${id}: [말투/톤] 머리말의 "물러서지 않고 강도를 높인다"가 남아 있다`,
    );
    const beginner = buildSystemPrompt(prompt, { difficultyLevel: "beginner" });
    const intermediate = buildSystemPrompt(prompt, { difficultyLevel: "intermediate" });
    const advanced = buildSystemPrompt(prompt, { difficultyLevel: "advanced" });
    assert.equal(intermediate, buildSystemPrompt(prompt), `${id}: 중급 = 옵션 미전달 출력이어야 한다`);
    assert.ok(beginner.includes("상대가 불안해하면 한 발 물러선다"), `${id}: 초급 물러섬 지시`);
    assert.ok(advanced.includes("물러서지 않되 매번 다른 근거를 낸다"), `${id}: 고급 다른 근거 재대응 지시`);
    for (const assembled of [beginner, intermediate, advanced]) {
      assert.ok(assembled.includes("같은 취지의 말을 두 번 연속 하지 않는다"));
      assert.ok(!assembled.includes("계속 밀어붙"));
    }
  }
  for (const id of D4_SCENARIOS.filter((x) => x !== "kidnapping-threat")) {
    assert.ok(
      SCENARIO_PROMPTS[id].personaPrompt.includes("한 번 더 다른 근거로"),
      `${id}: 페르소나에 중급 L2("한 번 더 다른 근거로") 문장이 있어야 한다`,
    );
  }
  const prompt = SCENARIO_PROMPTS["institutional-impersonation"];
  for (const level of LEVELS) {
    const lines = buildSystemPrompt(prompt, { difficultyLevel: level })
      .split("\n")
      .filter((line) => /한 번 더 다른 근거로|한 발 물러선다|물러서지 않되 매번 다른 근거/.test(line))
      .map((line) => line.slice(0, 90));
    t.diagnostic(`institutional-impersonation/${level}: ${lines.join(" | ")}`);
  }
});

test("[T191/S4 · A3] 부인·확인 뒤 같은 요구를 다시 꺼내는 수법 5건은 '다른 근거로' 꺼낸다", () => {
  const expected: [string, string][] = [
    ["institutional-impersonation", "신원정보 직접 요구"],
    ["bank-security-verify-scam", "확인 시도 무력화"],
    ["bank-security-verify-scam", "본인확인 정보 직접 요구"],
    ["card-company-impersonation", "카드정보 직접 요구"],
    ["tax-refund-scam", "환급 수수료 요구"],
  ];
  for (const [id, label] of expected) {
    const tactic = SCENARIO_PROMPTS[id].weakenedTactics.find((x) => x.startsWith(label));
    assert.ok(tactic, `${id}: "${label}" 수법이 있어야 한다`);
    assert.ok(tactic.includes("다른 근거로 다시 꺼낸다"), `${id}/${label}: "다른 근거로 다시 꺼낸다"여야 한다`);
  }
});

test("[T191/S4 · A4] 이미 보낸 문자는 다시 언급하지 않고, 도착 안내는 사실만 알린 뒤 상대 반응을 기다린다", () => {
  assert.equal(
    SMS_DECLINE_ALREADY,
    "(그 안내는 이미 보냈다. 새로 보냈다고 말하지 말고, 이미 보낸 문자를 다시 언급하지도 말고 다른 이야기로 이어가라.)",
  );
  const changed = [
    ["loan-refinance-scam", "loan-account"],
    ["institutional-impersonation", "institution-safe-account"],
    ["card-company-impersonation", "card-relief-account"],
    ["reputation-blackmail-scam", "blackmail-hush-account"],
    ["courier-customs-scam", "courier-customs-fee"],
  ] as const;
  for (const [scenarioId, smsId] of changed) {
    const item = IN_CALL_SMS[scenarioId]?.find((x) => x.smsId === smsId);
    assert.ok(item, `${scenarioId}/${smsId}가 카탈로그에 있어야 한다`);
    assert.ok(item.announceInstruction.includes("상대의 반응을 기다려라"), `${smsId}: 반응 대기 지시`);
    assert.ok(item.announceInstruction.includes("한두 문장으로"), `${smsId}: 분량 한정 유지`);
  }
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) {
      assert.ok(!/재촉|다급/.test(item.announceInstruction), `${scenarioId}/${item.smsId}: 재촉·다급 지시가 남아 있다`);
    }
  }
});
