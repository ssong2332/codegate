// ⭐ §132.6(DECISIONS #248 · 메인 세션 라이브 확인 2026-10-24 · 기관 사칭 고급 · 텍스트 폴백 · 운영 세션 659702ea) — 인증번호 문자가
// 발화 7에 백스톱으로 도착했는데, 그 턴 응답이 역할 이탈(§129)로 나가 도착 안내가 빠졌고, 그 뒤 어떤 대사도 번호를 묻지 않았다.
// 문자 도착 턴 지시(`sms_announce`)는 그 한 턴에만 실리므로(`fallbackTurn.ts` 2행 — 이월 0) 그 턴을 놓치면 영영 묻지 않는다.
// ⇒ 도착 뒤 사기범 대사가 아직 번호를 묻지 않았으면 다음 턴(들)에 "번호를 불러 달라" 1줄을 싣는다. 순수 함수.
//
// | 조건(위에서부터 먼저 맞는 행) | 결과 |
// |---|---|
// | 이 세션이 인증번호 문자를 선언하지 않았다 · 아직 도착하지 않았다 | 없음 |
// | 이번 턴에 도착했다(도착 턴 지시가 맡는다) | 없음 |
// | 도착 뒤 지난 사용자 발화가 `OTP_FOLLOW_UP_MAX_TURNS`를 넘었다 | 없음 — 흐름이 이미 다음 국면이다(되돌아가 묻지 않는다) |
// | 인증번호 다음 문자(계좌 등)가 이미 도착했다 | 없음 — `otpCheck.ts` R8 회귀 ①과 같은 이유 |
// | 도착 뒤 사기범 대사 중 하나라도 번호를 물었다(`ASKED_FOR_OTP`) | 없음 |
// | 도착 뒤 참가자가 숫자를 이미 불렀다 | 없음 |
// | 그 밖 | `OTP_FOLLOW_UP_INSTRUCTION` |
import { ASKED_FOR_OTP } from "./otpCheck";
import { extractSpokenCodes } from "../shared/spokenDigits";

/** 도착 뒤 이 발화 수까지만 다시 묻게 한다(1 = 도착 다음 턴만 · 2 = 그다음 턴까지). */
export const OTP_FOLLOW_UP_MAX_TURNS = 2;

export const OTP_FOLLOW_UP_INSTRUCTION =
  "(참가자 휴대전화에 인증번호 문자가 이미 도착해 있는데 아직 번호를 묻지 않았다. 상대의 말에 짧게 답한 뒤 이번 대답에서 문자로 받은 인증번호를 불러 달라고 요구하라. 번호를 네가 지어내 말하지 마라.)";

export type OtpFollowUpInput = {
  /** 이 세션이 선언한 인증번호 문자의 smsId(없으면 빈 배열). */
  otpSmsIds: readonly string[];
  /** 도착 기록(이번 턴 백스톱 도착 포함). */
  delivered: readonly { smsId: string; userTurnsAtArrival?: number }[];
  /** 이번에 답하려는 사용자 발화 수(이번 발화 포함). */
  userTurns: number;
  /** 도착 뒤 사기범 대사들(도착 턴 응답부터 직전 응답까지 — 이번 응답 전). */
  scammerTextsSinceArrival: readonly string[];
  /** 도착 뒤 참가자 발화들(이번 발화 포함). */
  userTextsSinceArrival: readonly string[];
};

export function planOtpFollowUp(input: OtpFollowUpInput): string | undefined {
  const otp = input.delivered.find((d) => input.otpSmsIds.includes(d.smsId));
  if (!otp || otp.userTurnsAtArrival === undefined) return undefined;
  const since = input.userTurns - otp.userTurnsAtArrival;
  if (since <= 0 || since > OTP_FOLLOW_UP_MAX_TURNS) return undefined;
  const later = input.delivered.some(
    (d) => !input.otpSmsIds.includes(d.smsId) && (d.userTurnsAtArrival ?? 0) >= otp.userTurnsAtArrival!,
  );
  if (later) return undefined;
  if (input.scammerTextsSinceArrival.some((t) => ASKED_FOR_OTP.test(t))) return undefined;
  if (input.userTextsSinceArrival.some((t) => extractSpokenCodes(t).length > 0)) return undefined;
  return OTP_FOLLOW_UP_INSTRUCTION;
}
