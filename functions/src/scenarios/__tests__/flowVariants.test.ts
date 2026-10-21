// 흐름 변형 데이터 게이트 — T191 S5 / PRD AC-096 (a)(b)(c)(e)(g) · AC-097 (a)(c)(e) · AC-102 (a)~(f)(i).
// 설계: T191 흐름 변형 설계(Architecture T191 절 — 게이트 표의 "변형 데이터 무결성 · 범위표 · 난이도 간 차이 ·
// 서버 전용 · 고급 전용 표 · 안전 금지 패턴" 행. 절 · G 번호는 병합 순서로 재지정될 예정이라 테스트
// 이름에 **의미**를 적는다).
//
// ⚠️ 축 D 판정은 `exitBlockLabelRules.ts`(기존 T102 규칙표 — 문면 그대로 옮긴 테스트 헬퍼)로만 한다.
// ⚠️ 역방향 확인(AC-096 (g) · AC-097 (i) · AC-102 (i))은 **테스트 코드 안에서만** 오염 샘플을 만들고, 정상
// 샘플과 **같은 실행 출력에 나란히**(t.diagnostic) 보인다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  FLOW_VARIANTS,
  FLOW_VARIANT_SPECS,
  RELAY_RUNTIME_AVAILABLE,
  UNRESOLVED_TACTIC_LABELS,
  listFlowVariants,
  resolveSessionScenarioPrompt,
  resolveVariantPrompt,
  type FlowVariant,
} from "../flowVariants";
import { SCENARIO_PROMPTS } from "../index";
// T194-c-1(§84.16.1) — 배정 풀은 `variantPool.ts`로 옮겼다(순환 회피 — 정의 이동 · 단언 무변경).
import { assignablePool } from "../variantPool";
import { resolveScenarioEscalation, resolveSessionEscalation } from "../escalation";
import { PUBLIC_SCENARIOS, isAdvancedOnlyScenario } from "../publicMeta";
import { IN_CALL_SMS } from "../inCallSms";
import { extractTacticLabel } from "../tacticFlavor";
import type { AxisExitBlock } from "../axes";
import { derivedExitBlock } from "./exitBlockLabelRules";
import { REAL_WORLD_APP_NAMES, REAL_WORLD_HOTLINES } from "./harmlessnessPatterns";
import { SESSION_MARKER_WORDS } from "./sessionMarkerWords";
import { l3DepthMode } from "../../roleplay/l3Depth";
import { buildSystemPrompt, REAL_COMPANY_PROMPT_SENTENCE } from "../../roleplay/promptAssembly";
import { resolveTacticCategory } from "../../report/tacticCategory";
import { DIFFICULTY_LEVELS, type DifficultyLevel } from "../../shared/difficulty";
import * as crypto from "node:crypto";
import { isL3Procedural } from "../../roleplay/l3Depth";
import { asksIdentityCheck } from "../../roleplay/personaAuthority";
import { sessionDeclaresInCallSms } from "../../inCallSms/smsGate";
import { CHILD_CALL_PHASE_RULE, CHILD_GENDER_UNSPECIFIED_RULE } from "../messengerChildImpersonationKakao.prompt";
import { resolveSessionSpeakerGender, speakerGenderFor } from "../../realtime/scenarioVoice";
import { pickGeminiVoiceName } from "../../realtime/geminiProvider";
import { revertR3C2 } from "../../roleplay/__tests__/r3NoStallDelta";
import { revertFullAudit } from "../../roleplay/__tests__/fullAuditDelta";

const SRC_ROOT = path.resolve(__dirname, "../../../../src");
const FUNCTIONS_SRC = path.resolve(__dirname, "../../../src");

// ── 공통 판정 함수 ───────────────────────────────────────────────────────────

/** 실제로 그 세션이 받는 축 D = 콘텐츠 라벨(T102 규칙표) ∪ 고급 L3 오버레이(l3Depth.ts). 비면 D0_none. */
function effectiveExitBlock(variant: Pick<FlowVariant, "scenarioId" | "level" | "tactics">): AxisExitBlock[] {
  const found = new Set<AxisExitBlock>(derivedExitBlock(variant.tactics));
  if (variant.level === "advanced") {
    const mode = l3DepthMode(variant.scenarioId);
    if (mode === "d3_and_d4") {
      found.add("D3_verification_hijack");
      found.add("D4_procedural_legitimacy");
    } else if (mode === "d4_only") {
      found.add("D4_procedural_legitimacy");
    }
  }
  return found.size === 0 ? ["D0_none"] : [...found].sort();
}

/**
 * 범위표 예외(조용한 누락 금지 — 키를 **명시**하고, 아래 테스트가 이 집합을 데이터에서 다시 계산해 대조한다).
 * ① 고급 D3/D4 ≥ 1 예외 = L3 `reduced` 4종(§17.7 옵션 A — 가족 · 지인 사칭은 절차를 말하면 페르소나가 무너진다).
 * ② 중급 문자 1~2통 예외 = 통화 중 문자 카탈로그가 없는 시나리오(문자 신설은 S5b 범위 · 메신저 채널은 통화 중 문자 없음).
 *    ⚠️ 문자 칸은 **선언값 검증**이다 — 런타임 발송은 S5b 전까지 카탈로그(`inCallSms.ts`) 기준이라 이 검사가
 *    통과해도 실제 통화의 문자 수가 범위 안이라는 뜻이 아니다.
 * ③ 중급 기존 수법 예외(planner 확인 대기 — AC-096 (b) vs DECISIONS #44): 중급은 기존 시나리오의 수법을
 *    빼앗지 않는다(사용자 확정 · Architecture §17.4.1). 그래서 중급 축 D 범위(D1 · D2 · D5) 밖 라벨이 남는 시나리오와
 *    그 값을 아래에 명시한다.
 * ⚠️ 세 예외 모두 PRD AC-096 (b) 문면과 다르다 — 이 테스트가 통과해도 "AC-096 (b) 충족"이 아니라 "예외를 뺀 범위 대조
 * 통과"다. planner 확인 요청으로 보고했다.
 */
const ADVANCED_D34_EXEMPT = [
  "family-accident-deepvoice",
  "grandchild-impersonation",
  "messenger-child-impersonation-kakao",
  "messenger-friend-loan-kakao",
];
const INTERMEDIATE_EXISTING_TACTIC_EXEMPT: Readonly<Record<string, readonly AxisExitBlock[]>> = {
  "kidnapping-threat": ["D6_report_blocking"], // "신고 차단 지시"
  "loan-refinance-scam": ["D4_procedural_legitimacy"], // "절차·서류 정당화"
};
const INTERMEDIATE_SMS_EXEMPT = [
  "family-accident-deepvoice",
  "grandchild-impersonation",
  "kidnapping-threat",
  "messenger-child-impersonation-kakao",
  "messenger-friend-loan-kakao",
  "messenger-parcel-smishing-sms",
  "messenger-subsidy-smishing-sms",
];

