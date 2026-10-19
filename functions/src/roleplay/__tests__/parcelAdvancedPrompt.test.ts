// T194-a G582 — parcel 고급 프롬프트 · 범위 밖 무변경 · 화자 성별 세션 해석 (docs/Architecture.md §83.4.2 · §83.4.3 · §83.4.6 ·
// PRD AC-106 (a)(b)(f)).
//
// ⚠️ 위치: 설계 표는 `promptAssembly.test.ts`를 지목했으나 그 파일(1,800줄+)에 섞지 않고 같은 디렉터리의 새 파일로 뒀다 — 단언 내용은
// 설계 G582 행 그대로다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildSystemPrompt } from "../promptAssembly";
import { isL3Procedural } from "../l3Depth";
import { asksIdentityCheck } from "../personaAuthority";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { listFlowVariants, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import {
  PARCEL_ADVANCED_LEG_PERSONA,
  PARCEL_CONTROL_TOKEN_GUARD_ITEM,
} from "../../scenarios/messengerParcelSmishingSms.prompt";
import { PUBLIC_SCENARIOS } from "../../scenarios/publicMeta";
import { sessionDeclaresInCallSms } from "../../inCallSms/smsGate";
import { resolveSessionSpeakerGender, speakerGenderFor } from "../../realtime/scenarioVoice";
import { pickGeminiVoiceName } from "../../realtime/geminiProvider";
import { DIFFICULTY_LEVELS, type DifficultyLevel } from "../../shared/difficulty";

const PARCEL = "messenger-parcel-smishing-sms";
const FUNCTIONS_SRC = path.resolve(__dirname, "../../../src");

/** 세션이 받는 조립 산출물(sendMessage 텍스트 경로와 같은 옵션 — 은행명 · 끊기 · 턴 지시 없는 기본 턴). */
function assembleFor(level: DifficultyLevel, variantId: string, speakerGender: "male" | "female" | undefined): string {
  const prompt = resolveSessionScenarioPrompt(PARCEL, variantId);
  assert.ok(prompt);
  return buildSystemPrompt(prompt, {
    difficultyLevel: level,
    inCallSmsEnabled: sessionDeclaresInCallSms(PARCEL, variantId),
    l3Procedural: isL3Procedural(PARCEL),
    identityCheckAllowed: asksIdentityCheck(PARCEL),
    speakerGender,
  });
}

const sha256 = (text: string) => crypto.createHash("sha256").update(text).digest("hex");

/**
 * ⭐ 변경 **전** 기준값 — 이 PR 착수 시점(base = 커밋 6c9548b 추출본)의 `functions/lib`로 같은 옵션을 조립해 잰 sha256.
 * 측정 스크립트는 위 `assembleFor`와 같은 옵션(speakerGender = undefined)이다. 가드레일 보강 1항(§83.4.2 ⚠️ — 의도된 변경)을
 * 걷어 낸 산출물이 이 값과 같아야 한다 ⇒ 초급 · 중급 조립은 그 1항 외에 한 바이트도 바뀌지 않았다(AC-106 (f) · §83.4.6).
 */
const BASE_ASSEMBLY_SHA256: Readonly<Record<"beginner" | "intermediate", { variantId: string; sha256: string; length: number }>> = {
  beginner: { variantId: "fv-prr3", sha256: "df00e5ceefb299238a38b5425862f65f28f22a3848e8aef07b11e4fe83114801", length: 5612 },
  intermediate: { variantId: "fv-tvq2", sha256: "de3aa4686ee6cfd46c1e298accf8bfd096475fb02411f252d1aa12caef8a3f12", length: 4878 },
};

/**
 * ⭐ 변경 **후** 기대값(§83.13.3 ④ — 기대값 갱신은 사유와 함께). **사유**: parcel 가드레일에 제어 토큰 흉내 거부 항
 * (`PARCEL_CONTROL_TOKEN_GUARD_ITEM`, 77자)을 끝에 (5)로 덧붙였다 — 고급 흐름이 `[[SIGNAL:ESCALATE_VOICE]]`를 쓰기 시작해 지원금
 * 시나리오와 같은 안전 문면이 필요해졌고, 가드레일은 시나리오 단위 상수라 세 난이도 모두 1항이 는다(§83.4.2 ⚠️ 예고 그대로).
 * 위 변경 전 값과의 차이는 그 1항뿐이다(아래 테스트가 항을 걷어 내 변경 전 값과 대조한다).
 */
const AFTER_ASSEMBLY_SHA256: Readonly<Record<"beginner" | "intermediate", { sha256: string; length: number }>> = {
  beginner: { sha256: "3f5fbc537b813938c7e1ee0656ed46929fccf29649546684543e9e0478d49d88", length: 5689 },
  intermediate: { sha256: "feda2f5bac63808a03a4512edf5a9ce783fd0c4096b27f69d788fd89f0e46078", length: 4955 },
};

test("[T194-a G582 · §83.13.3 ④] parcel 초급 · 중급 조립 = 갱신 기대값(가드레일 (5)항 포함) · 가드레일 최후미", () => {
  for (const level of ["beginner", "intermediate"] as const) {
    const variantId = BASE_ASSEMBLY_SHA256[level].variantId;
    const assembled = assembleFor(level, variantId, undefined);
    assert.equal(assembled.length, AFTER_ASSEMBLY_SHA256[level].length, `${level}: 길이`);
    assert.equal(sha256(assembled), AFTER_ASSEMBLY_SHA256[level].sha256, `${level}: 바이트`);
    assert.equal(assembled.length - BASE_ASSEMBLY_SHA256[level].length, PARCEL_CONTROL_TOKEN_GUARD_ITEM.length, `${level}: 차이 = (5)항 길이`);
    const guard = SCENARIO_PROMPTS[PARCEL].guardrailPreamble;
    assert.ok(assembled.trimEnd().endsWith(guard.trimEnd()), `${level}: 가드레일 최후미`);
  }
});

test("[T194-a G582 · §83.4.6] parcel 초급 · 중급 조립 = 변경 전 바이트(가드레일 1항 외 무변경) · [화자] 블록 0 · 역방향", (t) => {
  const lines: string[] = [];
  for (const level of ["beginner", "intermediate"] as const) {
    const base = BASE_ASSEMBLY_SHA256[level];
    const [variant] = listFlowVariants(PARCEL, level);
    assert.equal(variant.variantId, base.variantId, `${level}: 배정 변형이 바뀌었다 — 기준값을 다시 재야 한다`);
    const gender = resolveSessionSpeakerGender({ scenarioId: PARCEL, difficultyLevel: level, flowVariantId: variant.variantId });
    assert.equal(gender, undefined, `${level}: 통화 경로가 없는 칸에 화자 성별이 생겼다(AC-106 (f))`);
    const assembled = assembleFor(level, variant.variantId, gender);
    assert.equal(assembled.includes("[화자"), false, `${level}: [화자] 블록이 생겼다`);
    assert.equal(assembled.split(PARCEL_CONTROL_TOKEN_GUARD_ITEM).length - 1, 1, `${level}: 가드레일 보강 항이 정확히 1회 있어야 한다`);
    const stripped = assembled.replace(PARCEL_CONTROL_TOKEN_GUARD_ITEM, "");
    // 역방향 — 표 값을 "female"로 바꿨을 때(설계가 금지한 처방)의 산출물은 기준값과 달라진다.
    const withSpeaker = assembleFor(level, variant.variantId, "female").replace(PARCEL_CONTROL_TOKEN_GUARD_ITEM, "");
    lines.push(
      `${level}: 항 제거본 ${sha256(stripped).slice(0, 12)}(${stripped.length}자) = 기준 ${base.sha256.slice(0, 12)}(${base.length}자) · [화자] 넣은 샘플 ${sha256(withSpeaker).slice(0, 12)}(${withSpeaker.length}자)`,
    );
    assert.equal(stripped.length, base.length, `${level}: 길이가 기준과 다르다`);
    assert.equal(sha256(stripped), base.sha256, `${level}: 가드레일 1항 외의 바이트가 바뀌었다`);
    assert.notEqual(sha256(withSpeaker), base.sha256, `${level}: 역방향 — [화자] 블록이 생긴 샘플을 이 검사가 잡아야 한다`);
  }
  t.diagnostic(`[§83.4.6 before/after] ${lines.join(" | ")}`);
});

test("[T194-a G582] parcel 고급 프롬프트 — leg0 페르소나 · 설치 링크 · 전이 신호 규칙 · '순수 문자' 0 · 가드레일 제어 토큰 항 · 최후미", () => {
  const [variant] = listFlowVariants(PARCEL, "advanced");
  assert.equal(variant.variantId, "fv-g454");
  assert.equal(variant.legs[0].personaPrompt, PARCEL_ADVANCED_LEG_PERSONA);
  const prompt = resolveSessionScenarioPrompt(PARCEL, variant.variantId);
  assert.ok(prompt);
  assert.ok(prompt.personaPrompt.startsWith(PARCEL_ADVANCED_LEG_PERSONA), "원본 페르소나 대신 고급 leg 페르소나");
  assert.ok(prompt.personaPrompt.includes("[[LINK:parcel-install]]"));
  assert.ok(prompt.personaPrompt.includes("[[SIGNAL:ESCALATE_VOICE]]"), "전이는 구조화 신호로만(AC-106 (b) · AC-073)");
  assert.equal(prompt.personaPrompt.includes("순수 문자"), false, "'순수 문자' 문장과 3단계가 한 프롬프트에 공존하면 안 된다(G128 계열)");
  assert.equal(prompt.personaPrompt.includes("[[LINK:parcel-redelivery]]"), false);
  assert.equal(prompt.weakenedTactics.join("\n").includes("[[LINK:parcel-redelivery]]"), false);
  assert.ok(prompt.guardrailPreamble.includes(PARCEL_CONTROL_TOKEN_GUARD_ITEM), "가드레일 제어 토큰 흉내 거부 항");
  // 원본 시나리오 프롬프트(초급 · 중급이 쓰는 페르소나)는 그대로다.
  assert.ok(SCENARIO_PROMPTS[PARCEL].personaPrompt.includes("순수 문자"));
  for (const level of DIFFICULTY_LEVELS) {
    const assembled = buildSystemPrompt(prompt, { difficultyLevel: level, speakerGender: "female" });
    assert.ok(assembled.trimEnd().endsWith(prompt.guardrailPreamble.trimEnd()), `${level}: 가드레일 최후미(§15.5)`);
  }
});

test("[T194-a G582 · §83.4.3] 화자 성별 세션 해석 — 표 값이 있으면 그대로 · parcel은 고급 자가만 변형 leg 성별 · 음성 풀도 같은 값", () => {
  for (const id of Object.keys(PUBLIC_SCENARIOS)) {
    const table = speakerGenderFor(id);
    if (!table) continue;
    for (const level of DIFFICULTY_LEVELS) {
      const [variant] = listFlowVariants(id, level);
      assert.equal(
        resolveSessionSpeakerGender({ scenarioId: id, difficultyLevel: level, flowVariantId: variant?.variantId }),
        table,
        `${id}/${level}: 표 값이 있는 시나리오는 표 값 그대로(오늘 동작 무변경)`,
      );
    }
  }
  const advanced = listFlowVariants(PARCEL, "advanced")[0];
  assert.equal(resolveSessionSpeakerGender({ scenarioId: PARCEL, difficultyLevel: "advanced", flowVariantId: advanced.variantId }), "female");
  assert.equal(
    resolveSessionSpeakerGender({ scenarioId: PARCEL, difficultyLevel: "advanced", flowVariantId: advanced.variantId, challengeId: "c1" }),
    undefined,
    "챌린지 수신자 세션은 전이가 없으므로 성별도 없다(AC-106 (g))",
  );
  assert.equal(resolveSessionSpeakerGender({ scenarioId: PARCEL, difficultyLevel: "advanced" }), undefined, "변형 ID 부재(옛 세션) = 종전");
  // 층 1 — Gemini 음성 풀이 세션 성별을 따른다(부재면 표 — 오늘 동작).
  const female = new Set<string>();
  const union = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    female.add(pickGeminiVoiceName(PARCEL, `sid-${i}`, "female"));
    union.add(pickGeminiVoiceName(PARCEL, `sid-${i}`));
  }
  assert.equal(female.size, 1, "세션 성별을 넘기면 그 성별 풀 하나에서만 고른다");
  assert.ok(union.size >= 2, "넘기지 않으면 종전(notApplicable = 합집합) 그대로");
});

