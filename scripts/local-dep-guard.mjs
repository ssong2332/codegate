#!/usr/bin/env node
/**
 * (T130) `package.json` · `package-lock.json`에 섞여 들어간 **로컬 경로 의존성**
 * (`file:` / `link:` / `portal:`) 검출 — 설계 근거: docs/Architecture.md §36.4.
 *
 * ⛔ 이것은 **트립와이어다. 오염을 막지 않는다 — 알린다.**
 *    `npm --prefix functions install`은 여전히 매니페스트를 더럽히고, 되돌리는 것은 사람 손이다.
 *
 * ⛔ **자동 복구를 하지 않는다**(§36.0 4 / G164). 되돌리기는 사람의 판단이다 —
 *    훅이 조용히 되돌리면 "의도한 `npm i <로컬패키지>`"를 삼켜 정확히 같은 실패 양식
 *    (조용한 오염)을 반대 방향으로 재생산한다.
 *
 * ⛔ **패키지 이름을 검출 조건에 넣지 않는다**(§36.4 / G166).
 *    `"name": "fraud-vaccine-web"` 은 오탐 대상이 아니라 **정상 필드**다. 값 위치 매칭이라
 *    자동으로 통과한다 — 이름으로 걸면 정상 커밋을 막는다.
 *
 * ── 두 호출자, 하나의 판정 로직 ──────────────────────────────────────────────
 *  --staged    : `.githooks/pre-commit`이 부른다. **스테이징된 내용**(`git diff --cached`)만 본다.
 *                워크트리 파일을 보면 스테이징하지 않은 오염까지 커밋을 막아 무관한 작업이
 *                차단된다(과차단, §36.4). 오염 발견 시 **exit 1로 커밋을 거부**한다.
 *  --worktree  : `postinstall`이 부른다. **작업 트리의 현재 파일**을 본다 —
 *                install 직후에는 아직 스테이징 전이라 `git diff --cached`가 비어 있다.
 *                ⛔ **언제나 exit 0**. 여기서 터져 install을 실패시키면 다음 사람이 이 단계를
 *                지운다(그러면 장치 전체가 죽는다) — functions/src/devtools/recordLibBuild.ts와 같은 원칙.
 *
 * ⚠️ 자기 고지 — 이 장치가 **못 막는 것**:
 *   1. `--staged`(pre-commit 훅)는 `git commit --no-verify`로 우회되고,
 *      `git config core.hooksPath .githooks` 를 하지 않은 clone에서는 아예 존재하지 않는다
 *      (T100의 잔여 한계를 그대로 물려받는다 — docs/GitWorkflow.md).
 *   2. `--worktree`(postinstall)는 **`npm install --ignore-scripts`로 건너뛰어진다**
 *      (docs/Architecture.md §20.0 (1)이 경고한 바로 그 자리다).
 *   ⇒ 두 경로가 서로의 구멍을 덮으라고 **둘 다** 두는 것이지, 어느 하나도 강제가 아니다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WATCHED_BASENAMES = new Set(["package.json", "package-lock.json"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "lib", "out", "dist", ".firebase"]);

const RED = "[31m";
const YELLOW = "[33m";
const RESET = "[0m";

/**
 * 검출 규칙 (§36.4 표 — ⛔ 임의로 넓히지 말 것).
 *  (1) **값 위치**에 `file:` / `link:` / `portal:` 로 시작하는 지정자.
 *      `"fraud-vaccine-web": "file:.."` 은 걸리고 `"name": "fraud-vaccine-web"` 은 걸리지 않는다.
 *  (2) 락파일의 `packages` 키가 **상대 경로**인 것(`".."` 블록).
 *      정상 키는 `""`(자기 자신)와 `node_modules/...` 뿐이다.
 */
const RULES = [
  {
    id: "local-path-specifier",
    pattern: /:\s*"(?:file|link|portal):/,
    describe: "로컬 경로 의존성 지정자(file:/link:/portal:)",
  },
  {
    id: "relative-packages-key",
    pattern: /^\s*"\.{1,2}(?:[/\\][^"]*)?"\s*:\s*\{/,
    describe: "락파일의 상대 경로 packages 키",
  },
];

/** 한 줄에 대한 판정 — **두 호출자가 공유하는 유일한 판정 지점**이다. */
function matchRule(line) {
  return RULES.find((rule) => rule.pattern.test(line)) ?? null;
}