/** PRD AC-096 (b) 자동 검증표(78.2.3). 위반 목록을 돌려준다(빈 배열 = 범위 안). */
function rangeViolations(v: FlowVariant): string[] {
  const out: string[] = [];
  const d = effectiveExitBlock(v).filter((x) => x !== "D0_none");
  const sms = v.sms.length;
  const legs = v.legs.length;
  if (v.level === "beginner") {
    if (sms > 1) out.push(`초급 문자 ${sms}통(0~1)`);
    if (legs !== 1) out.push(`초급 인원 ${legs}(1)`);
    if (d.length > 1 || d.some((x) => x !== "D1_time_pressure")) out.push(`초급 축 D ${d.join(",")}(D0 또는 D1 1개까지)`);
    if (v.demandStages !== 1) out.push(`초급 요구 ${v.demandStages}단(1)`);
  } else if (v.level === "intermediate") {
    if ((sms < 1 && !INTERMEDIATE_SMS_EXEMPT.includes(v.scenarioId)) || sms > 2) out.push(`중급 문자 ${sms}통(1~2)`);
    if (legs < 1 || legs > 2) out.push(`중급 인원 ${legs}(1~2)`);
    const allowed: string[] = [
      "D1_time_pressure",
      "D2_secrecy",
      "D5_call_retention",
      ...(INTERMEDIATE_EXISTING_TACTIC_EXEMPT[v.scenarioId] ?? []),
    ];
    if (d.some((x) => !allowed.includes(x))) out.push(`중급 축 D ${d.join(",")}(⊆ D1 · D2 · D5)`);
    if (v.demandStages < 1) out.push(`중급 요구 ${v.demandStages}단(≥1)`);
  } else {
    if (sms > 3) out.push(`고급 문자 ${sms}통(0~3)`);
    if (legs < 1 || legs > 3) out.push(`고급 인원 ${legs}(1~3)`);
    const hasD34 = d.includes("D3_verification_hijack") || d.includes("D4_procedural_legitimacy");
    if (!hasD34 && !ADVANCED_D34_EXEMPT.includes(v.scenarioId)) out.push(`고급 축 D ${d.join(",")}(D3 또는 D4 ≥ 1)`);
    if (v.demandStages < 2) out.push(`고급 요구 ${v.demandStages}단(≥2)`);
  }
  return out;
}

// ── 변형 데이터 무결성 ─────────────────────────────────────────────────────────

test("[T191 S5 변형 데이터] 시나리오 17종 × 허용 난이도마다 변형 ≥ 1 · 고급 전용 3종은 고급에만 있다", (t) => {
  const ids = Object.keys(PUBLIC_SCENARIOS).sort();
  assert.equal(ids.length, 17, "시나리오 17종(기존 14 + 고급 전용 3) 전제");
  const grid: string[] = [];
  for (const id of ids) {
    for (const level of DIFFICULTY_LEVELS) {
      const n = listFlowVariants(id, level).length;
      grid.push(`${id}/${level}=${n}`);
      if (isAdvancedOnlyScenario(id) && level !== "advanced") {
        assert.equal(n, 0, `${id}: 고급 전용인데 ${level} 변형이 있다(AC-097 (b))`);
      } else {
        assert.ok(n >= 1, `${id}/${level}: 허용 변형 0개 — createSession이 failed-precondition으로 막힌다(AC-096 (f))`);
      }
    }
  }
  // 데이터에 있는 시나리오가 전부 등록된 시나리오다(고아 변형 0).
  for (const v of FLOW_VARIANTS) assert.ok(SCENARIO_PROMPTS[v.scenarioId], `${v.variantId}: 없는 시나리오 ${v.scenarioId}`);
  t.diagnostic(`변형 ${FLOW_VARIANTS.length}벌 · ${grid.filter((g) => !g.endsWith("=0")).length}칸 충족`);
});

test("[T191 S5 변형 데이터] 저작 입력의 라벨이 전부 원천에 실재한다(조용한 누락 0) · 문자 참조가 카탈로그 소속이다", () => {
  assert.deepEqual(UNRESOLVED_TACTIC_LABELS, [], "keep/drop/extra 라벨이 원천에 없다 — 수법이 조용히 빠졌다");
  const kindByPurpose = { identity: "otp", transfer: "account", link: "link" } as const;
  for (const v of FLOW_VARIANTS) {
    assert.ok(v.tactics.length > 0, `${v.variantId}: 수법 0개`);
    assert.ok(v.legs.length >= 1, `${v.variantId}: 인원 0`);
    for (const sms of v.sms) {
      const item = IN_CALL_SMS[v.scenarioId]?.find((i) => i.smsId === sms.smsId);
      assert.ok(item, `${v.variantId}: smsId ${sms.smsId}가 ${v.scenarioId} 카탈로그에 없다(G12와 같은 소속 원칙)`);
      assert.equal(item.kind, kindByPurpose[sms.purpose], `${v.variantId}: ${sms.smsId} 목적(${sms.purpose})과 종류(${item.kind}) 불일치`);
    }
  }
});

test("[T191 S5 축 D] 각 변형의 선언 exitBlock = 콘텐츠 라벨 ∪ 고급 L3 오버레이(양방향 — 누락도 허위 추가도 실패)", () => {
  for (const v of FLOW_VARIANTS) {
    assert.deepEqual([...v.exitBlock].sort(), effectiveExitBlock(v), `${v.variantId}(${v.scenarioId}/${v.level})`);
  }
});

// ── AC-096 (b) 범위표 ─────────────────────────────────────────────────────────

test("[T191 S5 범위표 대조 · AC-096 (b) — 명시 예외 3종 제외 · 문자는 선언값 검증] 모든 변형이 자기 난이도 열 범위 안이다 · 역방향 ⓐ 초급에 D3를 넣은 샘플은 실패한다", (t) => {
  const failures = FLOW_VARIANTS.flatMap((v) => rangeViolations(v).map((m) => `${v.variantId}(${v.scenarioId}/${v.level}): ${m}`));
  assert.deepEqual(failures, []);
  // 예외 집합은 손으로 적었지만 데이터에서 다시 계산해 **정확히 같아야** 한다(늘지도 줄지도 않게).
  const reduced = Object.keys(PUBLIC_SCENARIOS).filter((id) => l3DepthMode(id) === "reduced").sort();
  assert.deepEqual([...ADVANCED_D34_EXEMPT].sort(), reduced, "고급 D3/D4 예외 = L3 reduced 집합");
  const noSmsCatalog = Object.keys(PUBLIC_SCENARIOS)
    .filter((id) => !isAdvancedOnlyScenario(id) && (IN_CALL_SMS[id] ?? []).length === 0)
    .sort();
  assert.deepEqual([...INTERMEDIATE_SMS_EXEMPT].sort(), noSmsCatalog, "중급 문자 예외(선언값) = 통화 중 문자 카탈로그가 없는 시나리오");
  // 중급 기존 수법 예외 — 데이터에서 재계산(중급 축 D 범위 밖 값)해 상수와 정확히 같아야 한다.
  const recomputed: Record<string, AxisExitBlock[]> = {};
  for (const v of FLOW_VARIANTS.filter((x) => x.level === "intermediate")) {
    const extra = effectiveExitBlock(v).filter(
      (x) => !["D0_none", "D1_time_pressure", "D2_secrecy", "D5_call_retention"].includes(x),
    );
    if (extra.length > 0) recomputed[v.scenarioId] = extra;
  }
  assert.deepEqual(recomputed, INTERMEDIATE_EXISTING_TACTIC_EXEMPT, "중급 기존 수법 예외 = 데이터 재계산값(planner 확인 대기)");

  // 역방향 ⓐ — 정상 초급 변형 vs 같은 변형에 D3 수법 1개를 섞은 샘플(테스트 안에서만 오염).
  const beginner = listFlowVariants("institutional-impersonation", "beginner")[0];
  const tainted: FlowVariant = {
    ...beginner,
    tactics: [...beginner.tactics, "확인 시도 무력화 — 확인해 보라고 권한 뒤 같은 요구를 다시 꺼낸다."],
  };
  const ok = rangeViolations(beginner);
  const bad = rangeViolations(tainted);
  t.diagnostic(`정상 초급 ${beginner.variantId}: 위반 ${JSON.stringify(ok)} / D3 샘플: 위반 ${JSON.stringify(bad)}`);
  assert.deepEqual(ok, []);
  assert.ok(bad.some((m) => m.startsWith("초급 축 D")), "D3를 넣은 초급 샘플이 범위 검사에 걸려야 한다");
});

