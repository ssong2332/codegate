// 실시간 통화(Gemini Live) 자막 · 전사 거르기 — 화면 쪽 (2026-11-07 · Edge 시나리오 시험 판 3 · 16 · 23).
//
// 판정표 정본은 서버 사본 `functions/src/realtime/liveTranscriptGuard.ts` 머리 주석이다(S1 ~ S3 · S2b · S2c · U1 · U2). 이 파일은 통화 자막 ·
// 메모리 전사(재연결 주입 · 새로고침 백업 · 제출)가 화면을 떠나기 전에 같은 판정을 적용한다(서버가 저장 전에 한 번 더 거른다).
// ⛔ 아래 "사본 시작" ~ "사본 끝" 구간은 서버 사본과 **글자까지 같아야 한다**(`liveTranscriptGuard.test.ts`가 대조한다).
// ⛔ "회사명 표 사본" 구간은 서버 `functions/src/guardrails/realCompanyNames.ts`의 `export const GENERIC_COURIER` 줄부터 파일 끝까지와 글자까지 같다
//    (같은 테스트가 대조한다 · 표를 고칠 때는 서버 파일을 먼저 고치고 이 구간을 통째로 다시 복사한다). 루트 테스트가 이 파일을 직접 실행하므로
//    다른 모듈을 값으로 import하지 않고 한 파일에 둔다.

// ── 회사명 표 사본 시작 ──
export const GENERIC_COURIER = "택배사";
export const GENERIC_TELECOM = "통신사";
export const GENERIC_INSURER = "보험사";
export const GENERIC_SECURITIES = "증권사";
export const GENERIC_SHOPPING = "쇼핑몰";
export const FICTIONAL_CAPITAL_PLACEHOLDER = "OO캐피탈";
export const FICTIONAL_SAVINGS_BANK_PLACEHOLDER = "OO은행";

export type RealCompanyNameRule = {
  label: string;
  /** 회사명 부분(조사 제외). 비캡처 그룹만 쓴다 — 캡처 그룹 1은 조사 자리다. */
  source: string;
  replacement: string;
  /** 이 규칙만이 잡는 양성 샘플(조사 없이) — 생존 테스트. */
  sample: string;
};

/** 한글 낱말 안에 박히지 않게 하는 앞 경계. */
const NOT_AFTER_HANGUL = "(?<![가-힣])";
/** 라틴 약칭이 다른 영문 낱말의 일부가 아니게(KTX·KT&G 등). */
const LATIN_START = "(?<![A-Za-z0-9])";
const LATIN_END = "(?![A-Za-z0-9&])";

function rule(label: string, source: string, replacement: string, sample: string): RealCompanyNameRule {
  return { label, source, replacement, sample };
}
const courier = (label: string, source: string, sample: string) => rule(label, source, GENERIC_COURIER, sample);
const telecom = (label: string, source: string, sample: string) => rule(label, source, GENERIC_TELECOM, sample);
const insurer = (label: string, source: string, sample: string) => rule(label, source, GENERIC_INSURER, sample);
const securities = (label: string, source: string, sample: string) => rule(label, source, GENERIC_SECURITIES, sample);
const shopping = (label: string, source: string, sample: string) => rule(label, source, GENERIC_SHOPPING, sample);
const capital = (label: string, source: string, sample: string) => rule(label, source, FICTIONAL_CAPITAL_PLACEHOLDER, sample);
const savings = (label: string, source: string, sample: string) => rule(label, source, FICTIONAL_SAVINGS_BANK_PLACEHOLDER, sample);

/**
 * ⭐ 배열 순서가 곧 적용 순서다. 이 표 전체가 `REAL_FINANCIAL_NAME_RULES`(은행·카드)보다 **먼저** 적용된다 —
 * 은행 짧은 규칙(`신한`·`IBK`·`농협`)이 "신한라이프"·"IBK캐피탈"·"NH농협생명"을 "OO은행라이프"로 깨뜨리지 않게.
 * 출처·상호 목록은 Architecture §85.1.
 */
