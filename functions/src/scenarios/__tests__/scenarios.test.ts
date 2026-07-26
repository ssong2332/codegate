// T6 콘텐츠 안전성/정합성 테스트 (node:test — 저장소에 별도 테스트 프레임워크 없음, T19 memory
// 참고). AC-001/AC-002(공개 메타 필수 필드) + AC-005/AC-013(약화된 수법·운영정보 배제) 근거.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { SCENARIO_PROMPTS, FAMILY_ACCIDENT_SCENARIO_ID } from "../index";
import { PUBLIC_SCENARIOS } from "../publicMeta";

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
