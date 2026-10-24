// 사기범(LLM) 대사의 실존 금융회사명 치환 — 텍스트 경로(sendMessage·오프닝) 출력 후처리. 순수 함수,
// 부수효과 0. ⚠️ `guardrails/index.ts`는 import 시 firebase-admin 초기화·트리거 정의가 따라오므로
// 호출부는 **이 파일을 직접** import한다(index.ts를 거치지 않는다).
//
// ⛔ **왜 필요한가**: 라이브 신고(2026-10-17, institutional-impersonation·중급·텍스트 폴백)에서 모델이
// "계좌번호는 '농협은행 352-0812-…', 예금주는 '국가안전관리처'입니다"라고 말했다. 프롬프트에는
// "실존하지 않는 기관명을 쓴다(예: OO은행)"가 이미 있었다 — 모델이 "OO"을 실제 은행 이름을 채울
// 빈칸으로 읽은 것으로 추정한다. 프롬프트 문면을 고쳤지만(promptAssembly.ts "페이로드는 가상값만"
// 줄) 문면은 확률적 지시라 **보증이 없다.** 이 모듈은 텍스트 경로의 **2차 방어**다 — 결정적이다.
//
// ⛔ **숫자는 건드리지 않는다**: 사기범 응답에 maskPII를 적용하지 않는다는 결정
// (`roleplay/scammerReplyMasking.ts` 헤더 — 모델은 참가자의 원문 PII를 입력으로 받지 않으며, 가짜
// 계좌번호를 "[계좌]"로 지우면 의도된 콘텐츠가 깨진다)을 그대로 유지한다. 이 모듈은 **이름만** 바꾼다.
//
// **치환하지 않는 것(비대상)과 이유**:
//   - `OO은행`·`OO카드` 자신 — 치환 결과가 다시 걸리지 않아야 멱등이다.
//   - 금융감독원·금감원·검찰·경찰·국세청 등 **사칭 대상 기관** — 사칭 대상이 콘텐츠 자체다
//     (`scenarios/__tests__/harmlessnessPatterns.ts` 프로파일 표: `assembledPrompt`·`scenarioContent`는
//     `realInstitutionName` ✗). 국민안전지원센터·국가안전관리처 같은 가상 기관명도 그대로 둔다.
//   - 우체국 — 금융 기능이 있지만 택배·통관 맥락(courier·parcel 시나리오)과 겹쳐 제외한다.
//   - 일반어와 겹치는 `국민`·`우리`·`하나`·`기업`·`제일`의 단독형과 띄어 쓴 형태("우리 은행" =
//     우리의 은행, "하나 카드", "우리 아들", "하나만 더", "국민 여러분", "제일 먼저") — 공백 허용
//     (`\s?`)은 고유 브랜드명에만 둔다.
//
// ⚠️ **한계**: (1) **Live 음성 경로(Gemini Live·ElevenLabs clone)는 오디오라 적용할 수 없다** — 그쪽은
// 프롬프트 문면이 유일한 층이다. (2) 잔여 범위: (2026-10-20 §85 — 저축은행·캐피탈·증권사·보험사·택배·통신·쇼핑몰은
// `realCompanyNames.ts`가 먼저 처리한다) 우체국·외국계 은행
// 지점명 등은 목록에 없다(늘릴 때는 이 표에 규칙과 양성 샘플을 함께 더한다 — 테스트가 표를 순회한다).
// (3) 한글 정규식에 JS `\b`를 쓰지 않는다(ASCII 경계 — T86 reviewer Major 1). 일반 낱말 안에 박히는
// 짧은 이름(`신한`·`신협`·`수협`)은 `(?<![가-힣])` 앞 경계로 막는다("당신한테"·"통신협회"·"인수협의").

import { replaceRealCompanyNames } from "./realCompanyNames";

export const FICTIONAL_BANK_NAME = "OO은행";
export const FICTIONAL_CARD_NAME = "OO카드";

export type RealFinancialNameRule = {
  /** 실패 메시지에 쓰는 규칙 이름. */
  label: string;
  /** 전부 `g`, 라틴 부분 대소문자 무시를 위해 `i`. */
  pattern: RegExp;
  replacement: string;
  /** 이 규칙만이 잡는 양성 샘플 — 앞선 규칙을 통과해 이 규칙에서 치환돼야 한다(생존 테스트). */
  sample: string;
};

function bank(label: string, source: string, sample: string): RealFinancialNameRule {
  return { label, pattern: new RegExp(source, "gi"), replacement: FICTIONAL_BANK_NAME, sample };
}

