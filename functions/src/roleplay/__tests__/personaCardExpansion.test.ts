// §92(2026-10-21 · 사용자 승인 "시나리오 결정 권고안대로 진행") — '내 정보' 카드 대상 확대(기관형 4종 + 협박형 2종) 조립 단언.
// ⭐ #347(기관 사칭 고급 "카드 값 먼저 말하기")과 같은 보장을 새 대상 6종에 건다: 카드가 있으면 요구 예시 · 이름 단정 금지 원문이
//    결정적으로 바뀌고, 순서 줄("늦어도 상대의 첫 대답을 받은 바로 다음 차례까지")이 실린다. 카드가 없으면 조립 결과가 바이트 동일하다.
// ⛔ 이 파일은 모델 출력을 보지 않는다(실측 비율은 실 키 프로브 — 메인 세션 승인 범위).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPersonaCardBlock,
  buildSystemPrompt,
  PERSONA_CARD_BLOCK_HEAD,
  PERSONA_CARD_BLOCK_HEAD_THREAT,
  PERSONA_CARD_BLOCK_ORDER,
  PERSONA_CARD_BLOCK_ORDER_CHILD,
  PERSONA_CARD_BLOCK_ORDER_SELF,
  PERSONA_CARD_BLOCK_TAIL_THREAT,
  type BuildSystemPromptOptions,
} from "../promptAssembly";
import {
  ANONYMOUS_NAME_CLAUSE,
  ANONYMOUS_NAME_CLAUSE_WITH_CARD,
  applyPersonaCardIdentityConfirm,
  CHILD_ACADEMY_MASK,
  CHILD_ECHO_STAGE,
  CHILD_ECHO_TACTIC,
  CHILD_NOT_SAID_CLAUSE,
  IDENTITY_DEMAND_FROM,
  IDENTITY_DEMAND_PLAIN,
  NAME_FIRST_DEMAND,
  spokenChildName,
} from "../personaCardIdentity";
import { asksIdentityCheck } from "../personaAuthority";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { listFlowVariants, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { personaCardKind, PERSONA_CARD_SCENARIOS, type PersonaCardKind } from "../../scenarios/personaCardCatalog";
import { hasVerifyIntercept } from "../../scenarios/verifyIntercept";
import { sessionDeclaredSmsPurposes, sessionDeclaresInCallSms, sessionTransferSmsOpensLanding } from "../../inCallSms/smsGate";
import type { PersonaCardItem } from "../../shared/types";

const NEW_INSTITUTION = [
  "tax-refund-scam",
  "bank-security-verify-scam",
  "asset-protection-notice-call",
  "prosecution-cooperation-call",
] as const;
const KIDNAPPING = "kidnapping-threat";
const REPUTATION = "reputation-blackmail-scam";

const CARDS: Record<PersonaCardKind, PersonaCardItem[]> = {
  identity: [
    { key: "name", label: "이름", value: "김하늘" },
    { key: "birthDate", label: "생년월일", value: "1965년 3월 2일생" },
    { key: "region", label: "사는 곳", value: "대전광역시" },
  ],
  "self-threat": [
    { key: "name", label: "이름", value: "김하늘" },
    { key: "birthYear", label: "출생 연도", value: "1971년생" },
    { key: "region", label: "사는 곳", value: "대전광역시" },
    { key: "job", label: "하는 일", value: "공무원" },
  ],
  "child-threat": [
    { key: "childName", label: "자녀 이름", value: "김민준" },
    { key: "childGrade", label: "자녀 학년", value: "초등학교 3학년" },
    { key: "childAcademy", label: "자녀가 다니는 학원", value: "영어학원" },
  ],
};

/** 카드가 있을 때 남으면 안 되는 "묻기" 원천(기관형 요구 예시 전 꼴). */
const DEMAND_PATTERN = /성함(이랑 (생년월일|주소))?(부터)? 불러주/;

/** Live 토큰 조립(`realtime/geminiProvider.ts`)과 같은 판별자로 옵션을 만든다 — 시나리오 · 변형 기준. */
function liveOpts(scenarioId: string, variantId: string, extra: BuildSystemPromptOptions = {}): BuildSystemPromptOptions {
  return {
    difficultyLevel: "advanced",
    inCallSmsEnabled: sessionDeclaresInCallSms(scenarioId, variantId),
    inCallSmsPurposes: sessionDeclaredSmsPurposes(scenarioId, variantId),
    transferSmsLink: sessionTransferSmsOpensLanding(scenarioId, variantId),
    verifyInterceptEnabled: hasVerifyIntercept(scenarioId),
    identityCheckAllowed: asksIdentityCheck(scenarioId),
    toolDrivenTiming: true,
    liveSpeechStyle: true,
    ...extra,
  };
}
function assembled(scenarioId: string, variantId: string, extra: BuildSystemPromptOptions = {}): string {
  return buildSystemPrompt(resolveSessionScenarioPrompt(scenarioId, variantId)!, liveOpts(scenarioId, variantId, extra));
}
/** 시나리오의 고급 변형 전부(고급 전용 3종 = 시나리오 자체가 변형 1개). */
const advancedVariants = (scenarioId: string) => listFlowVariants(scenarioId, "advanced").map((v) => v.variantId);

test("[§92 원천 존재] 새 기관형 4종의 요구 예시 · 납치 고급 되받기 지시 · 이름 단정 금지 원문이 그대로 있다(바뀌면 치환이 조용히 꺼진다)", () => {
  const text = (id: string) => [SCENARIO_PROMPTS[id]!.personaPrompt, ...SCENARIO_PROMPTS[id]!.weakenedTactics].join("\n");
  const count = (hay: string, needle: string) => hay.split(needle).length - 1;
  assert.equal(count(text("tax-refund-scam"), IDENTITY_DEMAND_PLAIN), 2, "tax 2곳([말투/톤] · 수법)");
  assert.equal(count(text("asset-protection-notice-call"), IDENTITY_DEMAND_PLAIN), 1, "asset 1곳");
  assert.equal(count(text("prosecution-cooperation-call"), IDENTITY_DEMAND_PLAIN), 1, "prosecution 1곳");
  assert.equal(count(text("bank-security-verify-scam"), IDENTITY_DEMAND_FROM), 1, "bank 1곳");
  // 납치 고급 변형(fv-k268)의 단계 · 수법.
  const [k268] = advancedVariants(KIDNAPPING);
  const kidnap = assembled(KIDNAPPING, k268!);
  for (const source of [CHILD_ECHO_STAGE, CHILD_ECHO_TACTIC, CHILD_ACADEMY_MASK, CHILD_NOT_SAID_CLAUSE, ANONYMOUS_NAME_CLAUSE]) {
    assert.ok(kidnap.includes(source), `납치 고급 카드 없음 조립에 원천이 없다: ${source}`);
  }
  assert.ok(assembled(REPUTATION, advancedVariants(REPUTATION)[0]!).includes(ANONYMOUS_NAME_CLAUSE), "유포 협박 원천");
  // 협박형 원천은 기관형 조립에 없다(치환이 시나리오를 가리지 않아도 되는 근거).
  for (const id of PERSONA_CARD_SCENARIOS.filter(asksIdentityCheck)) {
    for (const vid of advancedVariants(id)) {
      const t = assembled(id, vid);
      for (const source of [ANONYMOUS_NAME_CLAUSE, CHILD_ECHO_STAGE, CHILD_ECHO_TACTIC]) assert.ok(!t.includes(source), `${id}/${vid}`);
    }
  }
});

test("[§92 · #347 보장] 대상 10종 × 고급 변형 전부 × Live/텍스트 — 카드가 있으면 묻기 원천 0 · 종류별 블록 · 순서 줄 · 가드레일 최후미", (t) => {
  let checked = 0;
  for (const id of PERSONA_CARD_SCENARIOS) {
    const kind = personaCardKind(id)!;
    const card = CARDS[kind];
    for (const vid of advancedVariants(id)) {
      for (const live of [true, false]) {
        const text = assembled(id, vid, { personaCard: card, liveSpeechStyle: live });
        const at = `${id}/${vid}/${live ? "Live" : "텍스트"}`;
        assert.ok(text.endsWith(SCENARIO_PROMPTS[id]!.guardrailPreamble), `${at}: 가드레일 최후미`);
        if (kind === "identity") {
          assert.equal(DEMAND_PATTERN.test(text), false, `${at}: 성함 요구 예시가 남았다 — ${DEMAND_PATTERN.exec(text)?.[0]}`);
          assert.ok(text.includes(PERSONA_CARD_BLOCK_HEAD) && text.includes(PERSONA_CARD_BLOCK_ORDER), `${at}: 기관형 블록 · 순서 줄`);
          assert.ok(text.includes("김하늘 님"), `${at}: 확인형(이름)`);
        } else {
          assert.equal(text.includes(PERSONA_CARD_BLOCK_HEAD), false, `${at}: 협박형에 기관형 머리("확인하듯")`);
          assert.ok(text.includes(PERSONA_CARD_BLOCK_HEAD_THREAT) && text.includes(PERSONA_CARD_BLOCK_TAIL_THREAT), `${at}: 협박형 블록`);
          assert.equal(text.includes(ANONYMOUS_NAME_CLAUSE), false, `${at}: 이름 단정 금지 원문이 남았다`);
          assert.ok(text.includes(ANONYMOUS_NAME_CLAUSE_WITH_CARD), `${at}: 목록 예외형`);
          assert.ok(text.includes(kind === "child-threat" ? PERSONA_CARD_BLOCK_ORDER_CHILD : PERSONA_CARD_BLOCK_ORDER_SELF), `${at}: 순서 줄`);
          // 협박형에 본인확인형 문면이 새지 않는다(§50.4.4 (5) 금지 문자열은 G301이 전수로 본다 — 여기서는 확인형 순서 줄 · 이름 템플릿).
          assert.equal(text.includes("이름·생년월일"), false, `${at}: 이름·생년월일`);
          assert.equal(text.includes("맞으시죠?\"로 확인만"), false, `${at}: 확인형 순서 줄`);
        }
        for (const item of card) assert.ok(text.includes(`- ${item.label}: `), `${at}: 카드 행 ${item.label}`);
        checked += 1;
      }
    }
  }
  t.diagnostic(`[§92] 조립 ${checked}건 — 묻기 원천 0 · 블록 · 순서 줄 확인`);
});

test("[§92] 새 기관형 4종 — 부분 카드는 없는 항목만 묻는다(어미는 원천 그대로)", () => {
  const name = CARDS.identity[0]!;
  const birth = { key: "birthYear", label: "출생 연도", value: "1971년생" } as const;
  assert.equal(applyPersonaCardIdentityConfirm(`'${IDENTITY_DEMAND_PLAIN}'`, [name]), "'김하늘 님, 생년월일 불러주세요'");
  assert.equal(applyPersonaCardIdentityConfirm(`'${IDENTITY_DEMAND_FROM}'`, [name]), "'김하늘 님, 생년월일부터 불러주세요'");
  assert.equal(applyPersonaCardIdentityConfirm(`'${IDENTITY_DEMAND_PLAIN}'`, [birth]), "'71년생이신 분, 성함 불러주세요'");
  assert.equal(applyPersonaCardIdentityConfirm(`'${IDENTITY_DEMAND_FROM}'`, [birth]), "'71년생이신 분, 성함부터 불러주세요'");
  assert.equal(
    applyPersonaCardIdentityConfirm(`'${IDENTITY_DEMAND_FROM}'`, [name, birth]),
    "'김하늘 님 본인 맞으시죠? 71년생 맞으시고요'",
  );
  // 지역만 = 이름 · 생년월일은 그대로 묻는다(바이트 동일).
  for (const id of NEW_INSTITUTION) {
    const vid = advancedVariants(id)[0]!;
    const regionOnly = assembled(id, vid, { personaCard: [CARDS.identity[2]!] });
    assert.ok(DEMAND_PATTERN.test(regionOnly), `${id}: 지역만이면 묻기 유지`);
  }
  // tax의 [말투/톤] 줄 — 바뀌면 "카드에도 없는 정보는"으로 좁힌다(#347과 같은 규칙).
  const tax = assembled("tax-refund-scam", advancedVariants("tax-refund-scam")[0]!, { personaCard: [name] });
  assert.ok(tax.includes("[미리 확보한 상대 정보]에도 없는 정보는"));
});

test("[§92] 자녀 납치 협박 — 카드가 있으면 자녀 이름을 먼저 대고(부르는 꼴) · 학원은 카드 값만 · 카드 밖 이름은 여전히 지어내지 않는다", () => {
  const vid = advancedVariants(KIDNAPPING)[0]!;
  const text = assembled(KIDNAPPING, vid, { personaCard: CARDS["child-threat"] });
  assert.ok(text.includes("'민준이 지금 여기 있습니다'"), "부르는 꼴(받침 → 이)");
  assert.ok(text.includes("학원은 목록에 있는 '영어학원'이라고만 말하고"));
  assert.ok(text.includes("[미리 확보한 상대 정보]에도 없는 이름은 지어내 단정하지 않는다."));
  for (const source of [CHILD_ECHO_STAGE, CHILD_ECHO_TACTIC, CHILD_ACADEMY_MASK, CHILD_NOT_SAID_CLAUSE]) assert.ok(!text.includes(source), source);
  // 위해 묘사 금지 · 부인 받아넘기기(T92 · §18.5)는 그대로다.
  assert.ok(text.includes("**상대가 \"저는 자녀가 없다\", \"그런 사람 없다\"고 하면 반박하지 않는다.**"));
  assert.ok(text.includes("구체적인 폭력·신체 손상·감금 상태 묘사는 절대 하지 않는다."));
  // 학원 없이 이름만 = 학원 가림 지시 유지.
  const nameOnly = assembled(KIDNAPPING, vid, { personaCard: [CARDS["child-threat"][0]!] });
  assert.ok(nameOnly.includes(CHILD_ACADEMY_MASK), "학원 카드 없음 = 가림 지시 그대로");
  assert.equal(nameOnly.includes(CHILD_ECHO_TACTIC), false);
  // 부르는 꼴 — 받침 없음 · 2자 · 영문.
  assert.equal(spokenChildName("김지우"), "지우");
  assert.equal(spokenChildName("민준"), "민준이");
  assert.equal(spokenChildName("Kim Ryan"), "Kim Ryan");
  // 띄어 쓴 3자 이름도 붙여서 성을 뗀다. ⚠️ 한계: 복성(남궁 · 황보 등)은 구분하지 않는다("남궁민" → "궁민이").
  assert.equal(spokenChildName("이 서준"), "서준이");
  assert.equal(spokenChildName("남궁민"), "궁민이", "복성 한계(알려진 동작 — 바뀌면 이 단언과 주석을 함께 고친다)");
  assert.equal(spokenChildName("남궁민준"), "남궁민준이", "4자는 성을 떼지 않는다(리뷰 Minor 4 · 받침 → 이)");
});

test("[§92] 카드 없음 · 빈 배열이면 새 대상 6종 조립이 바이트 동일하다(카드 없을 때 = 지금처럼 묻기 · 이름을 먼저 말하지 않고 유도)", () => {
  for (const id of [...NEW_INSTITUTION, KIDNAPPING, REPUTATION]) {
    for (const vid of advancedVariants(id)) {
      const base = assembled(id, vid);
      assert.equal(assembled(id, vid, { personaCard: [] }), base, `${id}/${vid}`);
      assert.equal(assembled(id, vid, { personaCard: undefined }), base, `${id}/${vid}`);
      // ⚠️ "[미리 확보한 상대 정보 — 이 통화에서만]" 이름 자체는 Live [말투] 줄에도 나온다(§90) — 블록 머리 문장으로 본다.
      assert.equal(base.includes(PERSONA_CARD_BLOCK_HEAD) || base.includes(PERSONA_CARD_BLOCK_HEAD_THREAT), false, `${id}/${vid}: 블록`);
    }
  }
});

test("[§92] 블록 생성 — 기관형 정본 바이트 무변경 · 협박형은 자녀 행 유무로 순서 줄이 갈린다 · 가림 리터럴 0", (t) => {
  const identity = buildPersonaCardBlock(CARDS.identity)!;
  assert.equal(buildPersonaCardBlock(CARDS.identity, true), identity, "기본값 = 기관형");
  assert.ok(identity.startsWith(PERSONA_CARD_BLOCK_HEAD) && identity.includes(PERSONA_CARD_BLOCK_ORDER));
  const child = buildPersonaCardBlock(CARDS["child-threat"], false)!;
  const self = buildPersonaCardBlock(CARDS["self-threat"], false)!;
  assert.ok(child.includes(PERSONA_CARD_BLOCK_ORDER_CHILD) && !child.includes(PERSONA_CARD_BLOCK_ORDER_SELF));
  assert.ok(self.includes(PERSONA_CARD_BLOCK_ORDER_SELF) && !self.includes(PERSONA_CARD_BLOCK_ORDER_CHILD));
  for (const block of [child, self]) {
    assert.equal(/[○Oo]{2}/.test(block), false, block);
    assert.ok(block.includes("만날 곳·찾아갈 곳·돈을 건넬 곳이나 구체적인 장소·주소를 정하는 데 쓰지 않는다"), "장소 금지");
    assert.ok(block.includes("목록에 없는 이름·나이·금액·금융사·주소는 지어내 말하지 않는다"));
  }
  assert.ok(child.includes("- 자녀 이름: 김민준") && child.includes("- 자녀가 다니는 학원: 영어학원"));
  assert.ok(self.includes("- 하는 일: 공무원"));
  // 역방향 — 협박형 시나리오에 기관형 블록을 실은 사본은 "확인하듯" · "맞으시죠?로 확인만"을 싣는다(위 조립 단언이 그것을 잡는다).
  const naive = buildPersonaCardBlock(CARDS["child-threat"], true)!;
  assert.ok(naive.includes("확인하듯") && naive.includes("확인만 받는다"), "역방향 사본이 기관형 문면을 싣지 않는다 — 검사가 무력하다");
  t.diagnostic("[§92] 협박형 블록 = 기관형 확인 문면 0 · 기관형 블록 사본 → 확인 문면 검출(실패 확인)");
});

test("[§92 · 카드 배송 흡수] 카드사 고급 변형 전부(흡수될 카드 배송 변형 포함 — 목록에서 자동으로 잡힌다)에서 '성함부터 불러주세요'가 이름 카드로 치환된다", (t) => {
  // advanced-catalog-impl(2026-10-21 조기 통보): card-delivery-call은 card-company-impersonation 고급의 새 흐름 변형으로 흡수되고,
  // 그 변형의 신원 요구는 치환표에 이미 있는 "성함부터 불러주세요"로 맞춘다. 이 테스트는 변형 목록을 하드코딩하지 않으므로
  // 흡수 변형이 들어오면 그대로 검사 대상이 된다(문구가 다르면 아래 단언 중 "원천 존재" 또는 "치환 후 0"이 실패한다).
  const variants = advancedVariants("card-company-impersonation");
  assert.ok(variants.length >= 1);
  for (const vid of variants) {
    const without = assembled("card-company-impersonation", vid);
    assert.ok(without.includes(NAME_FIRST_DEMAND), `${vid}: 원천 문구가 없다 — 치환표 행을 맞출 것`);
    const withCard = assembled("card-company-impersonation", vid, { personaCard: [CARDS.identity[0]!] });
    assert.equal(withCard.includes(NAME_FIRST_DEMAND), false, `${vid}: 성함 요구가 남았다`);
    assert.ok(withCard.includes("김하늘 님 본인 맞으시죠"), vid);
  }
  t.diagnostic(`[카드 배송 흡수] 카드사 고급 변형 ${variants.length}벌(${variants.join(", ")}) 치환 확인`);
});
