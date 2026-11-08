// 2026-11-08 라이브 재시험 12(main `d72e4b6f` · 기관 사칭 고급 금 구매형 fv-g2ld 리플레이) — 리포트 결함 고정.
// 인증번호 요구 대사 바로 뒤 참가자 답 "새마을은행에 1,200만 원 있어요."(은행 · 잔액 답 · 숫자 코드 없음)에
// "상대의 '인증번호 요구' 수법에 응했습니다"가 붙었다. 같은 리플레이의 "인증 번호는 4 1 0 8 4 7이에요."는 정상.
// 판정표 O(`analyzeConversation.ts` — 인증번호 라벨은 답에 인증번호로 볼 내용이 있을 때만).
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { buildTacticPremiseText } from "../tacticPremise";
import { resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { extractTacticLabel } from "../../scenarios/tacticFlavor";

const t0 = 1_000_000;
const SCENARIO = "institutional-impersonation";
const VARIANT = "fv-g2ld";
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

function analyze(messages: AnalysisMessage[]) {
  return analyzeConversation(messages, t0, tactics(), [], undefined, buildTacticPremiseText(SCENARIO));
}

/** 재시험 12 리플레이에서 메인이 읽은 대사 그대로(앞뒤 문맥 줄은 최소). */
const OTP_LINE = "감사합니다. 본인 확인의 마지막 절차로 방금 문자로 발송된 여섯 자리 인증번호를 말씀해 주십시오.";
const BANK_BALANCE_REPLY = "새마을은행에 1,200만 원 있어요.";
const OTP_REPLY = "인증 번호는 4 1 0 8 4 7이에요.";

const isOtpLabel = (label: string) => /인증\s*번호/.test(label);

test("전제 — fv-g2ld 목록에 '인증번호' 라벨이 있다(없으면 이 시험이 아무것도 보지 않는다)", () => {
  assert.ok(tactics().map(extractTacticLabel).some(isOtpLabel), JSON.stringify(tactics().map(extractTacticLabel)));
});

test("[재현] O2 — 인증번호 요구 뒤 은행 · 잔액 답(숫자 코드 없음)은 '인증번호' 라벨로 응함이 아니다", () => {
  const result = analyze([
    msg(0, "scammer", "고객님 명의 계좌 보호를 위해 거래하시는 은행과 잔액을 확인하겠습니다.", 100),
    msg(1, "user", "네.", 110),
    msg(2, "scammer", OTP_LINE, 130),
    msg(3, "user", BANK_BALANCE_REPLY, 144),
  ]);
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 3);
  assert.ok(!moment || !isOtpLabel(moment.tactic), `은행 · 잔액 답에 인증번호 라벨: ${JSON.stringify(moment)}`);
});

test("O1 — 같은 인증번호 요구 뒤 숫자를 불러 준 답은 '인증번호 요구'에 응함(종전 그대로)", () => {
  const result = analyze([msg(0, "scammer", OTP_LINE, 170), msg(1, "user", OTP_REPLY, 188)]);
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.equal(moment.tactic, "인증번호 요구");
});

test("O1 — 한글 숫자 낭독('사 일 공 팔 사 칠이요')도 인증번호로 본다", () => {
  const result = analyze([msg(0, "scammer", OTP_LINE, 170), msg(1, "user", "사 일 공 팔 사 칠이요.", 188)]);
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.equal(moment.tactic, "인증번호 요구");
});

test("O2 — 재시험 12 순서(은행 · 잔액 답 → 다음 차례 인증번호 낭독): 인증번호 라벨은 낭독한 줄 하나뿐", () => {
  const result = analyze([
    msg(0, "scammer", OTP_LINE, 130),
    msg(1, "user", BANK_BALANCE_REPLY, 144),
    msg(2, "scammer", "네, 확인했습니다. 인증번호 여섯 자리 불러 주십시오.", 170),
    msg(3, "user", OTP_REPLY, 188),
  ]);
  const otpMoments = result.deceivedMoments.filter((m) => isOtpLabel(m.tactic)).map((m) => m.turnIndex);
  assert.deepEqual(otpMoments, [3], JSON.stringify(result.deceivedMoments));
});

test("O2 — 쉼표 없이 받아쓴 금액('1200만 원')도 인증번호가 아니다(4자리 숫자 뒤 금액 단위)", () => {
  const result = analyze([msg(0, "scammer", OTP_LINE, 130), msg(1, "user", "새마을은행에 1200만 원 있어요.", 144)]);
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
  assert.ok(!moment || !isOtpLabel(moment.tactic), JSON.stringify(moment));
});

test("O2 — 은행 · 잔액 답은 속은 순간 자체는 남는다(잔액 공개 · 라벨은 목록의 자산 정보 라벨)", () => {
  const result = analyze([msg(0, "scammer", OTP_LINE, 130), msg(1, "user", BANK_BALANCE_REPLY, 144)]);
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.equal(moment.tactic, "거래 은행·자산 정보 수집");
});

test("O3 — 인증번호 요구 뒤 '네, 알겠습니다.'만은 인증번호 요구에 응한 순간이 아니다(번호를 주지 않았다)", () => {
  const result = analyze([msg(0, "scammer", OTP_LINE, 130), msg(1, "user", "네, 알겠습니다.", 140)]);
  assert.equal(result.deceivedMoments.filter((m) => m.turnIndex === 1).length, 0, JSON.stringify(result.deceivedMoments));
  // 시도된 수법 목록은 대사 기준이라 그대로 오른다.
  assert.ok(result.tacticsUsed.includes("인증번호 요구"));
});
