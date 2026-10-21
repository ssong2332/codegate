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
// | "상대가 아직 말하지 않은 정보는"(기관형 [말투/톤] 줄) | 위 표 중 하나라도 바뀜 | "상대가 아직 말하지 않았고 [미리 확보한 상대 정보]에도 없는 정보는" |
// ── §93(2026-10-21 · 대상 확대 — 기관형 4종) — 같은 3갈래를 "불러주세요" · "부터 불러주세요" 원천에도 둔다 ──────────────────────────
// | "성함이랑 생년월일 불러주세요"(tax · asset · prosecution) | 이름 ∧ 생년월일 / 이름만 / 생년월일만 | 위 institution 3갈래와 같은 꼴(어미 "불러주세요") |
// | "성함이랑 생년월일부터 불러주세요"(bank) | 〃 | 〃(어미 "부터 불러주세요") |
// ── §93 — 협박형(anonymous)은 요구 예시가 아니라 **이름 단정 금지 · 되받기 지시**가 원천이다(카드 행이 있을 때만) ──────────────────
// | "**상대의 이름을 네가 먼저 말하거나 단정하지 않는다** — …"(IDENTITY_CHECK_HANDLING_FALSE) | 이름 또는 자녀 이름 | "[미리 확보한 상대 정보]에 적힌 이름 말고는 …" |
// | "상대가 먼저 말한 자녀 이름만 되받아 이미 다 알고 있는 척한다."(납치 고급 단계) | 자녀 이름 | "[미리 확보한 상대 정보]의 자녀 이름을 네가 먼저 대며 …" |
// | "상대가 먼저 말한 자녀 이름만 되받아 '○○이 지금 여기 있습니다' 처럼"(납치 고급 수법) | 자녀 이름 | "… 네가 먼저 대며 '{부르는 이름} 지금 여기 있습니다' 처럼" |
// | "학원 같은 장소는 '○○학원'처럼 가린 형태로만 말하고"(〃) | 자녀가 다니는 학원 | "학원은 목록에 있는 '{학원}'이라고만 말하고" |
// | "상대가 말하지 않은 이름은 지어내 단정하지 않는다."(〃) | 자녀 이름 | "상대가 말하지 않았고 [미리 확보한 상대 정보]에도 없는 이름은 …" |
import type { PersonaCardItem } from "../shared/types";

export const INSTITUTION_IDENTITY_DEMAND = "성함이랑 생년월일 불러주십시오";
export const NAME_FIRST_DEMAND = "성함부터 불러주세요";
export const NAME_ADDRESS_DEMAND = "성함이랑 주소부터 불러주세요";
/** §93 — 기관형 4종의 요구 예시(tax · asset · prosecution = 앞 · bank = 뒤). */
export const IDENTITY_DEMAND_PLAIN = "성함이랑 생년월일 불러주세요";
export const IDENTITY_DEMAND_FROM = "성함이랑 생년월일부터 불러주세요";
/** §93 — 협박형 원천(카드 행이 있을 때만 바뀐다). */
export const ANONYMOUS_NAME_CLAUSE = "**상대의 이름을 네가 먼저 말하거나 단정하지 않는다** — 너는 상대가 누구인지 이름으로 알지 못한다.";
export const ANONYMOUS_NAME_CLAUSE_WITH_CARD =
  "**[미리 확보한 상대 정보]에 적힌 이름 말고는 어떤 이름도 네가 먼저 말하거나 단정하지 않는다** — 그 목록 밖에서는 너는 상대가 누구인지 이름으로 알지 못한다.";
export const CHILD_ECHO_STAGE = "상대가 먼저 말한 자녀 이름만 되받아 이미 다 알고 있는 척한다.";
export const CHILD_ECHO_TACTIC = "상대가 먼저 말한 자녀 이름만 되받아 '○○이 지금 여기 있습니다' 처럼";
export const CHILD_ACADEMY_MASK = "학원 같은 장소는 '○○학원'처럼 가린 형태로만 말하고";
export const CHILD_NOT_SAID_CLAUSE = "상대가 말하지 않은 이름은 지어내 단정하지 않는다.";
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

/** 한글 끝 글자에 받침이 있는가(한글 음절 밖 = 거짓). */
function hasFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

/**
 * §93 — 협박범이 자녀를 부르는 꼴. 한글 3자면 성을 떼고(김민준 → 민준), 받침이 있으면 "이"를 붙인다(민준이 · 지우).
 * 리뷰 Minor 4 — 4자는 복성(남궁민준)일 수 있어 떼지 않는다. 그 밖(2자 · 영문)은 넣은 값 그대로. ⚠️ 3자 복성("남궁민")은 구분하지 못한다.
 * 리포트 판정 토큰(`report/personaBlock.ts` `childNameTokens`)이 같은 규칙을 쓴다 — 한쪽만 바꾸지 않는다.
 */
