// T187 — 세션 중 '모의/훈련' 표식 0건 게이트 (docs/Architecture.md §72.7 G436~G443 · G449 ·
// PRD v1.18 AC-086 (a)~(h) — 근거 주석: "PRD v1.18 AC-086 · T187 · §72").
//
// ⭐⭐ 판정 단위는 파일이 아니라 **상태**다(§72 머리). 세션 경계 문면을 두 모듈
// (`preSessionCopy.ts` · `postSessionCopy.ts`)로 뺐기 때문에 세션 중 파일의 리터럴 검사(G437)가 파일
// 단위로 정확해지고, 빼 낸 식별자가 세션 중 상태로 새는 것은 AST 사용처 가드(G438)가 막는다.
//
// ⚠️ 이 게이트들이 **못 보는 것**(자기 고지 — §72.7 끝): 런타임 조립 문자열 · 외부 값 · CSS로 숨김/표시 ·
// 등록부 밖 `src/lib/**` 모듈이 세션 중에 렌더하는 문면(아래 IN_SESSION_COPY_MODULES 4개만 본다) ·
// 모델 실제 발화(AC-086 (e)) · 실제 화면 배치(G449는 클래스 문자열만 본다 — 브라우저 확인 B-5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, globSync } from "node:fs";
import ts from "typescript";
import { parseTsx } from "../sourcescan/scanSource.ts";

// ── 정본 낱말·부정 패턴 — functions 쪽 단일 정본을 **소스 파싱**으로 읽는다(사본 0 · 드리프트 0) ──
const CANONICAL_PATH = "functions/src/scenarios/__tests__/sessionMarkerWords.ts";
const canonicalSource = readFileSync(CANONICAL_PATH, "utf8").replace(/\r\n/g, "\n");

function canonicalBlock(constName: string): string {
  const start = canonicalSource.indexOf(`export const ${constName}`);
  assert.ok(start >= 0, `${CANONICAL_PATH}에 ${constName}이 없다`);
  const open = canonicalSource.indexOf("[", canonicalSource.indexOf("=", start));
  const close = canonicalSource.indexOf("];", open);
  assert.ok(open > start && close > open, `${constName} 배열 리터럴을 파싱하지 못했다`);
  return canonicalSource.slice(open + 1, close);
}

const SESSION_MARKER_WORDS = [...canonicalBlock("SESSION_MARKER_WORDS").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const IN_SESSION_NEGATION_PATTERNS = canonicalBlock("IN_SESSION_NEGATION_PATTERNS")
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "")
  .map((line) => {
    const m = /^\s*\/(.+)\/([a-z]*),\s*$/.exec(line);
    assert.ok(m, `정규식 리터럴로 파싱할 수 없는 줄 — 건너뛰면 검사가 조용히 좁아진다: ${line.trim()}`);
    return new RegExp(m[1], m[2]);
  });

test("[T187/정본 파싱] 낱말 5개 · 부정 패턴 7개를 functions 정본에서 읽었다", () => {
  assert.deepEqual(SESSION_MARKER_WORDS, ["모의", "훈련용", "AI 훈련용", "가상", "재현"]);
  assert.equal(IN_SESSION_NEGATION_PATTERNS.length, 7);
});

// ── G436 등록부 ─────────────────────────────────────────────────────────────────────────────
type SurfaceRole = "in-session" | "mixed" | "pre-session" | "post-session" | "redirect" | "not-in-session";

const SESSION_SURFACE_REGISTRY: Record<string, SurfaceRole> = {
  "src/components/AgeGate.tsx": "not-in-session", // 온보딩 연령 확인 — 세션 전 화면 부품
  "src/components/AudioDebugPanel.tsx": "in-session", // ?audiodebug=1 진단 패널(통화 화면 — 영문 키만 · 쿼리 없으면 DOM 0)
  "src/components/AuthInvalidationBanner.tsx": "in-session", // 세션 중에도 뜰 수 있는 인증 무효 안내(T128)
  "src/components/CallStartNotice.tsx": "pre-session", // T190-8b UX-014 pre-call-notice(벨 직전 고지 — AC-091)
  "src/components/DeviceSkinPicker.tsx": "pre-session", // T190-6 세션 전 화면 모양 줄(start-notice 안 — AC-092 (d))
  "src/components/CallWaveform.tsx": "in-session", // 통화 중 파형
  "src/components/DrilldownOptionCard.tsx": "not-in-session", // 시나리오 드릴다운 카드(세션 전)
  "src/components/EndTrainingButton.tsx": "in-session", // 상시 종료(AC-006) — 세션 중 유일한 상시 요소
  "src/components/InCallSmsOverlay.tsx": "in-session", // UX-027 통화 중 문자함
  "src/components/MessengerFakeLanding.tsx": "in-session", // UX-023 가짜 랜딩
  "src/components/MessengerStartNotice.tsx": "pre-session", // UX-022 start-notice(T187)
  "src/components/PersonaCardInputFields.tsx": "not-in-session", // §88 UX D-131 "내 정보" 선택 입력(난이도 · 챌린지 만들기 — 세션 전)
  "src/components/PhoneIcon.tsx": "in-session", // T190-1 기기 재현 단색 아이콘(통화 셸 그리드 · 텍스트 노드 0)
  "src/components/SpoofImage.tsx": "not-in-session", // 렌더 사용처 0(M-12)
  "src/components/SyntheticLabel.tsx": "not-in-session", // 세션 중 사용처 0 — SpoofImage만 쓴다(M-12)
  "src/components/VerifyCallOverlay.tsx": "in-session", // UX-031 전환 시트
  "src/app/session/chat/page.tsx": "redirect", // return null 리다이렉트
  "src/app/session/end/page.tsx": "post-session", // UX-007 종료 고지
  "src/app/session/messenger/page.tsx": "mixed", // start-notice(세션 전) + chat(세션 중)
  "src/app/session/play/page.tsx": "mixed", // pre-call-notice(세션 전 — CallStartNotice) + 통화(세션 중)
};

