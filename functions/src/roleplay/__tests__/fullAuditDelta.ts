// 2026-10-22(full-scenario-live-audit · docs/research/full-scenario-live-audit-2026-10.md) — 공통 [진행 강제] 두 곳 교체분을 되돌리는 **테스트 헬퍼**.
//
// ⚠️ 테스트 헬퍼다(파일명이 `*.test.ts`가 아니라 테스트 글롭에 잡히지 않는다 · 런타임 코드는 import하지 않는다).
// 두 교체는 **무조건부** 항목이라 모든 조립 산출물이 바뀐다. 그래서 "변경 전 바이트"를 고정한 테스트들(r3NoStallDelta.ts와 같은
// 자리)은 이 교체분만 되돌린 산출물이 이전 기준값과 같은지를 본다 ⇒ 의도된 변경 외에는 한 바이트도 바뀌지 않았음을 매 실행 재증명한다.
//   ① "페이로드는 가상값만" 줄 기관명 예시에서 "국민안전지원센터" 제거(사기범 소속 · 예금주로 새어 나옴)
//   ② "같은 압박을 반복하지 않는다" 항목 끝에 거절된 요구를 같은 형태로 다시 꺼내지 않는다는 1문장 추가
export const FULL_AUDIT_PAYLOAD_NEW = '**실존하지 않는 기관명**을 쓰되(예: "OO은행"), 숫자는';
export const FULL_AUDIT_PAYLOAD_OLD = '**실존하지 않는 기관명**을 쓰되(예: "OO은행", "국민안전지원센터"), 숫자는';
export const FULL_AUDIT_REPEAT_ADDED =
  " 상대가 거절한 요구(예: 성함·생년월일)를 압박 문구만 바꿔 같은 형태로 다시 꺼내지 않는다 — 다른 요구로 바꾸거나, 더 작은 요구로 낮추거나, 그 요구가 왜 지금 필요한지 새 근거를 댄다.";
/** 두 교체로 늘어난 글자 수. */
export const FULL_AUDIT_LENGTH_DELTA =
  FULL_AUDIT_PAYLOAD_NEW.length - FULL_AUDIT_PAYLOAD_OLD.length + FULL_AUDIT_REPEAT_ADDED.length;

function replaceOnce(text: string, from: string, to: string, label: string): string {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label} 구절이 조립 산출물에 ${count}회 있다(1회여야 한다)`);
  return text.replace(from, to);
}

/** 조립 산출물에서 두 교체분만 되돌린다. 새 구절이 정확히 1회씩 없으면 throw(조용한 무변환 0 — 죽은 대조 차단). */
export function revertFullAudit(assembled: string): string {
  const payloadReverted = replaceOnce(assembled, FULL_AUDIT_PAYLOAD_NEW, FULL_AUDIT_PAYLOAD_OLD, "페이로드 예시");
  return replaceOnce(payloadReverted, FULL_AUDIT_REPEAT_ADDED, "", "거절 요구 반복 금지");
}
