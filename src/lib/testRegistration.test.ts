// N-3(자체 감사, 2026-08-02) — root `npm test`는 package.json에 테스트 파일을 수동으로 나열한다
// (`node --experimental-strip-types --test <파일 나열...>`). 새 `*.test.ts`/`*.test.mjs` 파일을
// 만들고 이 목록에 추가하는 것을 잊으면, 그 테스트는 **조용히 한 번도 실행되지 않는다** — CI도
// 로컬도 실패하지 않고 그냥 넘어간다. 이 저장소가 여러 번 이름 붙인 "게이트 공회전"과 같은 부류다.
//
// ⛔ 자동 탐색(파일 목록을 없애고 글롭 하나로 대체)으로 고치지 않는다 — 이 저장소는 암묵적 동작보다
// 명시적 목록 + 드리프트 가드를 일관되게 선택해 왔다(SHARED_SAFETY_NOTICES/G-D, local-dep-guard 등).
// 이 테스트는 그 관례를 그대로 따른다: 목록은 유지하고, 목록과 실제 파일 시스템이 어긋나면 **이
// 테스트 자체가 빨간불**이 되게 한다.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function listedTestFiles(): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
    scripts: { test: string };
  };
  return pkg.scripts.test
    .split(" ")
    .filter((token) => /\.test\.(ts|mts|mjs)$/.test(token));
}

function discoveredTestFiles(): string[] {
  // src/** 와 scripts/** 아래 *.test.ts / *.test.mjs 전수. functions/는 별도 테스트 러너
  // (functions/package.json의 `npm --prefix functions test`)라 이 스캔 대상이 아니다.
  const patterns = ["src/**/*.test.ts", "src/**/*.test.mts", "scripts/**/*.test.mjs"];
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const p of fs.globSync(pattern, { cwd: REPO_ROOT })) {
      found.add(p.split(path.sep).join("/"));
    }
  }
  return [...found];
}

test("N-3: package.json test 스크립트와 실제 *.test.{ts,mjs} 파일이 정확히 일치한다", () => {
  const listed = new Set(listedTestFiles());
  const discovered = new Set(discoveredTestFiles());

  const missing = [...discovered].filter((f) => !listed.has(f)).sort();
  const stale = [...listed].filter((f) => !discovered.has(f)).sort();

  assert.deepEqual(
    missing,
    [],
    `테스트 파일이 있는데 package.json test 스크립트에 등재되지 않았다(조용히 실행 안 됨): ${missing.join(", ")}`,
  );
  assert.deepEqual(
    stale,
    [],
    `package.json test 스크립트가 존재하지 않는 파일을 가리킨다(삭제됐거나 경로가 틀림): ${stale.join(", ")}`,
  );
});

// ⭐ 역검증 — 이 가드 자체가 과탐/누락 없이 도는지: 오염된 스냅샷 목록을 함수 밖에서 만들어
// 실제로 어긋남을 잡아내는지 확인한다(오염은 이 테스트 파일 안에서만, 실제 소스는 무편집).
test("N-3 역검증: 누락·스테일이 실제로 있으면 이 가드가 실패로 잡는다", () => {
  const discovered = new Set(discoveredTestFiles());
  const withMissingEntry = new Set(discovered);
  const [sample] = discovered;
  assert.ok(sample, "비교할 실제 테스트 파일이 최소 1개는 있어야 역검증이 성립한다");
  withMissingEntry.delete(sample);

  const missingUnderPoisonedList = [...discovered].filter((f) => !withMissingEntry.has(f));
  assert.deepEqual(
    missingUnderPoisonedList,
    [sample],
    "오염 샘플(등재 목록에서 파일 1개를 뺀 상태)에서 누락 탐지가 실패했다",
  );
});
