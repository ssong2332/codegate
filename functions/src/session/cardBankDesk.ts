// ⭐ 2026-11-09 사용자 결정 "고치기"(라이브 재시험 15 E2) — 은행 사칭(직접 확인) 고급 · 카드 = 실제 은행(판정표 BK3)이면 첫마디는 "저희 은행 금융사고대응팀"인데
// 넘김 창구 이름 · 수신 표시 · 넘겨받은 담당자 자기소개 · 리포트 넘김 문구가 "새솔은행 금융사고대응 확인창구"였다 — BK3에서 세션 은행이 가상으로
// 남고(보호계좌 문자용) 창구 이름의 자리표시 "○○은행"이 그 이름으로 바뀌었다(순수 함수 — Firestore · LLM import 0).
//
// 판정표 BD — 넘김 창구 이름(앞 행이 먼저).
// | # | If | Then |
// |---|---|---|
// | BD1 | 카드 거래 은행 = 실제 은행(카드 행 값 `PERSONA_BANK_UNNAMED_VALUE` · BK3 · BK5) ∧ 문면에 은행 창구 자리표시("○○은행 금융사고대응 확인창구") | 그 자리를 `NAMELESS_BANK_DESK_LABEL`("금융사고대응 확인창구")로 — 창구 이름 · 수신 표시 · 첫 담당자 안내 · 넘겨받은 담당자 지시 · 전환 상태 줄 · 리포트 문구가 같은 값 |
// | BD2 | 그 밖(카드 0 · 은행 칸 0 · 가상 은행 BK2 · BK4) | 종전(`applyFictionalBank` — 바이트 무변경) |
// | BD3 | 같은 문면의 다른 "○○은행"(보호계좌 · 계좌 문자 등) | BD1과 무관 — 세션 가상 은행 그대로(사용자 결정 "보호계좌는 가상 은행 그대로") |
// ⚠️ 표기 "금융사고대응 확인창구"는 이름 없는 표기 제안이다("저희 은행 금융사고대응 확인창구"는 수신 표시 · 리포트에서 '저희'의 주어가 어색해 뺐다).
//    은행 사칭 계열에만 이 자리표시가 있다(다른 시나리오 창구는 은행 이름이 없다 — 카드사 · 캐피탈 · 센터).
import { PERSONA_BANK_UNNAMED_VALUE } from "../scenarios/personaCardCatalog";
import { applyFictionalBank } from "../shared/fictionalBank";
import type { PersonaCardItem } from "../shared/types";

export const NAMELESS_BANK_DESK_LABEL = "금융사고대응 확인창구";
const BANK_DESK_PLACEHOLDER = /[Oo○Ｏｏ]{2}\s?은행 금융사고대응 확인창구/g;

/** BK3 · BK5 — 카드 거래 은행이 실제 은행(이름 없음)인가. */
export function cardBankUnnamed(items: readonly PersonaCardItem[] | undefined): boolean {
  return items?.some((item) => item.key === "bank" && item.value === PERSONA_BANK_UNNAMED_VALUE) === true;
}

/** BD1 · BD2 — 창구 이름 자리를 먼저 정한 뒤 세션 가상 은행 치환(종전). `fictionalBankName` 부재 = 자리표시 치환 0(종전). */
export function applySessionBankText(text: string, fictionalBankName: string | undefined, unnamedCardBank: boolean): string {
  const desk = unnamedCardBank ? text.replace(BANK_DESK_PLACEHOLDER, NAMELESS_BANK_DESK_LABEL) : text;
  return fictionalBankName ? applyFictionalBank(desk, fictionalBankName) : desk;
}
