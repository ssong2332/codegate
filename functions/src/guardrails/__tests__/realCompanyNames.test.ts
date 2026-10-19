// 사기범 대사 실존 민간 회사명 치환(guardrails/realCompanyNames.ts · Architecture §85) — 순수 함수 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compileCompanyRule,
  fixParticle,
  GENERIC_COURIER,
  GENERIC_INSURER,
  GENERIC_SECURITIES,
  GENERIC_SHOPPING,
  GENERIC_TELECOM,
  FICTIONAL_CAPITAL_PLACEHOLDER,
  FICTIONAL_SAVINGS_BANK_PLACEHOLDER,
  REAL_COMPANY_NAME_RULES,
  replaceRealCompanyNames,
} from "../realCompanyNames";
import { REAL_FINANCIAL_NAME_RULES, replaceRealFinancialNames } from "../realFinancialNames";
import { applyFictionalBank, fictionalOrgNamesFor, FICTIONAL_BANK_NAMES } from "../../shared/fictionalBank";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";

const ALLOWED_REPLACEMENTS = new Set([
  GENERIC_COURIER,
  GENERIC_TELECOM,
  GENERIC_INSURER,
  GENERIC_SECURITIES,
  GENERIC_SHOPPING,
  FICTIONAL_CAPITAL_PLACEHOLDER,
  FICTIONAL_SAVINGS_BANK_PLACEHOLDER,
]);

test("[신고 재현] courier 사기범의 실존 택배사명이 '택배사'로 바뀌고 조사가 받침에 맞는다", () => {
  assert.equal(
    replaceRealFinancialNames("CJ대한통운 통관팀입니다. CJ대한통운에서 관세 미납 건으로 연락드렸어요.").text,
    "택배사 통관팀입니다. 택배사에서 관세 미납 건으로 연락드렸어요.",
  );
  assert.equal(replaceRealFinancialNames("CJ대한통운이 맞습니다").text, "택배사가 맞습니다");
});

