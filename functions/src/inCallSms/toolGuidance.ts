// ⭐ §117(2026-10-23 사용자 실기 신고 *"ai 음성이 유사한 내용을 2번씩 말한다"* · DECISIONS #232) — 모델 도구(`send_prepared_sms`) 응답 문면의 되풀이 금지 꼬리.
//
// 원인(운영 세션 f7047187 · 기관 사칭 고급 · 2026-10-23 11:57~11:58 KST): 모델이 도구를 부르기 **전에** "문자로 보내 드린 인증번호를 불러 주십시오"를
// 먼저 말하고, 도구(BLOCKING) 결과의 안내(`announceInstruction` · 거부 문면)를 받은 뒤 같은 요구를 말만 바꿔 한 번 더 말했다. 두 말은 같은 모델 턴이라
// 전사에는 한 말풍선으로 붙는다. 기존 안내 문면은 "상대의 말에 대답할 때 그 대답 안에서"(맥락 주입 · 다음 응답용)로 쓰여 있어, 이미 말하던 응답의
// 도중에 돌아오는 도구 결과에서는 "지금 다시 말하라"로 읽힌다.
//
// 판정표:
// | # | If | Then |
// |---|---|---|
// | 1 | 호출 경로가 모델 도구(`trigger: "model_tool"`) · 도착(announce 있음) | announce **앞에** 꼬리 1줄 |
// | 2 | 호출 경로가 모델 도구 · 거부 4종 | 거부 문면 **앞에** 꼬리 1줄 |
// | 3 | 백스톱(`trigger: "backstop"`) · 옛 클라(부재) · announce 없음(호 전환 뒤) | 그대로(이 문면은 다음 응답에 실리는 맥락 주입 · 턴 지시라 되풀이 대상이 없다) |
// ⛔ 문면은 서버 소유(G386) — 화면은 받은 `guidance`를 그대로 도구 응답에 싣는다.
import type { DeliverInCallSmsTrigger } from "./types";

/** 도구 결과를 받기 전 같은 응답에서 이미 한 말은 되풀이하지 않게 한다(조건형 — 아직 말하지 않았다면 뒤 안내대로 말한다). */
export const MODEL_TOOL_NO_REPEAT_LEAD =
  "(이 결과는 네가 말하던 응답의 도중에 돌아왔다. 결과를 받기 전에 이 응답에서 이미 한 말 · 요구는 말만 바꿔 다시 하지 마라. 이미 문자 이야기를 했다면 더 말하지 말고 곧바로 멈춰 상대의 대답을 기다려라. 아직 하지 않았다면 아래 안내대로만 짧게 말하라.)";

/** 판정표 1 · 2행 — 모델 도구 경로일 때만 꼬리를 앞에 붙인다. 값이 없으면(호 전환 뒤 announce 생략) 그대로 없다. */
export function withModelToolNoRepeat(
  guidance: string | undefined,
  trigger: DeliverInCallSmsTrigger | undefined,
): string | undefined {
  if (guidance === undefined || trigger !== "model_tool") return guidance;
  return `${MODEL_TOOL_NO_REPEAT_LEAD} ${guidance}`;
}
