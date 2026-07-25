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
  "institutional-impersonation": "안전계좌 이체 요구",
  "kidnapping-threat": "즉시 송금 요구",
  "tax-refund-scam": "환급 수수료 요구",
  "reputation-blackmail-scam": "입막음 송금 요구",
  "grandchild-impersonation": "송금 직접 요구",
  "messenger-child-impersonation-kakao": "송금 직접 요구",
  "messenger-friend-loan-kakao": "송금 직접 요구",
  // 스미싱 문자형의 "요구"는 송금이 아니라 링크 탭이다 — 참가자가 결정을 내리는 순간이 거기다.
  "messenger-parcel-smishing-sms": "링크 클릭 유도",
  "messenger-subsidy-smishing-sms": "링크 클릭 유도",
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