test("[생존] 모든 규칙이 자기 sample을 치환한다 — 앞선 회사 규칙이 가로채지 않는다 · 은행·카드 규칙이 결과를 다시 깨지 않는다", () => {
  assert.ok(REAL_COMPANY_NAME_RULES.length >= 50, `규칙 수(현재 ${REAL_COMPANY_NAME_RULES.length})`);
  for (let i = 0; i < REAL_COMPANY_NAME_RULES.length; i += 1) {
    const r = REAL_COMPANY_NAME_RULES[i]!;
    assert.ok(ALLOWED_REPLACEMENTS.has(r.replacement), `${r.label}: 치환값이 판정표 밖(${r.replacement})`);
    assert.doesNotMatch(r.source, /\((?!\?)/, `${r.label}: 캡처 그룹 금지(그룹 1은 조사 자리)`);
    let before = r.sample;
    for (const earlier of REAL_COMPANY_NAME_RULES.slice(0, i)) before = before.replace(compileCompanyRule(earlier), earlier.replacement);
    assert.equal(before, r.sample, `${r.label}: 앞선 규칙이 sample을 가로챘다 — 죽은 규칙`);
    const whole = replaceRealFinancialNames(r.sample);
    assert.equal(whole.text, r.replacement, `${r.label}: 공개 함수 결과(${whole.text})`);
    assert.equal(whole.replacedCount, 1, `${r.label}: 치환 건수`);
  }
});

test("[순서] 은행 짧은 규칙보다 먼저 — 신한라이프·IBK캐피탈·NH농협생명·신한투자증권이 'OO은행…'으로 깨지지 않는다", () => {
  const cases: Array<[string, string]> = [
    ["신한라이프", GENERIC_INSURER],
    ["IBK캐피탈", FICTIONAL_CAPITAL_PLACEHOLDER],
    ["NH농협생명", GENERIC_INSURER],
    ["NH농협캐피탈", FICTIONAL_CAPITAL_PLACEHOLDER],
    ["신한투자증권", GENERIC_SECURITIES],
    ["KB손해보험", GENERIC_INSURER],
    ["한국투자증권", GENERIC_SECURITIES],
  ];
  for (const [input, expected] of cases) assert.equal(replaceRealFinancialNames(input).text, expected, input);
  // 은행·카드 규칙 표본은 회사 규칙에 가로채이지 않는다.
  for (const r of REAL_FINANCIAL_NAME_RULES) assert.equal(replaceRealCompanyNames(r.sample).replacedCount, 0, `${r.label} 표본을 회사 규칙이 잡았다`);
});

test("[조사 보정] 받침이 다른 일반명으로 바뀌어도 이/가·은/는·을/를·과/와·으로/로·이에요/예요가 맞는다", () => {
  const cases: Array<[string, string]> = [
    ["CJ대한통운이 보냈어요", "택배사가 보냈어요"],
    ["CJ대한통운은요", "택배사는요"], // 리뷰 m5 — 구어 활용형
    ["CJ대한통운이요?", "택배사요?"],
    ["CJ대한통운이라도", "택배사라도"],
    ["삼성생명이고요", "보험사고요"],
    // 리뷰 m4 · QA — 업종 접미어 흡수(이중 접미어 방지)
    ["삼성생명보험에서 연락드렸습니다", "보험사에서 연락드렸습니다"],
    ["삼성증권사에서 왔습니다", "증권사에서 왔습니다"],
    ["한진택배사", "택배사"],
    ["미래에셋증권회사", "증권사"],
    // 리뷰 M3 — 보강한 상호
    ["러시앤캐시에서 대출", "OO캐피탈에서 대출"],
    ["SK브로드밴드는 아니고", "통신사는 아니고"],
    ["푸르덴셜생명입니다", "보험사입니다"],
    ["CJ대한통운을 통해", "택배사를 통해"],
    ["CJ대한통운과 통화", "택배사와 통화"],
    ["CJ대한통운으로 연락", "택배사로 연락"],
    ["CJ대한통운이에요.", "택배사예요."],
    ["CJ대한통운이라고 했어요", "택배사라고 했어요"],
    ["쿠팡으로 주문하셨죠", "쇼핑몰로 주문하셨죠"], // ㄹ 받침은 '로'
    ["쿠팡이 확인했어요", "쇼핑몰이 확인했어요"],
    ["11번가가 보냈어요", "쇼핑몰이 보냈어요"],
    ["11번가를 통해", "쇼핑몰을 통해"],
    ["11번가예요.", "쇼핑몰이에요."],
    ["삼성생명에서 왔습니다", "보험사에서 왔습니다"],
    ["키움증권은 아니고요", "증권사는 아니고요"],
    ["SK텔레콤이 차단했어요", "통신사가 차단했어요"],
    ["테무에서 주문하셨죠", "쇼핑몰에서 주문하셨죠"],
    ["티몬에서 결제", "쇼핑몰에서 결제"],
    ["케이티에서 연락", "통신사에서 연락"],
    ["KT엠모바일 쓰시죠", "통신사 쓰시죠"],
    ["U+유모바일로 바꾸셨죠", "통신사로 바꾸셨죠"],
    ["KB라이프생명입니다", "보험사입니다"],
    ["현대해상화재보험에서", "보험사에서"],
    ["참저축은행 계좌", "OO은행 계좌"],
    ["JT친애저축은행", "OO은행"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(replaceRealFinancialNames(input).text, expected, input);
  }
  // 한계(문서화 — OQ-A156): 목록 밖 활용형("이니까" 등)은 조사로 보지 않는다.
  assert.equal(replaceRealFinancialNames("CJ대한통운이니까").text, "택배사이니까");
  assert.equal(fixParticle("쇼핑몰", "으로"), "로");
  assert.equal(fixParticle("택배사", "으로"), "로");
  assert.equal(fixParticle("OO은행", "로"), "으로");
});

const NON_TARGETS = [
  // 정부·공공기관 — 사칭 대상이 콘텐츠 자체(기존 결정)
  "서울중앙지방검찰청 수사관입니다",
  "금융감독원",
  "경찰청",
  "국세청 환급",
  "관세청 통관",
  "국민건강보험공단",
  // 우체국(공공 — 오케스트레이터 결정)
  "우체국택배",
  "우체국 택배로 보냈어요",
  // 간편결제·플랫폼(범위 밖)
  "카카오페이",
  "네이버페이",
  "토스",
  "카카오톡으로 보내 드릴게요",
  "쿠팡이츠",
  "쿠팡페이",
  // 업종 접미어 없는 짧은 그룹명·일반어
  "삼성 쪽 휴대폰이요",
  "현대 자동차 할부",
  "롯데월드",
  "한진해운",
  "LG전자 서비스센터",
  "KTX 표",
  "KT&G",
  "하지 마켓에서",
  "택배사",
  "통신사",
  "보험사",
  "증권사",
  "쇼핑몰",
  "대신 택배로 보내 주세요",
  "일반 투자 증권 계좌",
  "온라인 옥션처럼",
  // 묶음 규칙은 붙여 쓴 형태만(일반어 보호)
  "우리 증권 계좌로 옮기세요",
  "하나 생명이라도 소중합니다",
  "한국 증권 시장이 흔들려요",
  "이지 모바일 뱅킹",
  "이야기 좀 해요",
  "찬스 드릴게요",
  "고려해 보세요",
  "참 저축은 중요해요",
  // 리뷰 M2 — 라틴 앞 경계
  "Data캐피탈",
  "aim캐피탈 말고",
  "ku+",
  "지유플러스",
  "U+3 단계",
  // 리뷰 m1~m3 · QA 오탐 표 — 낱말 일부·숫자·영문 뒤 경계
  "하나생명체가 살 수 있을까요",
  "삼성생명과학 연구소",
  "KB 라이프스타일",
  "한국증권거래소 직원입니다",
  "한국증권업협회",
  "테무진은 칭기즈칸의 이름",
  "티몬스터",
  "111번가에 사세요",
  "211번가 주소",
  "11 번가 버스 정류장",
  "롯데 online 주문",
  "롯데온라인 쇼핑",
  "이지모바일뱅킹",
  "딜라이브러리에서 책을", // 재리뷰 Minor 2
  "동부화재경보기",
  "삼성화재안전 점검",
];

test("[비대상] 정부·공공기관·우체국·간편결제·짧은 그룹명·일반어는 바뀌지 않는다", () => {
  for (const text of NON_TARGETS) {
    const result = replaceRealFinancialNames(text);
    assert.equal(result.text, text, `비대상이 바뀌었다: ${text} → ${result.text}`);
    assert.equal(result.replacedCount, 0, text);
  }
});

test("[멱등] 두 번 적용해도 결과가 같고 두 번째 치환은 0건", () => {
  for (const text of [...NON_TARGETS, ...REAL_COMPANY_NAME_RULES.map((r) => `${r.sample}에서 연락드렸습니다`)]) {
    const once = replaceRealFinancialNames(text);
    const twice = replaceRealFinancialNames(once.text);
    assert.equal(twice.text, once.text, text);
    assert.equal(twice.replacedCount, 0, once.text);
  }
});

test("[세션 가상명] 캐피탈·저축은행은 자리표시자 → 세션 가상명으로 이어진다(§83)", () => {
  const bank = FICTIONAL_BANK_NAMES[3]!;
  const { capitalName } = fictionalOrgNamesFor(bank);
  const masked = replaceRealFinancialNames("현대캐피탈 대출 · SBI저축은행 계좌").text;
  assert.equal(applyFictionalBank(masked, bank), `${capitalName} 대출 · ${bank} 계좌`);
});

test("[프롬프트] 전 시나리오 조립 결과에 실존 회사명 금지 1문장이 있다(Live 경로의 유일한 층)", () => {
  for (const [id, scenario] of Object.entries(SCENARIO_PROMPTS)) {
    const assembled = buildSystemPrompt(scenario, { difficultyLevel: "advanced", inCallSmsEnabled: true });
    assert.ok(assembled.includes("업종 이름(택배사·통신사·보험사·증권사·쇼핑몰)으로만 부른다"), id);
    // 프롬프트 자체에 실존 회사명이 없다(무해화)
    assert.equal(replaceRealCompanyNames(assembled).replacedCount, 0, `${id}: 프롬프트에 실존 회사명`);
  }
});
