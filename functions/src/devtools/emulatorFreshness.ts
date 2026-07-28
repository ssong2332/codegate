// 실행 중인 Functions 에뮬레이터의 **신선도 판정 로직**(T115).
//
// **왜 필요한가**: 에뮬레이터는 기동 시 1회만 `lib`를 로드한다(`package.json:9` `serve`는
// `build` 뒤에 `emulators:start`를 부를 뿐 감시 프로세스를 함께 띄우지 않는다). 따라서 기동 뒤
// `lib`가 바뀌어도 **아무 신호 없이** 옛 코드가 계속 응답한다. 포트는 전부 응답하므로
// *"떠 있다"* 는 알 수 있지만 *"무엇이 떠 있는가"* 는 알 수 없다.
//
// ⚠️ **이 모듈은 제품 런타임이 아니다.** `src/index.ts`가 import하지 않으므로 배포되더라도
// 어떤 함수도 이 코드를 실행하지 않는다(`scenarios/seed.ts`·`scenarios/axisCoverageReport.ts`와
// 같은 관례 — 소스는 `src`, 실행은 `lib`).
//
// ⚠️ **필요조건일 뿐 충분조건이 아니다**: 이 판정은 *"사람이 검사를 돌렸을 때"* 만 나온다.
// 검사를 돌리지 않고 라이브 검증을 시작하는 경로는 그대로 남아 있다(`emulatorFreshnessCli.ts`
// 상단의 "이 장치가 못 잡는 것" 목록 참조).

import { createHash } from "node:crypto";

/** 판정 코드. 심각도 순서는 `SEVERITY`가 정본이다. */
export type FreshnessCode =
  | "FRESH"
  | "NOT-RUNNING"
  | "UNKNOWN"
  | "STALE-BUILD"
  | "STALE-EXPORTS"
  | "STALE-CODE"
  | "OTHER-TREE";

/**
 * 심각도. **큰 값이 나쁘다.** `UNKNOWN`이 `NOT-RUNNING`보다 나쁜 이유: 안 떠 있으면 낡은 것에
 * 물릴 수 없지만, *모른다* 는 낡은 것에 물린 채로 검증을 시작할 수 있다는 뜻이다.
 */
export const SEVERITY: Readonly<Record<FreshnessCode, number>> = {
  FRESH: 0,
  "NOT-RUNNING": 10,
  UNKNOWN: 20,
  "STALE-BUILD": 30,
  "STALE-EXPORTS": 40,
  "STALE-CODE": 40,
  "OTHER-TREE": 40,
};

/** `/backends`가 알려준, 실제로 로드된 백엔드 1개. */
export interface LoadedBackend {
  /** 에뮬레이터가 실제로 읽은 functions 디렉터리 절대경로. */
  readonly directory: string;
  /** 실제로 로드된 트리거의 entryPoint 목록. */
  readonly triggerNames: readonly string[];
}

/** `lib` 빌드 1회의 기록(빌드 스크립트가 남긴다). */
export interface BuildRecord {
  /** ISO-8601 UTC. */
  readonly at: string;
  /** 그 시점 `lib` 전체 내용 해시. */
  readonly hash: string;
}

export interface FreshnessInput {
  /** 검사를 실행한 트리의 functions 디렉터리(정규화 전 원문). */
  readonly treeFunctionsDir: string;
  /** functions 에뮬레이터 포트가 응답했는가. */
  readonly emulatorReachable: boolean;
  /** `/backends` 파싱 결과. 응답은 했지만 읽지 못했으면 `null`. */
  readonly backends: readonly LoadedBackend[] | null;
  /** functions 포트를 잡고 있는 프로세스의 기동 시각(ISO-8601). 못 구했으면 `null`. */
  readonly processStartedAt: string | null;
  /** 지금 디스크의 `lib` 내용 해시. `lib`가 없으면 `null`. */
  readonly currentLibHash: string | null;
  /** 빌드 기록(정렬 여부 무관 — 내부에서 정렬한다). */
  readonly buildHistory: readonly BuildRecord[];
  /** `src/index.ts`에서 정적으로 뽑은 export 이름. */
  readonly declaredExports: readonly string[];
  /** `src/**` 최신 mtime(epoch ms). 없으면 `null`. */
  readonly latestSrcMtimeMs: number | null;
  /** `lib/**` 최신 mtime(epoch ms). 없으면 `null`. */
  readonly latestLibMtimeMs: number | null;
}

export interface Finding {
  readonly code: FreshnessCode;
  readonly detail: string;
}

