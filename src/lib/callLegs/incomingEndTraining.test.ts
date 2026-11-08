// 2026-11-08 라이브 재시험 12(main `d72e4b6f` · 카드사 부정결제 고급 레그 경로) — 참가자가 "통화 종료"로 끊으면 약 30초 뒤 같은 번호가
// 다시 건다. 그 수신 화면(`CallLegScreens` incoming) 단추가 "전화 거절" · "전화 받기"뿐이라 훈련을 바로 끝낼 수 없었다
// (첫 수신 화면은 "전화 거절 — 훈련 종료"). '언제든 훈련 종료'(AC-006) — 수신 화면에도 전화 앱과 같은 훈련 종료를 둔다.
//
// | # | If | Then |
// |---|---|---|
// | I1 | 다시 걸려 온 전화(incoming) · iOS형 | 오른쪽 위 훈련 종료(`LegEndTrainingPill` → `onEndTraining`) · 거절 = `onDecline`(그 전화만) |
// | I2 | 다시 걸려 온 전화(incoming) · One UI형 · 기본 | I1과 같다(훈련 종료는 스킨 분기 밖 — 배치만 다른 받기 · 거절과 무관) |
// | I3 | 전화 앱 키패드 | 같은 컨트롤(`LegEndTrainingPill`) 그대로 — 바탕만 화면 밝기로 |
// | I4 | 첫 수신 화면(page.tsx 벨) | 무변경 — "전화 거절 — 훈련 종료" 그대로 · 수신 화면 컨트롤 0 |
// | I5 | 거절 단추 이름 | "전화 거절" 그대로(훈련 종료 아님 — 거절도 방어 행동 · 훈련 계속) |
//
// 정적 검사(TypeScript AST)다 — 이 컴포넌트는 `@/` 경로를 써서 렌더 하네스(`MessengerFakeLanding` 1개 고정)로 그리지 않는다.
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const SCREENS = "src/components/CallLegScreens.tsx";

