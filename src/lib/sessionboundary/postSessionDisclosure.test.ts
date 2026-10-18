// T187 — 세션 후 사실 공개(UX-007) 게이트 (docs/Architecture.md §72.5 D4 · §72.7 G445 · G448 ·
// PRD v1.18 AC-089 (a)(b)(c) — "PRD v1.18 AC-089 · T187 · §72").
//
// ⭐ §46.3 규범("화면이 X를 했다고 말하면, 고지는 X를 하지 않았다고 말한다")은 **유지되고 층만 옮겼다**
// (ADR-0018): 세션 중 화면의 부정은 0이고(AC-086 (d)), 세션 후 상수 1개가 모든 주장 종류를 부정한다.
// 주장 종류 ↔ 부정 낱말 대응을 아래 등록부로 고정한다 — 새 목업 kind가 생기면 등록 없이는 실패한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { POST_SESSION_FACT_DISCLOSURE } from "./postSessionCopy.ts";
import { MESSENGER_START_NOTICE } from "./preSessionCopy.ts";

const read = (file: string) => readFileSync(file, "utf8");
const END_PAGE = "src/app/session/end/page.tsx";

const CANONICAL_DISCLOSURE =
  "훈련 중 화면에서 무엇을 입력하거나 누르셨더라도 실제로는 어떤 정보도 전송되지 않았고, 돈도 오가지 않았으며, 아무것도 설치되거나 허용되지 않았고, 실제 전화도 걸리지 않았습니다.";

// ── G445 렌더 무조건성 ─────────────────────────────────────────────────────────────────────
function disclosureRenderViolations(source: string): string[] {
  const sf = ts.createSourceFile("end.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const uses: ts.JsxExpression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxExpression(n) && n.expression && ts.isIdentifier(n.expression) && n.expression.text === "POST_SESSION_FACT_DISCLOSURE") {
      uses.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (uses.length !== 1) return [`{POST_SESSION_FACT_DISCLOSURE} JSX 식이 ${uses.length}회다(정확히 1회)`];
  const out: string[] = [];
  let node: ts.Node | undefined = uses[0].parent;
  let reachedReturn = false;
  while (node) {
    if (ts.isConditionalExpression(node)) out.push("삼항 조건 아래에 있다");
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) out.push("&&/|| 조건 아래에 있다");
      if (op === ts.SyntaxKind.EqualsToken) out.push(`대입식(${node.left.getText(sf)} = …) 안에 있다 — 상태별 body 분기`);
    }
    if (ts.isIfStatement(node)) out.push("if 블록 안에 있다");
    if (ts.isReturnStatement(node)) {
      const fn = node.parent?.parent;
      reachedReturn = !!fn && ts.isFunctionDeclaration(fn) && fn.name?.text === "SessionEndPage";
      break;
    }
    node = node.parent;
  }
  if (!reachedReturn) out.push("컴포넌트 최상위 return 안이 아니다");
  return out;
}

test("[T187/G445] UX-007이 사실 공개 문장을 **조건 없이** 정확히 1회 렌더한다(모든 상태 · 모든 종료 경로)", () => {
  assert.deepEqual(disclosureRenderViolations(read(END_PAGE)), []);
  assert.equal(POST_SESSION_FACT_DISCLOSURE, CANONICAL_DISCLOSURE, "UX-007 v1.29 노트 (1) 정본과 글자 단위로 같아야 한다");
});

test("[T187/G445 역검증] `{state === \"ended\" && …}`로 감싼 사본은 실패한다", () => {
  const source = read(END_PAGE);
  const poisoned = source.replace(
    "{POST_SESSION_FACT_DISCLOSURE}</p>",
    '{state === "ended" && POST_SESSION_FACT_DISCLOSURE}</p>',
  );
  assert.notEqual(poisoned, source, "오염 지점을 찾지 못했다");
  // 식이 바뀌어 단독 식별자 JSX 식이 0이 된다 — 1회 단언이 먼저 걸린다.
  assert.ok(disclosureRenderViolations(poisoned).length >= 1);
  const wrapped = source.replace(
    '<p className="text-base leading-[1.7] text-[#6B655C]">{POST_SESSION_FACT_DISCLOSURE}</p>',
    '{state === "ended" && <p className="text-base leading-[1.7] text-[#6B655C]">{POST_SESSION_FACT_DISCLOSURE}</p>}',
  );
  assert.notEqual(wrapped, source, "오염 지점을 찾지 못했다");
  assert.ok(disclosureRenderViolations(wrapped).some((v) => v.includes("&&")));
});