export const REAL_COMPANY_NAME_RULES: readonly RealCompanyNameRule[] = [
  // ── 택배·물류 → 택배사 (한국통합물류협회 "국토부 인정 택배 운송사업자" 20곳 · §85.1) ──
  courier("CJ대한통운", "(?:CJ|씨제이)\\s?대한통운(?:\\s?택배)?", "CJ대한통운"),
  courier("대한통운", `${NOT_AFTER_HANGUL}대한통운(?:\\s?택배)?`, "대한통운"),
  courier("CJ택배", "(?:CJ|씨제이)\\s?(?:택배|로지스틱스)", "CJ택배"),
  courier("한진택배", "한진\\s?택배", "한진택배"),
  courier("롯데글로벌로지스", "롯데\\s?(?:글로벌\\s?)?로지스", "롯데글로벌로지스"),
  courier("롯데택배", "롯데\\s?택배", "롯데택배"),
  courier("로젠택배", "로젠\\s?택배", "로젠택배"),
  courier("경동택배", "경동\\s?(?:택배|물류)", "경동택배"),
  // 일반어와 겹치는 어간(대신·합동·고려·천일·건영·성화)은 붙여 쓴 형태만 — "대신 택배로"(부사+명사)를 잡지 않는다.
  courier("대신택배", `${NOT_AFTER_HANGUL}대신(?:택배|정기화물)`, "대신택배"),
  courier("합동택배", `${NOT_AFTER_HANGUL}합동(?:택배|물류)`, "합동택배"),
  courier("고려택배", `${NOT_AFTER_HANGUL}고려택배`, "고려택배"),
  courier("천일택배", `${NOT_AFTER_HANGUL}천일택배`, "천일택배"),
  courier("건영택배", `${NOT_AFTER_HANGUL}건영(?:택배|화물)`, "건영택배"),
  courier("성화기업택배", `${NOT_AFTER_HANGUL}성화(?:기업)?택배`, "성화기업택배"),
  courier("일양로지스", "일양\\s?(?:로지스|택배)", "일양로지스"),
  courier("용마로지스", "용마\\s?로지스", "용마로지스"),
  courier("동진특송", "동진\\s?특송", "동진특송"),
  courier("SLX택배", "(?:SLX|에스엘엑스)\\s?택배", "SLX택배"),
  courier("로지스밸리택배", "로지스밸리\\s?택배", "로지스밸리택배"),
  courier("컬리넥스트마일", "컬리\\s?넥스트\\s?마일", "컬리넥스트마일"),
  courier("편의점택배", "(?:CVSnet|씨브이에스넷|GS\\s?postbox|GS\\s?포스트박스|CU\\s?post)", "CVSnet"),
  courier("쿠팡로지스틱스", "쿠팡\\s?(?:로지스틱스(?:\\s?서비스)?|로켓\\s?배송|CLS)", "쿠팡로지스틱스"),
  // ── 통신사 → 통신사 (MNO 3사 · 알뜰폰허브 입점 브랜드 · §85.1) ──
  // ⭐ 알뜰폰(라틴 접두)이 먼저 — "KT엠모바일"·"U+유모바일"이 KT·U+ 규칙에 "통신사엠모바일"로 깨지지 않게.
  telecom("알뜰폰(라틴 접두)", "(?:LG\\s?헬로|U\\+\\s?(?:유|알뜰)|SK\\s?세븐|KT\\s?(?:엠|M))\\s?모바일", "KT엠모바일"),
  telecom("KT스카이라이프", "(?:KT\\s?)?스카이라이프", "KT스카이라이프"),
  // "…모바일"이 붙여 쓴 형태만(이야기·찬스·이지 등 일반어 단독·띄어 쓴 형태는 잡지 않는다).
  telecom("알뜰폰(한글)", `${NOT_AFTER_HANGUL}(?:헬로|세븐|이야기|리브|고고|아시아|아이즈|이지|인스|찬스|토스|슈가|유)모바일(?!뱅킹)`, "헬로모바일"),
  telecom("SK텔링크", "(?:SK|에스케이)\\s?텔링크", "SK텔링크"),
  telecom("SK텔레콤", "(?:SK|에스케이)\\s?텔레콤", "SK텔레콤"),
  telecom("SKT", `${LATIN_START}SKT${LATIN_END}`, "SKT"),
  // 리뷰 M2 — "지유플러스"·"ku+"·"U+3"을 잡지 않게 앞뒤 경계.
  telecom("LG유플러스", `${NOT_AFTER_HANGUL}${LATIN_START}(?:LG\\s?|엘지\\s?)?(?:유플러스|U\\+(?![0-9]))`, "LG유플러스"),
  // 재QA — 야구팀 "KT 위즈"는 잡지 않는다.
  telecom("KT", `${LATIN_START}KT${LATIN_END}(?!\\s?위즈)`, "KT"),
  telecom("케이티", `${NOT_AFTER_HANGUL}케이티`, "케이티"),
  // 리뷰 M3 — 케이블·인터넷(MSO) 사업자.
  telecom("MSO", `${NOT_AFTER_HANGUL}${LATIN_START}(?:(?:SK|에스케이)\\s?브로드밴드|LG\\s?헬로비전|헬로비전|딜라이브(?!러리)|HCN)`, "SK브로드밴드"),
  // ⚠️ 아래 묶음 규칙(보험·증권·캐피탈·저축은행)은 어간과 업종 접미어를 **붙여 쓴 형태만** 잡는다 — "우리 증권 계좌"·"하나 생명"·"한국 증권 시장" 같은 일반어를 지키기 위해서다.
  // ── 보험사 → 보험사 (생명보험협회 정회원 20 · 손해보험협회 정회원 15 · §85.1) ──
  insurer(
    "생명보험사",
    // 리뷰 m1·QA — "하나생명체"·"삼성생명과학"을 잡지 않게 뒤 낱말 제외 · 리뷰 M3 — 푸르덴셜·ING·오렌지라이프.
    `${NOT_AFTER_HANGUL}${LATIN_START}(?:삼성|한화|교보|흥국|동양|미래에셋|KDB|DB|동부|ABL|메트라이프|라이나|AIA|하나|푸본현대|처브|iM|DGB|BNP\\s?파리바\\s?카디프|카디프|KB|신한|IBK|NH\\s?농협|농협|NH|푸르덴셜|ING|오렌지\\s?라이프)(?:라이프\\s?)?생명(?!체|과학|공학|윤리|력)`,
    "삼성생명",
  ),
  insurer("라이프(생보)", `${NOT_AFTER_HANGUL}${LATIN_START}(?:(?:신한|KB|교보|처브|iM|메트)\\s?라이프(?:\\s?플래닛)?|오렌지\\s?라이프)(?!스타일|사이클)`, "신한라이프"),
  insurer(
    "손해보험사",
    `${NOT_AFTER_HANGUL}${LATIN_START}(?:삼성|현대|한화|롯데|흥국|메리츠|KB|DB|동부|하나|NH\\s?농협|농협|AXA|악사|AIG|카카오페이|신한\\s?EZ|MG|예별|더케이|LIG)(?:화재(?:\\s?해상)?|해상(?:\\s?화재)?|손해\\s?보험|손보)(?:\\s?보험)?(?!경보|안전)`,
    "삼성화재",
  ),
  insurer("서울보증보험", "(?:SGI\\s?)?서울\\s?보증\\s?보험|SGI\\s?서울\\s?보증", "서울보증보험"),
  insurer("IBK연금보험", "IBK\\s?연금\\s?보험", "IBK연금보험"),
  // ── 증권사 → 증권사 (금융투자협회 정회원 증권 60 · §85.1) ──
  securities("금융투자(옛 이름)", "(?:신한|하나|DB|NH|한화)\\s?금융\\s?투자", "신한금융투자"),
  securities(
    "증권사",
    // QA — "한국증권거래소"·"한국증권업협회"를 잡지 않게 한국은 "한국투자" 형태만 · 거래소·협회 제외.
    `${NOT_AFTER_HANGUL}${LATIN_START}(?:미래에셋(?:대우)?|키움|삼성|대신|한화|교보|유진|현대차|토스|카카오페이|신영|한양|부국|상상인|케이프|유안타|DB|LS|이베스트|iM|하이|IBK|BNK|SK|KB|NH|한국\\s?투자|신한|하나|메리츠|다올|KTB|KR|DS|흥국|유화|리딩|코리아에셋|우리|엔에이치|아이비케이|비엔케이|엘에스|에스케이|아이엠|케이알)(?:투자\\s?)?증권(?!거래소|업\\s?협회)`,
    "키움증권",
  ),
  // ── 쇼핑몰 → 쇼핑몰 (공식 단일 목록 없음 — 공정위·서울시 조사 대상 주요 플랫폼 · §85.1) ──
  // 쿠팡이츠(배달)·쿠팡페이(간편결제 — 범위 밖)·쿠팡플레이는 건드리지 않는다.
  shopping("쿠팡", `${NOT_AFTER_HANGUL}쿠팡(?!\\s?(?:이츠|페이|플레이|파이낸셜))`, "쿠팡"),
  // 리뷰 m3 — "111번가"·"11 번가(정류장)"를 잡지 않게 숫자 앞 경계 · 붙여 쓴 형태만.
  shopping("11번가", "(?<![0-9])(?:11|십일)번가", "11번가"),
  shopping("G마켓", `${LATIN_START}G\\s?마켓|Gmarket`, "G마켓"),
  // 한글 표기는 붙여 쓴 형태만 — "하지 마켓"의 "지 마켓"을 잡지 않는다.
  shopping("지마켓", `${NOT_AFTER_HANGUL}지마켓`, "지마켓"),
  shopping("SSG닷컴", "(?:SSG|쓱)\\s?닷컴|SSG\\.COM", "SSG닷컴"),
  shopping("롯데온", `롯데\\s?ON${LATIN_END}|롯데온(?!라인)`, "롯데온"),
  shopping("알리익스프레스", "알리\\s?익스프레스|AliExpress", "알리익스프레스"),
  shopping("테무", `${NOT_AFTER_HANGUL}테무(?!진)|${LATIN_START}Temu${LATIN_END}`, "테무"),
  shopping("위메프", `${NOT_AFTER_HANGUL}위메프`, "위메프"),
  shopping("티몬", `${NOT_AFTER_HANGUL}티몬(?!스터)`, "티몬"),
  shopping("인터파크", `${NOT_AFTER_HANGUL}인터파크`, "인터파크"),
  shopping("무신사", `${NOT_AFTER_HANGUL}무신사`, "무신사"),
  shopping("마켓컬리", `${NOT_AFTER_HANGUL}마켓\\s?컬리`, "마켓컬리"),
  // ── 캐피탈 → OO캐피탈(세션 가상명 · 여신금융협회 리스·할부금융사 50 · §85.1) ──
  // "JB우리캐피탈"이 "JBOO캐피탈"이 되지 않게 JB 형태가 먼저다.
  capital("JB우리캐피탈", "JB\\s?우리\\s?캐피[탈털]", "JB우리캐피탈"),
  capital("현대커머셜", "현대\\s?커머셜", "현대커머셜"),
  capital("쿠팡파이낸셜", "쿠팡\\s?파이낸셜", "쿠팡파이낸셜"),
  // 리뷰 M3 — 대출 시나리오에 나올 법한 대부업·소비자금융 상호(대형 등록대부업체).
  capital("대부업", `${NOT_AFTER_HANGUL}(?:러시\\s?앤\\s?캐시|산와\\s?머니|리드코프|아프로\\s?파이낸셜)`, "러시앤캐시"),
  capital(
    "캐피탈사",
    // 리뷰 M2 — "Data캐피탈"·"a캐피탈"을 잡지 않게 라틴 앞 경계.
    `${NOT_AFTER_HANGUL}${LATIN_START}(?:현대|KB|신한|IBK|NH\\s?농협|농협|롯데|하나|우리\\s?금융|우리|BNK|메리츠|산은|아이엠|iM|애큐온|오케이|OK|한국\\s?투자|한국\\s?자산|한국|DB|KGM|KG|MG|HB|NBH|무궁화|무림|에코|코스모|제이엠|JM|아주|DGB|JT|A)캐피[탈털]`,
    "현대캐피탈",
  ),
  // ── 저축은행 → OO은행(세션 가상명 · 저축은행중앙회 79곳 · §85.1) — "저축은행" 접미어 필수 ──
  savings(
    "저축은행",
    `${NOT_AFTER_HANGUL}${LATIN_START}(?:JT\\s?친애|키움\\s?YES|상상인\\s?플러스|우리\\s?금융|동원\\s?제일|머스트\\s?삼일|한국\\s?투자|BNK|CK|DB|DH|HB|IBK|JT|KB|NH|OK|OSB|SBI|고려|국제|금화|남양|다올|대명|대백|대신|대아|대원|대한|더케이|동양|드림|라온|라인|모아|민국|바로|부림|삼정|삼호|상상인|세람|센트럴|솔브레인|스마트|스카이|스타|신한|아산|안국|안양|애큐온|에스앤티|엠에스|영진|예가람|오성|오투|우리|웰컴|유니온|유안타|융창|인성|인천|조은|조흥|진주|참|청주|키움|페퍼|평택|푸른|하나|한성|한화|흥국)저축\\s?은행`,
    "SBI저축은행",
  ),
];

