// §87 · DECISIONS #198 · UX D-130 — createSession의 자가 체험 클론 목소리 거부 게이트.
// 증명 방식은 difficultyAllowance.test.ts와 같다(onCall 핸들러 직접 실행 전례 없음): ① 순수 술어 진리표
// ② 호출 위치 소스 스캔(술어가 핸들러 안 첫 Firestore · LLM 호출보다 앞) — throw하면 뒤 줄은 실행되지 않는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  SELF_CLONE_VOICE_NOT_ALLOWED_REASON,
  assertVoiceSelectionSourceAllowed,
  isVoiceSelectionSourceAllowed,
} from "../voiceSelectionAllowance";
import { voiceSelectionGender } from "../../realtime/scenarioVoice";

const SRC = path.resolve(__dirname, "../../../src/session/index.ts");

test("[§87] 진리표 — recorded · reused 거부 · fallback_male/female · 부재 허용", () => {
  for (const raw of ["recorded", "reused"]) {
    assert.equal(isVoiceSelectionSourceAllowed(raw), false, raw);
    assert.throws(
      () => assertVoiceSelectionSourceAllowed(raw),
      (err: { code?: string; details?: { reason?: string } }) =>
        err.code === "failed-precondition" && err.details?.reason === SELF_CLONE_VOICE_NOT_ALLOWED_REASON,
    );
  }
  for (const raw of ["fallback_male", "fallback_female", undefined]) {
    assert.equal(isVoiceSelectionSourceAllowed(raw), true, String(raw));
    assert.doesNotThrow(() => assertVoiceSelectionSourceAllowed(raw));
  }
});

test("[§87 · §86 정합] 허용되는 값은 전부 성별이 정해지거나(fallback) 부재다 — 자가 메신저 세션에 '클론 = 성별 미정' 경로가 남지 않는다", () => {
  assert.equal(voiceSelectionGender("fallback_male"), "male");
  assert.equal(voiceSelectionGender("fallback_female"), "female");
  assert.equal(voiceSelectionGender(undefined), undefined);
});

test("[§87] createSession — 게이트가 시나리오 존재 확인 뒤 · 첫 Firestore · LLM 호출 앞에 있다", () => {
  const src = readFileSync(SRC, "utf8");
  const handlerIdx = src.indexOf("export const createSession");
  const gateIdx = src.indexOf("assertVoiceSelectionSourceAllowed(voiceSelectionSource);", handlerIdx);
  const scenarioCheckIdx = src.indexOf("if (!SCENARIO_PROMPTS[scenarioId])", handlerIdx);
  const firestoreIdx = src.indexOf("getFirestore()", handlerIdx);
  const openingIdx = src.indexOf("await generateOpeningLine(", handlerIdx);
  assert.ok(handlerIdx > -1 && gateIdx > -1, "createSession 안에 게이트 호출이 없다");
  assert.ok(scenarioCheckIdx > -1 && firestoreIdx > -1 && openingIdx > -1);
  assert.ok(scenarioCheckIdx < gateIdx, "게이트가 시나리오 존재 확인보다 앞이다");
  assert.ok(gateIdx < firestoreIdx, "게이트가 첫 Firestore 호출보다 뒤다(거부 전 읽기 발생)");
  assert.ok(gateIdx < openingIdx, "게이트가 LLM 호출보다 뒤다");
  // 게이트와 핸들러 시작 사이에 await가 없다(거부 전 비동기 부수효과 0).
  assert.ok(!src.slice(handlerIdx, gateIdx).includes("await "), "게이트 전에 await가 있다");
});
