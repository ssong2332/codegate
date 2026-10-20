// 세션별 가상 은행명(2026-10-18 사용자 결정 · Architecture §81) 회귀 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  applyFictionalBank,
  BANK_PLACEHOLDER,
  FICTIONAL_BANK_NAMES,
  EXAMPLE_ACCOUNT_NUMBER,
  extractAccountNumber,
  pickFictionalBankName,
  resolveFictionalBankName,
  resolveSessionAccountNumber,
} from "../fictionalBank";
import { replaceRealFinancialNames } from "../../guardrails/realFinancialNames";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { IN_CALL_SMS } from "../../scenarios/inCallSms";
import { buildInCallSmsDoc, buildInCallSmsResponse } from "../../inCallSms/buildDoc";
import { VERIFY_INTERCEPT } from "../../scenarios/verifyIntercept";
import { buildVerifyInterceptDoc, buildVerifyOfferResponse, buildVerifyReconnectParts } from "../../verifyIntercept/buildDoc";

/**
 * §81.1 대조표의 실존·과거 기관명(2026-10-18 조회). 가상명이 이 이름들과 **같거나 그 이름을 포함하거나
 * 그 이름에 포함되면** 안 된다(앞 두 글자 고유어 기준).
 * - 은행: 전국은행연합회 소비자포털 "은행전화번호 진위확인" 은행 목록(https://portal.kfb.or.kr/voice/bankphonenumber.php)
 * - 저축은행: 저축은행중앙회 정기예금 비교공시 목록(https://www.fsb.or.kr/ratedepo_0100.act)
 * - 상호금융·우체국·카드사·과거 퇴출·합병 은행: Architecture §81.1
 */
const EXISTING_NAME_STEMS = [
  // 은행(은행연합회)
  "산업", "농협", "신한", "우리", "제일", "하나", "기업", "국민", "씨티", "수협", "iM", "대구", "부산", "광주", "제주", "전북", "경남",
  "케이", "카카오", "토스", "한국", "수출입",
  // 저축은행(저축은행중앙회 공시 목록)
  "고려", "국제", "금화", "남양", "다올", "대명", "대백", "대신", "대아", "대원", "대한", "더케이", "동양", "동원", "드림", "라온", "라인",
  "머스트", "삼일", "모아", "민국", "바로", "부림", "삼정", "삼호", "상상인", "세람", "센트럴", "솔브레인", "스마트", "스카이", "스타",
  "아산", "안국", "안양", "애큐온", "에스앤티", "엠에스", "영진", "예가람", "오성", "오투", "웰컴", "유니온", "유안타", "융창", "인성",
  "인천", "조은", "조흥", "진주", "참", "청주", "키움", "페퍼", "평택", "푸른", "한국투자", "한성", "한화", "흥국", "친애", "애플",
  // 상호금융·우체국
  "신협", "새마을", "산림", "우체국",
  // 카드사
  "삼성", "현대", "롯데", "비씨",
  // 과거 퇴출·합병 은행
  "한빛", "조흥", "서울", "상업", "한일", "외환", "보람", "장기신용", "평화", "동화", "동남", "대동", "경기", "충청", "충북", "강원",
  "주택", "한미", "서울신탁",
];

test("[은행명] 목록은 6~10개 · 모두 '…은행' · 중복 없음 · '뱅크'류 없음", () => {
  assert.ok(FICTIONAL_BANK_NAMES.length >= 6 && FICTIONAL_BANK_NAMES.length <= 10);
  assert.equal(new Set(FICTIONAL_BANK_NAMES).size, FICTIONAL_BANK_NAMES.length);
  for (const name of FICTIONAL_BANK_NAMES) {
    assert.match(name, /^[가-힣]{2}은행$/, name);
    assert.doesNotMatch(name, /뱅크|OO|○○/);
  }
});