/** 조사 쌍 [받침 있을 때, 받침 없을 때]. 긴 것 먼저(정규식 대안 순서). */
const PARTICLE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["이에요", "예요"],
  // 리뷰 m5 · QA — 구어 활용형("CJ대한통운이요?" → "택배사요?").
  ["이고요", "고요"],
  ["이라도", "라도"],
  ["이요", "요"],
  ["은요", "는요"],
  ["이라고", "라고"],
  ["이랑", "랑"],
  ["으로", "로"],
  ["은", "는"],
  ["이", "가"],
  ["을", "를"],
  ["과", "와"],
];
const PARTICLE_ALTERNATION = PARTICLE_PAIRS.flat()
  .slice()
  .sort((a, b) => b.length - a.length)
  .join("|");

/** 마지막 글자의 받침 — 0이면 없음, 8이면 ㄹ. 한글이 아니면(라틴·숫자) 받침 없음으로 본다. */
function finalConsonant(word: string): number {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return 0;
  return code % 28;
}

/** 치환값의 받침에 맞는 조사. */
export function fixParticle(noun: string, particle: string): string {
  const pair = PARTICLE_PAIRS.find(([withFinal, withoutFinal]) => particle === withFinal || particle === withoutFinal);
  if (!pair) return particle;
  const final = finalConsonant(noun);
  if (pair[0] === "으로") return final === 0 || final === 8 ? "로" : "으로";
  return final === 0 ? pair[1] : pair[0];
}

