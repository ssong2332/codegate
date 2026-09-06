// 라이브 신고 회귀 방지(2026-09-06) — institutionalImpersonation(고급)·kidnappingThreat(중급) 텍스트
// 입력 경로에서 "접수번호는 [계좌]번입니다", "OO은행 [계좌] 계좌로 지금 얼마 보낼 수 있어?"처럼
// 사기범 발화의 가짜 계좌·접수번호가 리터럴 "[계좌]" 토큰으로 대체돼 노출됐다. 원인은
// `guardrails/maskPII`(참가자 PII 보호용)가 사기범(LLM) 응답에도 그대로 적용돼, promptAssembly.ts의
// SCENARIO_PROGRESSION_TEMPLATE/ADVANCED_L3_PROCEDURAL이 의도적으로 말하게 하는 8자리 이상의
// 그럴듯한 가짜 숫자열을 오탐 마스킹한 것이었다(scammerReplyMasking.ts 헤더 주석 참고).
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskPII } from "../../guardrails";
import { finalizeScammerReplyText } from "../scammerReplyMasking";

test("finalizeScammerReplyText(): 8자리 이상 가짜 계좌번호가 섞인 사기범 응답을 그대로 보존한다(라이브 신고 회귀 방지)", () => {
  const line = "접수번호를 남겨 드릴게요. OO은행 352-0812-4471-63 계좌로 지금 얼마 보낼 수 있어?";
  assert.equal(finalizeScammerReplyText(line), line);
});

test("finalizeScammerReplyText(): '접수번호는 ~번입니다' 형태(institutionalImpersonation 재현)도 숫자가 그대로 남는다", () => {
  const line = "접수번호는 88031247번입니다.";
  assert.equal(finalizeScammerReplyText(line), line);
});

test("finalizeScammerReplyText(): kidnappingThreat 재현 문구(계좌 요구)도 숫자가 그대로 남는다", () => {
  const line = "OO은행 100-2043-7788-21 계좌로 지금 얼마 보낼 수 있어?";
  assert.equal(finalizeScammerReplyText(line), line);
});

// 역검증(이 테스트가 실제로 회귀를 잡아낼 수 있음을 증명) — 같은 입력을 옛 코드처럼 maskPII에
// 통과시키면 "[계좌]" 리터럴로 치환된다는 것을 직접 보여, 위 세 테스트가 무의미한 항등 검사가
// 아니라 실제로 이 버그를 잡아내는 지점임을 확인한다.
test("[역검증] 같은 문자열을 guardrails/maskPII에 통과시키면(옛 코드) '[계좌]' 리터럴로 치환된다 — finalizeScammerReplyText와 결과가 달라야 이 테스트가 의미 있다", () => {
  const line = "접수번호는 88031247번입니다.";
  assert.equal(maskPII(line), "접수번호는 [계좌]번입니다.");
  assert.notEqual(finalizeScammerReplyText(line), maskPII(line));
});

test("finalizeScammerReplyText(): 빈 문자열·PII 무관 일반 대사는 무변경으로 통과한다", () => {
  assert.equal(finalizeScammerReplyText(""), "");
  const line = "여보세요, 지금 통화 가능하신가요?";
  assert.equal(finalizeScammerReplyText(line), line);
});
