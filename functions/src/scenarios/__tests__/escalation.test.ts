// T194-a G576 — 메신저 → 통화 전이의 (시나리오 × 난이도) 단일 술어 (docs/Architecture.md §83.4.1 · PRD AC-106 · AC-106 (i)).
//
// 이 파일이 고정하는 것:
//   ① 술어 진리표(전 시나리오 × 3난이도 × {자가 · 챌린지}) — `escalation` 보유는 세 난이도 모두, `advancedEscalation`만 보유는 고급 자가만.
//   ② 난이도 원값 비교(`=== "advanced"`)가 서버 정규화(`normalizeDifficultyLevel`)와 같은 결과다.
//   ③ 서버 소스에서 메타 필드를 **직접 읽는 곳**이 허용목록(S-6 챌린지 거부 · 술어 구현 자신)뿐이다 + 역방향 샘플.
// 서버 · 클라 두 구현의 대조는 루트 `src/content/scenarios/escalation.test.ts`가 한다(functions 빌드 루트가 src/를 못 읽는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { resolveScenarioEscalation, resolveSessionEscalation } from "../escalation";
import { PUBLIC_SCENARIOS } from "../publicMeta";
import { DIFFICULTY_LEVELS, normalizeDifficultyLevel } from "../../shared/difficulty";

const FUNCTIONS_SRC = path.resolve(__dirname, "../../../src");

test("[T194-a G576 ①] 진리표 — escalation 보유 2종은 세 난이도 · 챌린지 모두 · parcel은 고급 자가만 · 그 밖은 0", (t) => {
  const yes: string[] = [];
  for (const id of Object.keys(PUBLIC_SCENARIOS).sort()) {
    for (const level of DIFFICULTY_LEVELS) {
      for (const challengeId of [undefined, "c1"]) {
        const value = resolveSessionEscalation({ scenarioId: id, difficultyLevel: level, challengeId }, PUBLIC_SCENARIOS);
        if (value) yes.push(`${id}/${level}${challengeId ? "/챌린지" : ""}`);
      }
    }
  }
  t.diagnostic(`[G576] 전이 있음 ${yes.length}칸`);
  const expected = [
    ...["messenger-child-impersonation-kakao", "messenger-subsidy-smishing-sms"].flatMap((id) =>
      DIFFICULTY_LEVELS.flatMap((level) => [`${id}/${level}`, `${id}/${level}/챌린지`]),
    ),
    "messenger-parcel-smishing-sms/advanced",
  ].sort();
  assert.deepEqual(yes.sort(), expected);
  // 값 자체 — parcel 고급은 generic 목소리(상담원 사칭 · 클론 불필요 — 지원금과 같은 꼴).
  assert.deepEqual(
    resolveScenarioEscalation(PUBLIC_SCENARIOS["messenger-parcel-smishing-sms"], "advanced"),
    { toChannel: "voice", voiceMode: "generic" },
  );
  assert.equal(resolveScenarioEscalation(undefined, "advanced"), undefined);
  assert.equal(resolveSessionEscalation({ scenarioId: "no-such", difficultyLevel: "advanced" }, PUBLIC_SCENARIOS), undefined);
});

test("[T194-a G576 ②] 난이도 원값 비교 = 서버 정규화 결과(부재 · 오타 · enum 밖 = 중급)", () => {
  const meta = PUBLIC_SCENARIOS["messenger-parcel-smishing-sms"];
  for (const raw of [undefined, null, "", "Advanced", "ADVANCED", "advanced ", "expert", 3, "beginner", "intermediate", "advanced"]) {
    assert.equal(
      resolveScenarioEscalation(meta, raw) !== undefined,
      resolveScenarioEscalation(meta, normalizeDifficultyLevel(raw)) !== undefined,
      `원값 ${JSON.stringify(raw)}`,
    );
  }
});

// ── ③ 직접 읽기 허용목록 ───────────────────────────────────────────────────────

