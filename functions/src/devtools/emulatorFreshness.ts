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
 * 해시 대상에서 **제외**하는 `lib` 하위 경로. 에뮬레이터가 로드하지도 서빙하지도 않는 것들이다.
 *
 * **왜 제외해야 하는가(reviewer Major, 2026-07-28)**: 이것들을 세면 **테스트 파일 하나만 고쳐도**
 * 해시가 바뀌어 `STALE-CODE`가 뜬다 — 에뮬레이터의 실제 동작은 한 글자도 안 바뀌었는데도.
 * 그 오탐은 이 파일이 mtime을 버리고 내용 해시를 고른 이유(*"상시 경고가 뜨면 다음 사람이 끈다"*)를
 * 정면으로 깎는다.
 *
 * - `__tests__/**` — `node --test`만 읽는다. `src/index.ts` export 그래프에서 도달 불가.
 * - `devtools/**` — 이 검사 도구 자신. `emulatorFreshness.ts` 머리말대로 어떤 배포 함수도 로드하지
 *   않으며, 포함하면 도구를 고칠 때마다 자기 자신을 낡았다고 신고한다.
 *
 * ⚠️ **왜 `src/index.ts` export 그래프 정밀 추적을 쓰지 않았는가**: 컴파일된 `lib`의 `require`
 * 그래프를 정적으로 따라가려면 조건부 `require`·재export 체인·`firebase-admin` 부작용 import까지
 * 다뤄야 하고, 그래프 해석이 어긋나는 순간 **진짜 변경을 놓치는(= 반대 방향의) 고장**이 된다.
 * 이 도구는 정확도보다 **안 꺼지는 것**과 **진짜 변경을 놓치지 않는 것**이 우선이므로, 도달 불가가
 * 명백한 두 갈래만 이름으로 제외하는 보수적 최소안을 골랐다. 제외 목록에 없는 것은 전부 센다.
 */
export const LIB_HASH_EXCLUDED_PREFIXES = ["devtools/"] as const;

/**
 * 그 `lib` 파일이 **에뮬레이터가 로드하는 표면**에 속하는가. 경로는 `lib` 기준 상대경로다
 * (구분자는 `/`·`\` 어느 쪽이어도 된다).
 */
export function isEmulatorLoadedLibFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  if (!normalized.endsWith(".js")) return false;
  if (normalized.split("/").includes("__tests__")) return false;
  return !LIB_HASH_EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
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

/**
 * 에뮬레이터 기동 **이후**에 기록된 빌드 중 **현재 `lib` 해시와 내용이 다른** 것들(오래된 것 → 최신).
 *
 * **왜 필요한가(2026-07-28 실측)**: 코드를 실제로 붙들고 있는 것은 부모 프로세스가 아니라
 * `functionsEmulatorRuntime` **워커**이고, 워커는 **첫 요청 때** 뜬다. 그래서
 * ⓐ 기동 → ⓑ 빌드(버전 X) → ⓒ 첫 호출(워커가 **X** 를 물고 상주) → ⓓ 되돌려 빌드(해시가 기동
 * 시점과 같아짐) 순서가 되면, *기동 시점 해시 == 현재 해시* 인데도 **워커는 X를 계속 서빙한다.**
 * 증거: 부모 PID 56888(기동 `04:49:35.435Z`, hash `b32587476ebf`) / 워커 PID 65372
 * (spawn `04:51:52.859Z`, 직전 빌드 `04:51:52.687Z` hash `801e97fc1cd1`) 상태에서 호출 응답이
 * 중간 빌드의 문자열이었다.
 *
 * ⇒ 이 경우 `FRESH`가 아니라 **`UNKNOWN`** 을 낸다. *"거짓 `FRESH`로는 가지 않는다"* 가 이 도구의
 * 핵심 성질이고, 이 한 갈래가 그 성질을 깨고 있었다.
 *
 * ⚠️ **더 정밀한 대안은 따로 있다**: 살아 있는 워커들의 spawn 시각을 OS로 조회해 기준선을
 * *부모 기동 시각 ∪ 워커 spawn 시각* 으로 넓히면 `UNKNOWN` 대신 정확한 `FRESH`/`STALE-CODE`를 낼 수
 * 있다. 채택하지 않은 이유는 그 경로가 **자동 테스트가 없는 통합 표면**(`netstat`·CIM 조회)을 키우기
 * 때문이다. 이 함수는 이미 가진 빌드 기록만 쓰므로 순수 함수 층에서 전부 테스트된다. 정밀도가 필요해지면
 * 그때 대안으로 갈아타라.
 *
 * ⚠️ **노이즈 성질**: 조건이 *"내용이 **다른** 빌드"* 이므로, 편집 없이 `build`·`test`를 반복해서
 * 돌리는 것만으로는 해시가 같아 **뜨지 않는다**(`isEmulatorLoadedLibFile`의 범위 축소가 그것을
 * 보장한다). 실제로 제품 코드를 고쳤다가 되돌린 경우에만 뜬다.
 */
export function findIntermediateBuilds(
  history: readonly BuildRecord[],
  processStartedAt: string,
  currentLibHash: string,
): BuildRecord[] {
  const startedMs = Date.parse(processStartedAt);
  if (Number.isNaN(startedMs)) return [];
  return history
    .filter((r) => {
      const ms = Date.parse(r.at);
      return !Number.isNaN(ms) && ms > startedMs && r.hash !== currentLibHash;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
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
 * | 10 | (9가 아닐 때) 기동 이후 **내용이 다른** 빌드가 있었음 | UNKNOWN (워커가 어느 쪽을 물었는지 모른다) |
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
  } else {
    // 기동 시점 해시와 현재 해시가 **같아도** 안심할 수 없다 — 그 사이에 내용이 다른 빌드가 있었다면
    // 워커가 그 중간 빌드를 붙들고 있을 수 있다(아래 함수 주석의 실측 근거).
    const intermediates = findIntermediateBuilds(
      input.buildHistory,
      input.processStartedAt,
      input.currentLibHash,
    );
    if (intermediates.length > 0) {
      const newest = intermediates[intermediates.length - 1];
      findings.push({
        code: "UNKNOWN",
        detail:
          `기동(${input.processStartedAt}) 이후 **내용이 다른** 빌드가 ${intermediates.length}건 ` +
          `있었다(가장 최근 ${newest.at} hash ${newest.hash.slice(0, 12)}, 현재 lib hash ` +
          `${input.currentLibHash.slice(0, 12)}). 코드를 붙들고 있는 것은 부모가 아니라 첫 요청 때 뜨는 ` +
          `워커라, 워커가 그 중간 빌드를 붙들고 있는지 지금 lib과 같은 것을 붙들고 있는지 ` +
          `**알 수 없다** — 재기동을 권한다.`,
      });
    }
  }

  return { verdict: worst(findings) ?? "FRESH", findings };
}
