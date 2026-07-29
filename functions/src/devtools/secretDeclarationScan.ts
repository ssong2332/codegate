// T133 / AC-081 (a) — "읽는 자격증명"과 "선언한 자격증명"의 양방향 일치를 기계적으로 판정하는
// 정적 스캐너(Architecture.md §41.4 ⓐ 채택안 · §41.5 판정 규칙).
//
// ⛔ 손으로 유지하는 목록을 만들지 않는다(AC-081 (a) 명문). 이 저장소의 손 목록은 실제로
//    드리프트했다 — llm/index.ts의 getLlmClient 주석이 "3곳"이라 적는 동안 실제 선언은 5곳이었다.
//
// ⭐⭐ 비교 단위를 문장으로 고정한다(G204 — 기준이 코드에 적혀 있지 않으면 다음 사람이 판정을
//    달리한다. AC-079 (a) 선례):
//
//    "그 콜러블이 실제로 읽는 자격증명 집합"
//      = 그 **콜러블을 정의한 파일**에서 출발해 `import`/`export ... from` 을
//        **functions/src 내부 상대 경로에 한해** 재귀적으로 따라간 모듈 집합(= 전이 폐포)에서,
//        어느 모듈이든 shared/config.ts가 export한 `SecretParam` 심볼을 **값으로** 참조하면
//        그 심볼이 가리키는 시크릿 이름.
//
//    ⛔ 제외 2건:
//      - `import type` / `export type` / `{ type X }` 는 폐포에서 제외한다(G205).
//        근거: rewind/judge.ts의 `import type { LlmClient } from "../llm"` 은 타입만 가져오는데
//        이것을 따라가면 ../llm이 폐포에 들어와 **거짓 양성**이 난다(컴파일 후 사라지는 참조다).
//      - `functions/src/index.ts` 는 대상·경유 모두에서 제외한다(G206).
//        근거: 전 모듈 배럴이라 포함하면 모든 콜러블의 폐포가 전체가 되어 판정이 무의미해진다.
//
// ⚠️ 파일 단위는 함수 단위보다 **넓다**(§41.5 (3) · §41.10 (6)). 같은 파일의 다른 콜러블이
//    자격증명을 읽으면 읽지 않는 콜러블도 선언해야 통과한다 — 의도한 대가이며, 함수 단위 AST
//    호출그래프는 배럴 재export·간접 호출에서 **조용히 0건을 세고 초록**이 되는 위험(거짓 초록)
//    때문에 1순위에서 기각됐다(§41.4 ⓑ).
//    ⛔ 그러므로 "선언했다 = 그 파일이 그 시크릿을 읽는다"로 오독하지 말 것.
//
// ⛔ G211 — 이 모듈은 자격증명 **이름**만 다룬다. 값·길이·접두·해시를 읽거나 반환하지 않는다.
import * as fs from "node:fs";
import * as path from "node:path";

/** 테스트는 컴파일 산출물(lib/)에서 실행되므로 소스 경로를 명시적으로 잡는다(axisCoverage.test.ts 관례). */
export const FUNCTIONS_SRC_DIR = path.resolve(__dirname, "../../src");

const CONFIG_FILE = path.join(FUNCTIONS_SRC_DIR, "shared/config.ts");
/** G206 — 전 모듈 배럴. 폐포에서 제외한다. */
const BARREL_FILE = path.join(FUNCTIONS_SRC_DIR, "index.ts");

/** 진입점 정의를 찾는 패턴. `onRequest`는 현재 0건이지만 생기면 자동으로 잡히도록 함께 둔다. */
const ENTRY_POINT_RE =
  /^export const (\w+) = (onCall|onRequest|onSchedule|onDocument\w*)\b/gm;

/**
 * `import`/`export ... from` 한 건. 타입 전용 절(`import type` / `export type`)은 걸러낸다(G205).
 * 캡처: 1 = 절 본문(중괄호 포함 가능), 2 = 모듈 지정자.
 */
const MODULE_REF_RE = /^(?:import|export)\s+((?!type\b)[\s\S]*?)from\s+["']([^"']+)["']/gm;

export type SecretSymbolTable = Record<string, readonly string[]>;

function readSource(file: string): string {
  return fs.readFileSync(file, "utf-8");
}