/** `if (screen.kind === "<kind>") { … }` 블록(없으면 null). */
function kindBlock(sf: ts.SourceFile, kind: string): ts.Block | null {
  let found: ts.Block | null = null;
  const visit = (node: ts.Node) => {
    if (
      !found &&
      ts.isIfStatement(node) &&
      node.expression.getText(sf).replace(/\s+/g, " ") === `screen.kind === "${kind}"` &&
      ts.isBlock(node.thenStatement)
    ) {
      found = node.thenStatement;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

type JsxEl = { node: ts.JsxSelfClosingElement | ts.JsxOpeningElement; tag: string; attrs: Map<string, string> };

function jsxElements(sf: ts.SourceFile, root: ts.Node): JsxEl[] {
  const out: JsxEl[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const attrs = new Map<string, string>();
      for (const prop of node.attributes.properties) {
        if (ts.isJsxAttribute(prop) && prop.initializer) attrs.set(prop.name.getText(sf), prop.initializer.getText(sf));
        else if (ts.isJsxAttribute(prop)) attrs.set(prop.name.getText(sf), "true");
      }
      out.push({ node, tag: node.tagName.getText(sf), attrs });
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return out;
}

/** 요소가 스킨 조건(`ios` · `oneUi9` · `layout`) 아래에 있는가 — 블록까지 거슬러 올라가며 본다. */
function underSkinCondition(sf: ts.SourceFile, el: ts.Node, stop: ts.Node): boolean {
  for (let n: ts.Node | undefined = el.parent; n && n !== stop; n = n.parent) {
    const cond = ts.isConditionalExpression(n)
      ? n.condition
      : ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken)
        ? n.left
        : null;
    if (cond && /\b(ios|oneUi9|layout|skin)\b/.test(cond.getText(sf))) return true;
  }
  return false;
}

/** 판정표 I1 · I2 · I5 위반 목록(본 게이트 · 역검증 공용 — 같은 함수). */
function incomingViolations(code: string): string[] {
  const sf = ts.createSourceFile(SCREENS, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const block = kindBlock(sf, "incoming");
  if (!block) return ["incoming 블록 없음"];
  const out: string[] = [];
  const els = jsxElements(sf, block);
  const pills = els.filter((e) => e.tag === "LegEndTrainingPill");
  if (pills.length !== 1) out.push(`I1 · 훈련 종료 컨트롤 ${pills.length}개(정확히 1개)`);
  for (const pill of pills) {
    if (pill.attrs.get("onClick") !== "{props.onEndTraining}") out.push(`I1 · 훈련 종료 onClick = ${pill.attrs.get("onClick")}`);
    if (underSkinCondition(sf, pill.node, block)) out.push("I2 · 훈련 종료가 스킨 조건 아래 — 한쪽 스킨에서 빠진다");
  }
  const decline = els.filter((e) => e.tag === "RoundButton" && e.attrs.get("onClick") === "{props.onDecline}");
  if (decline.length !== 1) out.push(`I5 · 거절 단추 ${decline.length}개`);
  for (const d of decline) if (d.attrs.get("label") !== '"전화 거절"') out.push(`I5 · 거절 이름 = ${d.attrs.get("label")}`);
  if (els.some((e) => e.tag === "RoundButton" && e.attrs.get("onClick") === "{props.onEndTraining}")) {
    out.push("I5 · 받기 · 거절 원에 훈련 종료가 물렸다");
  }
  return out;
}

test("[재시험 12 · 표 I1 · I2 · I5] 다시 걸려 온 전화 = 오른쪽 위 훈련 종료 1개(두 스킨 공통) · 거절은 그 전화만", () => {
  assert.deepEqual(incomingViolations(read(SCREENS)), []);
});

test("[표 I1 · I2 역검증] 같은 판정 함수가 컨트롤 누락 · 스킨 한쪽 · 다른 처리기 · 거절 이름 변경을 잡는다", () => {
  const code = read(SCREENS);
  const anchor = "<LegEndTrainingPill onDark onClick={props.onEndTraining} />";
  assert.equal(code.split(anchor).length - 1, 1, "오염 지점이 하나여야 한다");
  const poison = (to: string) => {
    const p = code.replace(anchor, to);
    assert.notEqual(p, code, "오염이 실제로 만들어졌다");
    return incomingViolations(p);
  };
  assert.ok(poison("").some((v) => v.startsWith("I1")), "누락");
  assert.ok(poison(`{ios && ${anchor}}`).some((v) => v.startsWith("I2")), "iOS형에만");
  assert.ok(poison(`{tokens.layout === "oneui" ? ${anchor} : null}`).some((v) => v.startsWith("I2")), "One UI형에만");
  assert.ok(poison("<LegEndTrainingPill onDark onClick={props.onDecline} />").some((v) => v.startsWith("I1")), "거절 처리기에 물림");
  const renamed = code.replace('<RoundButton label="전화 거절" color', '<RoundButton label="전화 거절 — 훈련 종료" color');
  assert.notEqual(renamed, code);
  assert.ok(incomingViolations(renamed).some((v) => v.startsWith("I5")), "거절 이름");
});

test("[표 I3] 전화 앱 키패드 · 수신 화면이 같은 컨트롤 — 접근 가능한 이름 '훈련 종료'(G437 닫힌 예외 꼴)", () => {
  const code = read(SCREENS);
  const sf = ts.createSourceFile(SCREENS, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const pills = jsxElements(sf, sf).filter((e) => e.tag === "LegEndTrainingPill");
  assert.equal(pills.length, 2, "키패드 1 + 수신 1");
  assert.ok(pills.every((p) => p.attrs.get("onClick") === "{props.onEndTraining}"));
  // 컨트롤 정의 — 이름 · 글자 모두 정확히 "훈련 종료"(AC-086 (f) 예외 문면 그대로 · 다른 낱말 0).
  const def = code.slice(code.indexOf("function LegEndTrainingPill("), code.indexOf("/** 통화 화면 같은 바탕"));
  assert.ok(def.includes('aria-label="훈련 종료"'));
  assert.ok(/>\s*<span aria-hidden="true"[^>]*\/>\s*훈련 종료\s*<\/button>/.test(def));
  // 종전 키패드 단추 인라인 사본 0(한 컨트롤만).
  assert.equal(code.split('aria-label="훈련 종료"').length - 1, 1);
});

test("[표 I4] 첫 수신 화면(page.tsx 벨)은 무변경 — '전화 거절 — 훈련 종료' 그대로 · 통화 사이 컨트롤 0", () => {
  const page = read("src/app/session/play/page.tsx");
  assert.equal(page.split('aria-label="전화 거절 — 훈련 종료"').length - 1, 1);
  assert.ok(!page.includes("LegEndTrainingPill"));
  // 통화 사이 화면 배선 그대로 — 거절 = 그 전화만 · 훈련 종료 = endTrainingFromLeg.
  assert.ok(page.includes('onDecline={() => void hangupCurrentLeg("decline")}'));
  assert.ok(page.includes("onEndTraining={endTrainingFromLeg}"));
});