function runGit(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function repoRoot(startDir) {
  try {
    return runGit(["rev-parse", "--show-toplevel"], startDir).trim();
  } catch {
    return null;
  }
}

/** `--staged` — 스테이징된 추가 줄(`+`)만 훑는다. 파일:줄 번호는 diff 헌크 헤더에서 계산한다. */
function scanStaged(root) {
  const names = runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR"], root)
    .split("\n")
    .map((n) => n.trim())
    .filter((n) => n.length > 0 && WATCHED_BASENAMES.has(basename(n)));

  const findings = [];
  for (const name of names) {
    const diff = runGit(["diff", "--cached", "--unified=0", "--no-color", "--", name], root);
    let lineNo = 0;
    for (const raw of diff.split("\n")) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (hunk) {
        lineNo = Number(hunk[1]);
        continue;
      }
      if (!raw.startsWith("+") || raw.startsWith("+++")) continue;
      const content = raw.slice(1);
      const rule = matchRule(content);
      if (rule) findings.push({ file: name, line: lineNo, text: content.trim(), rule });
      lineNo += 1;
    }
  }
  return findings;
}

/** 작업 트리에서 감시 대상 매니페스트를 찾는다(경로 하드코딩 금지 — §36.4). */
function collectManifests(root) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (WATCHED_BASENAMES.has(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

/** `--worktree` — 현재 파일 내용 전체를 훑는다(아직 스테이징 전이라 diff가 비어 있다). */
function scanWorktree(root) {
  const findings = [];
  for (const file of collectManifests(root)) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    text.split("\n").forEach((content, index) => {
      const rule = matchRule(content);
      if (rule) {
        findings.push({
          file: relative(root, file).split(sep).join("/"),
          line: index + 1,
          text: content.trim(),
          rule,
        });
      }
    });
  }
  return findings;
}

/**
 * 실패/경고 메시지 — **처방 4종을 반드시 담는다**(§36.4 / G167).
 * 문구 없는 `exit 1`은 반려 사유다: 다음 사람이 읽고 무엇을 할지 알아야 한다.
 */
function report(findings, { blocking }) {
  const head = blocking
    ? "✖ 매니페스트에 로컬 경로 의존성이 섞여 있습니다 — 커밋을 거부합니다."
    : "⚠ 매니페스트에 로컬 경로 의존성이 섞여 있습니다 — install은 계속합니다.";
  const out = blocking ? process.stderr : process.stdout;

  out.write(`\n${blocking ? RED : YELLOW}${head}${RESET}\n\n`);
  for (const f of findings) {
    out.write(`    ${f.file}:${f.line}  ${f.text}\n`);
    out.write(`      └ ${f.rule.describe}\n`);
  }
  out.write("\n  (ⓐ 위가 걸린 위치입니다.)\n");
  out.write("  ⓑ 이것은 `npm --prefix <dir> install` 의 부작용일 가능성이 높습니다 —\n");
  out.write("     당신이 의도한 변경이 아닐 수 있습니다 (docs/Architecture.md §36).\n");
  out.write("  ⓒ 되돌리려면(⛔ 이 장치는 대신 실행하지 않습니다 — 당신이 판단하십시오):\n");
  out.write("       git checkout -- package.json package-lock.json functions/package.json functions/package-lock.json\n");
  out.write("  ⓓ ⛔ 의도한 로컬 의존성이라면 이 검사(scripts/local-dep-guard.mjs)를 고쳐야 합니다 —\n");
  out.write("     `--no-verify` 로 넘기지 마십시오.\n\n");
}

function main() {
  const mode = process.argv[2];
  const here = dirname(fileURLToPath(import.meta.url));

  if (mode === "--worktree") {
    // ⛔ 어떤 경우에도 install을 실패시키지 않는다. 전 구간 try/catch + exit 0.
    try {
      const root = repoRoot(here) ?? resolve(here, "..");
      if (existsSync(root)) {
        const findings = scanWorktree(root);
        if (findings.length > 0) report(findings, { blocking: false });
      }
    } catch (error) {
      console.log(`[local-dep-guard] 검사를 수행하지 못했습니다(무시하고 계속합니다): ${String(error)}`);
    }
    process.exit(0);
  }

  if (mode === "--staged") {
    let findings;
    try {
      const root = repoRoot(process.cwd());
      if (root === null) {
        // 검사를 "통과"시킨 것이 아니라 **수행하지 못했다** — 조용히 넘기지 않는다.
        process.stderr.write("[local-dep-guard] git 저장소를 찾지 못해 검사를 수행하지 못했습니다.\n");
        process.exit(0);
      }
      findings = scanStaged(root);
    } catch (error) {
      process.stderr.write(`[local-dep-guard] 검사를 수행하지 못했습니다: ${String(error)}\n`);
      process.exit(0);
    }
    if (findings.length === 0) process.exit(0);
    report(findings, { blocking: true });
    process.exit(1);
  }

  process.stderr.write("usage: node scripts/local-dep-guard.mjs (--staged | --worktree)\n");
  process.exit(2);
}

// 직접 실행일 때만 동작한다 — 테스트가 import해도 부작용이 없어야 한다.
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();

export { matchRule, RULES, scanStaged, scanWorktree };