test("[은행명] 실존·과거 기관명과 겹치지 않는다(§81.1 대조표)", () => {
  for (const name of FICTIONAL_BANK_NAMES) {
    const stem = name.replace(/은행$/, "");
    for (const existing of EXISTING_NAME_STEMS) {
      assert.ok(!stem.includes(existing) && !existing.includes(stem), `${name} ↔ ${existing}`);
    }
  }
});

test("[은행명] 실존명 치환 규칙(#277·#289)에 걸리지 않는다 — 가상명이 다시 'OO은행'으로 바뀌면 안 된다", () => {
  for (const name of FICTIONAL_BANK_NAMES) {
    assert.equal(replaceRealFinancialNames(`${name} 210-3391-5540-08`).replacedCount, 0, name);
  }
});

test("[은행명] 배정 — 새 세션은 목록 안에서 고르고, 저장값이 원천이며, 옛 세션은 sessionId로 결정적", () => {
  assert.equal(pickFictionalBankName(() => 0), FICTIONAL_BANK_NAMES[0]);
  assert.equal(pickFictionalBankName(() => 0.9999), FICTIONAL_BANK_NAMES[FICTIONAL_BANK_NAMES.length - 1]);
  for (let i = 0; i < 50; i += 1) assert.ok(FICTIONAL_BANK_NAMES.includes(pickFictionalBankName()));
  assert.equal(resolveFictionalBankName({ sessionId: "s1", fictionalBankName: "다온은행" }), "다온은행");
  const legacy = resolveFictionalBankName({ sessionId: "legacy-session-123" });
  assert.equal(resolveFictionalBankName({ sessionId: "legacy-session-123" }), legacy, "같은 세션은 항상 같은 이름");
  assert.ok(FICTIONAL_BANK_NAMES.includes(legacy));
  assert.equal(
    resolveFictionalBankName({ sessionId: "legacy-session-123", fictionalBankName: "신한은행" }),
    legacy,
    "목록 밖 저장값(오염)은 쓰지 않는다",
  );
  const spread = new Set(Array.from({ length: 200 }, (_, i) => resolveFictionalBankName({ sessionId: `sess-${i}` })));
  assert.equal(spread.size, FICTIONAL_BANK_NAMES.length, "해시 폴백이 목록 전체에 퍼진다");
});

test("[은행명] 자리표시자 치환 — 'OO은행'·'○○은행'·표기 변형(띄어쓰기·소문자·전각) 모두, 없으면 입력 그대로, 멱등", () => {
  assert.equal(applyFictionalBank("OO은행 948-2716 / ○○은행 금융사고대응팀", "한결은행"), "한결은행 948-2716 / 한결은행 금융사고대응팀");
  assert.equal(applyFictionalBank("OO 은행 · oo은행 · ＯＯ은행", "한결은행"), "한결은행 · 한결은행 · 한결은행");
  // §83 — "OO카드"는 이제 세션 카드사명으로 바뀐다(fictionalOrg.test.ts). 한글로 읽은 표기·"OO뱅크"는 여전히 범위 밖.
  assert.equal(applyFictionalBank("OO뱅크 · 오오은행", "한결은행"), "OO뱅크 · 오오은행", "범위 밖 표기는 그대로(§81.5)");
  const plain = "자리표시자 없음";
  assert.equal(applyFictionalBank(plain, "한결은행"), plain);
  const once = applyFictionalBank("OO은행", "한결은행");
  assert.equal(applyFictionalBank(once, "한결은행"), once);
});

