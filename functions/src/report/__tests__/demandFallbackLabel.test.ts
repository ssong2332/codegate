// PR-A3(감사 B 매트릭스 1일차 #3 · 2일차 #4) — 속은 순간 라벨 보정 표(`resolveDemandFallbackTactic`) 고정.
//
// 사기범 대사는 감사 원시 기록(scratchpad b-raw · b2-raw)의 실제 LLM 대사를 그대로 옮겼다 — 표가 손으로 쓴 예문에만
// 맞는 과적합이 아님을 보이려는 것이다. 정탐(행마다 1건 이상) · 오탐(확인 · 감사 대사, 요구 없는 대사, 라벨 없는 세션) ·
// 판정 무변경(속았는가 · 순간 개수 · turnIndex) · AC-083 (a)(속은 순간이 부른 수법 ∈ 수법 목록)를 함께 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, resolveDemandFallbackTactic } from "../analyzeConversation";
import { FLOW_VARIANTS, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { NEUTRAL_SCAMMER_LINES } from "./neutralScammerLines";
import { resolveTacticCategory } from "../tacticCategory";

const tacticsOf = (scenarioId: string, variantId: string): string[] => {
  const prompt = resolveSessionScenarioPrompt(scenarioId, variantId);
  assert.ok(prompt, `${scenarioId}/${variantId}`);
  return prompt.weakenedTactics;
};

const FRIEND = tacticsOf("messenger-friend-loan-kakao", "fv-bxvp");
const CHILD_ADV = tacticsOf("messenger-child-impersonation-kakao", "fv-tdgg");
const CHILD_BEG = tacticsOf("messenger-child-impersonation-kakao", "fv-34v5");
const INSTITUTIONAL = tacticsOf("institutional-impersonation", "fv-c5fj");
const CARD = tacticsOf("card-company-impersonation", "fv-akj5");
const CARD_DELIVERY = tacticsOf("card-delivery-call", "fv-tvnj");
const BANK = tacticsOf("bank-security-verify-scam", "fv-62q8");
const PARCEL_BEG = tacticsOf("messenger-parcel-smishing-sms", "fv-prr3");
const LOAN_ADV = tacticsOf("loan-refinance-scam", "fv-6s5p");
// 2026-10-21 — 기관 사칭 고급(fv-c5fj)에서 "인출·전달 요구"가 빠져(인증번호 → 안전계좌 링크 이체 화면) 8행은 그 수법의 원천 시나리오로 옮겼다.
const ASSET_PROTECTION_ADV = tacticsOf("asset-protection-notice-call", "fv-bmiq");

test("[PR-A3 정탐] 표의 각 행이 실제 LLM 요구 대사를 세션 목록 안의 같은 범주 라벨로 부른다", () => {
  const cases: ReadonlyArray<[row: string, line: string, tactics: string[], expected: string]> = [
    [
      "1 설치",
      "엄마, 다행이다... 지금 급하게 보험 처리부터 해야 하는데, 거기서 보내준 앱을 깔아서 접수를 먼저 하라네? 엄마가 링크 눌러서 설치 좀 도와주면 안 될까?",
      CHILD_ADV,
      "보험 처리 앱 설치 요구",
    ],
    ["1 설치(Live)", "피해가 더 번지지 않게 가온안심보안 점검 앱을 설치해 주셔야 합니다.", CARD, "보안 점검 앱 설치 요구"],
    [
      "3 자산",
      "늘봄은행을 거래하고 계시는군요. 선생님의 자산 보호를 위해, 대략적인 예금 규모가 어느 정도 되시는지 말씀해 주시겠습니까?",
      INSTITUTIONAL,
      "거래 은행·자산 정보 수집",
    ],
    [
      "4 카드",
      "결제를 취소하려면 고객님의 카드번호 앞자리와 유효기간을 바로 알려주셔야 해요.",
      CARD,
      "카드정보 직접 요구",
    ],
    [
      "5 신원",
      "본인 확인 절차를 거쳐야 조회가 가능합니다. 성함과 생년월일을 다시 한번 말씀해 주시면 바로 확인해 드리겠습니다.",
      INSTITUTIONAL,
      "신원정보 직접 요구",
    ],
    [
      "5 신원(정보를 주셔야)",
      "성함과 생년월일 정보를 주셔야 제가 조회를 해서 범죄 연루 여부를 확인해 드릴 수 있습니다.",
      CARD_DELIVERY,
      "본인확인 정보 직접 요구",
    ],
    [
      "6 송금",
      "오, 진짜 고마워! 역시 너밖에 없다. 그럼 아까 말한 한결은행 948-2716-5093-27 계좌로 50만 원만 먼저 보내줄 수 있을까?",
      FRIEND,
      "송금 직접 요구",
    ],
    [
      "6 이체해 두셔야",
      "이제 잔액을 안전하게 보호하기 위해, 저희가 운영하는 임시 안전 계좌로 잔액을 전액 이체해 두셔야 합니다.",
      BANK,
      "보호계좌 이체 요구",
    ],
    [
      "7 금액+부탁",
      "아, 진짜 고마워요 엄마. 빨리 처리해야 되니까 해담은행 948-2716-5093-27 여기로 300만 원 바로 좀 부탁드릴게요.",
      CHILD_BEG,
      "송금 직접 요구",
    ],
    [
      "8 인출(HANDOFF_DEMAND 재사용)",
      "절차상 가장 안전한 방법은 예치금을 수표로 전액 인출해 주시는 겁니다.",
      ASSET_PROTECTION_ADV,
      "인출·전달 요구",
    ],
  ];
  for (const [row, line, tactics, expected] of cases) {
    assert.equal(resolveDemandFallbackTactic(line, tactics), expected, `행 ${row}: ${line}`);
  }
});

test("[PR-A3 오탐] 확인 · 감사 · 상황 설명 대사와 요구 없는 대사는 라벨을 만들지 않는다(종전 폴백 유지)", () => {
  const lines: ReadonlyArray<[line: string, tactics: string[]]> = [
    // 확인 대사 — "입금해주신"·"주셔서"는 시키는 어미가 아니다.
    ["입금 확인되었습니다. 고객님, 입금해주신 금액은 정상적으로 접수 처리되었고, 이제 통관 절차도 모두 해제되었습니다.", LOAN_ADV],
    ["네, 고객님 이체 확인되었습니다. 보담은행 948-2716-5093-27 번으로 입금된 자금은 현재 검수 절차에 들어갔습니다.", LOAN_ADV],
    ["확인됐어! 진짜 고마워, 너밖에 없다. 덕분에 급한 불은 껐네.", FRIEND],
    ["정보 입력해 주셔서 감사합니다. 성함 확인되었습니다.", INSTITUTIONAL],
    // 돈 맥락 없는 "보내줄 수"(캡처 요청)는 송금 요구가 아니다.
    ["입금하신 다음에 이체 내역서 캡처해서 나한테 바로 좀 보내줄 수 있을까?", CHILD_BEG],
    // 요구 어형 없이 필요만 말한다.
    ["지금 결제 중인 건을 저희가 강제로 취소하려면 고객님의 카드 정보가 필요합니다.", CARD],
    ["네, 설치가 잘 완료되셨다니 다행입니다. 지금 바로 담당 상담원이 전화 연결 도와드리겠습니다.", CARD],
    // 중립 대사(verdictRegression 중립 표본과 같은 꼴).
    ["네 고객님, 확인 도와드리겠습니다.", INSTITUTIONAL],
  ];
  for (const [line, tactics] of lines) {
    assert.equal(resolveDemandFallbackTactic(line, tactics), undefined, line);
  }
});

test("[PR-A3 오탐] 요구 어형이 맞아도 세션 목록에 같은 범주 라벨이 없으면 라벨을 발명하지 않는다", () => {
  // parcel 초급 목록에는 개인정보 범주 라벨이 없다 — "성함·생년월일 말씀해 주시겠어요"는 폴백 그대로.
  assert.equal(
    resolveDemandFallbackTactic("정확한 배송지 확인을 위해 성함과 생년월일을 다시 한번만 말씀해 주시겠어요?", PARCEL_BEG),
    undefined,
  );
  // child 초급 목록에는 개인정보 범주가 없다 — 비밀번호 요구는 폴백 그대로(송금 행으로 새지 않는다).
  assert.equal(
    resolveDemandFallbackTactic("미안한데 엄마 계좌 비밀번호랑 카드 번호도 알려줘야 할 것 같아.", CHILD_BEG),
    undefined,
  );
  // 후보에서 "부인 시 …" · "… 암시"는 빠진다 — loan 고급의 개인정보 범주 라벨은 "개인정보 보유 암시"뿐이다.
  assert.equal(resolveDemandFallbackTactic("성함과 생년월일을 말씀해 주세요.", LOAN_ADV), undefined);
});

test("[PR-A3 판정 무변경] 보정은 라벨만 바꾼다 — 속았는가 · 순간 개수 · turnIndex는 같고, 부른 라벨은 수법 목록에 있다(AC-083 (a))", () => {
  const transcript = [
    { role: "scammer" as const, textMasked: "아, 나다! 잘 지냈어? 진짜 오랜만에 연락하네ㅋㅋ", turnIndex: 0, createdAtMs: 0 },
    { role: "user" as const, textMasked: "네, 안녕하세요. 누구세요?", turnIndex: 1, createdAtMs: 1_000 },
    {
      role: "scammer" as const,
      textMasked: "그럼 아까 말한 한결은행 948-2716-5093-27 계좌로 50만 원만 먼저 보내줄 수 있을까?",
      turnIndex: 2,
      createdAtMs: 2_000,
    },
    { role: "user" as const, textMasked: "네, 말씀하신 계좌로 이체했어요.", turnIndex: 3, createdAtMs: 3_000 },
    { role: "scammer" as const, textMasked: "확인했어! 진짜 고마워, 덕분에 큰일 해결했다.", turnIndex: 4, createdAtMs: 4_000 },
    { role: "user" as const, textMasked: "네, 알려주신 대로 했어요. 그다음은 뭐죠?", turnIndex: 5, createdAtMs: 5_000 },
  ];
  const withTable = analyzeConversation(transcript, 0, FRIEND);
  // 대조군 — 같은 대화를 수법 목록 없이(라벨 후보 0) 돌리면 표가 아무 라벨도 고를 수 없다 = 종전 산출.
  const control = analyzeConversation(transcript, 0, []);
  assert.equal(withTable.wasDeceived, control.wasDeceived);
  assert.deepEqual(
    withTable.deceivedMoments.map((m) => m.turnIndex),
    control.deceivedMoments.map((m) => m.turnIndex),
  );
  assert.deepEqual(
    withTable.deceivedMoments.map((m) => m.tactic),
    ["송금 직접 요구", "송금 직접 요구"],
    "요구 대사 뒤 순간은 표 라벨 · 감사 대사 뒤 순간은 §129.10 최종 폴백(세션 대표 요구 수법 — 빈 라벨 0)",
  );
  assert.equal(withTable.deceivedMoments[0].tacticCategory, resolveTacticCategory("송금 직접 요구"));
  assert.deepEqual(control.deceivedMoments.map((m) => m.tactic), ["약화된 사기 수법", "약화된 사기 수법"]);
  for (const moment of withTable.deceivedMoments) {
    assert.ok(
      moment.tactic === "약화된 사기 수법" || withTable.tacticsUsed.includes(moment.tactic),
      `AC-083 (a): "${moment.tactic}"가 수법 목록에 없다`,
    );
  }
});

test("[PR-A3] 문구 키가 맞은 순간은 표를 타지 않는다(종전 추정 우선)", () => {
  // 친분 이용 인용구("너니까 부탁하는 거야")가 그대로 있으면 문구 키가 이긴다 — 같은 대사에 송금 요구 어형이 있어도.
  const transcript = [
    {
      role: "scammer" as const,
      textMasked: "너니까 부탁하는 거야. 한결은행 948-2716-5093-27 계좌로 50만 원만 보내줄 수 있을까?",
      turnIndex: 0,
      createdAtMs: 0,
    },
    { role: "user" as const, textMasked: "네, 말씀하신 계좌로 이체했어요.", turnIndex: 1, createdAtMs: 1_000 },
  ];
  const result = analyzeConversation(transcript, 0, FRIEND);
  assert.equal(result.deceivedMoments.length, 1);
  assert.equal(result.deceivedMoments[0].tactic, "친분 이용");
});

test("[PR-A3 리뷰 Major 1] 개인정보 행은 정보 제공 동사가 필수다 — \"계좌번호·이름 + 보내/입금/이체\"는 송금 행으로 간다", () => {
  // 오탐 표본(수정 전 개인정보 행이 가로챘다) → 송금 라벨.
  const toPayment: ReadonlyArray<[line: string, tactics: string[], expected: string]> = [
    ["이 계좌번호로 입금해 주세요.", BANK, "보호계좌 이체 요구"],
    ["제 이름으로 된 계좌로 50만 원 보내 주세요.", FRIEND, "송금 직접 요구"],
    ["안내드린 계좌번호로 전액 이체해 주십시오.", CARD_DELIVERY, "자산 보호 이체 요구"],
  ];
  for (const [line, tactics, expected] of toPayment) {
    assert.equal(resolveDemandFallbackTactic(line, tactics), expected, line);
  }
  // 돈 맥락이 없으면 송금도 아니다 — 개인정보로도 잡지 않는다(라벨 발명 0).
  assert.equal(resolveDemandFallbackTactic("제 이름으로 보내 주세요.", INSTITUTIONAL), undefined);
  // 정탐 회귀 — 정보 제공 동사가 있으면 여전히 개인정보 행이다.
  const toIdentity: ReadonlyArray<[line: string, tactics: string[], expected: string]> = [
    ["성함과 생년월일을 다시 한번 말씀해 주시면 바로 확인해 드리겠습니다.", INSTITUTIONAL, "신원정보 직접 요구"],
    ["성함과 생년월일 정보를 주셔야 제가 조회를 해 드릴 수 있습니다.", CARD_DELIVERY, "본인확인 정보 직접 요구"],
    ["사용하고 계신 계좌번호와 비밀번호를 알려 주세요.", BANK, "본인확인 정보 직접 요구"],
    ["보험 접수에 엄마 신분증 사진이 필요하대, 찍어서 보내 줘.", CHILD_ADV, "신원정보 직접 요구"],
  ];
  for (const [line, tactics, expected] of toIdentity) {
    assert.equal(resolveDemandFallbackTactic(line, tactics), expected, line);
  }
});

test("[PR-A3 리뷰 Major 2] 중립 대사 × 전 시나리오(전 변형 포함)에서 보정표는 라벨을 만들지 않는다", () => {
  const tacticLists = [
    ...Object.values(SCENARIO_PROMPTS).map((prompt) => prompt.weakenedTactics),
    ...FLOW_VARIANTS.map((variant) => resolveSessionScenarioPrompt(variant.scenarioId, variant.variantId)?.weakenedTactics ?? []),
  ];
  assert.ok(NEUTRAL_SCAMMER_LINES.length >= 6 && tacticLists.length > Object.keys(SCENARIO_PROMPTS).length);
  for (const tactics of tacticLists) {
    for (const line of NEUTRAL_SCAMMER_LINES) {
      assert.equal(resolveDemandFallbackTactic(line, tactics), undefined, line);
    }
  }
});
