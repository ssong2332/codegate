// `lib` 빌드 기록 저장소(T115) — "에뮬레이터가 기동한 시점에 어떤 lib이 있었는가"를 나중에
// 답하기 위한 최소 기록.
//
// **왜 mtime만으로는 안 되는가**: `npm --prefix functions test`가 `lib`를 통째로 지웠다 다시 만든다
// (`package.json:15`). 그래서 mtime만 보면 **내용이 완전히 같아도** 매번 "낡았다"가 뜨고,
// 그 경고는 곧 무시된다. 내용 해시를 기록해 두면 *내용이 실제로 달라진 경우*에만 경고가 뜬다.
//
// **왜 저장소 밖(OS 임시 디렉터리)인가**: (a) `lib` 안에 두면 `clean-lib.mjs`가 매번 지운다,
// (b) `functions/` 안에 두면 `firebase.json`의 배포 ignore 목록을 건드려야 한다(배포 경로 변경).
// 임시 디렉터리는 둘 다 피하면서 프로세스 수명을 넘어 남는다. **임시 디렉터리가 비워지면
// 기록이 사라지고 판정은 `UNKNOWN`으로 떨어진다 — 그것이 의도된 실패 방향이다.**

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { foldLibHash, type BuildRecord } from "./emulatorFreshness";

const HISTORY_DIR_NAME = "codegate-lib-build-history";
/** 기록 상한 — 무한히 자라지 않게 한다. */
const MAX_RECORDS = 200;

/** 트리별로 파일을 나눈다(워크트리가 여러 개 동시에 돈다). */
export function historyFilePath(functionsDir: string): string {
  const key = createHash("sha1").update(path.resolve(functionsDir).toLowerCase()).digest("hex");
  return path.join(os.tmpdir(), HISTORY_DIR_NAME, `${key.slice(0, 16)}.jsonl`);
}

/** `lib` 아래 모든 `.js`를 훑어 내용 해시를 만든다. `lib`가 없으면 `null`. */
export function computeLibHash(functionsDir: string): string | null {
  const libDir = path.join(functionsDir, "lib");
  if (!fs.existsSync(libDir)) return null;
  const files: { relPath: string; sha256: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        files.push({
          relPath: path.relative(libDir, full),
          sha256: createHash("sha256").update(fs.readFileSync(full)).digest("hex"),
        });
      }
    }
  };
  walk(libDir);
  if (files.length === 0) return null;
  return foldLibHash(files);
}

/** 디렉터리 트리에서 가장 최근 mtime(ms). 대상이 없으면 `null`. */
export function latestMtimeMs(dir: string, ext: string): number | null {
  if (!fs.existsSync(dir)) return null;
  let latest: number | null = null;
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        const ms = fs.statSync(full).mtimeMs;
        if (latest === null || ms > latest) latest = ms;
      }
    }
  };
  walk(dir);
  return latest;
}

export function readBuildHistory(functionsDir: string): BuildRecord[] {
  const file = historyFilePath(functionsDir);
  if (!fs.existsSync(file)) return [];
  const records: BuildRecord[] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<BuildRecord>;
      if (typeof parsed.at === "string" && typeof parsed.hash === "string") {
        records.push({ at: parsed.at, hash: parsed.hash });
      }
    } catch {
      // 깨진 줄은 버린다 — 기록이 없으면 판정이 UNKNOWN으로 떨어질 뿐이다.
    }
  }
  return records;
}

/** 현재 `lib` 해시를 기록에 덧붙인다. 이미 마지막 기록과 같은 해시라도 시각 갱신을 위해 남긴다. */
export function appendBuildRecord(functionsDir: string): BuildRecord | null {
  const hash = computeLibHash(functionsDir);
  if (hash === null) return null;
  const record: BuildRecord = { at: new Date().toISOString(), hash };
  const file = historyFilePath(functionsDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const kept = [...readBuildHistory(functionsDir), record].slice(-MAX_RECORDS);
  fs.writeFileSync(file, kept.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  return record;
}
