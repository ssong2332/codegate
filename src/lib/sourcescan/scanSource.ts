// T108 — 소스 텍스트 스캔 게이트의 **검출 축**(AST) 공용 헬퍼 (docs/Architecture.md §24, S1~S6).
//
// ⚠️ **테스트 전용 모듈이다 — 앱 코드에서 import하지 않는다**(S1/G98). import하는 순간
// `typescript`가 클라이언트 번들 후보가 되고 테스트 도구가 제품 의존성으로 승격된다.
//
// **무엇을 바꾸는가**: 금지 토큰 목록(=요구)은 한 건도 바꾸지 않는다(§24.10 ⑧). 바뀌는 것은
// *어떤 축으로 찾는가* 뿐이다. 각 게이트는 현행 `includes(token)` 리터럴 검사를 **그대로 두고**
// 여기서 얻은 축을 **합집합으로 더한다**(N1 — 교체가 아니다. 걷어내면 "강화했는데 예전에 잡던
// 것을 놓치는" 회귀가 구조적으로 가능해진다).
//
// ── 자기 고지: 이 방식이 **못 막는 것**(§24.12 요약 — ⛔ "이제 우회 불가"가 아니다) ──────────
// 이 스캔의 위협 모델은 **개발자의 우발적 실수**이지 고의 난독화가 아니다. 소스 텍스트 스캔은
// 어떤 방식으로도 고의 난독화에 완전할 수 없다 — 런타임에 조립되는 문자열(`f()` 반환값, 객체
// 속성 경유, `atob("aW5wdXQ=")`, 외부 값)은 정적으로 결정 불가이고, 표현식이 낀 템플릿
// (`` `${a}뱅크` ``)은 접히지 않으며, 폴딩은 **새 문자열을 만들므로 새 오탐 표면**이기도 하다.
// 렌더 결과도 관측하지 못한다(이 저장소에는 React 렌더러 테스트 러너가 없다) — 소스 게이트는
// 필요조건일 뿐이다. 그리고 **스캔 대상 파일 집합은 고정이며 파일 분할로 무력화된다**(§24.8 —
// 파일 집합의 일반화는 요구 층 판단이라 T108 범위 밖으로 판정됐다). 게이트는 CI가 없어 사람이
// `npm test`를 칠 때만 돈다. 잡지 못하는 구체적 형태는 각 게이트의 `[T108/한계]` 테스트가
// **출력으로** 고지한다.
import ts from "typescript";
import { readFileSync } from "node:fs";

export type Axis =
  | "jsxElement"
  | "jsxAttribute"
  | "foldedString"
  | "callOrMember"
  | "importSpecifier";

export type ElementHit = { name: string; resolved: string; line: number };
export type AttributeHit = { name: string; values: string[]; line: number };
export type TextHit = { text: string; line: number };
export type CallHit = { text: string; args: string[]; line: number };

/** N4 — 위반 리포트는 구조체 배열이다(불리언으로 접지 않는다). */
export type ScanHit = {
  gate: string;
  token: string;
  axis: Axis | "dynamicTag";
  file: string;
  line: number;
  detail: string;
};

export type ParsedSource = {
  file: string;
  /** 해석값 포함 JSX 요소명. */
  jsxElementNames(): ElementHit[];
  /** 표현식 컨테이너·computed key·spread된 객체 리터럴 키를 포함한 JSX 속성. */
  jsxAttributeNames(): AttributeHit[];
  /** 문자열 리터럴 + `+` 연결 폴딩 결과 + 표현식 없는 템플릿. */
  foldedStringLiterals(): TextHit[];
  /** `fetch(`·`window.open`·`landingId.startsWith` 류(computed 접근 폴딩 포함). */
  callAndMemberNames(): CallHit[];
  /** `@/lib/api` 류 — 정적 import·export·동적 `import()` 인자. */
  importModuleSpecifiers(): TextHit[];
  /** N2 — 값이 무엇인지 해석되지 않는 동적 태그(import도 파일 내 함수/컴포넌트 선언도 아님). */
  unresolvedDynamicTags(): TextHit[];
};

/**
 * S3 — **폴딩 범위를 좁게 고정한다.** 문자열 리터럴과 문자열 `+` 연결 **1단계만** 접는다.
 * 재대입 추적·함수 반환·객체 속성 경유는 **하지 않는다**(G95). 그 공백은 N2와 자기 고지가 받는다.
 */
function foldExpression(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return foldExpression(node.expression);
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return foldExpression(node.expression);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = foldExpression(node.left);
    const right = foldExpression(node.right);
    return left !== null && right !== null ? left + right : null;
  }
  return null;
}

/** `window.open` · `globalThis["fet"+"ch"]` → `globalThis.fetch` 처럼 **점 표기 이름**으로 편다. */
function dottedName(node: ts.Node): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (node.kind === ts.SyntaxKind.ThisKeyword) return "this";
  if (ts.isParenthesizedExpression(node)) return dottedName(node.expression);
  // `(globalThis as any)["fet"+"ch"]` — 타입 단언·non-null 단언은 값 경로가 아니다(투과시킨다).
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
    return dottedName(node.expression);
  }
  if (ts.isPropertyAccessExpression(node)) {
    const base = dottedName(node.expression);
    return base === null ? null : `${base}.${node.name.text}`;
  }
  if (ts.isElementAccessExpression(node)) {
    const base = dottedName(node.expression);
    const key = foldExpression(node.argumentExpression);
    return base === null || key === null ? null : `${base}.${key}`;
  }
  return null;
}

