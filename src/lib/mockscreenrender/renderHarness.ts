// T116 — 모의 랜딩 화면의 **렌더 층** 하네스 (Architecture.md §32 · §39, 후보 **B-1**).
//
// ⛔⛔ **테스트 전용 모듈이다. 앱 코드(`src/app/**`·`src/components/**`)에서 import하지 않는다.**
// import하는 순간 `typescript`와 Node 내장(`node:module`·`node:fs`)이 **클라이언트 번들 후보**가
// 되고 테스트 도구가 제품 의존성으로 승격된다 — `src/lib/sourcescan/scanSource.ts:3-4`가 같은
// 위험을 이미 문장으로 적어 둔 자리이며(S1/G98), 이 모듈은 그 제약을 그대로 상속한다.
// 그 금지를 기계로 받는 것이 **2층 트립와이어**다(§39.4):
//   층 1 = `src/lib/mockscreenrender/harnessIsolation.test.ts`(`npm test`에서 항상 실행)
//   층 2 = `scripts/verify-no-dev-auth-in-build.mjs`(opt-in `npm run verify:build`)
//
// ── 왜 이 형태인가(§39.1·§39.2 — 후보 A·A2는 실측으로 죽었다) ──────────────────────────────
// 루트 러너는 `node --experimental-strip-types --test`인데(`package.json:11`) 그 로더는 `.tsx`를
// **열지도 않고 거절한다** — `ERR_UNKNOWN_FILE_EXTENSION`. 타입 스트리핑이든 변환 플래그
// (`--experimental-transform-types`)든 결과가 같다(둘 다 실측). Node 공식 문서가 지원 확장자를
// `.ts`·`.mts`·`.cts`로 한정하고 *".tsx files are unsupported."* 로 명시 배제하기 때문이다.
// ⇒ **신규 의존성 0건**으로 남은 길은 하나다: 이미 있는 `typescript`(devDep)로 인메모리 변환하고
// **CJS `require` 확장 훅**에 물려 Node에게 모듈 해석을 맡긴다.
//
// ── ⭐ 이 형태를 고른 결정적 사유는 편의가 아니라 **G139**다 ────────────────────────────────
// 역검증(오염 샘플)이 **정상 경로와 다른 수단**으로 실행되면 그 실패는 정상 경로에 대한 증거가
// 아니다. 아래 `sourceOverrides` 맵은 훅 **안쪽**에 있으므로 오염 사본이 정상과 **완전히 같은
// 경로**(같은 훅 · 같은 변환 · 같은 렌더 함수)로 흐른다. 디스크에 사본을 쓰지 않으므로
// `src/components/` 안에 임시 파일이 생기지 않고(G142), 실제 컴포넌트를 고쳤다 되돌리는 방식도
// 쓰지 않는다(`callContinuity.test.ts:161-162` 관례 — 그 방식에서 되돌리기 실패 사고가 있었다).
//
// ⚠️ **한계(정직 고지 — §39.7).** `renderToStaticMarkup`은 **문자열 생성**이다. 브라우저의 실제
// 렌더·CSS로 숨겨진 요소·이벤트/타이머 전이·`useEffect`는 보지 않는다. ***"그려졌다"는 "보였다"가
// 아니다.***
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import ts from "typescript";

/** 검증 대상 컴포넌트 — **1개 고정**이다(§32.0 3 · §32.5 (1)). */
export const COMPONENT_PATH = "src/components/MessengerFakeLanding.tsx";

/**
 * ⭐ **층 2(산출물 게이트)의 앵커**(§39.4 (2)). `scripts/verify-no-dev-auth-in-build.mjs`가
 * `out/**`에서 이 문자열을 찾는다 — 발견되면 테스트 전용 하네스가 앱 번들에 샌 것이다.
 * ⚠️ **런타임 문자열이어야 한다**(주석은 번들러가 지운다). 그래서 아래 오류 메시지에 실어 둔다.
 */
export const HARNESS_BUNDLE_SENTINEL = "T116-RENDER-HARNESS-TEST-ONLY";

const requireFromHarness = createRequire(import.meta.url);

/**
 * `react`·`react-dom/server`도 **훅과 같은 CJS require로** 가져온다.
 * ESM `import`로 가져오면 변환된 컴포넌트가 `require("react")`로 잡는 인스턴스와 갈릴 수 있고,
 * 두 인스턴스가 되면 훅 이후에 렌더가 조용히 깨진다.
 */
const React = requireFromHarness("react") as {
  createElement: (type: unknown, props: Record<string, unknown>) => unknown;
};
const { renderToStaticMarkup } = requireFromHarness("react-dom/server") as {
  renderToStaticMarkup: (element: unknown) => string;
};

/** 이번 렌더에서 훅이 실제로 변환한 파일들. G140 ①(변환 모듈 수 하한)의 근거다. */
let transpiledThisRun: string[] = [];

/**
 * 오염 오버라이드 — **절대경로 → 변조된 소스**.
 * 훅 안쪽에 있다는 것이 핵심이다(G139). 비어 있으면 전부 디스크에서 읽는다 = 정상 경로.
 */
