// §71.7(G433) — AI 음성 기본 음량 · GainNode 배선 회귀. `GeminiVoiceSession.tsx`는 AudioContext에 강결합돼
// 이 러너로 실행할 수 없어(`toolWindowWiring.test.ts`와 같은 관례) 배선은 소스 스캔으로만 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GEMINI_OUTPUT_GAIN } from "./outputGain.ts";

const session = readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8");
const code = session
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");

test("[§71.7 G433] 기본 출력 게인은 User가 정한 검토 범위(0.5~0.7) 안이다", () => {
  assert.ok(GEMINI_OUTPUT_GAIN >= 0.5 && GEMINI_OUTPUT_GAIN <= 0.7, `실측 ${GEMINI_OUTPUT_GAIN}`);
});

test("[§71.7 G433] 받은 오디오 소스는 destination이 아니라 게인 노드에 연결된다", () => {
  assert.equal(code.includes("source.connect(outputContext.destination)"), false, "destination 직결이 남아 있다");
  assert.ok(code.includes("source.connect(outputGain ?? outputContext.destination)"));
});

test("[§71.7 G433] 게인 노드는 GEMINI_OUTPUT_GAIN 값으로 만들어 destination에 1번 연결된다", () => {
  assert.ok(code.includes("outputGain = outputContext.createGain();"));
  assert.ok(code.includes("outputGain.gain.value = GEMINI_OUTPUT_GAIN;"));
  assert.equal(code.split("outputGain.connect(outputContext.destination)").length - 1, 1);
});
