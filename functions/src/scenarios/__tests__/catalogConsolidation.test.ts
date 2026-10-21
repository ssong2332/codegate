// §92(docs/Architecture.md · DECISIONS #206) — 시나리오 목록 정리: 카드 배송 흡수 · 고급 전용 2종 고유 장치 · 환급금 소개 주체.
// 판정표(Architecture §92.1)의 각 행이 데이터 · 조립 산출물에서 실제로 성립하는지 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { HttpsError } from "firebase-functions/v2/https";
import { PUBLIC_SCENARIOS, isMergedScenario } from "../publicMeta";
import { SCENARIO_PROMPTS } from "../index";
import { CARD_DELIVERY_PERSONA } from "../cardDeliveryCall.prompt";
import { findFlowVariant, listFlowVariants, resolveSessionScenarioPrompt } from "../flowVariants";
import { findInCallSmsItem } from "../inCallSms";
import { findMockScreenItem } from "../mockScreens";
import { sessionReachableLandingIds } from "../reachability";
import { extractTacticLabel } from "../tacticFlavor";
import { assignablePool } from "../variantPool";
import { resolveTacticCategory } from "../../report/tacticCategory";
import { SCENARIO_MERGED_REASON, assertScenarioNotMerged } from "../../session/mergedScenario";
import { INSTITUTION_IDENTITY_DEMAND, NAME_FIRST_DEMAND } from "../../roleplay/personaCardIdentity";

const FUNCTIONS_SRC = path.resolve(__dirname, "../../../src");

test("[§92 A] 합쳐진 시나리오는 card-delivery-call 1종 · 흡수처는 실재하는 일반 시나리오 · 항목 · 프롬프트 · 원본 변형은 남는다(옛 세션 해석)", () => {
  const merged = Object.keys(PUBLIC_SCENARIOS).filter(isMergedScenario);
  assert.deepEqual(merged, ["card-delivery-call"]);
  const target = PUBLIC_SCENARIOS["card-delivery-call"]!.mergedInto!;
  assert.equal(target, "card-company-impersonation");
  assert.ok(PUBLIC_SCENARIOS[target] && PUBLIC_SCENARIOS[target]!.mergedInto === undefined, "흡수처는 합쳐지지 않은 시나리오");
  assert.ok(SCENARIO_PROMPTS["card-delivery-call"], "옛 세션 해석용 프롬프트가 남는다");
  const legacy = resolveSessionScenarioPrompt("card-delivery-call", "fv-tvnj");
  assert.ok(legacy && legacy.personaPrompt.includes("[이번 통화의 흐름]"), "옛 세션(fv-tvnj)이 변형 그대로 해석된다");
});

test("[§92 A] createSession 거부 — 합쳐진 시나리오만 failed-precondition + scenario-merged · 다른 시나리오는 통과", () => {
  for (const id of Object.keys(PUBLIC_SCENARIOS)) {
    if (id === "card-delivery-call") {
      assert.throws(
        () => assertScenarioNotMerged(id),
        (err: unknown) =>
          err instanceof HttpsError &&
          err.code === "failed-precondition" &&
          (err.details as { reason?: string }).reason === SCENARIO_MERGED_REASON,
      );
    } else {
      assert.doesNotThrow(() => assertScenarioNotMerged(id), id);
    }
  }
});

test("[§92 A] createSession — 병합 거부가 모든 await · Firestore · LLM · 음성 호출보다 앞(거부 = 그 호출 0회)", () => {
  const code = fs.readFileSync(path.join(FUNCTIONS_SRC, "session/index.ts"), "utf8");
  const from = code.indexOf("export const createSession");
  const body = code.slice(from, code.indexOf("export const endSession", from));
  const gate = body.indexOf("assertScenarioNotMerged(scenarioId)");
  assert.ok(gate > 0, "createSession에 병합 거부가 없다");
  for (const marker of ["await ", "getFirestore(", "generateOpeningLine(", "getVoiceProvider(", "assignFlowVariantForSession(", ".add("]) {
    const at = body.indexOf(marker);
    assert.ok(at > gate, `createSession: "${marker}"(${at})가 병합 거부(${gate})보다 앞에 있다`);
  }
});