/**
 * 리뷰 m4 · QA — 일반명과 겹치는 업종 접미어를 함께 먹는다("삼성생명보험" → "보험사보험", "삼성증권사" → "증권사사"가 되지 않게).
 */
const ABSORBED_SUFFIX: Readonly<Record<string, string>> = {
  [GENERIC_COURIER]: "(?:사|회사)?",
  [GENERIC_INSURER]: "(?:\\s?보험)?(?:사|회사)?",
  [GENERIC_SECURITIES]: "(?:사|회사)?",
};

/** 규칙의 실행 정규식 — 회사명 + (업종 접미어) + (선택) 조사. 조사 뒤에 한글이 이어지면 조사로 보지 않는다. */
export function compileCompanyRule(r: RealCompanyNameRule): RegExp {
  const suffix = ABSORBED_SUFFIX[r.replacement] ?? "";
  return new RegExp(`(?:${r.source})${suffix}(?:(${PARTICLE_ALTERNATION})(?![가-힣]))?`, "gi");
}

const COMPILED = REAL_COMPANY_NAME_RULES.map((r) => ({ rule: r, pattern: compileCompanyRule(r) }));

/** 실존 민간 회사명을 일반명·가상 자리표시자로 바꾼다(조사 보정 포함). 0건이면 입력 그대로. */
export function replaceRealCompanyNames(text: string): { text: string; replacedCount: number } {
  let replacedCount = 0;
  let current = text;
  for (const { rule: r, pattern } of COMPILED) {
    pattern.lastIndex = 0;
    current = current.replace(pattern, (_match: string, particle: string | undefined) => {
      replacedCount += 1;
      return r.replacement + (particle ? fixParticle(r.replacement, particle) : "");
    });
  }
  return replacedCount === 0 ? { text, replacedCount: 0 } : { text: current, replacedCount };
}
// ── 회사명 표 사본 끝 ──

