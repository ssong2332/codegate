// 2026-11-24 브라우저 A 라이브 — 속은 순간 라벨이 답 내용과 어긋남(판정표 IO · BK — `analyzeConversation.ts`, 판정표 O · ID와 같은 방향).
// A1b 기관 고급 금 구매형 fv-g2ld: 인증번호를 불러 준 답("네, 인증 번호는 58884" · "588845요. 여섯 자리 다 불렀어요.")이 '신원정보 직접 요구'에 응함.
// A4 카드사 고급 R1 fv-k3dn 상담원 통화: 생년월일 답("3월 1일")이 '거래 은행 정보 수집'에 응함(그 통화 수법 목록에 신원 라벨이 없다).
//
// | # | 고정하는 것 |
// |---|---|
// | AL1 | 재현 IO1 — 신원 요구 어형 대사 뒤 인증번호 낭독 → '인증번호' 라벨(답의 '인증' · 세션 정답 일치 · 짝 대사의 인증번호 물음 중 하나) |
// | AL2 | IO2 — 이름 · 생년월일을 함께 말한 답은 신원 라벨 그대로 |
// | AL3 | 재현 BK1 — R1 상담원 통화 생년월일 답 → 신원 라벨(통화 목록에 없어 세션 목록의 '본인확인 정보 직접 요구') |
// | AL4 | BK2 — 은행 · 잔액을 밝힌 답은 거래 은행 라벨 그대로 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { findFlowVariant, multiCallLegTactics, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";

const msg = (turnIndex: number, role: "scammer" | "user", textMasked: string, legIndex?: number): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: turnIndex * 10_000,
  ...(legIndex !== undefined ? { legIndex } : {}),
});
const isIdentityLabel = (label: string) => /신원\s*정보|본인\s*확인\s*정보/.test(label);

function g2ldTactics(): string[] {
  const resolved = resolveSessionScenarioPrompt("institutional-impersonation", "fv-g2ld");
  assert.ok(resolved);
  return resolved.weakenedTactics;
}
// 본인 확인을 앞세운 재요청(인증번호라는 말 없이 — A1b 사기범이 두 번 끊어 받은 꼴).
const RE_ASK = "본인 확인 절차입니다. 들리신 숫자를 다시 한 번 정확히 불러 주십시오.";

test("[AL1 재현] IO1 — 인증번호 낭독 답은 '신원정보 직접 요구'가 아니라 인증번호 라벨", () => {
  const cases: [string, readonly string[]][] = [
    ["네, 인증 번호는 58884", []], // 답의 '인증'
    ["588845요. 여섯 자리 다 불렀어요.", ["588845"]], // 세션 정답 일치
  ];
  for (const [reply, otp] of cases) {
    const result = analyzeConversation([msg(0, "scammer", RE_ASK), msg(1, "user", reply)], 0, g2ldTactics(), otp);
    const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
    assert.ok(moment, `${reply}: ${JSON.stringify(result.deceivedMoments)}`);
    assert.match(moment.tactic, /인증\s*번호/, reply);
  }
});

test("[AL2] IO2 — 이름 · 생년월일을 함께 말한 답은 신원 라벨 그대로", () => {
  const result = analyzeConversation(
    [msg(0, "scammer", "본인 확인부터 하겠습니다. 성함이랑 생년월일 불러 주십시오."), msg(1, "user", "홍길동이고요, 85년 3월 12일생이에요.")],
    0,
    g2ldTactics(),
  );
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
  assert.ok(moment && isIdentityLabel(moment.tactic), JSON.stringify(result.deceivedMoments));
});

// R1 상담원 통화(레그 1) — 새 통화 본인 확인 단계.
const AGENT_ASK = "확인 감사합니다. 생년월일은 월하고 일만 말씀해 주시겠어요?";

test("[AL3 재현] BK1 — R1 상담원 통화 생년월일 답은 거래 은행 라벨이 아니라 신원 라벨", () => {
  const v = findFlowVariant("fv-k3dn")!;
  const legTactics = multiCallLegTactics(v)!;
  assert.equal(legTactics[1]!.some((t) => isIdentityLabel(t)), false, "전제 — 상담원 통화 목록에 신원 라벨이 없다");
  const result = analyzeConversation([msg(0, "scammer", AGENT_ASK, 1), msg(1, "user", "3월 1일", 1)], 0, [...v.tactics], [], legTactics);
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.ok(isIdentityLabel(moment.tactic), moment.tactic);
});

test("[AL4] BK2 — 은행 · 잔액을 밝힌 답은 거래 은행 라벨 그대로", () => {
  const v = findFlowVariant("fv-k3dn")!;
  const result = analyzeConversation(
    [msg(0, "scammer", "주로 쓰시는 은행이 어디세요?", 1), msg(1, "user", "새솔은행에 천만 원 있어요.", 1)],
    0,
    [...v.tactics],
    [],
    multiCallLegTactics(v),
  );
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.match(moment.tactic, /거래\s*은행/);
});
