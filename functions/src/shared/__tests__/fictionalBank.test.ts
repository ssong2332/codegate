// 세션별 가상 은행명(2026-10-18 사용자 결정 · Architecture §79) 회귀 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  applyFictionalBank,
  BANK_PLACEHOLDER,
  FICTIONAL_BANK_NAMES,
  pickFictionalBankName,
  resolveFictionalBankName,
} from "../fictionalBank";
import { replaceRealFinancialNames } from "../../guardrails/realFinancialNames";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { IN_CALL_SMS } from "../../scenarios/inCallSms";
import { buildInCallSmsDoc, buildInCallSmsResponse } from "../../inCallSms/buildDoc";

/**
 * §79.1 대조표의 실존·과거 기관명(2026-10-18 조회). 가상명이 이 이름들과 **같거나 그 이름을 포함하거나
 * 그 이름에 포함되면** 안 된다(앞 두 글자 고유어 기준).
 * - 은행: 전국은행연합회 소비자포털 "은행전화번호 진위확인" 은행 목록(https://portal.kfb.or.kr/voice/bankphonenumber.php)
 * - 저축은행: 저축은행중앙회 정기예금 비교공시 목록(https://www.fsb.or.kr/ratedepo_0100.act)
 * - 상호금융·우체국·카드사·과거 퇴출·합병 은행: Architecture §79.1
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

test("[은행명] 실존·과거 기관명과 겹치지 않는다(§79.1 대조표)", () => {
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

test("[은행명] 자리표시자 치환 — 'OO은행'·'○○은행' 모두, 없으면 입력 그대로, 멱등", () => {
  assert.equal(applyFictionalBank("OO은행 948-2716 / ○○은행 금융사고대응팀", "한결은행"), "한결은행 948-2716 / 한결은행 금융사고대응팀");
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
        assert.equal(doc.body, item.body);
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
    assert.match(s, /generateOpeningLine\(\n\s*scenarioId,\n\s*[\w.]+,\n\s*fictionalBankName,\n\s*\)/, file);
    assert.match(s, /\n\s*fictionalBankName,\n/, `${file}: 세션 문서에 저장`);
  }
  const send = src("roleplay/index.ts");
  assert.match(send, /const fictionalBankName = resolveFictionalBankName\(\{ sessionId, fictionalBankName: session\.fictionalBankName \}\);/);
  assert.match(send, /applyFictionalBank\(realNameReplacedText, fictionalBankName\)/);
  assert.match(src("inCallSms/index.ts"), /buildInCallSmsResponse\(item, \{ placed, fictionalBankName \}\)/);
  assert.match(src("realtime/index.ts"), /fictionalBankName: resolveFictionalBankName\(/);
  assert.match(src("roleplay/openingLine.ts"), /applyFictionalBank\(realNameReplacedText, fictionalBankName\)/);
});
