// 2026-11-07 Edge 재시험(메인 전달 3건) — 리포트 정확도 3차 고정.
// (1) 하지 않은 수법이 목록에 오름(자녀 사칭 초급 "다른 명의 계좌 요구" · 대환대출 판 34 "선상환 송금 요구") — 설정 문구 구별(`buildTacticMatchers`)
// (2) 같은 답을 위험 신호 + 속은 순간으로 두 번 표기(기관 사칭 고급 "거래 은행은 새솔은행이고요, 잔액은 …") — RS5
// (3) 문자 링크 이체 화면에서 적게 보냈는데 "적게 보냄" 문장 0 — 승격 순간 `amountComparison`
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, buildTacticMatchers, type AnalysisMessage } from "../analyzeConversation";
import { buildTacticPremiseText } from "../tacticPremise";
import { buildSmsTimeline, promoteSmsLandingSubmits, type SmsTimelineSource } from "../smsTimeline";
import { resolveTacticCategory } from "../tacticCategory";
import { FLOW_VARIANTS, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { extractTacticLabel } from "../../scenarios/tacticFlavor";

const t0 = 1_000_000;
const msg = (turnIndex: number, role: "scammer" | "user", textMasked: string, sec: number): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: t0 + sec * 1000,
});

function tacticsOfVariant(variantId: string): string[] {
  const variant = FLOW_VARIANTS.find((v) => v.variantId === variantId);
  assert.ok(variant, `변형 ${variantId}이 카탈로그에 없다`);
  return resolveSessionScenarioPrompt(variant.scenarioId, variant.variantId)?.weakenedTactics ?? [];
}

function usedLabels(scenarioId: string, tactics: string[], scammerLine: string, premise?: string): string[] {
  const messages = [msg(0, "scammer", scammerLine, 5), msg(1, "user", "응?", 9)];
  return analyzeConversation(messages, t0, tactics, [], undefined, premise).tacticsUsed;
}

test("(1) 자녀 사칭 초급 — '폰이 고장 나서'(기본 사연)만 말하면 '다른 명의 계좌 요구'가 오르지 않는다 · 수정 전 모양은 올랐다", () => {
  const scenarioId = "messenger-child-impersonation-kakao";
  const tactics = tacticsOfVariant("fv-34v5");
  const line = "엄마 나야. 폰이 고장 나서 친구 폰으로 톡해. 200만 원만 먼저 보내줄 수 있어?";
  assert.ok(usedLabels(scenarioId, tactics, line).includes("다른 명의 계좌 요구"), "수정 전(설정 문구 부재) — 원인 재현");
  assert.ok(!usedLabels(scenarioId, tactics, line, buildTacticPremiseText(scenarioId)).includes("다른 명의 계좌 요구"));
  // 실제로 쓴 경우는 그대로 잡는다.
  const used = "폰이 고장 나서 내 계좌 인증이 안 돼, 친구 계좌로 받을게.";
  assert.ok(usedLabels(scenarioId, tactics, used, buildTacticPremiseText(scenarioId)).includes("다른 명의 계좌 요구"));
});

test("(1) 대환대출(판 34) — '저금리 전환'(문자 제목 · 설정)만 말하면 '선상환 송금 요구'가 오르지 않는다 · 상환 계좌로 보내라면 오른다", () => {
  const scenarioId = "loan-refinance-scam";
  const tactics = resolveSessionScenarioPrompt(scenarioId)?.weakenedTactics ?? [];
  const line = "고객님, 저금리 전환 대상자로 조회되셔서 연락드렸습니다.";
  assert.ok(usedLabels(scenarioId, tactics, line).includes("선상환 송금 요구"), "수정 전(설정 문구 부재) — 원인 재현");
  assert.ok(!usedLabels(scenarioId, tactics, line, buildTacticPremiseText(scenarioId)).includes("선상환 송금 요구"));
  const used = "기존 대출 185만 원을 상환 전용 계좌로 지금 보내주세요.";
  assert.ok(usedLabels(scenarioId, tactics, used, buildTacticPremiseText(scenarioId)).includes("선상환 송금 요구"));
});