test("[T191 S5 초급 이탈 차단 0 · AC-096 (d)] 초급 변형 수법에 D2~D6 라벨 0건(D1은 1개까지)", () => {
  for (const v of FLOW_VARIANTS.filter((x) => x.level === "beginner")) {
    const d = derivedExitBlock(v.tactics);
    assert.ok(
      d.every((x) => x === "D1_time_pressure"),
      `${v.variantId}(${v.scenarioId}): 초급 수법에 이탈 차단 ${d.join(",")} — 문면 충돌(문제 5) 재발`,
    );
  }
});

// ── AC-096 (c) 난이도 간 차이 ──────────────────────────────────────────────────

/**
 * "현행" 행(§2.6.3 — 이번 범위에서 흐름을 새로 만들지 않는 닫힌 예외). 데이터의 `authoring:"current"`와
 * 정확히 같아야 한다(조용한 누락 금지 — AC-096 (c)).
 */
const CURRENT_VARIANT_ROWS: readonly string[] = [
  "bank-security-verify-scam/advanced",
  "bank-security-verify-scam/intermediate",
  "family-accident-deepvoice/intermediate",
  "grandchild-impersonation/intermediate",
  "kidnapping-threat/intermediate",
  "messenger-child-impersonation-kakao/intermediate",
  "messenger-friend-loan-kakao/advanced",
  "messenger-friend-loan-kakao/beginner",
  "messenger-friend-loan-kakao/intermediate",
  // T194-a(PRD AC-096 갱신 고지 3 ① · AC-106 · User 결정 U7) — parcel 고급의 자가 변형 `fv-g454`는 authored(새 흐름)가 됐고,
  // §84.13.5 처방 2로 챌린지 수신자용 "현행" 변형(`fv-k7qm` — T194 이전 `fv-g454` 내용)이 들어와 이 행은 그 변형을 가리킨다.
  "messenger-parcel-smishing-sms/advanced",
  // 초급 · 중급은 그대로 "현행"(AC-106 (f)).
  "messenger-parcel-smishing-sms/beginner",
  "messenger-parcel-smishing-sms/intermediate",
  "messenger-subsidy-smishing-sms/advanced",
  "messenger-subsidy-smishing-sms/beginner",
  "messenger-subsidy-smishing-sms/intermediate",
  "reputation-blackmail-scam/advanced",
  "reputation-blackmail-scam/beginner",
  "reputation-blackmail-scam/intermediate",
  "tax-refund-scam/advanced",
  "tax-refund-scam/intermediate",
];

function differsEnough(a: FlowVariant, b: FlowVariant): string[] {
  const reasons: string[] = [];
  const tactics = (v: FlowVariant) => [...v.tactics].sort().join("\n");
  const smsSet = (v: FlowVariant) => v.sms.map((s) => s.smsId).sort().join(",");
  if (tactics(a) === tactics(b)) reasons.push("수법 목록이 같다");
  if (smsSet(a) === smsSet(b) && a.legs.length === b.legs.length && a.demandStages === b.demandStages) {
    reasons.push("문자 · 인원 · 요구 단계가 모두 같다");
  }
  return reasons;
}

test("[T191 S5 난이도 간 차이 · AC-096 (c)] '현행' 행은 상수에 명시 · 저작 변형끼리는 수법이 다르고 {문자·인원·요구 단계} 중 1개 이상 다르다 · 역방향 ⓑ", (t) => {
  const currentRows = FLOW_VARIANTS.filter((v) => v.authoring === "current").map((v) => `${v.scenarioId}/${v.level}`).sort();
  assert.deepEqual(currentRows, [...CURRENT_VARIANT_ROWS].sort());
  const failures: string[] = [];
  let pairs = 0;
  for (const id of Object.keys(PUBLIC_SCENARIOS)) {
    const authored = FLOW_VARIANTS.filter((v) => v.scenarioId === id && v.authoring === "authored");
    for (let i = 0; i < authored.length; i += 1) {
      for (let j = i + 1; j < authored.length; j += 1) {
        if (authored[i].level === authored[j].level) continue; // 같은 난이도의 회전 변형끼리는 비교 대상 아님
        pairs += 1;
        const reasons = differsEnough(authored[i], authored[j]);
        if (reasons.length > 0) failures.push(`${authored[i].variantId} vs ${authored[j].variantId}: ${reasons.join(" · ")}`);
      }
    }
  }
  assert.deepEqual(failures, []);
  // 역방향 ⓑ — 초급 · 고급 수법 목록을 같게 만든 샘플.
  const b = listFlowVariants("card-company-impersonation", "beginner")[0];
  const a = listFlowVariants("card-company-impersonation", "advanced")[0];
  const tainted: FlowVariant = { ...b, tactics: [...a.tactics] };
  t.diagnostic(`비교 쌍 ${pairs}개 · 정상 ${b.variantId} vs ${a.variantId}: ${JSON.stringify(differsEnough(b, a))} / 수법 동일 샘플: ${JSON.stringify(differsEnough(tainted, a))}`);
  assert.deepEqual(differsEnough(b, a), []);
  assert.ok(differsEnough(tainted, a).includes("수법 목록이 같다"));
});

// ── 클라 비노출(D-46 · ADR-0004 · UX 계약 C-4) ─────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

test("[T191 S5 클라 비노출] 변형 ID는 불투명 형식 · 클라 소스(src/**)에 변형 모듈 · 필드 0 · 공개 메타에 변형 정보 0", () => {
  const ids = FLOW_VARIANTS.map((v) => v.variantId);
  assert.equal(new Set(ids).size, ids.length, "variantId 중복");
  for (const id of ids) assert.match(id, /^fv-[a-z0-9]{4,}$/, `${id}: 불투명 ID 형식 위반`);
  const clientHits = walk(SRC_ROOT).filter((file) => /flowVariant|variantRotation/.test(fs.readFileSync(file, "utf-8")));
  assert.deepEqual(clientHits, [], "클라 번들이 변형 모듈 · 필드를 참조한다(X1 · C-4 위반)");
  // 주석은 빼고 코드만 본다(주석이 이 게이트 이름을 언급해도 정보 노출이 아니다).
  const metaSource = fs
    .readFileSync(path.join(FUNCTIONS_SRC, "scenarios/publicMeta.ts"), "utf-8")
    .replace(/\/\/[^\n]*/g, "");
  assert.equal(/flowVariant|fv-[a-z0-9]{4}/.test(metaSource), false, "publicMeta에 변형 정보가 섞였다");
  for (const meta of Object.values(PUBLIC_SCENARIOS)) {
    assert.equal(JSON.stringify(meta).includes("fv-"), false);
  }
});

test("[T191 S5 클라 비노출] createSession 응답 객체에 flowVariantId가 없다(세션 문서에만 — C-4)", () => {
  const source = fs.readFileSync(path.join(FUNCTIONS_SRC, "session/index.ts"), "utf-8");
  const handler = source.slice(source.indexOf("export const createSession"), source.indexOf("export const endSession"));
  const returnBlock = handler.slice(handler.lastIndexOf("return {"));
  assert.ok(returnBlock.includes("sessionId: sessionRef.id"), "응답 블록을 못 찾았다(스캔 범위 확인)");
  assert.equal(returnBlock.includes("flowVariant"), false);
  assert.ok(handler.includes("flowVariantId: variantAssignment.flowVariantId"), "세션 문서에는 기록돼야 한다");
});

