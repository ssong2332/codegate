// 2026-10-22(전수 검수 2차 · docs/research/full-scenario-live-audit-2026-10.md M1 · M2 · Architecture §104) — 텍스트 폴백의 구조화 신호가
// **같은 응답의 대사와 어긋날 때** 그 신호를 받아들이지 않는 순수 판정. 신호는 어느 경우든 텍스트에서 이미 지워져 있다(`extractEscalationSignal`).
//
// 재현(실 키 · 자녀 사칭 카톡):
//   M2 — 초급 s2 *"폰 고쳐서 얼른 연락할게!"* + `ESCALATE_VOICE` · 고급 의심 s4 *"지금 통화하면 소리도 다 깨져서 들리지도 않아"* + `ESCALATE_VOICE`
//        → 통화가 안 된다고 말한 그 턴에 전화가 걸려 온다(대사와 화면이 정면으로 모순).
//   M1 — 초급 s5 *"30만 원만 더 같은 계좌로 보내줘"* + `END_CALL_GOAL` → 새 송금 요구를 꺼낸 턴에 통화가 끝난다(참가자가 답할 기회 0).
//
// ── 판정표 A: 전화 전환 신호(`ESCALATE_VOICE`) ──────────────────────────────────────────────
// | # | If(신호를 실은 응답의 대사) | Then |
// |---|---|---|
// | A0 | §122(7) 전환 하한 — 메신저 진입 뒤 사용자 턴이 `ESCALATION_MIN_USER_TURNS`(2) 미만(첫 답장 · 오프닝) | **받아들이지 않는다**(`too_early`) — 대사와 무관 |
// | A1 | 나중에 · 이따 연락하겠다는 말이 있다(`LATER_CONTACT` — "나중에 전화할게"도 지금 거는 말이 아니다) | **받아들이지 않는다**(`contradicted`) |
// | A2 | 지금 전화를 걸겠다는 말이 있다(`CALL_NOW` — 전화할게 · 전화 걸게 · 전화드릴게/드리겠 · 통화하자 …) | 받아들인다 |
// | A3 | 통화가 안 된다는 말이 있다(`CALL_UNAVAILABLE` — 통화가 안 돼 · 전화 못 해 · 소리가 깨져 · 고쳐서 연락) | **받아들이지 않는다**(`contradicted`) |
// | A4 | 그 외 | 받아들인다(종전 동작) |
// - A2가 A3보다 먼저인 이유: *"통화가 안 된다니까 답답하네, 그럼 내가 지금 전화할게"* 는 전화를 거는 말이다.
// - 받아들이지 않은 신호는 이번 턴에 전이를 만들지 않을 뿐이다 — max-turn 폴백(`MESSENGER_ESCALATION_FALLBACK_TURNS`) · 다음 턴 신호는 그대로다.
//
// ── 판정표 B: 끊기 목표 신호(`END_CALL_GOAL`) ──────────────────────────────────────────────
// | # | If(신호를 실은 응답의 대사) | Then |
// |---|---|---|
// | B1 | 송금 · 이체 · 금액을 새로 요구하는 형태가 있다(`NEW_TRANSFER_DEMAND`) | **받아들이지 않는다**(`demand_in_goal_turn`) — 참가자가 그 요구에 답할 차례를 남긴다 |
// | B1-b | 그 밖의 요청 형태(`~해 줘 · 줄 수 있어 · 주세요` — §104 실측 "결제 내역 화면 캡처해서 보내줄 수 있어?" + `END_CALL_GOAL`) | 같음 |
// | B2 | 그 외 | 받아들인다(종전 동작) |
// - `END_CALL_GIVEUP`(포기)은 대상이 아니다 — 포기하며 마지막으로 한 번 더 조르는 말은 끊기와 모순이 아니다.
// ⛔ 잎 모듈(import 0) · 판정만 한다(효과 판정 `scammerHangup/fallback.ts` · 전이 `session/channelTransition.ts` 무변경).

