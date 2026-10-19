// T194-b(docs/Architecture.md §84.3.5 · §84.8 G567 · T194-C2 원자성) — 카드 세션은 ElevenLabs로 가지 않는다.
// ElevenLabs는 프롬프트가 에이전트에 저장되고 서명 URL에 서버 측 인자가 없어(§82.6.4) 카드를 사기범에게 실을 수 없다 —
// 그 경로로 가면 "카드는 보이는데 사기범은 모르는" 세션이 된다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { getRealtimeProvider, requiresServerPromptProvider } from "../provider";
import { buildPersonaCard } from "../../session/personaCard";
import { readdirSync } from "node:fs";
import { assertVerifyEligible } from "../../verifyIntercept";
import { PERSONA_CARD_SCENARIOS } from "../../scenarios/personaCardCatalog";
import type { SessionDoc } from "../../shared/types";

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

// ── 리뷰 C1 — 확인 전화 재검증(assertVerifyEligible ⑤)도 같은 술어를 써야 한다 ─────────────────────────────

function sessionFor(scenarioId: string, withCard: boolean): SessionDoc {
  const personaCard = withCard ? buildPersonaCard({ sessionId: "c1-" + scenarioId, scenarioId, fictionalBankName: "한결은행" }) : undefined;
  return {
    sessionId: "c1-" + scenarioId,
    uid: "u",
    scenarioId,
    status: "active",
    difficultyLevel: "advanced",
    ...(personaCard ? { personaCard } : {}),
  } as unknown as SessionDoc;
}

test("[G567 · 리뷰 C1] 키 · 에이전트 맵이 있어도 카드 세션은 확인 전화 재검증을 통과하고, 카드 없는 세션은 기존대로 ElevenLabs 거절(대상 4종 전수)", (t) => {
  for (const scenarioId of PERSONA_CARD_SCENARIOS) {
    const saved = { key: process.env.ELEVENLABS_API_KEY, map: process.env.ELEVENLABS_AGENT_IDS };
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    process.env.ELEVENLABS_AGENT_IDS = scenarioId + ":agent_test";
    try {
      assert.doesNotThrow(() => assertVerifyEligible(sessionFor(scenarioId, true)), scenarioId + ": 카드 세션이 거절됐다");
      assert.throws(() => assertVerifyEligible(sessionFor(scenarioId, false)), /이 통화 경로에서는 성립하지 않는 흐름입니다/, scenarioId + ": 대조군");
    } finally {
      if (saved.key === undefined) delete process.env.ELEVENLABS_API_KEY;
      else process.env.ELEVENLABS_API_KEY = saved.key;
      if (saved.map === undefined) delete process.env.ELEVENLABS_AGENT_IDS;
      else process.env.ELEVENLABS_AGENT_IDS = saved.map;
    }
  }
  t.diagnostic("[G567 · C1] 4종 × {카드 있음 → 통과 · 카드 없음 → ElevenLabs 거절}");
});

const SRC_ROOT = path.resolve(__dirname, "../../../src");
type SourceFile = { file: string; source: string };
function productionSources(): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") walk(full);
      } else if (entry.name.endsWith(".ts")) {
        out.push({ file: path.relative(SRC_ROOT, full).replace(/\\/g, "/"), source: readFileSync(full, "utf8").replace(/\r\n/g, "\n") });
      }
    }
  };
  walk(SRC_ROOT);
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** getRealtimeProvider 호출부(정의 제외)마다 세 번째 인자가 `requiresServerPromptProvider(session)`인지. */
function callSiteViolations(sources: readonly SourceFile[]): { calls: number; violations: string[] } {
  let calls = 0;
  const violations: string[] = [];
  for (const { file, source } of sources) {
    const code = stripComments(source);
    const re = /(?<!function )getRealtimeProvider\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      // 괄호 짝을 맞춰 인자 문자열을 자른다.
      let depth = 1;
      let i = m.index + m[0].length;
      while (i < code.length && depth > 0) {
        if (code[i] === "(") depth += 1;
        else if (code[i] === ")") depth -= 1;
        i += 1;
      }
      const args = code.slice(m.index + m[0].length, i - 1);
      calls += 1;
      if (!/,\s*requiresServerPromptProvider\(session\),?\s*$/.test(args)) violations.push(file + ": getRealtimeProvider(" + args.replace(/\s+/g, " ").trim() + ")");
    }
  }
  return { calls, violations };
}

test("[G567 · 리뷰 C1] functions/src 운영 소스의 getRealtimeProvider 호출부 전부가 같은 술어를 넘긴다 — 술어를 뺀 사본은 실패한다", (t) => {
  const sources = productionSources();
  const real = callSiteViolations(sources);
  assert.ok(real.calls >= 2, "호출부를 못 찾았다(현재 realtime/index.ts · verifyIntercept/index.ts) — 게이트가 죽었다: " + real.calls);
  assert.deepEqual(real.violations, []);
  t.diagnostic("[G567 · C1 정상] 호출부 " + real.calls + "곳 위반 0");
  const poisoned = sources.map((f) =>
    f.file === "verifyIntercept/index.ts"
      ? { ...f, source: f.source.replace("    requiresServerPromptProvider(session),\n  );", "  );") }
      : f,
  );
  assert.notDeepEqual(poisoned, sources, "오염 사본 생성 실패 — 앵커가 바뀌었다");
  const bad = callSiteViolations(poisoned);
  assert.equal(bad.violations.length, 1, "술어를 뺀 사본이 통과했다 — 검사가 무력하다");
  t.diagnostic("[G567 · C1 역방향] verifyIntercept 호출부에서 술어를 뺀 사본 → " + bad.violations[0] + " — 실패 확인");
});
