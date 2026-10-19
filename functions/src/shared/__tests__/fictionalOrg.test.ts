// 세션별 가상 카드사·캐피탈명 · 확인창구 센터 일반명(2026-10-19 · Architecture §83) 회귀 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFictionalBank,
  FICTIONAL_BANK_NAMES,
  FICTIONAL_CAPITAL_NAMES,
  FICTIONAL_CARD_NAMES,
  fictionalOrgNamesFor,
  hasBankPlaceholder,
} from "../fictionalBank";
import { replaceRealFinancialNames } from "../../guardrails/realFinancialNames";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { IN_CALL_SMS } from "../../scenarios/inCallSms";
import { MOCK_SCREENS } from "../../scenarios/mockScreens";
import { buildInCallSmsDoc, buildInCallSmsResponse } from "../../inCallSms/buildDoc";
import { VERIFY_INTERCEPT } from "../../scenarios/verifyIntercept";
import { buildVerifyInterceptDoc, buildVerifyOfferResponse, buildVerifyReconnectParts } from "../../verifyIntercept/buildDoc";

/** §83 대상 — 카드사·캐피탈 자리표시자(표기 변형 포함). 은행(§81)은 fictionalBank.test.ts가 본다. */
const ORG_PLACEHOLDER = /[Oo○Ｏｏ]{2}\s?(?:카드|캐피탈)/;

/**
 * §83.1 대조표의 실존·과거 카드사·캐피탈 상호 어간(2026-10-19 조회 — 출처는 Architecture §83.1).
 * 가상명의 어간이 이 이름들과 같거나 포함·피포함이면 안 된다.
 */
const EXISTING_ORG_STEMS: readonly string[] = [
  // 여신금융협회 신용카드사(정회원 8 + 준회원 1)
  "롯데", "비씨", "삼성", "신한", "우리", "하나", "현대", "국민", "농협",
  // 여신금융협회 리스·할부금융사(주요 상호)
  "메리츠", "무궁화", "무림", "산은", "아이엠", "애큐온", "에코", "오릭스", "오케이", "제이엠", "코스모", "한국", "한국자산",
  "한국투자", "커머셜", "쿠팡", "BNK", "DB", "HB", "JB", "KB", "KGM", "KG", "MG", "NBH",
  // 과거 카드사·캐피탈(보도 교차 · 일부 출처 미확보 — §83.1)
  "LG", "외환", "동양", "다이너스", "아멕스", "장은", "아주", "대우", "한미", "효성", "두산",
  // 대조에서 탈락한 후보의 실존 상호 어간(파인·등록대부업체·웹 — §83.1 탈락표)
  "나래", "이음", "단비", "마루", "윤슬", "아름", "고운", "하람", "시루", "여울", "슬기", "아라", "그루", "도란", "지음", "보람",
];

/** 은행명 어간(§81) — 카드·캐피탈 이름은 같은 어간을 쓰지 않는다(계열사로 오인 방지). */
const BANK_STEMS = FICTIONAL_BANK_NAMES.map((name) => name.replace(/은행$/, ""));

test("[기관명] 목록 — 카드·캐피탈 각각 은행 목록과 같은 길이 · '…카드'/'…캐피탈' · 중복 없음 · 은행 어간 미사용", () => {
  for (const [list, suffix] of [
    [FICTIONAL_CARD_NAMES, "카드"],
    [FICTIONAL_CAPITAL_NAMES, "캐피탈"],
  ] as const) {
    assert.equal(list.length, FICTIONAL_BANK_NAMES.length, `${suffix}: 은행 목록과 같은 자리(index)로 짝짓는다`);
    assert.equal(new Set(list).size, list.length, `${suffix}: 중복`);
    for (const name of list) {
      assert.match(name, new RegExp(`^[가-힣]{2,3}${suffix}$`), name);
      assert.doesNotMatch(name, /뱅크|OO|○○/);
      const stem = name.slice(0, -suffix.length);
      for (const bankStem of BANK_STEMS) assert.ok(!stem.includes(bankStem) && !bankStem.includes(stem), `${name} ↔ ${bankStem}은행`);
    }
  }
  const cardStems = FICTIONAL_CARD_NAMES.map((n) => n.replace(/카드$/, ""));
  const capitalStems = FICTIONAL_CAPITAL_NAMES.map((n) => n.replace(/캐피탈$/, ""));
  for (const stem of cardStems) assert.ok(!capitalStems.includes(stem), `카드·캐피탈 어간 중복: ${stem}`);
});