/**
 * shared/config.ts를 파싱해 **심볼 → 시크릿 이름 목록** 표를 만든다.
 * ⛔ 심볼 목록을 이 파일에 손으로 적지 않는다 — 그것이 AC-081 (a)가 금지한 바로 그 형태다.
 *   - `export const X = defineSecret("NAME")`      → X → [NAME]
 *   - `export const ARR = [A, B] as const`          → ARR → A와 B의 합집합
 * ⚠️ `defineString`(FALLBACK_VOICE_*·LLM_PROVIDER)은 **시크릿이 아니라** 대상이 아니다(§41.10 (8)).
 */
export function buildSecretSymbolTable(configSource = readSource(CONFIG_FILE)): SecretSymbolTable {
  const table: Record<string, readonly string[]> = {};
  const secretRe = /export const (\w+)\s*=\s*defineSecret\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of configSource.matchAll(secretRe)) {
    table[m[1]!] = [m[2]!];
  }
  const arrayRe = /export const (\w+)\s*=\s*\[([^\]]*)\]\s*as const/g;
  for (const m of configSource.matchAll(arrayRe)) {
    const members = m[2]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const keys = members.flatMap((member) => table[member] ?? []);
    // 시크릿 심볼이 하나도 안 섞인 배열(예: 문자열 목록)은 표에 넣지 않는다.
    if (keys.length > 0) table[m[1]!] = keys;
  }
  return table;
}

/** 상대 지정자를 `functions/src` 안의 실제 `.ts` 파일로 해석한다. 외부 패키지는 null. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

type ModuleRef = { readonly file: string; readonly clause: string };

/** 한 파일이 값으로 참조하는 내부 모듈들(타입 전용 절 제외 — G205). */
function valueModuleRefs(file: string, source: string): ModuleRef[] {
  const refs: ModuleRef[] = [];
  for (const m of source.matchAll(MODULE_REF_RE)) {
    const resolved = resolveSpecifier(file, m[2]!);
    if (!resolved) continue;
    refs.push({ file: resolved, clause: m[1]! });
  }
  return refs;
}

/**
 * `{ a, type B, c }` 같은 절에서 **값** 지정자 이름만 뽑는다.
 * 인라인 `type` 지정자는 컴파일 후 사라지므로 제외한다(G205).
 */
function valueSpecifierNames(clause: string): string[] {
  const braced = clause.match(/\{([\s\S]*)\}/);
  if (!braced) return [];
  return braced[1]!
    .split(",")
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0 && !/^type\s/.test(raw))
    .map((raw) => raw.split(/\s+as\s+/)[0]!.trim())
    .filter(Boolean);
}

/** 콜러블 정의 파일에서 출발한 전이 폐포(자기 자신 포함, 배럴 제외 — G206). */
export function computeImportClosure(entryFile: string): string[] {
  const visited = new Set<string>();
  const stack = [path.resolve(entryFile)];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    if (current === BARREL_FILE) continue; // G206
    if (!fs.existsSync(current)) continue;
    visited.add(current);
    for (const ref of valueModuleRefs(current, readSource(current))) {
      if (!visited.has(ref.file)) stack.push(ref.file);
    }
  }
  return [...visited].sort();
}

/** 폐포가 읽는 시크릿 이름 집합(정렬·중복 제거). */
export function computeReadSecrets(
  entryFile: string,
  table: SecretSymbolTable = buildSecretSymbolTable(),
): string[] {
  const keys = new Set<string>();
  for (const file of computeImportClosure(entryFile)) {
    for (const ref of valueModuleRefs(file, readSource(file))) {
      if (ref.file !== CONFIG_FILE) continue;
      for (const name of valueSpecifierNames(ref.clause)) {
        for (const key of table[name] ?? []) keys.add(key);
      }
    }
  }
  return [...keys].sort();
}

export type EntryPoint = { readonly name: string; readonly file: string };

