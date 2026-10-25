// ⭐ §132.13(DECISIONS #248 · 메인 라이브 2026-10-24 · 기관 사칭 고급 안전계좌 이체형 · 텍스트 폴백 · 운영 세션 68777e88) — 사기범이 계좌 문자를
// 보내기 전에 "문자 속 링크를 눌러 이체 화면을 열고 …"라고 안내했다(그때 도착한 문자는 인증번호 1건). 참가자가 "문자에 링크가 없는데요?"라고 하자
// 다음 턴에야 마커로 계좌 문자가 왔다. 실시간 경로는 사기범 전사의 "보냈다" 주장을 백스톱 질의에 싣지만(§104 · §126 — 화면 `toolWindow.ts`
// `SMS_SENT_CLAIM`), 폴백(sendMessage)에는 그 장치가 없었다. ⇒ 같은 응답에 문자 마커가 없는데 대사가 문자를 이미 보낸 것처럼 말하면, 서버가 주장
// 백스톱(`planSmsBackstop` claimed — 하한은 그대로)으로 남은 필수 문자를 그 응답에 보낸다. 게이트가 아직 닫혀 있으면 아무것도 하지 않는다.
//
// | 대사 꼴 | 주장으로 본다 |
// |---|---|
// | 화면 `SMS_SENT_CLAIM`과 같은 꼴("문자로 보내 드렸습니다" · "보내 드린 링크" · "발송한 문자") | 예 |
// | 문자 속 내용을 가리킨다("문자 속 링크" · "문자에 있는 주소" · "문자로 온 안내") | 예 |
// | 앞으로 보내겠다("문자 보내 드릴게요" · "보내 드리겠습니다") | 아니요 |
//
// ⛔ 아래 첫 정규식은 `src/lib/realtime/toolWindow.ts` `SMS_SENT_CLAIM`과 글자까지 같다(빌드 루트가 달라 import로 공유하지 않는다 —
// `liveCheckFixes132d.test.ts`가 두 파일을 대조한다).
import { gateOpensAtUserTurns, type DeliveredSmsRecord } from "../inCallSms/smsGate";
import type { FlowVariantSms } from "../scenarios/flowVariants";

export const SMS_SENT_CLAIM =
  /문자(?:로)?\s*(?:를\s*)?(?:보내\s*드렸|보내드렸|보냈|보내\s*드린|보내드린|보낸|발송(?:해\s*드렸|해\s*드린|했|됐|한|된))|(?:보내\s*드린|보내드린|보낸|발송한|발송된|발송해\s*드린)\s*(?:문자|링크|안내|주소|인증\s*번호)/;
/** 문자 속 내용을 이미 있는 것으로 가리키는 꼴. */
export const SMS_CONTENT_REFERENCE =
  /문자\s*(?:속|안|에\s*있는|에\s*온|에\s*적힌|에\s*찍힌|로\s*온|로\s*받으신|에\s*받으신)\s*(?:의\s*)?(?:링크|주소|안내|계좌|인증\s*(?:번호|코드))/;

// ── §132.17(메인 라이브 2026-10-25 main `faa38dc` · 기관 사칭 고급 금 구매형 fv-g2ld · 텍스트 대체 · 세션 2ea4c42f) ─────────────
// 발화 5에 사기범이 마커 없이 "문자에 적힌 인증번호 여섯 자리를 지금 불러 주시겠습니까?"라고 했다. 인증번호 문자 게이트는 이미 열려 있었지만
// (하한 5 · 06:24:34Z 판정 로그 0건) 위 두 꼴 어디에도 맞지 않아 주장 백스톱이 돌지 않았고, 문자는 참가자가 "아직 안 왔는데요"라고 한 발화 6에
// 마커로 왔다. ⇒ 판정표 O(인증번호 요구 = 이미 보냈다는 주장):
// | # | If(마커 없는 응답) | Then |
// |---|---|---|
// | O1 | 인증번호를 불러 · 알려 · 말해 · 읽어 달라는 꼴(`SMS_OTP_DEMAND`) ∨ "문자에 적힌 인증번호" | 주장으로 본다 → 게이트가 열렸으면 인증번호 문자를 그 응답에(하한 그대로) |
// | O2 | 인증번호 문자가 남았고 이번 발화에 게이트가 닫혀 있다(하한 전) | 응답 생성에 `SMS_OTP_DEMAND` 가드 — 요구 대사는 쓸 수 없는 응답 → 다음 단계 모델(`otpDemandGuardFor`) |
// | O3 | 인증번호 문자가 이미 도착 · 변형이 인증번호 문자를 선언하지 않음 | 가드 0(종전) |
// ⛔ 게이트 규칙(`smsGate.ts` 하한 · 간격)은 바꾸지 않는다 — 열린 게이트를 이 응답에서 쓰게 할 뿐이다.
/** 인증번호를 불러 달라는 요구(인증번호 뒤 같은 문장 20자 안). */
export const SMS_OTP_DEMAND = /인증\s*(?:번호|코드)[^.?!\n]{0,20}?(?:불러|알려|말씀해|말해|읽어)/;

export function replyClaimsSmsSent(reply: string): boolean {
  return SMS_SENT_CLAIM.test(reply) || SMS_CONTENT_REFERENCE.test(reply) || SMS_OTP_DEMAND.test(reply);
}

/**
 * O2 — 이번 발화에 인증번호 문자를 보낼 수 없으면(하한 전 · 간격 전) 인증번호 요구 대사를 막는 가드. 그 밖(O3) = `undefined`.
 * 열림 판정은 주장 백스톱과 같은 계산(`gateOpensAtUserTurns` · 명시 간격)이다 — 두 계산이 갈라지면 열린 게이트에서 요구를 막는다.
 */
export function otpDemandGuardFor(input: {
  declared: readonly FlowVariantSms[];
  delivered: readonly DeliveredSmsRecord[];
  userTurns: number;
}): RegExp | undefined {
  const otp = input.declared.find((item) => item.purpose === "identity" && item.required);
  if (!otp || input.delivered.some((d) => d.smsId === otp.smsId)) return undefined;
  return input.userTurns >= gateOpensAtUserTurns(otp, input.delivered, true) ? undefined : SMS_OTP_DEMAND;
}

/** 가드 둘을 하나로(둘 중 하나에 맞으면 쓸 수 없는 응답). */
export function combineReplyGuards(...guards: ReadonlyArray<RegExp | undefined>): RegExp | undefined {
  const present = guards.filter((g): g is RegExp => g !== undefined);
  if (present.length <= 1) return present[0];
  return new RegExp(present.map((g) => `(?:${g.source})`).join("|"));
}

/**
 * 대사가 가리키는 문자 종류와 보낼 필수 문자의 목적이 맞는가 — 이미 받은 인증번호를 "보내 드린 인증번호"라고 말한 턴에 계좌 문자가 미리 가지 않게 한다.
 * | 목적 | 대사에 있어야 하는 말 |
 * |---|---|
 * | `identity` | 인증번호 · 인증 코드 |
 * | 그 밖(transfer · link · install …) | 링크 · 주소 · 계좌 · 사이트 · 앱 |
 */
export function claimMatchesPurpose(reply: string, purpose: string): boolean {
  if (purpose === "identity") return /인증\s*(?:번호|코드)/.test(reply);
  // §132.17 O1 — 인증번호 요구만으로는 다른 목적의 문자를 보내지 않는다(이미 보냈다는 꼴이 있어야 한다).
  return (SMS_SENT_CLAIM.test(reply) || SMS_CONTENT_REFERENCE.test(reply)) && /링크|주소|계좌|사이트|앱/.test(reply);
}