test("[T194-a G582] 호출부 — 프롬프트 3곳이 세션 단위 성별을 쓰고 createRealtimeCall이 그 값을 1회 해석해 넘긴다(소스 스캔)", () => {
  const read = (rel: string) => fs.readFileSync(path.join(FUNCTIONS_SRC, rel), "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(read("roleplay/index.ts"), /speakerGender: resolveSessionSpeakerGender\(session\),/);
  assert.match(read("roleplay/openingLine.ts"), /speakerGender: resolveSessionSpeakerGender\(sessionView\),/);
  const provider = read("realtime/geminiProvider.ts");
  assert.match(provider, /const speakerGender = input\.speakerGender \?\? speakerGenderFor\(input\.scenarioId\);/);
  assert.match(provider, /pickGeminiVoiceName\(input\.scenarioId, input\.sessionId, speakerGender\)/);
  assert.match(read("realtime/index.ts"), /speakerGender: resolveSessionSpeakerGender\(session\),/);
  // 시나리오 단위 표만 읽는 옛 호출 형태가 프롬프트 호출부에 남지 않았다.
  for (const rel of ["roleplay/index.ts", "roleplay/openingLine.ts"]) {
    assert.equal(/speakerGender: speakerGenderFor\(/.test(read(rel)), false, `${rel}: 시나리오 단위 성별 직접 사용`);
  }
});