test("[기관명] 실존·과거 카드사·캐피탈 상호와 겹치지 않는다(§83.1 대조표)", () => {
  assert.ok(EXISTING_ORG_STEMS.length >= 20, "대조표가 비어 있으면 이 검사는 거짓 초록이다");
  for (const name of [...FICTIONAL_CARD_NAMES, ...FICTIONAL_CAPITAL_NAMES]) {
    const stem = name.replace(/(카드|캐피탈)$/, "");
    for (const existing of EXISTING_ORG_STEMS) {
      assert.ok(!stem.includes(existing) && !existing.includes(stem), `${name} ↔ ${existing}`);
    }
  }
});

test("[기관명] 실존명 치환 규칙(#277·#289)에 걸리지 않는다 — 가상명이 다시 'OO카드'로 바뀌면 안 된다", () => {
  for (const name of [...FICTIONAL_CARD_NAMES, ...FICTIONAL_CAPITAL_NAMES]) {
    assert.equal(replaceRealFinancialNames(`${name} 상담센터`).replacedCount, 0, name);
  }
});

test("[기관명] 배정 — 세션 은행명과 같은 자리의 이름(새 필드 없음) · 목록 밖 은행명은 결정적 해시", () => {
  FICTIONAL_BANK_NAMES.forEach((bank, i) => {
    assert.deepEqual(fictionalOrgNamesFor(bank), { cardName: FICTIONAL_CARD_NAMES[i], capitalName: FICTIONAL_CAPITAL_NAMES[i] });
  });
  const odd = fictionalOrgNamesFor("목록밖은행");
  assert.deepEqual(fictionalOrgNamesFor("목록밖은행"), odd);
  assert.ok(FICTIONAL_CARD_NAMES.includes(odd.cardName) && FICTIONAL_CAPITAL_NAMES.includes(odd.capitalName));
});

test("[기관명] 치환 — '○○카드'·'OO카드'·'○○캐피탈'·표기 변형 · 은행과 함께 · 실명 가드레일 출력 'OO카드'도 · 멱등", () => {
  const bank = FICTIONAL_BANK_NAMES[2]!;
  const { cardName, capitalName } = fictionalOrgNamesFor(bank);
  assert.equal(
    applyFictionalBank("○○카드 보안확인창구 · OO 카드 · ＯＯ카드사 · ○○캐피탈 상담센터 · OO은행", bank),
    `${cardName} 보안확인창구 · ${cardName} · ${cardName}사 · ${capitalName} 상담센터 · ${bank}`,
  );
  // 모델이 실존 카드사명을 말하면 가드레일이 "OO카드"로 바꾸고(sendMessage·오프닝), 이어서 세션 카드사명이 된다.
  const masked = replaceRealFinancialNames("신한카드에서 연락드렸습니다").text;
  assert.match(masked, /OO카드/);
  assert.equal(applyFictionalBank(masked, bank), `${cardName}에서 연락드렸습니다`);
  assert.equal(applyFictionalBank("OO캐피털 대출", bank), `${capitalName} 대출`, "표준어 표기 '캐피털'(리뷰 Minor #2)");
  const once = applyFictionalBank("○○카드 · ○○캐피탈", bank);
  assert.equal(applyFictionalBank(once, bank), once);
  assert.equal(hasBankPlaceholder("○○캐피탈 · ○○카드"), false, "bankName 판정은 은행 자리표시자만 센다");
  assert.equal(hasBankPlaceholder("OO은행 352-0812-4471-63"), true);
});

test("[기관명] 프롬프트 — 은행명을 주면 전 시나리오 조립 결과에 카드·캐피탈 자리표시자 0", () => {
  let cardScenario = 0;
  for (const [id, scenario] of Object.entries(SCENARIO_PROMPTS)) {
    const bank = FICTIONAL_BANK_NAMES[0]!;
    const assembled = buildSystemPrompt(scenario, { difficultyLevel: "advanced", inCallSmsEnabled: true, fictionalBankName: bank });
    assert.doesNotMatch(assembled, ORG_PLACEHOLDER, `${id}: 자리표시자가 남았다`);
    if (assembled.includes(`'${fictionalOrgNamesFor(bank).cardName}'라는 이름으로만 말한다`)) cardScenario += 1;
  }
  assert.ok(cardScenario >= 1, "card-delivery-call 문면이 세션 카드사명으로 바뀌어야 한다 — 거짓 초록 방지");
});

