// T190-5/6/6b — 한 세션 = 한 스킨 · 세션 전 화면 모양 줄 · 세션 중 전환 컨트롤 0
// (docs/Architecture.md §74.5 (2) · §74.10 (2)(3) · UX D-88 · D-100 · PRD AC-092 (b)(d)(e)(g)ⓐⓑ · AC-031 읽기 고지).
//
// ⚠️ 렌더러 테스트 러너가 없어 소스 구조로 고정한다(다른 세션 경계 게이트와 같은 관례 — 실제 화면은 실기 P-3/P-5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { DEVICE_SKIN_PICKER_COPY } from "../sessionboundary/preSessionCopy.ts";
import { DEVICE_SKIN_CHOICE_LABELS, pickerStartsCollapsed } from "./deviceSkin.ts";

const read = (file: string) => readFileSync(file, "utf8");
const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const MESSENGER = "src/app/session/messenger/page.tsx";
const PLAY = "src/app/session/play/page.tsx";
const NOTICE = "src/components/MessengerStartNotice.tsx";

test("[T190/UX-014 v1.33 (11) ②] 화면 모양 줄 정본 문면 — 글자 그대로", () => {
  assert.deepEqual(
    { ...DEVICE_SKIN_PICKER_COPY },
    {
      collapsedPrefix: "화면 모양: ",
      changeLabel: "바꾸기",
      expandedPrompt: "사용하시는 휴대폰과 같은 화면 모양을 골라 주세요.",
    },
  );
  assert.deepEqual(DEVICE_SKIN_CHOICE_LABELS, { ios: "iOS형", samsung: "One UI형" });
});

test("[T190/D-100] 접힘/펼침 시작 — 감지 성공·이전 선택 = 접힘 · 감지 실패 = 펼침 · default(라벨 없음) = 펼침", () => {
  assert.equal(pickerStartsCollapsed("ios", "auto"), true);
  assert.equal(pickerStartsCollapsed("samsung", "manual"), true);
  assert.equal(pickerStartsCollapsed("default", "fallback"), false);
  assert.equal(pickerStartsCollapsed("default", "auto"), false);
  assert.equal(pickerStartsCollapsed("ios", "fallback"), false);
});

function lastReturnText(source: string, componentName: string): string {
  const sf = ts.createSourceFile("m.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let component: ts.FunctionDeclaration | undefined;
  sf.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === componentName) component = n;
  });
  const last = component?.body?.statements.filter(ts.isReturnStatement).at(-1);
  assert.ok(last, `${componentName}의 마지막 return을 찾지 못했다`);
  return last.getText(sf);
}

/** AC-092 (d) — 세션 중 화면(메신저 채팅 return · 통화 화면)에 스킨 전환 컨트롤·스킨 이름·감지 실패 안내 0. */
function inSessionSkinControlViolations(messenger: string, play: string): string[] {
  const out: string[] = [];
  const chat = codeOnly(lastReturnText(messenger, "MessengerSessionPage"));
  for (const token of ["DeviceSkinPicker", "handleToggleSkin", "handleChooseSkin", "SKIN_LABEL", "스킨:", "화면 모양", "iOS형", "One UI형", "자동 인식하지 못해"]) {
    if (chat.includes(token)) out.push(`메신저 채팅 return에 ${token}`);
  }
  if (codeOnly(messenger).includes("handleToggleSkin")) out.push("메신저에 세션 중 스킨 토글 핸들러가 남았다");
  const playCode = codeOnly(play);
  for (const token of ["DeviceSkinPicker", "DEVICE_SKIN_CHOICE_LABELS", "iOS형", "One UI형", "화면 모양"]) {
    if (playCode.includes(token)) out.push(`통화 화면에 ${token}`);
  }
  return out;
}

test("[T190-6b/AC-092 (d) · AC-031 읽기 고지] 세션 중 화면에 스킨 전환 칩·스킨 이름·감지 실패 안내 0", () => {
  assert.deepEqual(inSessionSkinControlViolations(read(MESSENGER), read(PLAY)), []);
});

test("[T190-6b 역검증 — AC-092 (g)ⓐ] 세션 중 채팅에 전환 칩을 되살린 사본은 실패한다", () => {
  const messenger = read(MESSENGER);
  const anchor = messenger.lastIndexOf("<EndTrainingButton onClick={handleEndTraining} compact={!isSms} />"); // §95 — 카톡형 작은 모양 prop
  assert.ok(anchor > 0, "오염 지점을 찾지 못했다");
  const poisoned =
    messenger.slice(0, anchor) +
    '<button type="button" onClick={handleToggleSkin}>스킨: iOS형 (탭하여 전환)</button>\n' +
    messenger.slice(anchor);
  assert.ok(inSessionSkinControlViolations(poisoned, read(PLAY)).length >= 2);
});