/** S5 — 파싱 실패·statements 0건은 **예외**다. 조용한 통과(G97)를 만들지 않는다. */
export function parseTsx(file: string, code: string): ParsedSource {
  const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (code.trim().length > 0 && sourceFile.statements.length === 0) {
    throw new Error(`[sourcescan] ${file}: 코드가 있는데 구문을 하나도 파싱하지 못했다(S5)`);
  }

  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  // ── 파일 스코프 const/let의 문자열 초기화만 폴딩 표로 만든다(S3). ──
  const folded = new Map<string, string>();
  const declared = new Set<string>();
  const noteDeclared = (name: ts.BindingName | undefined) => {
    if (name && ts.isIdentifier(name)) declared.add(name.text);
  };
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      noteDeclared(statement.importClause.name);
      const bindings = statement.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) declared.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) declared.add(element.name.text);
      }
      continue;
    }
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      noteDeclared(statement.name);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      const isConstOrLet =
        (statement.declarationList.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)) !== 0;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const value = declaration.initializer && isConstOrLet
          ? foldExpression(declaration.initializer)
          : null;
        if (value !== null) {
          folded.set(declaration.name.text, value);
          continue;
        }
        // 함수/컴포넌트 선언으로 인정하는 것은 **함수·클래스 표현식뿐**이다.
        // `const T = mk()`(함수 반환값)는 여기 들지 않으므로 N2가 잡는다.
        const initializer = declaration.initializer;
        if (
          initializer &&
          (ts.isArrowFunction(initializer) ||
            ts.isFunctionExpression(initializer) ||
            ts.isClassExpression(initializer))
        ) {
          declared.add(declaration.name.text);
        }
      }
    }
  }

  const elements: ElementHit[] = [];
  const attributes: AttributeHit[] = [];
  const literals: TextHit[] = [];
  const calls: CallHit[] = [];
  const imports: TextHit[] = [];
  const dynamicTags: TextHit[] = [];

  const collectAttributes = (node: ts.JsxAttributes) => {
    for (const property of node.properties) {
      if (ts.isJsxAttribute(property)) {
        const values: string[] = [];
        const initializer = property.initializer;
        if (initializer) {
          if (ts.isStringLiteral(initializer)) values.push(initializer.text);
          else if (ts.isJsxExpression(initializer) && initializer.expression) {
            const value = foldExpression(initializer.expression);
            if (value !== null) values.push(value);
          }
        }
        attributes.push({ name: property.name.getText(sourceFile), values, line: lineOf(property) });
        continue;
      }
      // `{...{["onSub"+"mit"]: handler}}` — spread된 **객체 리터럴**의 키까지 본다.
      if (ts.isJsxSpreadAttribute(property) && ts.isObjectLiteralExpression(property.expression)) {
        for (const member of property.expression.properties) {
          if (!member.name) continue;
          let name: string | null = null;
          if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) name = member.name.text;
          else if (ts.isComputedPropertyName(member.name)) name = foldExpression(member.name.expression);
          if (name === null) continue;
          const values: string[] = [];
          if (ts.isPropertyAssignment(member)) {
            const value = foldExpression(member.initializer);
            if (value !== null) values.push(value);
          }
          attributes.push({ name, values, line: lineOf(member) });
        }
      }
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const raw = node.tagName.getText(sourceFile);
      const resolved = folded.get(raw) ?? raw;
      elements.push({ name: raw, resolved, line: lineOf(node) });
      // N2 — 대문자로 시작하는 식별자 태그인데 폴딩도 선언도 되지 않으면 **값을 몰라도 실패**시킨다.
      if (
        ts.isIdentifier(node.tagName) &&
        /^[A-Z]/.test(raw) &&
        !folded.has(raw) &&
        !declared.has(raw)
      ) {
        dynamicTags.push({ text: raw, line: lineOf(node) });
      }
      collectAttributes(node.attributes);
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      literals.push({ text: node.text, line: lineOf(node) });
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const value = foldExpression(node);
      if (value !== null) literals.push({ text: value, line: lineOf(node) });
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const text = dottedName(node);
      if (text !== null) calls.push({ text, args: [], line: lineOf(node) });
    }
    if (ts.isCallExpression(node)) {
      const text = dottedName(node.expression);
      const args = node.arguments.map((argument) => {
        if (ts.isIdentifier(argument)) return argument.text;
        return foldExpression(argument) ?? dottedName(argument) ?? "";
      });
      if (text !== null) calls.push({ text, args, line: lineOf(node) });
      // 동적 `import("...")`의 인자도 모듈 지정자다.
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0]) {
        const specifier = foldExpression(node.arguments[0]);
        if (specifier !== null) imports.push({ text: specifier, line: lineOf(node) });
      }
    }

    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push({ text: node.moduleSpecifier.text, line: lineOf(node) });
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return {
    file,
    jsxElementNames: () => elements,
    jsxAttributeNames: () => attributes,
    foldedStringLiterals: () => literals,
    callAndMemberNames: () => calls,
    importModuleSpecifiers: () => imports,
    unresolvedDynamicTags: () => dynamicTags,
  };
}