test("(1) 범위 — 전 변형에서 바뀌는 키는 송금 · 계좌 요구 범주 수법뿐 · 설정 문구 부재면 종전 키와 같다", () => {
  let changed = 0;
  for (const variant of FLOW_VARIANTS) {
    const prompt = resolveSessionScenarioPrompt(variant.scenarioId, variant.variantId);
    const tactics = variant.multiCall ? [...variant.tactics] : (prompt?.weakenedTactics ?? []);
    const before = buildTacticMatchers(tactics);
    const after = buildTacticMatchers(tactics, buildTacticPremiseText(variant.scenarioId));
    assert.deepEqual(buildTacticMatchers(tactics, undefined), before);
    before.forEach((matcher, i) => {
      assert.equal(after[i]!.phraseKeys.length, matcher.phraseKeys.length, `${variant.variantId} 키 수가 바뀌었다`);
      matcher.phraseKeys.forEach((key, j) => {
        const next = after[i]!.phraseKeys[j]!;
        if (next === key) return;
        changed += 1;
        assert.ok(next.startsWith(key), `${variant.variantId} — 키는 늘기만 한다(${key} → ${next})`);
        assert.equal(resolveTacticCategory(extractTacticLabel(matcher.tactic)), "payment_demand", `${variant.variantId} ${matcher.tactic}`);
      });
    });
  }
  assert.ok(changed > 0, "바뀐 키가 0이면 이 테스트가 아무것도 보지 않는다");
});

test("(2) RS5 — 같은 대사에 대한 답 묶음에서 속은 순간이 잡히면 은행명 위험 신호를 달지 않는다 · 속은 순간이 없으면 종전대로 단다", () => {
  const ask = "확인을 위해 거래하시는 은행과 잔액을 말씀해 주시겠어요?";
  const split = analyzeConversation(
    [msg(0, "scammer", ask, 50), msg(1, "user", "거래 은행은 새솔은행이고요,", 68), msg(2, "user", "잔액은 천이백만 원쯤 있어요.", 81)],
    t0,
    ["거래 은행·자산 정보 수집 — '거래하시는 은행과 잔액 말씀해 주세요'"],
  );
  assert.equal(split.deceivedMoments.length, 1);
  assert.equal(split.deceivedMoments[0]!.turnIndex, 2);
  assert.deepEqual(split.riskSignals, [], "같은 답을 두 번 표기하지 않는다");
  // 대조 — 은행명만 말하고 잔액은 말하지 않은 답(속은 순간 없음)은 종전 RS3 신호가 그대로다.
  const bankOnly = analyzeConversation(
    [msg(0, "scammer", ask, 50), msg(1, "user", "새솔은행 쓰고 있어요.", 68), msg(2, "scammer", "네, 확인 감사합니다.", 75)],
    t0,
    ["거래 은행·자산 정보 수집 — '거래하시는 은행과 잔액 말씀해 주세요'"],
  );
  assert.equal(bankOnly.deceivedMoments.length, 0);
  assert.deepEqual(bankOnly.riskSignals.map((s) => s.kind), ["bank_disclosed"]);
});

const CATALOG = [{ landingId: "fake-safe-account", momentTactic: "안전계좌 이체 요구", correctAction: "기관은 계좌 이체를 요구하지 않습니다." }];
const smsDoc = (extra: Partial<SmsTimelineSource>): SmsTimelineSource => ({
  smsId: "inst-safe-account",
  kind: "account",
  senderLabel: "자산보호절차",
  body: "[자산보호절차] 임시 안전계좌 안내",
  anchorScammerTurn: 1,
  arrivedAtMs: t0 + 30_000,
  fakeLandingId: "fake-safe-account",
  ...extra,
});
const smsMessages = [
  { role: "scammer" as const, turnIndex: 0, createdAtMs: t0 + 20_000 },
  { role: "user" as const, turnIndex: 1, createdAtMs: t0 + 25_000 },
];

test("(3) 문자 링크 이체 화면 — 마지막 제출이 요구액보다 적으면 승격 순간에 `amountComparison: less` · 제출 없으면 · 비교 없으면 필드 0", () => {
  const less = promoteSmsLandingSubmits(
    [smsDoc({ landingSubmittedAtMs: t0 + 90_000, landingAmountComparison: "less" })],
    [],
    smsMessages,
    t0,
    CATALOG,
  );
  assert.equal(less.deceivedMoments.length, 1);
  assert.equal(less.deceivedMoments[0]!.amountComparison, "less");
  const unknown = promoteSmsLandingSubmits([smsDoc({ landingSubmittedAtMs: t0 + 90_000 })], [], smsMessages, t0, CATALOG);
  assert.equal("amountComparison" in unknown.deceivedMoments[0]!, false, "옛 문서(비교 없음) = 종전 모양");
  // 스냅샷(문자 항목)에는 싣지 않는다 — 같은 사실을 두 번 렌더하지 않는다(G17).
  const snapshot = buildSmsTimeline([smsDoc({ landingSubmittedAtMs: t0 + 90_000, landingAmountComparison: "less" })], smsMessages, t0);
  assert.equal(JSON.stringify(snapshot).includes("less"), false);
});
