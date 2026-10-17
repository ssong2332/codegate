// 사기범 대사 실존 금융회사명 치환(guardrails/realFinancialNames.ts) — 순수 함수 직접 테스트.
// 라이브 신고(2026-10-17): 모델이 "계좌번호는 '농협은행 352-0812-…'"처럼 실존 은행명을 붙였다.
// ⚠️ 이 파일은 `guardrails/index.ts`를 import하지 않는다(firebase-admin 초기화가 따라온다).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FICTIONAL_BANK_NAME,
  FICTIONAL_CARD_NAME,
  REAL_FINANCIAL_NAME_RULES,
  replaceRealFinancialNames,
} from "../realFinancialNames";

test("[신고 재현] 실존 은행명만 OO은행으로 바뀌고 계좌번호·가상 예금주는 그대로다", () => {
  const input = "계좌번호는 '농협은행 352-0812-4471-63', 예금주는 '국가안전관리처'입니다.";
  const result = replaceRealFinancialNames(input);
  assert.equal(result.text, "계좌번호는 'OO은행 352-0812-4471-63', 예금주는 '국가안전관리처'입니다.");
  assert.equal(result.replacedCount, 1);
});

test("[생존] 표의 모든 규칙이 자기 sample을 실제로 치환한다 — 앞선 규칙이 가로채지 않는다", () => {
  assert.ok(REAL_FINANCIAL_NAME_RULES.length >= 40, `규칙 수(현재 ${REAL_FINANCIAL_NAME_RULES.length})`);
  for (let i = 0; i < REAL_FINANCIAL_NAME_RULES.length; i += 1) {
    const rule = REAL_FINANCIAL_NAME_RULES[i];
    assert.ok(rule.pattern.global, `${rule.label}: g 플래그가 없다`);
    // 앞선 규칙들을 먼저 적용해도 sample이 그대로여야 한다(= 이 규칙이 파이프라인에서 살아 있다).
    let before = rule.sample;
    for (const earlier of REAL_FINANCIAL_NAME_RULES.slice(0, i)) {
      before = before.replace(earlier.pattern, earlier.replacement);
    }
    assert.equal(before, rule.sample, `${rule.label}: 앞선 규칙이 sample을 가로챘다 — 죽은 규칙이다`);
    assert.equal(
      rule.sample.replace(rule.pattern, rule.replacement),
      rule.replacement,
      `${rule.label}: 자기 sample(${rule.sample})을 통째로 치환하지 못한다`,
    );
    // 공개 함수 전체 경로로도 같은 결과다.
    const whole = replaceRealFinancialNames(rule.sample);
    assert.equal(whole.text, rule.replacement, `${rule.label}: 공개 함수 결과가 다르다`);
    assert.equal(whole.replacedCount, 1, `${rule.label}: 치환 건수가 1이 아니다`);
  }
});

test("[치환값] 카드사는 OO카드, 은행·농협 계열은 OO은행으로 바뀐다", () => {
  assert.equal(FICTIONAL_BANK_NAME, "OO은행");
  assert.equal(FICTIONAL_CARD_NAME, "OO카드");
  for (const rule of REAL_FINANCIAL_NAME_RULES) {
    assert.ok(
      rule.replacement === FICTIONAL_BANK_NAME || rule.replacement === FICTIONAL_CARD_NAME,
      `${rule.label}: 치환값이 가상 이름이 아니다`,
    );
  }
});

const NON_TARGETS = [
  "OO은행",
  "OO카드",
  "국민안전지원센터",
  "국가안전관리처",
  "금융감독원",
  "금감원",
  "검찰",
  "경찰",
  "국세청",
  "우체국",
  "우리 아들",
  "하나만 더",
  "국민 여러분",
  "제일 먼저",
  // 앞 경계(`(?<![가-힣])`)가 막는 일반 낱말 — `신한`·`신협`·`수협`이 낱말 안에 박힌 경우.
  "당신한테 불리합니다",
  "자신한테 물어보세요",
  "확신한다고요?",
  "통신협회에서 연락드렸습니다",
  "인수협의가 끝났습니다",
];

test("[비대상] 사칭 대상 기관·가상 기관·일반어·우체국은 바뀌지 않는다(입력 그대로 반환)", () => {
  for (const text of NON_TARGETS) {
    const result = replaceRealFinancialNames(text);
    assert.equal(result.text, text, `비대상이 바뀌었다: ${text} → ${result.text}`);
    assert.equal(result.replacedCount, 0, `비대상 치환 건수: ${text}`);
  }
});

