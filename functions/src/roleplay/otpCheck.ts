// 텍스트 폴백 경로(sendMessage)의 인증번호 **서버 대조** (2026-10-18, Architecture §78 — #300 회귀 수정).
//
// #300은 문자 도착 이후 매 턴 "실제 번호 + 대조 규칙"을 프롬프트에 실었다 → 계좌 문자 뒤에도 인증번호만 다시 요구
// (세션 0/7 → 6/7)·모델이 번호를 먼저 말함(0/7 → 3/7)이 재현됐다(scenario-review R8). 그래서 이제는
// **서버가 참가자 발화의 숫자를 뽑아 비교하고, 숫자를 부른 그 턴에만 결과 1줄**("일치"/"다름")을 준다.
// 번호(정답)는 모델에 가지 않는다.
//
// | 조건 (위에서부터 먼저 맞는 행) | 지시 | Firestore 읽기 |
// |---|---|---|
// | 이 시나리오에 인증번호 문자가 없다 | 없음 | 0 |
// | 이번 사용자 발화에 불러 준 숫자열이 없다(`extractSpokenCodes` — 리포트 (D3)·(D4)와 같은 규칙) | 없음 | 0 |
// | **직전 사기범 발화가 인증번호를 묻지 않았다** · 이번 발화에 생년월일 단서가 있다(QA M2 — "생년월일 6자리"에 "번호가 다르다" 오발동) | 없음 | 0 |
// | 호 전환(확인 데스크) 뒤 | 없음 | 0 |
// | 이번 사기범 턴이 인증번호 문자 도착 턴보다 이르다 | 없음 | 0 |
// | **인증번호 다음 문자(계좌·링크 등)가 이미 도착했다**(같은 턴 도착 포함) | 없음 — 이체 단계로 넘어간 뒤 인증번호로 되돌아가지 않는다(R8 회귀 ①) | 0~1 |
// | 인증번호 문자가 **이번 턴에** 도착했다 | 없음 — 참가자는 아직 문자를 못 봤다(도착 지시와 충돌, 리뷰 #1) | 0 |
// | 인증번호 문자가 도착하지 않았다 · 조회 실패(경고 로그) | 없음 | 1 |
// | 불러 준 숫자열 중 **정답과 자릿수가 같은 것**이 없다(전화·금액·계좌 등 — 리뷰 #2) | 없음 | 1 |
// | 같은 자릿수 후보 중 하나가 `otpCode`와 같다 | `buildOtpCompareInstruction("match")` | 1 |
// | 그 밖(같은 자릿수인데 다르다) | `buildOtpCompareInstruction("mismatch")` | 1 |
import { logger } from "firebase-functions";
import { buildOtpCompareInstruction, IN_CALL_SMS, listOtpItems } from "../scenarios/inCallSms";
import { extractSpokenCodes } from "../shared/spokenDigits";

/** 직전 사기범 발화가 인증번호를 물었는가 — "인증번호", "인증 번호", "인증코드". */
const ASKED_FOR_OTP = /인증\s*(?:번호|코드)/;
/** 이번 참가자 발화가 생년월일·생일 답인가. */
const BIRTHDATE_CUE = /생년월일|생일|년생|\d{2,4}\s*년\s*\d{1,2}\s*월/;

export async function resolveOtpCheckInstruction(input: {
  scenarioId: string;
  /** 이번 턴 참가자 발화(마스킹 전 원문 — 6자리는 maskPII가 바꾸지 않지만 원문에서 뽑는 편이 확실하다). */
  userText: string;
  /** 지금 만들어질 사기범 응답이 몇 번째인가(roleplay/index.ts `scammerTurnNumber`). */
  scammerTurnNumber: number;
  /** 이 턴에 방금 도착 처리한 문자 id(있으면 조회 없이 도착으로 본다). */
  deliveredThisTurn?: string;
  /** 이 세션에 그 문자가 도착했는가(Firestore `sessions/{sid}/inCallSms/{smsId}` 존재). */
  isDelivered: (smsId: string) => Promise<boolean>;
  /** 직전 사기범 발화(저장된 마지막 scammer 메시지). 인증번호를 물은 직후의 숫자만 인증번호 답으로 본다. 없으면 대조 안 함. */
  lastScammerText?: string;
  /** 호 전환(확인 데스크 `placedAt`)이 끝났는가 — 그 뒤 화자는 다른 담당자다(§53.6 (3)). */
  callTransferred?: boolean;
}): Promise<string | undefined> {
  const otpItems = listOtpItems(input.scenarioId);
  if (otpItems.length === 0) return undefined;
  const spoken = extractSpokenCodes(input.userText);
  if (spoken.length === 0) return undefined;
  // QA M2 — 이 시나리오의 사기범은 문자 도착 뒤에도 "성함과 생년월일 6자리"를 묻는다. 그 답(6자리)을 인증번호로 보면
  // "번호가 다르다"가 나간다 ⇒ 직전 사기범 발화가 **인증번호**를 물었을 때만, 그리고 이번 발화가 생년월일이 아닐 때만 대조한다.
  if (!ASKED_FOR_OTP.test(input.lastScammerText ?? "")) return undefined;
  if (BIRTHDATE_CUE.test(input.userText)) return undefined;
  if (input.callTransferred) return undefined;

  const delivered = async (smsId: string): Promise<boolean> => {
    if (smsId === input.deliveredThisTurn) return true;
    try {
      return await input.isDelivered(smsId);
    } catch {
      // 지시가 조용히 빠지면 증상이 재발해도 알 수 없다 — 숫자·ID만 남긴다(대사·번호 금지, G170).
      logger.warn("인증번호 대조 — 도착 여부 조회 실패로 생략", { scenarioId: input.scenarioId, smsId });
      return false;
    }
  };

  for (const item of otpItems) {
    if (!item.otpCode || input.scammerTurnNumber < item.afterScammerTurns) continue;
    const laterItems = (IN_CALL_SMS[input.scenarioId] ?? []).filter(
      (other) => other.smsId !== item.smsId && other.afterScammerTurns > item.afterScammerTurns,
    );
    for (const later of laterItems) {
      if (input.scammerTurnNumber >= later.afterScammerTurns && (await delivered(later.smsId))) return undefined;
    }
    // 이번 턴에 막 도착한 문자는 참가자가 아직 보지 못했다 — 이 턴의 숫자는 그 번호에 대한 답이 아니다(리뷰 #1).
    if (item.smsId === input.deliveredThisTurn) continue;
    if (!(await delivered(item.smsId))) continue;
    // 정답과 자릿수가 같은 숫자열만 인증번호 답으로 본다 — 전화번호·금액·계좌 등 다른 숫자에 "번호가 안 맞는다"를
    // 내지 않는다(리뷰 #2, #300 과발동 방향 회피). 8자리 이상은 저장 전 maskPII가 `[계좌]`로 바꾸는 값이라 자연히 빠진다.
    const candidates = spoken.filter((code) => code.length === item.otpCode!.length);
    if (candidates.length === 0) continue;
    return buildOtpCompareInstruction(candidates.includes(item.otpCode) ? "match" : "mismatch");
  }
  return undefined;
}