// ── 은행 · 카드 표 사본 시작 ──
// 2026-11-08(라이브 재시험 9 · 판정 S2b · S2c) — 서버 `functions/src/guardrails/realFinancialNames.ts`의 `export const FICTIONAL_BANK_NAME` 줄부터 파일 끝까지와
// 글자까지 같다. 단 `NOT_AFTER_HANGUL` 선언 두 줄(설명 줄 포함)만 뺀다 — 위 회사명 표 사본이 같은 값으로 이미 선언했다(같은 테스트가 대조한다).
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
 * §132.10(메인 라이브 관찰 2026-10-24 — "말씀하신 은행 계좌라고 말씀하셨는데…") — 이름 뒤 같은 문장 안에서 이미 참가자 발언을 가리킨다
 * ("…라고 말씀하셨는데" · "…이라고 하셨죠" · "…말씀하신 대로"). 그때는 "말씀하신" 대신 "그"로 받는다("그 은행 계좌라고 말씀하셨는데").
 */
const USER_ATTRIBUTION_AFTER = /^[^.?!\n]{0,16}?(?:말씀\s*하(?:셨|신|시)|(?:이)?라고\s*하(?:셨|신|시))/;

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
      if (ALREADY_USER_MENTIONED.test(before)) return neutral.replace(/^말씀하신\s*/, "");
      const after = current.slice(offset + String(args[0]).length);
      return USER_ATTRIBUTION_AFTER.test(after) ? neutral.replace(/^말씀하신/, "그") : neutral;
    });
  }
  return replacedCount === 0 ? { text: reply, replacedCount: 0 } : { text: current, replacedCount };
}
// ── 은행 · 카드 표 사본 끝 ──

