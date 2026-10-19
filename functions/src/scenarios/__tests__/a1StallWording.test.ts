// A-1 ②③④⑤(2026-10-19 · audit-A R3/R1②/R7/R5) — 대기 구도를 까는 문면 정리 + 선언 목적 배선(호출부 3곳).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SCENARIO_PROMPTS } from "../index";
import { findInCallSmsItem } from "../inCallSms";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { FLOW_VARIANTS, resolveSessionScenarioPrompt } from "../flowVariants";
import { hasVerifyIntercept } from "../verifyIntercept";
import { sessionDeclaredSmsPurposes, sessionDeclaresInCallSms } from "../../inCallSms/smsGate";
import { asksIdentityCheck } from "../../roleplay/personaAuthority";
import { isL3Procedural } from "../../roleplay/l3Depth";

type Level = "beginner" | "intermediate" | "advanced";

/** 실 호출부(sendMessage)와 같은 옵션으로 변형 합성 프롬프트를 조립한다. */
function assembleLikeSendMessage(scenarioId: string, level: Level, variantId: string | undefined): string {
  const prompt = resolveSessionScenarioPrompt(scenarioId, variantId);
  assert.ok(prompt, `${scenarioId}/${variantId}: 프롬프트 없음`);
  return buildSystemPrompt(prompt, {
    difficultyLevel: level,
    inCallSmsEnabled: sessionDeclaresInCallSms(scenarioId, variantId),
    inCallSmsPurposes: sessionDeclaredSmsPurposes(scenarioId, variantId),
    verifyInterceptEnabled: hasVerifyIntercept(scenarioId) && level === "advanced",
    l3Procedural: isL3Procedural(scenarioId),
    identityCheckAllowed: asksIdentityCheck(scenarioId),
  });
}

// ── ③ loan 계좌 문자 본문 ────────────────────────────────────────────────────────────────────
test("[A-1/③] loan 계좌 문자 본문 — '입금 확인 즉시 … 승인 처리' 대기 구도 0, 계좌·금액·마감은 그대로", () => {
  const item = findInCallSmsItem("loan-refinance-scam", "loan-account");
  assert.ok(item);
  assert.equal(/입금\s*확인/.test(item.body), false, "문자 본문이 '입금 확인'을 기다리는 구도를 깐다(R1 ②)");
  assert.equal(/승인\s*처리/.test(item.body), false);
  for (const kept of ["OO은행 352-0812-4471-63", "금액: 1,850,000원", "18시"]) {
    assert.ok(item.body.includes(kept), `본문에서 "${kept}"가 사라졌다(계좌·금액·마감은 무변경)`);
  }
});

test("[A-1/③ 역방향] 옛 본문 마지막 줄은 위 검사에 걸린다", () => {
  assert.ok(/입금\s*확인/.test("입금 확인 즉시 전환 승인 처리됩니다. (오늘 18시 마감)"));
});

// ── ④ loan 페르소나 확인 질문 줄 ───────────────────────────────────────────────────────────────
test("[A-1/④] loan [말투/톤] — '반드시 직접 불러달라' 0, 짧은 대답에 같은 질문을 되풀이하지 않는 순서형 조건 존재(신원 요구 형태 유지)", () => {
  const persona = SCENARIO_PROMPTS["loan-refinance-scam"].personaPrompt;
  assert.equal(persona.includes("반드시 직접 불러달라고 요구한다"), false, "되풀이를 유발하던 '반드시' 문면이 남아 있다(R7)");
  assert.ok(persona.includes("직접 불러달라고 요구한다"), "신원 요구 형태 자체는 남아야 한다([신원요구] 게이트)");
  assert.ok(persona.includes("다시 물었는데도 상대가 \"네\"처럼 짧게만 답하면 **같은 질문을 되풀이하지 말고**"));
  assert.ok(persona.includes("다음 단계로 넘어간다"));
});

// ── ⑤ 창구 없는 세션의 "잠시만요, 담당 창구를 확인해…" ───────────────────────────────────────
const VERIFY_WAIT_PHRASES = ["잠시만요, 담당 창구를 확인해 알려드리겠습니다", "받아 둔다. 창구 이름은"];

