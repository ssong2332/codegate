// 2026-10-20 실기 신고(messenger-child-impersonation-kakao — 통화용 목소리 선택에서 "남성 음성"을 골랐는데 통화가 여성 음성) 회귀 테스트.
// 원인: Gemini Live 음성은 `pickGeminiVoiceName(scenarioId, sessionId, speakerGender)`로 고르는데, 이 시나리오는 표가 notApplicable이고
// 세션 성별도 없어 {여성, 남성} 풀에서 sessionId 해시로 골랐다(약 50%). 고친 뒤: 기본 목소리 선택(`voiceSelectionSource`)이 세션 화자 성별이다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { resolveSessionSpeakerGender, voiceSelectionGender } from "../scenarioVoice";
import { pickGeminiVoiceName } from "../geminiProvider";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";

const CHILD = "messenger-child-impersonation-kakao";
const src = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");

test("[신고 재현] child-kakao · 기본 남성 목소리 선택 → 세션 성별 male → Gemini 음성이 모든 세션에서 남성 풀", () => {
  const voices = new Set<string>();
  const femaleVoices = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const session = { scenarioId: CHILD, difficultyLevel: "intermediate", sessionId: `sess-${i}`, voiceSelectionSource: "fallback_male" };
    const gender = resolveSessionSpeakerGender(session);
    assert.equal(gender, "male");
    voices.add(pickGeminiVoiceName(CHILD, session.sessionId, gender));
    femaleVoices.add(pickGeminiVoiceName(CHILD, session.sessionId, resolveSessionSpeakerGender({ ...session, voiceSelectionSource: "fallback_female" })));
  }
  assert.deepEqual([...voices], ["Puck"]);
  assert.deepEqual([...femaleVoices], ["Aoede"]);
  // 고치기 전 동작(성별 없음)은 같은 세션들에서 두 성별이 섞인다 — 이 검사가 신고를 실제로 재현한다는 대조군.
  const before = new Set(Array.from({ length: 50 }, (_, i) => pickGeminiVoiceName(CHILD, `sess-${i}`, undefined)));
  assert.equal(before.size, 2);
});

test("[회귀 0] 클론(recorded · reused) · 선택 부재 · 챌린지는 종전 그대로(성별 없음) · 표에 값이 있는 시나리오는 표 값 우선", () => {
  for (const source of [undefined, "recorded", "reused"]) {
    assert.equal(resolveSessionSpeakerGender({ scenarioId: CHILD, difficultyLevel: "advanced", voiceSelectionSource: source }), undefined, String(source));
  }
  assert.equal(voiceSelectionGender("fallback_male"), "male");
  assert.equal(voiceSelectionGender("fallback_female"), "female");
  assert.equal(voiceSelectionGender("recorded"), undefined);
  assert.equal(
    resolveSessionSpeakerGender({ scenarioId: "prosecution-cooperation-call", voiceSelectionSource: "fallback_female" }),
    "male",
    "표 값(검찰 수사관 = male)이 있는 시나리오는 표가 원천이다(그 시나리오에는 목소리 선택 화면이 없다)",
  );
});

test("[프롬프트] 같은 성별이 [화자] 블록으로 — 남성 음성인데 '딸'이라 말하지 않게(텍스트 · 오프닝 · Live 같은 원천)", () => {
  const prompt = SCENARIO_PROMPTS[CHILD];
  const male = buildSystemPrompt(prompt, { difficultyLevel: "intermediate", speakerGender: resolveSessionSpeakerGender({ scenarioId: CHILD, voiceSelectionSource: "fallback_male" }) });
  const none = buildSystemPrompt(prompt, { difficultyLevel: "intermediate", speakerGender: resolveSessionSpeakerGender({ scenarioId: CHILD }) });
  assert.ok(male.includes("[화자"), "기본 남성 목소리 세션은 [화자] 블록이 생긴다");
  assert.ok(!none.includes("[화자"), "선택 없는 세션은 종전처럼 블록 0(§84.4.6)");
});

test("[배선] 세션 원천 하나 — createRealtimeCall · sendMessage는 세션 문서를, 오프닝은 createSession 요청값을 넘긴다(소스 스캔)", () => {
  assert.match(src("realtime/index.ts"), /speakerGender: resolveSessionSpeakerGender\(session\),/);
  assert.match(src("realtime/geminiProvider.ts"), /voiceName: pickGeminiVoiceName\(input\.scenarioId, input\.sessionId, speakerGender\)/);
  assert.match(src("roleplay/index.ts"), /speakerGender: resolveSessionSpeakerGender\(session\),/);
  assert.match(src("session/index.ts"), /personaCard: personaCard\?\.items, voiceSelectionSource \}/);
  assert.match(src("session/index.ts"), /\.\.\.\(voiceSelectionSource \? \{ voiceSelectionSource \} : \{\}\),/, "세션 문서에도 같은 값을 저장한다");
  const opening = src("roleplay/openingLine.ts");
  assert.match(opening, /\.\.\.\(voiceSelectionSource \? \{ voiceSelectionSource \} : \{\}\),/);
  assert.match(opening, /speakerGender: resolveSessionSpeakerGender\(sessionView\),/);
});
