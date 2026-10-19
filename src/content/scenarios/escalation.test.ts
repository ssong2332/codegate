// T194-a G576(클라 쪽) — 메신저 → 통화 전이의 (시나리오 × 난이도) 술어: **서버 · 클라 두 구현의 대조** + 클라 직접 읽기 허용목록
// (docs/Architecture.md §83.4.1 · PRD AC-106 (i) · UX D-124).
//
// 왜 루트 테스트인가: functions 빌드 루트는 `src/`를 import할 수 없다(TS6059). 루트 러너(`node --experimental-strip-types`)는
// 두 잎 모듈(서버 `functions/src/scenarios/escalation.ts` · 공개 메타 미러 `publicMeta.ts`)을 직접 불러올 수 있다.
// ⚠️ 클라 시나리오 메타는 `index.ts`(확장자 없는 re-export — 이 러너가 못 푼다) 대신 시나리오 파일을 하나씩 불러 모은다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  resolveScenarioEscalation as resolveClient,
  resolveSessionEscalation as resolveClientSession,
  type EscalationMetaView,
} from "./escalation.ts";
import {
  resolveScenarioEscalation as resolveServer,
  resolveSessionEscalation as resolveServerSession,
} from "../../../functions/src/scenarios/escalation.ts";
import { PUBLIC_SCENARIOS } from "../../../functions/src/scenarios/publicMeta.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
const LEVELS: unknown[] = ["beginner", "intermediate", "advanced", undefined, "Advanced", "expert"];

/** 클라 시나리오 메타 카탈로그 — 각 파일의 `*_SCENARIO_ID`와 `title`을 가진 객체 export를 짝짓는다. */
async function loadClientCatalog(): Promise<Record<string, EscalationMetaView & { title: string }>> {
  const files = fs
    .readdirSync(HERE)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts" && f !== "escalation.ts");
  const catalog: Record<string, EscalationMetaView & { title: string }> = {};
  for (const file of files) {
    const mod = (await import(pathToFileURL(path.join(HERE, file)).href)) as Record<string, unknown>;
    const ids = Object.entries(mod).filter(([key, value]) => key.endsWith("_SCENARIO_ID") && typeof value === "string");
    const docs = Object.values(mod).filter(
      (value): value is EscalationMetaView & { title: string } =>
        typeof value === "object" && value !== null && "title" in value && "deepvoiceLines" in value,
    );
    assert.equal(ids.length, 1, `${file}: 시나리오 ID export가 1개가 아니다`);
    assert.equal(docs.length, 1, `${file}: 시나리오 메타 export가 1개가 아니다`);
    catalog[ids[0][1] as string] = docs[0];
  }
  return catalog;
}

test("[T194-a G576] 서버 · 클라 술어가 전 시나리오 × 난이도(원값 포함) × {자가 · 챌린지}에서 같은 값 · 두 메타의 전이 필드가 같다", async (t) => {
  const client = await loadClientCatalog();
  assert.deepEqual(Object.keys(client).sort(), Object.keys(PUBLIC_SCENARIOS).sort(), "클라 · 서버 시나리오 집합이 다르다");
  let cells = 0;
  const yes: string[] = [];
  for (const id of Object.keys(PUBLIC_SCENARIOS).sort()) {
    assert.deepEqual(client[id].escalation, PUBLIC_SCENARIOS[id].escalation, `${id}: escalation 드리프트`);
    assert.deepEqual(client[id].advancedEscalation, PUBLIC_SCENARIOS[id].advancedEscalation, `${id}: advancedEscalation 드리프트`);
    for (const level of LEVELS) {
      assert.deepEqual(resolveClient(client[id], level), resolveServer(PUBLIC_SCENARIOS[id], level), `${id}/${String(level)}`);
      for (const challengeId of [undefined, "c1"]) {
        const session = { scenarioId: id, difficultyLevel: level, challengeId };
        const a = resolveClientSession(session, client);
        const b = resolveServerSession(session, PUBLIC_SCENARIOS);
        assert.deepEqual(a, b, `${id}/${String(level)}/${challengeId ?? "자가"}`);
        cells += 1;
        if (a && typeof level === "string" && ["beginner", "intermediate", "advanced"].includes(level) && !challengeId) {
          yes.push(`${id}/${level}`);
        }
      }
    }
  }
  t.diagnostic(`[G576 클라·서버 대조] ${cells}칸 일치 · 자가 세션 전이 있음 ${yes.length}칸`);
  assert.deepEqual(
    yes.filter((key) => key.startsWith("messenger-parcel-smishing-sms/")),
    ["messenger-parcel-smishing-sms/advanced"],
    "택배 문자는 고급만(UX D-124 ① ②)",
  );
});