test("[숫자 무변경] 숫자열은 그대로이고 [계좌] 같은 토큰이 생기지 않는다", () => {
  const samples = [
    "948-2716-5093-27",
    "352-0812-4471-63",
    "1234567890123",
    "주민번호 900101-1234567 불러 주세요",
    "신한은행 110-234-567890으로 3,000,000원 보내세요.",
  ];
  for (const text of samples) {
    const result = replaceRealFinancialNames(text);
    const digitsIn = text.match(/\d/g)?.join("") ?? "";
    const digitsOut = result.text.match(/\d/g)?.join("") ?? "";
    assert.equal(digitsOut, digitsIn, `숫자가 바뀌었다: ${text}`);
    assert.ok(!result.text.includes("[계좌]"), `[계좌] 토큰이 생겼다: ${result.text}`);
  }
  assert.equal(
    replaceRealFinancialNames("신한은행 110-234-567890으로 3,000,000원 보내세요.").text,
    "OO은행 110-234-567890으로 3,000,000원 보내세요.",
  );
});

test("[치환 0건] 입력 문자열을 그대로 돌려준다", () => {
  const input = "지금 바로 확인해 주셔야 합니다.";
  const result = replaceRealFinancialNames(input);
  assert.equal(result.text, input);
  assert.equal(result.replacedCount, 0);
});

const REPRESENTATIVE = [
  "신한카드에서 결제 승인이 났고 신한은행 계좌로 옮기셔야 해요.",
  "지역농협이든 단위 농협이든 NH농협은행이든 다 막혔습니다.",
  "KB국민카드 말고 KB국민은행, 그리고 KB 국민 쪽도 확인했어요.",
  "스탠다드차타드은행, SC제일은행, 한국씨티은행 전부 조회됐습니다.",
  "IBK기업은행, 중소기업은행, KDB산업은행, 한국산업은행, 한국수출입은행도요.",
  "카카오뱅크나 카뱅, 케이뱅크, 토스뱅크, Sh수협은행, 신협, 새마을금고도 마찬가지예요.",
  "BNK부산은행, DGB대구은행, iM뱅크, 광주은행, 전북은행, 제주은행, 한국은행까지요.",
  "농협카드랑 NH카드, 하나카드, 우리카드, BC카드, 씨티카드 다 정지됩니다.",
];

test("[겹침 이상형] 대표 입력에서 OO은행은행·지역OO은행·OO은행카드 같은 결과가 나오지 않는다", () => {
  const ODD = [/OO은행은행/, /OO카드카드/, /OO은행카드/, /OO카드은행/, /지역OO은행/, /단위OO은행/, /[가-힣]OO은행/, /OOO/];
  for (const text of REPRESENTATIVE) {
    const result = replaceRealFinancialNames(text);
    assert.ok(result.replacedCount > 0, `대표 입력이 하나도 치환되지 않았다: ${text}`);
    for (const odd of ODD) {
      assert.ok(!odd.test(result.text), `겹침 이상형 ${odd}: ${text} → ${result.text}`);
    }
  }
});

test("[멱등] 두 번 적용해도 결과가 같고, 두 번째 치환 건수는 0이다", () => {
  for (const text of [...REPRESENTATIVE, ...NON_TARGETS, ...REAL_FINANCIAL_NAME_RULES.map((r) => r.sample)]) {
    const once = replaceRealFinancialNames(text);
    const twice = replaceRealFinancialNames(once.text);
    assert.equal(twice.text, once.text, `멱등이 아니다: ${text}`);
    assert.equal(twice.replacedCount, 0, `두 번째에도 치환됐다: ${once.text}`);
  }
});

test("[역검증] 앞 경계를 뺀 `신한` 규칙은 일반 낱말 '당신한테'를 깨뜨린다(경계가 실제로 막고 있다)", () => {
  const poisoned = new RegExp("신한", "gi");
  assert.equal("당신한테 불리합니다".replace(poisoned, FICTIONAL_BANK_NAME), "당OO은행테 불리합니다");
  assert.equal(replaceRealFinancialNames("당신한테 불리합니다").text, "당신한테 불리합니다");
});