function discoveredSurfaces(): string[] {
  const components = readdirSync("src/components")
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => `src/components/${name}`);
  const pages = globSync("src/app/session/*/page.tsx").map((p) => p.split("\\").join("/"));
  return [...components, ...pages].sort();
}

function registryMismatch(registry: Record<string, SurfaceRole>): { missing: string[]; stale: string[] } {
  const discovered = discoveredSurfaces();
  const keys = Object.keys(registry);
  return {
    missing: discovered.filter((f) => !keys.includes(f)),
    stale: keys.filter((f) => !discovered.includes(f)),
  };
}

test("[T187/G436] 세션 표면 등록부 = src/components/*.tsx ∪ src/app/session/*/page.tsx (등록 없이 우회 불가)", () => {
  assert.deepEqual(registryMismatch(SESSION_SURFACE_REGISTRY), { missing: [], stale: [] });
  // T190-1(docs/Architecture.md §74.22 (4) #21 단계별 누적) — 15 → 16(+PhoneIcon) → T190-6 17(+DeviceSkinPicker) →
  // T190-8b 18(+CallStartNotice) → 2026-10-18 19(+AudioDebugPanel) → §88 20(+PersonaCardInputFields).
  assert.equal(Object.keys(SESSION_SURFACE_REGISTRY).length, 20);
});

// ── G451 — 등록부 2벌(G436 · T86)이 최상위 `src/components/*.tsx`만 훑으므로, 하위 디렉터리에 컴포넌트를 두면
// **등록 없이 빠진다**(docs/Architecture.md §74.0 #6 · §74.14 G451). `ui/`만 허용한다.
function nestedComponentViolations(paths: readonly string[]): string[] {
  return paths
    .map((p) => p.split("\\").join("/"))
    .filter((p) => /^src\/components\/[^/]+\/.+\.tsx$/.test(p))
    .filter((p) => !p.startsWith("src/components/ui/"));
}

test("[T190/G451] src/components 하위 디렉터리의 .tsx는 ui/ 안에만 있다(등록부 우회 금지)", () => {
  const found = globSync("src/components/**/*.tsx");
  assert.ok(found.length >= 15, `컴포넌트 탐색이 죽었다(${found.length}개)`);
  assert.deepEqual(nestedComponentViolations(found), []);
});

test("[T190/G451 역검증] 가상 경로 src/components/phone/X.tsx를 넣은 목록은 실패한다", () => {
  const found = globSync("src/components/**/*.tsx");
  assert.deepEqual(nestedComponentViolations([...found, "src/components/phone/X.tsx"]), ["src/components/phone/X.tsx"]);
});

test("[T187/G436 역검증] 등록부에서 1개를 뺀 사본은 불일치로 걸린다", () => {
  const copy = { ...SESSION_SURFACE_REGISTRY };
  delete copy["src/components/VerifyCallOverlay.tsx"];
  assert.deepEqual(registryMismatch(copy).missing, ["src/components/VerifyCallOverlay.tsx"]);
});

/** G437 범위 — 세션 중을 그리는 파일 + 세션 중 문면 모듈(등록부 밖 lib는 이 4개만 본다). */
const IN_SESSION_COPY_MODULES = [
  "src/lib/report/degradedDisclosure.ts",
  "src/lib/realtime/useRealtimeCall.ts",
  "src/lib/recording/useSpeechRecognition.ts",
  "src/lib/authinvalidation/copy.ts",
];

function scopeFiles(registry = SESSION_SURFACE_REGISTRY): string[] {
  return [
    ...Object.entries(registry)
      .filter(([, role]) => role === "in-session" || role === "mixed")
      .map(([file]) => file),
    ...IN_SESSION_COPY_MODULES,
  ];
}

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

// ── 판정 함수(본 게이트·역검증·G442가 **같은 함수**를 쓴다) ───────────────────────────────
/** G437 — 렌더 가능 텍스트 조각의 낱말 + 표식 컴포넌트 import. */
function markerViolations(file: string, code: string): string[] {
  const parsed = parseTsx(file, code);
  const out: string[] = [];
  for (const fragment of parsed.renderableTextFragments()) {
    for (const word of SESSION_MARKER_WORDS) {
      if (fragment.text.includes(word)) out.push(`${file}:${fragment.line} 낱말 "${word}" — ${fragment.text}`);
    }
  }
  for (const spec of parsed.importModuleSpecifiers()) {
    if (/SyntheticLabel|SpoofImage/.test(spec.text)) out.push(`${file}:${spec.line} import ${spec.text}`);
  }
  return out;
}

