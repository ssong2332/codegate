// T6 콘텐츠 안전성/정합성 테스트 (node:test — 저장소에 별도 테스트 프레임워크 없음, T19 memory
// 참고). AC-001/AC-002(공개 메타 필수 필드) + AC-005/AC-013(약화된 수법·운영정보 배제) 근거.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { SCENARIO_PROMPTS, FAMILY_ACCIDENT_SCENARIO_ID } from "../index";
import { PUBLIC_SCENARIOS } from "../publicMeta";
// T109 — 요구 몰림 게이트는 **조립 결과**까지 본다. 규칙과 예시가 서로 다른 파일에 있기 때문이다
// (규칙 = promptAssembly의 공통 블록 / 예시 = 각 시나리오 인용구). 한쪽만 보면 다른 쪽에서 재발한다.
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import type { DifficultyLevel } from "../../shared/difficulty";
// T113 — `turnInstruction`으로 조립에 들어오는 문자열의 **원본 4곳**. 이 값들은 조립 산출물의
// 일부인데도 종전 축(난이도 × 문자)이 순회하지 않아 요구몰림 게이트의 스캔 대상 밖이었다.
import { OPENING_TURN_INSTRUCTION } from "../../roleplay/openingLine";
import { MOCK_INSTALL_CONSENT_INSTRUCTION } from "../mockScreens";
import { VERIFY_INTERCEPT } from "../verifyIntercept";
import { IN_CALL_SMS } from "../inCallSms";

// AC-005: 실제 운영 가능한 사기 정보(실계좌번호 패턴·실제 송금 절차 지시·실제 URL)가 절대
// 포함되면 안 된다. 계좌번호형 숫자(8자리 이상 연속 숫자)와 http(s) 링크를 금지 패턴으로 검사한다.
const LONG_DIGIT_SEQUENCE = /\d{8,}/;
const URL_PATTERN = /https?:\/\//i;

function assertNoOperationalFraudInfo(label: string, text: string): void {
  assert.equal(
    LONG_DIGIT_SEQUENCE.test(text),
    false,
    `${label}에 계좌번호로 보이는 8자리 이상 연속 숫자가 있으면 안 됩니다(AC-005): ${text}`,
  );
  assert.equal(
    URL_PATTERN.test(text),
    false,
    `${label}에 실제 URL이 있으면 안 됩니다(AC-005): ${text}`,
  );
}

test("PUBLIC_SCENARIOS: 가족 납치/사고 시나리오가 최소 1종 존재한다(AC-001)", () => {
  assert.ok(PUBLIC_SCENARIOS[FAMILY_ACCIDENT_SCENARIO_ID]);
});

test("PUBLIC_SCENARIOS: AC-002 필수 필드(제목/유형/예상소요/난이도)를 모두 포함한다(전체 시나리오, T27부터 메신저 포함)", () => {
  for (const [scenarioId, scenario] of Object.entries(PUBLIC_SCENARIOS)) {
    assert.ok(scenario.title.length > 0, `${scenarioId}: title 누락`);
    assert.ok(scenario.fraudType.length > 0, `${scenarioId}: fraudType 누락`);
    assert.ok(scenario.estimatedDuration.length > 0, `${scenarioId}: estimatedDuration 누락`);
    assert.ok(scenario.difficulty.length > 0, `${scenarioId}: difficulty 누락`);
    assert.ok(
      scenario.deepvoiceLines.length >= 1,
      `${scenarioId}: 딥보이스 재생용 대사가 최소 1개 있어야 한다(UX-005).`,
    );
    for (const line of scenario.deepvoiceLines) {
      assert.ok(line.lineId.length > 0, `${scenarioId}: deepvoiceLines lineId 누락`);
      assert.ok(line.text.length > 0, `${scenarioId}: deepvoiceLines text 누락`);
      assertNoOperationalFraudInfo(`${scenarioId}.deepvoiceLines[${line.lineId}]`, line.text);
    }
  }
});

test("SCENARIO_PROMPTS: scenarios와 1:1 매핑(같은 scenarioId)이다(Database.md Relationships)", () => {
  const scenarioIds = Object.keys(PUBLIC_SCENARIOS).sort();
  const promptIds = Object.keys(SCENARIO_PROMPTS).sort();
  assert.deepEqual(promptIds, scenarioIds);
});

test("SCENARIO_PROMPTS: weakenedTactics가 비어있지 않고, 각 항목에 실제 운영정보가 없다(AC-005, 전체 시나리오)", () => {
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    assert.ok(prompt.weakenedTactics.length >= 1, `${scenarioId}: weakenedTactics 비어있음`);
    for (const tactic of prompt.weakenedTactics) {
      assertNoOperationalFraudInfo(`${scenarioId}.weakenedTactics`, tactic);
    }
  }
});

test("SCENARIO_PROMPTS: personaPrompt에도 실제 운영정보가 없다(AC-005, 전체 시나리오)", () => {
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    assertNoOperationalFraudInfo(`${scenarioId}.personaPrompt`, prompt.personaPrompt);
  }
});

test("SCENARIO_PROMPTS: guardrailPreamble이 인젝션 방어 문구(시스템프롬프트 노출 거부/캐릭터 유지/운영정보 거부)를 포함한다(AC-013/AC-024, ADR-0004, 전체 시나리오)", () => {
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    const text = prompt.guardrailPreamble;
    assert.ok(text.includes("시스템 프롬프트"), `${scenarioId}: 시스템 프롬프트 노출 거부 문구가 있어야 한다.`);
    assert.ok(text.includes("캐릭터"), `${scenarioId}: 캐릭터 이탈 거부 문구가 있어야 한다.`);
    assert.ok(
      text.includes("운영 가능한 사기 정보") || text.includes("계좌번호"),
      `${scenarioId}: 실제 운영정보 제공 거부 문구가 있어야 한다.`,
    );
    assertNoOperationalFraudInfo(`${scenarioId}.guardrailPreamble`, text);
  }
});

test("SCENARIO_PROMPTS: suspicionKeywords가 있으면(에스컬레이션 가능 시나리오) 비어있지 않고 실제 운영정보가 없다(AC-034, T27)", () => {
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    if (prompt.suspicionKeywords === undefined) continue;
    assert.ok(prompt.suspicionKeywords.length >= 1, `${scenarioId}: suspicionKeywords가 정의됐다면 비어있으면 안 된다.`);
    for (const keyword of prompt.suspicionKeywords) {
      assertNoOperationalFraudInfo(`${scenarioId}.suspicionKeywords`, keyword);
    }
  }
});

test("PUBLIC_SCENARIOS: escalation이 있는 시나리오는 channel='messenger'이고 escalation 대상 시나리오 프롬프트에 suspicionKeywords가 정의돼 있다(AC-034/046, T27)", () => {
  for (const [scenarioId, scenario] of Object.entries(PUBLIC_SCENARIOS)) {
    if (scenario.escalation === undefined) continue;
    assert.equal(scenario.channel, "messenger", `${scenarioId}: escalation은 메신저 시나리오에만 존재해야 한다.`);
    assert.equal(scenario.escalation.toChannel, "voice", `${scenarioId}: escalation.toChannel은 항상 voice다(MVP 단방향, AC-039).`);
    const prompt = SCENARIO_PROMPTS[scenarioId];
    assert.ok(prompt, `${scenarioId}: escalation 시나리오도 SCENARIO_PROMPTS에 존재해야 한다.`);
    assert.ok(
      prompt.suspicionKeywords && prompt.suspicionKeywords.length >= 1,
      `${scenarioId}: escalation이 있는 시나리오는 suspicionKeywords를 정의해야 한다(T27).`,
    );
  }
});

// T84(§15.9.3 — AC-073 명문 요구 "전이 신호 없는 대사 드리프트를 자동 검증이 잡는다").
// 시나리오 콘텐츠가 "전화드릴게요" 류 대사만 내고 **구조화 신호를 내지 않는** 드리프트는 화면에서
// 즉시 보이지 않는다(max-turn 폴백이 결국 전이시켜 버리기 때문에 사람 눈으로는 정상처럼 보인다).
// 그래서 여기서 리터럴 지시의 존재를 기계로 고정한다. 안전망은 기존 max-turn 폴백(§13.3)이다.
const ESCALATION_SIGNAL_LITERAL = "[[SIGNAL:ESCALATE_VOICE]]";

test("[AC-073] escalation 메타를 가진 모든 시나리오의 personaPrompt가 구조화 신호 리터럴 지시를 포함한다", () => {
  const escalationIds = Object.entries(PUBLIC_SCENARIOS)
    .filter(([, meta]) => meta.escalation !== undefined)
    .map(([id]) => id);
  assert.ok(escalationIds.length >= 1, "에스컬레이션 가능 시나리오가 최소 1종은 있어야 한다");

  for (const scenarioId of escalationIds) {
    const prompt = SCENARIO_PROMPTS[scenarioId];
    assert.ok(prompt, `${scenarioId}: SCENARIO_PROMPTS에 존재해야 한다`);
    assert.ok(
      prompt.personaPrompt.includes(ESCALATION_SIGNAL_LITERAL),
      `${scenarioId}: personaPrompt에 ${ESCALATION_SIGNAL_LITERAL} 리터럴 지시가 있어야 한다 — ` +
        `없으면 모델이 "전화드릴게요"라고 말만 하고 전이 신호를 내지 않는 드리프트가 조용히 생긴다(AC-073).`,
    );
  }
});

test("[역검증] 신호 리터럴이 빠지면 위 드리프트 검사가 실패한다", () => {
  const drifted = SCENARIO_PROMPTS["messenger-subsidy-smishing-sms"].personaPrompt.split(
    ESCALATION_SIGNAL_LITERAL,
  ).join("(신호 없음)");
  assert.equal(drifted.includes(ESCALATION_SIGNAL_LITERAL), false);
});

test("publicMeta.ts는 src/content/scenarios/familyAccidentDeepvoice.ts와 드리프트 없이 동기화되어 있다", () => {
  // functions/(별도 TS 빌드 루트)라 직접 import 대신 소스 텍스트를 비교해 두 사본의 드리프트를
  // 탐지한다(publicMeta.ts 상단 주석 참고).
  const mirrorSourcePath = path.resolve(__dirname, "../../../../src/content/scenarios/familyAccidentDeepvoice.ts");
  const mirrorSource = fs.readFileSync(mirrorSourcePath, "utf-8");
  const scenario = PUBLIC_SCENARIOS[FAMILY_ACCIDENT_SCENARIO_ID];

  assert.ok(mirrorSource.includes(scenario.title), "title이 원본 파일과 다릅니다 — 두 파일을 함께 갱신하세요.");
  assert.ok(mirrorSource.includes(scenario.fraudType), "fraudType이 원본 파일과 다릅니다.");
  for (const line of scenario.deepvoiceLines) {
    assert.ok(mirrorSource.includes(line.text), `deepvoiceLines 텍스트(${line.lineId})가 원본 파일과 다릅니다.`);
  }
});

// ── T95(2026-07-26) 신규 시나리오 미러·콘텐츠 가드 ───────────────────────────
//
// ⚠️ **왜 이 시나리오만 `callerLabel`까지 비교하는가(§15.10.9 G38)**: 기존 13종은 T75에서 클라 쪽
// callerLabel만 번호 표기로 바꾸면서 publicMeta.ts와 **13/13 어긋난 상태**다. 그 드리프트를 지금
// 소급 정리하는 것은 T95 범위가 아니지만(요청받지 않은 수정 금지), **새 시나리오가 같은 상태로
// 태어나는 것은 막는다.** 전 필드 미러를 여기서 고정한다.
const BANK_VERIFY_SCENARIO_ID = "bank-security-verify-scam";

test("[T95] bank-security-verify-scam: publicMeta.ts가 src/content/scenarios/bankSecurityVerifyScam.ts와 **callerLabel까지** 드리프트 없이 동기화돼 있다(G38 재발 방지)", () => {
  const mirrorSourcePath = path.resolve(
    __dirname,
    "../../../../src/content/scenarios/bankSecurityVerifyScam.ts",
  );
  const mirrorSource = fs.readFileSync(mirrorSourcePath, "utf-8");
  const scenario = PUBLIC_SCENARIOS[BANK_VERIFY_SCENARIO_ID];
  assert.ok(scenario, "공개 메타에 신규 시나리오가 등록돼 있어야 한다");

  for (const [field, value] of [
    ["title", scenario.title],
    ["fraudType", scenario.fraudType],
    ["estimatedDuration", scenario.estimatedDuration],
    ["difficulty", scenario.difficulty],
    // ↓ 기존 13종이 전부 어긋나 있는 바로 그 필드.
    ["callerLabel", scenario.callerLabel],
  ] as const) {
    assert.ok(
      mirrorSource.includes(value),
      `${field}이 원본 파일과 다릅니다 — 두 파일을 함께 갱신하세요(G38 드리프트 재발).`,
    );
  }
  assert.equal(scenario.voiceMode, "generic", "clone 경로에는 확인 무력화 지시 주입 지점이 없다(§16.6 G23)");
  assert.equal(scenario.channel, undefined, "통화 셸이 있어야 확인 오버레이 계층이 성립한다(channel 부재=voice)");
  for (const line of scenario.deepvoiceLines) {
    assert.ok(mirrorSource.includes(line.text), `deepvoiceLines(${line.lineId})가 원본 파일과 다릅니다.`);
  }
});

// AC-071의 **표현 수위 경계**(OQ-38 확정 "(a) 상황만 재현", D-6 유지) — 세션 중에 구조를 알려주면
// 참가자는 "확인했으니 안전하다"고 믿는 상태를 겪지 못해 이 훈련 자체가 성립하지 않는다.
test("[AC-071/OQ-38] 신규 시나리오 콘텐츠에 구조 설명이 **긍정형으로** 등장하지 않는다(세션 중 구조 설명 0건)", () => {
  const prompt = SCENARIO_PROMPTS[BANK_VERIFY_SCENARIO_ID];
  const scenario = PUBLIC_SCENARIOS[BANK_VERIFY_SCENARIO_ID];
  const surfaces = [
    prompt.personaPrompt,
    ...prompt.weakenedTactics,
    ...scenario.deepvoiceLines.map((line) => line.text),
    scenario.title,
    scenario.fraudType,
    scenario.difficulty,
  ];
  const STRUCTURE = /같은 곳으로 이어|같은 조직|같은 사람|가로채/g;
  for (const text of surfaces) {
    for (const match of text.matchAll(STRUCTURE)) {
      const after = text.slice(match.index ?? 0, (match.index ?? 0) + 60);
      assert.ok(
        /하지\s*않는다|하지\s*마라|말하지/.test(after),
        `구조 설명이 금지형이 아니면 세션 중에 실제로 나간다: "${after}"`,
      );
    }
  }
  // 가로채기의 **수단** 서술은 금지형으로도 등장하지 않는다(AC-005 불변 — 설명 대상 자체가 아니다).
  for (const text of surfaces) {
    assert.equal(
      /착신\s*전환|포워딩|중계기|번호 목록/.test(text),
      false,
      `수단 서술이 콘텐츠에 들어가면 안 된다: "${text.slice(0, 60)}"`,
    );
  }
});

