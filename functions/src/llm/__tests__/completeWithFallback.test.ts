import { test } from "node:test";
import assert from "node:assert/strict";
import { logger } from "firebase-functions";
import { completeWithFallback } from "../index";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult } from "../types";

// reviewer 리뷰 Major #1 회귀 방지(2026-07-24) — 실 LLM 호출이 실패(안전필터 차단·타임아웃·
// 네트워크 등)해도 completeWithFallback은 절대 throw하지 않고 Mock으로 강등해야 한다. sendMessage가
// 이미 사용자 턴을 원자적으로 커밋한 뒤 이 함수를 호출하므로, 여기서 던지면 "답 없는 사용자 턴"이
// 영구히 남는다(대화 이력 오염) — 이게 바로 이 테스트가 막는 회귀다.

function alwaysFailingClient(): LlmClient {
  return {
    providerName: "gemini",
    async complete(_input: LlmCompletionInput): Promise<LlmCompletionResult> {
      throw new Error("simulated Gemini failure (safety filter / timeout / network)");
    },
  };
}

function alwaysSucceedingClient(text: string): LlmClient {
  return {
    providerName: "gemini",
    async complete(_input: LlmCompletionInput): Promise<LlmCompletionResult> {
      return { text, isMock: false };
    },
  };
}

test("completeWithFallback(): 1차 클라이언트가 성공하면 그 결과를 그대로 반환한다(폴백 미발동)", async () => {
  const result = await completeWithFallback(alwaysSucceedingClient("실 Gemini 응답"), {
    systemPrompt: "(system)",
    messages: [],
  });
  assert.equal(result.text, "실 Gemini 응답");
  assert.equal(result.isMock, false);
});

test("completeWithFallback(): 1차 클라이언트가 실패해도 절대 throw하지 않고 Mock으로 강등한다(사용자 턴이 답 없이 남는 것 방지)", async () => {
  const result = await completeWithFallback(alwaysFailingClient(), {
    systemPrompt: "(system)",
    messages: [],
    mockTacticHints: ["테스트 수법 — '테스트 대사'"],
  });
  assert.equal(result.isMock, true, "폴백 결과는 정직하게 isMock:true여야 한다");
  assert.ok(result.text.length > 0, "폴백이어도 빈 텍스트를 반환하면 안 된다(사용자에게 답 없는 턴 노출 방지)");
});

test("completeWithFallback(): 폴백 시에도 mockTacticHints가 실제로 Mock 생성에 반영된다(폴백이 진짜 Mock 경로를 탐)", async () => {
  const result = await completeWithFallback(alwaysFailingClient(), {
    systemPrompt: "(system)",
    messages: [],
    mockTacticHints: ["친분 이용 — '오랜만이다' 처럼 기존 친분을 근거로 신뢰를 유도한다."],
  });
  assert.ok(result.text.includes("오랜만이다"), "MockLlmClient의 extractTacticFlavor가 정상 동작해야 한다");
});

// ══════════════════════════════════════════════════════════════════════════════
// §56.8 A안 ② — **강등 로그에 실제 소요 ms가 실린다**
// 이전 로그 필드는 3개(providerName·attemptedKeys·error)뿐이라, 타임아웃 문자열이 인용하는
// `LLM_TIMEOUT_MS` 상수 말고는 **얼마나 느렸는지를 아무 데도 기록하지 않았다** ⇒ "10.1초라 아깝게
// 잘렸다"와 "47초라 모델이 죽었다"가 같은 줄로 보였고, §56이 원인을 미확정으로 남긴 직접 원인이다.
// ══════════════════════════════════════════════════════════════════════════════
function captureLogger(): { restore: () => void; payloads: () => { message: unknown; data: unknown }[] } {
  const original = { warn: logger.warn, info: logger.info, error: logger.error, debug: logger.debug };
  const payloads: { message: unknown; data: unknown }[] = [];
  const record = (message: unknown, data: unknown) => {
    payloads.push({ message, data });
  };
  logger.warn = record as typeof logger.warn;
  logger.info = record as typeof logger.info;
  logger.error = record as typeof logger.error;
  logger.debug = record as typeof logger.debug;
  return {
    restore: () => {
      logger.warn = original.warn;
      logger.info = original.info;
      logger.error = original.error;
      logger.debug = original.debug;
    },
    payloads: () => payloads,
  };
}

/** 느린 실패(모델 서빙 지연 → 타임아웃)를 흉내낸다 — 지연 *자체*를 단위 테스트하는 게 아니라
 * (그건 §56.8 E가 기각했다) 로그가 **잰 값을 싣는지**만 본다. */
function failingAfter(delayMs: number): LlmClient {
  return {
    providerName: "gemini",
    async complete(_input: LlmCompletionInput): Promise<LlmCompletionResult> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      throw new Error("simulated slow failure");
    },
  };
}

test("completeWithFallback(): 강등 로그에 실제 소요 ms(elapsedMs)를 싣는다(§56.8 A안 ②)", async () => {
  const captured = captureLogger();
  try {
    await completeWithFallback(failingAfter(60), { systemPrompt: "(system)", messages: [] });
  } finally {
    captured.restore();
  }

  const degraded = captured.payloads().filter((p) => String(p.message).includes("Mock으로 강등"));
  assert.equal(degraded.length, 1, "강등은 정확히 한 줄로 기록돼야 한다");
  const data = degraded[0].data as { elapsedMs?: unknown };
  assert.equal(typeof data.elapsedMs, "number", "elapsedMs가 없으면 얼마나 느렸는지 영원히 알 수 없다");
  assert.ok(
    (data.elapsedMs as number) >= 50,
    `실제로 잰 값이어야 한다(0이나 상수가 아니라) — 60ms 지연 후 관측값: ${String(data.elapsedMs)}`,
  );
});

test("강등 로그가 프롬프트·참가자 입력을 절대 싣지 않는다(G170/ADR-0004 계승)", async () => {
  const SENTINEL_PROMPT = "SENTINEL_SYSTEM_PROMPT_비밀지시";
  const SENTINEL_USER = "SENTINEL_참가자입력_010-1234-5678";
  const captured = captureLogger();
  try {
    await completeWithFallback(alwaysFailingClient(), {
      systemPrompt: SENTINEL_PROMPT,
      messages: [{ role: "user", content: SENTINEL_USER }],
    });
  } finally {
    captured.restore();
  }

  const serialized = JSON.stringify(captured.payloads());
  assert.ok(!serialized.includes(SENTINEL_PROMPT), "시스템 프롬프트가 로그에 새면 안 된다");
  assert.ok(!serialized.includes(SENTINEL_USER), "참가자 입력(PII 포함 가능)이 로그에 새면 안 된다");
});