test("[기관명] ⭐ 서버 출력 전수 — 문자 문서 모든 문자열 필드(발신자 포함)·도착 지시·확인창구·재연결에 카드·캐피탈 자리표시자 0", () => {
  const ts = { toMillis: () => 0 } as unknown as FirebaseFirestore.Timestamp;
  const bank = FICTIONAL_BANK_NAMES[5]!;
  const { cardName, capitalName } = fictionalOrgNamesFor(bank);
  const outputs: Array<[string, string]> = [];
  let capitalSms = 0;
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) {
      const doc = buildInCallSmsDoc(item, ts, 1, scenarioId, bank) as unknown as Record<string, unknown>;
      for (const [field, value] of Object.entries(doc)) if (typeof value === "string") outputs.push([`${item.smsId}.${field}`, value]);
      if (/○○캐피탈/.test(item.senderLabel + item.body)) {
        capitalSms += 1;
        assert.ok(String(doc.senderLabel).includes(capitalName) && String(doc.body).includes(capitalName), `${item.smsId}: 발신자·본문이 같은 캐피탈명`);
        if (!hasBankPlaceholder(item.body)) assert.equal("bankName" in doc, false, `${item.smsId}: 은행 자리표시자가 없으면 bankName 없음`);
      }
      outputs.push([`${item.smsId}.announce`, buildInCallSmsResponse(item, { placed: false, fictionalBankName: bank }).announceInstruction ?? ""]);
    }
  }
  assert.ok(capitalSms >= 2, `캐피탈 문자 수집 실패(${capitalSms}) — 거짓 초록 방지`);
  let cardDesks = 0;
  for (const item of Object.values(VERIFY_INTERCEPT)) {
    const desk = buildVerifyInterceptDoc(item, ts, 1, bank).deskLabel;
    if (item.deskLabel.includes("○○카드")) {
      cardDesks += 1;
      assert.ok(desk.startsWith(cardName), `${item.offerId}: 창구 이름이 세션 카드사명`);
    }
    if (item.deskLabel.includes("○○캐피탈")) assert.ok(desk.startsWith(capitalName), `${item.offerId}: 창구 이름이 세션 캐피탈명`);
    outputs.push([`${item.offerId}.deskLabel`, desk]);
    outputs.push([`${item.offerId}.announce`, buildVerifyOfferResponse(item, { placed: false, fictionalBankName: bank }).announceInstruction ?? ""]);
    const parts = buildVerifyReconnectParts(item, bank);
    outputs.push([`${item.offerId}.callerLabel`, parts.reconnectedCallerLabel]);
    outputs.push([`${item.offerId}.reconnect`, parts.reconnectInstruction]);
    outputs.push([`${item.offerId}.stateLine`, parts.transferStateLine]);
  }
  assert.ok(cardDesks >= 2, "카드 확인창구 수집 실패 — 거짓 초록 방지");
  for (const [label, text] of outputs) assert.doesNotMatch(text, ORG_PLACEHOLDER, `${label}에 자리표시자가 남았다`);
});

test("[기관명] §83.3 센터 — 사기범이 지어낸 센터는 ○○ 없는 고정 일반명(세션과 무관) · 카탈로그에 '○○+센터' 0", () => {
  for (const item of Object.values(VERIFY_INTERCEPT)) {
    const all = [item.deskLabel, item.reconnectedCallerLabel, item.announceInstruction, item.reconnectInstruction, item.transferStateLine].join("\n");
    assert.doesNotMatch(all, /[Oo○Ｏｏ]{2}\s?[가-힣]*센터/, `${item.offerId}: ○○ 접두 센터명`);
  }
  for (const name of ["금융범죄대응센터 확인창구", "환급지원센터 확인창구", "국제통관지원센터 확인창구"]) {
    assert.ok(Object.values(VERIFY_INTERCEPT).some((item) => item.deskLabel === name), `${name}: 카탈로그에 없음`);
  }
});

test("[기관명] §83.4 랜딩 헤더 — 대출 랜딩 issuerLabel은 ○○ 없는 일반명(서버 카탈로그)", () => {
  const labels = Object.values(MOCK_SCREENS).flat().map((screen) => screen.issuerLabel);
  assert.ok(labels.includes("ⓒ 대환대출 전환심사팀"));
  for (const label of labels) assert.doesNotMatch(label, /[Oo○Ｏｏ]{2}/, label);
});
