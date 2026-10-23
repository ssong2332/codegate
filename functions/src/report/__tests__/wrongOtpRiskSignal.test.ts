// 사용자 결정 2026-10-21(§101.2 후속 — *"위험 신호로 (권장)"*) — 인증번호를 요구받고 **문자 속 정답과 다른 번호**를 댄 줄은 속음이 아니라
// 가짜 정보와 같은 위험 신호(`fake_info`)다. `analyzeConversation.ts` W0~W4 판정표를 고정한다.
//
// | # | 상황 | 기대 |
// |---|---|---|
// | 1 | 정답 번호(숫자 · 한글 숫자) | 속음(종전) · 위험 신호 0 |
// | 2 | 오답 번호(숫자 · 한글 숫자 · 되물음 뒤 오답) | 속음 아님 · 위험 신호 fake_info 1 |
// | 3 | 정답 정보 없음(정답 목록 빈 배열 = 인증번호 문자가 없는 시나리오) | 종전 그대로 속음 |
// | 4 | 오답이지만 같은 답에 실제 제공(주민번호 토큰) | 속음(H1 우선) |
// | 5 | 인증번호를 묻지 않은 대사 뒤 6자리(생년월일 등) | 이 규칙 밖 — 종전 판정 |
// | 6 | 배선 | generateReportCore가 시나리오 카탈로그 정답을 넘긴다 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { listOtpItems } from "../../scenarios/inCallSms";

const msg = (role: "scammer" | "user", textMasked: string, turnIndex: number): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: 1000 * (turnIndex + 1),
});
const ASK = "본인 확인 마지막 절차입니다. 방금 문자로 간 인증번호 여섯 자리 불러 주십시오.";
const OTP = listOtpItems("institutional-impersonation").map((item) => item.otpCode!);

function judge(reply: string, codes: readonly string[] = OTP, ask = ASK) {
  return analyzeConversation([msg("scammer", ask, 0), msg("user", reply, 1)], 0, [], codes);
}

test("[W 1] 정답 번호는 종전처럼 속음 · 위험 신호 0", () => {
  assert.deepEqual(OTP, ["048231"], "기관 사칭 카탈로그 정답(전제)");
  for (const reply of ["048231이요", "048231", "공사팔이삼일이요", "공 사 팔 이 삼 일"]) {
    const result = judge(reply);
    assert.equal(result.wasDeceived, true, reply);
    assert.deepEqual(result.riskSignals, [], reply);
  }
});

test("[W 2] 오답 번호는 속음이 아니라 위험 신호 fake_info(가짜 정보와 같은 경로)", () => {
  for (const reply of ["382914요", "382914", "삼팔이구일사요", "123456이요 맞죠"]) {
    const result = judge(reply);
    assert.equal(result.wasDeceived, false, reply);
    assert.deepEqual(result.riskSignals.map((s) => s.kind), ["fake_info"], reply);
    assert.equal(result.riskSignals[0]!.turnIndex, 1);
  }
  // 되물음("번호가 다르네요") 뒤 다시 오답 — 같은 판정.
  const again = judge("555555요", OTP, "번호가 다르네요, 문자 다시 확인해서 불러 주세요.");
  assert.equal(again.wasDeceived, false);
  assert.deepEqual(again.riskSignals.map((s) => s.kind), ["fake_info"]);
});

test("[W 3] 정답 정보 없음(빈 목록 · 인자 생략) — 종전 판정 그대로 속음", () => {
  assert.equal(judge("382914요", []).wasDeceived, true);
  assert.equal(analyzeConversation([msg("scammer", ASK, 0), msg("user", "382914요", 1)], 0, []).wasDeceived, true);
  assert.deepEqual(listOtpItems("prosecution-cooperation-call"), [], "검찰은 인증번호 문자가 없다 — 이 시나리오는 대조하지 않는다");
});

test("[W 4 · 5] 실제 제공은 오답이어도 속음 · 인증번호를 묻지 않은 대사 뒤 숫자는 이 규칙 밖", () => {
  assert.equal(judge("382914요. 주민번호는 [주민번호]요").wasDeceived, true, "H1 실제 제공 우선");
  const birth = analyzeConversation(
    [msg("scammer", "생년월일 여섯 자리 불러 주십시오.", 0), msg("user", "610302요", 1)],
    0,
    [],
    OTP,
  );
  assert.equal(birth.wasDeceived, true, "생년월일 답은 종전처럼 속음(인증번호 대조 대상 아님)");
  assert.deepEqual(birth.riskSignals, []);
});

test("[W 6] 배선 — 리포트 생성이 그 세션 시나리오의 정답(§114 세션 번호)을 넘긴다", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/report/generateReportCore.ts"), "utf8");
  assert.ok(src.includes("listOtpItems(session.scenarioId).map((item) => withSessionOtp(item, sessionId).otpCode!)"));
});