test("[§92 A] 흡수 변형 fv-w3dq = 카드사 고급 · 원본 fv-tvnj와 단계 · 결정 순간 · 출처 · 수법 라벨 같음 · 0번 화자 = 카드 배송 상담원", () => {
  const absorbed = findFlowVariant("fv-w3dq")!;
  const legacy = findFlowVariant("fv-tvnj")!;
  assert.equal(absorbed.scenarioId, "card-company-impersonation");
  assert.equal(absorbed.level, "advanced");
  assert.deepEqual(absorbed.stages, legacy.stages);
  assert.equal(absorbed.decisionMoment, legacy.decisionMoment);
  assert.deepEqual(absorbed.sources, legacy.sources);
  assert.deepEqual(absorbed.exitBlock, legacy.exitBlock);
  assert.deepEqual(absorbed.tactics.map(extractTacticLabel), legacy.tactics.map(extractTacticLabel));
  assert.equal(absorbed.legs[0]!.personaPrompt, CARD_DELIVERY_PERSONA);
  const prompt = resolveSessionScenarioPrompt("card-company-impersonation", "fv-w3dq")!;
  assert.ok(prompt.personaPrompt.startsWith(CARD_DELIVERY_PERSONA), "조립 페르소나가 카드 배송 상담원으로 시작한다");
  assert.ok(prompt.personaPrompt.includes("카드 배송 일정을 안내하며 말을 건다."));
});

test("[§92 A] 흡수 변형의 문자 = 카드사 카탈로그 설치 문자 1건 · 도달 랜딩 = 카드사 설치 화면 1건 · 자가 고급 풀에만(챌린지 0)", () => {
  const absorbed = findFlowVariant("fv-w3dq")!;
  assert.deepEqual(absorbed.sms.map((s) => s.smsId), ["card-guard-app-link"]);
  assert.ok(findInCallSmsItem("card-company-impersonation", "card-guard-app-link"));
  assert.deepEqual(sessionReachableLandingIds("card-company-impersonation", "fv-w3dq"), ["card-guard-app-install"]);
  assert.deepEqual(assignablePool("card-company-impersonation", "advanced").map((v) => v.variantId), ["fv-x7ue", "fv-w3dq"]);
  assert.deepEqual(assignablePool("card-company-impersonation", "advanced", "c1").map((v) => v.variantId), ["fv-akj5"]);
  assert.equal(listFlowVariants("card-company-impersonation", "beginner").some((v) => v.variantId === "fv-w3dq"), false);
});

test("[§92 A ③] 흡수 변형의 신원 요구 예시는 '내 정보' 확인형 치환표가 아는 문구(성함부터 불러주세요)다 — 표가 모르는 '…생년월일부터 불러주세요' 0", () => {
  const prompt = resolveSessionScenarioPrompt("card-company-impersonation", "fv-w3dq")!;
  const tactics = prompt.weakenedTactics.join("\n");
  assert.ok(tactics.includes(NAME_FIRST_DEMAND), "치환표 요구 머리 존재");
  assert.equal(tactics.includes("성함이랑 생년월일부터 불러주세요"), false);
  assert.equal(tactics.includes(INSTITUTION_IDENTITY_DEMAND), false);
});

test("[§92 B] 고급 전용 2종 — 고유 문자 1건(link · 필수) → credential-form 화면 1건 · 기관 사칭 고급 장치(인증번호 · 안전계좌)와 겹침 0", () => {
  const cases = [
    { scenarioId: "asset-protection-notice-call", variantId: "fv-k9ra", smsId: "asset-custody-link", landingId: "asset-custody-apply" },
    { scenarioId: "prosecution-cooperation-call", variantId: "fv-p4hz", smsId: "prosecution-case-link", landingId: "case-record-view" },
  ];
  for (const c of cases) {
    const v = findFlowVariant(c.variantId)!;
    assert.deepEqual(v.sms, [{ purpose: "link", smsId: c.smsId, required: true, notBeforeUserTurns: v.sms[0]!.notBeforeUserTurns }], c.scenarioId);
    assert.ok(v.channels.includes("sms"), `${c.scenarioId}: 채널 메타에 sms`);
    const sms = findInCallSmsItem(c.scenarioId, c.smsId)!;
    assert.equal(sms.kind, "link");
    assert.equal(sms.fakeLandingId, c.landingId);
    const screen = findMockScreenItem(c.scenarioId, c.landingId)!;
    assert.equal(screen.kind, "credential-form");
    assert.equal(screen.entrySurface, "in-call-sms");
    assert.deepEqual(sessionReachableLandingIds(c.scenarioId, c.variantId), [c.landingId]);
    assert.equal(v.sms.some((s) => s.smsId.startsWith("institution-")), false);
  }
});

test("[§92 B] 자산 보호 화면 · 문자 · 단계 — 만날 장소 · 시간 · 주소를 묻는 칸 · 문구 0(AC-102 (c))", () => {
  const screen = findMockScreenItem("asset-protection-notice-call", "asset-custody-apply")!;
  const sms = findInCallSmsItem("asset-protection-notice-call", "asset-custody-link")!;
  const shown = [screen.headline, ...screen.bodyLines, ...(screen.fields ?? []), sms.body].join("\n");
  for (const banned of ["주소", "장소", "만날", "시간", "방문"]) assert.equal(shown.includes(banned), false, banned);
  assert.ok(sms.announceInstruction.includes("만날 장소·시간은 정하지도 묻지도 마라"), "도착 지시가 장소 · 시간 금지를 다시 말한다");
});