test("[T95/T91] 신규 시나리오의 지명 요구는 참가자가 전제를 부인해도 꺼낼 수 있다(교착 방지 직접 회귀)", () => {
  const tactics = SCENARIO_PROMPTS[BANK_VERIFY_SCENARIO_ID].weakenedTactics;
  const demand = tactics.find((t) => t.startsWith("본인확인 정보 직접 요구"));
  assert.ok(demand, "지명된 요구 수법이 있어야 한다.");
  assert.ok(
    demand.includes("부인해도"),
    "이 요구가 참가자의 부인과 무관하게 성립한다는 것이 문구에 드러나야 한다 — " +
      "그래야 모델이 전제가 무너진 상황에서도 이 카드를 꺼낸다(T91 실측 결함과 같은 구조).",
  );
  // 부인을 받아 넘기는 대응이 별도로 있어야 사기범이 부인을 반박하며 맴돌지 않는다(courier 패턴).
  assert.ok(
    tactics.some((t) => t.startsWith("부인 시 명의 도용 암시")),
    "부인 대응 수법이 있어야 한다(T92가 지목한 '부인 대응 문구 부재 6종'을 새로 늘리지 않는다).",
  );
});

test("[T95/AC-071] 확인을 **막는** 수법을 함께 싣지 않는다(한 통화 안에서 두 수법이 서로를 부정하지 않게)", () => {
  const labels = SCENARIO_PROMPTS[BANK_VERIFY_SCENARIO_ID].weakenedTactics.map(
    (t) => t.split("—")[0].trim(),
  );
  assert.ok(labels.includes("확인 시도 무력화"), "이 시나리오의 존재 이유인 D3 수법이 있어야 한다.");
  for (const forbidden of ["확인 절차 차단", "확인 차단", "전화 끊음 저지"]) {
    assert.equal(
      labels.includes(forbidden),
      false,
      `"${forbidden}"은 확인을 권하는 캐릭터와 모순된다 — 축 표(exitBlock: D3 단독)와도 어긋난다.`,
    );
  }
});

// ── T91(2026-07-25, 사용자 실측 신고) 회귀 가드 ──────────────────────────────
//
// **무엇이 있었나**: 사용자가 `loan-refinance-scam`에서 "대출 받은 적 없다"를 4턴 연속 부인했는데,
// 사기범이 요구에 도달하지 못하고 같은 압박만 되풀이했다(실측 대화 기록). 원인은 프롬프트가
// "같은 압박 반복 금지"를 안 지켜서가 아니라 — **지킬 수단이 없어서**였다. 그 시나리오의 요구
// 수법 2개가 전부 "기존 대출 보유"를 전제로 해서, 참가자가 그 사실을 부인하는 순간 요구로 가는
// 경로가 **0개**가 됐다. 남은 건 분위기 수법(확인 차단·전화 끊음 저지)뿐이라 그것만 돌려막았다.
//
// **13종 전수 점검 결과**(2026-07-25): loan-refinance-scam이 **요구 수법이 아예 0개인 유일한
// 시나리오**였다. 나머지 12종은 최소 1개를 갖고 있어 **완전한 교착(요구 경로 0개)에는 빠지지
// 않는다.** ⚠️ 여기까지가 실제로 확인된 범위다 — "나머지는 안전하다"가 아니다(아래 참고).
//
// **이 테스트가 고정하는 것**: 각 시나리오마다 "참가자가 무엇을 부인하든 꺼낼 수 있는 요구"를
// **명시적으로 지명**하고, 그 문구가 실제 프롬프트에 살아 있는지 확인한다.
//
//
// ⚠️⚠️ **"나머지 12종은 안전하다"는 뜻이 아니다**(reviewer 지적으로 보강, 2026-07-26).
// 이 표가 확인하는 것은 요구가 **존재하는가**뿐이고, 그 요구가 **참가자가 부인할 수 있는 사실을
// 전제하는가**는 판정하지 못한다. 실제로 같은 종류의 숨은 전제를 가진 시나리오가 4종 더 있다:
//   - card-company-impersonation: "카드번호 앞 8자리" → "저는 그 카드 없는데요"
//   - institutional-impersonation: "잔액 확인해서 전액 이체" → "계좌에 돈이 없어요"
//   - kidnapping-threat / family-accident-deepvoice: → "저는 자녀가 없어요"
// 부인이 흔치 않아 아직 신고로 드러나지 않았을 뿐 **구조는 loanScam과 같다.**
//
// 그리고 **부인 대응 문구가 아예 없는 시나리오는 총 6종**이다(QA 실측, 2026-07-26) — 위 4종에
// tax-refund-scam·messenger-friend-loan-kakao가 더해진다. 이 둘은 요구 자체가 전제에 덜 묶여
// 있어(환급 수수료·친구 송금) 교착 위험은 낮지만, 부인을 받아넘길 문구가 없는 것은 같다.
// **T92는 6종 전부를 대상으로 한다** — 4종으로 좁혔던 최초 등재를 QA 지적으로 정정했다.
// 참고할 올바른 패턴은 courier-customs-scam이다 — "그런 주문 한 적 없다"는 부인을 "명의 도용
// 암시"로 받아넘긴 뒤 통관비 요구를 그대로 밀어붙인다(T91 이전부터 있던 설계).
// ⚠️ 한계를 정직하게 적는다 — 이 테스트는 **지명된 수법이 사라지거나 이름이 바뀌는 회귀**를 잡는다.
// "새로 추가한 수법이 은근히 전제에 묶여 있는" 경우는 문자열 검사로 잡을 수 없다(원래 loanScam
// 결함도 어휘상으로는 조건절이 없었고, 전제 의존은 '기존 대출'이라는 **의미**에 있었다). 그 판단은
// 표를 갱신하는 사람이 해야 한다 — 그래서 자동 추론이 아니라 **손으로 지명하는 표**로 뒀다.
const UNCONDITIONAL_DEMAND_BY_SCENARIO: Record<string, string> = {
  "family-accident-deepvoice": "합의금 송금 요구",
  "courier-customs-scam": "통관비 결제 요구",
  "card-company-impersonation": "카드정보 직접 요구",
  "loan-refinance-scam": "신규 대출 승인 명목 선입금 요구", // ← T91에서 신설. 이전엔 0개였다.
  // ⚠️ T92(2026-07-27) 지명 이동 — 이전 지명 "안전계좌 이체 요구"는 `잔액`(P1 보유)에 묶여 있어
  // 참가자가 "계좌에 돈이 없어요"라고 부인하면 요구로 가는 길이 막힌다(§18.3 표 4 확정 조치).
  // "신원정보 직접 요구"는 **본인 확인**(N2 — 참가자 자신에 관한 것이라 부인 불가)이라 무엇을
  // 부인해도 성립한다. **이체 요구 문구는 한 글자도 바꾸지 않았다**(콘텐츠 무변경, 지명만 이동).
  "institutional-impersonation": "신원정보 직접 요구",
  "kidnapping-threat": "즉시 송금 요구",
  "tax-refund-scam": "환급 수수료 요구",
  "reputation-blackmail-scam": "입막음 송금 요구",
  "grandchild-impersonation": "송금 직접 요구",
  "messenger-child-impersonation-kakao": "송금 직접 요구",
  "messenger-friend-loan-kakao": "송금 직접 요구",
  // 스미싱 문자형의 "요구"는 송금이 아니라 링크 탭이다 — 참가자가 결정을 내리는 순간이 거기다.
  "messenger-parcel-smishing-sms": "링크 클릭 유도",
  // ⚠️ T84(2026-07-26) 갱신 — 3단계 결합(UF-012)으로 이 시나리오의 요구가 "링크 클릭 유도"에서
  // **"앱 설치·권한 허용 유도"**로 바뀌었다(축 E3 태깅과 같은 근거). 여전히 **선행 조건이 없는
  // 요구**다 — 참가자가 지원금 대상임을 부인해도 "확인 앱부터 설치하셔야 조회가 됩니다"로 그대로
  // 밀어붙일 수 있고, 결정의 순간(설치 링크 탭 → 권한 허용)이 그대로 남는다.
  "messenger-subsidy-smishing-sms": "앱 설치·권한 허용 유도",
  // ⚠️ T95(2026-07-26) 신규 — 확인 무력화 전용 시나리오. 이 요구를 고른 이유는 **전제가 없기
  // 때문**이다: "본인 확인"은 참가자가 계좌 보유·거래 사실을 부인해도 성립한다("그러면 명의 도용
  // 여부부터 확인해야 합니다"로 그대로 이어진다 — 프롬프트 문구에 명시). 같은 시나리오의 다른 요구
  // ("보호계좌 이체 요구")는 **잔액이라는 전제**에 묶여 있어 T91의 loanScam과 같은 교착을 만들 수
  // 있으므로 지명하지 않았다.
  "bank-security-verify-scam": "본인확인 정보 직접 요구",
};

test("SCENARIO_PROMPTS: 모든 시나리오가 선행 조건 없는 요구 수법을 1개 이상 갖는다(T91 교착 방지)", () => {
  const promptIds = Object.keys(SCENARIO_PROMPTS).sort();
  const tableIds = Object.keys(UNCONDITIONAL_DEMAND_BY_SCENARIO).sort();

  // 시나리오가 추가됐는데 표를 안 채우면 여기서 걸린다 — 조용히 빠져나가지 못하게 한다.
  assert.deepEqual(
    promptIds,
    tableIds,
    "시나리오를 추가/삭제했으면 UNCONDITIONAL_DEMAND_BY_SCENARIO 표도 함께 갱신해야 한다. " +
      "새 시나리오는 '참가자가 무엇을 부인하든 꺼낼 수 있는 요구'를 반드시 하나 지명하라.",
  );

  for (const [scenarioId, demandLabel] of Object.entries(UNCONDITIONAL_DEMAND_BY_SCENARIO)) {
    const prompt = SCENARIO_PROMPTS[scenarioId];
    assert.ok(prompt, `${scenarioId}: SCENARIO_PROMPTS에 존재해야 한다.`);

    const matched = prompt.weakenedTactics.filter((t) => t.startsWith(demandLabel));
    assert.equal(
      matched.length,
      1,
      `${scenarioId}: "${demandLabel}" 수법이 정확히 1개 있어야 한다(발견 ${matched.length}개). ` +
        `이게 사라지면 참가자가 시나리오의 전제를 부인했을 때 요구로 갈 길이 막혀, ` +
        `사기범이 같은 압박만 되풀이하고 훈련이 "결정의 순간"에 도달하지 못한다(T91 실측 결함).`,
    );
  }
});

test("loan-refinance-scam: 참가자가 대출 보유를 부인해도 요구로 갈 경로가 있다(T91 직접 회귀)", () => {
  const tactics = SCENARIO_PROMPTS["loan-refinance-scam"].weakenedTactics;

  // 부인을 받아 넘기는 대응이 있어야 한다 — 없으면 사기범이 부인을 반박하며 맴돈다.
  assert.ok(
    tactics.some((t) => t.startsWith("부인 시 이익 전환")),
    "'대출 받은 적 없다'는 부인에 대한 대응 수법이 있어야 한다. 없으면 사기범이 " +
      "'기록이 삭제된 건 없냐'며 같은 질문을 되풀이한다(사용자 실측 대화에서 4턴 연속 발생).",
  );

  // 그리고 그 대응이 도달할 요구가 기존 대출을 전제하지 않아야 한다.
  const newLoanDemand = tactics.find((t) => t.startsWith("신규 대출 승인 명목 선입금 요구"));
  assert.ok(newLoanDemand, "신규 대출 명목의 요구 수법이 있어야 한다.");
  assert.ok(
    newLoanDemand.includes("기존 대출이 있든 없든"),
    "이 요구가 기존 대출 보유와 무관하게 성립한다는 것이 문구에 드러나야 한다 — " +
      "그래야 모델이 전제가 무너진 상황에서도 이 카드를 꺼낸다.",
  );
});

// ── T92(2026-07-27, Architecture.md §18) 숨은 전제 의존 6종 보강 — 3겹 가드 ────
//
// **무엇을 고정하나**: T91이 만든 위의 표는 요구가 **존재하는지**만 본다. 그 요구가 **참가자가
// 부인할 수 있는 사실을 전제하는지**는 판정하지 못했다(T91 reviewer 지적). 아래 세 겹은 그 갭을
// 좁힌다 — (A) 무조건성 명시구 존재 · (B) 전제 어휘 역검사 · (C) 부인 대응 경로 표.
//
// ⚠️ **정직 고지(§18.2와 같은 문장)**: 세 겹 전부 **문자열 검사이며 의미가 아니라 표기를 본다.**
// 특히 **시나리오 수준 전제**(자녀 존재·지인 관계)는 요구 문구 안에 어휘로 나타나지 않아 (B)로
// 잡히지 않는다 — `kidnapping-threat`의 "즉시 송금 요구"에는 "자녀"라는 단어가 한 글자도 없다.
// 그 자리는 (A)의 사람 지명과 (C)의 부인 대응 의무화로만 메운다.

/**
 * (A) 허용 명시구 — §18.2. **이 3종이 전부다.**
 * ⚠️ **G74**: 늘릴수록 (A)가 무력해진다(5종·10종이면 사실상 아무 문구나 통과한다). 목록은 이
 * 상수 1곳에만 두고, 확장은 architect 확인 사항으로 남긴다(**OQ-A14**).
 */
const UNCONDITIONALITY_MARKERS = ["있든 없든", "부인해도", "무엇을 부인하든"] as const;

