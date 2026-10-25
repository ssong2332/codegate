// §132.19(메인 라이브 2026-10-25 main `1072133` · 기관 사칭 고급 금 구매형 `?route=fv-g2ld` · 텍스트 대체 2세션) — 루트 이탈(임시 이체) · 인증번호 단계 미도달.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { buildSystemPrompt, NO_ACCOUNT_ENDING_SENTENCE } from "../promptAssembly";
import { listFlowVariants, resolveSessionScenarioPrompt, routeEndsWithoutAccount } from "../../scenarios/flowVariants";
import { resolveRouteAccountNumber } from "../../inCallSms/smsGate";
import { assignablePool } from "../../scenarios/variantPool";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { OTP_HOLD_INSTRUCTION, otpDemandGuardFor } from "../smsClaim";
import { resolveDeclaredSms } from "../../inCallSms/smsGate";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const assemble = (scenarioId: string, variantId: string) =>
  buildSystemPrompt(resolveSessionScenarioPrompt(scenarioId, variantId)!, {
    difficultyLevel: "advanced",
    fictionalBankName: "미르은행",
    sessionAccountNumber: resolveRouteAccountNumber(scenarioId, variantId),
    noAccountEnding: routeEndsWithoutAccount(scenarioId, variantId),
  });

test("[§132.19] 판정표 A — 금 구매형 프롬프트에 예시 계좌 · '이 번호를 그대로 쓴다' 0 · 금지 1문장 / 안전계좌 이체형은 종전", () => {
  const gold = assemble("institutional-impersonation", "fv-g2ld");
  assert.ok(!gold.includes("948-2716-5093-27"), "라이브 대사의 예시 계좌");
  assert.ok(!gold.includes("이 번호를 그대로 쓴다"));
  assert.ok(gold.includes(NO_ACCOUNT_ENDING_SENTENCE));
  const transfer = assemble("institutional-impersonation", "fv-c5fj");
  assert.ok(transfer.includes("이 번호를 그대로 쓴다"));
  assert.ok(!transfer.includes(NO_ACCOUNT_ENDING_SENTENCE));
});

test("[§132.19] 판정표 A 대상 — 고급 다중 루트 중 현금 · 금 · 상품권 · 대출금 전달 · 현금 상환 결말만(현행 8루트 · 은퇴 fv-bmiq는 목록 밖) · 변형 부재 · 다른 시나리오 ID = 거짓", () => {
  const targets: string[] = [];
  for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      for (const v of listFlowVariants(scenarioId, level)) if (routeEndsWithoutAccount(scenarioId, v.variantId)) targets.push(v.variantId);
    }
  }
  assert.deepEqual(
    targets.sort(),
    ["fv-a6lq", "fv-e5mv", "fv-g2ld", "fv-k9ra", "fv-q7cn", "fv-r4hc", "fv-t8ga", "fv-v2mk"].sort(),
  );
  // 이체 결말 루트는 그대로(계좌 문자 · 말로 부르는 송금).
  for (const id of ["fv-c5fj", "fv-p3jx", "fv-m3hd", "fv-d8pw", "fv-k268", "fv-66hh"]) {
    const v = [...assignablePool("institutional-impersonation", "advanced"), ...listFlowVariants("asset-protection-notice-call", "advanced"),
      ...listFlowVariants("loan-refinance-scam", "advanced"), ...listFlowVariants("kidnapping-threat", "advanced"),
      ...listFlowVariants("family-accident-deepvoice", "advanced")].find((x) => x.variantId === id)!;
    assert.equal(routeEndsWithoutAccount(v.scenarioId, id), false, id);
  }
  assert.equal(routeEndsWithoutAccount("institutional-impersonation", undefined), false);
  assert.equal(routeEndsWithoutAccount("asset-protection-notice-call", "fv-g2ld"), false);
});

test("[§132.19] 판정표 B — 인증번호 문자 하한 전 발화에만 앞 단계 붙잡기 지시 · 문면에 따옴표 대사 · 숫자 0", () => {
  const { declared } = resolveDeclaredSms("institutional-impersonation", "fv-g2ld");
  // 라이브 재현 — 발화 4(거래 은행 · 자산 답) = 하한(5) 전.
  assert.ok(otpDemandGuardFor({ declared, delivered: [], userTurns: 4 }));
  assert.equal(otpDemandGuardFor({ declared, delivered: [], userTurns: 5 }), undefined);
  assert.doesNotMatch(OTP_HOLD_INSTRUCTION, /[0-9'"“”‘’]/);
  for (const word of ["인증번호", "비밀번호", "계좌번호", "이체"]) assert.ok(OTP_HOLD_INSTRUCTION.includes(word), word);
  const src = read("roleplay/index.ts");
  assert.ok(src.includes("const otpHoldInstruction = otpDemandGuard ? OTP_HOLD_INSTRUCTION : undefined;"));
  assert.ok(src.includes("smsOfferInstruction, otpFollowUpInstruction, otpHoldInstruction]"));
});

test("[§132.19] 배선 — 프롬프트 조립 호출부 6곳이 같은 술어로 noAccountEnding을 넘긴다", () => {
  for (const [file, args] of [
    ["realtime/geminiProvider.ts", "input.scenarioId, input.flowVariantId"],
    ["roleplay/callReturnLine.ts", "session.scenarioId, session.flowVariantId"],
    ["roleplay/chatDuringCall.ts", "session.scenarioId, session.flowVariantId"],
    ["roleplay/index.ts", "session.scenarioId, session.flowVariantId"],
    ["roleplay/openingLine.ts", "scenarioId, flowVariantId"],
    ["roleplay/screenActionFollowUp.ts", "session.scenarioId, session.flowVariantId"],
  ] as const) {
    assert.ok(read(file).includes(`noAccountEnding: routeEndsWithoutAccount(${args}),`), file);
  }
});