test("[A-1/⑤] bank-security-verify-scam · card-delivery-call — 전 난이도 × 실제 변형 조립 산출물에 창구 대기 문구 0", (t) => {
  let checked = 0;
  for (const scenarioId of ["bank-security-verify-scam", "card-delivery-call"]) {
    const variants = FLOW_VARIANTS.filter((v) => v.scenarioId === scenarioId);
    assert.ok(variants.length > 0, `${scenarioId}: 변형이 없다`);
    for (const variant of variants) {
      const assembled = assembleLikeSendMessage(scenarioId, variant.level, variant.variantId);
      for (const phrase of VERIFY_WAIT_PHRASES) {
        assert.equal(assembled.includes(phrase), false, `${scenarioId}/${variant.level}: "${phrase}"가 남아 있다(R5)`);
      }
      // 창구 이름·번호를 지어내지 않는다는 금지는 그대로 남는다.
      assert.ok(assembled.includes("확인 창구 이름·전화번호를 네가 먼저 지어내 말하지 않는다"), `${scenarioId}/${variant.level}: 창구 지어내기 금지가 사라졌다`);
      checked += 1;
    }
  }
  t.diagnostic(`A-1 ⑤: 변형 ${checked}개 조립 산출물 전수 0건`);
});

test("[A-1/⑤] 고급(확인 창구 실재)에서는 창구 이름 시점 규칙이 [확인 안내] 블록에 여전히 있다(페르소나에서 뺀 규칙의 행선지)", () => {
  for (const scenarioId of ["bank-security-verify-scam", "card-delivery-call"]) {
    const variant = FLOW_VARIANTS.find((v) => v.scenarioId === scenarioId && v.level === "advanced");
    assert.ok(variant);
    const assembled = assembleLikeSendMessage(scenarioId, "advanced", variant.variantId);
    assert.ok(
      assembled.includes("확인 부서로 연결하라는 지시가 이 프롬프트에 함께 들어온 턴에만 창구 이름을 말한다"),
      `${scenarioId}: 고급 [확인 안내] 블록에 창구 이름 시점 규칙이 없다`,
    );
  }
});

test("[A-1/⑤ 역방향] 옛 bank 페르소나 문장은 위 검사에 걸린다", () => {
  const legacy = "상대가 확인하겠다고 하면 막지 말고 \"잠시만요, 담당 창구를 확인해 알려드리겠습니다\"처럼 받아 둔다.";
  assert.ok(VERIFY_WAIT_PHRASES.some((p) => legacy.includes(p)));
});

// ── ② 호출부 3곳 배선(G63) ────────────────────────────────────────────────────────────────────
const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

test("[A-1/② 배선] sendMessage · 오프닝 · Live 토큰 — 셋 다 inCallSmsEnabled 바로 다음에 같은 술어로 inCallSmsPurposes를 넘긴다(G63)", () => {
  const sites: Array<[string, RegExp]> = [
    [
      "roleplay/index.ts",
      /inCallSmsEnabled: sessionDeclaresInCallSms\(session\.scenarioId, session\.flowVariantId\),\n(?:\s*\/\/.*\n)*\s*inCallSmsPurposes: sessionDeclaredSmsPurposes\(session\.scenarioId, session\.flowVariantId\),/,
    ],
    [
      "roleplay/openingLine.ts",
      /inCallSmsEnabled: sessionDeclaresInCallSms\(scenarioId, flowVariantId\),\n(?:\s*\/\/.*\n)*\s*inCallSmsPurposes: sessionDeclaredSmsPurposes\(scenarioId, flowVariantId\),/,
    ],
    [
      "realtime/geminiProvider.ts",
      /inCallSmsEnabled: sessionDeclaresInCallSms\(input\.scenarioId, input\.flowVariantId\),\n(?:\s*\/\/.*\n)*\s*inCallSmsPurposes: sessionDeclaredSmsPurposes\(input\.scenarioId, input\.flowVariantId\),/,
    ],
  ];
  for (const [file, pattern] of sites) assert.match(read(file), pattern, `${file}: inCallSmsPurposes 배선 누락(G63)`);
});

test("[A-1/② 회귀] 변형 없는 세션은 선언 목적이 undefined(종전 템플릿) · 변형 세션은 선언 순서 그대로", () => {
  assert.equal(sessionDeclaredSmsPurposes("loan-refinance-scam", undefined), undefined);
  const adv = FLOW_VARIANTS.find((v) => v.scenarioId === "loan-refinance-scam" && v.level === "advanced");
  assert.ok(adv);
  assert.deepEqual(sessionDeclaredSmsPurposes("loan-refinance-scam", adv.variantId), ["link", "transfer"]);
});
