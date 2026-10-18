// 고급 전용 시나리오 거부 게이트 — T191 S5 / PRD AC-097 (b)(g)(i) ⓐⓑ · UX 계약 C-2 · D-107.
// 설계: T191 흐름 변형 설계(Architecture T191 절 "고급 전용 3종 — 강제 지점" · 게이트 표 "고급 전용 거부" 행).
//
// ⚠️ 증명 방식(정직 고지): `onCall` 핸들러를 직접 실행하는 테스트는 이 저장소에 전례가 없다(firebase-admin
// 초기화 · 인증 컨텍스트 필요). 그래서 "거부가 쓰기 · LLM · 음성 호출 0회로 일어난다"는 ① 순수 술어 진리표
// ② **호출 위치 소스 스캔**(술어가 핸들러 안 첫 await · Firestore · LLM · 음성 호출보다 앞) 두 층으로 고정한다.
// 술어가 throw하면 그 뒤 줄은 실행되지 않으므로 ②가 곧 "0회"의 근거다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  DIFFICULTY_NOT_ALLOWED_REASON,
  assertDifficultyAllowed,
  isDifficultyAllowed,
} from "../difficultyAllowance";
import { PUBLIC_SCENARIOS, isAdvancedOnlyScenario } from "../../scenarios/publicMeta";
import { normalizeDifficultyLevel } from "../../shared/difficulty";

const FUNCTIONS_SRC = path.resolve(__dirname, "../../../src");

test("[T191 S5 고급 전용 거부 · C-2] 진리표 — 고급 전용 × {beginner·intermediate·미전달·오타} 거부 · advanced 허용 · 기존 14종은 전부 허용", (t) => {
  const advancedOnly = Object.keys(PUBLIC_SCENARIOS).filter(isAdvancedOnlyScenario);
  assert.equal(advancedOnly.length, 3);
  for (const id of advancedOnly) {
    for (const raw of ["beginner", "intermediate", undefined, null, "", "ADVANCED", "expert"]) {
      assert.equal(isDifficultyAllowed(id, raw), false, `${id}/${String(raw)}`);
      assert.throws(
        () => assertDifficultyAllowed(id, raw),
        (err: { code?: string; details?: { reason?: string } }) =>
          err.code === "failed-precondition" && err.details?.reason === DIFFICULTY_NOT_ALLOWED_REASON,
      );
    }
    assert.equal(isDifficultyAllowed(id, "advanced"), true);
    assert.doesNotThrow(() => assertDifficultyAllowed(id, "advanced"));
  }
  // 역방향 AC-097 (i) ⓑ — 기존 14종이 초급(·미전달)에서 거부되면 AC-064 원문 위반이다.
  const existing = Object.keys(PUBLIC_SCENARIOS).filter((id) => !isAdvancedOnlyScenario(id));
  assert.equal(existing.length, 14);
  for (const id of existing) {
    for (const raw of ["beginner", "intermediate", "advanced", undefined]) {
      assert.equal(isDifficultyAllowed(id, raw), true, `${id}/${String(raw)}: 기존 시나리오가 거부됐다(AC-064)`);
    }
  }
  // 역방향 AC-097 (i) ⓐ — 같은 진리표를 **잘못된 술어 2종**에 걸어 실제로 실패함을 보인다:
  //   ① 고급 전용을 모르는 술어(게이트 누락 = 고급 전용을 중급으로 만들 수 있다)
  //   ② 정규화 **후** 값으로 판정하되 기본값이 고급인 술어(미전달이 통과 — C-2 "미전달도 거부" 위반)
  const violations = (pred: (id: string, raw: unknown) => boolean): string[] =>
    advancedOnly.flatMap((id) =>
      ["beginner", "intermediate", undefined].filter((raw) => pred(id, raw)).map((raw) => `${id}/${String(raw)}`),
    );
  const gateMissing = () => true;
  const normalizedDefaultAdvanced = (id: string, raw: unknown) =>
    !isAdvancedOnlyScenario(id) || (raw === undefined ? "advanced" : normalizeDifficultyLevel(raw)) === "advanced";
  t.diagnostic(
    `정상 술어 위반 ${violations(isDifficultyAllowed).length} / 게이트 누락 위반 ${violations(gateMissing).length} / 정규화 후 판정 위반 ${violations(normalizedDefaultAdvanced).length}`,
  );
  assert.deepEqual(violations(isDifficultyAllowed), []);
  assert.equal(violations(gateMissing).length, 9, "게이트 누락 샘플 = 3종 × 3값 전부 통과(거부 0)");
  assert.deepEqual(
    violations(normalizedDefaultAdvanced),
    advancedOnly.map((id) => `${id}/undefined`),
    "정규화 후 판정 샘플 = 미전달만 통과",
  );
});

