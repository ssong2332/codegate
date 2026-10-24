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
import { withSessionOtp } from "../scenarios/sessionOtp";
import type { InCallSmsItem } from "../scenarios/inCallSms";
import { extractSpokenCodes } from "../shared/spokenDigits";

/** 도착 기록 1건(`inCallSms/smsGate.ts` `DeliveredSmsRecord`와 같은 모양 — 순환 import를 피해 구조로만 받는다). */
type OtpDeliveredRecord = { smsId: string; userTurnsAtArrival?: number };

/**
 * 직전 사기범 발화가 인증번호를 물었는가 — "인증번호"·"인증 번호"·"인증코드", 그리고 **틀린 번호에 되물은 말**
 * ("번호가 안 맞…"·"번호가 맞지 않…"·"번호가 일치하지 않…"·"번호가 틀…"·"문자 … 다시 확인해서 불러…").
 * 뒤쪽은 §80 리뷰 #1 — 되묻기 대사에 "인증번호"가 없으면 두 번째 시도가 `not-asked`로 빠져 틀린 번호가 다시 통과했다.
 */
/** 직전 사기범 발화가 **틀린 번호에 되물은 말**인가 — 그 뒤 숫자가 또 다르면 재시도용 문면을 쓴다(QA §80 재시도 0/4 → 4/4). */
const REASKED_OTP = /번호가[^.?!]{0,24}(?:안\s*맞|맞지\s*않|일치하지\s*않|틀)/;
export const ASKED_FOR_OTP =
  /인증\s*(?:번호|코드)|번호가[^.?!]{0,24}(?:안\s*맞|맞지\s*않|일치하지\s*않|틀)|문자[^.?!]{0,20}다시[^.?!]{0,20}불러/;
/** 이번 참가자 발화가 생년월일·생일 답인가. */
const BIRTHDATE_CUE = /생년월일|생일|년생|\d{2,4}\s*년\s*\d{1,2}\s*월/;

/** 판정 결과 — 라이브 확인용 로그에 싣는다(G170: 번호·대사 없이 코드값만). */
export type OtpCheckReason =
  | "no-otp-scenario"
  | "no-digits"
  | "not-asked"
  | "birthdate"
  | "transferred"
  | "before-arrival"
  | "later-sms-arrived"
  | "arrived-this-turn"
  | "not-delivered"
  | "no-same-length"
  | "compared";
export type OtpCheckResult = {
  instruction?: string;
  outcome: "match" | "mismatch" | "none";
  reason: OtpCheckReason;
  /** 직전 사기범 발화가 되묻기였다(두 번째 이후 시도) — 재시도용 문면을 썼다. */
  repeat?: boolean;
};

/**
 * sendMessage가 저장 이력에서 대조 입력 두 개를 뽑는 규칙(§80 — 회귀 테스트가 같은 함수로 대화를 재생한다).
 * 지금 만들어질 사기범 응답 번호 = 저장된 사기범 메시지 수 + 1 · 직전 사기범 발화 = 마지막 scammer 메시지의 textMasked.
 */
export function otpCheckInputsFromHistory(history: ReadonlyArray<{ role: string; textMasked: string }>): {
  scammerTurnNumber: number;
  lastScammerText?: string;
} {
  const scammer = history.filter((m) => m.role === "scammer");
  const last = scammer[scammer.length - 1];
  return { scammerTurnNumber: scammer.length + 1, ...(last ? { lastScammerText: last.textMasked } : {}) };
}

/** 호환 래퍼 — 지시 문자열만 필요할 때. 판정 사유까지 필요하면 `evaluateOtpCheck`. */
export async function resolveOtpCheckInstruction(input: OtpCheckInput): Promise<string | undefined> {
  return (await evaluateOtpCheck(input)).instruction;
}

type OtpCheckInput = {
  scenarioId: string;
  /** §114 — 세션 id. 정답을 세션 번호(`withSessionOtp`)로 바꾼다. 부재면 카탈로그 번호(종전). */
  sessionId?: string;
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
  /**
   * ⭐ T191 리뷰 M3 — 이 세션의 문자 도착 기록(이번 턴 백스톱 도착 포함). **있으면** 도착 여부 · "다음 문자 도착"을
   * 카탈로그 고정 턴(`afterScammerTurns`)이 아니라 이 기록(문서 존재 · `userTurnsAtArrival` 순서)으로 판정한다 —
   * T191부터 문자 순서 · 시점이 대화에 따라 달라지기 때문이다(AC-099 (d)). 결과 1줄 문면 · 번호 비노출은 그대로다.
   * **없으면** 종전 판정(카탈로그 턴 + `isDelivered`) 그대로(변형 없는 세션 · 기록 조회 실패 — 무소급).
   */
  deliveredRecords?: readonly OtpDeliveredRecord[];
};