export interface FreshnessResult {
  readonly verdict: FreshnessCode;
  readonly findings: readonly Finding[];
}

/** Windows 경로 대소문자·구분자·후행 슬래시를 흡수한 비교용 정규화. */
export function normalizeDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * `lib` 파일별 해시 목록을 하나의 해시로 접는다. 경로 순서에 의존하지 않는다.
 * (파일 읽기는 호출부가 한다 — 이 함수는 순수해야 테스트가 된다.)
 */
export function foldLibHash(files: readonly { relPath: string; sha256: string }[]): string {
  const lines = [...files]
    .map((f) => `${f.relPath.replace(/\\/g, "/")}:${f.sha256}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(lines).digest("hex");
}

/**
 * `netstat -ano` 출력에서 해당 포트를 LISTENING으로 잡고 있는 PID를 뽑는다.
 * IPv4/IPv6 줄이 섞여 있으므로 **포트가 정확히 일치하는 줄만** 본다(`:5001`이 `:50011`에
 * 걸리지 않게 하는 것이 이 정규식의 요점이다).
 */
export function parseListeningPid(netstatOutput: string, port: number): number | null {
  const re = /^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(netstatOutput)) !== null) {
    if (Number(m[2]) !== port) continue;
    const pid = Number(m[3]);
    if (Number.isFinite(pid) && pid > 0) return pid;
  }
  return null;
}

/**
 * `src/index.ts`의 재export 목록을 정적으로 뽑는다. 이 파일은 관례상 `export { ... } from "..."`
 * 만 쓰므로(파일 상단 주석: *"이 파일은 재export만 한다"*) 그 형태만 인식한다.
 * `export { a as b } from "..."` 는 **b**(외부에 보이는 이름)를 취한다.
 */
export function parseIndexExports(indexSource: string): string[] {
  const names: string[] = [];
  const re = /export\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexSource)) !== null) {
    for (const raw of m[1].split(",")) {
      const token = raw.trim();
      if (!token) continue;
      const asMatch = /\sas\s+([A-Za-z0-9_$]+)$/.exec(token);
      const name = asMatch ? asMatch[1] : token;
      if (/^[A-Za-z0-9_$]+$/.test(name)) names.push(name);
    }
  }
  return names;
}

/** 선언 집합과 실제 로드 집합의 차이. 양방향으로 본다. */
export function diffTriggerNames(
  declared: readonly string[],
  loaded: readonly string[],
): { missing: string[]; extra: string[] } {
  const loadedSet = new Set(loaded);
  const declaredSet = new Set(declared);
  return {
    missing: [...declaredSet].filter((n) => !loadedSet.has(n)).sort(),
    extra: [...loadedSet].filter((n) => !declaredSet.has(n)).sort(),
  };
}

/**
 * 에뮬레이터 기동 시각 **이전(또는 같은 시각)** 의 마지막 빌드 기록 = 그 에뮬레이터가 로드한 `lib`.
 * 기록이 하나도 그 시각보다 앞서지 않으면 `null`(= 모른다).
 */
export function pickLoadedBuildRecord(
  history: readonly BuildRecord[],
  processStartedAt: string,
): BuildRecord | null {
  const startedMs = Date.parse(processStartedAt);
  if (Number.isNaN(startedMs)) return null;
  const candidates = history
    .filter((r) => {
      const ms = Date.parse(r.at);
      return !Number.isNaN(ms) && ms <= startedMs;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

function worst(findings: readonly Finding[]): FreshnessCode | null {
  let picked: FreshnessCode | null = null;
  for (const f of findings) {
    if (picked === null || SEVERITY[f.code] > SEVERITY[picked]) picked = f.code;
  }
  return picked;
}

/**
 * 판정표(정본). 위에서부터 순서대로 적용하고 **해당하는 findings를 전부 모은다**.
 * 최종 verdict는 findings 중 가장 심각한 것이며, findings가 없으면
 * 에뮬레이터가 응답했으면 `FRESH`, 아니면 `NOT-RUNNING`이다.
 *
 * | # | 조건 | 판정 |
 * |---|---|---|
 * | 1 | `lib`가 없다 | UNKNOWN |
 * | 2 | `src` 최신 mtime > `lib` 최신 mtime | STALE-BUILD |
 * | 3 | functions 포트 무응답 | NOT-RUNNING (이하 검사 생략) |
 * | 4 | `/backends`를 읽지 못함 | UNKNOWN (이하 생략) |
 * | 5 | 로드된 디렉터리에 이 트리가 없음 | OTHER-TREE (이하 생략 — 대조 자체가 무의미) |
 * | 6 | 선언 export 집합 ≠ 로드된 트리거 집합 | STALE-EXPORTS |
 * | 7 | 프로세스 기동 시각을 못 구함 | UNKNOWN |
 * | 8 | 기동 시점의 빌드 기록이 없음 | UNKNOWN |
 * | 9 | 기동 시점 해시 ≠ 현재 `lib` 해시 | STALE-CODE |
 */
export function decideFreshness(input: FreshnessInput): FreshnessResult {
  const findings: Finding[] = [];

  if (input.latestLibMtimeMs === null || input.currentLibHash === null) {
    findings.push({ code: "UNKNOWN", detail: "lib이 없다 — 빌드를 먼저 돌려야 대조할 것이 생긴다." });
  } else if (input.latestSrcMtimeMs !== null && input.latestSrcMtimeMs > input.latestLibMtimeMs) {
    findings.push({
      code: "STALE-BUILD",
      detail:
        `src가 lib보다 새롭다(src ${new Date(input.latestSrcMtimeMs).toISOString()} > ` +
        `lib ${new Date(input.latestLibMtimeMs).toISOString()}) — 에뮬레이터 이전에 빌드가 낡았다.`,
    });
  }

  if (!input.emulatorReachable) {
    findings.push({ code: "NOT-RUNNING", detail: "functions 에뮬레이터 포트가 응답하지 않는다." });
    return { verdict: worst(findings) ?? "NOT-RUNNING", findings };
  }

  if (input.backends === null) {
    findings.push({
      code: "UNKNOWN",
      detail: "포트는 응답하지만 /backends를 읽지 못했다 — 무엇이 떠 있는지 확인할 수 없다.",
    });
    return { verdict: worst(findings) ?? "UNKNOWN", findings };
  }

  const target = normalizeDir(input.treeFunctionsDir);
  const matched = input.backends.find((b) => normalizeDir(b.directory) === target) ?? null;
  if (matched === null) {
    findings.push({
      code: "OTHER-TREE",
      detail:
        `이 에뮬레이터는 다른 트리에서 기동됐다 — 로드된 디렉터리: ` +
        `${input.backends.map((b) => b.directory).join(", ") || "(없음)"} / 이 트리: ` +
        `${input.treeFunctionsDir}. 여기서 무엇을 빌드해도 반영될 수 없다.`,
    });
    return { verdict: worst(findings) ?? "OTHER-TREE", findings };
  }

  const nameDiff = diffTriggerNames(input.declaredExports, matched.triggerNames);
  if (nameDiff.missing.length > 0 || nameDiff.extra.length > 0) {
    findings.push({
      code: "STALE-EXPORTS",
      detail:
        `함수 목록이 다르다 — 선언됐는데 안 떠 있음: [${nameDiff.missing.join(", ")}] / ` +
        `떠 있는데 선언에 없음: [${nameDiff.extra.join(", ")}].`,
    });
  }

  if (input.currentLibHash === null) {
    return { verdict: worst(findings) ?? "UNKNOWN", findings };
  }
  if (input.processStartedAt === null) {
    findings.push({
      code: "UNKNOWN",
      detail: "에뮬레이터 프로세스 기동 시각을 구하지 못했다 — 코드 신선도를 판정할 수 없다.",
    });
    return { verdict: worst(findings) ?? "UNKNOWN", findings };
  }

  const loaded = pickLoadedBuildRecord(input.buildHistory, input.processStartedAt);
  if (loaded === null) {
    findings.push({
      code: "UNKNOWN",
      detail:
        `에뮬레이터 기동(${input.processStartedAt}) 시점의 빌드 기록이 없다 — ` +
        `그때 어떤 lib이 로드됐는지 알 수 없다(기록 ${input.buildHistory.length}건).`,
    });
    return { verdict: worst(findings) ?? "UNKNOWN", findings };
  }

  if (loaded.hash !== input.currentLibHash) {
    findings.push({
      code: "STALE-CODE",
      detail:
        `에뮬레이터가 낡은 lib을 물고 있다 — 기동(${input.processStartedAt}) 시점 빌드 ` +
        `${loaded.at} hash ${loaded.hash.slice(0, 12)} ≠ 현재 lib hash ` +
        `${input.currentLibHash.slice(0, 12)}. 재기동해야 반영된다.`,
    });
  }

  return { verdict: worst(findings) ?? "FRESH", findings };
}