/** 주석을 지운 코드 — 함수명이 주석에 먼저 걸려 순서 판정이 틀어지는 것을 막는다(§66 소스 스캔 함정). */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function handlerBody(file: string, start: string, end: string): string {
  const code = codeOnly(fs.readFileSync(path.join(FUNCTIONS_SRC, file), "utf-8"));
  const from = code.indexOf(start);
  assert.ok(from >= 0, `${file}: ${start} 없음`);
  const to = code.indexOf(end, from + start.length);
  return code.slice(from, to < 0 ? undefined : to);
}

test("[T191 S5 고급 전용 거부 · AC-097 (b)] createSession — 술어가 모든 await · Firestore · LLM · 음성 호출보다 앞(거부 = 그 호출 0회)", () => {
  const body = handlerBody("session/index.ts", "export const createSession", "export const endSession");
  const gate = body.indexOf("assertDifficultyAllowed(scenarioId, difficultyLevel)");
  assert.ok(gate > 0, "createSession에 술어 호출이 없다");
  for (const marker of ["await ", "getFirestore(", "generateOpeningLine(", "getVoiceProvider(", "assignFlowVariantForSession(", "commitSessionWithVariant(", ".add(", "normalizeDifficultyLevel("]) {
    const at = body.indexOf(marker);
    assert.ok(at > gate, `createSession: "${marker}"(${at})가 거부 술어(${gate})보다 앞에 있다`);
  }
});

test("[T191 S5 고급 전용 거부 · D-107] createChallenge — 같은 술어 + 고급이어도 챌린지 거부, 둘 다 모든 await · Firestore · 음성 호출보다 앞", () => {
  const body = handlerBody("challenge/index.ts", "export const createChallenge", "export const ");
  const gate = body.indexOf("assertDifficultyAllowed(scenarioId, difficultyLevel)");
  const reject = body.indexOf("advanced-only-not-challengeable");
  assert.ok(gate > 0 && reject > gate, "createChallenge 거부 순서(술어 → 고급 전용 챌린지 거부)");
  for (const marker of ["await ", "getFirestore(", "getVoiceProvider(", "normalizeDifficultyLevel("]) {
    const at = body.indexOf(marker);
    assert.ok(at < 0 || at > reject, `createChallenge: "${marker}"(${at})가 거부(${reject})보다 앞에 있다`);
  }
});

test("[T191 S5 고급 전용 거부 · D-107 2차 방어선] consentChallenge — 고급 전용 거부가 첫 쓰기 · LLM · 트랜잭션 · 변형 배정보다 앞", () => {
  const body = handlerBody("challenge/userAccess.ts", "export const consentChallenge", "export const reportChallenge");
  const reject = body.indexOf("isAdvancedOnlyScenario(scenarioId)");
  assert.ok(reject > 0, "consentChallenge에 고급 전용 거부가 없다");
  assert.ok(body.indexOf("advanced-only-not-challengeable") > reject);
  for (const marker of ["generateOpeningLine(", "runTransaction(", "assignFlowVariantForChallenge(", ".set(", "markChallengeConsumed("]) {
    const at = body.indexOf(marker);
    assert.ok(at > reject, `consentChallenge: "${marker}"(${at})가 고급 전용 거부(${reject})보다 앞에 있다`);
  }
});
