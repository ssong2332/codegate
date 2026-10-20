// R3-C ②-a(2026-10-20 · 감사 A R3 · 정본 Architecture §79.22 (6)) — NO_STALL_RULE 셋째 문장 교체분을 되돌리는 **테스트 헬퍼**.
//
// ⚠️ 테스트 헬퍼다(파일명이 `*.test.ts`가 아니라 테스트 글롭에 잡히지 않는다 · 런타임 코드는 import하지 않는다).
// NO_STALL_RULE은 **무조건부** 항목이라 모든 조립 산출물이 바뀐다. 그래서 "변경 전 바이트"를 고정한 테스트들(parcel G586 ·
// flowVariants §84.13.3 ② · smsGate T194-c-1 단계 4)은 이 교체분 **하나만** 되돌린 산출물이 이전 기준값과 같은지를 본다
// ⇒ 의도된 변경 외에는 한 바이트도 바뀌지 않았음을 매 실행 재증명한다. 기존 기준값은 고치지 않는다.
import { NO_STALL_RULE } from "../promptAssembly";

/** 지금 NO_STALL_RULE의 해당 구절(R3-C ②-a 정본 문면). */
export const R3C2_NEW_FRAGMENT =
  "결과를 알린 뒤에는, 상대에게 더 요구할 것이 남아 있으면 그 요구로 넘어가고, 더 요구할 것이 남지 않았으면 바로 위 통화 끝내기 항목이 정한 대로 한다";
/** main(ea97aa0)의 같은 구절. */
export const R3C2_OLD_FRAGMENT = "결과를 알린 뒤에는 곧바로 다음 요구로 넘어가고, 더 요구할 것이 없으면 바로 위 통화 끝내기 항목이 정한 대로 한다";
/** 교체로 늘어난 글자 수. */
export const R3C2_LENGTH_DELTA = R3C2_NEW_FRAGMENT.length - R3C2_OLD_FRAGMENT.length;

/** 조립 산출물에서 R3-C ②-a 교체분만 되돌린다. 새 구절이 정확히 1회 없으면 throw(조용한 무변환 0 — 죽은 대조 차단). */
export function revertR3C2(assembled: string): string {
  if (!NO_STALL_RULE.includes(R3C2_NEW_FRAGMENT)) throw new Error("R3C2_NEW_FRAGMENT가 NO_STALL_RULE에 없다 — 헬퍼가 낡았다");
  const count = assembled.split(R3C2_NEW_FRAGMENT).length - 1;
  if (count !== 1) throw new Error(`R3-C ②-a 구절이 조립 산출물에 ${count}회 있다(1회여야 한다)`);
  return assembled.replace(R3C2_NEW_FRAGMENT, R3C2_OLD_FRAGMENT);
}