// ── G445 주장 종류 ↔ 부정 낱말 등록부(§46.3 규범의 새 자리) ───────────────────────────────
const CLAIM_NEGATION_REGISTRY: Record<string, string[]> = {
  "credential-form": ["전송", "돈"], // 가짜 랜딩 제출 — 정보 전송·송금 주장
  "app-install": ["설치", "허용"], // 모의 앱 설치·권한 허용 주장
  "verify-call": ["전화"], // 확인 부서 연결(UX-031) — 전화 연결 주장
};

function mockScreenKinds(typesSource: string): string[] {
  const union = /export type MockScreenKind = ([^;]+);/.exec(typesSource)?.[1];
  assert.ok(union, "src/lib/api/types.ts에서 MockScreenKind 유니언을 찾지 못했다");
  return [...union.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function registryViolations(kinds: string[], registry: Record<string, string[]>, disclosure: string): string[] {
  const out: string[] = [];
  for (const kind of [...kinds, "verify-call"]) {
    if (!registry[kind]) out.push(`주장 종류 ${kind}가 등록부에 없다`);
  }
  for (const [kind, words] of Object.entries(registry)) {
    for (const word of words) if (!disclosure.includes(word)) out.push(`${kind}: 부정 낱말 "${word}"가 사실 공개에 없다`);
  }
  return out;
}

test("[T187/G445] 등록부 키 ⊇ MockScreenKind ∪ {verify-call} · 각 부정 낱말이 사실 공개 문장에 있다", () => {
  const kinds = mockScreenKinds(read("src/lib/api/types.ts"));
  assert.deepEqual(kinds, ["credential-form", "app-install"]);
  assert.deepEqual(registryViolations(kinds, CLAIM_NEGATION_REGISTRY, POST_SESSION_FACT_DISCLOSURE), []);
});

test("[T187/G445 역검증] '전화'를 뺀 상수 사본 · 등록부에 없는 kind를 더한 유니언 사본은 실패한다", () => {
  const kinds = mockScreenKinds(read("src/lib/api/types.ts"));
  const withoutPhone = POST_SESSION_FACT_DISCLOSURE.replace(", 실제 전화도 걸리지 않았습니다", "");
  assert.notEqual(withoutPhone, POST_SESSION_FACT_DISCLOSURE);
  assert.deepEqual(registryViolations(kinds, CLAIM_NEGATION_REGISTRY, withoutPhone), [
    'verify-call: 부정 낱말 "전화"가 사실 공개에 없다',
  ]);
  const extended = mockScreenKinds('export type MockScreenKind = "credential-form" | "app-install" | "transfer-form";');
  assert.deepEqual(registryViolations(extended, CLAIM_NEGATION_REGISTRY, POST_SESSION_FACT_DISCLOSURE), [
    "주장 종류 transfer-form가 등록부에 없다",
  ]);
});

// ── AC-089 (a) 정체 공개 문면 무변경 ───────────────────────────────────────────────────────
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

test("[T187/AC-089 (a)] UX-007 제목·단독/2인 디스컬레이션 원문이 그대로 있다", () => {
  const source = normalize(read(END_PAGE));
  for (const text of [
    "이것은 훈련이었습니다",
    "님이 준비한 훈련이었습니다. 실제 상황이 아니었습니다. 지금까지 대화한 상대는 실제 사기범이 아니라 AI로 합성한 목소리였습니다. 실제로 돈이나 개인정보가 오간 것은 없으니 안심하셔도 됩니다.",
    "지금까지 대화한 상대는 실제 사기범이 아니라 AI 훈련 프로그램이었습니다. 실제로 돈이나 개인정보가 오간 것은 없으니 안심하셔도 됩니다. 오늘 연습한 경험을 잘 기억해 두시면, 실제 상황에서도 도움이 될 거예요.",
  ]) {
    assert.ok(source.includes(text), `정체 공개 원문이 바뀌었다(AC-089 (a)): ${text}`);
  }
});

// ── G448 루트 쪽 드리프트 — functions G-D 목록이 두 모듈 값을 글자 그대로 담는다 ─────────────
test("[T187/G448 드리프트] functions mockScreens.test.ts의 ACTIVE 목록에 세션 경계 문면 값이 글자 그대로 있다", () => {
  const functionsTest = read("functions/src/scenarios/__tests__/mockScreens.test.ts");
  const active = functionsTest.slice(
    functionsTest.indexOf("const ACTIVE_SHARED_NOTICES"),
    functionsTest.indexOf("const RETIRED_IN_SESSION_NOTICES"),
  );
  assert.ok(active.length > 0, "ACTIVE_SHARED_NOTICES 블록을 찾지 못했다");
  for (const value of [POST_SESSION_FACT_DISCLOSURE, MESSENGER_START_NOTICE.notice, "훈련 종료"]) {
    assert.ok(active.includes(JSON.stringify(value)), `functions G-D ACTIVE 목록이 루트 정본과 갈라졌다: ${value}`);
  }
});
