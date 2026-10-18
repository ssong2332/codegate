// T190-1/T190-4 — G454 벨·진동 (docs/Architecture.md §74.7 · §74.14 G454 · UX D-97 · PRD AC-093 (a)(b)(g)ⓑ · AC-095 (a)).
//
// `ringtonePlayer.ts`는 Web Audio·`navigator.vibrate`에 강결합돼 이 러너로 실행할 수 없다(R-2 — `outputGain.test.ts`와
// 같은 관례). 순수 부분(패턴 표)은 직접, 배선(`play/page.tsx`)은 소스 스캔으로 고정한다.
// ⚠️ 선율 비복제(AC-095 (a))는 자동 검사가 불가능하다 — 아래 "한 패턴 = 한 음 높이" 단언은 **구조**만 막는다
// (음 높이 순서가 아예 존재하지 않게). 음색이 OS 벨소리를 옮겼는지는 reviewer 확인 항목이다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { RING_MAX_MS, RING_PATTERNS, ringCycleCount, ringPatternFor, tonesWithinCap } from "./ringtone.ts";
import { VIBRATION_PATTERNS, canVibrate, vibrationPatternFor } from "./vibration.ts";

const PLAY = "src/app/session/play/page.tsx";
const play = readFileSync(PLAY, "utf8").replace(/\r\n/g, "\n");

test("[T190/G454] 상한 60초 · iOS형 진동 없음 · One UI형·기본만 진동", () => {
  assert.equal(RING_MAX_MS, 60000);
  assert.equal(VIBRATION_PATTERNS.ios, null);
  assert.equal(vibrationPatternFor("ios"), null);
  assert.ok((vibrationPatternFor("samsung") ?? []).length > 0);
  assert.ok((vibrationPatternFor("default") ?? []).length > 0);
  assert.equal(canVibrate(undefined), false);
  assert.equal(canVibrate({}), false, '"vibrate" in navigator가 거짓이면 0회');
  assert.equal(canVibrate({ vibrate: () => true }), true);
});

test("[T190/G454] 패턴 — 음은 60초 안에서만 · 상한을 넘는 음은 자르지 않고 뺀다", () => {
  for (const skin of ["ios", "samsung", "default"] as const) {
    const pattern = ringPatternFor(skin);
    const cycles = ringCycleCount(pattern);
    assert.ok(cycles >= 10, `${skin}: 60초 동안 주기가 ${cycles}개뿐이다`);
    for (let i = 0; i < cycles; i += 1) {
      for (const tone of tonesWithinCap(pattern, i)) {
        assert.ok(i * pattern.cycleMs + tone.atMs + tone.durMs <= RING_MAX_MS);
      }
    }
    assert.deepEqual(tonesWithinCap(pattern, cycles), [], "상한 뒤 주기에는 음이 없다");
    for (const tone of pattern.tones) {
      assert.ok(tone.peak > 0 && tone.peak <= 0.25, `${skin}: 최고 게인 ${tone.peak} — 놀라지 않게 낮게 둔다`);
      assert.ok(tone.atMs + tone.durMs <= pattern.cycleMs, `${skin}: 음이 주기를 넘는다`);
    }
  }
});

test("[T190/AC-095 (a) 구조] 한 패턴 안의 음 높이는 하나뿐이다(음 높이 순서 = 선율이 존재하지 않는다)", () => {
  for (const [skin, pattern] of Object.entries(RING_PATTERNS)) {
    const pitchSets = new Set(pattern.tones.map((tone) => tone.freqsHz.join("+")));
    assert.equal(pitchSets.size, 1, `${skin}: 음 높이가 ${pitchSets.size}종이다 — 선율이 생긴다`);
  }
});

// ── 배선(소스 스캔) — 본 단언과 역검증이 같은 함수를 쓴다 ──────────────────────────────────────────

