// §140(2026-10-28 실 키 실측 — Live 연결이 601초에 서버 쪽에서 닫힘 · close 1011 · goAway 0건 · 재실측: 이어받기에도 새 세션 창 적용) — 토큰이 잠그는 이어받기 ·
// 문맥 창 압축 설정과 토큰 수명을 발급 요청 본문 수준에서 고정한다(`geminiProvider.test.ts`와 같은 fetch 가로채기).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GeminiRealtimeProvider,
  LIVE_CONTEXT_WINDOW_COMPRESSION,
  LIVE_SESSION_RESUMPTION_CONFIG,
  NEW_SESSION_EXPIRE_MINUTES,
  REALTIME_CALL_MAX_MINUTES,
  TOKEN_EXPIRE_MINUTES,
} from "../geminiProvider";
import { MAX_SESSION_MS } from "../../shared/constants";

function captureTokenRequest(): { restore: () => void; bodies: unknown[] } {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    if (init?.body) bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ name: "auth_tokens/test-token" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    },
    bodies,
  };
}

async function issue(): Promise<{ body: Record<string, unknown>; before: number; after: number }> {
  const capture = captureTokenRequest();
  try {
    const before = Date.now();
    await new GeminiRealtimeProvider("test-key", true).createCallCredentials({
      channel: undefined,
      hangupRelay: undefined,
      sessionId: "sess",
      scenarioId: "tax-refund-scam",
      voiceId: "ignored-for-gemini",
    });
    const after = Date.now();
    return { body: capture.bodies[0] as Record<string, unknown>, before, after };
  } finally {
    capture.restore();
  }
}

test("[§140] 토큰이 이어받기(sessionResumption)와 슬라이딩 창 압축을 잠근다", async () => {
  const { body } = await issue();
  const setup = body.bidiGenerateContentSetup as Record<string, unknown> | undefined;
  assert.ok(setup, "발급 요청에 bidiGenerateContentSetup이 있어야 한다");
  assert.deepEqual(setup.sessionResumption, LIVE_SESSION_RESUMPTION_CONFIG);
  assert.deepEqual(setup.contextWindowCompression, LIVE_CONTEXT_WINDOW_COMPRESSION);
  assert.deepEqual(LIVE_CONTEXT_WINDOW_COMPRESSION, { slidingWindow: {} });
  // 공식 문서 잠금 예시와 같은 모양 — 추가 잠금 필드를 두지 않는다(두면 클라의 이어받기 핸들이 무시될 수 있다 · 미실측).
  assert.equal(body.lockAdditionalFields, undefined);
});

test("[§140] 새 세션 창이 실시간 통화 20분 전체(발급 → 받기 1.5분 포함)를 덮는다 · 메시지 수명 ≥ 새 세션 창 · 사용 횟수 3", async () => {
  const { body, before, after } = await issue();
  // 2026-10-29 — 10분 재연결이 핸들 없는 새 세션(1회 사용) — 첫 연결 + 재연결 + 재시도 1.
  assert.equal(body.uses, 3);
  const expireMs = Date.parse(String(body.expireTime));
  const newSessionMs = Date.parse(String(body.newSessionExpireTime));
  assert.ok(expireMs >= before + TOKEN_EXPIRE_MINUTES * 60_000 && expireMs <= after + TOKEN_EXPIRE_MINUTES * 60_000);
  assert.ok(newSessionMs >= before + NEW_SESSION_EXPIRE_MINUTES * 60_000 && newSessionMs <= after + NEW_SESSION_EXPIRE_MINUTES * 60_000);
  // 2026-10-28 재실측 — 이어받기에도 새 세션 창이 걸린다(창 2분 토큰 → "new_session_expire_time deadline exceeded").
  assert.equal(REALTIME_CALL_MAX_MINUTES, 20, "사용자 결정 — 실시간 통화 상한 20분");
  assert.ok(NEW_SESSION_EXPIRE_MINUTES * 60_000 >= REALTIME_CALL_MAX_MINUTES * 60_000 + 90_000 + 60_000, "통화 20분 + 프리페치 90초 + 여유");
  assert.ok(TOKEN_EXPIRE_MINUTES >= NEW_SESSION_EXPIRE_MINUTES);
  // SDK 상한(20시간) 안.
  assert.ok(TOKEN_EXPIRE_MINUTES < 20 * 60);
});

test("[§140] 전역 세션 상한(MAX_SESSION_MS)은 메신저 · 폴백과 함께 쓰여 그대로 둔다 — 실시간 통화만 20분", () => {
  assert.equal(MAX_SESSION_MS, 60 * 60 * 1000);
  assert.ok(REALTIME_CALL_MAX_MINUTES * 60_000 < MAX_SESSION_MS);
});