/** G440 — 상호작용 직후·상시 부정 고지. */
function negationViolations(file: string, code: string): string[] {
  const out: string[] = [];
  for (const fragment of parseTsx(file, code).renderableTextFragments()) {
    for (const pattern of IN_SESSION_NEGATION_PATTERNS) {
      if (pattern.test(fragment.text)) out.push(`${file}:${fragment.line} ${pattern} — ${fragment.text}`);
    }
  }
  return out;
}

function identifiersOf(file: string, code: string): Set<string> {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** G439 — 세션 중 난이도 배지(M-13). */
function difficultyBadgeViolations(file: string, code: string): string[] {
  const out: string[] = [];
  const ids = identifiersOf(file, code);
  if (ids.has("DIFFICULTY_LABEL")) out.push(`${file} DIFFICULTY_LABEL`);
  if (ids.has("difficultyLabel")) out.push(`${file} difficultyLabel`);
  for (const fragment of parseTsx(file, code).renderableTextFragments()) {
    if (/^\s*난이도\s*$/.test(fragment.text) || /난이도\s*(초급|중급|고급)/.test(fragment.text)) {
      out.push(`${file}:${fragment.line} 난이도 배지 — ${fragment.text}`);
    }
  }
  return out;
}

function allInSessionViolations(file: string, code: string): string[] {
  return [
    ...markerViolations(file, code),
    ...negationViolations(file, code),
    ...difficultyBadgeViolations(file, code),
  ];
}

// ── G437 · G439 · G440 본 게이트 ───────────────────────────────────────────────────────────
test("[T187/G437] 세션 중 파일·문면 모듈의 렌더 가능 텍스트에 표식 낱말 0 · 표식 컴포넌트 import 0", () => {
  const files = scopeFiles();
  assert.equal(files.length, 14, "범위 = in-session 8(T190-1 +PhoneIcon · 2026-10-18 +AudioDebugPanel) + mixed 2 + 문면 모듈 4");
  assert.deepEqual(files.flatMap((f) => markerViolations(f, read(f))), []);
});

test("[T187/G440] 세션 중 범위에 상호작용 직후·상시 부정 고지 0", () => {
  assert.deepEqual(scopeFiles().flatMap((f) => negationViolations(f, read(f))), []);
});

const G288_TEXT = "이 통화 경로에서는 고른 난이도가 적용되지 않습니다";

test("[T187/G439] 세션 중 난이도 배지 0 · MessengerFakeLanding에 difficultyLabel 0 · G288 문구는 play에 정확히 1회(M-9 보존)", () => {
  assert.deepEqual(scopeFiles().flatMap((f) => difficultyBadgeViolations(f, read(f))), []);
  const play = read("src/app/session/play/page.tsx");
  assert.equal(play.split(G288_TEXT).length - 1, 1, "G288 미적용 문구가 정확히 1회 있어야 한다(M-9 Q-1 유지분)");
});

// ── G442 — 정상·예외·오염을 **같은 함수**로 같은 출력에 ─────────────────────────────────────
const sampleTsx = (body: string) => `export default function Sample() { const x = "a"; return (${body}); }`;

/** AC-086 (f) 닫힌 예외 — 세션 중에 남는 문면. */
const EXCEPTION_SAMPLES = [
  "지금은 AI 응답을 사용할 수 없어 미리 준비된 대사로 진행합니다.",
  G288_TEXT,
  "실시간 음성 통화를 사용할 수 없어 텍스트로 진행합니다.",
  "훈련 종료",
];

test("[T187/G442] 정상 0 / 예외 0 / ⓐ낱말 ≥1 / ⓑ스크린리더 이름 ≥1 / ⓒ난이도 배지 ≥1 — 같은 실행 출력", (t) => {
  const normal = scopeFiles().flatMap((f) => allInSessionViolations(f, read(f))).length;
  const exception = EXCEPTION_SAMPLES.flatMap((text) =>
    allInSessionViolations("exception.tsx", sampleTsx(`<p>{${JSON.stringify(text)}}</p>`)),
  ).length;
  const pollutedA = allInSessionViolations("a.tsx", sampleTsx("<p>AI 훈련용 모의 화면</p>")).length;
  const pollutedB = allInSessionViolations("b.tsx", sampleTsx("<a aria-label={`모의 링크: ${x}`}>x</a>")).length;
  const pollutedC = allInSessionViolations(
    "c.tsx",
    sampleTsx("<span>난이도 {DIFFICULTY_LABEL[x]}</span>"),
  ).length;
  const pollutedL2 = negationViolations(
    "l2.tsx",
    sampleTsx("<p>(실제로는 어디에도 전송되지 않았고 돈도 오가지 않았습니다 — 훈련용 모의 화면입니다.)</p>"),
  ).length;
  t.diagnostic(
    `G442: 정상 ${normal} / 예외 ${exception} / ⓐ${pollutedA} / ⓑ${pollutedB} / ⓒ${pollutedC} / 옛 L2 부정 ${pollutedL2}`,
  );
  assert.equal(normal, 0);
  assert.equal(exception, 0, "AC-086 (f) 예외 문면이 오검출됐다");
  assert.ok(pollutedA >= 1, "ⓐ 낱말 든 JSX 텍스트를 놓쳤다");
  assert.ok(pollutedB >= 1, "ⓑ 템플릿 aria-label의 낱말을 놓쳤다");
  assert.ok(pollutedC >= 1, "ⓒ 난이도 배지를 놓쳤다");
  assert.ok(pollutedL2 >= 1, "G440 — 옛 L2 부정 문장을 놓쳤다");
});

// ── G438 — 세션 전 문면이 세션 중 **상태**로 새지 않는다(AST 사용처 가드) ──────────────────
function sourceFileOf(file: string, code: string): ts.SourceFile {
  return ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function findAll(root: ts.Node, pred: (n: ts.Node) => boolean): ts.Node[] {
  const out: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (pred(node)) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return out;
}

/**
 * ⭐ T190-8b(docs/Architecture.md §74.22 (1) ⓓ · G438 재지정 ④) — 대상 파일이 play에서 **세션 전 컴포넌트**
 * `CallStartNotice.tsx`로 옮겨 갔다. `{PREROLL_NOTICE}` JSX 식 정확히 1회 · **조건 없음**(그 화면 전체가 세션 전이다).
 * 옛 판정("play의 `phase === \"incoming\"` 아래 1회")은 벨 화면 프리롤을 허용 목록에 올리는 것이라 폐기했다(D-102 · AC-091 (c)).
 */
function prerollUsageViolations(code: string): string[] {
  const sf = sourceFileOf("CallStartNotice.tsx", code);
  const uses = findAll(
    sf,
    (n) => ts.isJsxExpression(n) && !!n.expression && ts.isIdentifier(n.expression) && n.expression.text === "PREROLL_NOTICE",
  );
  if (uses.length !== 1) return [`{PREROLL_NOTICE} JSX 식이 ${uses.length}회다(정확히 1회여야 한다)`];
  let node: ts.Node | undefined = uses[0].parent;
  while (node && !ts.isReturnStatement(node)) {
    if (
      ts.isConditionalExpression(node) ||
      (ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          node.operatorToken.kind === ts.SyntaxKind.BarBarToken))
    ) {
      return [`PREROLL_NOTICE가 조건(${node.getText(sf).slice(0, 40)}) 아래에 있다 — 세션 전 화면에서는 조건 없이 그린다`];
    }
    node = node.parent;
  }
  return node ? [] : ["PREROLL_NOTICE가 return 안에 있지 않다"];
}

/**
 * 세션 전 컴포넌트 사용처 판정(본 게이트·역검증 공용) — 정확히 1회 · 조상 = `if (조건)` 블록의 return · 그 if가
 * 컴포넌트의 **마지막 return보다 앞**. messenger(`MessengerStartNotice` · `startNotice === "show"`)와
 * play(`CallStartNotice` · `phase === "pre-call-notice"` — T190-8b ⓓ ①)가 **같은 함수**를 쓴다.
 */
function noticeElementViolations(
  code: string,
  file: string,
  tag: string,
  expectedCondition: string,
  componentName: string,
): string[] {
  const sf = sourceFileOf(file, code);
  const out: string[] = [];
  const elements = findAll(
    sf,
    (n) => (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sf) === tag,
  );
  if (elements.length !== 1) return [`<${tag} 가 ${elements.length}회다(정확히 1회여야 한다)`];
  let node: ts.Node | undefined = elements[0].parent;
  while (node && !ts.isReturnStatement(node)) node = node.parent;
  const ifStatement = node?.parent && ts.isBlock(node.parent) ? node.parent.parent : undefined;
  if (!ifStatement || !ts.isIfStatement(ifStatement)) return [`<${tag} 가 if 블록의 return 안에 있지 않다`];
  const condition = ifStatement.expression.getText(sf).replace(/\s+/g, " ");
  if (condition !== expectedCondition) out.push(`${tag} 조건이 ${condition}다`);
  const component = findAll(sf, (n) => ts.isFunctionDeclaration(n) && n.name?.text === componentName)[0] as
    | ts.FunctionDeclaration
    | undefined;
  const lastReturn = component?.body?.statements.filter(ts.isReturnStatement).at(-1);
  if (!lastReturn) out.push("컴포넌트 마지막 return을 찾지 못했다");
  else if (ifStatement.getStart(sf) >= lastReturn.getStart(sf)) out.push(`${tag} if가 마지막 return보다 뒤에 있다`);
  return out;
}

/** messenger — `<MessengerStartNotice` 정확히 1회 · 조상 = `if (startNotice === "show")`의 return · 그 if가 마지막 return보다 앞. */
function startNoticeUsageViolations(code: string): string[] {
  return noticeElementViolations(code, "messenger.tsx", "MessengerStartNotice", 'startNotice === "show"', "MessengerSessionPage");
}

/** play — `<CallStartNotice` 정확히 1회 · 조상 = `if (phase === "pre-call-notice")`의 return · 그 if가 마지막 return보다 앞(ⓓ ①). */
function callStartNoticeUsageViolations(code: string): string[] {
  return noticeElementViolations(code, "play.tsx", "CallStartNotice", 'phase === "pre-call-notice"', "SessionCallPage");
}

/** play — 세션 전 문면 모듈 import 0 · 식별자 `PREROLL_NOTICE` 0(ⓓ ②). ⇒ 벨 화면(경로 ①③·에스컬레이션 무관) 프리롤 0. */
function playPrerollViolations(code: string): string[] {
  const out = boundaryImportViolations("play", code, /preSessionCopy|postSessionCopy/);
  if (identifiersOf("play.tsx", code).has("PREROLL_NOTICE")) out.push("play에 식별자 PREROLL_NOTICE가 있다");
  return out;
}

function boundaryImportViolations(file: string, code: string, banned: RegExp): string[] {
  return parseTsx(file, code)
    .importModuleSpecifiers()
    .filter((spec) => banned.test(spec.text))
    .map((spec) => `${file}:${spec.line} import ${spec.text}`);
}

test("[T187/G438 → T190-8b 재지정 ⓓ] 세션 전 문면은 지정 사용처에서만 — CallStartNotice(조건 없음) · play `if (phase === \"pre-call-notice\")` return · messenger `if (startNotice === \"show\")` return", () => {
  const play = read("src/app/session/play/page.tsx");
  // ③④ 세션 전 컴포넌트가 고지 ①을 정확히 1회 · 조건 없이 그린다.
  assert.deepEqual(prerollUsageViolations(read("src/components/CallStartNotice.tsx")), []);
  // ① play는 그 컴포넌트를 벨 직전 고지 early return 하나에서만 쓴다.
  assert.deepEqual(callStartNoticeUsageViolations(play), []);
  // ② play는 세션 전 문면 모듈을 import하지 않고 PREROLL_NOTICE 식별자가 0이다(⇒ 벨 화면 프리롤 0).
  assert.deepEqual(playPrerollViolations(play), []);
  const messenger = read("src/app/session/messenger/page.tsx");
  assert.deepEqual(startNoticeUsageViolations(messenger), []);
  assert.deepEqual(boundaryImportViolations("messenger", messenger, /preSessionCopy|postSessionCopy/), []);
  const inSession = Object.entries(SESSION_SURFACE_REGISTRY)
    .filter(([, role]) => role === "in-session")
    .flatMap(([file]) => boundaryImportViolations(file, read(file), /preSessionCopy|postSessionCopy/));
  assert.deepEqual(inSession, [], "세션 중 파일이 세션 경계 문면을 import한다");
});

test("[T190-8b/G438 역검증 — AC-091 (f)ⓐⓒ] play에 `<p>{PREROLL_NOTICE}</p>` 사본 · 마지막 return 안 CallStartNotice 사본 · 채팅 return 안 시작 고지 사본은 각각 실패한다", (t) => {
  // ⚠️ 옛 앵커('{phase === "incoming" && (')는 사라졌다 — 남기면 notEqual이 "오염 지점을 찾지 못했다"로 실패한다(§74.22 (1)).
  const play = read("src/app/session/play/page.tsx");
  const ringAnchor = "{/* ⛔ T190-8b(D-102 · AC-091 (c) · G438 재지정)";
  assert.ok(play.includes(ringAnchor), "오염 지점(벨 화면 프리롤 자리)을 찾지 못했다");
  const prerollOnRing = play.replace(ringAnchor, "<p>{PREROLL_NOTICE}</p>\n        " + ringAnchor);
  const a = playPrerollViolations(prerollOnRing);

  const lastAnchor = '<PhoneIcon name="end-call" size={32} />\n            </button>\n            <span className="text-sm"';
  assert.ok(play.includes(lastAnchor), "오염 지점(마지막 return의 종료 버튼)을 찾지 못했다");
  const noticeInShell = play.replace(
    lastAnchor,
    '<PhoneIcon name="end-call" size={32} />\n            </button>\n            <CallStartNotice onConfirm={handleConfirmPreCallNotice} onEndTraining={() => void handleEndTraining()} skinPicker={{ value: deviceSkin.skin, source: deviceSkin.source, onChange: handleChooseCallSkin }} />\n            <span className="text-sm"',
  );
  const b = callStartNoticeUsageViolations(noticeInShell);

  const messenger = read("src/app/session/messenger/page.tsx");
  const anchor = messenger.lastIndexOf("<EndTrainingButton onClick={handleEndTraining} />");
  assert.ok(anchor > 0);
  const messengerPoisoned =
    messenger.slice(0, anchor) +
    "<MessengerStartNotice surface={surface} includesCall={false} onConfirm={handleConfirmStartNotice} onEndTraining={handleEndTraining} />" +
    messenger.slice(anchor);
  const c = startNoticeUsageViolations(messengerPoisoned);
  t.diagnostic(`[G438 ⓓ] 정상 0 / 벨 화면 프리롤 사본 ${JSON.stringify(a)} / 통화 셸 안 고지 사본 ${JSON.stringify(b)} / 채팅 안 시작 고지 ${c.length}건`);
  assert.ok(a.includes("play에 식별자 PREROLL_NOTICE가 있다"));
  assert.ok(b.some((v) => v.includes("CallStartNotice 가 2회")));
  assert.ok(c.length >= 1);
  // CallStartNotice 안에서 고지 ①을 조건 아래로 넣은 사본도 실패한다(④).
  const notice = read("src/components/CallStartNotice.tsx");
  const conditional = notice.replace("<p className=\"text-[17px] leading-[1.7] text-ink-sub\">{PREROLL_NOTICE}</p>", "{false && <p>{PREROLL_NOTICE}</p>}");
  assert.notEqual(conditional, notice, "오염 지점(CallStartNotice 고지 ①)을 찾지 못했다");
  assert.equal(prerollUsageViolations(conditional).length, 1);
});

// G449 — CallStartNotice 상단 바도 "훈련 종료"가 오른쪽 끝(MessengerStartNotice와 같은 형태 — §74.22 (1) 등록부 줄).
test("[T190-8b/G449] CallStartNotice 상단 바 justify-end", () => {
  const [c] = endButtonContainers("src/components/CallStartNotice.tsx", read("src/components/CallStartNotice.tsx"));
  assert.ok(c && /\bjustify-end\b/.test(c.className), "CallStartNotice 상단 바가 justify-end가 아니다");
});

// ── G441 — 스크린리더 이름(기능 설명 유지 · 빈 이름 0) ─────────────────────────────────────
type AriaLabel = { kind: "string" | "template"; text: string; head?: string; tail?: string };

function ariaLabelsOf(file: string, code: string): AriaLabel[] {
  const sf = sourceFileOf(file, code);
  return findAll(sf, (n) => ts.isJsxAttribute(n) && n.name.getText(sf) === "aria-label").flatMap((n) => {
    const init = (n as ts.JsxAttribute).initializer;
    if (!init) return [];
    if (ts.isStringLiteral(init)) return [{ kind: "string" as const, text: init.text }];
    if (ts.isJsxExpression(init) && init.expression) {
      const e = init.expression;
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [{ kind: "string" as const, text: e.text }];
      if (ts.isTemplateExpression(e)) {
        const tail = e.templateSpans.at(-1)?.literal.text ?? "";
        return [{ kind: "template" as const, text: e.getText(sf), head: e.head.text, tail }];
      }
    }
    return [];
  });
}

function ariaLabelViolations(sources: Record<string, string>): string[] {
  const out: string[] = [];
  const labels = (file: string) => ariaLabelsOf(file, sources[file]);
  const hasString = (file: string, text: string) => labels(file).some((l) => l.kind === "string" && l.text === text);
  if (!hasString("src/components/VerifyCallOverlay.tsx", "확인 부서 연결 화면")) out.push("A1");
  if (!hasString("src/components/InCallSmsOverlay.tsx", "통화 중 도착한 문자 — 문자함")) out.push("A2");
  if (!labels("src/components/InCallSmsOverlay.tsx").some((l) => l.kind === "template" && l.head === "링크: ")) out.push("A3");
  if (!labels("src/app/session/messenger/page.tsx").some((l) => l.kind === "template" && l.head === "링크: ")) out.push("A4");
  if (!labels("src/components/MessengerFakeLanding.tsx").some((l) => l.kind === "template" && l.tail === " 화면")) out.push("A5");
  if (!hasString("src/components/EndTrainingButton.tsx", "훈련 즉시 종료")) out.push("불변: 훈련 즉시 종료");
  if (!hasString("src/app/session/play/page.tsx", "통화 종료 — 훈련 종료")) out.push("불변: 통화 종료 — 훈련 종료");
  if (!hasString("src/app/session/play/page.tsx", "전화 거절 — 훈련 종료")) out.push("불변: 전화 거절 — 훈련 종료");
  for (const file of Object.keys(sources)) {
    if (labels(file).some((l) => l.kind === "string" && l.text.trim() === "")) out.push(`${file}: 빈 aria-label`);
  }
  return out;
}

const G441_FILES = [
  "src/components/VerifyCallOverlay.tsx",
  "src/components/InCallSmsOverlay.tsx",
  "src/components/MessengerFakeLanding.tsx",
  "src/components/EndTrainingButton.tsx",
  "src/app/session/messenger/page.tsx",
  "src/app/session/play/page.tsx",
];
const g441Sources = () => Object.fromEntries(G441_FILES.map((f) => [f, read(f)]));

test("[T187/G441] 스크린리더 이름 A1~A5 정본 · 종료 이름 불변 3종 존재 · 빈 aria-label 0", () => {
  assert.deepEqual(ariaLabelViolations(g441Sources()), []);
});

test("[T187/G441 역검증] A3를 `${x}`(기능 설명 소실)로 바꾼 사본은 실패한다", () => {
  const sources = g441Sources();
  const file = "src/components/InCallSmsOverlay.tsx";
  // T190-5(docs/Architecture.md §74.13 G441 A3 행) — 링크 표기식이 가짜 주소(`linkText = linkAddress ?? linkDisplayText`)로
  // 바뀌어 오염 앵커를 같은 커밋에 갱신했다(옛 앵커를 남기면 notEqual이 "오염 지점을 찾지 못했다"로 실패한다).
  const poisoned = sources[file].replace("aria-label={`링크: ${linkText}`}", "aria-label={`${linkText}`}");
  assert.notEqual(poisoned, sources[file], "오염 지점을 찾지 못했다");
  assert.deepEqual(ariaLabelViolations({ ...sources, [file]: poisoned }), ["A3"]);
});

// ── G443 — M-9 유지분이 "정리"되어 사라지지 않는다 ─────────────────────────────────────────
function degradedRetentionViolations(messenger: string, play: string, disclosure: string): string[] {
  const out: string[] = [];
  if (!disclosure.includes('"지금은 AI 응답을 사용할 수 없어 미리 준비된 대사로 진행합니다."')) out.push("DIALOGUE_DEGRADED_NOTICE 값 변경");
  const mIds = identifiersOf("m.tsx", messenger);
  const pIds = identifiersOf("p.tsx", play);
  if (!mIds.has("foldDegraded")) out.push("messenger foldDegraded");
  if (!mIds.has("DIALOGUE_DEGRADED_NOTICE")) out.push("messenger DIALOGUE_DEGRADED_NOTICE");
  if (!pIds.has("foldDegraded")) out.push("play foldDegraded");
  if (!pIds.has("buildFallbackStatusLine")) out.push("play buildFallbackStatusLine");
  return out;
}

test("[T187/G443] 강등 고지(AC-084) 값 무변경 · messenger·play가 계속 참조한다", () => {
  assert.deepEqual(
    degradedRetentionViolations(
      read("src/app/session/messenger/page.tsx"),
      read("src/app/session/play/page.tsx"),
      read("src/lib/report/degradedDisclosure.ts"),
    ),
    [],
  );
});

test("[T187/G443 역검증] 참조를 지운 사본은 실패한다", () => {
  const messenger = read("src/app/session/messenger/page.tsx").split("DIALOGUE_DEGRADED_NOTICE").join("REMOVED_NOTICE");
  assert.deepEqual(
    degradedRetentionViolations(messenger, read("src/app/session/play/page.tsx"), read("src/lib/report/degradedDisclosure.ts")),
    ["messenger DIALOGUE_DEGRADED_NOTICE"],
  );
});

// ── G449 — "훈련 종료" 위치(레이아웃 클래스) ──────────────────────────────────────────────
/** EndTrainingButton을 감싼 가장 가까운 `<div>`의 className과 그 div의 JSX 요소 자식 수. */
function endButtonContainers(file: string, code: string): { className: string; elementChildren: number; parentClassName: string; parentDivChildren: number }[] {
  const sf = sourceFileOf(file, code);
  const classOf = (el: ts.JsxElement) => {
    const attr = el.openingElement.attributes.properties.find(
      (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "className",
    ) as ts.JsxAttribute | undefined;
    return attr?.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : "";
  };
  const nearestDiv = (start: ts.Node | undefined): ts.JsxElement | undefined => {
    let node = start;
    while (node && !(ts.isJsxElement(node) && node.openingElement.tagName.getText(sf) === "div")) node = node.parent;
    return node as ts.JsxElement | undefined;
  };
  return findAll(sf, (n) => ts.isJsxSelfClosingElement(n) && n.tagName.getText(sf) === "EndTrainingButton").map((n) => {
    const div = nearestDiv(n.parent);
    const parentDiv = nearestDiv(div?.parent);
    const divChildren = (el: ts.JsxElement | undefined) =>
      el ? el.children.filter((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)).length : 0;
    return {
      className: div ? classOf(div) : "",
      elementChildren: divChildren(div),
      parentClassName: parentDiv ? classOf(parentDiv) : "",
      parentDivChildren: parentDiv
        ? parentDiv.children.filter((c) => ts.isJsxElement(c) && c.openingElement.tagName.getText(sf) === "div").length
        : 0,
    };
  });
}

function layoutViolations(sources: Record<string, string>): string[] {
  const out: string[] = [];
  for (const file of ["src/components/VerifyCallOverlay.tsx"]) {
    const [c] = endButtonContainers(file, sources[file]);
    if (!c || c.elementChildren !== 1) out.push(`${file}: 종료 버튼 헤더 행의 자식이 1개가 아니다`);
    else if (!/\bjustify-end\b/.test(c.className) || /\bjustify-between\b/.test(c.className)) out.push(`${file}: justify-end 아님`);
  }
  // ⭐ 사용자 결정(2026-10-18) — 문자함 헤더(InCallSmsOverlay)와 가짜 랜딩 브라우저 바(MessengerFakeLanding — 메신저·
  // 문자함 진입 둘 다)의 "훈련 종료"를 없앴다. 옛 G449 단언(그 자리가 justify-end)을 **"그 두 파일에 종료 버튼 0"** 으로
  // 반전했다. VerifyCallOverlay·MessengerStartNotice·메신저 대화 화면은 결정 밖이라 그대로다.
  for (const file of ["src/components/InCallSmsOverlay.tsx", "src/components/MessengerFakeLanding.tsx"]) {
    const count = endButtonContainers(file, sources[file]).length;
    if (count !== 0) out.push(`${file}: 종료 버튼이 ${count}개 있다(사용자 결정 2026-10-18 — 0이어야 한다)`);
  }
  {
    const file = "src/components/MessengerStartNotice.tsx";
    const [c] = endButtonContainers(file, sources[file]);
    if (!c || !/\bjustify-end\b/.test(c.className)) out.push(`${file}: 상단 바 justify-end 아님`);
  }
  {
    const file = "src/app/session/messenger/page.tsx";
    const containers = endButtonContainers(file, sources[file]);
    const header = containers.find((c) => /\bjustify-between\b/.test(c.parentClassName));
    if (!header || header.parentDivChildren !== 2) out.push(`${file}: 헤더 행 자식 div가 2개가 아니다(왼쪽 래퍼 존속)`);
  }
  return out;
}

const G449_FILES = [
  "src/components/VerifyCallOverlay.tsx",
  "src/components/InCallSmsOverlay.tsx",
  "src/components/MessengerFakeLanding.tsx",
  "src/components/MessengerStartNotice.tsx",
  "src/app/session/messenger/page.tsx",
];

test("[T187/G449] '훈련 종료'가 오른쪽 끝에 남는 레이아웃 클래스(정적 — 실제 배치는 브라우저 B-5)", () => {
  assert.deepEqual(layoutViolations(Object.fromEntries(G449_FILES.map((f) => [f, read(f)]))), []);
});

test("[T187/G449 역검증] justify-end → justify-between 사본은 실패한다", () => {
  const sources = Object.fromEntries(G449_FILES.map((f) => [f, read(f)]));
  const file = "src/components/VerifyCallOverlay.tsx";
  const poisoned = sources[file].replace("items-center justify-end gap-2", "items-center justify-between gap-2");
  assert.notEqual(poisoned, sources[file], "오염 지점을 찾지 못했다");
  assert.deepEqual(layoutViolations({ ...sources, [file]: poisoned }), [`${file}: justify-end 아님`]);
});

/** 사용자 결정(2026-10-18)이 **남기라고 한** 종료 컨트롤 2곳 — 통화 화면 빨간 통화 종료 · 메신저 대화 화면 "훈련 종료". */
function retainedEndControlViolations(play: string, messenger: string): string[] {
  const out: string[] = [];
  const playLabels = ariaLabelsOf("p.tsx", play);
  if (!playLabels.some((l) => l.kind === "string" && l.text === "통화 종료 — 훈련 종료")) out.push("통화 화면 빨간 통화 종료");
  const header = endButtonContainers("m.tsx", messenger).find((c) => /\bjustify-between\b/.test(c.parentClassName));
  if (!header) out.push("메신저 대화 화면 헤더의 훈련 종료");
  return out;
}

test("[사용자 결정 2026-10-18] 통화 화면 빨간 통화 종료와 메신저 대화 화면 '훈련 종료'는 그대로 있다", () => {
  assert.deepEqual(
    retainedEndControlViolations(read("src/app/session/play/page.tsx"), read("src/app/session/messenger/page.tsx")),
    [],
  );
});

test("[사용자 결정 2026-10-18 역검증] 남겨야 할 종료 컨트롤을 지운 사본은 각각 실패한다", () => {
  const play = read("src/app/session/play/page.tsx");
  const messenger = read("src/app/session/messenger/page.tsx");
  const playPoisoned = play.split('"통화 종료 — 훈련 종료"').join('"통화 종료"');
  const messengerPoisoned = messenger.split("<EndTrainingButton onClick={handleEndTraining} />").join("");
  assert.notEqual(playPoisoned, play, "오염 지점(빨간 통화 종료 이름)을 찾지 못했다");
  assert.notEqual(messengerPoisoned, messenger, "오염 지점(대화 화면 종료 버튼)을 찾지 못했다");
  assert.deepEqual(retainedEndControlViolations(playPoisoned, messenger), ["통화 화면 빨간 통화 종료"]);
  assert.deepEqual(retainedEndControlViolations(play, messengerPoisoned), ["메신저 대화 화면 헤더의 훈련 종료"]);
});

test("[사용자 결정 2026-10-18 · G449 역검증] 문자함 헤더·가짜 랜딩 브라우저 바에 종료 버튼을 되살린 사본은 각각 실패한다", () => {
  const sources = Object.fromEntries(G449_FILES.map((f) => [f, read(f)]));
  const sms = "src/components/InCallSmsOverlay.tsx";
  const landing = "src/components/MessengerFakeLanding.tsx";
  const smsAnchor = '<PhoneIcon name="chevron-back" size={24} />';
  const landingAnchor = "{landingHostFor(landingKind, landingId)}";
  const smsPoisoned = sources[sms].replace(smsAnchor, `${smsAnchor}<EndTrainingButton onClick={() => {}} />`);
  const landingPoisoned = sources[landing].replace(landingAnchor, `${landingAnchor}<EndTrainingButton onClick={() => {}} />`);
  assert.notEqual(smsPoisoned, sources[sms], "오염 지점(문자함 헤더)을 찾지 못했다");
  assert.notEqual(landingPoisoned, sources[landing], "오염 지점(랜딩 브라우저 바)을 찾지 못했다");
  assert.deepEqual(layoutViolations({ ...sources, [sms]: smsPoisoned }), [
    `${sms}: 종료 버튼이 1개 있다(사용자 결정 2026-10-18 — 0이어야 한다)`,
  ]);
  assert.deepEqual(layoutViolations({ ...sources, [landing]: landingPoisoned }), [
    `${landing}: 종료 버튼이 1개 있다(사용자 결정 2026-10-18 — 0이어야 한다)`,
  ]);
});