/** A1 — 나중에 · 이따 연락하겠다는 말. */
export const LATER_CONTACT = /(?:나중에|이따가?|조금\s*있다가?|다음에)\s*(?:다시\s*|꼭\s*|얼른\s*)?(?:전화|연락|통화)/;
/** A2 — 지금 전화를 걸겠다는 말. */
export const CALL_NOW = /전화\s*(?:를\s*)?(?:할게|할께|걸게|걸께|드릴게|드릴께|드리겠|하겠|줄게|해\s*줄게)|통화\s*(?:로\s*)?(?:하자|할게|해\s*줄게|넘어가)/;
/** A2 — 통화가 안 된다 · 나중에 연락하겠다는 말. */
export const CALL_UNAVAILABLE =
  /(?:통화|전화)\s*(?:가|는|도)?\s*(?:안\s*돼|안\s*되|안\s*된|못\s*해|못\s*하|못\s*받|불가|어려)|소리\s*(?:가|도)?\s*[^.?!\n]{0,12}(?:깨져|깨지|안\s*들)|(?:나중에|이따|이따가|이따\s*가|조금\s*있다)\s*(?:다시\s*)?연락|고쳐서\s*[^.?!\n]{0,8}연락/;
/** B1 — 송금 · 이체 · 금액을 새로 요구하는 형태. */
// "보내줘서 고마워"(받은 것에 대한 인사)는 요구가 아니다 — `줘` 뒤 `서`를 뺀다.
export const NEW_TRANSFER_DEMAND =
  /(?:보내|이체해|송금해|입금해|넣어)\s*(?:줘|주세요|주십시오|주시면|주셔야|달라)(?!서)|만\s*원\s*만\s*더/;

/** B1-b — 참가자에게 무언가를 해 달라는 요청 형태("보내줘서 고마워"처럼 `줘서`는 받은 것에 대한 인사라 뺀다). */
export const NEW_REQUEST_FORM = /(?:줘|줄래|줄\s*수\s*있|주세요|주십시오|주시겠|주실\s*수|주시면)(?!서)/;

export type EscalationConsistency = { accept: true } | { accept: false; reason: "contradicted" | "too_early" };

/**
 * A0 — 전환 하한(§122(7) 실기 신고 2026-10-23: 자녀 사칭 카톡 첫 마디에 전화 전환 신호가 실려 나왔다). 메신저 진입 뒤 사용자 턴이
 * 이 수 미만이면 신호를 받아들이지 않는다 — 참가자가 한 번은 더 답할 차례가 남는다. 오프닝(턴 0)은 애초에 판정하지 않고 지우기만 한다.
 */
export const ESCALATION_MIN_USER_TURNS = 2;

/** 판정표 A0 — `turnsSinceEntry` = `turnsSinceMessengerEntry(turnCount, channelHistory)`(이번 사용자 턴 포함). */
export function isEscalationTooEarly(turnsSinceEntry: number): boolean {
  return turnsSinceEntry < ESCALATION_MIN_USER_TURNS;
}

/** 판정표 A0 → A1~A4 — sendMessage가 부르는 입구(A0 전환 하한을 먼저 본다). */
export function judgeEscalationSignalAt(turnsSinceEntry: number, replyText: string): EscalationConsistency {
  if (isEscalationTooEarly(turnsSinceEntry)) return { accept: false, reason: "too_early" }; // A0
  return judgeEscalationSignal(replyText);
}

/** 판정표 A. */
export function judgeEscalationSignal(replyText: string): EscalationConsistency {
  if (LATER_CONTACT.test(replyText)) return { accept: false, reason: "contradicted" }; // A1
  if (CALL_NOW.test(replyText)) return { accept: true }; // A2
  if (CALL_UNAVAILABLE.test(replyText)) return { accept: false, reason: "contradicted" }; // A3
  return { accept: true }; // A4
}

export type EndCallConsistency = { endCall: "goal" | "give_up" | undefined; dropped?: "demand_in_goal_turn" };

/** 판정표 B — 받아들이지 않으면 신호를 없는 것으로 돌려준다(효과 판정 함수에는 `undefined`가 들어간다). */
export function judgeEndCallSignal(endCall: "goal" | "give_up" | undefined, replyText: string): EndCallConsistency {
  if (endCall === "goal" && (NEW_TRANSFER_DEMAND.test(replyText) || NEW_REQUEST_FORM.test(replyText))) return { endCall: undefined, dropped: "demand_in_goal_turn" }; // B1 · B1-b
  return { endCall }; // B2
}