// ── 사본 시작 ──
/** S1 — 겹대괄호 표식. 닫는 `]]`가 없어도(끼어들기로 잘린 조각) 줄 끝까지면 지운다. */
const CONTROL_MARKER = /\[\[[^[\]\n]{0,80}(?:\]\]|$)/g;

/** 비밀번호를 말로 묻는 문장(R9 판정표 P의 동사 + 통화에서 묻는 말투 — 어떻게 · 뭐 · 확인 · 되시). 인증번호는 대상이 아니다. */
const PASSWORD_ASK =
  /(?:비밀\s?번호|비번|보안\s?카드|핀\s?번호|PIN)[^.?!\n]{0,24}(?:입력|눌러|누르|불러|알려|말씀|말해|적어|넣어|쳐|확인|어떻게|뭐|무엇|되시|되세요|되나요|주시겠|주세요|부탁)/i;

/** U1 — 아라비아 숫자 3개 이상 묶음(사이 공백 · 줄표 · 점 · 쉼표 허용). */
const DIGIT_RUN = /\d(?:[\s\-.,·]*\d){2,}/g;
/** U1 — 한 글자 한자어 숫자 3개 이상 묶음("일 이 삼 사" · "일이삼사요"). 앞뒤가 다른 한글 낱말이면 숫자로 보지 않는다(뒤 어미는 남긴다). */
const SPOKEN_DIGIT_RUN = /(?<![가-힣])[공영일이삼사오육칠팔구](?:[\s,·\-]*[공영일이삼사오육칠팔구]){2,}(?=(?:이?요|예요|이에요|입니다|이고요?|번이?요?)?(?![가-힣]))/g;

