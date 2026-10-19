// 사기범(LLM) 대사의 실존 **민간 회사명**(택배·통신·보험·증권·쇼핑몰·캐피탈·저축은행) 치환 —
// `realFinancialNames.ts`의 연장(2026-10-20 · Architecture §85). 순수 함수 · 부수효과 0.
//
// ⛔ **왜 필요한가**: scenario-review B 2일차에서 courier(택배 통관) 사기범이 프롬프트 금지("실제 택배사명
// 금지")에도 실존 택배사 이름을 말했다. 은행·카드 가드레일 밖이라 그대로 나갔다. 문면은 확률적 지시라
// 보증이 없다 — 이 모듈은 텍스트 경로의 **2차 방어**다(결정적).
//
// **치환값(판정표 §85.0 — 오케스트레이터 승인 2026-10-20)**:
//   - 캐피탈 → "OO캐피탈", 저축은행 → "OO은행" — 바로 뒤 `applyFictionalBank`가 세션 가상명으로 바꾼다(§83).
//   - 택배·물류 → "택배사" · 통신사 → "통신사" · 보험사 → "보험사" · 증권사 → "증권사" · 쇼핑몰 → "쇼핑몰"(일반명).
// **비대상**: 정부·공공기관(검찰청·금감원·경찰청·국세청·관세청·공단) · 우체국(택배 포함 — 공공, 기존 결정) ·
//   간편결제·메신저 플랫폼(카카오페이·네이버페이·토스·카카오톡 — 메신저 화면 자체가 그 표면) · 업종 접미어가 없는
//   짧은 그룹명 단독형(삼성·현대·롯데·한진·SK·LG — 일반 대화·다른 업종과 겹친다).
//
// ⭐ **조사 보정**: 일반명은 원래 이름과 받침이 다를 수 있다("CJ대한통운이" → "택배사이"는 틀린다). 일반명 규칙은
// 바로 뒤 조사(이/가 · 은/는 · 을/를 · 과/와 · 으로/로 · 이랑/랑 · 이라고/라고 · 이에요/예요 · 이요/요 · 은요/는요 ·
// 이고요/고요 · 이라도/라도)를 함께 잡아
// 치환값의 받침에 맞게 고친다. 조사 뒤에 한글이 이어지면(다른 낱말의 일부) 조사로 보지 않는다.
//
// ⚠️ **한계**: (1) Live 음성 경로는 오디오라 적용할 수 없다 — 프롬프트 문면(`promptAssembly.ts` "페이로드는
// 가상값만" 줄)이 유일한 층이다. (2) 통화 뒤 저장되는 Live 전사에는 적용하지 않는다(후속 후보 — Tasks).
// (3) 조사 보정은 위 목록만 — "이니까"·"이지만" 같은 그 밖의 활용형은 고치지 않는다. (4) 사전 밖 상호(소형 택배사·
// 알뜰폰 소형 사업자 등)와 일반어와 같은 상호(옥션 = 경매)는 그대로 나간다 — 늘릴 때는 규칙과 양성 샘플을 함께 더한다(테스트가 표를 순회한다).

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
