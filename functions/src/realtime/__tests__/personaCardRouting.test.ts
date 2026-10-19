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
  // T194-c-1 G610 — 술어 입력에 세션 시나리오 · 변형이 더해졌다(Q2 항). 카드 항 판정은 그대로다.
  assert.equal(requiresServerPromptProvider({ personaCard, scenarioId: SCENARIO }), true);
  assert.equal(requiresServerPromptProvider({ scenarioId: SCENARIO }), false);
});

// ── T194-c-1 G610(docs/Architecture.md §84.15.4 J-4 · §84.16.3) — Q2 설치 문자 선언 세션도 ElevenLabs로 가지 않는다 ─────────────
/** R-f 사본 — Q2 항을 끈 술어(T194-c-1 이전 원문 그대로 · 카드 항만). */
const requiresServerPromptProviderBeforeQ2 = (session: { personaCard?: unknown; scenarioId: string }): boolean => session.personaCard !== undefined;

function withElevenLabsFor<T>(scenarioId: string, fn: () => T): T {
  const saved = { key: process.env.ELEVENLABS_API_KEY, map: process.env.ELEVENLABS_AGENT_IDS };
  process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
  process.env.ELEVENLABS_AGENT_IDS = `${scenarioId}:agent_test`;
  try {
    return fn();
  } finally {
    if (saved.key === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = saved.key;
    if (saved.map === undefined) delete process.env.ELEVENLABS_AGENT_IDS;
    else process.env.ELEVENLABS_AGENT_IDS = saved.map;
  }
}

test("[T194-c-1 G610 · R-f] card-delivery-call 고급(카드 없음 · Q2 설치 문자 선언) — 술어 참 → ElevenLabs 아님 / Q2 항을 끈 사본 → ElevenLabs(실패 재현)", (t) => {
  const session = { scenarioId: "card-delivery-call", flowVariantId: "fv-tvnj" };
  const { normal, poisoned } = withElevenLabsFor("card-delivery-call", () => ({
    normal: getRealtimeProvider(session.scenarioId, "generic", requiresServerPromptProvider(session)).providerName,
    poisoned: getRealtimeProvider(session.scenarioId, "generic", requiresServerPromptProviderBeforeQ2(session)).providerName,
  }));
  t.diagnostic(`[G610 · R-f] 정상 술어 → ${normal} · Q2 항을 끈 사본 → ${poisoned}`);
  assert.equal(poisoned, "elevenlabs", "사본이 ElevenLabs가 아니면 역방향이 성립하지 않는다");
  assert.notEqual(normal, "elevenlabs");
  // 진리표 — 자가 Q2 3 단위 참 · 챌린지 단위(base 변형) · 변형 없는 세션 · 다른 시나리오 거짓.
  const rows: [string, { scenarioId: string; flowVariantId?: string }, boolean][] = [
    ["card-delivery 자가 고급", { scenarioId: "card-delivery-call", flowVariantId: "fv-tvnj" }, true],
    ["card-company 자가 고급", { scenarioId: "card-company-impersonation", flowVariantId: "fv-x7ue" }, true],
    ["loan 자가 고급", { scenarioId: "loan-refinance-scam", flowVariantId: "fv-m3hd" }, true],
    ["card-company 챌린지 고급(fv-akj5)", { scenarioId: "card-company-impersonation", flowVariantId: "fv-akj5" }, false],
    ["loan 챌린지 고급(fv-6s5p)", { scenarioId: "loan-refinance-scam", flowVariantId: "fv-6s5p" }, false],
    ["card-delivery 변형 없음(옛 세션)", { scenarioId: "card-delivery-call" }, false],
    ["다른 시나리오의 변형 ID", { scenarioId: "loan-refinance-scam", flowVariantId: "fv-tvnj" }, false],
  ];
  for (const [label, s, expected] of rows) assert.equal(requiresServerPromptProvider(s), expected, label);
});

test("[T194-c-1 G610 배선] 술어는 함수 1개 · Q2 항은 variantPool의 단일 판별자를 쓴다(두 목록 금지 — 소스 스캔)", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/realtime/provider.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /return session\.personaCard !== undefined \|\| sessionDeclaresInCallInstall\(session\.scenarioId, session\.flowVariantId\);/);
  assert.equal((src.match(/export function requiresServerPromptProvider/g) ?? []).length, 1);
  const pool = readFileSync(path.resolve(__dirname, "../../../src/scenarios/variantPool.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(pool, /return variant !== undefined && variant\.scenarioId === scenarioId && declaresInCallInstall\(variant\);/);
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