// ── 수법 품질 — 리포트 분류 · 요구 경로 · 세션 중 표식 ─────────────────────────

test("[T191 S5 수법 품질] 변형 수법 라벨이 리포트 분류 other로 떨어지지 않고 · 요구 수법이 1개 이상 남는다", () => {
  const demandCategories = ["payment_demand", "personal_info_demand", "link_or_install"];
  for (const v of FLOW_VARIANTS) {
    const categories = v.tactics.map((tactic) => resolveTacticCategory(extractTacticLabel(tactic)));
    const other = v.tactics.filter((_, i) => categories[i] === "other").map(extractTacticLabel);
    assert.deepEqual(other, [], `${v.variantId}: 분류 미매핑 라벨`);
    assert.ok(categories.some((c) => demandCategories.includes(c)), `${v.variantId}: 요구 수법이 0개 — 요구에 도달할 경로가 없다(T91)`);
  }
});

/** 변형이 새로 들여오는 문면(원본 시나리오 수법에 없는 수법 · 단계 요약 · 흐름 블록 · leg 표기 · 결정 순간). */
function newVariantTexts(): { where: string; text: string }[] {
  const baseTactics = new Set(Object.values(SCENARIO_PROMPTS).flatMap((p) => p.weakenedTactics));
  const out: { where: string; text: string }[] = [];
  for (const v of FLOW_VARIANTS) {
    for (const tactic of v.tactics) if (!baseTactics.has(tactic)) out.push({ where: `${v.variantId} tactic`, text: tactic });
    for (const stage of v.stages) out.push({ where: `${v.variantId} ${stage.stageId}`, text: stage.summary });
    const composed = resolveVariantPrompt(SCENARIO_PROMPTS[v.scenarioId], v).personaPrompt;
    // T194-a — 0번 leg 페르소나가 원본을 덮는 변형(parcel 고급)은 그 페르소나 뒤가 흐름 블록이다(페르소나 자체는 아래 leg 표면으로 들어간다).
    const personaHead = v.legs[0]?.personaPrompt ?? SCENARIO_PROMPTS[v.scenarioId].personaPrompt;
    const block = composed.slice(personaHead.length);
    if (block) out.push({ where: `${v.variantId} flowBlock`, text: block });
    v.legs.forEach((leg, i) => out.push({ where: `${v.variantId} leg${i}`, text: `${leg.callerLabel} ${leg.personaPrompt ?? ""}` }));
    if (v.decisionMoment) out.push({ where: `${v.variantId} decisionMoment`, text: v.decisionMoment });
  }
  return out;
}

test("[T191 S5 세션 중 표식] 변형이 들여오는 문면에 세션 중 표식 낱말 0건(AC-086 · G446과 같은 목록)", () => {
  const hits = newVariantTexts().flatMap(({ where, text }) =>
    SESSION_MARKER_WORDS.filter((w) => text.includes(w)).map((w) => `${where}: ${w}`),
  );
  assert.deepEqual(hits, []);
});

// ── AC-102 안전 · 무해화(D5 법무 4항) ──────────────────────────────────────────

/**
 * ⚠️ **한계(정직 고지)**: 아래 규칙은 **열거식**이다 — 목록에 없는 실존 앱명 · 지명 · 부서명 · 번호는 잡지 못한다.
 * 이 게이트가 보장하는 것은 "사례 노트 · 기존 정본 목록에 나온 이름이 신규 콘텐츠에 들어오지 않는다"까지다.
 * 그 밖의 실존 명칭은 콘텐츠 리뷰(reviewer)가 판정한다. 목록 확장은 선택 사항이다.
 *
 * AC-102 (f) — 금지 목록 상수(사례 노트 docs/research/scam-cases-2026-10.md에 나온 실제 명칭 · 번호 포함).
 * ⚠️ 한글에 `\b`를 쓰지 않는다(T86 reviewer Major 1 — JS `\b`는 ASCII 경계).
 */
const AC102_RULES: readonly { code: string; pattern: RegExp; sample: string }[] = [
  // (b) D5 ① — 실존 앱 · 서비스(원격제어 · 금융 · 메신저 · 거래소). 기존 정본 목록 + 사례 노트 명칭.
  ...[...REAL_WORLD_APP_NAMES, "시그널", "텔레그램", "토스뱅크", "업비트", "빗썸", "코인원", "코빗", "바이낸스", "테더", "USDT"].map(
    (name) => ({ code: "(b) 실존 앱명", pattern: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), sample: `${name} 앱을 설치하세요` }),
  ),
  // (c) D5 ② — 실제 검찰 하부 명칭 · 지청명 · 상담 창구(사례 C01 · C05 · C09 · C12).
  { code: "(c) 실제 부서·지청명", pattern: /서울중앙지검|중앙지검|[가-힣]{1,6}지방검찰청|[가-힣]{1,6}지청|대검찰청|대검(?!수)|찐센터|합동수사단|형사\d+부|특수부(?!터)/, sample: "서울중앙지검 검사입니다" },
  // (c) 실제 대표번호(사례 C03 · C04의 1332 · 1301 · 112 등) — 숫자 경계로 검사.
  ...REAL_WORLD_HOTLINES.map((n) => ({ code: "(c) 실제 대표번호", pattern: new RegExp(`(^|\\D)${n}(\\D|$)`), sample: `${n}로 확인해 보세요` })),
  // (d) D5 ③ — 장소 특정(실제 지명 · 역 이름 · 건물). 사례 C05 · C06 · C07 · C10 · C11의 지명 포함.
  { code: "(d) 실제 지명", pattern: /서울|부산|대구|인천|광주|대전|울산|세종|강남|강동|의왕|공항/, sample: "강동 쪽에서 직원이 기다립니다" },
  { code: "(d) 역 · 보관함", pattern: /지하철역|기차역|(?<!지)[가-힣]{1,4}역\s*(보관함|앞|출구|근처|에서|으로)|보관함/, sample: "강남역 보관함에 넣어 두세요" },
  // (e) D5 ④ — 고립 상세(장소 유형 · 숙박 · 기기 구입). 사례 C05 · C06 · C07 · C08.
  { code: "(e) 고립 상세", pattern: /모텔|호텔|숙소|숙박|여관|객실|투숙|공기계|안전폰|중고폰|새\s*휴대폰|휴대폰을\s*(사|구입|마련)/, sample: "근처 모텔에 혼자 들어가 계세요" },
];

function ac102Hits(text: string): string[] {
  return AC102_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.code);
}

/** 검사 대상 — 고급 전용 3종 콘텐츠 전부(프롬프트 · 공개 메타 · 클라 미러) + 변형이 들여오는 문면 전부(릴레이 leg 포함). */
function ac102Targets(): { where: string; text: string }[] {
  const out = newVariantTexts();
  for (const id of Object.keys(PUBLIC_SCENARIOS).filter(isAdvancedOnlyScenario)) {
    const prompt = SCENARIO_PROMPTS[id];
    out.push({ where: `${id} persona`, text: prompt.personaPrompt });
    prompt.weakenedTactics.forEach((t, i) => out.push({ where: `${id} tactic${i}`, text: t }));
    const meta = PUBLIC_SCENARIOS[id];
    for (const field of ["title", "fraudType", "difficulty", "callerLabel"] as const) out.push({ where: `${id} meta.${field}`, text: meta[field] });
    meta.deepvoiceLines.forEach((l) => out.push({ where: `${id} ${l.lineId}`, text: l.text }));
  }
  return out;
}

