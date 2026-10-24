// §129(2026-10-24 에뮬레이터 점검 D1 · DECISIONS #245) — 받기 전에 끝난 통화의 오프닝을 "낭독되지 않음"으로 표시하는 순수 판정.
//
// 재현(에뮬레이터 · 카드사 초급): 통화 전 안내에서 '훈련 종료'(벨 전) → 리포트가 *"끝까지 지켰어요 · 시도된 수법 1가지(놀람 유발)"* ·
// 되짚어보기에 들린 적 없는 첫마디가 대사로 보였다. 오프닝 문서는 세션을 만들 때 저장되고, 낭독되지 않았다는 표시(`notSpoken`)는
// 실시간 전사 제출(`submitTranscript` · `openingNotSpoken`)에서만 붙는다 — 폴백 · 벨 전 종료에는 그 제출이 없다.
//
// | # | If(종료 시점 세션 문서 · 메시지) | Then |
// |---|---|---|
// | U1 | 메신저 세션이거나 메신저를 거친 세션(`channel !== "voice"` · `channelHistory` 있음) | 표시 안 함 — 첫 말풍선은 대화방에 보였다 |
// | U2 | 통화를 받은 기록이 있다(`answeredAt` — 폴백 첫 발화 · 실시간 전사 제출이 쓴다) | 표시 안 함 |
// | U3 | 참가자 메시지가 1건이라도 있다 | 표시 안 함 |
// | U4 | 그 외 | `turnIndex 0` 사기범 문서에 `notSpoken: true`(이미 있으면 그대로) |
// ⚠️ 한계(투명 고지): 텍스트 폴백에서 **받고 나서 한마디도 안 하고** 끝낸 통화는 서버에 받은 기록이 없어 U4에 든다 — 그때 들린 첫마디도
//    수법 목록에서 빠진다(리포트는 NS-2 "상대의 말에 답하기 전에 대화를 마쳤습니다"). 받은 시각은 클라만 안다(`play/page.tsx` — 이 변경 범위 밖).
// ⛔ 잎 모듈 — Firestore · LLM import 0(타입만). 쓰기는 호출부(`endSession`)가 한다.
import type { SessionDoc } from "../shared/types";

export function shouldMarkOpeningUnheard(
  session: Pick<SessionDoc, "channel" | "channelHistory" | "answeredAt">,
  userMessageCount: number,
): boolean {
  if ((session.channel ?? "voice") !== "voice" || (session.channelHistory ?? []).length > 0) return false; // U1
  if (session.answeredAt) return false; // U2
  if (userMessageCount > 0) return false; // U3
  return true; // U4
}
