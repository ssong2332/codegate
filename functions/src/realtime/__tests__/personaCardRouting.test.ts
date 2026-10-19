// T194-b(docs/Architecture.md §84.3.5 · §84.8 G567 · T194-C2 원자성) — 카드 세션은 ElevenLabs로 가지 않는다.
// ElevenLabs는 프롬프트가 에이전트에 저장되고 서명 URL에 서버 측 인자가 없어(§82.6.4) 카드를 사기범에게 실을 수 없다 —
// 그 경로로 가면 "카드는 보이는데 사기범은 모르는" 세션이 된다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { getRealtimeProvider, requiresServerPromptProvider } from "../provider";
import { buildPersonaCard } from "../../session/personaCard";

const SCENARIO = "institutional-impersonation";

function withElevenLabsConfigured<T>(fn: () => T): T {
  const saved = { key: process.env.ELEVENLABS_API_KEY, map: process.env.ELEVENLABS_AGENT_IDS };
  process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
  process.env.ELEVENLABS_AGENT_IDS = `${SCENARIO}:agent_test`;
  try {
    return fn();
  } finally {
    if (saved.key === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = saved.key;
    if (saved.map === undefined) delete process.env.ELEVENLABS_AGENT_IDS;
    else process.env.ELEVENLABS_AGENT_IDS = saved.map;
  }
}

test("[G567] 술어 — 세션 문서에 카드가 있으면 참, 없으면 거짓", () => {
  const personaCard = buildPersonaCard({ sessionId: "s", scenarioId: SCENARIO, fictionalBankName: "한결은행" });
  assert.equal(requiresServerPromptProvider({ personaCard }), true);
  assert.equal(requiresServerPromptProvider({}), false);
});

test("[G567] 키 · 에이전트 맵이 있어도 카드 세션은 ElevenLabs를 고르지 않는다 — 카드 없는 세션은 오늘 그대로 ElevenLabs(대조군)", (t) => {
  const [withoutCard, withCard] = withElevenLabsConfigured(() => [
    getRealtimeProvider(SCENARIO, undefined, false).providerName,
    getRealtimeProvider(SCENARIO, undefined, true).providerName,
  ]);
  assert.equal(withoutCard, "elevenlabs", "대조군이 ElevenLabs가 아니면 이 테스트는 아무것도 증명하지 못한다");
  assert.notEqual(withCard, "elevenlabs");
  t.diagnostic(`[G567] 카드 없음 → ${withoutCard} · 카드 있음 → ${withCard}`);
});

test("[G567 배선] createRealtimeCall이 세션 술어 값을 프로바이더 선택에 넘기고, 카드 행은 세션 문서에서만 읽는다(소스 스캔)", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/realtime/index.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(
    src,
    /getRealtimeProvider\(\n\s*session\.scenarioId,\n\s*effectiveVoiceMode,\n\s*requiresServerPromptProvider\(session\),\n\s*\)/,
  );
  assert.match(src, /personaCard: session\.personaCard\?\.items,/);
  assert.equal(/request\.data[^;]*personaCard/.test(src), false, "요청에서 카드를 읽는다");
});