test("[T191 S5 안전 · AC-102 (b)~(e)] 신규 콘텐츠 · 변형 문면 전부에 실존 앱명 · 실제 부서명 · 대표번호 · 지명 · 고립 상세 0건", (t) => {
  const targets = ac102Targets();
  const failures = targets.flatMap(({ where, text }) => ac102Hits(text).map((code) => `${where}: ${code}`));
  t.diagnostic(`[AC-102 (a)] 검사 대상 문면 after=${targets.length} (before=0 — 신규) · 규칙 ${AC102_RULES.length}개`);
  assert.deepEqual(failures, []);
});

test("[T191 S5 안전 역방향 · AC-102 (i)] 실존 앱명 · 실제 지청명 · 실제 대표번호 · 실제 역 이름 · 고립 장소 샘플이 **각각** 실패하고 정본은 통과한다", (t) => {
  const samples: [string, string][] = [
    ["(b) 실존 앱명", "팀뷰어를 설치해 주셔야 점검이 됩니다"],
    ["(c) 실제 부서·지청명", "서울중앙지검 금융범죄 담당 검사입니다"],
    ["(c) 실제 대표번호", "1332로 걸어서 확인해 보세요"],
    ["(d) 역 · 보관함", "강남역 보관함에서 받아 가세요"],
    ["(e) 고립 상세", "근처 모텔에 혼자 들어가 계세요"],
  ];
  const lines: string[] = [];
  for (const [code, sample] of samples) {
    const hits = ac102Hits(sample);
    lines.push(`${code} 샘플 → ${JSON.stringify(hits)}`);
    assert.ok(hits.includes(code), `${code} 샘플이 잡히지 않는다 — 죽은 규칙: ${sample}`);
  }
  const canon = ac102Targets().flatMap(({ text }) => ac102Hits(text));
  lines.push(`정본 ${ac102Targets().length}문면 → ${JSON.stringify(canon)}`);
  t.diagnostic(lines.join(" | "));
  assert.deepEqual(canon, []);
  // 규칙마다 자기 샘플을 실제로 잡는다(죽은 패턴 0 — T86 생존 검사 관례).
  for (const rule of AC102_RULES) assert.ok(rule.pattern.test(rule.sample), `${rule.code}: 자기 샘플을 못 잡는다 ${rule.pattern}`);
});

// ── 고급 전용 3종(AC-097) ──────────────────────────────────────────────────────

const UX_D104_FORBIDDEN = /릴레이|연결해|확인\s*전화|가로채|대면|현금|수표|전달|직접\s*받으러|고립|혼자|셀프|감금|보안\s*앱|원격\s*앱|앱\s*설치/;

test("[T191 S5 고급 전용 · AC-097] 3종 — 고급 변형 1벌씩 · 결정 순간 · 출처 · 메타 플래그 · 카드 문면 규칙(D-104)", () => {
  const advancedOnly = Object.keys(PUBLIC_SCENARIOS).filter(isAdvancedOnlyScenario).sort();
  assert.deepEqual(advancedOnly, ["asset-protection-notice-call", "card-delivery-call", "prosecution-cooperation-call"]);
  for (const id of advancedOnly) {
    // §92.3 — 배정 은퇴 변형(옛 세션 해석용)은 세지 않는다. 은퇴 변형도 아래 필수 항목(결정 순간 · 출처)은 그대로 갖는다.
    for (const r of FLOW_VARIANTS.filter((v) => v.scenarioId === id && v.retired === true)) {
      assert.ok(r.decisionMoment && r.sources && r.sources.length > 0, `${r.variantId}: 은퇴 변형도 결정 순간 · 출처 유지`);
    }
    const variants = FLOW_VARIANTS.filter((v) => v.scenarioId === id && v.retired !== true);
    assert.equal(variants.length, 1, `${id}: 변형 수`);
    const [v] = variants;
    assert.equal(v.level, "advanced");
    assert.ok(v.decisionMoment && v.decisionMoment.length > 0, `${id}: 결정 순간 필수(AC-097 (e))`);
    assert.ok(v.sources && v.sources.some((s) => /^C\d+$/.test(s)) && v.sources.some((s) => /^S\d+$/.test(s)), `${id}: 사례 C · S 번호 필수(AC-097 (c))`);
    const meta = PUBLIC_SCENARIOS[id];
    for (const field of ["title", "fraudType", "difficulty"] as const) {
      assert.equal(UX_D104_FORBIDDEN.test(meta[field]), false, `${id}.${field}: 카드 문면에 흐름 · 수법 낱말(D-104 (4)) — "${meta[field]}"`);
    }
  }
  const burden = Object.keys(PUBLIC_SCENARIOS).filter((id) => PUBLIC_SCENARIOS[id].preSessionBurdenNotice === true);
  assert.deepEqual(burden, ["prosecution-cooperation-call"], "부담 고지 대상 = 셀프 감금 1종(C-9 · D-106)");
  // 기존 14종은 고급 전용이 아니다(AC-064 원문 — 세 난이도 모두).
  assert.equal(Object.keys(PUBLIC_SCENARIOS).filter((id) => !isAdvancedOnlyScenario(id)).length, 14);
});

test("[T191 S5 고급 전용 · 미러] 클라 src/content 미러가 publicMeta와 callerLabel까지 같고 advancedOnly · preSessionBurdenNotice도 같다", () => {
  const files: Record<string, string> = {
    "card-delivery-call": "cardDeliveryCall.ts",
    "asset-protection-notice-call": "assetProtectionNoticeCall.ts",
    "prosecution-cooperation-call": "prosecutionCooperationCall.ts",
  };
  for (const [id, file] of Object.entries(files)) {
    const mirror = fs.readFileSync(path.join(SRC_ROOT, "content/scenarios", file), "utf-8");
    const meta = PUBLIC_SCENARIOS[id];
    for (const value of [id, meta.title, meta.fraudType, meta.estimatedDuration, meta.difficulty, meta.callerLabel, ...meta.deepvoiceLines.map((l) => l.text)]) {
      assert.ok(mirror.includes(value), `${file}: "${value}" 불일치(G38 드리프트)`);
    }
    assert.ok(mirror.includes("advancedOnly: true"), `${file}: advancedOnly`);
    assert.equal(mirror.includes("preSessionBurdenNotice: true"), meta.preSessionBurdenNotice === true, `${file}: preSessionBurdenNotice`);
  }
});

// ── 프롬프트 합성 ─────────────────────────────────────────────────────────────