// ── 클라 직접 읽기 허용목록 ──────────────────────────────────────────────────────

const DIRECT_META_READ = /(\bscenario\??|\bmeta\??|\bfound\??)\.(escalation|advancedEscalation)\b/g;
/** §83.4.1 — C-5(2인 발송 목록 필터 — 서버 챌린지 거부 S-6과 짝, 시나리오 단위 그대로) · 술어 구현 자신. */
const CLIENT_ALLOWLIST = ["src/app/scenarios/messenger/page.tsx", "src/content/scenarios/escalation.ts"];

const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function clientHits(files: Record<string, string>): string[] {
  const hits: string[] = [];
  for (const [rel, source] of Object.entries(files)) {
    for (const match of codeOnly(source).matchAll(DIRECT_META_READ)) hits.push(`${rel}: ${match[0]}`);
  }
  return hits.filter((hit) => !CLIENT_ALLOWLIST.some((allowed) => hit.startsWith(`${allowed}:`))).sort();
}

test("[T194-a G576] 클라 소스의 메타 전이 필드 직접 읽기는 허용목록(C-5 · 술어 구현)에서만 · 역방향 샘플은 걸린다", (t) => {
  const files: Record<string, string> = {};
  for (const pattern of ["src/**/*.ts", "src/**/*.tsx"]) {
    for (const rel of fs.globSync(pattern, { cwd: REPO_ROOT })) {
      const normalized = rel.split(path.sep).join("/");
      if (/\.test\.tsx?$/.test(normalized)) continue;
      files[normalized] = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
    }
  }
  assert.ok(Object.keys(files).length > 50, "스캔 대상이 너무 적다 — 순회가 죽었다");
  const outside = clientHits(files);
  const tainted = clientHits({
    ...files,
    "src/app/session/messenger/page.tsx": `${files["src/app/session/messenger/page.tsx"]}\nconst x = Boolean(scenario.escalation);`,
  });
  t.diagnostic(`[G576 클라] 허용목록 밖 직접 읽기 ${outside.length}건 / 옛 C-2 형태를 되살린 샘플 → ${tainted.length}건`);
  assert.deepEqual(outside, [], "화면은 resolveScenarioEscalation · resolveSessionEscalation만 쓴다(G576)");
  assert.equal(tainted.length, 1);
  // C-5는 무변경이다(2인 발송 목록 — 시나리오 단위).
  assert.ok(codeOnly(files["src/app/scenarios/messenger/page.tsx"]).includes("!scenario.escalation"), "C-5 무변경");
});

test("[T194-a G576] 화면 판정 지점 — C-1 난이도 화면 · C-4 목소리 선택 가드가 고른 난이도로 술어를 부른다(UX D-124 ① · UX-025 v1.38)", () => {
  const read = (rel: string) => codeOnly(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"));
  assert.match(read("src/app/scenarios/difficulty/page.tsx"), /if \(resolveScenarioEscalation\(scenario, selected\)\)/);
  assert.match(
    read("src/app/scenarios/messenger/voice-select/page.tsx"),
    /!resolveScenarioEscalation\(scenario, getSelectedDifficultyLevel\(\)\)\) return "no-scenario"/,
  );
  assert.match(
    read("src/app/session/messenger/page.tsx"),
    /resolveSessionEscalation\(\s*\{ scenarioId: scenarioId as string, difficultyLevel: data\.difficultyLevel, challengeId: data\.challengeId \},\s*scenarios,\s*\) !== undefined/,
  );
});
