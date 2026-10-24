// §128(1)(2026-10-24 메인 세션 라이브 실측 — 자녀 사칭 카톡 고급 · 텍스트 폴백) — 사기범이 메신저 단계에서 **신호 없이** 전화를 예고한 턴.
// 재현: 설치 응낙 다음 대사 *"이제 보험 담당자가 전화로 이어서 안내해줄 거야. 담당자 연결되면 바로 받아줘"* — 전환 신호(`ESCALATE_VOICE`)가 없어
// 30초 넘게 전화가 오지 않았고, 다음 턴은 통화 없이 신분증 요구로 넘어갔다(대사와 화면이 어긋남).
//
// 판정표(`decideCallAnnouncement` — 메신저 단계 `sendMessage`만 부른다 · 신호 처리 뒤 · 저장 전):
// | # | If | Then |
// |---|---|---|
// | C0 | 이번 턴 전환 신호가 이미 받아들여졌다 | `none`(종전 — 신호가 전환한다) |
// | C1 | 대사에 곧 걸려 올 전화 예고(`CALL_ANNOUNCE` ∨ `CALL_NOW`)가 있고 나중 · 불가 표현(`LATER_CONTACT` · `CALL_UNAVAILABLE`)이 없다 ∧ 지금 전환할 수 있다 | `escalate`(트리거 `announced_call`) |
// | C2 | C1의 예고는 있는데 지금 전환할 수 없다(§122(7) 전환 하한 · 통화 단계 없는 세션 · 한도 · 끊기 신호) | `strip` — 예고 문장을 지운다(지우면 남는 문장이 없으면 `none`) |
// | C3 | 예고가 없다 | `none` |
// ⛔ 잎 모듈(같은 폴더 판정 정규식만 import) · 로그 0. 전환 자체(`transitionChannel`)는 호출부가 종전 자리에서 한다.
import { CALL_NOW, CALL_UNAVAILABLE, LATER_CONTACT } from "./signalConsistency";

/** C1 — 곧 걸려 올 전화를 예고하는 말(제3자 · 담당자가 거는 경우 포함). */
export const CALL_ANNOUNCE =
  /전화\s*(?:로|가|를)?\s*(?:이어서\s*|다시\s*|직접\s*|곧\s*|바로\s*)?(?:안내|설명|연락)\s*(?:해\s*줄|해\s*드릴|드릴|할|하겠|줄)|(?:전화|연락)\s*(?:가|이)\s*(?:곧\s*)?(?:갈|올)|(?:연결|전화)\s*(?:이|가)?\s*(?:되면|오면)\s*(?:바로\s*|꼭\s*|좀\s*)?받|전화\s*(?:좀\s*|꼭\s*|바로\s*)?받아\s*(?:줘|주세요|줄래|봐)|곧\s*(?:전화|연락)\s*(?:이|가|드|할|갈|올|줄)/;

/** C1 · C2의 "예고가 있다". */
export function announcesIncomingCall(text: string): boolean {
  if (LATER_CONTACT.test(text) || CALL_UNAVAILABLE.test(text)) return false;
  return CALL_ANNOUNCE.test(text) || CALL_NOW.test(text);
}

export type CallAnnouncementDecision = { action: "none" } | { action: "escalate" } | { action: "strip"; text: string };

/** 문장 단위로 나눈다(끝 문장부호 · 줄바꿈 뒤). */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!~…])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function decideCallAnnouncement(input: {
  replyText: string;
  /** 이번 턴 전환 신호가 받아들여졌는가(C0). */
  signalAccepted: boolean;
  /** 지금 전환할 수 있는가 — 메신저 단계 ∧ 통화 단계 있는 세션 ∧ 한도 아님 ∧ 전환 하한 통과 ∧ 끊기 신호 없음(호출부가 계산). */
  canEscalateNow: boolean;
}): CallAnnouncementDecision {
  if (input.signalAccepted) return { action: "none" }; // C0
  if (!announcesIncomingCall(input.replyText)) return { action: "none" }; // C3
  if (input.canEscalateNow) return { action: "escalate" }; // C1
  const kept = splitSentences(input.replyText).filter((sentence) => !announcesIncomingCall(sentence));
  return kept.length > 0 ? { action: "strip", text: kept.join(" ") } : { action: "none" }; // C2
}
