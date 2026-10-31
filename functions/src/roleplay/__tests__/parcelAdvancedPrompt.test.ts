// T194-a G586 — parcel 고급 프롬프트 · 범위 밖 무변경 · 화자 성별 세션 해석 (docs/Architecture.md §84.4.2 · §84.4.3 · §84.4.6 ·
// PRD AC-106 (a)(b)(f)).
//
// ⚠️ 위치: 설계 표는 `promptAssembly.test.ts`를 지목했으나 그 파일(1,800줄+)에 섞지 않고 같은 디렉터리의 새 파일로 뒀다 — 단언 내용은
// 설계 G586 행 그대로다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildSystemPrompt, REAL_COMPANY_PROMPT_SENTENCE } from "../promptAssembly";
import { R3C2_LENGTH_DELTA, revertR3C2 } from "./r3NoStallDelta";
import { FULL_AUDIT_LENGTH_DELTA, revertFullAudit } from "./fullAuditDelta";

/** §85 — 조립 결과에 들어간 형태(앞 공백 포함). */
const COMPANY_SENTENCE_WITH_SPACE = ` ${REAL_COMPANY_PROMPT_SENTENCE}`;
import { isL3Procedural } from "../l3Depth";
import { asksIdentityCheck } from "../personaAuthority";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { listFlowVariants, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import {
  PARCEL_ADVANCED_LEG_PERSONA,
  PARCEL_CONTROL_TOKEN_GUARD_ITEM,
} from "../../scenarios/messengerParcelSmishingSms.prompt";
import { PUBLIC_SCENARIOS } from "../../scenarios/publicMeta";
import { isMockScreenReachable, listAppInstallMockScreens } from "../../scenarios/mockScreens";
import { resolveSessionEscalation } from "../../scenarios/escalation";
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
 * ⭐ 변경 **전** 기준값 — 병합 기준 시점(base = main 49defd7 — #320 가상 기관명 · #321 A-1 공회전 수정 병합 뒤. 최초 측정은 b7fde97 기준이었고 main 병합 때 같은 스크립트로 다시 쟀다)의 `functions/lib`로 같은 옵션을 조립해 잰 sha256.
 * 2026-10-20(Architecture §85 · 리뷰 M1) — 이 값은 **변경 전 그대로**다. 그 뒤 더해진 실존 회사명 금지 1문장(`REAL_COMPANY_PROMPT_SENTENCE`)은
 * 아래 테스트가 가드레일 항과 함께 걷어 내 대조한다 ⇒ 두 의도된 변경 외에는 한 바이트도 바뀌지 않았음을 테스트가 직접 보인다.
 * 측정 스크립트는 위 `assembleFor`와 같은 옵션(speakerGender = undefined)이다. 가드레일 보강 1항(§84.4.2 ⚠️ — 의도된 변경)을
 * 걷어 낸 산출물이 이 값과 같아야 한다 ⇒ 초급 · 중급 조립은 그 1항 외에 한 바이트도 바뀌지 않았다(AC-106 (f) · §84.4.6).
 */
const BASE_ASSEMBLY_SHA256: Readonly<Record<"beginner" | "intermediate", { variantId: string; sha256: string; length: number }>> = {
  beginner: { variantId: "fv-prr3", sha256: "c51c2658da7d615059316c343b7fcc671121c0a3bb4cfe8d7632b1c87f5f7b81", length: 6050 },
  intermediate: { variantId: "fv-tvq2", sha256: "b1a0c56bf39269221c5b3ffc7df42b1753ab24dfa5cedcf60210193e6bd6edfe", length: 5316 },
};

/**
 * ⭐ 변경 **후** 기대값(§84.13.3 ④ — 기대값 갱신은 사유와 함께). **사유**: parcel 가드레일에 제어 토큰 흉내 거부 항
 * (`PARCEL_CONTROL_TOKEN_GUARD_ITEM`, 77자)을 끝에 (5)로 덧붙였다 — 고급 흐름이 `[[SIGNAL:ESCALATE_VOICE]]`를 쓰기 시작해 지원금
 * 시나리오와 같은 안전 문면이 필요해졌고, 가드레일은 시나리오 단위 상수라 세 난이도 모두 1항이 는다(§84.4.2 ⚠️ 예고 그대로).
 * 위 변경 전 값과의 차이는 그 1항과 §85 실존 회사명 금지 1문장(2026-10-20 재측정)뿐이다(아래 테스트가 둘을 걷어 내 변경 전 값과 대조한다).
 * ⚠️ R3-C ②-a(2026-10-20 · 정본 Architecture §79.22 (6)) — 무조건부 NO_STALL_RULE 셋째 문장 교체로 다시 쟀다(직전 기대값
 * 초급 848274077c004992… 6221자 · 중급 88ee49b765f0164b… 5487자). 변경 전 값 대조는 그 교체분도 되돌려(`revertR3C2`) 한다.
 * ⚠️ 2026-10-22(전수 검수 · fullAuditDelta.ts) — 공통 [진행 강제] 두 곳(페이로드 예시 · 거절 요구 반복 금지 1문장) 교체로 다시 쟀다(직전 기대값
 * 초급 c287b4074dc0d4e3… 6242자 · 중급 fdb6ac8019a5c1be… 5508자). 변경 전 값 대조는 그 교체분도 되돌려(`revertFullAudit`) 한다.
 */
// §104(2026-10-22) — 공통 [진행 강제] 거절 요구 문장 교체(+67자) · [대화 방식] 주변 이야기 받아치기 1문장(+95자)으로 갱신. 직전 값: 초급 164a5a1014aa(6338자) · 중급 9702c9aa64b0(5604자).
// 교체분만 되돌리면 기준값과 같음은 아래 [§84.4.6] 테스트가 `revertFullAudit`로 매 실행 재증명한다.
const AFTER_ASSEMBLY_SHA256: Readonly<Record<"beginner" | "intermediate", { sha256: string; length: number }>> = {
  // §127 — 페이로드 줄에 참가자 언급 은행 되받기 1문장(+60자 · `USER_MENTIONED_FINANCIAL_SENTENCE`)으로 갱신. 직전 값: 초급 aac610a5e388(6500자) · 중급 44b6e585b4e4(5766자).
  // §129 — NO_STALL_RULE 뒤 무조건부 1항(+313자 · `CLAIM_CONSISTENCY_RULE` + 줄바꿈)으로 갱신. 직전 값: 초급 8f837c0fad8d(6560자) · 중급 b95c83661f25(5826자).
  // 2026-10-31 — 본인확인 항목 끝 "있을 수 없는 값 되묻기" 1문장(+236자 · `IMPOSSIBLE_IDENTITY_VALUE_SENTENCE`)으로 갱신. 직전 값: 초급 ae93113342a4(6873자) · 중급 8ad2cb971c20(6139자).
  // P0(2026-10-31 · in-service-experience-plan §2.1 K3) — [진행 강제] 서비스 밖 행동 예시 제거 · 금지 1문장(+111자 · `fullAuditDelta.ts` P0_TEXT_CHANGES)으로 갱신. 직전 값: 초급 9ffb578f574c(7109자) · 중급 ebcb922137e6(6375자).
  beginner: { sha256: "99314edcda719b36fc11825d3ee46237ee6044c97d744701e82626bf9dd26fb1", length: 7220 },
  intermediate: { sha256: "694a68b5ec486dc4f357824ce3ffe6b8acddeeecf4ab3e39f31eead8e245cb67", length: 6486 },
};

test("[T194-a G586 · §84.13.3 ④] parcel 초급 · 중급 조립 = 갱신 기대값(가드레일 (5)항 포함) · 가드레일 최후미", () => {
  for (const level of ["beginner", "intermediate"] as const) {
    const variantId = BASE_ASSEMBLY_SHA256[level].variantId;
    const assembled = assembleFor(level, variantId, undefined);
    assert.equal(assembled.length, AFTER_ASSEMBLY_SHA256[level].length, `${level}: 길이`);
    assert.equal(sha256(assembled), AFTER_ASSEMBLY_SHA256[level].sha256, `${level}: 바이트`);
    // §85 — 차이 = (5)항 + 실존 회사명 금지 1문장(앞 공백 포함).
    assert.equal(assembled.length - BASE_ASSEMBLY_SHA256[level].length, PARCEL_CONTROL_TOKEN_GUARD_ITEM.length + COMPANY_SENTENCE_WITH_SPACE.length + R3C2_LENGTH_DELTA + FULL_AUDIT_LENGTH_DELTA, `${level}: 차이 = (5)항 + §85 1문장 + R3-C ②-a 교체분 + 전수 검수 교체분 길이`);
    const guard = SCENARIO_PROMPTS[PARCEL].guardrailPreamble;
    assert.ok(assembled.trimEnd().endsWith(guard.trimEnd()), `${level}: 가드레일 최후미`);
  }
});

test("[T194-a G586 · §84.4.6] parcel 초급 · 중급 조립 = 변경 전 바이트(가드레일 1항 외 무변경) · [화자] 블록 0 · 역방향", (t) => {
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
    assert.equal(assembled.split(COMPANY_SENTENCE_WITH_SPACE).length - 1, 1, `${level}: §85 금지 1문장이 정확히 1회 있어야 한다`);
    const stripped = revertR3C2(revertFullAudit(assembled).replace(PARCEL_CONTROL_TOKEN_GUARD_ITEM, "").replace(COMPANY_SENTENCE_WITH_SPACE, ""));
    // 역방향 — 표 값을 "female"로 바꿨을 때(설계가 금지한 처방)의 산출물은 기준값과 달라진다.
    const withSpeaker = revertR3C2(revertFullAudit(assembleFor(level, variant.variantId, "female")).replace(PARCEL_CONTROL_TOKEN_GUARD_ITEM, "").replace(COMPANY_SENTENCE_WITH_SPACE, ""));
    lines.push(
      `${level}: 항 제거본 ${sha256(stripped).slice(0, 12)}(${stripped.length}자) = 기준 ${base.sha256.slice(0, 12)}(${base.length}자) · [화자] 넣은 샘플 ${sha256(withSpeaker).slice(0, 12)}(${withSpeaker.length}자)`,
    );
    assert.equal(stripped.length, base.length, `${level}: 길이가 기준과 다르다`);
    assert.equal(sha256(stripped), base.sha256, `${level}: 가드레일 1항 외의 바이트가 바뀌었다`);
    assert.notEqual(sha256(withSpeaker), base.sha256, `${level}: 역방향 — [화자] 블록이 생긴 샘플을 이 검사가 잡아야 한다`);
  }
  t.diagnostic(`[§84.4.6 before/after] ${lines.join(" | ")}`);
});

test("[T194-a G586] parcel 고급 프롬프트 — leg0 페르소나 · 설치 링크 · 전이 신호 규칙 · '순수 문자' 0 · 가드레일 제어 토큰 항 · 최후미", () => {
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

test("[T194-a G586 · §84.4.3] 화자 성별 세션 해석 — 표 값이 있으면 그대로 · parcel은 고급 자가만 변형 leg 성별 · 음성 풀도 같은 값", () => {
  // ⭐ 리뷰 C1 — 표 값이 notApplicable인 시나리오도 **전부** 본다(예전 `if (!table) continue`가 child-kakao 누수를 가렸다).
  // 기대값: 표 값이 있으면 그 값 · notApplicable이면 undefined — 단 택배 고급 자가 세션(advancedEscalation 전용)만 변형 leg 성별.
  const notApplicableSeen: string[] = [];
  for (const id of Object.keys(PUBLIC_SCENARIOS)) {
    const table = speakerGenderFor(id);
    if (!table) notApplicableSeen.push(id);
    for (const level of DIFFICULTY_LEVELS) {
      for (const variant of listFlowVariants(id, level)) {
        const expected = table ?? (variant.variantId === "fv-g454" ? "female" : undefined);
        assert.equal(
          resolveSessionSpeakerGender({ scenarioId: id, difficultyLevel: level, flowVariantId: variant.variantId }),
          expected,
          `${id}/${level}/${variant.variantId}: ${table ? "표 값 그대로(오늘 동작 무변경)" : "notApplicable은 undefined([화자] 블록 0)"}`,
        );
      }
    }
  }
  assert.deepEqual(
    notApplicableSeen.sort(),
    [
      "family-accident-deepvoice",
      "grandchild-impersonation",
      "messenger-child-impersonation-kakao",
      "messenger-friend-loan-kakao",
      "messenger-parcel-smishing-sms",
    ],
    "notApplicable 5종 전수를 봤다",
  );
  // 역방향 — 리뷰 C1 이전 구현(표 값 없음 ∧ 세션 전이 있음 ⇒ 변형 leg 성별)을 재현한 사본은 child-kakao에서 "female"을 내 위 단언에 걸린다.
  const preFix = (id: string, level: DifficultyLevel, variantId: string) =>
    speakerGenderFor(id) ??
    (resolveSessionEscalation({ scenarioId: id, difficultyLevel: level }, PUBLIC_SCENARIOS)
      ? listFlowVariants(id, level).find((v) => v.variantId === variantId)?.legs[0]?.speakerGender
      : undefined);
  const leaked = (["beginner", "intermediate", "advanced"] as const).map((level) => {
    const [v] = listFlowVariants("messenger-child-impersonation-kakao", level);
    return preFix("messenger-child-impersonation-kakao", level, v.variantId);
  });
  assert.deepEqual(leaked, ["female", "female", "female"], "역방향 샘플 — 옛 구현은 child-kakao 세 난이도에 성별을 부여한다");
  for (const value of leaked) assert.notEqual(value, undefined, "옛 구현 값은 위 기대값(undefined)과 달라 실패한다");
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

test("[T194-a G586] 호출부 — 프롬프트 3곳이 세션 단위 성별을 쓰고 createRealtimeCall이 그 값을 1회 해석해 넘긴다(소스 스캔)", () => {
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

test("[T194-a 리뷰 m1] sendMessage의 설치 응낙 읽기는 이 세션에서 도달 가능한 설치 항목이 있을 때만 — parcel 초급 · 중급 읽기 0 · 고급 · 지원금은 그대로", () => {
  const code = fs.readFileSync(path.join(FUNCTIONS_SRC, "roleplay/index.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(code, /if \(listAppInstallMockScreens\(session\.scenarioId\)\.some\(\(item\) => isMockScreenReachable\(session, item\)\)\) \{/);
  assert.equal(/hasAppInstallMockScreen\(session\.scenarioId\)/.test(code), false, "카탈로그 소속만 보는 옛 게이트가 남았다");
  const readsFor = (scenarioId: string, difficultyLevel: string, flowVariantId: string | undefined) =>
    listAppInstallMockScreens(scenarioId).some((item) => isMockScreenReachable({ scenarioId, difficultyLevel, flowVariantId }, item));
  assert.equal(readsFor(PARCEL, "beginner", "fv-prr3"), false);
  assert.equal(readsFor(PARCEL, "intermediate", "fv-tvq2"), false);
  assert.equal(readsFor(PARCEL, "advanced", "fv-g454"), true);
  for (const [level, v] of [["beginner", "fv-rizf"], ["intermediate", "fv-afbr"], ["advanced", "fv-hu8w"], ["intermediate", undefined]] as const) {
    assert.equal(readsFor("messenger-subsidy-smishing-sms", level, v), true, `subsidy ${level}/${v ?? "변형 부재"}: 현행 그대로 읽는다`);
  }
});