export const PASSWORD_MASK = "[비밀번호]";

/** S1. 지울 것이 없으면 원문 그대로. */
export function stripControlMarkers(text: string): string {
  if (!text.includes("[[")) return text;
  return text.replace(CONTROL_MARKER, " ").replace(/[ \t]{2,}/g, " ").replace(/ +([.,?!])/g, "$1").trim();
}

/** 사기범 줄이 비밀번호를 말로 묻는가(U1의 조건). */
export function asksPasswordAloud(scammerLine: string | undefined): boolean {
  return typeof scammerLine === "string" && PASSWORD_ASK.test(scammerLine);
}

/** U1 · U2. */
export function guardLiveUserLineWith(text: string, previousScammerLine: string | undefined): string {
  if (!asksPasswordAloud(previousScammerLine)) return text;
  const masked = text.replace(DIGIT_RUN, PASSWORD_MASK).replace(SPOKEN_DIGIT_RUN, PASSWORD_MASK);
  return masked === text ? text : masked;
}

/** 실명 치환 한 쌍 — 서버 = `guardrails/realFinancialNames.ts`(회사명 표 포함) · 화면 = 같은 표의 사본. */
export type LiveRealNameReplacers = {
  /** S2b — 참가자가 먼저 말한 은행 · 카드사 → "말씀하신 은행/카드사". */
  neutralizeUserMentioned: (text: string, userTexts: readonly string[]) => { text: string };
  /** S2 · S2c — 실존 회사명 → 업종 이름 · 실존 은행 · 카드사 → "OO은행/OO카드". */
  replaceRealNames: (text: string) => { text: string };
};

/** S1 ~ S3. `userTexts` = 같은 통화에서 이 줄보다 앞선(같은 flush 포함) 참가자 줄 원문. */
export function guardLiveScammerLineWith(text: string, userTexts: readonly string[], replace: LiveRealNameReplacers): string {
  const stripped = stripControlMarkers(text);
  return replace.replaceRealNames(replace.neutralizeUserMentioned(stripped, userTexts).text).text;
}
// ── 사본 끝 ──

const CLIENT_REPLACERS: LiveRealNameReplacers = {
  neutralizeUserMentioned: neutralizeUserMentionedFinancialNames,
  replaceRealNames: replaceRealFinancialNames,
};

/** 화면 — 사기범 줄(S1 ~ S3). `userTexts` = 같은 통화의 앞선(같은 flush 포함) 참가자 줄(S2b 입력 · 없으면 S2b 0건). */
export function guardLiveScammerLine(text: string, userTexts: readonly string[] = []): string {
  return guardLiveScammerLineWith(text, userTexts, CLIENT_REPLACERS);
}

/** 화면 — 참가자 줄(U1 · U2). */
export function guardLiveUserLine(text: string, previousScammerLine: string | undefined): string {
  return guardLiveUserLineWith(text, previousScammerLine);
}