/** 메타 전이 필드의 직접 읽기(응답 필드 `result.escalation` 같은 것은 대상이 아니다 — 수신자 이름으로 좁힌다). */
const DIRECT_META_READ = /(PUBLIC_SCENARIOS\[[^\]]*\]\??|\bscenario\??|\bmeta\??)\.(escalation|advancedEscalation)\b/g;

/** 허용목록(§83.4.1): S-6 챌린지 생성 거부(시나리오 단위 그대로) · 술어 구현 자신. */
const DIRECT_READ_ALLOWLIST: readonly string[] = ["challenge/index.ts", "scenarios/escalation.ts"];

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function directReadHits(files: Record<string, string>): string[] {
  const hits: string[] = [];
  for (const [rel, source] of Object.entries(files)) {
    for (const match of codeOnly(source).matchAll(DIRECT_META_READ)) hits.push(`${rel}: ${match[0]}`);
  }
  return hits.sort();
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (name === "__tests__") continue;
      walk(full, out);
    } else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

test("[T194-a G576 ③] 서버 소스의 메타 전이 필드 직접 읽기는 허용목록(S-6 · 술어 구현)에서만 · 역방향 샘플은 걸린다", (t) => {
  const files: Record<string, string> = {};
  for (const full of walk(FUNCTIONS_SRC)) {
    files[path.relative(FUNCTIONS_SRC, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
  }
  assert.ok(Object.keys(files).length > 50, "스캔 대상이 너무 적다 — 순회가 죽었다");
  const hits = directReadHits(files);
  const outside = hits.filter((hit) => !DIRECT_READ_ALLOWLIST.some((allowed) => hit.startsWith(`${allowed}:`)));
  // 역방향 — 옛 S-3 형태를 되살린 사본.
  const tainted = directReadHits({
    ...files,
    "roleplay/index.ts": `${files["roleplay/index.ts"]}\nconst x = Boolean(PUBLIC_SCENARIOS[session.scenarioId]?.escalation);`,
  }).filter((hit) => !DIRECT_READ_ALLOWLIST.some((allowed) => hit.startsWith(`${allowed}:`)));
  t.diagnostic(`[G576] 직접 읽기 ${hits.length}건(허용목록 내) · 허용목록 밖 ${outside.length}건 / 옛 S-3 되살린 샘플 → 밖 ${tainted.length}건`);
  assert.deepEqual(outside, [], "메타 전이 필드를 직접 읽지 말고 scenarios/escalation.ts의 술어를 쓸 것(G576)");
  assert.equal(tainted.length, 1, "역방향 — 직접 읽기 샘플이 잡혀야 한다");
  // S-6은 시나리오 단위 그대로 남아 있다(무변경 보증 — parcel 챌린지는 계속 허용).
  assert.ok(hits.some((hit) => hit.startsWith("challenge/index.ts: scenario.escalation")), "S-6 챌린지 거부는 무변경");
});

test("[T194-a G576] 서버 전이 판정 지점 4곳이 같은 술어를 부른다(S-1 · S-2 · S-3 · S-4)", () => {
  const read = (rel: string) => codeOnly(fs.readFileSync(path.join(FUNCTIONS_SRC, rel), "utf8"));
  const session = read("session/index.ts");
  assert.match(session, /resolveScenarioEscalation\(PUBLIC_SCENARIOS\[scenarioId\], resolvedDifficultyLevel\) !== undefined/, "S-1 createSession");
  assert.match(session, /if \(!resolveSessionEscalation\(session, PUBLIC_SCENARIOS\)\)/, "S-2 requestEscalation");
  assert.match(read("roleplay/index.ts"), /resolveSessionEscalation\(session, PUBLIC_SCENARIOS\) !== undefined/, "S-3 sendMessage");
  assert.match(read("report/generateReportCore.ts"), /resolveSessionStageIntent\(session\)/, "S-4 리포트 단계");
  assert.match(read("report/mockScreenTimeline.ts"), /voiceIntended: resolveSessionEscalation\(session, PUBLIC_SCENARIOS\) !== undefined/, "S-5");
});
