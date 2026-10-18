// 사기범 대사 손질 배선(2026-10-17 라이브 신고 — 실존 은행명 + 5~7문장 대사) — 소스 스캔.
//
// `sendMessage`는 Firestore·시크릿에 의존하는 onCall 핸들러라 유닛 계층에서 통째로 실행할 수 없다
// (announceMarking.test.ts 헤더와 같은 판단). 판정 함수(realFinancialNames·replyLength)는 각자 순수
// 함수 테스트로 고정하고, 여기서는 **호출부가 그 함수들을 올바른 순서·조건으로 부르는지**를 주석을
// 걷어낸 실행 코드에서 확인한다.
//   - sendMessage: extractEscalationSignal → replaceRealFinancialNames → limitReplySentences →
//     finalizeScammerReplyText, 그리고 상한은 `turnInstruction === undefined`일 때만(G343).
//   - 오프닝: extractLinkMarker → replaceRealFinancialNames → limitReplySentences →
//     finalizeScammerReplyText(상한은 항상).
// ⭐ 역검증 — 순서를 뒤집거나 조건을 뺀 오염본을 같은 판정식이 실제로 빨간불로 잡는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";

const ROLEPLAY_SRC = readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8");
const OPENING_SRC = readFileSync(path.resolve(__dirname, "../../../src/roleplay/openingLine.ts"), "utf8");

/** 주석을 걷어낸 실행 코드만 남긴다(announceMarking.test.ts와 같은 방식). */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

/** 호출 토큰들이 실행 코드에 **각 1번씩** 있고 주어진 순서로 나타나는가. */
function callsInOrder(source: string, calls: readonly string[]): boolean {
  const code = codeOnly(source);
  let cursor = -1;
  for (const call of calls) {
    const first = code.indexOf(call);
    if (first < 0 || code.indexOf(call, first + 1) >= 0) return false;
    if (first <= cursor) return false;
    cursor = first;
  }
  return true;
}

/** 상한 호출이 `turnInstruction === undefined` 조건 바로 아래(삼항 참 분기 또는 if 블록)에 있는가. */
function limitIsGuardedByNoTurnInstruction(source: string): boolean {
  const code = codeOnly(source);
  const ternary = /turnInstruction\s*===\s*undefined\s*\?\s*limitReplySentences\(/;
  const ifBlock = /if\s*\(\s*turnInstruction\s*===\s*undefined\s*\)\s*\{[^}]*limitReplySentences\(/;
  return ternary.test(code) || ifBlock.test(code);
}

const SEND_MESSAGE_ORDER = [
  "extractEscalationSignal(",
  "replaceRealFinancialNames(",
  "limitReplySentences(",
  "finalizeScammerReplyText(",
] as const;

const OPENING_ORDER = [
  "extractLinkMarker(",
  "replaceRealFinancialNames(",
  "limitReplySentences(",
  "finalizeScammerReplyText(",
] as const;

test("[배선] sendMessage — 신호 추출 → 실존명 치환 → 문장 상한 → finalize 순서", () => {
  assert.equal(callsInOrder(ROLEPLAY_SRC, SEND_MESSAGE_ORDER), true);
});

test("[배선 G343] sendMessage — 문장 상한은 turnInstruction이 주입되지 않은 턴에만 적용된다", () => {
  assert.equal(limitIsGuardedByNoTurnInstruction(ROLEPLAY_SRC), true);
});

test("[배선] 오프닝 — 링크 추출 → 실존명 치환 → 문장 상한 → finalize 순서(상한은 항상)", () => {
  assert.equal(callsInOrder(OPENING_SRC, OPENING_ORDER), true);
  assert.equal(
    /turnInstruction[^\n]*limitReplySentences\(/.test(codeOnly(OPENING_SRC)),
    false,
    "오프닝 상한은 조건 없이 항상 적용돼야 한다",
  );
});

test("[배선] 최종 텍스트가 손질된 값이다 — finalize 인자가 마커 추출 직후 값이 아니다", () => {
  const roleplay = codeOnly(ROLEPLAY_SRC);
  assert.ok(!roleplay.includes("finalizeScammerReplyText(signalFreeReplyText)"));
  assert.ok(roleplay.includes("finalizeScammerReplyText(shapedReplyText)"));
  const opening = codeOnly(OPENING_SRC);
  assert.ok(!opening.includes("finalizeScammerReplyText(linkFreeText)"));
  assert.ok(opening.includes("finalizeScammerReplyText(lengthLimited.text)"));
});

test("[역검증] 순서를 뒤집은 오염본은 같은 판정식이 실패시킨다", () => {
  const swapped = [
    "const a = extractEscalationSignal(x);",
    "const b = limitReplySentences(a.text);",
    "const c = replaceRealFinancialNames(b.text);",
    "const d = finalizeScammerReplyText(c.text);",
  ].join("\n");
  assert.equal(callsInOrder(swapped, SEND_MESSAGE_ORDER), false, "오염본을 통과시키면 게이트가 공회전이다");

  const finalizeFirst = [
    "const a = extractLinkMarker(x);",
    "const d = finalizeScammerReplyText(a.text);",
    "const c = replaceRealFinancialNames(d);",
    "const b = limitReplySentences(c.text);",
  ].join("\n");
  assert.equal(callsInOrder(finalizeFirst, OPENING_ORDER), false);

  // 주석 안에만 남은 호출은 실행 코드가 아니다.
  const commentedOut = [
    "const a = extractEscalationSignal(x);",
    "// const c = replaceRealFinancialNames(a.text);",
    "const b = limitReplySentences(a.text);",
    "const d = finalizeScammerReplyText(b.text);",
  ].join("\n");
  assert.equal(callsInOrder(commentedOut, SEND_MESSAGE_ORDER), false);

  assert.equal(callsInOrder(ROLEPLAY_SRC, SEND_MESSAGE_ORDER), true, "정본은 같은 판정식을 통과한다");
  assert.equal(callsInOrder(OPENING_SRC, OPENING_ORDER), true, "정본은 같은 판정식을 통과한다");
});

test("[역검증 G343] 조건을 뺀 오염본(상한을 무조건 적용)은 같은 판정식이 실패시킨다", () => {
  const unconditional = [
    "const { text: realNameFreeReplyText } = replaceRealFinancialNames(signalFreeReplyText);",
    "const lengthLimited = limitReplySentences(realNameFreeReplyText);",
  ].join("\n");
  assert.equal(limitIsGuardedByNoTurnInstruction(unconditional), false);

  const inverted = "const lengthLimited = turnInstruction !== undefined ? limitReplySentences(t) : undefined;";
  assert.equal(limitIsGuardedByNoTurnInstruction(inverted), false);

  const commentedGuard = [
    "// turnInstruction === undefined ? limitReplySentences(t) : undefined",
    "const lengthLimited = limitReplySentences(t);",
  ].join("\n");
  assert.equal(limitIsGuardedByNoTurnInstruction(commentedGuard), false);

  assert.equal(limitIsGuardedByNoTurnInstruction(ROLEPLAY_SRC), true, "정본은 같은 판정식을 통과한다");
});