/**
 * (B) 전제 어휘 — §18.3 표 1의 P1~P4 계열. 지명 요구 문구가 이 중 하나를 포함하면 **같은 문구
 * 안에** (A)의 명시구가 함께 있어야 한다.
 *
 * ⚠️ **어휘 선정 기준(임의 판단이 아니라 규칙이다)**: 표 1의 성립 조건은 *"**참가자가** 그것을
 * 가지고 있어야/했어야 성립"* 이다. 따라서 어휘는 **참가자 쪽 전제를 가리킬 때만** 등재한다.
 *
 * ⚠️ **표 1의 예시 중 다음 3개는 단독 형태로 등재하지 않았다 — 근거는 실측이다**(§18.6 "나머지
 * 8종 콘텐츠 수정 금지"를 지키기 위한 것이지 검사를 느슨하게 하려는 것이 아니다):
 *   | 제외한 어휘 | 왜 | 실측(단독 등재 시 걸리는 **T92 범위 밖** 시나리오) |
 *   |---|---|---|
 *   | `계좌` 단독 | 모든 요구 문구가 **사기범 쪽 수취 계좌**를 "계좌는 'OO은행 …' 같은 가상값으로만 부른다"로 달고 있다 — 참가자가 부인할 수 있는 대상이 아니다 | courier-customs-scam · reputation-blackmail-scam · grandchild-impersonation · messenger-child-impersonation-kakao (4종) |
 *   | `결제` 단독 | courier의 라벨 "통관비 **결제** 요구"는 **지금 시키는 결제**지 참가자의 과거 행위(P3)가 아니다 | courier-customs-scam |
 *   | `신청` 단독 | subsidy 요구의 "**신청** 접수는 …"은 사기범이 지금 만드는 절차(N3)다 | messenger-subsidy-smishing-sms |
 * 대신 **참가자 보유를 가리키는 좁은 형태**(`계좌 비밀번호`)를 등재해 §18.3 표 4가 지목한
 * `institutional-impersonation`의 P1 어휘는 그대로 잡는다.
 * ⚠️ 마찬가지로 **호칭**(할머니·엄마)은 등재하지 않았다 — 표 1 P2의 예시는 `자녀·손주·부모·지인·
 * 직장동료`이고, 호칭까지 넣으면 grandchild-impersonation·messenger-child-impersonation-kakao가
 * 걸린다. 이 둘은 T92 범위 밖이므로 **OQ-A16**(별건 등재)의 대상이다.
 */
const PREMISE_VOCABULARY: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  { code: "P1 보유", pattern: /대출/ },
  { code: "P1 보유", pattern: /잔액/ },
  { code: "P1 보유", pattern: /카드\s*(번호|정보)/ },
  { code: "P1 보유", pattern: /계좌\s*비밀번호/ },
  { code: "P1 보유", pattern: /보험/ },
  { code: "P1 보유", pattern: /구독/ },
  { code: "P2 관계", pattern: /자녀|손주|부모|지인|직장\s*동료/ },
  { code: "P3 행위", pattern: /해외\s*직구|택배\s*주문|납세/ },
  { code: "P4 자격", pattern: /환급\s*대상|지원금\s*대상|수사\s*대상/ },
];

/**
 * (A)의 적용 대상 — 지명 요구가 **P1~P4 전제에 묶여 있어** 무조건성 명시구가 필수인 시나리오.
 * 값 `"P"`/`"N"`은 §18.3 표 1·표 2 판정 결과이고, 표 4가 6종에 대해 이미 확정해 둔 것을 옮긴 것이다.
 *
 * ⚠️ **왜 (A)를 14종 전수로 걸지 않았는가(설계와의 차이 — 보고 대상)**: §18.2 (A)의 문면은
 * *"지명한 수법 문구에 명시구 중 하나가 반드시 포함된다"* 로 14종 전수처럼 읽힌다. 그러나 §18.3
 * 표 2 **#1**은 *"요구가 N1~N4에만 근거하면 ✅ 지명 가능"* 이라 명시구를 요구하지 않고, §18.6은
 * *"나머지 8종 콘텐츠 수정"* 을 명시적으로 금지한다. 전수로 걸면 **T92 범위 밖 6종**
 * (courier-customs-scam · reputation-blackmail-scam · grandchild-impersonation ·
 * messenger-child-impersonation-kakao · messenger-parcel-smishing-sms ·
 * messenger-subsidy-smishing-sms)의 콘텐츠를 고쳐야 한다(실측 — 그 6종 지명 문구에 명시구 0건).
 * 그래서 **표 2 #1을 우선**해 P/N을 손으로 지명하는 이 표를 둔다. 키는 14종 전수 `deepEqual`이라
 * 새 시나리오가 판정 없이 빠져나가지 못한다.
 */
const DEMAND_PREMISE_BY_SCENARIO: Record<string, "P" | "N"> = {
  // ── P: 지명 요구가 참가자 전제에 묶여 있다 → 명시구 필수 ──
  "family-accident-deepvoice": "P", // P2 자녀·가족 존재(표 4)
  "card-company-impersonation": "P", // P1 그 카드사 카드 보유(표 4)
  "loan-refinance-scam": "P", // P1 기존 대출 — T91이 "있든 없든"으로 이미 무력화
  "institutional-impersonation": "P", // P1 계좌 비밀번호(표 4, 지명 이동 후)
  "kidnapping-threat": "P", // P2 자녀 존재(표 4)
  "tax-refund-scam": "P", // P4 환급 대상 자격(표 4)
  "messenger-friend-loan-kakao": "P", // P2 지인 관계(표 4)
  "bank-security-verify-scam": "P", // T95가 "부인해도"로 이미 무력화
  // ── N: 요구가 N1~N4에만 근거한다(표 2 #1) → 명시구 불요. 근거를 행마다 적는다 ──
  "courier-customs-scam": "N", // 통관비는 사기범이 지금 만드는 절차(N3). 주문 부인은 "명의 도용 암시"(N1)가 받는다
  "reputation-blackmail-scam": "N", // 유포될 자료의 존재 = 참가자가 알 수 없는 사기범 주장(N1)
  "grandchild-impersonation": "N", // ⚠️ 실제로는 P2(손주 존재)다 — **T92 범위 밖**이라 OQ-A16(별건 등재) 대상
  "messenger-child-impersonation-kakao": "N", // ⚠️ 동상(자녀 존재). OQ-A16 대상
  "messenger-parcel-smishing-sms": "N", // 배송 건 자체가 N1. 주문 부인은 "명의 도용 암시"가 받는다
  "messenger-subsidy-smishing-sms": "N", // 확인 앱 설치·접수는 사기범이 지금 만드는 절차(N3)
};

/**
 * (C) 부인 대응 경로 표 — 시나리오별로 "부인을 받아넘겨 요구로 되돌리는" 수법을 **손으로 지명**한다.
 * `null`은 *"아직 없다"* 가 아니라 **"없다는 것을 확인했고 T92 범위 밖이다"** 라는 명시적 선언이다
 * (§18.1 실측 #4 — 부재를 판별자로 오버로드하지 않기 위해 키는 14종 전수로 두고 값으로 구분한다).
 *
 * ⚠️ **설계와의 차이(보고 대상)**: §18.2 (C)는 14종 전부에 라벨이 있다고 보고 존재 검사를 요구했으나,
 * **실측 결과 T92 범위 밖 3종에는 부인 대응 문구가 아예 없다** — `grandchild-impersonation`,
 * `messenger-child-impersonation-kakao`, `messenger-subsidy-smishing-sms`. 이 3종을 고치는 것은
 * §18.6 "나머지 8종 콘텐츠 수정" 금지에 걸리므로 `null`로 선언하고 **OQ-A16(별건 등재)** 로 넘긴다.
 * 아래 테스트가 `null` 집합을 **정확히 이 3종으로 고정**하므로 조용히 늘어나지 못한다.
 */
const DENIAL_PIVOT_BY_SCENARIO: Record<string, string | null> = {
  "family-accident-deepvoice": "부인 시 애정 호소", // T92 신규 — N4(호칭·관계 미특정)
  "courier-customs-scam": "명의 도용 암시", // 기존 — §18.3 표 3이 지목한 참고 패턴(P3 → N1)
  "card-company-impersonation": "부인 시 명의 도용 암시", // T92 신규 — P1 → N1
  "loan-refinance-scam": "부인 시 이익 전환", // T91
  "institutional-impersonation": "부인 시 명의 도용 암시", // T92 신규 — P1 → N1 → N2 본인 확인
  "kidnapping-threat": "부인 시 냉담한 떠넘기기", // T92 신규 — N4(대상 미특정, §18.5 준수)
  "tax-refund-scam": "부인 시 절차 정당화", // T92 신규 — P4 → N3
  "reputation-blackmail-scam": "반박 무시", // 기존 — 부인을 받고 요구로 계속 간다
  "grandchild-impersonation": null, // ⚠️ 부재 확인 — T92 범위 밖(OQ-A16)
  "messenger-child-impersonation-kakao": null, // ⚠️ 동상
  "messenger-friend-loan-kakao": "부인 시 친분 호소", // T92 신규 — N4(이름 미특정)
  "messenger-parcel-smishing-sms": "명의 도용 암시", // 기존 — courier와 같은 패턴
  "messenger-subsidy-smishing-sms": null, // ⚠️ 부재 확인 — T92 범위 밖(OQ-A16)
  "bank-security-verify-scam": "부인 시 명의 도용 암시", // T95
};

/** 지명된 요구 수법 문구를 돌려준다(없으면 undefined — 위 T91 테스트가 별도로 존재를 고정한다). */
function findNamedDemand(scenarioId: string): string | undefined {
  const label = UNCONDITIONAL_DEMAND_BY_SCENARIO[scenarioId];
  return SCENARIO_PROMPTS[scenarioId].weakenedTactics.find((t) => t.startsWith(label));
}

function hasUnconditionalityMarker(text: string): boolean {
  return UNCONDITIONALITY_MARKERS.some((marker) => text.includes(marker));
}

test("[T92/(A)] 전제(P1~P4)에 묶인 지명 요구는 무조건성 명시구를 문구 안에 갖는다", () => {
  assert.deepEqual(
    Object.keys(DEMAND_PREMISE_BY_SCENARIO).sort(),
    Object.keys(SCENARIO_PROMPTS).sort(),
    "시나리오를 추가/삭제했으면 DEMAND_PREMISE_BY_SCENARIO도 함께 갱신해야 한다 — " +
      "새 시나리오의 지명 요구가 참가자 전제(§18.3 표 1 P1~P4)에 묶이는지 판정하라.",
  );

  const premiseBound = Object.entries(DEMAND_PREMISE_BY_SCENARIO)
    .filter(([, premise]) => premise === "P")
    .map(([scenarioId]) => scenarioId);
  assert.ok(premiseBound.length >= 8, "P 판정 시나리오가 8종 미만이면 표가 훼손된 것이다");

  for (const scenarioId of premiseBound) {
    const demand = findNamedDemand(scenarioId);
    assert.ok(demand, `${scenarioId}: 지명 요구 수법을 찾지 못했다.`);
    assert.ok(
      hasUnconditionalityMarker(demand),
      `${scenarioId}: 지명 요구가 참가자 전제에 묶여 있는데 무조건성 명시구` +
        `(${UNCONDITIONALITY_MARKERS.join(" / ")})가 문구에 없다. ` +
        `참가자가 그 전제를 부인하는 순간 요구로 갈 경로가 0개가 된다(T91 실측 결함과 같은 구조).`,
    );
  }
});

test("[T92/(B)] 지명 요구가 전제 어휘를 포함하면 같은 문구 안에 명시구가 함께 있어야 한다(14종 전수)", () => {
  const failures: string[] = [];
  for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
    const demand = findNamedDemand(scenarioId);
    if (demand === undefined) continue; // 존재 자체는 위 T91 테스트가 고정한다
    const hit = PREMISE_VOCABULARY.find((entry) => entry.pattern.test(demand));
    if (hit === undefined) continue;
    if (hasUnconditionalityMarker(demand)) continue;
    failures.push(`${scenarioId}: ${hit.code} 어휘 ${String(hit.pattern)} — 명시구 없음`);
  }
  assert.deepEqual(
    failures,
    [],
    "전제 어휘가 들어간 요구는 무조건성 명시구로 함께 무력화해야 한다(§18.2 (B)). " +
      "명시구를 넣을 수 없다면 그 요구를 지명하지 말고 다른 요구를 지명하라(§18.3 표 2 #3).",
  );
});

test("[T92/(C)] 부인 대응 경로 표가 14종 전수를 덮고, 지명한 대응 수법이 실제 콘텐츠에 있다", () => {
  assert.deepEqual(
    Object.keys(DENIAL_PIVOT_BY_SCENARIO).sort(),
    Object.keys(SCENARIO_PROMPTS).sort(),
    "시나리오를 추가/삭제했으면 DENIAL_PIVOT_BY_SCENARIO도 함께 갱신해야 한다. " +
      "새 시나리오는 '참가자의 부인을 받아넘겨 요구로 되돌리는 수법'을 하나 지명하라.",
  );

  // 부재(null)는 딱 이 3종뿐이다 — 조용히 늘어나면 여기서 걸린다(OQ-A16 별건 등재 대상).
  assert.deepEqual(
    Object.entries(DENIAL_PIVOT_BY_SCENARIO)
      .filter(([, pivot]) => pivot === null)
      .map(([scenarioId]) => scenarioId)
      .sort(),
    [
      "grandchild-impersonation",
      "messenger-child-impersonation-kakao",
      "messenger-subsidy-smishing-sms",
    ],
    "부인 대응이 없는 시나리오가 늘었다 — T92는 대상 6종을 전부 채웠으므로 새로 생긴 것이다.",
  );

  for (const [scenarioId, pivotLabel] of Object.entries(DENIAL_PIVOT_BY_SCENARIO)) {
    if (pivotLabel === null) continue;
    const matched = SCENARIO_PROMPTS[scenarioId].weakenedTactics.filter((t) =>
      t.startsWith(pivotLabel),
    );
    assert.equal(
      matched.length,
      1,
      `${scenarioId}: "${pivotLabel}" 수법이 정확히 1개 있어야 한다(발견 ${matched.length}개). ` +
        `이게 사라지면 사기범이 참가자의 부인을 반박하며 맴돌고, 요구에 도달하지 못한다.`,
    );
  }
});

test("[T92/역검증] 명시구를 지운 사본은 (A)를 실패시킨다", () => {
  const demand = findNamedDemand("card-company-impersonation");
  assert.ok(demand);
  assert.equal(hasUnconditionalityMarker(demand), true);
  let stripped = demand;
  for (const marker of UNCONDITIONALITY_MARKERS) stripped = stripped.split(marker).join("(제거됨)");
  assert.equal(
    hasUnconditionalityMarker(stripped),
    false,
    "명시구를 제거했는데도 (A)가 통과하면 검사가 표기가 아니라 우연을 보고 있는 것이다.",
  );
  // 그리고 그 사본은 (B)에도 걸린다 — 이 문구에는 `카드번호`(P1)가 들어 있기 때문이다.
  assert.ok(PREMISE_VOCABULARY.some((entry) => entry.pattern.test(stripped)));
});