test("[§92 B] 검찰 새 변형 — 사건 조회 문자 외 다른 화면 금지는 유지 · 수사 서류 언급 라벨 무변경 · 자산 보호 새 변형의 절차 문면", () => {
  const p = resolveSessionScenarioPrompt("prosecution-cooperation-call", "fv-p4hz")!;
  assert.ok(p.personaPrompt.includes("사건 조회 안내 문자 말고는 서류·사진·메신저 같은 다른 화면을 보내겠다고 하지 않는다"));
  assert.equal(p.personaPrompt.includes("- 서류·사진·메신저 같은 다른 화면을 보내겠다고 하지 않는다."), false);
  assert.ok(p.weakenedTactics.some((t) => extractTacticLabel(t) === "수사 서류 언급" && t.includes("사건 조회")));
  assert.equal(p.weakenedTactics.filter((t) => extractTacticLabel(t) === "수사 서류 언급").length, 1, "옛 문면과 새 문면이 함께 실리지 않는다");
  const a = resolveSessionScenarioPrompt("asset-protection-notice-call", "fv-k9ra")!;
  const proc = a.weakenedTactics.filter((t) => extractTacticLabel(t) === "절차·서류 정당화");
  assert.equal(proc.length, 1);
  assert.ok(proc[0]!.includes("보관 신청서"));
});

test("[§92 B · 무소급] 옛 변형 fv-bmiq · fv-nss6은 내용 무변경(문자 0 · 원본 수법 · 원본 페르소나) · 배정 은퇴 · 새 세션 풀은 새 변형뿐", () => {
  for (const [scenarioId, oldId, newId, oldTactic] of [
    ["asset-protection-notice-call", "fv-bmiq", "fv-k9ra", "보관 조치 접수번호를 남겨 드리고"],
    ["prosecution-cooperation-call", "fv-nss6", "fv-p4hz", "처럼 말로만 알리고, 서류나 사진을 보내겠다고 하지 않는다"],
  ] as const) {
    const old = findFlowVariant(oldId)!;
    assert.equal(old.retired, true);
    assert.deepEqual(old.sms, []);
    assert.deepEqual(old.channels, ["voice"]);
    const prompt = resolveSessionScenarioPrompt(scenarioId, oldId)!;
    assert.ok(prompt.personaPrompt.startsWith(SCENARIO_PROMPTS[scenarioId]!.personaPrompt), `${oldId}: 원본 페르소나`);
    assert.ok(prompt.weakenedTactics.some((t) => t.includes(oldTactic)), `${oldId}: 원본 수법 문면`);
    assert.equal(prompt.personaPrompt.includes("문자로 보낸"), false, `${oldId}: 문자 언급 0`);
    assert.deepEqual(sessionReachableLandingIds(scenarioId, oldId), [], `${oldId}: 도달 랜딩 0`);
    assert.deepEqual(listFlowVariants(scenarioId, "advanced").map((v) => v.variantId), [newId]);
    assert.deepEqual(assignablePool(scenarioId, "advanced").map((v) => v.variantId), [newId]);
  }
  assert.ok(SCENARIO_PROMPTS["prosecution-cooperation-call"]!.personaPrompt.includes("- 서류·사진·메신저 같은 다른 화면을 보내겠다고 하지 않는다. 필요한 것은 말로만 전한다."), "원본 프롬프트 무변경");
});

test("[§92 B] 새 화면 2종의 속은 순간 수법은 의도한 리포트 분류로 간다(검찰 = 개인정보 · 자산 보호 = 돈 요구)", () => {
  assert.equal(resolveTacticCategory(findMockScreenItem("prosecution-cooperation-call", "case-record-view")!.momentTactic), "personal_info_demand");
  assert.equal(resolveTacticCategory(findMockScreenItem("asset-protection-notice-call", "asset-custody-apply")!.momentTactic), "payment_demand");
});

test("[§92 D] 국세청 환급금 — [캐릭터]가 소속을 '국세청 환급 담당'으로 못 박는다", () => {
  const persona = SCENARIO_PROMPTS["tax-refund-scam"]!.personaPrompt;
  assert.ok(persona.includes("자기소개와 소속은 '국세청 환급 담당'으로만 밝히고"));
  assert.equal(persona.includes("국민안전지원센터"), false, "예시 기관명을 페르소나에 다시 적어 점화하지 않는다");
});

test("[§92 C] 우선순위 낮음 = 환급금 · 택배 통관 2종(서버 미러)", () => {
  const low = Object.entries(PUBLIC_SCENARIOS).filter(([, m]) => m.lowPriority === true).map(([id]) => id).sort();
  assert.deepEqual(low, ["courier-customs-scam", "tax-refund-scam"]);
});