export function spokenChildName(value: string): string {
  const compact = value.replace(/ /g, "");
  const given = /^[가-힣]{3}$/.test(compact) ? compact.slice(1) : value;
  return /^[가-힣]+$/.test(given) && hasFinalConsonant(given) ? `${given}이` : given;
}

/**
 * 카드가 있는 세션의 조립 결과에서 신원 요구 예시를 확인형으로 바꾼다(위 판정표). 해당 항목이 없거나 원천 문구가 없으면 입력 그대로.
 * 원천 문구는 시나리오마다 하나씩만 있어 시나리오를 따로 가리지 않는다(협박형 원천은 기관형 프롬프트에 없다 — 테스트가 고정).
 */
export function applyPersonaCardIdentityConfirm(text: string, items: readonly PersonaCardItem[]): string {
  const name = items.find((item) => item.key === "name")?.value;
  const birthItem = items.find((item) => item.key === "birthDate") ?? items.find((item) => item.key === "birthYear");
  const birth = birthItem ? spokenBirth(birthItem) : undefined;

  const replacements: [string, string][] = [];
  if (name && birth) replacements.push([INSTITUTION_IDENTITY_DEMAND, `${name} 님 본인 맞으시죠? ${birth} 맞으시고요`]);
  else if (name) replacements.push([INSTITUTION_IDENTITY_DEMAND, `${name} 님, 생년월일 불러주십시오`]);
  else if (birth) replacements.push([INSTITUTION_IDENTITY_DEMAND, `${birth}이신 분, 성함 불러주십시오`]);
  // §93 — 기관형 4종(어미만 다른 같은 3갈래).
  for (const [source, ending] of [
    [IDENTITY_DEMAND_PLAIN, " 불러주세요"],
    [IDENTITY_DEMAND_FROM, "부터 불러주세요"],
  ] as const) {
    if (name && birth) replacements.push([source, `${name} 님 본인 맞으시죠? ${birth} 맞으시고요`]);
    else if (name) replacements.push([source, `${name} 님, 생년월일${ending}`]);
    else if (birth) replacements.push([source, `${birth}이신 분, 성함${ending}`]);
  }
  if (name) {
    replacements.push([NAME_FIRST_DEMAND, `${name} 님 본인 맞으시죠`]);
    replacements.push([NAME_ADDRESS_DEMAND, `${name} 님, 주소부터 불러주세요`]);
  }
  // §93 — 협박형(자녀 이름 · 내 이름). 이 줄들은 NOT_YET_SAID 꼬리를 켜지 않는다(기관형 [말투/톤] 줄이 없다).
  const childName = items.find((item) => item.key === "childName")?.value;
  const childAcademy = items.find((item) => item.key === "childAcademy")?.value;
  const threatReplacements: [string, string][] = [];
  if (name || childName) threatReplacements.push([ANONYMOUS_NAME_CLAUSE, ANONYMOUS_NAME_CLAUSE_WITH_CARD]);
  if (childName) {
    threatReplacements.push([CHILD_ECHO_STAGE, "[미리 확보한 상대 정보]의 자녀 이름을 네가 먼저 대며 이미 다 알고 있는 척한다."]);
    threatReplacements.push([
      CHILD_ECHO_TACTIC,
      `[미리 확보한 상대 정보]의 자녀 이름을 네가 먼저 대며 '${spokenChildName(childName)} 지금 여기 있습니다' 처럼`,
    ]);
    threatReplacements.push([CHILD_NOT_SAID_CLAUSE, "상대가 말하지 않았고 [미리 확보한 상대 정보]에도 없는 이름은 지어내 단정하지 않는다."]);
  }
  // 리뷰 Minor 5 — 받침에 따라 "이라고" · "라고"(지금 선택지는 전부 받침이지만 목록이 바뀌어도 깨지지 않게).
  const quote = childAcademy && hasFinalConsonant(childAcademy) ? "이라고만" : "라고만";
  if (childName && childAcademy) threatReplacements.push([CHILD_ACADEMY_MASK, `학원은 목록에 있는 '${childAcademy}'${quote} 말하고`]);

  let out = text;
  let changed = false;
  for (const [from, to] of replacements) {
    if (!out.includes(from)) continue;
    out = out.split(from).join(to);
    changed = true;
  }
  if (changed) out = out.split(NOT_YET_SAID_CLAUSE).join(NOT_YET_SAID_CLAUSE_WITH_CARD);
  for (const [from, to] of threatReplacements) out = out.split(from).join(to);
  return out;
}