function sourceFile(code: string): ts.SourceFile {
  return ts.createSourceFile("play.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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

const isCallTo = (node: ts.Node, sf: ts.SourceFile, callee: string) =>
  ts.isCallExpression(node) && node.expression.getText(sf) === callee;

/** G454 배선 위반 — `startIncomingAlert(` 1회 · 그 effect가 `phase !== "incoming"`이면 빠짐 · cleanup이 stop · handleAnswer 안 stop. */
function incomingAlertWiringViolations(code: string): string[] {
  const sf = sourceFile(code);
  const out: string[] = [];
  const starts = findAll(sf, (n) => isCallTo(n, sf, "startIncomingAlert"));
  if (starts.length !== 1) return [`startIncomingAlert( 호출이 ${starts.length}회다(정확히 1회)`];
  // 감싼 useEffect 콜백을 찾는다.
  let node: ts.Node | undefined = starts[0].parent;
  while (node && !(ts.isArrowFunction(node) && node.parent && isCallTo(node.parent, sf, "useEffect"))) node = node.parent;
  if (!node || !ts.isArrowFunction(node) || !ts.isBlock(node.body)) return ["startIncomingAlert가 useEffect 콜백 안에 있지 않다"];
  const body = node.body;
  const first = body.statements[0];
  if (!first || !ts.isIfStatement(first) || !/phase !== "incoming"/.test(first.expression.getText(sf))) {
    out.push('그 effect의 첫 문장이 phase !== "incoming"일 때 빠지지 않는다');
  } else if (!ts.isReturnStatement(first.thenStatement) && !(ts.isBlock(first.thenStatement) && first.thenStatement.statements.some(ts.isReturnStatement))) {
    out.push("첫 if가 return하지 않는다");
  }
  const ret = body.statements.find(ts.isReturnStatement);
  const cleanup = ret?.expression;
  if (!cleanup || !(ts.isArrowFunction(cleanup) || ts.isFunctionExpression(cleanup))) {
    out.push("effect가 cleanup 함수를 돌려주지 않는다");
  } else if (!findAll(cleanup, (n) => ts.isCallExpression(n) && /\.stop$/.test(n.expression.getText(sf))).length) {
    out.push("cleanup이 stop()을 부르지 않는다");
  }
  // handleAnswer 안의 즉시 정지.
  const answer = findAll(
    sf,
    (n) => ts.isVariableDeclaration(n) && n.name.getText(sf) === "handleAnswer" && !!n.initializer,
  )[0] as ts.VariableDeclaration | undefined;
  if (!answer?.initializer) out.push("handleAnswer를 찾지 못했다");
  else if (!findAll(answer.initializer, (n) => ts.isCallExpression(n) && /\.stop$/.test(n.expression.getText(sf))).length) {
    out.push("handleAnswer가 벨을 즉시 멈추지 않는다");
  }
  // 이탈(pagehide)에서도 멈춘다.
  if (!findAll(node, (n) => ts.isStringLiteral(n) && n.text === "pagehide").length) out.push("pagehide 정지가 없다");
  return out;
}

test("[T190/G454] play/page.tsx — 벨은 incoming effect 하나에서만 시작하고 cleanup·받기·pagehide에서 멈춘다", () => {
  assert.deepEqual(incomingAlertWiringViolations(play), []);
});

test("[T190/G454 역검증 — AC-093 (g)ⓑ] cleanup에서 stop을 지운 사본은 실패한다(정상은 통과)", (t) => {
  const anchor = "      alert.stop();\n      if (incomingAlertRef.current === alert) incomingAlertRef.current = null;";
  assert.ok(play.includes(anchor), "오염 지점(cleanup의 alert.stop)을 찾지 못했다 — 역검증이 공회전한다");
  const poisoned = play.replace(anchor, "      if (incomingAlertRef.current === alert) incomingAlertRef.current = null;");
  const answerAnchor = "    incomingAlertRef.current?.stop();\n    if (!sessionId) return;";
  assert.ok(play.includes(answerAnchor), "오염 지점(handleAnswer의 stop)을 찾지 못했다");
  const poisonedAnswer = play.replace(answerAnchor, "    if (!sessionId) return;");
  const normal = incomingAlertWiringViolations(play);
  const a = incomingAlertWiringViolations(poisoned);
  const b = incomingAlertWiringViolations(poisonedAnswer);
  t.diagnostic(`[G454] 정상 ${normal.length}건 / cleanup stop 삭제 ${JSON.stringify(a)} / 받기 stop 삭제 ${JSON.stringify(b)}`);
  assert.deepEqual(normal, []);
  assert.deepEqual(a, ["cleanup이 stop()을 부르지 않는다"]);
  assert.deepEqual(b, ["handleAnswer가 벨을 즉시 멈추지 않는다"]);
});

test("[T190/G454] 플레이어는 음원 파일·전역 오디오 세션 설정을 쓰지 않는다(OS 벨소리 0 — §74.3 A-3/A-6 · §74.2 ③-c)", () => {
  const player = readFileSync("src/lib/phone/ringtonePlayer.ts", "utf8").replace(/\r\n/g, "\n");
  const code = player.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of [/\.(mp3|m4a|ogg|wav|aac|caf)\b/i, /new Audio\(/, /decodeAudioData/, /audioSession/, /fetch\(/]) {
    assert.equal(forbidden.test(code), false, `플레이어 코드에 있으면 안 되는 것: ${forbidden}`);
  }
  assert.ok(code.includes("createOscillator"), "합성(OscillatorNode)으로 소리를 만들어야 한다");
  assert.ok(code.includes('state !== "running"'), "자동재생이 막히면 무음으로 끝내는 분기가 있어야 한다(D-97)");
  assert.ok(code.includes(".close()"), "stop은 AudioContext.close()까지 해야 한다(§74.7)");
});
