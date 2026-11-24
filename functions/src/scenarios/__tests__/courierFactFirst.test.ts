// 2026-11-24 브라우저 A 라이브 A5(카드사 고급 R1 fv-k3dn 통화 1 배송 기사) — 참가자 "그 카드 저는 신청 안 했어요" · "카드사에 직접 확인 전화 해 볼게요"를
// 흘리고 "본인 확인을 위해서 성함부터" · "본인 확인이 완료되어야 배송 관련 내용을 안내"만 되풀이했다. #609 사실 진술 문장은 실려 있었지만
// 이 통화 흐름의 1단계(성함 묻기)가 순서 기준이라 먼저 걸렸다. 판정표 CD(`flowVariants.ts` 배송 통화 1단계 주석).
// Live는 지시문이 유일한 층이라 시험은 조립 결과에 그 규칙이 실리는지를 고정한다(모델 실측은 실 키 승인 뒤).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_COURIER_FACT_FIRST_RULE, resolveSessionScenarioPrompt } from "../flowVariants";
import { buildSystemPrompt, FACT_STATEMENT_REPLY_SENTENCE } from "../../roleplay/promptAssembly";

test("[CD 재현] 배송 통화(레그 0) 1단계에 '신청 안 했다' · '직접 확인하겠다' 먼저 받기 규칙이 실린다", () => {
  const prompt = resolveSessionScenarioPrompt("card-company-impersonation", "fv-k3dn", 0);
  assert.ok(prompt);
  const stageLine = prompt.personaPrompt.split("\n").find((line) => line.startsWith("1. "));
  assert.ok(stageLine?.includes(CARD_COURIER_FACT_FIRST_RULE), stageLine);
  const assembled = buildSystemPrompt(prompt, { difficultyLevel: "advanced", liveSpeechStyle: true });
  assert.ok(assembled.includes(CARD_COURIER_FACT_FIRST_RULE));
  assert.ok(assembled.includes(FACT_STATEMENT_REPLY_SENTENCE), "#609 문장도 그대로");
});

test("[CD3] 다른 레그(상담원)에는 배송 규칙이 없다", () => {
  const prompt = resolveSessionScenarioPrompt("card-company-impersonation", "fv-k3dn", 1);
  assert.ok(prompt && !prompt.personaPrompt.includes(CARD_COURIER_FACT_FIRST_RULE));
});