/** 판정표(머리 주석)대로 평가하고, 빠진 행을 `reason`으로 돌려준다. */
export async function evaluateOtpCheck(input: OtpCheckInput): Promise<OtpCheckResult> {
  const none = (reason: OtpCheckReason): OtpCheckResult => ({ outcome: "none", reason });
  const otpItems = listOtpItems(input.scenarioId).map((item) => withSessionOtp(item, input.sessionId));
  if (otpItems.length === 0) return none("no-otp-scenario");
  const spoken = extractSpokenCodes(input.userText);
  if (spoken.length === 0) return none("no-digits");
  // QA M2 — 이 시나리오의 사기범은 문자 도착 뒤에도 "성함과 생년월일 6자리"를 묻는다. 그 답(6자리)을 인증번호로 보면
  // "번호가 다르다"가 나간다 ⇒ 직전 사기범 발화가 **인증번호**를 물었을 때만, 그리고 이번 발화가 생년월일이 아닐 때만 대조한다.
  if (!ASKED_FOR_OTP.test(input.lastScammerText ?? "")) return none("not-asked");
  if (BIRTHDATE_CUE.test(input.userText)) return none("birthdate");
  if (input.callTransferred) return none("transferred");

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

  if (input.deliveredRecords) return evaluateByArrivalRecords(input, otpItems, spoken, input.deliveredRecords);

  let reason: OtpCheckReason = "before-arrival";
  for (const item of otpItems) {
    if (!item.otpCode || input.scammerTurnNumber < item.afterScammerTurns) continue;
    const laterItems = (IN_CALL_SMS[input.scenarioId] ?? []).filter(
      (other) => other.smsId !== item.smsId && other.afterScammerTurns > item.afterScammerTurns,
    );
    for (const later of laterItems) {
      if (input.scammerTurnNumber >= later.afterScammerTurns && (await delivered(later.smsId))) return none("later-sms-arrived");
    }
    // 이번 턴에 막 도착한 문자는 참가자가 아직 보지 못했다 — 이 턴의 숫자는 그 번호에 대한 답이 아니다(리뷰 #1).
    if (item.smsId === input.deliveredThisTurn) {
      reason = "arrived-this-turn";
      continue;
    }
    if (!(await delivered(item.smsId))) {
      reason = "not-delivered";
      continue;
    }
    // 정답과 자릿수가 같은 숫자열만 인증번호 답으로 본다 — 전화번호·금액·계좌 등 다른 숫자에 "번호가 안 맞는다"를
    // 내지 않는다(리뷰 #2, #300 과발동 방향 회피). 8자리 이상은 저장 전 maskPII가 `[계좌]`로 바꾸는 값이라 자연히 빠진다.
    const candidates = spoken.filter((code) => code.length === item.otpCode!.length);
    if (candidates.length === 0) {
      reason = "no-same-length";
      continue;
    }
    const outcome = candidates.includes(item.otpCode) ? "match" : "mismatch";
    const repeat = REASKED_OTP.test(input.lastScammerText ?? "");
    return { instruction: buildOtpCompareInstruction(outcome, { repeat }), outcome, reason: "compared", ...(repeat ? { repeat } : {}) };
  }
  return none(reason);
}

/**
 * ⭐ T191 리뷰 M3 — 도착 기록 기반 판정(머리 주석 판정표의 "도착 전" · "다음 문자 도착" · "이번 턴 도착" · "미도착" 행을
 * 기록으로 바꾼 것. 나머지 행 — 숫자 없음 · 묻지 않음 · 생년월일 · 전환 · 자릿수 — 은 위에서 이미 같은 순서로 걸렀다).
 *
 * | If (위에서부터) | Then |
 * |---|---|
 * | 인증번호 문자가 **이번 턴에** 도착(`deliveredThisTurn`) | 없음(`arrived-this-turn`) |
 * | 인증번호 문자의 도착 기록이 없다 | 없음(`not-delivered`) |
 * | 다른 문자 중 인증번호보다 **늦게**(더 큰 `userTurnsAtArrival`) 도착한 것이 있다 · 이번 턴에 다른 문자가 도착했다 | 없음(`later-sms-arrived`) |
 * | 같은 자릿수 후보 없음 | 없음(`no-same-length`) |
 * | 그 외 | 일치/다름 결과 1줄 |
 *
 * ⚠️ 이전 문서(`userTurnsAtArrival` 부재)는 0으로 본다 — 두 문서가 모두 0이면 "늦게"가 아니므로 대조한다(보수 쪽 아님:
 * 무백필 세션의 드문 경우로 판단 — 보고서 인계).
 */
function evaluateByArrivalRecords(
  input: OtpCheckInput,
  otpItems: InCallSmsItem[],
  spoken: string[],
  records: readonly OtpDeliveredRecord[],
): OtpCheckResult {
  const none = (reason: OtpCheckReason): OtpCheckResult => ({ outcome: "none", reason });
  let reason: OtpCheckReason = "not-delivered";
  for (const item of otpItems) {
    if (!item.otpCode) continue;
    if (item.smsId === input.deliveredThisTurn) {
      reason = "arrived-this-turn";
      continue;
    }
    const own = records.find((r) => r.smsId === item.smsId);
    if (!own) {
      reason = "not-delivered";
      continue;
    }
    const ownAt = own.userTurnsAtArrival ?? 0;
    const laterArrived =
      records.some((r) => r.smsId !== item.smsId && (r.userTurnsAtArrival ?? 0) > ownAt) ||
      (input.deliveredThisTurn !== undefined && input.deliveredThisTurn !== item.smsId);
    if (laterArrived) return none("later-sms-arrived");
    const candidates = spoken.filter((code) => code.length === item.otpCode!.length);
    if (candidates.length === 0) {
      reason = "no-same-length";
      continue;
    }
    const outcome = candidates.includes(item.otpCode) ? "match" : "mismatch";
    const repeat = REASKED_OTP.test(input.lastScammerText ?? "");
    return { instruction: buildOtpCompareInstruction(outcome, { repeat }), outcome, reason: "compared", ...(repeat ? { repeat } : {}) };
  }
  return none(reason);
}