test("[T191 S5 프롬프트 합성] 가드레일 원문 불변 · 최후미 · '현행'(라벨 제외 0) 변형은 원본과 같다 · 저작 변형은 흐름 블록을 갖는다", () => {
  for (const v of FLOW_VARIANTS) {
    const base = SCENARIO_PROMPTS[v.scenarioId];
    const resolved = resolveVariantPrompt(base, v);
    assert.equal(resolved.guardrailPreamble, base.guardrailPreamble, `${v.variantId}: 가드레일 변형 금지`);
    assert.deepEqual(resolved.weakenedTactics, v.tactics);
    // T194-a(§84.4.2) — 0번 leg 페르소나가 있으면 그것이 원본을 대신한다(부재 = 원본 재사용 — 종전 단언 그대로).
    const persona = v.legs[0]?.personaPrompt ?? base.personaPrompt;
    if (v.stages.length === 0) {
      assert.equal(resolved.personaPrompt, persona, `${v.variantId}: 단계 없는 변형은 페르소나 무변경`);
    } else {
      assert.ok(resolved.personaPrompt.startsWith(persona), `${v.variantId}: (leg 또는 원본) 페르소나 보존`);
      assert.ok(resolved.personaPrompt.includes("[이번 통화의 흐름]"));
    }
    for (const level of DIFFICULTY_LEVELS as readonly DifficultyLevel[]) {
      const assembled = buildSystemPrompt(resolved, { difficultyLevel: level });
      assert.ok(assembled.trimEnd().endsWith(base.guardrailPreamble.trimEnd()) || assembled.lastIndexOf(base.guardrailPreamble) > assembled.lastIndexOf("[이번 통화의 흐름]"), `${v.variantId}/${level}: 가드레일이 흐름 블록보다 뒤가 아니다(AC-065)`);
    }
  }
  const spec = FLOW_VARIANT_SPECS.find((s) => s.variantId === "fv-aqx2");
  assert.ok(spec && spec.authoring === "current" && !spec.dropLabels, "tax 중급 = 라벨 제외 0인 '현행' 표본");
  const v = FLOW_VARIANTS.find((x) => x.variantId === "fv-aqx2") as FlowVariant;
  assert.deepEqual(v.tactics, SCENARIO_PROMPTS["tax-refund-scam"].weakenedTactics, "라벨 제외 0인 '현행' = 원본 수법 그대로");
});

test("[T191 S5 릴레이 S7 이전] 인원 ≥ 2 변형은 한 화자 규칙을 갖고(넘김 대사 금지) · 1인 변형은 갖지 않는다", () => {
  assert.equal(RELAY_RUNTIME_AVAILABLE, false, "S7 구현 전 전제 — S7이 이 값을 바꾸면 이 테스트를 갱신한다");
  for (const v of FLOW_VARIANTS.filter((x) => x.stages.length > 0)) {
    const persona = resolveVariantPrompt(SCENARIO_PROMPTS[v.scenarioId], v).personaPrompt;
    assert.equal(persona.includes("처음부터 끝까지 너 혼자 맡는다"), v.legs.length > 1, `${v.variantId}`);
  }
});

test("[T191 S5 해석 단일 지점] resolveSessionScenarioPrompt — 부재 · 미지 · 다른 시나리오 ID는 원본, 정상 ID는 변형", () => {
  const id = "institutional-impersonation";
  assert.equal(resolveSessionScenarioPrompt(id), SCENARIO_PROMPTS[id], "무소급 — 부재는 원본 객체 그대로");
  assert.equal(resolveSessionScenarioPrompt(id, "fv-zzzz"), SCENARIO_PROMPTS[id]);
  const other = listFlowVariants("loan-refinance-scam", "beginner")[0];
  assert.equal(resolveSessionScenarioPrompt(id, other.variantId), SCENARIO_PROMPTS[id], "다른 시나리오의 변형은 적용하지 않는다");
  const own = listFlowVariants(id, "beginner")[0];
  assert.deepEqual(resolveSessionScenarioPrompt(id, own.variantId)?.weakenedTactics, own.tactics);
  assert.equal(resolveSessionScenarioPrompt("no-such-scenario"), undefined);
});

