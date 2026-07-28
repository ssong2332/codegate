// 실행 중인 Functions 에뮬레이터 신선도 검사 CLI(T115).
//
// 실행 방법(`report:axis-coverage` 관례와 동형 — 빌드 선행):
//   cd functions
//   npm run build
//   npm run emu:check              # firebase.json의 functions 포트(5001)를 본다
//   npm run emu:check -- --port 5711
//
// **무엇과 무엇을 대조하는가**(판정표 원문은 `emulatorFreshness.ts`의 `decideFreshness` 주석):
//   ① `src/**/*.ts` 최신 mtime  ↔  `lib/**/*.js` 최신 mtime           → 빌드가 낡았는가
//   ② `/backends`의 `directory`  ↔  이 트리의 `functions` 절대경로       → 아예 다른 트리인가
//   ③ `/backends`의 트리거 목록  ↔  `src/index.ts`의 재export 목록       → 함수 목록이 다른가
//   ④ 에뮬레이터 기동 시각 이전 마지막 빌드 기록의 `lib` 해시 ↔ 지금 `lib` 해시 → 코드가 낡았는가
//
// ⚠️ **이 장치가 못 잡는 것**(자기 고지 — 필요조건일 뿐 충분조건이 아니다):
//   - **검사를 안 돌리면 아무 일도 일어나지 않는다.** 기동을 막거나 재빌드를 강제하지 않는다
//     (강제하면 다음 사람이 끈다 — `docs/Architecture.md` §24.4가 같은 논리로 기각한 축).
//   - **빌드 기록이 없는 경로**로 `lib`가 바뀌면(예: `npx tsc` 직접 실행, OS 임시 디렉터리 청소)
//     판정은 `STALE-CODE`가 아니라 `UNKNOWN`으로 떨어진다. *"괜찮다"* 로는 절대 떨어지지 않는다.
//   - **검사 시점 이후**에 누군가 `lib`를 바꾸면 그 결과는 이 출력에 없다. 판정은 스냅숏이다.
//   - 프로세스 기동 시각 조회는 Windows(`netstat`+CIM)와 POSIX(`lsof`+`ps`)만 지원한다.
//     실패하면 `UNKNOWN`이다.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  decideFreshness,
  parseIndexExports,
  parseListeningPid,
  SEVERITY,
  type FreshnessInput,
  type LoadedBackend,
} from "./emulatorFreshness";
import { computeLibHash, latestMtimeMs, readBuildHistory } from "./libBuildHistory";

const DEFAULT_HOST = "127.0.0.1";
const FETCH_TIMEOUT_MS = 4000;

function readArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return null;
  return process.argv[index + 1];
}

/** `firebase.json`이 정한 functions 에뮬레이터 포트. 못 읽으면 Firebase 기본값 5001. */
function configuredPort(repoRoot: string): number {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, "firebase.json"), "utf8");
    const parsed = JSON.parse(raw) as { emulators?: { functions?: { port?: number } } };
    const port = parsed.emulators?.functions?.port;
    if (typeof port === "number") return port;
  } catch {
    // 무시 — 아래 기본값을 쓴다.
  }
  return 5001;
}

async function fetchBackends(host: string, port: number): Promise<LoadedBackend[] | null> {
  const response = await fetch(`http://${host}:${port}/backends`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    backends?: { directory?: string; functionTriggers?: { entryPoint?: string }[] }[];
  };
  if (!Array.isArray(body.backends)) return null;
  return body.backends.map((backend) => ({
    directory: typeof backend.directory === "string" ? backend.directory : "",
    triggerNames: (backend.functionTriggers ?? [])
      .map((trigger) => trigger.entryPoint)
      .filter((name): name is string => typeof name === "string"),
  }));
}

function listeningPid(port: number): number | null {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("netstat", ["-ano"], { encoding: "utf8", timeout: 15000 });
      return parseListeningPid(out, port);
    }
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      timeout: 15000,
    });
    const pid = Number(out.trim().split("\n")[0]);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function processStartedAt(pid: number): string | null {
  try {
    if (process.platform === "win32") {
      const script =
        `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}')` +
        `.CreationDate.ToUniversalTime().ToString('o')`;
      const out = execFileSync("powershell", ["-NoProfile", "-Command", script], {
        encoding: "utf8",
        timeout: 20000,
      }).trim();
      return out && !Number.isNaN(Date.parse(out)) ? new Date(out).toISOString() : null;
    }
    const out = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 15000,
    }).trim();
    const ms = Date.parse(out);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const functionsDir = path.resolve(__dirname, "../..");
  const repoRoot = path.resolve(functionsDir, "..");
  const host = readArg("--host") ?? DEFAULT_HOST;
  const port = Number(readArg("--port") ?? configuredPort(repoRoot));

  let reachable = false;
  let backends: LoadedBackend[] | null = null;
  try {
    backends = await fetchBackends(host, port);
    reachable = true;
  } catch {
    reachable = false;
  }

  const pid = reachable ? listeningPid(port) : null;
  const startedAt = pid === null ? null : processStartedAt(pid);

  const indexSource = fs.readFileSync(path.join(functionsDir, "src", "index.ts"), "utf8");
  const input: FreshnessInput = {
    treeFunctionsDir: functionsDir,
    emulatorReachable: reachable,
    backends,
    processStartedAt: startedAt,
    currentLibHash: computeLibHash(functionsDir),
    buildHistory: readBuildHistory(functionsDir),
    declaredExports: parseIndexExports(indexSource),
    latestSrcMtimeMs: latestMtimeMs(path.join(functionsDir, "src"), ".ts"),
    latestLibMtimeMs: latestMtimeMs(path.join(functionsDir, "lib"), ".js"),
  };

  const result = decideFreshness(input);

  console.log("# Functions 에뮬레이터 신선도 (T115)");
  console.log("");
  console.log("| 항목 | 값 |");
  console.log("|---|---|");
  console.log(`| 검사한 트리 | \`${input.treeFunctionsDir}\` |`);
  console.log(`| 대상 | ${host}:${port} |`);
  console.log(`| 포트 응답 | ${reachable ? "예" : "아니오"} |`);
  console.log(
    `| 로드된 디렉터리 | ${
      backends === null ? "(읽지 못함)" : backends.map((b) => `\`${b.directory}\``).join(", ") || "(없음)"
    } |`,
  );
  console.log(
    `| 로드된 함수 수 | ${
      backends === null ? "(읽지 못함)" : String(backends.reduce((n, b) => n + b.triggerNames.length, 0))
    } |`,
  );
  console.log(`| 선언된 함수 수 (src/index.ts) | ${input.declaredExports.length} |`);
  console.log(`| 에뮬레이터 PID / 기동 시각 | ${pid ?? "(모름)"} / ${startedAt ?? "(모름)"} |`);
  console.log(`| 현재 lib 해시 | ${input.currentLibHash?.slice(0, 12) ?? "(lib 없음)"} |`);
  console.log(`| 빌드 기록 건수 | ${input.buildHistory.length} |`);
  console.log("");
  console.log(`## 판정: ${result.verdict}`);
  if (result.findings.length === 0) {
    console.log("- (지적 사항 없음)");
  }
  for (const finding of result.findings) {
    console.log(`- **${finding.code}** — ${finding.detail}`);
  }

  process.exitCode = SEVERITY[result.verdict] >= SEVERITY.UNKNOWN ? 1 : 0;
}

void main();