/** 디스크에서 읽어 파싱한다(게이트가 실제 파일을 볼 때 쓴다). */
export function parseTsxFile(file: string): ParsedSource {
  return parseTsx(file, readFileSync(file, "utf8"));
}

/** `landingId.startsWith` 같은 점 표기 토큰이 이름 안에 **연속 구간**으로 있는가. */
function dottedSegmentsMatch(name: string, token: string): boolean {
  const nameSegments = name.split(".");
  const tokenSegments = token.split(".");
  for (let index = 0; index + tokenSegments.length <= nameSegments.length; index += 1) {
    if (tokenSegments.every((segment, offset) => nameSegments[index + offset] === segment)) return true;
  }
  return false;
}

/**
 * **S4 — 무엇이 금지인가는 각 테스트 파일에 남는다.** 여기서는 *토큰을 어느 축에서 찾는가*의
 * 기계만 제공한다. 토큰 표기는 기존 리터럴 검사의 것을 **그대로** 받는다(요구 무변경):
 * `<input`(요소) · `onSubmit`·`href=`·`role="textbox"`(속성) · `fetch(`·`window.open`(호출/멤버) ·
 * `http://`·`.apk`(문자열) · `@/lib/api`(import) · `test(landingId`(호출+인자).
 */
export function findTokenHits(
  parsed: ParsedSource,
  gate: string,
  token: string,
  axes: Axis[],
): ScanHit[] {
  const hits: ScanHit[] = [];
  const push = (axis: Axis, line: number, detail: string) =>
    hits.push({ gate, token, axis, file: parsed.file, line, detail });

  for (const axis of axes) {
    if (axis === "jsxElement") {
      const wanted = token.replace(/^</, "");
      for (const element of parsed.jsxElementNames()) {
        if (element.name === wanted || element.resolved === wanted) {
          push("jsxElement", element.line, `<${element.name}> → ${element.resolved}`);
        }
      }
    }
    if (axis === "jsxAttribute") {
      const withValue = /^([^=]+)="(.*)"$/.exec(token);
      const wanted = withValue ? withValue[1] : token.replace(/=$/, "");
      for (const attribute of parsed.jsxAttributeNames()) {
        if (attribute.name !== wanted) continue;
        if (withValue && !attribute.values.includes(withValue[2])) continue;
        push(
          "jsxAttribute",
          attribute.line,
          `${attribute.name}${attribute.values.length ? `=${JSON.stringify(attribute.values[0])}` : ""}`,
        );
      }
    }
    if (axis === "foldedString") {
      for (const literal of parsed.foldedStringLiterals()) {
        if (literal.text.includes(token)) push("foldedString", literal.line, literal.text);
      }
    }
    if (axis === "callOrMember") {
      const withArg = /^([^(]+)\((.+)$/.exec(token);
      const wanted = withArg ? withArg[1] : token.replace(/\($/, "");
      for (const call of parsed.callAndMemberNames()) {
        if (!dottedSegmentsMatch(call.text, wanted)) continue;
        if (withArg && !call.args.includes(withArg[2])) continue;
        push("callOrMember", call.line, `${call.text}(${call.args.join(", ")})`);
      }
    }
    if (axis === "importSpecifier") {
      for (const specifier of parsed.importModuleSpecifiers()) {
        if (specifier.text.includes(token)) push("importSpecifier", specifier.line, specifier.text);
      }
    }
  }
  return hits;
}

/** N2 위반을 게이트 리포트 형식으로 낸다. */
export function findDynamicTagHits(parsed: ParsedSource, gate: string): ScanHit[] {
  return parsed.unresolvedDynamicTags().map((tag) => ({
    gate,
    token: tag.text,
    axis: "dynamicTag" as const,
    file: parsed.file,
    line: tag.line,
    detail: `<${tag.text}>의 값이 해석되지 않는다(import도 파일 내 함수/컴포넌트 선언도 아님 — N2)`,
  }));
}

/** 여러 토큰을 한 번에 훑어 **구조체 배열**로 낸다(N4). */
export function scanTokens(
  parsed: ParsedSource,
  gate: string,
  axesByToken: Record<string, Axis[]>,
): ScanHit[] {
  return Object.entries(axesByToken).flatMap(([token, axes]) =>
    findTokenHits(parsed, gate, token, axes),
  );
}

/** 리포트를 사람이 읽는 한 줄로(실패 메시지에 그대로 붙인다). */
export function formatHits(hits: ScanHit[]): string {
  return hits
    .map((hit) => `${hit.file}:${hit.line} [${hit.gate}/${hit.axis}] ${hit.token} — ${hit.detail}`)
    .join("\n");
}
