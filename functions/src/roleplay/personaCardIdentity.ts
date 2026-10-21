// 2026-10-21 사용자 실기 신고(라이브 main 676eeb3 · 기관 사칭 × 고급 Live · "내 정보" 카드에 생일 입력) — *"먼저 말하지는 않고
// 생년월일 말하라고 물어봤는데, 내가 의심하니까 먼저 말했어"*. AC-104: 카드가 있으면 사기범이 "이미 안다"를 **먼저** 보여 줘야 한다.
//
// 원인: 카드 대상 4종의 페르소나 [말투/톤] 줄과 "확인질문 재촉" 수법이 *"상대가 아직 말하지 않은 정보는 … 직접 불러달라고 요구한다
// ("성함이랑 생년월일 불러주십시오 …")"* 를 지시한다. [미리 확보한 상대 정보] 블록은 그 뒤에 "먼저 꺼내라"를 덧붙일 뿐이라, 모델이 앞의
// 구체 예시(요구형)를 따랐다 — T109 · §50.4.4와 같은 "같은 프롬프트 안의 정면 충돌".
// ⇒ 카드가 있는 세션은 조립 결과에서 그 **요구 예시를 카드 값 확인형으로 결정적으로 바꾼다**(모델 판단 0 — 프롬프트 지시보다 강한 층).
//    카드에 없는 항목은 그대로 요구한다(예: 이름만 넣었으면 생년월일은 계속 묻는다). 카드 부재 · 해당 항목 0 = 입력 그대로(바이트 동일).
//
// ── 치환 판정표(⛔ 이 표대로만 — 정확 일치 문자열. 원천 문구가 바뀌면 `__tests__/institutionAdvancedFlow.test.ts`의 원천 존재 단언이 실패한다) ───────
// | 요구 머리(원천) | 카드 항목 | 바꾼 꼴 |
// |---|---|---|
// | "성함이랑 생년월일 불러주십시오"(institution) | 이름 ∧ 생년월일/출생 연도 | "{이름} 님 본인 맞으시죠? {생년월일} 맞으시고요" |
// | 〃 | 이름만 | "{이름} 님, 생년월일 불러주십시오" (호칭형 — 확인 질문을 붙이면 T109 "한 차례 요구 1건" 위반) |
// | 〃 | 생년월일/출생 연도만 | "{생년월일}이신 분, 성함 불러주십시오" |
// | "성함부터 불러주세요"(card · loan) | 이름 | "{이름} 님 본인 맞으시죠" |
// | "성함이랑 주소부터 불러주세요"(courier) | 이름 | "{이름} 님, 주소부터 불러주세요" (사는 곳은 시 · 도라 주소 요구는 남긴다) |
// | "상대가 아직 말하지 않은 정보는"(4종 [말투/톤] 줄) | 위 표 중 하나라도 바뀜 | "상대가 아직 말하지 않았고 [미리 확보한 상대 정보]에도 없는 정보는" |
import type { PersonaCardItem } from "../shared/types";

export const INSTITUTION_IDENTITY_DEMAND = "성함이랑 생년월일 불러주십시오";
export const NAME_FIRST_DEMAND = "성함부터 불러주세요";
export const NAME_ADDRESS_DEMAND = "성함이랑 주소부터 불러주세요";
export const NOT_YET_SAID_CLAUSE = "상대가 아직 말하지 않은 정보는";
export const NOT_YET_SAID_CLAUSE_WITH_CARD = "상대가 아직 말하지 않았고 [미리 확보한 상대 정보]에도 없는 정보는";

/** 사기범이 줄여 말하는 생년월일 꼴 — "1965년 3월 2일생" → "65년 3월 2일생" · "1965년생" → "65년생". 형식 밖은 그대로. */
export function spokenBirth(item: Pick<PersonaCardItem, "key" | "value">): string {
  const date = /^(\d{4})년 (\d{1,2})월 (\d{1,2})일생$/.exec(item.value);
  if (item.key === "birthDate" && date) return `${date[1]!.slice(2)}년 ${date[2]}월 ${date[3]}일생`;
  const year = /^(\d{4})년생$/.exec(item.value);
  if (item.key === "birthYear" && year) return `${year[1]!.slice(2)}년생`;
  return item.value;
}

/**
 * 카드가 있는 세션의 조립 결과에서 신원 요구 예시를 확인형으로 바꾼다(위 판정표). 해당 항목이 없거나 원천 문구가 없으면 입력 그대로.
 */
export function applyPersonaCardIdentityConfirm(text: string, items: readonly PersonaCardItem[]): string {
  const name = items.find((item) => item.key === "name")?.value;
  const birthItem = items.find((item) => item.key === "birthDate") ?? items.find((item) => item.key === "birthYear");
  const birth = birthItem ? spokenBirth(birthItem) : undefined;

  const replacements: [string, string][] = [];
  if (name && birth) replacements.push([INSTITUTION_IDENTITY_DEMAND, `${name} 님 본인 맞으시죠? ${birth} 맞으시고요`]);
  else if (name) replacements.push([INSTITUTION_IDENTITY_DEMAND, `${name} 님, 생년월일 불러주십시오`]);
  else if (birth) replacements.push([INSTITUTION_IDENTITY_DEMAND, `${birth}이신 분, 성함 불러주십시오`]);
  if (name) {
    replacements.push([NAME_FIRST_DEMAND, `${name} 님 본인 맞으시죠`]);
    replacements.push([NAME_ADDRESS_DEMAND, `${name} 님, 주소부터 불러주세요`]);
  }

  let out = text;
  let changed = false;
  for (const [from, to] of replacements) {
    if (!out.includes(from)) continue;
    out = out.split(from).join(to);
    changed = true;
  }
  return changed ? out.split(NOT_YET_SAID_CLAUSE).join(NOT_YET_SAID_CLAUSE_WITH_CARD) : out;
}
