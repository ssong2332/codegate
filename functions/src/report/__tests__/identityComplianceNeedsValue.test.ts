// 2026-11-18 라이브 재시험 25(기관 사칭 고급 fv-c5fj · `docs/research/edge-scenario-test-2026-11-07.md` P1 리포트 라벨 1:12) — 리포트 결함 고정.
// 사기범이 성함 · 생년월일을 요구한 대사 바로 뒤 참가자 답 "주거래 은행에 천이백만 원 정도 있어요."(잔액 답 · 신원 값 없음)에
// "상대의 '신원정보 직접 요구' 수법에 응했습니다"가 붙었다. 판정표 ID(`analyzeConversation.ts` — 판정표 O와 같은 방향:
// 신원 라벨은 답에 신원 값이 있을 때만, 잔액 · 은행만 밝힌 답은 신원 라벨을 빼고 다시 고른다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { buildTacticPremiseText } from "../tacticPremise";
import { resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { extractTacticLabel } from "../../scenarios/tacticFlavor";

const t0 = 1_000_000;
const SCENARIO = "institutional-impersonation";
const VARIANT = "fv-c5fj";
const msg = (turnIndex: number, role: "scammer" | "user", textMasked: string, sec: number): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: t0 + sec * 1000,
});

function tactics(): string[] {
  const resolved = resolveSessionScenarioPrompt(SCENARIO, VARIANT);
  assert.ok(resolved, `${VARIANT} 변형이 카탈로그에 없다`);
  return resolved.weakenedTactics;
}

function momentAt(messages: AnalysisMessage[], turnIndex: number) {
  const result = analyzeConversation(messages, t0, tactics(), [], undefined, buildTacticPremiseText(SCENARIO));
  return { moment: result.deceivedMoments.find((m) => m.turnIndex === turnIndex), result };
}

/** 재시험 25 · 26의 성함 · 생년월일 요구 대사(수법 문구 '본인 확인 … 성함이랑 생년월일 불러주세요'와 같은 어형). */
const IDENTITY_LINE = "본인 확인부터 해야 합니다. 성함이랑 생년월일 불러 주십시오.";
const BALANCE_REPLY = "주거래 은행에 천이백만 원 정도 있어요.";
const isIdentityLabel = (label: string) => /신원\s*정보|본인\s*확인\s*정보/.test(label);
const ASSET_LABEL = "거래 은행·자산 정보 수집";

test("전제 — fv-c5fj 목록에 신원 라벨과 자산 정보 라벨이 둘 다 있다(없으면 이 시험이 아무것도 보지 않는다)", () => {
  const labels = tactics().map(extractTacticLabel);
  assert.ok(labels.some(isIdentityLabel), JSON.stringify(labels));
  assert.ok(labels.includes(ASSET_LABEL), JSON.stringify(labels));
});

test("[재현] ID3 — 성함 · 생년월일 요구 뒤 잔액 답(신원 값 없음)은 신원 라벨이 아니라 자산 정보 라벨", () => {
  const { moment, result } = momentAt([msg(0, "scammer", IDENTITY_LINE, 60), msg(1, "user", BALANCE_REPLY, 72)], 1);
  assert.ok(moment, `속은 순간 자체는 남는다(잔액 공개): ${JSON.stringify(result.deceivedMoments)}`);
  assert.equal(moment.tactic, ASSET_LABEL);
  // 시도된 수법 목록은 대사 기준이라 신원 라벨이 그대로 오른다.
  assert.ok(result.tacticsUsed.some(isIdentityLabel), JSON.stringify(result.tacticsUsed));
});

test("ID3 — 은행 이름만 밝힌 답('새솔은행 써요')도 신원 라벨이 아니다", () => {
  const { moment } = momentAt([msg(0, "scammer", IDENTITY_LINE, 60), msg(1, "user", "네, 새솔은행 써요.", 72)], 1);
  assert.ok(!moment || !isIdentityLabel(moment.tactic), JSON.stringify(moment));
});

test("ID2 — 이름 · 생년월일을 불러 준 답은 신원 라벨 그대로(종전)", () => {
  const { moment, result } = momentAt([msg(0, "scammer", IDENTITY_LINE, 60), msg(1, "user", "홍길동이고요, 85년 3월 12일생이에요.", 72)], 1);
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.ok(isIdentityLabel(moment.tactic), moment.tactic);
});

test("ID2 — 신원 값과 잔액을 함께 말한 답도 신원 라벨 그대로(신원 값이 있으면 다시 고르지 않는다)", () => {
  const { moment, result } = momentAt(
    [msg(0, "scammer", IDENTITY_LINE, 60), msg(1, "user", "제 이름은 홍길동이고 주거래 은행에 천이백만 원 정도 있어요.", 72)],
    1,
  );
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.ok(isIdentityLabel(moment.tactic), moment.tactic);
});

test("ID2 — 여섯 자리 생년월일 숫자('850312요')는 신원 값이다", () => {
  const { moment, result } = momentAt([msg(0, "scammer", IDENTITY_LINE, 60), msg(1, "user", "850312요.", 72)], 1);
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.ok(isIdentityLabel(moment.tactic), moment.tactic);
});

test("ID1 — 신원 라벨이 아닌 순간(잔액을 물은 대사 뒤 잔액 답)은 종전 그대로", () => {
  const { moment, result } = momentAt(
    [msg(0, "scammer", "고객님 거래하시는 은행과 잔액이 어떻게 되십니까?", 60), msg(1, "user", BALANCE_REPLY, 72)],
    1,
  );
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.equal(moment.tactic, ASSET_LABEL);
});
