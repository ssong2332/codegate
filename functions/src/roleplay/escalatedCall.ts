// A-1 ⑧(2026-10-19 · audit-B 1일차 #2) — 메신저→통화 에스컬레이션 **뒤의 텍스트 폴백**에서 전화 예고를 되풀이하지 않게.
//
// 재현(messenger-subsidy-smishing-sms 중급 · 폴백): S3에서 `[[SIGNAL:ESCALATE_VOICE]]`로 채널이 voice로 넘어간 뒤에도
// 사기범이 "상담원이 곧바로 전화드릴게요"·"직접 전화드리겠습니다. 잠시만 기다려 주세요"를 5연속 말했다(전화는 이미
// 넘어왔다). 원인 두 갈래:
//   ① 페르소나의 [에스컬레이션] 규칙("그럼 상담원이 직접 전화드릴게요"라며 통화로 넘어가려 한다)은 채널이 이미 voice여도
//      그대로 실리고, 모델은 자기가 이미 통화 중이라는 사실을 모른다(폴백 프롬프트에 채널 정보가 없다).
//   ② 설치 응낙 턴 지시(`MOCK_INSTALL_CONSENT_INSTRUCTION`)가 "이제 담당자가 전화로 이어서 안내하겠다고 말하라"를
//      채널과 무관하게 싣는다.
// ⇒ 채널이 에스컬레이션으로 voice가 된 세션의 **폴백 턴**에만 ① 맥락 1줄을 싣고 ② 응낙 지시를 통화 중 변형으로 바꾼다.
// ⛔ Live(실시간)는 이 경로가 아니다 — 폴백(`sendMessage`)만 부른다. ⛔ 채널 전이 판정(`transitionChannel` · 구조화 신호)은
//    무접촉이다. ⛔ 잎 모듈(타입 import만).
import type { ChannelTransitionEntry, MessengerChannel } from "../shared/types";

/**
 * 판정표:
 * | If | Then |
 * |---|---|
 * | `channel !== "voice"` | `false`(메신저 단계 · 채널 미표기 보이스 세션) |
 * | 전이 기록에 messenger→voice가 없다 | `false`(처음부터 통화로 시작한 세션 — 예고할 일이 애초에 없다) |
 * | 그 외 | `true` |
 */
export function isEscalatedVoiceCall(
  channel: MessengerChannel | undefined,
  channelHistory: readonly ChannelTransitionEntry[] | undefined,
): boolean {
  if (channel !== "voice") return false;
  return (channelHistory ?? []).some((entry) => entry.from === "messenger" && entry.to === "voice");
}

/** 에스컬레이션 뒤 폴백 턴의 맥락 1줄(서버 소유 · 횟수 0 · 따옴표 대사 예시 0). */
export const ESCALATED_CALL_CONTEXT_INSTRUCTION =
  "(이 대화는 이미 전화 통화로 넘어와 있다 — 지금 너는 상대와 통화하고 있다. 전화를 걸겠다거나 전화드리겠다거나 연결될 때까지 기다려 달라는 말을 다시 하지 말고, 이 통화 안에서 하던 안내를 바로 이어간다.)";