/** AC-092 (b) — 통화 셸·문자함·랜딩 브라우저 바가 **같은 해석 결과**(`deviceSkin.skin`)를 받는다. */
function sameSkinViolations(play: string): string[] {
  const code = codeOnly(play);
  const out: string[] = [];
  // §89.5 ⓒ — 둘째 인자(기기 테마)가 붙을 수 있다 — 스킨 인자가 deviceSkin.skin인지만 본다.
  if (!/callTokensFor\(deviceSkin\.skin[,)]/.test(code)) out.push("통화 셸이 deviceSkin.skin을 쓰지 않는다");
  if (!code.includes("bannerTokensFor(deviceSkin.skin)")) out.push("배너가 deviceSkin.skin을 쓰지 않는다");
  if (!/<InCallSmsOverlay[\s\S]*?skin=\{deviceSkin\.skin\}/.test(code)) out.push("문자함이 통화 셸과 같은 스킨을 받지 않는다");
  // T190-8b(§74.12 (3) ⑥) — 정하는 지점 = 세션 로드 1곳 + 벨 직전 고지(세션 전)의 화면 모양 선택 1곳. 둘 외의 지점이
  // 생기면 세션 중(벨 이후)에 스킨이 바뀔 수 있다.
  if ((code.match(/setDeviceSkin\(/g) ?? []).length !== 2) out.push("스킨을 정하는 지점이 2곳(로드·세션 전 선택)이 아니다");
  const chooser = code.slice(code.indexOf("const handleChooseCallSkin"), code.indexOf("const handleAnswer"));
  if (!chooser.includes("setDeviceSkin({ skin: next, source: \"manual\" })")) out.push("세션 전 선택 지점이 handleChooseCallSkin 밖이다");
  if ((code.match(/onChange: handleChooseCallSkin/g) ?? []).length !== 1 || !/<CallStartNotice[\s\S]*?onChange: handleChooseCallSkin/.test(code)) {
    out.push("세션 전 선택 핸들러가 CallStartNotice 밖에서 쓰인다");
  }
  return out;
}

test("[T190/AC-092 (b)] 한 세션 = 한 스킨 — 통화 셸·배너·문자함(→ 그 안의 랜딩)이 같은 값을 받는다", () => {
  assert.deepEqual(sameSkinViolations(read(PLAY)), []);
  const overlay = codeOnly(read("src/components/InCallSmsOverlay.tsx"));
  assert.ok(overlay.includes("skin={skin}"), "문자함이 받은 스킨을 랜딩 브라우저 바로 그대로 넘겨야 한다");
});

test("[T190 역검증 — AC-092 (g)ⓑ] 문자함에 다른 스킨을 넘긴 사본은 실패한다", () => {
  const play = read(PLAY);
  const poisoned = play.replace("skin={deviceSkin.skin}", 'skin={"ios"}');
  assert.notEqual(poisoned, play, "오염 지점을 찾지 못했다");
  assert.deepEqual(sameSkinViolations(poisoned), ["문자함이 통화 셸과 같은 스킨을 받지 않는다"]);
});

/** 화면 모양 줄은 시작 전 고지 안에서 **문자형 표면일 때만**(카카오형은 스킨 없음). */
function pickerPlacementViolations(notice: string): string[] {
  const sf = ts.createSourceFile("n.tsx", notice, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const uses: ts.Node[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sf) === "DeviceSkinPicker") uses.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (uses.length !== 1) return [`<DeviceSkinPicker 가 ${uses.length}회다`];
  let node: ts.Node | undefined = uses[0].parent;
  while (node && !(ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) {
    node = node.parent;
  }
  const condition = node ? node.getText(sf) : "";
  return /^surface === "sms" && skinPicker/.test(condition) ? [] : [`화면 모양 줄 조건이 문자형 한정이 아니다: ${condition.slice(0, 40)}`];
}

test("[T190-6/§74.10 (2)] 화면 모양 줄 = 시작 전 고지 안 · 문자형 표면에서만 · 메신저는 기기 저장(fv.deviceSkin.v1)도 쓴다", () => {
  assert.deepEqual(pickerPlacementViolations(read(NOTICE)), []);
  const messenger = codeOnly(read(MESSENGER));
  assert.ok(messenger.includes("skinPicker={{ value: messengerSkin, source: skinSource, onChange: handleChooseSkin }}"));
  assert.ok(messenger.includes("window.localStorage.setItem(DEVICE_SKIN_STORAGE_KEY"), "수동 선택은 기기에 저장된다(표 K K-2)");
  assert.ok(messenger.includes('skinSource: "manual"'), "수동 선택은 기존 콜러블로 manual 기록(계약 무변경)");
});

test("[T190-6 역검증] 화면 모양 줄을 조건 없이 그린 사본은 실패한다(카카오형에도 뜬다)", () => {
  const notice = read(NOTICE);
  const poisoned = notice.replace('surface === "sms" && skinPicker && (', "skinPicker && (");
  assert.notEqual(poisoned, notice);
  assert.equal(pickerPlacementViolations(poisoned).length, 1);
});

// ── reviewer Minor — 이미 선택된 칸을 다시 골라도 접히고 수동 선택으로 저장된다 ─────────────────────────────────
function reselectViolations(picker: string): string[] {
  const code = codeOnly(picker);
  const start = code.indexOf("onClick={() => {");
  if (start < 0) return ["라디오에 onClick 처리가 없다(같은 값 재선택 시 change가 오지 않는다)"];
  const block = code.slice(start, code.indexOf("}}", start));
  const out: string[] = [];
  if (!block.includes("if (current !== skin) return;")) out.push("새 값 선택 때 onChange와 겹쳐 두 번 저장된다");
  if (!block.includes("onChange(skin);") || !block.includes("setExpanded(false);")) out.push("같은 값 재선택이 저장·접힘을 하지 않는다");
  return out;
}

test("[T190/reviewer Minor] DeviceSkinPicker — 같은 값을 다시 고르면 접고 저장한다(새 값은 onChange 한 번만)", () => {
  assert.deepEqual(reselectViolations(read("src/components/DeviceSkinPicker.tsx")), []);
});

test("[T190/reviewer Minor 역검증] 재선택 처리를 지운 사본은 실패한다", () => {
  const picker = read("src/components/DeviceSkinPicker.tsx").replace(/\r\n/g, "\n"); // CRLF 체크아웃 대응
  const poisoned = picker.replace("if (current !== skin) return;\n                onChange(skin);", "if (current !== skin) return;");
  assert.notEqual(poisoned, picker, "오염 지점을 찾지 못했다");
  assert.ok(reselectViolations(poisoned).length >= 1);
});