test("[은행명] 프롬프트 — 은행명을 주면 전 시나리오 조립 결과에 자리표시자 0 · 그 이름만, 안 주면 종전 문자열", () => {
  for (const [id, scenario] of Object.entries(SCENARIO_PROMPTS)) {
    const withBank = buildSystemPrompt(scenario, { difficultyLevel: "advanced", inCallSmsEnabled: true, fictionalBankName: "새솔은행" });
    assert.ok(!withBank.includes(BANK_PLACEHOLDER) && !withBank.includes("○○은행"), `${id}: 자리표시자가 남았다`);
    assert.ok(withBank.includes('은행 이름은 "새솔은행"이라고 그대로 말한다'), id);
    const without = buildSystemPrompt(scenario, { difficultyLevel: "advanced", inCallSmsEnabled: true });
    assert.ok(without.includes('은행 이름은 "OO은행"이라고 그대로 말한다'), `${id}: 은행명 없을 때 종전 문면`);
  }
});

test("[은행명] 문자 — 저장 본문·도착 지시가 세션 은행명으로, 본문에 자리표시자가 있던 문자만 bankName 필드", () => {
  const ts = { toMillis: () => 0 } as unknown as FirebaseFirestore.Timestamp;
  let withPlaceholder = 0;
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) {
      const doc = buildInCallSmsDoc(item, ts, 1, scenarioId, "늘봄은행");
      assert.ok(!doc.body.includes(BANK_PLACEHOLDER), `${item.smsId}: 본문에 자리표시자`);
      if (item.body.includes(BANK_PLACEHOLDER)) {
        withPlaceholder += 1;
        assert.ok(doc.body.includes("늘봄은행"));
        assert.equal(doc.bankName, "늘봄은행");
      } else {
        // §83 — 캐피탈·카드 자리표시자만 있는 문자는 본문이 그 이름으로 바뀌지만 bankName은 싣지 않는다.
        if (!/[Oo○]{2}\s?(?:카드|캐피탈)/.test(item.body)) assert.equal(doc.body, item.body);
        assert.equal("bankName" in doc, false);
      }
      const legacy = buildInCallSmsDoc(item, ts, 1, scenarioId);
      assert.equal(legacy.body, item.body, "은행명 없으면 카탈로그 원문(종전)");
      const res = buildInCallSmsResponse(item, { placed: false, fictionalBankName: "늘봄은행" });
      assert.ok(!res.announceInstruction!.includes(BANK_PLACEHOLDER));
    }
  }
  assert.ok(withPlaceholder >= 5, `계좌 문자 수집 실패(${withPlaceholder}) — 거짓 초록 방지`);
});