// ── T92 reviewer Major 1(2026-07-27) 내부 문서 표기가 **모델에 전송되는 문자열**에 섞였다 ──
//
// **무엇이 있었나**: T92가 6종 `personaPrompt`의 `[캐릭터]`에 추가한 줄에 `(T92, Architecture.md
// §18.3 표 4)` 같은 출처 표기를 그대로 적었다. `weakenedTactics` 쪽은 TS `//` 주석이라 런타임
// 문자열에 안 가지만, **`personaPrompt`는 템플릿 리터럴이라 그 안이 곧 모델 지시다** — 사기범
// 페르소나 시스템 프롬프트로 Gemini/ElevenLabs에 `"Architecture.md"`·`"표 4"`가 그대로 갔다.
//
// **기존 테스트가 왜 못 잡았나(실측)**: `assertNoOperationalFraudInfo`는 8자리+ 숫자열·URL만 보고,
// `[T92/G68]`은 `weakenedTactics` **라벨만** 훑는다. 어느 쪽도 persona 본문을 보지 않았다.
//
// ⚠️ **기존 위반도 있었다(전수 스캔 실측, T92가 넣은 6건이 전부가 아니다)**:
//   | 위반 | 위치 | 넣은 시점 |
//   |---|---|---|
//   | `(T92, Architecture.md §18.3 표 4)` × 6 | 6종 personaPrompt | T92(이번) |
//   | `(T91, 사용자 실측 신고)` | `loanScam.prompt.ts` personaPrompt | T91(기존) |
//   | `(DECISIONS #10 데모 타겟과 정합)` × 2 | family-accident · institutional personaPrompt | T6/Phase B(기존) |
// 전부 `//` 주석으로 옮겼다 — **지시 내용은 프롬프트에 남기고 출처 표기만 뺐다.**
const INTERNAL_DOC_NOTATION: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "문서 파일명", pattern: /Architecture\.md|Tasks\.md|PRD\.md|DECISIONS|CHANGELOG/ },
  { label: "절 기호", pattern: /§/ },
  { label: "표 번호", pattern: /표\s*\d/ },
  { label: "태스크 번호", pattern: /\bT\d{1,3}\b/ },
  { label: "AC 번호", pattern: /AC-\d/ },
  { label: "갭 번호", pattern: /\bG\d{1,3}\b/ },
  { label: "미결 질문", pattern: /\bOQ-/ },
  { label: "ADR", pattern: /\bADR-/ },
  { label: "화면 ID", pattern: /\bUX-\d/ },
  { label: "결정 ID", pattern: /\bD-\d/ },
  // ⚠️ **reviewer Minor(2026-07-27 재리뷰) — 판단하고 그대로 둔다.** 이 행만 한국어 문맥 앵커가
  // 없는 맨 영어 차용어라, 시나리오가 이 문자열을 포함한 영어 표현을 쓰게 되면 재작성이 필요하다.
  // **그래도 남기는 이유**: 실제로 프롬프트에 샌 표기 중 하나가 *"reviewer 지적으로 보강"* 류
  // 저작 메모였다(이 저장소의 실제 습관이다 — 나도 같은 실수를 했다). 다른 10개 행은 문서 기호를
  // 잡을 뿐 이 형태를 못 잡는다. 현재 14종 전수 **오탐 0**(아래 역검증이 정상 문장으로 확인)이고,
  // 오탐이 실제로 생기면 그때 한국어 앵커를 붙이면 된다 — 지금 지우면 유일한 방어가 사라진다.
  { label: "에이전트 역할명", pattern: /reviewer|implementer|quality-assurance/ },
];

/** 모델에게 실제로 전송되는 문자열 표면 전부(조립은 promptAssembly가 이 셋을 이어 붙인다). */
function modelFacingSurfaces(scenarioId: string): Array<{ field: string; text: string }> {
  const prompt = SCENARIO_PROMPTS[scenarioId];
  const surfaces = [
    { field: "personaPrompt", text: prompt.personaPrompt },
    { field: "guardrailPreamble", text: prompt.guardrailPreamble },
    ...prompt.weakenedTactics.map((text, i) => ({ field: `weakenedTactics[${i}]`, text })),
  ];
  for (const [i, keyword] of (prompt.suspicionKeywords ?? []).entries()) {
    surfaces.push({ field: `suspicionKeywords[${i}]`, text: keyword });
  }
  return surfaces;
}