function card(label: string, source: string, sample: string): RealFinancialNameRule {
  return { label, pattern: new RegExp(source, "gi"), replacement: FICTIONAL_CARD_NAME, sample };
}

/** 한글 낱말 안에 박히지 않게 하는 앞 경계(`\b` 대용). */
const NOT_AFTER_HANGUL = "(?<![가-힣])";

/**
 * ⭐ **배열 순서가 곧 적용 순서다** — 카드사 → 농협 계열 긴 형태 → 은행. 긴 형태가 먼저 와야
 * "신한카드"가 `신한`(은행)에, "지역농협"이 `농협`에 먼저 잡혀 "OO은행카드"·"지역OO은행"이 되지 않는다.
 */
export const REAL_FINANCIAL_NAME_RULES: readonly RealFinancialNameRule[] = [
  // ── 카드사 → OO카드 ──
  card("국민카드", "(?:KB\\s?)?국민카드", "KB국민카드"),
  card("농협카드", "(?:NH\\s?)?농협카드", "NH농협카드"),
  card("NH카드", "NH카드", "NH카드"),
  card("신한카드", "신한\\s?카드", "신한카드"),
  card("삼성카드", "삼성\\s?카드", "삼성카드"),
  card("현대카드", "현대\\s?카드", "현대카드"),
  card("롯데카드", "롯데\\s?카드", "롯데카드"),
  card("하나카드", "하나카드", "하나카드"),
  card("우리카드", "우리카드", "우리카드"),
  card("BC카드", "(?:BC|비씨)\\s?카드", "BC카드"),
  card("씨티카드", "씨티\\s?카드", "씨티카드"),
  // ── 농협 계열(긴 형태 먼저) → OO은행 ──
  bank("지역·단위농협", "(?:지역|단위)\\s?농협", "지역농협"),
  bank("농축협", "농축협", "농축협"),
  bank("농협", "(?:NH\\s?)?농협(?:\\s?은행|중앙회)?", "NH농협은행"),
  // ── 은행 → OO은행 ──
  bank("국민은행", "(?:KB\\s?)?국민\\s?은행", "KB국민은행"),
  bank("KB국민", "KB\\s?국민", "KB국민"),
  bank("KB은행", "KB\\s?은행", "KB은행"),
  bank("신한은행", "신한\\s?은행", "신한은행"),
  bank("신한", `${NOT_AFTER_HANGUL}신한`, "신한"),
  bank("우리은행", "우리은행", "우리은행"),
  bank("하나은행", "(?:KEB\\s?)?하나은행", "KEB하나은행"),
  bank("KEB하나", "KEB\\s?하나", "KEB하나"),
  bank("IBK기업은행", "IBK\\s?기업(?:\\s?은행)?", "IBK기업은행"),
  // "중소기업은행"(정식 명칭)이 "중소OO은행"이 되지 않게 앞 수식어를 함께 먹는다.
  bank("기업은행", "(?:중소\\s?)?기업은행", "기업은행"),
  bank("IBK", "IBK", "IBK"),
  bank("KDB산업은행", "KDB\\s?산업(?:\\s?은행)?", "KDB산업은행"),
  // "한국산업은행"이 "한국OO은행"이 되지 않게 앞 수식어를 함께 먹는다.
  bank("산업은행", "(?:한국\\s?)?산업은행", "산업은행"),
  bank("KDB", "KDB", "KDB"),
  bank("수협", `${NOT_AFTER_HANGUL}(?:Sh\\s?)?수협(?:\\s?은행)?`, "Sh수협은행"),
  bank("신협", `${NOT_AFTER_HANGUL}신협`, "신협"),
  bank("새마을금고", "새마을\\s?금고", "새마을금고"),
  bank("카카오뱅크", "카카오\\s?뱅크", "카카오뱅크"),
  bank("카뱅", "카뱅", "카뱅"),
  bank("케이뱅크", "케이\\s?뱅크", "케이뱅크"),
  bank("K뱅크", "K\\s?뱅크", "K뱅크"),
  bank("토스뱅크", "토스\\s?뱅크", "토스뱅크"),
  bank("제일은행", "(?:SC\\s?)?제일은행", "SC제일은행"),
  bank("SC제일", "SC\\s?제일", "SC제일"),
  bank("SC은행", "SC\\s?은행", "SC은행"),
  // "스탠다드차타드은행"이 "OO은행은행"이 되지 않게 뒤 "은행"을 함께 먹는다.
  bank("스탠다드차타드", "스탠다드\\s?차타드(?:\\s?은행)?", "스탠다드차타드은행"),
  bank("씨티은행", "(?:한국\\s?)?[씨시]티\\s?은행", "한국씨티은행"),
  bank("부산은행", "(?:BNK\\s?)?부산\\s?은행", "BNK부산은행"),
  bank("경남은행", "(?:BNK\\s?)?경남\\s?은행", "BNK경남은행"),
  bank("대구은행", "(?:DGB\\s?)?대구\\s?은행", "DGB대구은행"),
  bank("iM뱅크", "iM\\s?뱅크", "iM뱅크"),
  bank("광주은행", "광주\\s?은행", "광주은행"),
  bank("전북은행", "전북\\s?은행", "전북은행"),
  bank("제주은행", "제주\\s?은행", "제주은행"),
  bank("한국은행", "한국은행", "한국은행"),
  // "한국수출입은행"이 "한국OO은행"이 되지 않게 앞 수식어를 함께 먹는다.
  bank("수출입은행", "(?:한국\\s?)?수출입은행", "한국수출입은행"),
];