/** functions/src 전체에서 서버 진입점 정의를 수집한다(테스트 파일 제외). */
export function listEntryPoints(dir = FUNCTIONS_SRC_DIR): EntryPoint[] {
  const found: EntryPoint[] = [];
  const walk = (current: string): void => {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) {
        if (item.name === "__tests__" || item.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!item.name.endsWith(".ts") || item.name.endsWith(".d.ts")) continue;
      const source = readSource(full);
      for (const m of source.matchAll(ENTRY_POINT_RE)) {
        found.push({ name: m[1]!, file: full });
      }
    }
  };
  walk(dir);
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 선언 판독(G207) — `__endpoint.secretEnvironmentVariables` 1순위.
 * ⚠️ `__endpoint`는 `@alpha` 표기라 SDK 업그레이드로 사라질 수 있다. 그래서 **부재를 조용히
 * 빈 배열로 떨어뜨리지 않고** 판별 불가를 호출부에 알린다(§41.8 강등표 1행 = 소스 파싱 강등).
 */
export function readDeclaredSecrets(fn: unknown): string[] | null {
  const endpoint = (fn as { __endpoint?: unknown } | undefined)?.__endpoint;
  if (endpoint === undefined || endpoint === null) return null;
  const declared = (endpoint as { secretEnvironmentVariables?: unknown })
    .secretEnvironmentVariables;
  if (declared === undefined) return [];
  if (!Array.isArray(declared)) return null;
  return declared
    .map((entry) => (entry as { key?: unknown }).key)
    .filter((key): key is string => typeof key === "string")
    .sort();
}

export type SecretMismatch = {
  readonly name: string;
  readonly file: string;
  readonly read: readonly string[];
  readonly declared: readonly string[];
  readonly missingDeclaration: readonly string[];
  readonly unusedDeclaration: readonly string[];
};

/**
 * 양방향 일치 판정(AC-081 (a)) — 한쪽에만 있는 항목이 1건이라도 있으면 불일치다.
 * ⛔ 순수 함수로 유지한다: 역방향 확인(AC-081 (b))이 **선언 집합만 오염한 입력**을 그대로 먹여
 *    실패를 재현하고, 같은 출력에서 읽는 집합이 불변임을 단언할 수 있어야 한다(G208).
 */
export function findSecretMismatches(
  entries: readonly (EntryPoint & { readonly read: readonly string[] })[],
  declaredByName: Readonly<Record<string, readonly string[]>>,
): SecretMismatch[] {
  const mismatches: SecretMismatch[] = [];
  for (const entry of entries) {
    const declared = [...(declaredByName[entry.name] ?? [])].sort();
    const read = [...entry.read].sort();
    const missingDeclaration = read.filter((key) => !declared.includes(key));
    const unusedDeclaration = declared.filter((key) => !read.includes(key));
    if (missingDeclaration.length === 0 && unusedDeclaration.length === 0) continue;
    mismatches.push({
      name: entry.name,
      file: entry.file,
      read,
      declared,
      missingDeclaration,
      unusedDeclaration,
    });
  }
  return mismatches;
}

/**
 * 실패 메시지 — ⛔ "불일치"만 적지 않는다(§41.5 (4) · §40.8 G200 선례).
 * 읽는 집합·선언한 집합·양쪽 차집합·**처방 3종**을 함께 낸다.
 */
export function describeMismatch(mismatch: SecretMismatch): string {
  const rel = path.relative(FUNCTIONS_SRC_DIR, mismatch.file).replace(/\\/g, "/");
  return [
    `${mismatch.name} (src/${rel})`,
    `  읽는 집합   : [${mismatch.read.join(", ")}]`,
    `  선언한 집합 : [${mismatch.declared.join(", ")}]`,
    `  선언 누락(읽는데 선언 없음) : [${mismatch.missingDeclaration.join(", ")}]`,
    `  잉여 선언(선언했는데 안 읽음): [${mismatch.unusedDeclaration.join(", ")}]`,
    "  처방:",
    "   (i)  선언 누락이면 그 파일의 **모든** 콜러블 옵션에 해당 심볼을 스프레드하라",
    "        (예: onCall<Req, Res>({ secrets: [...GEMINI_KEY_SECRETS] }, handler)).",
    "   (ii) 잉여 선언이면 선언을 지우거나, 그 파일에 그 시크릿을 읽는 경로가 실제로 있는지 확인하라.",
    "   (iii) 선언 프로필이 다른 콜러블을 같은 파일에 새로 추가하지 마라(G212) — 파일을 나눠라.",
  ].join("\n");
}