test("[T92/내부표기] 모델에 전송되는 문자열에 내부 문서 표기가 없다(14종 전수, reviewer Major 1)", () => {
  const violations: string[] = [];
  for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
    for (const { field, text } of modelFacingSurfaces(scenarioId)) {
      for (const { label, pattern } of INTERNAL_DOC_NOTATION) {
        const match = pattern.exec(text);
        if (match === null) continue;
        violations.push(
          `${scenarioId}.${field} [${label}] :: ` +
            `"${text.slice(Math.max(0, match.index - 20), match.index + 25).replace(/\n/g, " ")}"`,
        );
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    "설계 근거·태스크 번호·문서 절 번호는 소스 `//` 주석에만 적는다 — 템플릿 리터럴 안에 적으면 " +
      "사기범 페르소나 시스템 지시로 모델에 그대로 전송된다(훈련 내부 사정 노출, D-6 취지).",
  );
});

test("[T92/내부표기 역검증] 각 금지 표기가 실제로 잡힌다(죽은 패턴 방지)", () => {
  const samples: ReadonlyArray<readonly [string, string]> = [
    ["문서 파일명", "이 지시는 Architecture.md 근거다"],
    ["절 기호", "근거는 §18.3이다"],
    ["표 번호", "판정은 표 4를 따른다"],
    ["태스크 번호", "T92에서 추가했다"],
    ["AC 번호", "AC-005를 지킨다"],
    ["갭 번호", "G68 참고"],
    ["미결 질문", "OQ-A14 확인 사항"],
    ["ADR", "ADR-0004 경계"],
    ["화면 ID", "UX-029에서 쓴다"],
    ["결정 ID", "D-42 유지"],
    ["에이전트 역할명", "reviewer 지적으로 보강"],
  ];
  for (const [label, sample] of samples) {
    const rule = INTERNAL_DOC_NOTATION.find((r) => r.label === label);
    assert.ok(rule, `${label}: 규칙이 있어야 한다`);
    assert.equal(rule.pattern.test(sample), true, `${label}: 자기 양성 샘플을 못 잡는다 — 죽은 패턴이다`);
  }
  // 정상 프롬프트 문장이 오탐으로 걸리지 않는지도 함께 본다(과차단 방지).
  for (const benign of [
    "고객님, 지금 바로 확인해 드릴게요",
    "weakenedTactics에 정의된 수법만 사용한다",
    "세션은 짧게(5~8분, 5~8턴 내외) 마무리되도록 진행한다",
  ]) {
    for (const { label, pattern } of INTERNAL_DOC_NOTATION) {
      assert.equal(pattern.test(benign), false, `${label}이 정상 문장을 오탐한다: ${benign}`);
    }
  }
});

// ── 2026-07-27 사용자 실사용 신고 — 확인 요구가 **요구로 발화되지 않는다** ─────────
//
// **무엇이 있었나**: `tax-refund-scam` 고급 세션에서 사용자가 신고했다 — *"보통 성함과 생년월일을
// 사용자에게 묻는데, 바로 확인되었다고 넘어가고 있어."* 실제 대사는 *"성함이랑 생년월일
// 확인되시고요, 계좌는 본인 명의 맞으시죠?"* 였다. **모델은 지시대로 정확히 연기했다** — 프롬프트가
// "확인되시고요"(=이미 확인됐다)라고 적혀 있었기 때문이다.
//
// **왜 결함인가**: 참가자가 **개인정보를 넘길지 말지 결정할 순간이 사라진다.** 이 훈련이 만들어야
// 할 판단 지점 그 자체다. T91의 교착(요구에 도달 못 함)과 같은 계열이지만 축이 다르다 — T92 (B)는
// *"요구가 부인 가능한 전제에 묶였는가"* 를 보는데, 이건 *"요구가 요구로 발화되는가"* 다.
//
// **실측 범위**: 5종 × 2자리(personaPrompt와 weakenedTactics에 같은 문구가 중복) — tax-refund-scam ·
// institutional-impersonation · card-company-impersonation · courier-customs-scam ·
// loan-refinance-scam. 한쪽만 고치면 부분 정정이라 두 자리를 모두 고쳤다.
//
// ⚠️ **왜 "확인되시고요" 문자열 금지가 아닌가**: 같은 전제를 *"성함 조회됐고요"*·*"신원 확인 끝났고요"*
// 로 바꿔 쓰면 그대로 통과한다. 그래서 **긍정 요건**으로 고정한다 — 사기범 대사 인용구가 참가자의
// 신원 정보를 언급하면 그 대사 안에 **요구 형태**가 반드시 있어야 한다. 정답 패턴은 저장소에 이미
// 있었다: `bankSecurityVerifyScam.prompt.ts`의 "…성함이랑 생년월일, … 확인번호까지 **불러주세요**".
const IDENTITY_FIELD = /성함|생년월일|주민(등록)?번호/;
const SOLICITATION_FORM =
  /불러\s*주|알려\s*주|말씀\s*(해|주)|보내\s*주|입력해\s*주|찍어\s*보내|대\s*주세요|적어\s*주/;

/**
 * ⭐ **절 단위 검사**(reviewer Major, 2026-07-27 재리뷰) — 인용구 **전체**에 요구 동사가 하나라도
 * 있으면 통과시키던 최초 구현은 **절을 섞으면 우회된다**:
 *   `"성함은 확인됐고요, 생년월일만 불러주세요"` → 성함은 신고된 결함 그대로인데 생년월일 덕분에 통과.
 *
 * **왜 "매치 뒤 N자 이내" 대신 절 분리를 골랐나 — 실측으로 결론이 난다(임의 선택이 아니다)**:
 *   | 문자열 | 신원 필드 → 요구 형태 거리 |
 *   |---|---|
 *   | 우회 문자열(막아야 함) | **17자** |
 *   | `bankSecurityVerifyScam` 정답 문구(통과해야 함) | **26자** |
 * 즉 N < 17이어야 우회를 막는데 N >= 26이어야 정답 문구가 통과한다 — **어떤 N도 둘을 동시에 만족할
 * 수 없다.** 절 분리는 이 둘을 정확히 갈라낸다(아래 역검증이 실행으로 고정).
 *
 * ⚠️ **한국어 어순 — 아무 쉼표에서나 자르면 안 된다.** `"성함, 생년월일 불러주십시오"`는 쉼표로
 * 이어진 **명사 나열 한 절**이다. 그래서 **서술어 종결형(다·요·죠·까·오) 뒤의 구두점에서만** 자른다.
 * 이 규칙으로 14종 전 인용구를 훑은 결과 **오탐 0**이고(신원 언급 인용구 13개 / 걸린 절 0개),
 * 수정 전 결함 **10/10**을 그대로 잡는다(검출력 손실 0).
 *
 * ⚠️ **알려진 보수적 한계(정직 고지)**: 도치형 `"불러주세요, 성함이랑 생년월일"`은 요구 절과 필드
 * 절이 갈려 **걸린다(오탐)**. 현행 14종에는 이 형태가 0건이고, 걸리는 방향이 **막고 사람을 부르는
 * 쪽**이라 그대로 둔다(§18.2 (B)의 "틀리는 방향이 안전하다"와 같은 판단). 필요하면 저작자가 자연
 * 어순으로 쓰면 되고, 그것이 게이트를 푸는 것보다 싸다.
 *
 * ⚠️ **QA 실측(2026-07-27) — 이 경계 목록만으로는 부족하다.** QA가 **막히지 않는 우회 6종**을
 * 찾았다: 종결형 `-네`, 연결어미 `-고`·`-는데`, 그리고 구분자 **슬래시·대시·줄바꿈**. 목록을
 * 넓히긴 했지만(아래), **어미 열거는 방어의 본체가 아니다** — 열거는 길어질수록 빠진 어미가 생기고
 * 그게 곧 다음 우회다. 본체는 아래 `PRESUMED_VERIFICATION`(축 2)이며, 그쪽은 **절 경계를 전혀 보지
 * 않는다**(실측: `→` 화살표·`-으며`·`-으니`·`-습니다만` 4종은 이 경계 목록이 놓치지만 축 2가 잡는다).
 */
const CLAUSE_BOUNDARY =
  // 서술어 종결형/연결어미 뒤의 쉼표·가운뎃점(명사 나열 "성함, 생년월일"은 쪼개지 않는다)
  /(?<=[다요죠까오네고]|는데|지만)\s*[,·]\s*|\s*[?!.]\s*|\s+[/;–—-]\s+|\n+/;

/**
 * ⭐ **축 2 — 전제 표현 근접 금지**(QA NO-GO 대응, 2026-07-27). 절 경계를 **전혀 보지 않는다.**
 *
 * **왜 이 축을 더했나**: 축 1(절 분리)의 방어력은 "한국어 어미·구분자를 빠짐없이 열거했는가"에
 * 의존한다. 그건 열거가 끝나지 않는 싸움이다. 반면 이 결함의 **본질**은 구분자가 아니라 *"신원
 * 정보가 **이미 확인됐다**고 말한다"* 는 것이고, 그 표현은 신원 필드 **바로 옆에** 붙는다. 그래서
 * 필드 주변 좁은 창(±{@link PRESUMPTION_WINDOW}자)에서 **완료형 확인 표현**만 금지한다.
 *
 * ⚠️ **"확인"이라는 말 자체를 막는 게 아니다** — 반드시 **완료**를 뜻하는 꼬리와 붙을 때만 잡는다.
 * 아래는 전부 **정상이라 잡으면 안 되는** 현행 문구이고, 실측으로 통과를 확인했다:
 *   | 정상 문구 | 왜 안 걸리나 |
 *   |---|---|
 *   | `"본인 확인이 안 되면 공범으로 분류됩니다, 주민번호 …"`(institutional) | `확인이` 뒤가 `안 되면`이라 완료형이 아니다 |
 *   | `"조회 자체가 본인 확인부터라서요, 성함이랑 …"`(bank-security) | `확인부터`는 완료형이 아니고, `확인번호`도 마찬가지 |
 *   | `"성함, 생년월일 불러주십시오, …"`(institutional) | 확인 표현 자체가 없다 |
 */
const PRESUMED_VERIFICATION =
  /(확인|조회|대조|인증)\s*(이|은|는|도|까지)?\s*(완료|끝났|끝|됐|되었|되셨|되시고|된\s*상태|처리됐)/;
/** 신원 필드 앞뒤 몇 글자까지를 "그 필드에 붙은 말"로 볼 것인가. 좁게 잡아 무관한 확인 표현을 배제한다. */
const PRESUMPTION_WINDOW = 12;

/** 프롬프트 문자열 안에서 **사기범이 말할 대사**(따옴표로 감싼 예시)만 뽑는다. */
function quotedUtterances(text: string): string[] {
  return [
    ...[...text.matchAll(/'([^']+)'/g)].map((m) => m[1]),
    ...[...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
  ];
}

/** 축 1 — 신원 필드를 언급하면서 **같은 절 안에** 요구 형태가 없는 절만 돌려준다(빈 배열 = 통과). */
function clausesDemandingWithoutSolicitation(utterance: string): string[] {
  return utterance
    .split(CLAUSE_BOUNDARY)
    .filter((clause) => IDENTITY_FIELD.test(clause) && !SOLICITATION_FORM.test(clause));
}

/** 축 2 — 신원 필드 **바로 옆**에서 "이미 확인됐다"고 말하는 구간만 돌려준다(절 경계 무관). */
function presumedVerificationNearIdentity(utterance: string): string[] {
  const hits: string[] = [];
  for (const match of utterance.matchAll(new RegExp(IDENTITY_FIELD.source, "g"))) {
    const at = match.index ?? 0;
    const window = utterance.slice(
      Math.max(0, at - PRESUMPTION_WINDOW),
      at + match[0].length + PRESUMPTION_WINDOW,
    );
    if (PRESUMED_VERIFICATION.test(window)) hits.push(window);
  }
  return hits;
}

/** 두 축을 합친 판정. 어느 한쪽이라도 걸리면 결함이다. */
function identityDefects(utterance: string): string[] {
  return [
    ...clausesDemandingWithoutSolicitation(utterance).map((c) => `[요구 없음] 절="${c.slice(0, 50)}"`),
    ...presumedVerificationNearIdentity(utterance).map((w) => `[이미 확인됨] "${w.slice(0, 50)}"`),
  ];
}

test("[신원요구] 사기범 대사가 참가자 신원 정보를 언급하면 **같은 절 안에서** 요구 형태여야 한다(14종 전수)", () => {
  const violations: string[] = [];
  for (const scenarioId of Object.keys(SCENARIO_PROMPTS)) {
    for (const { field, text } of modelFacingSurfaces(scenarioId)) {
      for (const utterance of quotedUtterances(text)) {
        for (const defect of identityDefects(utterance)) {
          violations.push(`${scenarioId}.${field} :: ${defect}`);
        }
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    "참가자의 성함·생년월일·주민번호를 **이미 확인된 것처럼** 말하면 사기범이 묻지 않고 넘어가고, " +
      "참가자가 개인정보를 넘길지 결정할 순간이 사라진다(2026-07-27 사용자 실사용 신고). " +
      "압박(질문을 몰아친다)은 유지하되, **신원 정보를 언급하는 절마다** 직접 불러달라고 요구한다.",
  );
});

test("[신원요구/역검증] 신고된 원본 대사가 이 검사에 실제로 걸린다", () => {
  const reported = "성함이랑 생년월일 확인되시고요, 계좌는 본인 명의 맞으시죠? 바로 답 주셔야 오늘 처리가 돼요";
  assert.deepEqual(clausesDemandingWithoutSolicitation(reported), ["성함이랑 생년월일 확인되시고요"]);
  // 표현만 바꾼 같은 전제도 걸린다 — 문자열 금지가 아니라 요구 형태를 요구하기 때문이다.
  for (const rephrased of [
    "성함 조회됐고요, 최근에 결제하신 적 있으세요?",
    "생년월일 신원 확인 끝났습니다, 다음 절차로 갑니다",
  ]) {
    assert.ok(
      clausesDemandingWithoutSolicitation(rephrased).length > 0,
      `표현을 바꿔도 통과하면 안 된다: ${rephrased}`,
    );
  }
  // 정답 패턴(저장소에 이미 있던 것)은 통과한다.
  const correct = SCENARIO_PROMPTS["bank-security-verify-scam"].weakenedTactics.find((t) =>
    t.startsWith("본인확인 정보 직접 요구"),
  );
  assert.ok(correct);
  const correctUtterance = quotedUtterances(correct).find((u) => IDENTITY_FIELD.test(u));
  assert.ok(correctUtterance);
  assert.deepEqual(clausesDemandingWithoutSolicitation(correctUtterance), []);
});

test("[신원요구/역검증] **절 혼합 우회**가 막힌다 — 최초 구현(인용구 전체 검사)은 통과시켰다", () => {
  // reviewer가 node로 재현한 우회 문자열. 성함은 신고된 결함 그대로인데, 뒤 절의 생년월일 요구
  // 하나 때문에 "인용구 전체" 검사에서는 통과했다.
  const bypass = "성함은 확인됐고요, 생년월일만 불러주세요";

  // ① 강화 전 구현(인용구 전체를 한 덩어리로 본다)은 **통과시킨다** — 이 단언이 곧 취약점의 증거다.
  assert.equal(IDENTITY_FIELD.test(bypass), true);
  assert.equal(
    SOLICITATION_FORM.test(bypass),
    true,
    "전체 검사로는 요구 동사가 있어 통과한다 — 이것이 막아야 했던 구멍이다.",
  );

  // ② 강화 후 절 단위 검사는 **전제 절만 정확히 집어낸다**.
  assert.deepEqual(clausesDemandingWithoutSolicitation(bypass), ["성함은 확인됐고요"]);

  // ③ 그러면서 **쉼표로 이어진 명사 나열 한 절**은 쪼개지 않는다(한국어 어순 오탐 방지).
  //    현행 institutional-impersonation·bank-security-verify-scam의 실제 문구 형태다.
  for (const legit of [
    "성함, 생년월일 불러주십시오, 최근에 통장 개설하신 적 있으세요? 지금 바로 답변 주셔야 절차가 진행됩니다",
    "조회 자체가 본인 확인부터라서요, 성함이랑 생년월일, 방금 보내드린 확인번호까지 불러주세요",
  ]) {
    assert.deepEqual(clausesDemandingWithoutSolicitation(legit), [], `정상 문구를 오탐한다: ${legit}`);
  }

  // ④ 검출력이 줄지 않았다 — 수정 전 5종 문구(× persona/tactic 2자리 = 10곳)를 그대로 잡는다.
  for (const before of [
    "성함, 생년월일 확인되시고요, 최근에 통장 개설하신 적 있으세요? 지금 바로 답변 주셔야 절차가 진행됩니다",
    "성함 확인되시고요, 지금 대출 있으신 거 몇 건이세요? 바로 답 주셔야 한도 산정이 돼요",
    "성함이랑 생년월일 확인되시고요, 계좌는 본인 명의 맞으시죠? 바로 답 주셔야 오늘 처리가 돼요",
    "성함 확인되시고요, 최근에 해외 결제하신 적 있으세요? 지금 결제 진행 중이니 바로 답변 주셔야 해요",
    "성함이랑 주소 확인되시고요, 최근에 해외 직구하신 거 있으세요? 바로 답 주셔야 확인이 빨리 끝나요",
  ]) {
    assert.ok(
      clausesDemandingWithoutSolicitation(before).length > 0,
      `강화로 기존 검출력을 잃으면 안 된다: ${before}`,
    );
  }
});

// ── QA NO-GO 대응(2026-07-27) — 절 경계 목록을 빠져나가는 우회 6종 ────────────
//
// QA가 `node -e`로 **전부 PASS-THROUGH를 실측**했다. 원인은 앞선 `CLAUSE_BOUNDARY`가 (i) 쉼표
// 앞에만 종결형 조건을 걸고 (ii) 줄바꿈·슬래시·대시를 아예 경계로 안 봤기 때문이다. 특히 `-고`는
// 구어에서 매우 흔하고, 내가 고친 원본 문구도 `"성함 확인되시고요"`로 `-고` 계열이었다.
//
// **강화 방향(축을 하나 더 세웠다 — 어미를 무한정 열거하지 않는다)**:
//   | 축 | 무엇을 보나 | 경계 목록에 의존하나 |
//   |---|---|---|
//   | 1 `clausesDemandingWithoutSolicitation` | 신원 필드 절에 요구 형태가 있는가 | **예**(그래서 본체가 아니다) |
//   | 2 `presumedVerificationNearIdentity` | 신원 필드 **바로 옆**에 "이미 확인됨"이 붙었는가 | **아니오** |
// 축 2는 구분자를 보지 않으므로 **경계 목록에서 빠진 형태에도 면역**이다 — 아래 ③이 그 증거로,
// 경계 목록에 **없는** 화살표(`→`)·`-으며`·`-으니`·`-습니다만` 4종을 축 1은 놓치고 축 2가 잡는다.
const LEGACY_CLAUSE_BOUNDARY = /(?<=[다요죠까오])\s*[,·]\s*|\s*[?!.]\s*/;

/** 강화 **전** 구현(직전 커밋 `c494931`의 판정)을 그대로 재현한다 — 역검증 비교 기준. */
function legacyIdentityDefects(utterance: string): string[] {
  return utterance
    .split(LEGACY_CLAUSE_BOUNDARY)
    .filter((clause) => IDENTITY_FIELD.test(clause) && !SOLICITATION_FORM.test(clause));
}

test("[신원요구/역검증] QA가 찾은 우회 6종 — 강화 전 통과, 강화 후 전부 차단", () => {
  const qaBypasses: ReadonlyArray<readonly [string, string]> = [
    ["종결형 -네(목록 밖)", "성함 확인됐네, 생년월일만 불러주세요"],
    ["연결어미 -고", "성함은 확인됐고, 생년월일만 불러주세요"],
    ["연결어미 -는데", "성함은 확인됐는데, 생년월일만 불러주세요"],
    ["슬래시 구분", "성함 확인 완료 / 생년월일만 불러주세요"],
    ["대시 구분", "성함 확인 완료 - 생년월일만 불러주세요"],
    ["줄바꿈 구분", "성함 확인 완료\n생년월일만 불러주세요"],
  ];
  for (const [label, bypass] of qaBypasses) {
    // ① 강화 전 판정은 **통과시켰다** — 되돌리면 이 단언이 먼저 깨진다.
    assert.deepEqual(
      legacyIdentityDefects(bypass),
      [],
      `${label}: 강화 전 구현이 통과시켰다는 전제가 깨졌다(비교 기준 오류)`,
    );
    // ② 강화 후에는 잡힌다.
    assert.ok(identityDefects(bypass).length > 0, `${label}: 강화 후에도 우회된다 — ${bypass}`);
  }
});

test("[신원요구/역검증] 축 2는 절 경계 목록에 **없는** 형태도 잡는다(어미 열거에 의존하지 않는다)", () => {
  // 아래 4종은 경계 목록에 없는 구분자·어미다. 축 1은 놓치고 축 2가 잡는다 — 그것이 축 2를 둔 이유다.
  for (const beyondBoundaryList of [
    "성함 확인 완료 → 생년월일만 불러주세요",
    "성함은 확인됐으며 생년월일만 불러주세요",
    "성함 조회됐으니 생년월일만 불러주세요",
    "성함은 인증 처리됐습니다만 생년월일만 불러주세요",
  ]) {
    assert.deepEqual(
      clausesDemandingWithoutSolicitation(beyondBoundaryList),
      [],
      `이 문자열은 축 1이 놓치는 사례여야 한다(축 2의 존재 이유): ${beyondBoundaryList}`,
    );
    assert.ok(
      presumedVerificationNearIdentity(beyondBoundaryList).length > 0,
      `축 2가 잡아야 한다: ${beyondBoundaryList}`,
    );
  }
});

test("[신원요구/역검증] 축 2가 '확인'이라는 말 자체를 막지는 않는다(현행 정상 문구 오탐 0)", () => {
  // 완료형 꼬리가 붙을 때만 잡는다 — 아래는 전부 현행 콘텐츠의 실제 문구다.
  for (const legit of [
    "본인 확인이 안 되면 공범으로 분류됩니다, 주민번호 뒤 7자리랑 계좌 비밀번호 불러주세요",
    "조회 자체가 본인 확인부터라서요, 성함이랑 생년월일, 방금 보내드린 확인번호까지 불러주세요",
    "성함, 생년월일 불러주십시오, 최근에 통장 개설하신 적 있으세요? 지금 바로 답변 주셔야 절차가 진행됩니다",
  ]) {
    assert.deepEqual(identityDefects(legit), [], `정상 문구를 오탐한다: ${legit}`);
  }
});

// ── T109(2026-07-27 사용자 라이브 2차 신고) — **한 턴에 요구가 몰린다** ──────────────
//
// **무엇이 있었나**: 실제 발화 *"본인 확인을 위해 성함과 생년월일을 불러주십시오. 최근에 통장을
// 개설하신 적이 있으신가요? 지금 바로 답변 주셔야 절차가 신속하게 진행됩니다."* — 한 턴에 **요구
// 2건 + 압박 1건**. 사용자 확정: *"성함과 생년월일은 같이 묶을 수 있지만 최근에 통장을 개설했는지는
// 다음 질문으로 가는 게 좋겠다."* 실제 사기범은 한 번에 하나씩 묻고, 참가자는 **문항 단위로**
// "이상하다"를 감지한다 — 몰아치면 그 감지 기회 자체가 사라진다(이 앱이 훈련시키는 것이 그것이다).
//
// ⚠️ **바로 위 [신원요구] 게이트(T92)와 판정 대상이 다르다 — 이것이 이 게이트를 따로 세운 이유다.**
//   | 게이트 | 무엇을 보나 | 신고 발화에 대한 판정 |
//   |---|---|---|
//   | T92 [신원요구] | 신원 필드가 **요구로 발화되는가**(전제로 넘어가지 않는가) | **정상**(요구로 발화된다) |
//   | T109 [요구몰림] | 한 차례에 **독립 요구가 몇 건인가** | **위반**(신원 1 + 조회 1 = 2건) |
// 그래서 T92가 `:862`에서 *"정상 문구"* 로 못박은 문자열이 여기서는 위반이 된다. **T92 쪽 판정
// 함수는 한 글자도 바꾸지 않았다** — 바꾸면 T92가 6종 우회를 재현해 쌓은 검출력이 훼손된다
// (같은 파일 `[신원요구/역검증]` 4건이 그 자산이다). 두 게이트는 각자의 축으로 나란히 선다.
//
// ⚠️ **어디를 보나 — 조립 결과 전체다.** 이번 결함은 **규칙의 부재**가 아니라 **지시의 존재**였다:
// 5종의 [말투/톤]에 *"확인 질문을 한 번에 여러 개 이어 붙여"* 가 복제돼 있었고, 같은 형태가
// weakenedTactics 인용구에도 있었다(= persona와 tactic **두 자리**, 이 저장소의 반복 패턴).
// 규칙은 이제 공통 조립부([진행 강제])에 **한 벌만** 있으므로, 게이트도 시나리오 문서가 아니라
// **조립 산출물**을 본다 — 그래야 공통부에 몰아치기 지시가 되살아나도 잡힌다.

/**
 * ⭐ **묶음 판정표 — 무엇을 요구 1건으로 셀 것인가**(사용자·오케스트레이터 확정, 2026-07-27).
 * **이 표를 안 적으면 다음 사람이 다르게 센다.** 표에 없는 케이스는 임의 판단하지 말고 행을 추가할지
 * 먼저 물어야 한다.
 *
 *   | 요구 유형 | 예 | 판정 |
 *   |---|---|---|
 *   | 본인 확인 인적사항 | 성함·생년월일·주민번호·주소 | **한 묶음 = 1건**(사용자 확정: *"성함과 생년월일은 같이 묶을 수 있다"*) |
 *   | 별개 사실 조회 | 통장 개설 여부·대출 건수·계좌 명의·해외 결제 | **별개 턴**(사용자 확정: *"최근에 통장을 개설했는지는 다음 질문으로"*) |
 *   | 인증·자격증명 | 확인번호·OTP·비밀번호·카드번호 | **별개 턴** |
 *   | 금전·설치 행위 | 이체·송금·앱 설치 | **별개 턴** |
 *   | 압박·재촉 문장 | *"지금 바로 답변 주셔야…"* | **요구로 세지 않는다**(압박 유지는 T92 행의 확정) |
 *
 * **인증번호를 별개 턴으로 가른 근거**(미결이었고 오케스트레이터가 확정했다): 인증번호 요구는 이
 * 훈련에서 **가장 강한 단일 신호**다 — 앱의 코칭 문구 자체가 *"인증번호는 어떤 기관·상담원도 요구하지
 * 않습니다. 요구받는 것 자체가 사기 신호"* 라고 말한다. 성함·생년월일 뒤에 묶여 흘러가면 참가자가
 * 그 신호를 놓친다. 그 직접 귀결로 `bankSecurityVerifyScam`의 *"성함이랑 생년월일, 방금 보내드린
 * 확인번호까지"* 를 두 차례로 나눴다(T92가 정답 패턴으로 인용했던 문구지만, T92가 인용한 이유는
 * **요구 형태**였고 그 성질은 나눈 뒤에도 그대로다 — 위 [신원요구] 게이트가 계속 통과시킨다).
 *
 * **왜 종(kind)당 1건으로 접는가**(`countsPerMatch: false`): `"카드번호 앞 8자리랑 유효기간"`은
 * 한 가지 확인 수단을 부르는 **한 번의 요구**이지 두 건이 아니다. 표는 *종이 다르면 나눈다*고
 * 말할 뿐, 같은 종 안을 쪼개라고 하지 않는다. **사실 조회만 예외로 매치마다 센다** — 서로 다른 두
 * 조회 질문(통장 개설 + 대출 건수)은 실제로 두 건이기 때문이다.
 */
type DemandKind = "identity" | "credential" | "moneyOrInstall" | "factInquiry";

/**
 * ⭐⭐ **T112 — 사실 조회 어형 판정표(형태 슬롯). 어휘를 열거하지 않는다.**
 *
 * **왜 대안 나열이 아니라 슬롯인가**: T109의 대안 6개는 *"하신 적 있"* 처럼 **활용형 하나를 통째로**
 * 적은 것이라 어미가 한 칸만 달라져도(*"해 보신 일 있"*·*"본 적 없"*) 빠져나갔다 — T109 QA가 8개
 * 표본으로 실측했고 T112 착수 시 재현했다(8/8 미검출). 그래서 여기서는 **어간 활용부와 뒤따르는
 * 문법 요소를 분리해** 슬롯으로 적는다. ⚠️ 그래도 **모든 변형을 잡지는 못한다** — 아래 "못 잡는 형태".
 *
 * ⛔ **소재 열거 금지는 그대로다**(T109 `:1046-1048` / T112 C항): *"통장"·"대출"·"해외 결제"* 같은
 * 명사는 이 표에 **한 개도 없다.** 새 소재가 들어와도 어형이 같으면 잡힌다.
 *
 *   | 슬롯 | 형태 | 예 |
 *   |---|---|---|
 *   | ① 경험·이력 | [존대·과거 활용] + [의존명사] + [있/없] | *"개설해 **보신 일 있**나요"* · *"받아 **본 적 없**으신가요"* · *"결제**하신 이력이 있**나요"* |
 *   | ② 간접 의문 | [존대 어미] + [-는지/-ㄴ지] | *"결제를 **하셨는지** 궁금한데요"* · *"몇 건 갖고 **계신지** 말씀해"* |
 *   | ③ 존대 과거 의문 종결 | 셨 + [의문 종결어미] | *"신청**하셨나요**"* · *"새로 트**셨나요**"* |
 *   | ④ 여부 조회 | 여부 + [알림·확인 요구 동사] | *"개설 **여부를 알려**주시겠어요"* |
 *
 * ⭐ **오탐으로 배운 경계(추정이 아니라 실측 — 넓힌 뒤 조립 전수 스캔에서 실제로 걸렸다)**
 *   ② `-는지/-ㄴ지`는 **의문 어미이면서 동시에 내포절 어미**다. 후행 조건 없이 잡으면
 *   `institutional-impersonation`의 정상 문면 *"잔액 얼마 **있으신지 확인해서** 전액 이체해 주십시오"*
 *   가 `이체`와 겹쳐 **요구 2건으로 오판**된다(조립 24벌 × 1문면에서 실측, T113 역검증도 동반 실패).
 *   이 문장은 *"내가 확인하겠다"* 는 **내포절**이지 참가자에게 던지는 질문이 아니다. 그래서 ②는
 *   뒤에 **참가자에게 답을 요구하는 요소**(궁금·알려·말씀·여쭤·답변·확인해 주…) 또는 **물음표·문장 끝**
 *   이 올 때만 센다. ⚠️ *"확인해서"*(화자가 확인)와 *"확인해 주"*(참가자가 확인)를 가르는 것이
 *   이 경계의 핵심이다 — `확인`만 넣으면 오탐이 그대로 돌아온다.
 *   ③의 *"셨어요"* 도 같은 이유로 **물음표가 있을 때만** 센다(*"입금하셨어요."* 는 서술문이다).
 *
 * ⚠️ **못 잡는 형태(자기 고지 — 이 태스크에서 닫지 않는다). *"이제 다 잡는다"* 가 아니다.**
 *   · 존대가 없는 반말·평서 의문: *"통장 개설했어?"* · *"대출 있어요?"*
 *   · 존대이되 과거·의존명사·`-는지`를 안 쓰는 존재 의문: *"대출 있으신가요?"* · *"카드 쓰시나요?"*
 *   · `-시는지`(현재 존대): *"카드 쓰시는지 알려주세요"* — ②는 `셨`/`X신`만 본다
 *   · ②의 후행 요소 목록 밖에 있는 요구 동사: *"결제하셨는지 체크 부탁드립니다"*(`체크`는 목록 밖)
 *   · 명사형 조회: *"최근 거래 내역 확인 부탁드립니다"* (요구 동사만 있고 의문 형태가 없다)
 *   · 어형이 아니라 **문맥**으로만 조회인 것: *"그 계좌, 언제부터였죠?"*
 *   이들을 덮으려면 축을 또 늘려야 하고 그때마다 오탐 면적이 커진다(T110이 4라운드를 쓴 자리다).
 *   **넓힐 때는 아래 오탐 단언(`[T109/오탐]`)과 조립 전수 스캔을 먼저 통과시킬 것.**
 */
const FACT_INQUIRY_SLOTS: ReadonlyArray<{ slot: string; source: string }> = [
  // ① [존대·과거 활용] + [의존명사] + [있/없]
  { slot: "경험·이력", source: "(?:보신|보셨|본|하신|하셨|받으신|받으셨|되신|쓰신|드신)\\s*(?:적|일|경험|이력|기록|내역|건)\\s*(?:이|가|은|는)?\\s*(?:있|없)" },
  // ② [존대 어미] + [-는지/-ㄴ지] + **참가자에게 답을 요구하는 후행 요소**(또는 문장 끝·물음표)
  //    ⚠️ 후행 조건이 없으면 안 된다 — 실측 오탐 1건이 여기서 났다(아래 "오탐으로 배운 경계" ②).
  {
    slot: "간접 의문",
    source:
      "(?:셨|[으하계이]신)\\s*(?:는지|은지|지)" +
      "(?=\\s*[?？]|[\\s,.…]*(?:궁금|알려|말씀|여쭤|여쭙|답변|답 주|말해|얘기해|확인해\\s*주|확인\\s*좀|확인\\s*부탁)|\\s*$)",
  },
  // ③ 셨 + [의문 종결어미]
  { slot: "존대 과거 의문 종결", source: "셨\\s*(?:나요|습니까|는가요|은가요|어요\\s*\\?)" },
  // ④ 여부 + [참가자에게 답을 요구하는 요소] — ②와 같은 경계다(`확인`만 두면 규칙 산문
  //    *"명의 도용 여부 확인(본인 확인)으로 갈아탄다"* 가 걸린다. 실측: 조립 원문 24벌).
  {
    slot: "여부 조회",
    source: "여부\\s*(?:를|가|는)?\\s*(?:알려|말씀|여쭤|여쭙|답변|답 주|말해|확인해\\s*주|확인\\s*좀|확인\\s*부탁)",
  },
];

const DEMAND_KINDS: ReadonlyArray<{
  kind: DemandKind;
  /** 표의 "요구 유형" 열. 위반 메시지에 그대로 실린다. */
  label: string;
  pattern: RegExp;
  /** true면 매치마다 1건(사실 조회), false면 종 전체가 1건(나머지 3종). */
  countsPerMatch: boolean;
  /** 죽은 정규식 방지 — 이 패턴이 실제로 잡아야 하는 최소 샘플. */
  selfSample: string;
}> = [
  {
    kind: "identity",
    label: "본인 확인 인적사항",
    pattern: /성함|생년월일|주민(등록)?번호|주소/,
    countsPerMatch: false,
    selfSample: "성함이랑 생년월일 불러주세요",
  },
  {
    kind: "credential",
    label: "인증·자격증명",
    pattern: /인증번호|확인번호|비밀번호|카드\s*번호|보안\s*카드|유효기간|OTP/,
    countsPerMatch: false,
    selfSample: "방금 보내드린 확인번호 불러주세요",
  },
  {
    kind: "moneyOrInstall",
    label: "금전·설치 행위",
    pattern: /이체|송금|입금|상환|보내\s*(주|줘|세요|주세요)|넣어\s*주|설치/,
    countsPerMatch: false,
    selfSample: "지금 바로 이체해 주세요",
  },
  {
    // ⚠️ **어휘가 아니라 형태로 잡는다.** "통장 개설"·"해외 결제" 같은 소재를 열거하면 다음
    // 시나리오가 새 소재를 쓰는 순간 조용히 빠져나간다(T86에서 데인 방식이다). 사실 조회는
    // **"참가자의 과거·현재 사실을 되묻는 의문형"** 이라는 공통 형태를 가지므로 그쪽을 본다.
    //
    // T112: 앞의 6개는 T109가 적은 **활용형 통째** 대안이라 어미가 한 칸만 달라지면 새 나갔다.
    // 뒤에 `FACT_INQUIRY_SLOTS`(형태 슬롯 4개)를 이어 붙여 그 구멍을 메운다. **기존 6개는 지우지
    // 않는다** — T109가 신고 발화로 쌓은 검출 자산이고, 슬롯과 겹치는 자리는 정규식 교대(alternation)
    // 특성상 **같은 구간을 두 번 세지 않는다**(왼쪽부터 비겹침 매칭).
    kind: "factInquiry",
    label: "별개 사실 조회",
    pattern: new RegExp(
      [
        "하신\\s*적\\s*(이\\s*)?(있|없)",
        "하신\\s*거\\s*(있|없)",
        "있으신\\s*거\\s*몇",
        "몇\\s*(건|번|개)(이세|인가|예)",
        "맞으시죠",
        "맞으신가요",
        ...FACT_INQUIRY_SLOTS.map(({ source }) => source),
      ].join("|"),
    ),
    countsPerMatch: true,
    selfSample: "최근에 통장 개설하신 적 있으세요?",
  },
];

/** 한 차례 발화(인용구 하나)에 들어 있는 **독립 요구 건수**를 판정표대로 센다. */
function demandsInUtterance(utterance: string): string[] {
  const found: string[] = [];
  for (const { label, pattern, countsPerMatch } of DEMAND_KINDS) {
    if (!countsPerMatch) {
      const match = pattern.exec(utterance);
      if (match !== null) found.push(`${label}("${match[0]}")`);
      continue;
    }
    for (const match of utterance.matchAll(new RegExp(pattern.source, "g"))) {
      found.push(`${label}("${match[0]}")`);
    }
  }
  return found;
}

/**
 * **몰아치기 지시 금지** — 이번 결함의 실제 원인은 인용구가 아니라 그 위의 **지시 문장**이었다
 * (*"확인 질문을 한 번에 여러 개 이어 붙여"*). 인용구만 고치면 모델은 지시 쪽을 따라간다.
 *
 * ⚠️ **금지형 문맥은 예외로 둔다** — *"…몰아치지 않는다"* 같은 문장은 규칙을 **지키는** 문장이다.
 * 매치 직후 구간에 부정 표현이 있으면 위반으로 세지 않는다(T86에서 세운 관례와 같다).
 */
const STACKING_DIRECTIVE = /한\s*번에\s*여러|이어\s*붙[여인이]|연달아|쏟아[붓내]|몰아치|한꺼번에|속사포/;
const NEGATION_AFTER = /않|말고|말 것|금지|없이/;
/** 부정 표현을 찾을 매치 직후 구간의 길이. 좁게 잡아 무관한 부정문에 면제되지 않게 한다. */
const NEGATION_WINDOW = 14;

function stackingDirectives(text: string): string[] {
  const hits: string[] = [];
  for (const match of text.matchAll(new RegExp(STACKING_DIRECTIVE.source, "g"))) {
    const at = match.index ?? 0;
    const after = text.slice(at + match[0].length, at + match[0].length + NEGATION_WINDOW);
    if (NEGATION_AFTER.test(after)) continue; // "몰아치지 않는다" = 규칙을 지키는 문장
    hits.push(text.slice(Math.max(0, at - 15), at + match[0].length + 15).replace(/\n/g, " "));
  }
  return hits;
}

// ══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ **T113 — 조립 산출물 전수 스캔이 축을 다 돌지 않던 것을 고친다(2026-07-28).**
//
// **무엇이 사각이었나(착수 시 실측 — 추정이 아니다)**: 이 헬퍼는 `difficultyLevel` 4값 ×
// `inCallSmsEnabled` 2값 = **시나리오당 8조합**만 돌았는데 `buildSystemPrompt`의 옵션은 **5개**다.
// 나머지 3개(`verifyInterceptEnabled`·`l3Procedural`·`turnInstruction`)를 순회하지 않았고,
// 그래서 **켜져야만 삽입되는 블록의 인용구가 한 번도 검사된 적이 없었다.** 실측 결과:
//   · `verifyInterceptEnabled: true` 전용 인용구 **2건** — `"잠시만요, 확인 부서를 연결해 드리겠습니다"` ·
//     `"옆에서 확인해 보니"`(둘 다 `promptAssembly.ts`의 `VERIFY_INTERCEPT_RULE` 안)
//   · `l3Procedural: true` 전용 인용구 **5건**(`ADVANCED_L3_PROCEDURAL` 안)
//   · `turnInstruction`으로 주입되는 문자열의 인용구 **44건**(확인 무력화 카탈로그 36 + 문자 카탈로그 8)
// **지금 그 문구들이 무해한 것은 검사를 통과해서가 아니라 검사 대상이 아니었기 때문이다.**
//
// ⚠️ **축 3개를 전부 곱하지 않는다 — 판정표(조합 폭발 방지, T113 D항 근거 기록)**
//   | 옵션 | 채택 | 근거 |
//   |---|---|---|
//   | `verifyInterceptEnabled` | **곱한다**(2값) | 상시 블록과 **함께** 조립됐을 때만 보이는 것이 있다 — `stackingDirectives`는 매치 직후 14자를 보므로 블록 경계를 넘는다. 시나리오당 8 → 16. |
//   | `l3Procedural` | **고급에만 곱한다**(난이도 변형 4 → 5) | `buildDifficultyBlock`이 고급이 아니면 이 값을 **읽지 않는다**(`promptAssembly.ts:290-293`). 초·중급에 곱하면 **완전히 같은 문자열**이 한 벌씩 더 생길 뿐이라 검출력이 0이고 조합만 2배가 된다. |
//   | `turnInstruction` | **곱하지 않고 더한다**(+22벌) | 이 옵션은 상수가 아니라 **호출부가 넘기는 문자열**이라 "축"이 아니라 **값의 집합**이다(실제 값 22종 — 아래 `turnInstructionSources`). 22를 곱하면 시나리오당 20 → 440(총 6,160)이 되는데, 두 게이트의 판정은 **인용구 단위 / 매치 지점 ±14자**라 곱해서 얻는 검출력이 없다. 각 값을 **자기 시나리오에 한 번씩** 얹어 스캔 목록에 넣는 것으로 같은 사각을 없앤다. |
//
// ⚠️ **남는 사각(자기 고지 — 이 태스크에서 닫지 않는다). 노출되는 게이트를 이름으로 적는다.**
//
// 두 게이트의 노출도가 **다르다.** *"판정 폭"* 이라는 추상어로 뭉뚱그리면 다음 사람이
// *"인용구 단위니까 per-utterance 게이트만 위험하다"* 로 잘못 읽는다.
//   | 게이트 | 판정 단위 | 이 사각에 노출되나 |
//   |---|---|---|
//   | `[T109/요구몰림] …독립 요구가 2건 이상… ` (`demandsInUtterance`) | **인용구 1개**를 홀로 본다 | **노출 안 됨.** 인용구는 어느 블록 옆에 놓이든 판정이 같다 |
//   | `[T109/요구몰림] 몰아치기 지시…` (**`stackingDirectives`**) | **연결된 전체 텍스트** 위를 도는 **윈도 스캐너**(매치 직후 `NEGATION_WINDOW`=14자로 금지형 예외를 판정하고, 보고용으로 ±15자를 자른다) | **⚠️ 노출됨** |
//
// **⇒ 구체적으로 무엇이 도달 불가인가**: `turnInstruction`은 지금 **고정 1조합**에서만 검사된다
// (`advanced` + `l3Procedural:true` + `inCallSmsEnabled:true` + `verifyInterceptEnabled:true` —
// 아래 조립 코드). 그런데 조립 순서상 턴 지시 **바로 앞**은 난이도 블록이다. 따라서
// *"난이도 블록 꼬리의 몰아치기 매치가, 그 뒤에 놓인 **특정 턴 지시 문자열** 때문에 금지형 예외
// 판정이 뒤집히는 경우"* 는 — 예컨대 `beginner` 블록 꼬리 + 어떤 턴 지시 — **조합이 조립된 적이
// 없어 구조적으로 도달 불가**다. `stackingDirectives`의 14자 윈도가 블록 경계를 넘기 때문에
// 생기는 사각이며, `demandsInUtterance` 쪽에는 이 사각이 없다.
//
// ⛔ **이 사각을 여기서 닫지 않는다** — 닫으려면 턴 지시를 난이도 축과 곱해야 하고(조합 6,160벌),
// 그건 별건이다. **적어 두는 것**이 이 자리의 요구다.
//
// ⛔⛔ **속도 때문에 축을 쳐내지 말 것 — 이 문단이 그 요청이다.**
// 이 확장으로 `[T109/요구몰림]` 게이트 1이 **36.0ms → 231.3ms(약 6.4배)** 가 됐다(실측, per-test
// `duration_ms`). 절대값은 0.2초이고 스위트 전체 시간은 회차 편차(11.7~21.4초)에 묻힌다 —
// **최적화 대상이 아니다.** 이 저장소는 **오탐·고마찰로 게이트를 잃은 전례**가 있고, 여기서 축을
// 줄이면 되돌아오는 것은 위 실측이 보여 준 **무검사 인용구 51건**(verify 2 + l3 5 + 턴지시 44)이다.
// 축을 줄여야 할 실제 사유(예: CI 예산 초과)가 생기면 **줄이기 전에 무엇이 무검사로 돌아가는지
// 위 판정표대로 다시 실측해 적을 것.**
// ══════════════════════════════════════════════════════════════════════════════

/** 난이도 변형 — `l3Procedural`은 고급에서만 읽히므로 고급에만 붙인다(위 판정표 2행). */
const ASSEMBLY_LEVEL_VARIANTS: ReadonlyArray<{
  suffix: string;
  opts: { difficultyLevel?: DifficultyLevel; l3Procedural?: boolean };
}> = [
  { suffix: "기본", opts: {} },
  { suffix: "beginner", opts: { difficultyLevel: "beginner" } },
  { suffix: "intermediate", opts: { difficultyLevel: "intermediate" } },
  { suffix: "advanced", opts: { difficultyLevel: "advanced" } },
  { suffix: "advanced+L3절차", opts: { difficultyLevel: "advanced", l3Procedural: true } },
];

/**
 * `turnInstruction`으로 **실제로 주입되는** 문자열 전수 — 호출부는 4곳뿐이다
 * (`roleplay/index.ts:240·247·249·251`, `roleplay/openingLine.ts:84`).
 *
 * ⚠️ 여기에 없는 값이 호출부에 생기면 그 문자열은 다시 무검사 구간이 된다. 새 주입 지점을 만들면
 * **이 목록에 행을 추가할 것.**
 */
function turnInstructionSources(): Array<{ scenarioId?: string; label: string; value: string }> {
  const out: Array<{ scenarioId?: string; label: string; value: string }> = [
    { label: "오프닝", value: OPENING_TURN_INSTRUCTION },
    { label: "모의설치응낙", value: MOCK_INSTALL_CONSENT_INSTRUCTION },
  ];
  for (const [scenarioId, item] of Object.entries(VERIFY_INTERCEPT)) {
    out.push({ scenarioId, label: `확인안내:${item.offerId}`, value: item.announceInstruction });
    out.push({ scenarioId, label: `재연결:${item.offerId}`, value: item.reconnectInstruction });
  }
  for (const [scenarioId, items] of Object.entries(IN_CALL_SMS)) {
    for (const item of items) {
      out.push({ scenarioId, label: `문자도착:${item.smsId}`, value: item.announceInstruction });
    }
  }
  return out;
}

/** 조립 결과 전수 — 조립 옵션 5개를 모두 돈다(T113 판정표 그대로). */
function assembledPrompts(): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = [];
  const scenarioIds = Object.keys(SCENARIO_PROMPTS);
  for (const scenarioId of scenarioIds) {
    for (const variant of ASSEMBLY_LEVEL_VARIANTS) {
      for (const inCallSmsEnabled of [false, true]) {
        for (const verifyInterceptEnabled of [false, true]) {
          out.push({
            label:
              `${scenarioId}[${variant.suffix}` +
              `${inCallSmsEnabled ? "/문자" : ""}${verifyInterceptEnabled ? "/확인안내" : ""}]`,
            text: buildSystemPrompt(SCENARIO_PROMPTS[scenarioId], {
              ...variant.opts,
              inCallSmsEnabled,
              verifyInterceptEnabled,
            }),
          });
        }
      }
    }
  }
  // 턴 지시는 곱하지 않고 더한다(판정표 3행) — 값마다 **운영에서 실제로 성립하는 조합**에 한 번씩.
  // 확인 무력화는 `카탈로그 보유 && 고급`에서만 켜지므로(`roleplay/index.ts:186`) 그 조합을 쓴다.
  const fallbackScenarioId = scenarioIds[0];
  for (const { scenarioId, label, value } of turnInstructionSources()) {
    const targetId = scenarioId ?? fallbackScenarioId;
    out.push({
      label: `${targetId}[턴지시:${label}]`,
      text: buildSystemPrompt(SCENARIO_PROMPTS[targetId], {
        difficultyLevel: "advanced",
        l3Procedural: true,
        inCallSmsEnabled: true,
        verifyInterceptEnabled: true,
        turnInstruction: value,
      }),
    });
  }
  return out;
}

test("[T109/요구몰림] 사기범 대사 한 차례에 독립 요구가 2건 이상 들어가지 않는다(조립 결과 전수)", () => {
  const violations: string[] = [];
  for (const { label, text } of assembledPrompts()) {
    for (const utterance of quotedUtterances(text)) {
      const demands = demandsInUtterance(utterance);
      if (demands.length < 2) continue;
      violations.push(`${label} :: [${demands.join(" + ")}] "${utterance.slice(0, 60)}"`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    "한 차례에 요구를 몰아넣으면 참가자가 **문항 단위로** 의심할 기회를 잃는다(2026-07-27 사용자 " +
      "라이브 신고). 인적사항(성함·생년월일 등)은 한 묶음으로 함께 물어도 되지만, 사실 조회·인증 " +
      "수단·금전/설치 행위는 각각 다음 차례로 나눈다. 압박은 질문 개수가 아니라 재촉으로 만든다.",
  );
});

test("[T109/요구몰림] 몰아치기를 지시하는 문장이 남아 있지 않다(조립 결과 전수)", () => {
  const violations: string[] = [];
  for (const { label, text } of assembledPrompts()) {
    for (const hit of stackingDirectives(text)) violations.push(`${label} :: "${hit}"`);
  }
  assert.deepEqual(
    violations,
    [],
    "인용구만 고치고 지시 문장을 두면 모델은 지시 쪽을 따라간다 — 이번 결함의 발생 경로가 " +
      "정확히 그것이었다(5종 [말투/톤]의 '확인 질문을 한 번에 여러 개 이어 붙여').",
  );
});

test("[T109/역검증] 신고된 원본 발화가 이 게이트에 실제로 걸린다(죽은 게이트 방지)", () => {
  // ⚠️ 오염 샘플은 **테스트 코드 안에서만** 만든다(콘텐츠에 되돌려 넣지 않는다).
  const reported = "본인 확인을 위해 성함과 생년월일을 불러주십시오. 최근에 통장을 개설하신 적이 있으신가요? 지금 바로 답변 주셔야 절차가 신속하게 진행됩니다";
  const demands = demandsInUtterance(reported);
  assert.equal(demands.length, 2, `신고 발화가 2건으로 세어져야 한다(실제: ${demands.join(" + ")})`);

  // 수정 전 5종에 실제로 있던 문구도 전부 걸린다 — "1종만 고치고 끝내기"를 막는다.
  for (const before of [
    "성함, 생년월일 불러주십시오, 최근에 통장 개설하신 적 있으세요? 지금 바로 답변 주셔야 절차가 진행됩니다",
    "성함부터 불러주세요, 지금 대출 있으신 거 몇 건이세요? 바로 답 주셔야 한도 산정이 돼요",
    "성함이랑 생년월일 불러주세요, 계좌는 본인 명의 맞으시죠? 바로 답 주셔야 오늘 처리가 돼요",
    "성함부터 불러주세요, 최근에 해외 결제하신 적 있으세요? 지금 결제 진행 중이니 바로 답변 주셔야 해요",
    "성함이랑 주소부터 불러주세요, 최근에 해외 직구하신 거 있으세요? 바로 답 주셔야 확인이 빨리 끝나요",
    // 인증·자격증명 분리(오케스트레이터 확정) — 수정 전 3곳.
    "조회 자체가 본인 확인부터라서요, 성함이랑 생년월일, 방금 보내드린 확인번호까지 불러주세요",
    "본인 확인이 안 되면 공범으로 분류됩니다, 주민번호 뒤 7자리랑 계좌 비밀번호 불러주세요",
    "수취인 본인 확인해야 해서요, 주민번호 뒤 7자리랑 카드번호 불러주시겠어요?",
  ]) {
    assert.ok(
      demandsInUtterance(before).length >= 2,
      `수정 전 문구가 안 걸리면 게이트가 죽은 것이다: ${before}`,
    );
  }

  // 지시 문장 쪽 역검증 — 수정 전 5종 [말투/톤]의 실제 문구와 라벨.
  for (const directive of [
    "확인 질문을 한 번에 여러 개 이어 붙여 생각할 틈을 주지 않되",
    "정보를 직접 요구하는 질문을 연달아 쏟아붓는다",
    "속사포 확인질문",
  ]) {
    assert.ok(stackingDirectives(directive).length > 0, `지시 문장이 안 걸린다: ${directive}`);
  }
});

test("[T109/역검증] 각 요구 유형 패턴이 자기 샘플을 잡는다(죽은 정규식 방지)", () => {
  for (const { label, pattern, selfSample } of DEMAND_KINDS) {
    assert.equal(pattern.test(selfSample), true, `${label}: 자기 양성 샘플을 못 잡는다 — 죽은 패턴이다`);
  }
});

test("[T109/오탐] 정상 문구는 1건 이하로 세고, 금지형 지시 문장은 위반이 아니다", () => {
  // ① 판정표대로 요구가 **1건 이하**인 것들 — 전부 통과해야 한다(건수를 그대로 단언한다).
  for (const [expected, legit] of [
    [1, "성함이랑 생년월일 불러주십시오, 지금 바로 답변 주셔야 절차가 진행됩니다"], // 인적사항 묶음 = 1
    [1, "성함이랑 주민번호, 주소까지 불러주세요"], // 인적사항 3개도 한 묶음 = 1
    [1, "최근에 통장 개설하신 적 있으세요?"], // 사실 조회 1건
    [1, "카드번호 앞 8자리랑 유효기간 불러주세요"], // 같은 종(확인 수단) = 1
    [0, "지금 바로 답변 주셔야 절차가 신속하게 진행됩니다"], // 압박만 — 요구로 세지 않는다
  ] as const) {
    const demands = demandsInUtterance(legit);
    assert.equal(demands.length, expected, `오탐: "${legit}" → [${demands.join(" + ")}]`);
  }

  // ② 금지형 문맥은 면제된다 — 규칙 자체를 서술하는 문장이 게이트에 걸리면 규칙을 못 쓴다.
  for (const negated of [
    "여러 수법을 한 번에 몰아서 늘어놓지 않는다",
    "질문을 연달아 쏟아붓지 않는다",
    "확인 질문을 한 번에 여러 개 이어 붙이지 말고 하나씩 던진다",
  ]) {
    assert.deepEqual(stackingDirectives(negated), [], `금지형 문장을 오탐한다: ${negated}`);
  }
});

// ── T112 — 사실 조회의 **어형 구멍**(T109 QA 실측 8/8 미검출, 2026-07-28) ────────────────────
//
// ⚠️ **표본마다 독립 테스트다.** 8개를 한 테스트에 섞으면 하나만 잡혀도 통과한다(T108에서 확인된
// 함정). 아래 루프는 표본 1개당 `test()` 1개를 만들고, 매치된 문자열을 `t.diagnostic`으로 출력한다.
// ⚠️ 오염 샘플은 **테스트 코드 안에서만** 만든다(`:1254` 관례 — 콘텐츠에 되돌려 넣지 않는다).
//
// **건수를 `1`로 단언하는 이유**: `factInquiry`만 `countsPerMatch: true`라 패턴을 넓히면 한 발화가
// 2건으로 세어질 수 있고 그건 곧 오탐이다(T112 D항 (i)). *"잡히기만 하면 된다"*(`>= 1`)로 두면
// 그 오탐이 이 테스트를 통과한다.
const FACT_INQUIRY_FORMS: ReadonlyArray<{ slot: string; sample: string }> = [
  { slot: "①경험(보신 + 일 + 있)", sample: "최근에 통장을 개설해 보신 일 있나요" },
  { slot: "①경험(본 + 적 + 없)", sample: "대출을 받아 본 적 없으신가요" },
  { slot: "①경험(하신 + 이력 + 있)", sample: "카드 결제하신 이력이 있나요" },
  { slot: "②간접의문(셨 + 는지)", sample: "해외 결제를 하셨는지 궁금한데요" },
  { slot: "②간접의문(계신 + 지)", sample: "대출 몇 건 갖고 계신지 말씀해 주세요" },
  { slot: "③존대과거 의문종결(셨나요)", sample: "혹시 최근에 대출 신청하셨나요" },
  { slot: "③존대과거 의문종결(셨나요/불규칙 어간)", sample: "통장을 새로 트셨나요" },
  { slot: "④여부 조회", sample: "통장 개설 여부를 알려주시겠어요" },
];

for (const { slot, sample } of FACT_INQUIRY_FORMS) {
  test(`[T112/역검증] 사실 조회 어형 ${slot} 을 1건으로 센다`, (t) => {
    const demands = demandsInUtterance(sample);
    t.diagnostic(`[T112] "${sample}" → [${demands.join(" + ") || "미검출"}]`);
    assert.equal(
      demands.length,
      1,
      `사실 조회 어형이 1건으로 안 세어진다(0이면 구멍, 2 이상이면 오탐): "${sample}" → ` +
        `[${demands.join(" + ") || "미검출"}]`,
    );
  });
}

// ── T113 — 새로 순회하는 축이 **실제로 스캔 목록에 들어왔는지**와 **거기서 잡히는지** ──────────
//
// ⚠️ 축마다 **독립 테스트 + 독립 오염 샘플**이다. 한 테스트에 섞으면 축 하나만 살아 있어도 통과한다.
// ⚠️ 오염 샘플은 **테스트 코드 안에서만** 만든다(`:1147` 관례 — 콘텐츠에 되돌려 넣지 않는다).

/** 축 전용 블록의 고유 표지 — 그 축을 켜야만 조립 산출물에 등장한다. */
const VERIFY_BLOCK_MARKER = "[확인 안내 — 이 훈련에서만 적용]";
const L3_BLOCK_MARKER = "[난이도 — 고급(심화): 절차로 정당화한다]";
/** 종전 축에서도 돌던 블록 — 축이 조용히 줄어드는 것을 막는 대조군이다. */
const BEGINNER_MARKER = "[난이도 — 초급: 수법이 눈에 띄게 드러나게]";

/** 조립 산출물 전수에서 요구가 2건 이상인 인용구만 모은다(= 요구몰림 게이트의 판정 그대로). */
function stackedUtterances(text: string): string[] {
  return quotedUtterances(text).filter((u) => demandsInUtterance(u).length >= 2);
}

test("[T113] 축 전용 블록이 스캔 목록에 실제로 들어왔다(`verifyInterceptEnabled`·`l3Procedural`·`turnInstruction`)", (t) => {
  const all = assembledPrompts();
  // 스캔 대상 규모를 **출력으로 남긴다** — 다음 사람이 축을 줄이면 이 수치가 먼저 눈에 띈다.
  const uniqueQuotes = new Set(all.flatMap(({ text }) => quotedUtterances(text)));
  t.diagnostic(
    `[T113] 조립 조합 ${all.length}벌(종전 112벌) · 검사 대상 인용구 ${uniqueQuotes.size}종(종전 310종)`,
  );
  for (const [axis, marker] of [
    ["verifyInterceptEnabled", VERIFY_BLOCK_MARKER],
    ["l3Procedural", L3_BLOCK_MARKER],
  ] as const) {
    assert.ok(
      all.some(({ text }) => text.includes(marker)),
      `${axis} 축을 켠 조립본이 스캔 목록에 없다 — 그 블록의 인용구는 아무도 검사하지 않는다(T113).`,
    );
  }
  // 턴 지시는 값의 집합이라 표지가 아니라 **값 자체**가 들어왔는지로 확인한다.
  const scanned = all.map(({ text }) => text);
  for (const { label, value } of turnInstructionSources()) {
    assert.ok(
      scanned.some((text) => text.includes(value)),
      `턴 지시 "${label}"이 스캔 목록에 없다 — 조립 산출물의 일부인데 무검사 구간으로 남는다.`,
    );
  }
  // 종전 축(난이도 4 × 문자 2)에서만 등장하던 인용구도 그대로 남아 있어야 한다(축소 방지).
  assert.ok(
    scanned.some((text) => text.includes(BEGINNER_MARKER)),
    "초급 블록이 스캔 목록에서 사라졌다 — 축이 줄었다.",
  );
});

test("[T113/역검증] `verifyInterceptEnabled` 블록에 위반 인용구를 넣으면 실제로 걸린다", () => {
  const scenarioId = Object.keys(VERIFY_INTERCEPT)[0];
  const prompt = SCENARIO_PROMPTS[scenarioId];
  const on = buildSystemPrompt(prompt, { verifyInterceptEnabled: true });
  const off = buildSystemPrompt(prompt, { verifyInterceptEnabled: false });

  // ① 축을 끄면 그 구간이 **아예 없다** = 종전 축 집합은 이 구간을 본 적이 없다(T113이 없앤 사각).
  assert.ok(on.includes(VERIFY_BLOCK_MARKER));
  assert.equal(off.includes(VERIFY_BLOCK_MARKER), false);

  // ② 그 구간에 위반 인용구를 넣으면 게이트 판정이 잡는다.
  const sample = "성함이랑 생년월일 불러주시고, 방금 보내드린 인증번호도 불러주세요";
  const polluted = on.replace(VERIFY_BLOCK_MARKER, `${VERIFY_BLOCK_MARKER}\n- 예: "${sample}"`);
  assert.deepEqual(stackedUtterances(polluted), [sample]);
  assert.deepEqual(stackedUtterances(on), [], "현행 문면에서는 오탐 0건이어야 한다");
});

test("[T113/역검증] `l3Procedural` 블록에 위반 인용구를 넣으면 실제로 걸린다", () => {
  const scenarioId = Object.keys(SCENARIO_PROMPTS)[0];
  const prompt = SCENARIO_PROMPTS[scenarioId];
  const on = buildSystemPrompt(prompt, { difficultyLevel: "advanced", l3Procedural: true });
  const off = buildSystemPrompt(prompt, { difficultyLevel: "advanced" });

  assert.ok(on.includes(L3_BLOCK_MARKER));
  assert.equal(off.includes(L3_BLOCK_MARKER), false);

  const sample = "주민번호 뒤 7자리 불러주시고, 그대로 이체해 주세요";
  const polluted = on.replace(L3_BLOCK_MARKER, `${L3_BLOCK_MARKER}\n- 예: "${sample}"`);
  assert.deepEqual(stackedUtterances(polluted), [sample]);
  assert.deepEqual(stackedUtterances(on), [], "현행 문면에서는 오탐 0건이어야 한다");
});

test("[T113/역검증] `turnInstruction`으로 들어온 위반 인용구가 실제로 걸린다", () => {
  const scenarioId = Object.keys(SCENARIO_PROMPTS)[0];
  const sample = "카드번호 불러주시고, 최근에 해외 결제하신 적 있으세요?";
  // 이 축만 **주입 자체가 실제 옵션**이라 우회 없이 끝까지 통과시킬 수 있다.
  const polluted = buildSystemPrompt(SCENARIO_PROMPTS[scenarioId], {
    turnInstruction: `[턴 지시] 이렇게 말하라: "${sample}"`,
  });
  assert.deepEqual(stackedUtterances(polluted), [sample]);
  const clean = buildSystemPrompt(SCENARIO_PROMPTS[scenarioId], {});
  assert.deepEqual(stackedUtterances(clean), []);
});

// ⭐ **T113의 재발 방지 — 옵션이 늘면 스캔도 늘어야 한다.**
// 이번 사각의 원인은 "`buildSystemPrompt`에 옵션이 3개 더 생겼는데 스캔 헬퍼가 안 따라갔다"이다.
// 그 연결이 주석에만 있으면 다음 옵션에서 같은 일이 반복된다 — 여기서 기계로 잇는다.
// ⚠️ **주석은 걷어내고 본다**(자기 주석에 걸려 거짓 초록이 나는 것을 막는다 — 이 저장소의 반복 함정).
//
// ⚠️⚠️ **이것은 약한 불변식이다 — 강한 것으로 오해하지 말 것(reviewer Minor #2).**
// 판정이 `helperRegion.includes(key)` **단순 부분 문자열 매치**라, 옵션 키가 **무관한 식별자의
// 부분 문자열**로 우연히 등장하기만 해도 통과한다. 지금 키 5개(`difficultyLevel`·`inCallSmsEnabled`·
// `verifyInterceptEnabled`·`l3Procedural`·`turnInstruction`)는 충분히 길고 특이해서 실위험이 없지만,
// **짧고 흔한 이름의 옵션이 생기면(예: `mode`·`level`) 이 게이트는 조용히 만족된다.**
// ⇒ 그런 옵션이 추가되면 판정을 **식별자 경계(`\bkey\b`)나 AST 대조**로 올릴 것. 지금 올리지 않은
// 이유는 T108이 도입한 `typescript` API 대조가 이 자리엔 과설계이기 때문이며, **그 판단이 바뀌는
// 조건은 위 한 줄로 특정돼 있다.**
//
// ⚠️ **"축 하나를 지우면 5/5 전부 걸린다"는 확인은 수동 프로브였고 커밋되지 않았다(Minor #3).**
// 실행한 것: 이 파일 소스의 **사본**에서 옵션 키를 하나씩 `REMOVED_AXIS`로 치환해 아래 판정식을
// 돌렸고, 5개 각각에 대해 그 키 하나만 누락으로 보고됐다(2026-07-28 착수 세션 실측).
// ⛔ **자동으로 강제되고 있지 않다** — 재확인하려면 같은 프로브를 다시 손으로 돌려야 한다.
const FUNCTIONS_SRC_DIR_T113 = path.resolve(__dirname, "../../../src");

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("[T113] `BuildSystemPromptOptions`의 옵션이 전부 조립 스캔 헬퍼에서 쓰인다(옵션이 늘면 여기서 걸린다)", () => {
  const assemblySource = fs.readFileSync(
    path.join(FUNCTIONS_SRC_DIR_T113, "roleplay/promptAssembly.ts"),
    "utf-8",
  );
  const block = /export type BuildSystemPromptOptions = \{([\s\S]*?)\n\};/.exec(assemblySource);
  assert.ok(block, "BuildSystemPromptOptions 정의를 못 찾았다 — 이 게이트가 죽은 것이다");
  const optionKeys = [...stripComments(block[1]).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  assert.ok(optionKeys.length >= 5, `옵션 키 파싱 실패(추출: ${optionKeys.join(", ")})`);

  const ownSource = stripComments(
    fs.readFileSync(path.join(FUNCTIONS_SRC_DIR_T113, "scenarios/__tests__/scenarios.test.ts"), "utf-8"),
  );
  const helperRegion = ownSource.slice(
    ownSource.indexOf("const ASSEMBLY_LEVEL_VARIANTS"),
    ownSource.indexOf("test(\"[T109/요구몰림]"),
  );
  assert.ok(helperRegion.length > 0, "조립 스캔 헬퍼 구간을 못 찾았다 — 이 게이트가 죽은 것이다");
  for (const key of optionKeys) {
    assert.ok(
      helperRegion.includes(key),
      `buildSystemPrompt 옵션 "${key}"를 조립 스캔 헬퍼가 순회하지 않는다 — 그 옵션을 켜야만 ` +
        `삽입되는 블록의 인용구가 무검사 구간이 된다(T113이 없앤 사각의 형태 그대로다).`,
    );
  }
});

test("[T92/G68] 부인 대응 라벨에 훈련 내부 용어가 들어가지 않는다(사용자 화면에 그대로 노출된다)", () => {
  // 라벨은 초급 사전 브리핑(UX-029)과 리포트 tacticsUsed로 **그대로** 화면에 나간다(§18.7 G68).
  const INTERNAL_JARGON = ["무조건 요구", "부인 대응", "전제", "P1", "P2", "P3", "P4", "축 "];
  for (const [scenarioId, prompt] of Object.entries(SCENARIO_PROMPTS)) {
    for (const tactic of prompt.weakenedTactics) {
      const label = tactic.split("—")[0].trim();
      for (const jargon of INTERNAL_JARGON) {
        assert.equal(
          label.includes(jargon),
          false,
          `${scenarioId}: 수법 라벨 "${label}"에 훈련 내부 용어 "${jargon}"이 들어 있다 — ` +
            `라벨은 초급 사전 브리핑·리포트로 사용자 화면에 그대로 나간다(D-6/AC-066 경계).`,
        );
      }
    }
  }
});