test("[은행명] 배선 — 세션 생성 2곳이 저장·오프닝에 전달, sendMessage·문자 발송·Live 토큰이 같은 원천을 읽는다(소스 스캔)", () => {
  const src = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
  for (const file of ["session/index.ts", "challenge/userAccess.ts"]) {
    const s = src(file);
    assert.match(s, /const fictionalBankName = pickFictionalBankName\(\);/, file);
    // T191 S5(#313) 병합 — 3번째 인자는 흐름 변형 ID, 4번째가 은행명이다.
    // T194-a(§84.13.3 ⑤) — 5번째 인자 = 챌린지 ID(세션 술어 입력). 호출부 전부 **명시** 전달(자가 세션 = `undefined`) — 5인자 형태로 고정한다.
    // ⭐ T194-b(§84.13.3 ⑤ ⓒ) — 꼬리 인자(은행명 · 챌린지 ID · 카드)를 **객체 1개**(4번째 인자)로 묶었다(6번째 위치 인자 금지).
    // 4인자 형태 + 객체의 세 키가 이 순서 · **명시**로 있어야 한다(완화 아님 — 키 하나라도 빠지면 실패). 은행명 키는 단축형 그대로다.
    assert.match(
      s,
      /generateOpeningLine\(\n\s*scenarioId,\n\s*[\w.]+,\n\s*[\w.]+,\n\s*\{ fictionalBankName, challengeId: [\w.]+, personaCard: [\w.?]+, voiceSelectionSource(?:: [\w.]+)? \},\n\s*\)/,
      file,
    );
    // 세션 문서 객체 리터럴 안(difficultyLevel 바로 다음 줄)에 저장하는지 — 오프닝 호출 인자와 구별한다(리뷰 #2).
    assert.match(s, /difficultyLevel: [\w.]+,\n\s*fictionalBankName,\n/, `${file}: 세션 문서에 저장`);
  }
  const send = src("roleplay/index.ts");
  assert.match(send, /const fictionalBankName = resolveFictionalBankName\(\{ sessionId, fictionalBankName: session\.fictionalBankName \}\);/);
  assert.match(send, /applyFictionalBank\(realNameReplacedText, fictionalBankName\)/);
  assert.match(src("inCallSms/index.ts"), /buildInCallSmsResponse\(item, \{ placed, fictionalBankName \}\)/);
  assert.match(src("realtime/index.ts"), /fictionalBankName: resolveFictionalBankName\(/);
  const verify = src("verifyIntercept/index.ts");
  assert.match(verify, /buildVerifyInterceptDoc\(item, Timestamp\.now\(\), anchor, fictionalBankName\)/);
  assert.match(verify, /buildVerifyOfferResponse\(item, \{ placed, \.\.\.\(stage \? \{ stage \} : \{\}\), fictionalBankName \}\)/);
  assert.match(verify, /reconnectInstruction: reconnectParts\.reconnectInstruction,/);
  assert.match(verify, /reconnectedCallerLabel: reconnectParts\.reconnectedCallerLabel,/);
  assert.match(src("roleplay/openingLine.ts"), /applyFictionalBank\(realNameReplacedText, fictionalBankName\)/);
});

test("[은행명] ⭐ 서버가 클라·모델에 내보내는 문자열 전수 — 은행명을 주면 자리표시자 0(문자·확인 창구·재연결, 리뷰 #1·#2)", () => {
  const ts = { toMillis: () => 0 } as unknown as FirebaseFirestore.Timestamp;
  const bank = "보담은행";
  const outputs: Array<[string, string]> = [];
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) {
      // architect 지적(ux-real-phone) — 본문만이 아니라 **문서의 모든 문자열 필드**(bankName·accountNumber·발신자·링크 등)를 본다.
      // 랜딩 미리 채움(D-115)은 bankName·accountNumber를 그대로 쓰므로, 여기에 자리표시자가 남으면 화면에 "OO은행"이 나온다.
      const doc = buildInCallSmsDoc(item, ts, 1, scenarioId, bank) as unknown as Record<string, unknown>;
      let stringFields = 0;
      for (const [field, value] of Object.entries(doc)) {
        if (typeof value === "string") {
          stringFields += 1;
          outputs.push([`${item.smsId}.${field}`, value]);
        }
      }
      assert.ok(stringFields >= 3, `${item.smsId}: 문자열 필드 수집 실패`);
      if (doc.bankName !== undefined) assert.equal(doc.bankName, bank, `${item.smsId}.bankName은 세션 은행명`);
      outputs.push([`${item.smsId}.announce`, buildInCallSmsResponse(item, { placed: false, fictionalBankName: bank }).announceInstruction ?? ""]);
    }
  }
  let verifyWithPlaceholder = 0;
  for (const item of Object.values(VERIFY_INTERCEPT)) {
    if (/[Oo○]{2}\s?은행/.test(item.deskLabel + item.announceInstruction + item.reconnectInstruction + item.transferStateLine)) verifyWithPlaceholder += 1;
    outputs.push([`${item.offerId}.deskLabel`, buildVerifyInterceptDoc(item, ts, 1, bank).deskLabel]);
    outputs.push([`${item.offerId}.announce`, buildVerifyOfferResponse(item, { placed: false, fictionalBankName: bank }).announceInstruction ?? ""]);
    const parts = buildVerifyReconnectParts(item, bank);
    outputs.push([`${item.offerId}.callerLabel`, parts.reconnectedCallerLabel]);
    outputs.push([`${item.offerId}.reconnect`, parts.reconnectInstruction]);
    outputs.push([`${item.offerId}.stateLine`, parts.transferStateLine]);
  }
  assert.ok(verifyWithPlaceholder >= 1, "확인 창구 카탈로그에 자리표시자가 있어야 이 검사가 의미 있다(bank-security-verify-scam)");
  for (const [label, text] of outputs) {
    assert.doesNotMatch(text, /[Oo○Ｏｏ]{2}\s?은행/, `${label}에 자리표시자가 남았다`);
  }
  // 은행명이 없으면 카탈로그 원문 그대로(종전)
  const bankVerify = Object.values(VERIFY_INTERCEPT).find((item) => item.deskLabel.includes("○○은행"))!;
  assert.equal(buildVerifyInterceptDoc(bankVerify, ts, 1).deskLabel, bankVerify.deskLabel);
  assert.equal(buildVerifyReconnectParts(bankVerify).reconnectInstruction, bankVerify.reconnectInstruction);
  assert.ok(buildVerifyReconnectParts(bankVerify, bank).reconnectedCallerLabel.startsWith(bank));
});

