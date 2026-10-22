// 2026-10-22(full-scenario-live-audit · docs/research/full-scenario-live-audit-2026-10.md) — 공통 [진행 강제] 두 곳 교체분을 되돌리는 **테스트 헬퍼**.
//
// ⚠️ 테스트 헬퍼다(파일명이 `*.test.ts`가 아니라 테스트 글롭에 잡히지 않는다 · 런타임 코드는 import하지 않는다).
// 두 교체는 **무조건부** 항목이라 모든 조립 산출물이 바뀐다. 그래서 "변경 전 바이트"를 고정한 테스트들(r3NoStallDelta.ts와 같은
// 자리)은 이 교체분만 되돌린 산출물이 이전 기준값과 같은지를 본다 ⇒ 의도된 변경 외에는 한 바이트도 바뀌지 않았음을 매 실행 재증명한다.
//   ① "페이로드는 가상값만" 줄 기관명 예시에서 "국민안전지원센터" 제거(사기범 소속 · 예금주로 새어 나옴)
//   ② "같은 압박을 반복하지 않는다" 항목 끝에 거절된 요구를 같은 형태로 다시 꺼내지 않는다는 1문장 추가
import {
  HANGUP_EXHAUSTED_SENTENCE,
  HANGUP_NO_NEW_DEMAND_SENTENCE,
  LIVE_NO_IDLE_RULE,
  OFF_TOPIC_REPLY_SENTENCE,
  SMS_NOT_YET_SENT_SENTENCE,
} from "../promptAssembly";

export const FULL_AUDIT_PAYLOAD_NEW = '**실존하지 않는 기관명**을 쓰되(예: "OO은행"), 숫자는';
export const FULL_AUDIT_PAYLOAD_OLD = '**실존하지 않는 기관명**을 쓰되(예: "OO은행", "국민안전지원센터"), 숫자는';
//   ⭐ §104(2026-10-22 · 2차) — ②의 문장을 "바로 다음 대답에서는 다시 꺼내지 않는다 · 다른 카드를 쓴 뒤에만"으로 바꿨다(되돌림 대상은 새 문장 전체).
//   ③ §104 — Live 전용 2곳(조건형 · 있을 때만 걷어 낸다): 문자 도구 줄 끝 `SMS_NOT_YET_SENT_SENTENCE` · NO_STALL_RULE 뒤 `LIVE_NO_IDLE_RULE` 1항.
export const FULL_AUDIT_REPEAT_ADDED =
  " 상대가 거절한 요구(예: 성함·생년월일)는 압박 문구나 근거만 바꿔 바로 다음 대답에서 다시 꺼내지 않는다 — 그 대답에서는 다른 요구로 바꾸거나, 더 작은 요구로 낮추거나, 아직 쓰지 않은 다른 수법(불이익 암시·확인 절차 차단 등)으로 넘어간다. 거절된 요구는 그 사이에 다른 카드를 쓴 뒤에만 다시 꺼낸다.";
/** 두 교체로 늘어난 글자 수. */
// §104 — 전 경로 공통으로 늘 실리는 [대화 방식] 1문장(주변 이야기 받아치기)도 더한다(조건형 ③④는 NONE 조립에 없어 빼지 않는다).
export const FULL_AUDIT_LENGTH_DELTA =
  FULL_AUDIT_PAYLOAD_NEW.length - FULL_AUDIT_PAYLOAD_OLD.length + FULL_AUDIT_REPEAT_ADDED.length + OFF_TOPIC_REPLY_SENTENCE.length;

function replaceOnce(text: string, from: string, to: string, label: string): string {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label} 구절이 조립 산출물에 ${count}회 있다(1회여야 한다)`);
  return text.replace(from, to);
}

/** ③ §104 Live 전용 2곳 — 0회 또는 1회만 허용(2회 이상이면 throw). 조건형이라 없는 조립(폴백 · 오프닝)도 정상이다. */
function removeAtMostOnce(text: string, fragment: string, label: string): string {
  const count = text.split(fragment).length - 1;
  if (count > 1) throw new Error(`${label} 구절이 조립 산출물에 ${count}회 있다(0 또는 1회여야 한다)`);
  return count === 1 ? text.replace(fragment, "") : text;
}

/** 조립 산출물에서 교체분을 되돌린다. ①② 새 구절이 정확히 1회씩 없으면 throw(조용한 무변환 0 — 죽은 대조 차단). */
export function revertFullAudit(assembled: string): string {
  const payloadReverted = replaceOnce(assembled, FULL_AUDIT_PAYLOAD_NEW, FULL_AUDIT_PAYLOAD_OLD, "페이로드 예시");
  const repeatReverted = replaceOnce(payloadReverted, FULL_AUDIT_REPEAT_ADDED, "", "거절 요구 반복 금지");
  const smsReverted = removeAtMostOnce(repeatReverted, SMS_NOT_YET_SENT_SENTENCE, "문자 도착 전 완료형 금지");
  const idleReverted = removeAtMostOnce(smsReverted, `\n${LIVE_NO_IDLE_RULE}`, "Live 대기 말 금지");
  // ④ §104 — 끊기 슬롯 TOOL · SIGNAL의 두 경우 머리에 넣은 2문장(자금 소진 · 끊는 응답 새 요구 금지 — NONE 조립에는 없다).
  const exhaustReverted = removeAtMostOnce(idleReverted, HANGUP_EXHAUSTED_SENTENCE, "자금 소진 끊기");
  const newDemandReverted = removeAtMostOnce(exhaustReverted, HANGUP_NO_NEW_DEMAND_SENTENCE, "끊는 응답 새 요구 금지");
  // ⑤ §104 — [대화 방식] 첫 항목 끝 1문장(주변 이야기 받아치기 — 전 경로 공통이라 정확히 1회).
  return replaceOnce(newDemandReverted, OFF_TOPIC_REPLY_SENTENCE, "", "주변 이야기 받아치기");
}