test("[T191 S5 호출부] 시나리오 프롬프트 해석이 단일 지점을 거친다 — sendMessage · 오프닝 · Gemini Live 토큰 · 리포트", () => {
  const callers = ["roleplay/index.ts", "roleplay/openingLine.ts", "realtime/geminiProvider.ts", "report/generateReportCore.ts"];
  for (const file of callers) {
    const code = fs.readFileSync(path.join(FUNCTIONS_SRC, file), "utf-8").replace(/\/\/[^\n]*/g, "");
    assert.ok(code.includes("resolveSessionScenarioPrompt("), `${file}: 단일 해석 지점 미사용`);
    assert.equal(/SCENARIO_PROMPTS\[/.test(code), false, `${file}: 원본 맵 직접 조회가 남았다(변형이 조용히 빠지는 경로)`);
  }
  // createRealtimeCall이 세션의 변형 ID를 Gemini 경로로 넘긴다(ElevenLabs는 무시 — 현행).
  const realtime = fs.readFileSync(path.join(FUNCTIONS_SRC, "realtime/index.ts"), "utf-8");
  assert.ok(realtime.includes("flowVariantId: session.flowVariantId"));
  const eleven = fs.readFileSync(path.join(FUNCTIONS_SRC, "realtime/elevenLabsProvider.ts"), "utf-8");
  assert.equal(eleven.includes("flowVariant"), false, "ElevenLabs 경로는 변형 미적용(OQ-A131 기본값)");
});

// ── T194-a G581 — PRD AC-106 (i) "같은 (시나리오 × 난이도) 허용 변형의 통화 단계 유무 동일" (docs/Architecture.md §84.4.5) ──
//
// 왜 필요한가: UX-025 안내와 시작 고지의 "메시지와 전화"는 (시나리오 × 난이도) 값으로 갈린다(PRD AC-096 읽기 고지 4).
// 같은 칸의 허용 변형 중 하나라도 통화 단계 유무가 다르면 안내 유무가 **배정된 변형을 드러내** AC-096 (e) 위반이 된다.
// ⇒ ① 칸마다 값이 하나로 모이고 ② 그 값이 공개 메타 술어와 같으며 ③ 신설 시점 기대값을 고정한다 + 역방향 ⓓ.

type SessionKind = "자가" | "챌린지";
type PoolFn = (scenarioId: string, level: DifficultyLevel, challengeId?: string) => readonly FlowVariant[];

/** 이 (시나리오 × 난이도)에서 그 세션 종류가 존재하는가 — 챌린지는 에스컬레이션 메타 시나리오에서 거부된다(`challenge/index.ts` S-6). */
function sessionKindExists(scenarioId: string, level: DifficultyLevel, kind: SessionKind): boolean {
  if (listFlowVariants(scenarioId, level).length === 0) return false; // 고급 전용 시나리오의 초급 · 중급
  if (kind === "챌린지" && resolveScenarioEscalation(PUBLIC_SCENARIOS[scenarioId], "beginner") !== undefined) return false;
  // T194-c-1(§84.16.4 G590 "챌린지 거부 조합 제외") — 고급 전용 시나리오는 챌린지 생성이 거부된다(`challenge/index.ts` AC-097 (g)).
  // 예전에는 그 칸의 풀이 우연히 비지 않아 드러나지 않았다 — card-delivery-call 고급 변형이 Q2 설치 문자를 선언하자 챌린지 풀이 0이 됐다
  // (존재하지 않는 세션 종류라 정상).
  if (kind === "챌린지" && isAdvancedOnlyScenario(scenarioId)) return false;
  return true;
}

/** (scenarioId/level/세션 종류) → 그 배정 풀 변형들의 통화 단계 유무 값 집합. ⭐ §84.13.5 — 단위에 세션 종류가 들어간다. */
function callStageByCell(pool: PoolFn): Map<string, Set<boolean>> {
  const cells = new Map<string, Set<boolean>>();
  for (const id of Object.keys(PUBLIC_SCENARIOS)) {
    for (const level of DIFFICULTY_LEVELS) {
      for (const kind of ["자가", "챌린지"] as const) {
        if (!sessionKindExists(id, level, kind)) continue;
        const set = new Set<boolean>();
        for (const v of pool(id, level, kind === "챌린지" ? "c1" : undefined)) set.add(v.escalatesToVoice === true);
        cells.set(`${id}/${level}/${kind}`, set);
      }
    }
  }
  return cells;
}

/** ① 균일성 위반 칸 목록(빈 배열 = 통과). 풀 함수를 인자로 받아 역방향에서 필터를 끈 풀을 넣을 수 있다. */
function callStageUniformityViolations(pool: PoolFn): string[] {
  return [...callStageByCell(pool).entries()].filter(([, set]) => set.size > 1).map(([key]) => key).sort();
}

/** 필터를 끈 풀(역방향 전용) — 허용 변형 전체. */
const UNFILTERED_POOL: PoolFn = (scenarioId, level) => listFlowVariants(scenarioId, level);

/** ③ PRD AC-106 (i) 신설 시점 기대값(자가 세션) — 메신저 4종 명시(그 밖 시나리오는 전부 "없음"). */
const EXPECTED_CALL_STAGE: Readonly<Record<string, Readonly<Record<DifficultyLevel, boolean>>>> = {
  "messenger-parcel-smishing-sms": { beginner: false, intermediate: false, advanced: true },
  "messenger-subsidy-smishing-sms": { beginner: true, intermediate: true, advanced: true },
  // 그 밖 메신저 시나리오 = 공개 메타 그대로(AC-106 (i) 신설 시점 값 — §84.4.5 ③).
  "messenger-child-impersonation-kakao": { beginner: true, intermediate: true, advanced: true },
  "messenger-friend-loan-kakao": { beginner: false, intermediate: false, advanced: false },
};
// ⭐ §84.13.5 처방 4 — 챌린지 세션 기대값: 전부 "없음"(에스컬레이션 메타 시나리오는 챌린지 자체가 거부된다).
// 명시 1행: parcel 고급 챌린지 = 통화 단계 없음(AC-106 (g) 기본값 — 수신자는 현행 고급 변형).
const EXPECTED_CHALLENGE_CALL_STAGE: Readonly<Record<string, boolean>> = {
  "messenger-parcel-smishing-sms/advanced": false,
};

test("[T194-a G581 · AC-106 (i) · §84.13.5] ① (시나리오 × 난이도 × 세션 종류) 배정 풀마다 통화 단계 유무가 하나 ② 그 값 = 세션 술어 ③ 기대값 · 역방향 ⓓ", (t) => {
  // ①
  const violations = callStageUniformityViolations(assignablePool);
  // 역방향 ⓓ — 필터를 끈 풀(허용 변형 전체): parcel 고급에는 통화 단계 있는 변형과 없는 변형이 공존한다.
  const taintedViolations = callStageUniformityViolations(UNFILTERED_POOL);
  t.diagnostic(
    `[AC-106 (i) ⓓ] 배정 풀 위반 ${JSON.stringify(violations)} / 필터를 끈 풀(parcel 고급에 통화 없는 변형 공존) 위반 ${JSON.stringify(taintedViolations)}`,
  );
  assert.deepEqual(violations, [], "같은 세션 종류의 배정 풀이 통화 단계 유무에서 갈린다 — 안내 유무가 배정 변형을 드러낸다");
  assert.deepEqual(
    taintedViolations,
    ["messenger-parcel-smishing-sms/advanced/자가", "messenger-parcel-smishing-sms/advanced/챌린지"],
    "역방향 ⓓ — 오염(필터 해제) 샘플이 정확히 그 칸들에서 실패해야 한다",
  );

  // ② · ③
  const table: string[] = [];
  for (const [key, set] of callStageByCell(assignablePool)) {
    assert.equal(set.size, 1, `${key}: 배정 풀이 비었다 — 배정이 failed-precondition으로 막힌다`);
    const [id, level, kind] = key.split("/") as [string, DifficultyLevel, SessionKind];
    const value = [...set][0];
    const fromSession =
      resolveSessionEscalation({ scenarioId: id, difficultyLevel: level, challengeId: kind === "챌린지" ? "c1" : undefined }, PUBLIC_SCENARIOS) !==
      undefined;
    assert.equal(value, fromSession, `${key}: 풀의 통화 단계(${value}) ≠ 세션 술어(${fromSession})`);
    const expected =
      kind === "자가" ? (EXPECTED_CALL_STAGE[id]?.[level] ?? false) : (EXPECTED_CHALLENGE_CALL_STAGE[`${id}/${level}`] ?? false);
    assert.equal(value, expected, `${key}: AC-106 (i) 기대값(${expected})과 다르다`);
    // 자가 세션 값은 (시나리오 × 난이도) 공개 메타 술어와도 같다.
    if (kind === "자가") assert.equal(value, resolveScenarioEscalation(PUBLIC_SCENARIOS[id], level) !== undefined, key);
    if (value) table.push(key);
  }
  t.diagnostic(`[AC-106 (i)] 통화 단계 있음 칸 ${table.length}개: ${table.join(" · ")}`);
  assert.deepEqual(
    table.filter((key) => key.startsWith("messenger-parcel-smishing-sms/")),
    ["messenger-parcel-smishing-sms/advanced/자가"],
    "parcel은 고급 자가 세션만 통화 단계가 있다(AC-106 (f)(g))",
  );
  assert.deepEqual(assignablePool("messenger-parcel-smishing-sms", "advanced", "c1").map((v) => v.variantId), ["fv-k7qm"]);
  assert.deepEqual(assignablePool("messenger-parcel-smishing-sms", "advanced").map((v) => v.variantId), ["fv-g454"]);
});

test("[T194-a G581] escalatesToVoice는 `true` 또는 부재뿐이다(부재가 거짓 — `false` 표기 0)", () => {
  for (const v of FLOW_VARIANTS) {
    assert.ok(v.escalatesToVoice === undefined || v.escalatesToVoice === true, `${v.variantId}: ${String(v.escalatesToVoice)}`);
    assert.equal(Object.prototype.hasOwnProperty.call(v, "escalatesToVoice") && v.escalatesToVoice !== true, false, `${v.variantId}: false/undefined를 명시하지 말 것`);
  }
});

test("[T194-a §84.4.2] parcel 고급 변형 — authored · 3단계 이상 · 메신저+통화 채널 · 출처 N1·N2·C08 · 원본 링크 수법 제외 · leg 페르소나", () => {
  const v = FLOW_VARIANTS.find((x) => x.variantId === "fv-g454") as FlowVariant;
  assert.equal(v.scenarioId, "messenger-parcel-smishing-sms");
  assert.equal(v.level, "advanced");
  assert.equal(v.authoring, "authored");
  assert.ok(v.stages.length >= 3 && v.stages.length <= 4, `단계 ${v.stages.length}개(3~4)`);
  assert.deepEqual(v.channels, ["messenger", "voice"]);
  assert.deepEqual(v.sources, ["N1", "N2", "C08"], "AC-106 (e) 출처");
  assert.ok(v.demandStages >= 2, "AC-096 (b) 고급 요구 2단 이상");
  const labels = v.tactics.map(extractTacticLabel);
  assert.equal(labels.includes("링크 클릭 유도"), false, "원본 parcel-redelivery 링크 수법은 고급에서 빠진다(한 세션 랜딩 1종)");
  assert.ok(labels.includes("앱 설치·권한 허용 유도") && labels.includes("채널 전환 유도"), "지원금 3단계와 같은 라벨");
  const composed = resolveVariantPrompt(SCENARIO_PROMPTS[v.scenarioId], v);
  const markers = [...[composed.personaPrompt, ...composed.weakenedTactics].join("\n").matchAll(/\[\[LINK:([a-zA-Z0-9_-]+)\]\]/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(markers)], ["parcel-install"], "고급 세션이 내는 링크 마커는 parcel-install 하나다");
});

/**
 * ⭐ 리뷰 M2 — **변경 전(base = main 49defd7 lib — main 병합 때 같은 옵션으로 다시 잼) 실측값 고정.** `escalatesToVoice`를 1필드만 더한 child-kakao 3벌 · subsidy 3벌의
 * 조립 산출물이 T194-a 전후로 한 바이트도 바뀌지 않았음을 보인다(예전의 "플래그 제거본과 같다"는 같은 코드로 두 번 조립한 자기확증이라
 * 화자 성별 누수(리뷰 C1)를 못 잡았다). 측정 옵션 = sendMessage 텍스트 경로와 같은 옵션(난이도 · 문자 술어 · L3 · 신원 확인 · 화자 성별 =
 * base는 표 값 `speakerGenderFor` / 현재는 세션 해석 `resolveSessionSpeakerGender`). 측정 스크립트: base lib에 같은 옵션으로 조립.
 */
const BASE_FLAGGED_ASSEMBLY: readonly { scenarioId: string; level: DifficultyLevel; variantId: string; sha256: string; length: number }[] = [
  { scenarioId: "messenger-child-impersonation-kakao", level: "beginner", variantId: "fv-34v5", sha256: "5d2ab0397bf0b43db0ba6dfdea2bea47ce420f2f038ef6f78881fce612fa2ebf", length: 6625 },
  { scenarioId: "messenger-child-impersonation-kakao", level: "intermediate", variantId: "fv-tpr3", sha256: "43addc55a5e13b7074231e776ae80ea12bc07fa2e846f2e381db68b76ea33492", length: 5860 },
  { scenarioId: "messenger-child-impersonation-kakao", level: "advanced", variantId: "fv-tdgg", sha256: "81f2ea3e212c1384f3bf077d43fb00c2bc547ff6a6c23c8f8c206d1d92c97436", length: 7323 },
  { scenarioId: "messenger-subsidy-smishing-sms", level: "beginner", variantId: "fv-rizf", sha256: "a2e606c25ff5bfd88c95a1424c002a5e010cd149a30245e33e5528f35965e434", length: 7265 },
  { scenarioId: "messenger-subsidy-smishing-sms", level: "intermediate", variantId: "fv-afbr", sha256: "67ab2d736788293f0978cc034b53ac74c85bd1d3397a607d70e5f0394f60fdad", length: 6526 },
  { scenarioId: "messenger-subsidy-smishing-sms", level: "advanced", variantId: "fv-hu8w", sha256: "b29e4c651cda6960e4f9d5a28ab3f61165c6a97da68f78d6d34398e1d8e4de48", length: 8443 },
];

test("[T194-a §84.13.3 ② · 리뷰 M2] 플래그만 더한 child-kakao · subsidy 6벌 — 조립 바이트 = 변경 전 실측값 · child-kakao [화자] 블록 0 · Gemini 음성 풀 불변", (t) => {
  const lines: string[] = [];
  for (const row of BASE_FLAGGED_ASSEMBLY) {
    const v = FLOW_VARIANTS.find((x) => x.variantId === row.variantId);
    assert.ok(v && v.escalatesToVoice === true && v.scenarioId === row.scenarioId && v.level === row.level, row.variantId);
    const session = { scenarioId: row.scenarioId, difficultyLevel: row.level, flowVariantId: row.variantId };
    const speakerGender = resolveSessionSpeakerGender(session);
    const currentPrompt = resolveSessionScenarioPrompt(row.scenarioId, row.variantId);
    assert.ok(currentPrompt);
    // PR-A3(감사 B 1일차 #7) — child-kakao 페르소나에 성별 얼버무림 금지 줄 1개를 **의도적으로** 더했다. 그 줄 **하나만** 뺀
    // 조립이 변경 전 실측값과 같아야 한다(= 그 밖의 바이트 변경 0). 줄은 child-kakao 3벌에만 정확히 1번 있다.
    const ruleLine = `${CHILD_GENDER_UNSPECIFIED_RULE}\n`;
    const isChild = row.scenarioId === "messenger-child-impersonation-kakao";
    assert.equal(currentPrompt.personaPrompt.split(ruleLine).length - 1, isChild ? 1 : 0, `${row.variantId}: 얼버무림 금지 줄 개수`);
    // 2026-10-21 — 통화 단계 규칙 블록(`CHILD_CALL_PHASE_RULE` · 앞 빈 줄 포함)도 의도된 추가다. child-kakao 3벌에만 정확히 1번 있고, 그것만 뺀다.
    const callPhaseBlock = `\n\n${CHILD_CALL_PHASE_RULE}`;
    assert.equal(currentPrompt.personaPrompt.split(callPhaseBlock).length - 1, isChild ? 1 : 0, `${row.variantId}: 통화 단계 규칙 블록 개수`);
    const prompt = isChild
      ? { ...currentPrompt, personaPrompt: currentPrompt.personaPrompt.replace(ruleLine, "").replace(callPhaseBlock, "") }
      : currentPrompt;
    const assembled = buildSystemPrompt(prompt, {
      difficultyLevel: row.level,
      inCallSmsEnabled: sessionDeclaresInCallSms(row.scenarioId, row.variantId),
      l3Procedural: isL3Procedural(row.scenarioId),
      identityCheckAllowed: asksIdentityCheck(row.scenarioId),
      speakerGender,
    });
    // §85(리뷰 M1) — 실존 회사명 금지 1문장은 의도된 변경이다. 정확히 1회 있고, 그것을 걷어 낸 바이트가 변경 전 실측값과 같아야 한다.
    const companySentence = ` ${REAL_COMPANY_PROMPT_SENTENCE}`;
    assert.equal(assembled.split(companySentence).length - 1, 1, `${row.variantId}: §85 금지 1문장이 정확히 1회 있어야 한다`);
    // R3-C ②-a(2026-10-20) — 무조건부 NO_STALL_RULE 셋째 문장 교체도 의도된 변경이다. 그 교체분만 되돌린다(r3NoStallDelta.ts).
    const strippedAssembled = revertR3C2(revertFullAudit(assembled).replace(companySentence, ""));
    const hash = crypto.createHash("sha256").update(strippedAssembled).digest("hex");
    lines.push(`${row.variantId} ${hash.slice(0, 12)}(${strippedAssembled.length}자) = 기준 ${row.sha256.slice(0, 12)}(${row.length}자)`);
    assert.equal(strippedAssembled.length, row.length, `${row.variantId}: 길이가 변경 전과 다르다`);
    assert.equal(hash, row.sha256, `${row.variantId}: 조립 바이트가 변경 전과 다르다`);
    // 화자 성별 = 변경 전 표 값(child-kakao = notApplicable → undefined → [화자] 블록 0).
    assert.equal(speakerGender, speakerGenderFor(row.scenarioId), `${row.variantId}: 화자 성별이 표 값과 다르다`);
    if (row.scenarioId === "messenger-child-impersonation-kakao") {
      assert.equal(assembled.includes("[화자"), false, `${row.variantId}: [화자] 블록이 생겼다(#162 · §84.4.6)`);
    }
    // Gemini 음성 풀 — 세션 성별을 넘긴 선택 = 변경 전(표만 보는) 선택.
    for (let i = 0; i < 30; i += 1) {
      const sid = `${row.variantId}-${i}`;
      assert.equal(pickGeminiVoiceName(row.scenarioId, sid, speakerGender), pickGeminiVoiceName(row.scenarioId, sid), `${row.variantId}: 음성 풀이 바뀌었다`);
    }
  }
  t.diagnostic(`[② 변경 전 대조] ${lines.join(" | ")}`);
});