/**
 * 실존 은행·카드사 이름을 `OO은행`/`OO카드`로 바꾼다. 숫자·기관명·일반어는 건드리지 않는다.
 * 치환이 0건이면 **입력 문자열을 그대로** 돌려준다.
 */
export function replaceRealFinancialNames(text: string): { text: string; replacedCount: number } {
  // §85 — 실존 민간 회사명(택배·통신·보험·증권·쇼핑몰·캐피탈·저축은행)을 **먼저** 바꾼다. 아래 은행 짧은
  // 규칙(`신한`·`IBK`·`농협`)이 "신한라이프"·"IBK캐피탈"을 "OO은행라이프"로 깨뜨리지 않게 하기 위해서다.
  const company = replaceRealCompanyNames(text);
  let replacedCount = company.replacedCount;
  let current = company.text;
  for (const rule of REAL_FINANCIAL_NAME_RULES) {
    current = current.replace(rule.pattern, () => {
      replacedCount += 1;
      return rule.replacement;
    });
  }
  return replacedCount === 0 ? { text, replacedCount: 0 } : { text: current, replacedCount };
}

/** §127 — 참가자가 먼저 말한 은행 · 카드사 이름을 사기범이 되받을 때 쓰는 중립 표현. */
export const USER_MENTIONED_BANK = "말씀하신 은행";
export const USER_MENTIONED_CARD = "말씀하신 카드사";
/** §132 — 바로 앞이 이미 "말씀하신(·하셨던) (그)"로 끝나는지. */
const ALREADY_USER_MENTIONED = /말씀\s*(?:하신|하셨던|주신)\s*(?:그\s*)?$/;

/**
 * ⭐ §127(DECISIONS #243 · 메인 세션 라이브 확인 2026-10-24 — 참가자 "국민은행이고 예금은 3천만원" → 사기범 "보담은행에 3천만 원") — 참가자가
 * **먼저 말한** 실존 은행 · 카드사 이름을 사기범이 되받으면, 가상 은행명(`replaceRealFinancialNames` → `applyFictionalBank`)이 아니라 중립 표현
 * ("말씀하신 은행")으로 바꾼다. 다른 이름으로 바꾸면 참가자가 말한 사실을 사기범이 틀리게 받아 대화가 어긋난다. 사기범이 **스스로 꺼낸** 실존명은
 * 그대로 종전 치환을 받는다(이 함수 다음에 `replaceRealFinancialNames`가 돈다). 순수 함수 · 치환 0이면 입력 그대로.
 */
export function neutralizeUserMentionedFinancialNames(
  reply: string,
  userTexts: readonly string[],
): { text: string; replacedCount: number } {
  let replacedCount = 0;
  let current = reply;
  for (const rule of REAL_FINANCIAL_NAME_RULES) {
    const probe = new RegExp(rule.pattern.source, rule.pattern.flags.replace("g", ""));
    if (!userTexts.some((t) => probe.test(t))) continue;
    const neutral = rule.replacement === FICTIONAL_CARD_NAME ? USER_MENTIONED_CARD : USER_MENTIONED_BANK;
    current = current.replace(new RegExp(rule.pattern.source, rule.pattern.flags), (...args: unknown[]) => {
      replacedCount += 1;
      // §132 — 모델이 이미 "말씀하신 국민은행"처럼 말했으면 "말씀하신"을 겹쳐 붙이지 않고 업종 이름만 남긴다.
      const offset = args.find((a, i) => i > 0 && typeof a === "number") as number;
      const before = current.slice(0, offset);
      return ALREADY_USER_MENTIONED.test(before) ? neutral.replace(/^말씀하신\s*/, "") : neutral;
    });
  }
  return replacedCount === 0 ? { text: reply, replacedCount: 0 } : { text: current, replacedCount };
}
