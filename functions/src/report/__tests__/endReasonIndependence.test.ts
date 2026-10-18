import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";

// T192 C1 · G511 — 리포트는 종료 사유를 읽지 않는다(Architecture.md §79.0 4 · AC-103 (e) · User 답 Q5).
// `functions/src/report/**`(테스트 제외)에 `endReason` · `scammerHangup` 참조 0 · 세션 문서 통째 전개(`...session` · `...sessionSnap.data()`) 0.
// ⚠️ 이 테스트는 **구조**(참조 0)로 판정 무관성을 보인다. "같은 대화를 사유만 바꿔 생성해 판정 동일"의 실행 비교는
// 리포트 생성이 Firestore 읽기에 묶여 있어(`generateReportCore.ts`) 이 C1에 넣지 않았다 — 참조가 0이면 사유가
// 판정 경로에 들어갈 수 없다.
const REPORT_SRC = path.resolve(__dirname, "../../../src/report");
const FORBIDDEN = [
  /\bendReason\b/,
  /\bscammerHangup\b/,
  /\.\.\.\s*session\b/,
  /\.\.\.\s*session\w*\.data\(\)/,
] as const;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__") out.push(...listSourceFiles(full));
    } else if (name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/** 위반 목록(빈 배열 = 통과) — 오염 사본에 같은 판정을 적용해 역검증한다. 주석 속 언급도 센다(더 엄격). */
function findReasonReads(files: ReadonlyArray<readonly [string, string]>): string[] {
  const hits: string[] = [];
  for (const [name, source] of files) {
    for (const pattern of FORBIDDEN) {
      if (pattern.test(source)) hits.push(`${name}: ${pattern}`);
    }
  }
  return hits;
}

test("[G511] report/**에 endReason · scammerHangup · ...session 0", () => {
  const files = listSourceFiles(REPORT_SRC);
  assert.ok(files.length >= 5, `report 소스 스캔 대상이 ${files.length}건 — 경로가 깨졌다`);
  const sources = files.map((f) => [path.basename(f), readFileSync(f, "utf8")] as const);
  assert.deepEqual(findReasonReads(sources), [], "리포트가 종료 사유를 읽을 수 있게 됐다(AC-103 (e))");
});

test("[G511 역검증] 사유를 읽는 사본 · 세션을 통째로 펼치는 사본은 스캔에 걸린다", () => {
  assert.equal(findReasonReads([["x.ts", "const r = session.endReason;"]]).length, 1);
  assert.equal(findReasonReads([["x.ts", "if (session.scammerHangup) verdict = 1;"]]).length, 1);
  assert.equal(findReasonReads([["x.ts", "const view = { ...session };"]]).length, 1);
  assert.equal(findReasonReads([["x.ts", "const view = { ...sessionSnap.data() };"]]).length, 1);
  assert.equal(findReasonReads([["x.ts", "const m = { ...message, endedAtMs };"]]).length, 0);
});
