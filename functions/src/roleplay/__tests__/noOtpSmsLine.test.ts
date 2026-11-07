// ⭐ Edge 재시험 R2(2026-11-07 · 정부지원금 스미싱 고급 fv-hu8w) — 인증번호 문자가 없는 세션에서 "인증번호 · 확인 앱에 뜬 여섯 자리"를 요구했다.
// 판정표 N(`promptAssembly.ts` `NO_OTP_SMS_LINE`): N1 [화면 행동 확인] 없음 = 없음 · N2 통화 중 문자 선언 = 없음 · N3 그 밖 = 블록 끝에 1줄.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, NO_OTP_SMS_LINE, SCREEN_ACTION_ONLY_RULE } from "../promptAssembly";
import { FLOW_VARIANTS, resolveSessionScenarioPrompt, routeEndsWithoutAccount } from "../../scenarios/flowVariants";
import { resolveRouteAccountNumber, sessionDeclaredSmsPurposes, sessionDeclaresInCallSms } from "../../inCallSms/smsGate";
import { sessionScreenActionOnly } from "../screenAction";
import { asksIdentityCheck } from "../personaAuthority";

const assemble = (scenarioId: string, variantId: string | undefined) =>
  buildSystemPrompt(resolveSessionScenarioPrompt(scenarioId, variantId)!, {
    difficultyLevel: "advanced",
    inCallSmsEnabled: sessionDeclaresInCallSms(scenarioId, variantId),
    inCallSmsPurposes: sessionDeclaredSmsPurposes(scenarioId, variantId),
    identityCheckAllowed: asksIdentityCheck(scenarioId),
    fictionalBankName: "다온은행",
    sessionAccountNumber: resolveRouteAccountNumber(scenarioId, variantId),
    noAccountEnding: routeEndsWithoutAccount(scenarioId, variantId),
    screenActionOnly: sessionScreenActionOnly(scenarioId, variantId),
  });

test("[R2 N3] 정부지원금 고급 fv-hu8w — [화면 행동 확인] 끝에 인증번호 요구 금지 줄", () => {
  const prompt = assemble("messenger-subsidy-smishing-sms", "fv-hu8w");
  assert.ok(prompt.includes(`${SCREEN_ACTION_ONLY_RULE}${NO_OTP_SMS_LINE}`));
  assert.match(NO_OTP_SMS_LINE, /인증번호 문자가 오지 않고/);
  assert.match(NO_OTP_SMS_LINE, /앱에 뜬 숫자를 불러 달라거나 보내 달라고 하지 않는다/);
  assert.equal(/["“]/.test(NO_OTP_SMS_LINE), false, "따옴표 대사 예시 0");
});

test("[R2 N2] 통화 중 문자(인증번호 문자 포함)를 선언한 세션은 종전 그대로 — 기관 사칭 고급 fv-c5fj · 고정 변형 fv-akj5 · fv-6s5p", () => {
  for (const [scenarioId, variantId] of [
    ["institutional-impersonation", "fv-c5fj"],
    ["card-company-impersonation", "fv-akj5"],
    ["loan-refinance-scam", "fv-6s5p"],
  ] as const) {
    assert.ok(!assemble(scenarioId, variantId).includes(NO_OTP_SMS_LINE), variantId);
  }
});

test("[R2 N1] [화면 행동 확인]을 싣지 않는 조립은 줄 0", () => {
  const prompt = buildSystemPrompt(resolveSessionScenarioPrompt("messenger-subsidy-smishing-sms", "fv-hu8w")!, { difficultyLevel: "advanced" });
  assert.ok(!prompt.includes(NO_OTP_SMS_LINE));
});

test("[R2 범위] 줄을 받는 변형 = 화면은 있고 문자 카탈로그는 없는 메신저 4종 13변형 — 인증번호를 쓰는 변형은 모두 문자를 선언한다", () => {
  const hit = FLOW_VARIANTS.filter((v) => sessionScreenActionOnly(v.scenarioId, v.variantId) && !sessionDeclaresInCallSms(v.scenarioId, v.variantId));
  assert.deepEqual(
    [...new Set(hit.map((v) => v.scenarioId))].sort(),
    ["messenger-child-impersonation-kakao", "messenger-friend-loan-kakao", "messenger-parcel-smishing-sms", "messenger-subsidy-smishing-sms"],
  );
  assert.equal(hit.length, 13);
  for (const v of FLOW_VARIANTS) {
    const p = resolveSessionScenarioPrompt(v.scenarioId, v.variantId)!;
    if (/인증번호|인증 번호/.test([p.personaPrompt, ...p.weakenedTactics].join("\n"))) {
      assert.equal(sessionDeclaresInCallSms(v.scenarioId, v.variantId), true, `${v.variantId} — 인증번호 단계가 있으면 문자가 있어야 한다`);
    }
  }
});

test("[R2 배선] Live 토큰 · 폴백 · 오프닝이 같은 술어 두 개(screenActionOnly · inCallSmsEnabled)를 넘긴다 — 조립 함수 한 곳에서만 붙인다", () => {
  const prompt = assemble("messenger-parcel-smishing-sms", "fv-g454");
  assert.equal(prompt.split(NO_OTP_SMS_LINE).length - 1, 1, "한 번만");
});
