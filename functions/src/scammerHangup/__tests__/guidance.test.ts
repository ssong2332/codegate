import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import {
  SCAMMER_HANGUP_ACCEPTED_GUIDANCE,
  SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE,
  SCAMMER_HANGUP_DECLINED_GUIDANCE,
  SCAMMER_HANGUP_FAILURE_INSTRUCTION,
  scammerHangupGuidance,
} from "../guidance";
import { SCAMMER_HANGUP_RULES } from "../decide";

// T192 C1 · G516 — 서버 소유 문면 4개(Architecture.md §79.5 정본)는 상수 1곳 · 클라 한국어 저작 0(G386 계승) ·
// 횟수 · 턴 번호 0(F11/G130).
const FUNCTIONS_SRC = path.resolve(__dirname, "../../../src");
const ROOT_SRC = path.resolve(__dirname, "../../../../src");

/** §79.5 정본 원문 — 바이트 그대로 대조한다. */
const CANON: ReadonlyArray<readonly [string, string]> = [
  [
    "승인",
    "(통화가 곧 끊긴다. 작별 인사를 아직 하지 않았다면 상황에 맞는 짧은 마무리 한마디만 하고 거기서 말을 멈춰라. 그 한마디 앞뒤에 대답이나 설명, 당부, 새 요구를 붙이지 마라. 이미 했다면 아무 말도 하지 마라.)",
  ],
  ["거절(공통)", "(아직 통화를 끝낼 때가 아니다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)"],
  [
    "거절(blocked_transfer)",
    "(확인 부서로 통화를 넘기기 전에는 끝낼 수 없다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)",
  ],
  ["실패(콜러블 미도달)", "(지금은 통화를 끝낼 수 없다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)"],
];
const CONSTANTS = [
  SCAMMER_HANGUP_ACCEPTED_GUIDANCE,
  SCAMMER_HANGUP_DECLINED_GUIDANCE,
  SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE,
  SCAMMER_HANGUP_FAILURE_INSTRUCTION,
];

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...listTsFiles(full));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function filesContaining(files: readonly string[], needle: string): string[] {
  return files.filter((file) => readFileSync(file, "utf8").includes(needle));
}

test("[G516] 상수 4개가 §79.5 정본과 바이트 동일하다", () => {
  CONSTANTS.forEach((value, i) => assert.equal(value, CANON[i]![1], CANON[i]![0]));
});

test("[G516] 문면에 숫자 0(F11/G130 — 횟수 · 턴 번호를 모델에게 주지 않는다)", () => {
  for (const value of CONSTANTS) assert.doesNotMatch(value, /[0-9０-９]/);
});

test("[G516] 판정 status 전수 → 문면 매핑(승인 2 · 전환 전 1 · 나머지 공통 거절)", () => {
  for (const rule of SCAMMER_HANGUP_RULES) {
    const expected = rule.hangup
      ? SCAMMER_HANGUP_ACCEPTED_GUIDANCE
      : rule.status === "blocked_transfer"
        ? SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE
        : SCAMMER_HANGUP_DECLINED_GUIDANCE;
    assert.equal(scammerHangupGuidance(rule.status), expected, rule.status);
  }
});

test("[G516] 각 문면은 functions/src에서 guidance.ts 1곳에만 있고 클라 src/에는 0곳이다", () => {
  const serverFiles = listTsFiles(FUNCTIONS_SRC);
  const clientFiles = listTsFiles(ROOT_SRC);
  assert.ok(serverFiles.length > 50, `functions/src 스캔 대상이 ${serverFiles.length}건 — 경로가 깨졌다`);
  assert.ok(clientFiles.length > 50, `src/ 스캔 대상이 ${clientFiles.length}건 — 경로가 깨졌다`);
  for (const [label, text] of CANON) {
    const server = filesContaining(serverFiles, text).map((f) => path.relative(FUNCTIONS_SRC, f).split(path.sep).join("/"));
    assert.deepEqual(server, ["scammerHangup/guidance.ts"], `${label}: 서버 원천이 1곳이 아니다`);
    assert.deepEqual(filesContaining(clientFiles, text), [], `${label}: 클라가 모델 대면 문면을 저작했다(G386)`);
  }
});

// ── T192 C7 · G623(Architecture.md §79.22 (4) ② · (9)) — 승인 문면 1회 수정(79.14 #2) ─────────────────────────────
/** C7 전 승인 문면(§79.5) — 역검증용. */
const G623_OLD_ACCEPTED =
  "(통화가 곧 끊긴다. 작별 인사를 아직 하지 않았다면 상황에 맞는 짧은 마무리 한마디만 하고 더는 말하지 마라. 이미 했다면 아무 말도 하지 마라.)";

test("[G623] 승인 문면 = §79.22 (4) ② 정본 · '그 한마디 앞뒤에' 1회 · '한 문장' · '하나' · '첫' 0 · 거절 · 실패 3문면 무변경", () => {
  assert.equal(SCAMMER_HANGUP_ACCEPTED_GUIDANCE, CANON[0]![1], "승인 문면이 §79.22 (4) ② 정본과 다르다");
  assert.equal(SCAMMER_HANGUP_ACCEPTED_GUIDANCE.split("그 한마디 앞뒤에").length - 1, 1);
  for (const w of ["한 문장", "하나", "첫"]) assert.equal(SCAMMER_HANGUP_ACCEPTED_GUIDANCE.includes(w), false, `"${w}"`);
  // 첫 문장 · 끝 문장은 C7 전과 바이트 동일(바뀐 곳은 가운데뿐).
  assert.ok(SCAMMER_HANGUP_ACCEPTED_GUIDANCE.startsWith("(통화가 곧 끊긴다. "));
  assert.ok(SCAMMER_HANGUP_ACCEPTED_GUIDANCE.endsWith(" 이미 했다면 아무 말도 하지 마라.)"));
  assert.deepEqual(
    [SCAMMER_HANGUP_DECLINED_GUIDANCE, SCAMMER_HANGUP_BLOCKED_TRANSFER_GUIDANCE, SCAMMER_HANGUP_FAILURE_INSTRUCTION],
    [
      "(아직 통화를 끝낼 때가 아니다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)",
      "(확인 부서로 통화를 넘기기 전에는 끝낼 수 없다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)",
      "(지금은 통화를 끝낼 수 없다. 끝내겠다는 말을 하지 말고 하던 이야기를 그대로 이어가라.)",
    ],
    "거절 · 실패 문면이 바뀌었다(⛔ §79.22 (0) 2)",
  );
});

test("[G623 역검증] 옛 승인 문면 사본은 정확 일치 · '그 한마디 앞뒤에' 단언에 걸린다", () => {
  assert.notEqual(G623_OLD_ACCEPTED, CANON[0]![1]);
  assert.equal(G623_OLD_ACCEPTED.split("그 한마디 앞뒤에").length - 1, 0);
});

test("[G516 역검증] 스캔 함수는 문면을 품은 파일을 실제로 찾는다", () => {
  const guidanceFile = path.join(FUNCTIONS_SRC, "scammerHangup/guidance.ts");
  assert.deepEqual(filesContaining([guidanceFile], CANON[0]![1]), [guidanceFile]);
  assert.deepEqual(filesContaining([guidanceFile], CANON[0]![1] + "X"), []);
});