test("[계좌] §81.6 세션 계좌번호 — 계좌 문자가 있으면 그 문자 속 계좌, 없으면 예시 계좌 · 프롬프트에 예시 잔존 0 · 같은 번호만 쓰라는 1문장", () => {
  assert.equal(resolveSessionAccountNumber("institutional-impersonation"), "210-3391-5540-08");
  assert.equal(resolveSessionAccountNumber("courier-customs-scam"), "604-2270-1183-91");
  assert.equal(resolveSessionAccountNumber("family-accident-deepvoice"), EXAMPLE_ACCOUNT_NUMBER, "계좌 문자 없는 시나리오는 예시 계좌");
  let withSms = 0;
  for (const [id, scenario] of Object.entries(SCENARIO_PROMPTS)) {
    const account = resolveSessionAccountNumber(id);
    const prompt = buildSystemPrompt(scenario, { difficultyLevel: "advanced", inCallSmsEnabled: true, fictionalBankName: "가온은행", sessionAccountNumber: account });
    assert.ok(prompt.includes(`"가온은행 ${account}"`), `${id}: 예시가 세션 계좌로`);
    assert.ok(prompt.includes("이 대화에서 계좌번호를 불러 줄 때는 이 번호를 그대로 쓴다"), `${id}: 규칙 1문장`);
    if (account !== EXAMPLE_ACCOUNT_NUMBER) {
      withSms += 1;
      assert.ok(!prompt.includes(EXAMPLE_ACCOUNT_NUMBER), `${id}: 예시 계좌가 남았다(문자 속 계좌와 갈린다)`);
    }
    const legacy = buildSystemPrompt(scenario, { difficultyLevel: "advanced" });
    assert.ok(!legacy.includes("이 대화에서 계좌번호를 불러 줄 때는"), `${id}: 옵션 없으면 종전 문면`);
  }
  assert.ok(withSms >= 5, `계좌 문자 시나리오 수집 실패(${withSms})`);
});

test("[계좌] §81.6 문자 문서 — 자리표시자 줄의 계좌번호를 accountNumber로(은행명과 한 쌍, D-115 원천) · 프롬프트 세션 계좌와 같은 값", () => {
  const ts = { toMillis: () => 0 } as unknown as FirebaseFirestore.Timestamp;
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) {
      const doc = buildInCallSmsDoc(item, ts, 1, scenarioId, "가온은행");
      const extracted = extractAccountNumber(item.body);
      if (extracted) {
        assert.equal(doc.accountNumber, extracted);
        assert.equal(doc.bankName, "가온은행");
        assert.equal(resolveSessionAccountNumber(scenarioId), extracted, `${scenarioId}: 프롬프트 계좌 = 문자 계좌`);
        assert.ok(doc.body.includes(`가온은행 ${extracted}`));
      } else {
        assert.equal("accountNumber" in doc, false);
      }
    }
  }
});
