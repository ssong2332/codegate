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

/**
 * 사용자 결정 2026-11-07(답 원문 "단일 통화도 집계 (권장)" — 메인 전달) — G511을 좁혔다. 종료 사유(`endReason`)를 읽어도 되는 곳은
 * **"잘 대처함 · 먼저 전화를 끊음" 블록 모듈 1곳**뿐이고(`participantHangup.ts`), 그 값은 판정에 들어가지 않는다(아래 "판정 동일" 단언).
 * `scammerHangup` · 세션 통째 전개는 그 모듈에서도 계속 금지다.
 */
const END_REASON_EXCEPTION = "participantHangup.ts";

/** 위반 목록(빈 배열 = 통과) — 오염 사본에 같은 판정을 적용해 역검증한다. 주석 속 언급도 센다(더 엄격). */
function findReasonReads(files: ReadonlyArray<readonly [string, string]>): string[] {
  const hits: string[] = [];
  for (const [name, source] of files) {
    for (const pattern of FORBIDDEN) {
      if (name === END_REASON_EXCEPTION && pattern === FORBIDDEN[0]) continue;
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

test("[G511 좁힘 · 2026-11-07] 예외는 블록 모듈 1곳의 endReason뿐 — 그 모듈의 scammerHangup · 세션 전개 · 다른 파일의 endReason은 걸린다", () => {
  assert.equal(findReasonReads([[END_REASON_EXCEPTION, "if (session.endReason === \"user_ended\") return 0;"]]).length, 0);
  assert.equal(findReasonReads([[END_REASON_EXCEPTION, "if (session.scammerHangup) return 0;"]]).length, 1);
  assert.equal(findReasonReads([[END_REASON_EXCEPTION, "const v = { ...session };"]]).length, 1);
  assert.equal(findReasonReads([["generateReportCore.ts", "const r = session.endReason;"]]).length, 1);
});

test("[G511 판정 동일] 블록 값은 판정에 들어가지 않는다 — wasDeceived = 최종 속은 순간 수 · participantHangup은 리포트 필드로만", () => {
  const core = readFileSync(path.join(REPORT_SRC, "generateReportCore.ts"), "utf8");
  assert.ok(core.includes("const wasDeceived = mock.deceivedMoments.length > 0;"));
  // 변수 쓰임 = 선언 1줄 + 리포트 필드 전개 1줄뿐(주석 · import 줄 제외).
  const useLines = core
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\bparticipantHangup\b/.test(line) && !line.startsWith("//") && !line.startsWith("import "));
  assert.deepEqual(useLines, ["const participantHangup = resolveParticipantHangup({", "...(participantHangup ? { participantHangup } : {}),"]);
  const analyze = readFileSync(path.join(REPORT_SRC, "analyzeConversation.ts"), "utf8");
  assert.equal(/participantHangup|resolveParticipantHangup/.test(analyze), false, "판정 모듈이 블록을 읽으면 안 된다");
});

test("[G511 역검증] 사유를 읽는 사본 · 세션을 통째로 펼치는 사본은 스캔에 걸린다", () => {
  assert.equal(findReasonReads([["x.ts", "const r = session.endReason;"]]).length, 1);
  assert.equal(findReasonReads([["x.ts", "if (session.scammerHangup) verdict = 1;"]]).length, 1);
  assert.equal(findReasonReads([["x.ts", "const view = { ...session };"]]).length, 1);
  assert.equal(findReasonReads([["x.ts", "const view = { ...sessionSnap.data() };"]]).length, 1);
  assert.equal(findReasonReads([["x.ts", "const m = { ...message, endedAtMs };"]]).length, 0);
});
