// ⭐ Edge 재시험 3(2026-11-08 · main `1d61b7b5` · 정부지원금 스미싱 고급 · 세션 로그 `e4ee87f2`) — 설치 · 권한 허용을 마쳤는데 통화로 넘어가지 않고
// 사기범이 문자로 계좌 등록 → "본인 확인용 소액 이체"를 지어냈다(이 루트엔 이체 화면 · 계좌 문자가 없다 — `NO_ACCOUNT_ROUTE_KEYS` "subsidy-app").
// 원인(로그 확인): 참가자 첫 답장(사용자 1턴) 직후 설치 → 화면 행동 뒤 먼저 보내는 메시지의 "지금 전환 가능"이 전환 하한(§122(7) A0 · 사용자 2턴)에
// 걸려 거짓 → "전화 얘기 없이 메시지로 다음 요구를 이어가라"(`MOCK_INSTALL_CONSENT_INSTRUCTION_NO_CALL`)가 실렸다. 그 뒤 턴에는 설치가 끝났다는
// 지시가 없어(응낙 지시는 1회) 모델이 문자로 요구를 이어 갔다.
// 현실 대조: 지원금 · 택배 스미싱은 문자 링크 → 앱 설치 → 상담원 통화(원격 제어 · 전화 가로채기)로 이어진다 — 문자로 '본인 확인 소액 이체'를
// 받는 단계는 공개 주의보에 없다. 이 시나리오 설계도 ① 문자 → ② 설치 → ③ 통화(T84)다. ⇒ 기본 다음 단계 = 통화.
//
// 판정표 T(설치 뒤 다음 단계 — 전환은 여전히 모델의 신호 · 대사 예고로만 일어난다. 응낙이 전환을 직접 일으키지 않는다 — §15.9.7 G54 유지):
// | # | If | Then |
// |---|---|---|
// | T1 | 화면 행동 뒤 먼저 보내는 메시지 ∧ 응낙(consent) ∧ 설치 뒤 통화가 설계인 항목(`MESSENGER_INSTALL_WITHOUT_CALL_LANDINGS` 밖) | 전환 하한(A0)을 보지 않는다 — 설치 화면 행동이 참가자 행동이다(그 밖 조건 `resolveTransitionNow`는 그대로) |
// | T2 | 메신저 단계 ∧ 메신저 → 통화로 넘어간 적 없음 ∧ 그런 설치를 이미 알렸다(`consentAnnouncedAt`) ∧ 이번 턴 앱 진행 지시 없음 ∧ 지금 전환 가능 | 턴 지시 `INSTALL_DONE_CALL_NEXT_INSTRUCTION` |
// | T3 | 그 밖 | 종전 |
import { MESSENGER_INSTALL_WITHOUT_CALL_LANDINGS } from "../scenarios/mockScreens";

/** T2 — 설치가 끝났고 다음 단계가 통화인 메신저 턴의 지시(따옴표 대사 예시 0 · 세션 화면 문구 아님). */
export const INSTALL_DONE_CALL_NEXT_INSTRUCTION =
  "(앱 확인: 상대는 네가 보낸 설치 화면에서 설치와 권한 허용을 이미 마쳤다. 이 대화의 다음 단계는 담당자 통화다 — 이번 답장에서 한두 문장으로 담당자가 지금 전화로 이어서 안내하겠다고 말하라. 문자로 계좌 등록 · 이체 · 송금 · 추가 인증을 더 요구하지 않는다.)";

/** 설치 뒤 다음 단계가 통화인 설치 항목인가(지원금 · 택배 — 표 T1 · T2). */
export function installLeadsToCall(landingId: string): boolean {
  return !MESSENGER_INSTALL_WITHOUT_CALL_LANDINGS.includes(landingId);
}

/** 표 T1 — 화면 행동 뒤 먼저 보내는 메시지가 전환 하한을 건너뛰는가. */
export function followUpSkipsEscalationFloor(kind: "consent" | "submit", landingId: string): boolean {
  return kind === "consent" && installLeadsToCall(landingId);
}

/** 표 T2 — sendMessage 턴 지시(부재 = 종전). */
export function installDoneCallNextInstruction(input: {
  messengerStage: boolean;
  everEscalated: boolean;
  installCallAnnounced: boolean;
  otherAppInstruction: boolean;
  canTransitionNow: boolean;
}): string | undefined {
  return input.messengerStage &&
    !input.everEscalated &&
    input.installCallAnnounced &&
    !input.otherAppInstruction &&
    input.canTransitionNow
    ? INSTALL_DONE_CALL_NEXT_INSTRUCTION
    : undefined;
}
