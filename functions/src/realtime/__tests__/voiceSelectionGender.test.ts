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
import { FLOW_VARIANTS } from "../../scenarios/flowVariants";
import { CHILD_GENDER_UNSPECIFIED_RULE, resolveChildGenderRule } from "../../scenarios/messengerChildImpersonationKakao.prompt";

const CHILD = "messenger-child-impersonation-kakao";
const PARCEL = "messenger-parcel-smishing-sms";
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
  // 리뷰 M1 — "성별이 정해져 있지 않다" 줄이 [화자] 블록과 함께 실리지 않는다(성별 확정 문면으로 바뀐다).
  assert.ok(!male.includes(CHILD_GENDER_UNSPECIFIED_RULE), "남성 세션에 '성별 미정' 줄이 남았다");
  assert.ok(male.includes("너는 참가자의 아들이다."));
  const female = buildSystemPrompt(prompt, { difficultyLevel: "intermediate", speakerGender: "female" });
  assert.ok(female.includes("너는 참가자의 딸이다.") && !female.includes(CHILD_GENDER_UNSPECIFIED_RULE));
  assert.ok(none.includes(CHILD_GENDER_UNSPECIFIED_RULE), "성별 없는 세션은 원문 그대로(바이트 동일)");
  // 다른 시나리오는 이 치환과 무관(그 줄이 없다).
  const other = SCENARIO_PROMPTS["prosecution-cooperation-call"];
  assert.equal(resolveChildGenderRule(other.personaPrompt, "male"), other.personaPrompt);
});

test("[리뷰 M2] 통화 단계가 없는 세션(parcel 초급 · 중급)은 목소리 선택이 와도 성별 0 — AC-106 (f) · §84.4.6", () => {
  for (const level of ["beginner", "intermediate"]) {
    assert.equal(
      resolveSessionSpeakerGender({ scenarioId: PARCEL, difficultyLevel: level, voiceSelectionSource: "fallback_male" }),
      undefined,
      level,
    );
  }
});

test("[리뷰 Minor 1] parcel 고급 · 목소리 선택 → 고른 성별이 변형 leg 성별보다 먼저(음성과 말이 같은 성별)", () => {
  const variant = FLOW_VARIANTS.find((v) => v.scenarioId === PARCEL && v.level === "advanced" && v.escalatesToVoice)!;
  assert.ok(variant, "parcel 고급 통화 변형 수집 실패 — 거짓 초록 방지");
  const base = { scenarioId: PARCEL, difficultyLevel: "advanced", flowVariantId: variant.variantId };
  const legGender = resolveSessionSpeakerGender(base);
  assert.equal(legGender, variant.legs[0]!.speakerGender, "선택 없음 = 종전(leg 성별)");
  const opposite = legGender === "male" ? "fallback_female" : "fallback_male";
  assert.equal(resolveSessionSpeakerGender({ ...base, voiceSelectionSource: opposite }), legGender === "male" ? "female" : "male");
});

test("[배선] 세션 원천 하나 — createRealtimeCall · sendMessage는 세션 문서를, 오프닝은 createSession 요청값을 넘긴다(소스 스캔)", () => {
  assert.match(src("realtime/index.ts"), /speakerGender: resolveSessionSpeakerGender\(session\),/);
  assert.match(src("realtime/geminiProvider.ts"), /voiceName: pickGeminiVoiceName\(input\.scenarioId, input\.sessionId, speakerGender\)/);
  assert.match(src("roleplay/index.ts"), /speakerGender: resolveSessionSpeakerGender\(session\),/);
  assert.match(src("session/index.ts"), /personaCard: personaCard\?\.items, voiceSelectionSource, familyAddress \}/);
  assert.match(src("session/index.ts"), /\.\.\.\(voiceSelectionSource \? \{ voiceSelectionSource \} : \{\}\),/, "세션 문서에도 같은 값을 저장한다");
  const opening = src("roleplay/openingLine.ts");
  assert.match(opening, /\.\.\.\(voiceSelectionSource \? \{ voiceSelectionSource \} : \{\}\),/);
  assert.match(opening, /speakerGender: resolveSessionSpeakerGender\(sessionView\),/);
});
