// N1(페르소나 전수 점검 2026-11-23 · 메신저 3/16) — 사기범 대사에 내부 추론 · 훈련 메타 문장이 나갔다.
// 판정표 MK-1 · UM-1 ~ UM-4 = `docs/research/messenger-meta-leak-2026-11-24.md`. ⛔ 라이브 호출 0건 — 가짜 클라이언트만 쓴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { logger } from "firebase-functions";
import { withGeminiAfterClaude } from "../claudeFallback";
import { LLM_OVERLOAD_MIN_ATTEMPT_MS, LLM_TIMEOUT_MS } from "../index";
import { judgeScammerReplyUsability } from "../replyUsability";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "../types";
import { tidyScammerReplyMarkup } from "../../roleplay/replyMarkup";

for (const level of ["info", "warn"] as const) (logger as unknown as Record<string, unknown>)[level] = () => undefined;

/** 실 대사(audit-probe-results.md N1). */
const E1 = "(이번에는 이체 화면에 기록이 없어서 입금이 확인되지 않았어. 그래서 대답은 이렇게 할게.) 아, 그래?";
const E2 = "이 응답에는 통화 전환 신호만 포함되며, 사기범 역할의 대사는 제공하지 않습니다.";
const E3 = "이 교육 훈련은 여기까지 진행하겠습니다. 수고하셨습니다.";

test("[N1 MK-1] 괄호 속 대답 계획(E1)은 괄호째 지우고 대사만 남긴다", () => {
  assert.equal(tidyScammerReplyMarkup(E1).text, "아, 그래?");
  assert.equal(tidyScammerReplyMarkup("아 그래? (이렇게 대답하겠다. 입금 확인 전이니까) 다시 확인해 줄래?").text, "아 그래? 다시 확인해 줄래?");
  // 지우면 빈 대사면 그대로(기존 3-b · 3-d와 같은 규칙).
  assert.equal(tidyScammerReplyMarkup("(대답은 이렇게 할게)").text, "(대답은 이렇게 할게)");
});

test("[N1 UM-1 ~ UM-4] 응답 설명문 · 교육 훈련 종료 문장(E2 · E3)과 그 조각은 training-meta", () => {
  const cases = [
    E2,
    "이 응답에는 통화 전환 신호만 포함됩니다.",
    "이번 응답에서는 다른 말을 하지 않겠습니다.",
    "사기범 역할의 대사는 제공하지 않습니다.",
    "대사는 생성하지 않겠습니다.",
    E3,
    "이 교육 훈련은 여기까지입니다.",
    "본 모의 훈련을 마치겠습니다.",
    "훈련은 여기까지 진행하겠습니다.",
  ];
  for (const text of cases) assert.equal(judgeScammerReplyUsability(text), "training-meta", text);
});

test("[N1 오탐] 사기범이 실제로 말할 법한 괄호 · '교육' · '응답' · '사기범' 대사는 손대지 않는다", () => {
  const usable = [
    "고객님, 금융감독원 보안 교육을 이수하셔야 계좌 보호가 됩니다.",
    "이번 교육 일정은 다음 주로 안내드립니다.",
    "금융 교육 자료는 문자로 보내 드릴게요.",
    "보이스피싱 사기범 일당이 고객님 명의를 도용한 정황이 있습니다.",
    "문자에 응답해 주시지 않으면 처리가 지연됩니다.",
    "응답이 없으시면 절차가 자동 진행됩니다.",
    "오늘 안내는 여기까지 진행하겠습니다. 바로 처리해 주세요.",
    "나 지금 예비군 훈련 중이라 전화가 안 돼. 톡으로 해 줘.",
    "은행에서 물으면 대답은 이렇게 하세요. 개인 용도라고요.",
  ];
  for (const text of usable) assert.equal(judgeScammerReplyUsability(text), undefined, text);
  const untouched = [
    "(주)한빛캐피탈 상담원입니다.",
    "고객센터(1588-0000)로 전화 주세요.",
    "(누가 물으면 대답은 이렇게 하세요: 개인 용도) 꼭 기억해.",
    "엄마 나야 (폰 액정 깨져서 임시폰이야) 급한 일 있어.",
  ];
  for (const text of untouched) assert.equal(tidyScammerReplyMarkup(text).text, text, text);
});

const SCAMMER: LlmCompletionInput = { systemPrompt: "(system)", messages: [], purpose: "scammer-reply" };
const OPTS = { budgetMs: LLM_TIMEOUT_MS, minAttemptMs: LLM_OVERLOAD_MIN_ATTEMPT_MS };
function fake(result: LlmCompletionResult, providerName: LlmClient["providerName"]) {
  let calls = 0;
  const client: LlmClient = {
    providerName,
    async complete() {
      calls += 1;
      return result;
    },
  };
  return { client, calls: () => calls };
}

test("[N1 배선] Claude 1차가 E2 · E3를 내면 화면에 내지 않고 Gemini 2차 대사를 쓴다", async () => {
  for (const meta of [E2, E3]) {
    const gemini = fake({ text: "고객님, 택배 주소 확인 링크 눌러 주시면 바로 처리됩니다.", isMock: false }, "gemini");
    const claude = fake({ text: meta, isMock: false }, "claude");
    const chain = withGeminiAfterClaude(claude.client, gemini.client, OPTS);
    assert.equal((await chain.complete(SCAMMER)).text, "고객님, 택배 주소 확인 링크 눌러 주시면 바로 처리됩니다.");
    assert.equal(gemini.calls(), 1);
  }
});