let sourceOverrides = new Map<string, string>();

type CompilableModule = { _compile(code: string, filename: string): void };
type ExtensionHandler = (module: CompilableModule, filename: string) => void;

const extensionTable = (requireFromHarness as unknown as {
  extensions?: Record<string, ExtensionHandler>;
}).extensions;

function transpile(source: string, filename: string): string {
  return ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
}

const handler: ExtensionHandler = (module, filename) => {
  const source = sourceOverrides.get(filename) ?? readFileSync(filename, "utf8");
  transpiledThisRun.push(filename);
  module._compile(transpile(source, filename), filename);
};

/**
 * ⚠️ **`.ts`도 반드시 등록한다.** `./ui`는 디렉터리이고 배럴이 `ui/index.ts`라, Node의 디렉터리
 * 인덱스 해석은 **등록된 확장자 목록**을 순회한다 — `.tsx`만 등록하면 배럴이 풀리지 않는다
 * (§39.2 (3) 행 2가 미리 지목한 함정).
 */
export function installRequireHook(): void {
  if (!extensionTable) {
    throw new Error(
      `${HARNESS_BUNDLE_SENTINEL}: require.extensions에 접근하지 못했다 — B-1 훅을 걸 수 없다. ` +
        "Architecture.md §39.2 (3) 행 1(→ B-2로 강등)을 따를 것.",
    );
  }
  extensionTable[".tsx"] = handler;
  extensionTable[".ts"] = handler;
}

/** 훅이 변환한 모듈의 require 캐시를 비운다.
 *  ⛔ 안 비우면 **정상 모듈이 재사용돼 "오염이 안 걸린다"는 거짓 음성**이 난다(§39.5 (1)). */
function clearTranspiledCache(): void {
  for (const filename of transpiledThisRun) {
    delete requireFromHarness.cache[filename];
  }
}

export type RenderResult = {
  markup: string;
  /** 태그·엔티티·공백을 정규화한 **대조용 텍스트 1개 문자열**(§32.5 (2) R-A). */
  text: string;
  /** 훅이 변환한 모듈 수 — G140 ①. */
  transpiledCount: number;
};

/**
 * 대상 컴포넌트를 **정적 렌더**해 마크업과 추출 텍스트를 낸다.
 *
 * @param props        컴포넌트 props(초기 상태 그대로 렌더된다 — 이벤트를 발생시키지 않는다)
 * @param overrides    오염 소스 맵(절대경로 → 소스). 비우면 정상 경로.
 */
export function renderLandingScreen(
  props: Record<string, unknown>,
  overrides?: Map<string, string>,
): RenderResult {
  installRequireHook();
  clearTranspiledCache();
  transpiledThisRun = [];
  sourceOverrides = overrides ?? new Map();
  try {
    const absolute = resolvePath(COMPONENT_PATH);
    const loaded = requireFromHarness(absolute) as { default: unknown };
    const markup = renderToStaticMarkup(React.createElement(loaded.default, props));
    return {
      markup,
      text: extractText(markup),
      transpiledCount: new Set(transpiledThisRun).size,
    };
  } finally {
    clearTranspiledCache();
    sourceOverrides = new Map();
  }
}

/** 오염 샘플용 — 디스크 소스를 읽어 한 군데만 치환한 **메모리 사본**을 만든다.
 *  ⛔ 디스크에 쓰지 않는다(G142). 치환이 실제로 일어났는지 호출부가 단언해야 한다. */
export function poisonedComponentSource(from: string, to: string): {
  absolutePath: string;
  original: string;
  poisoned: string;
  overrides: Map<string, string>;
} {
  const absolutePath = resolvePath(COMPONENT_PATH);
  const original = readFileSync(absolutePath, "utf8");
  const poisoned = original.replace(from, to);
  return { absolutePath, original, poisoned, overrides: new Map([[absolutePath, poisoned]]) };
}

const ENTITIES: Array<[RegExp, string]> = [
  [/&quot;/g, '"'],
  [/&#x27;/g, "'"],
  [/&#39;/g, "'"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&nbsp;/g, " "],
  [/&amp;/g, "&"], // ⚠️ 반드시 마지막 — 먼저 풀면 `&amp;lt;`가 `<`로 잘못 풀린다
];

/**
 * 마크업 → 대조용 텍스트.
 *
 * ⚠️ **G193 — 태그를 빈 문자열로 지우면 인접 텍스트가 붙어 버린다**(`<p>A</p><p>B</p>` → `AB`).
 * 그러면 없는 문구가 "있는" 것처럼 보이거나 반대로 있는 문구를 놓친다. 그래서 태그를
 * **개행 구분자**로 치환한 뒤 엔티티를 풀고 줄 단위로 공백을 정규화한다.
 */
export function extractText(markup: string): string {
  let text = markup.replace(/<[^>]*>/g, "\n");
  for (const [pattern, replacement] of ENTITIES) text = text.replace(pattern, replacement);
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
