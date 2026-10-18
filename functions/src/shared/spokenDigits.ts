// 참가자가 "불러 준" 숫자열 규칙 — 리포트 판정과 인증번호 대조가 **같은 규칙**을 쓰도록 한 곳에 둔다
// (2026-10-18, Architecture §78). 정규식 원문은 `report/analyzeConversation.ts` (D3)·(D4)에서 옮겨 왔고
// 한 글자도 바꾸지 않았다 — 그 파일은 여기서 import한다(판정 동작 무변경, verdictRegression 테스트가 고정).
//
// (D3) 숫자열 + 짧은 어미 — 4자리 이상, 사이에 공백·하이픈 허용("0 4 8 2 3 1", "048-231"). 뒤가 끝·문장부호·
//      허용 어미일 때만 연다. 단위(원·만·년·호·시)나 조사(로·에)가 오면 코드가 아니다("1332로 전화해 볼게요").
// (D4) 한글 숫자(음성 전사) — 붙여 읽기("공사팔이삼일")·한 자씩 띄어 읽기("공 사 팔 …")·세 자 이상 묶음
//      ("공사팔 이삼일"). 공·영·육·칠·팔·구 중 하나 이상을 요구해 일반 단어("사이사이", "이삼일")를 피한다.
// ⛔ `g` 플래그를 붙이지 말 것 — `.test()`가 lastIndex를 이어 써서 같은 답변이 번갈아 다르게 판정된다
//    (전역 탐색이 필요하면 `extractSpokenCodes`처럼 그 자리에서 새 RegExp를 만든다).

export const CODE_DIGITS_WITH_ENDING =
  /(?<!\d)\d(?:[\s-]?\d){3,}(?=\s*(?:$|[.!?~,…]|이요|요|입니다|이에요|예요|이고|이구|번이요|번입니다|맞|이죠|이지요|인데요|이거든|이라고|라고))/;

const HANGUL_DIGIT = "[공영일이삼사오육륙칠팔구]";
const HANGUL_COMMON_DIGIT = "[일이삼사오]"; // 일반 단어에도 흔한 숫자 음절
const HANGUL_RARE_DIGIT = "[공영육륙칠팔구]"; // 하나 이상 있어야 숫자 읽기로 본다
const HANGUL_CODE_END = "(?=$|[\\s.!?~,…]|요|입니다|에요|예요|고요|구요|번|맞)";
export const CODE_HANGUL_DIGITS = new RegExp(
  [
    // 붙여 읽기 — "공사팔이삼일(이요)"
    `(?<![가-힣])(?=${HANGUL_COMMON_DIGIT}*${HANGUL_RARE_DIGIT})${HANGUL_DIGIT}{4,}${HANGUL_CODE_END}`,
    // 한 자씩 띄어 읽기 — "공 사 팔 이 삼 일"
    `(?<![가-힣])(?=(?:${HANGUL_COMMON_DIGIT}\\s)*${HANGUL_RARE_DIGIT})${HANGUL_DIGIT}(?:\\s${HANGUL_DIGIT}){3,}${HANGUL_CODE_END}`,
    // 세 자 이상씩 묶어 읽기 — "공사팔 이삼일"
    `(?<![가-힣])(?=(?:${HANGUL_COMMON_DIGIT}|\\s)*${HANGUL_RARE_DIGIT})${HANGUL_DIGIT}{3,}(?:\\s${HANGUL_DIGIT}{3,})+${HANGUL_CODE_END}`,
  ].join("|"),
);

const HANGUL_TO_DIGIT: Record<string, string> = {
  공: "0", 영: "0", 일: "1", 이: "2", 삼: "3", 사: "4", 오: "5", 육: "6", 륙: "6", 칠: "7", 팔: "8", 구: "9",
};

/**
 * ⚠️ 알려진 한계: 한글 숫자 끝 음절이 어미와 겹치는 경우는 "이"+"요"만 처리한다("…삼구요" 같은 다른 겹침은 숫자로 먹는다).
 *
 * 발화에서 (D3)·(D4)로 잡히는 숫자열을 **아라비아 숫자만 남긴 문자열**로 돌려준다(공백·하이픈 제거, 한글 숫자 변환).
 * 없으면 빈 배열. 예: "공 사 팔 이 삼 일이요" → ["048231"], "048-231이요" → ["048231"], "1332로 전화" → [].
 */
export function extractSpokenCodes(text: string): string[] {
  const codes: string[] = [];
  const add = (raw: string): void => {
    const digits = [...raw].map((ch) => (/\d/.test(ch) ? ch : (HANGUL_TO_DIGIT[ch] ?? ""))).join("");
    if (digits.length >= 4 && !codes.includes(digits)) codes.push(digits);
  };
  for (const pattern of [CODE_DIGITS_WITH_ENDING, CODE_HANGUL_DIGITS]) {
    for (const m of text.matchAll(new RegExp(pattern.source, "g"))) {
      add(m[0]);
      // 한글 숫자 끝의 "이"는 어미 "이요"의 "이"일 수 있다("공사팔이삼일이요" = 048231 + 이요). 정규식은 탐욕적이라
      // "이"까지 숫자(2)로 먹으므로, 뒤가 "요"면 "이"를 뺀 후보도 함께 낸다(둘 중 하나라도 맞으면 일치로 본다).
      const after = text.slice((m.index ?? 0) + m[0].length);
      if (m[0].endsWith("이") && /^요/.test(after)) add(m[0].slice(0, -1));
    }
  }
  return codes;
}
