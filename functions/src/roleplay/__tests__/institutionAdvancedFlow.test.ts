// 2026-10-21 사용자 실기 신고 3건(라이브 main 676eeb3 · 기관 사칭 × 고급 Live) — 흐름 백스톱 · 프롬프트 조립 단언.
// ① 인증번호 요구 0 · "내가 알아서 이체" ② "내 정보" 카드가 있는데 생년월일을 먼저 물음 ③ 매 턴 '네'로 시작.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildLiveSpeechStyleBlock,
  buildSystemPrompt,
  PERSONA_CARD_BLOCK_ORDER,
  TRANSFER_VIA_LINK_ONLY_SENTENCE,
  TRANSFER_LINK_IS_ONLY_LINK_SENTENCE,
  type BuildSystemPromptOptions,
} from "../promptAssembly";
import {
  applyPersonaCardIdentityConfirm,
  INSTITUTION_IDENTITY_DEMAND,
  NAME_ADDRESS_DEMAND,
  NAME_FIRST_DEMAND,
  NOT_YET_SAID_CLAUSE,
  spokenBirth,
} from "../personaCardIdentity";
import { SCENARIO_PROMPTS } from "../../scenarios";
import { extractTacticLabel } from "../../scenarios/tacticFlavor";
import { listFlowVariants, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { assignablePool } from "../../scenarios/variantPool";
import { findMockScreenItem, isMockScreenReachable } from "../../scenarios/mockScreens";
import {
  planSmsBackstop,
  resolveDeclaredSms,
  sessionDeclaredSmsPurposes,
  sessionDeclaresInCallSms,
  sessionTransferSmsOpensLanding,
} from "../../inCallSms/smsGate";
import type { PersonaCardItem } from "../../shared/types";

const INSTITUTION = "institutional-impersonation";
const ADVANCED = listFlowVariants(INSTITUTION, "advanced");

/** geminiProvider.ts의 Live 토큰 조립과 같은 문자 술어(변형 기준)로 옵션을 만든다. */
function liveOpts(variantId: string, extra: BuildSystemPromptOptions = {}): BuildSystemPromptOptions {
  return {
    difficultyLevel: "advanced",
    inCallSmsEnabled: sessionDeclaresInCallSms(INSTITUTION, variantId),
    inCallSmsPurposes: sessionDeclaredSmsPurposes(INSTITUTION, variantId),
    transferSmsLink: sessionTransferSmsOpensLanding(INSTITUTION, variantId),
    verifyInterceptEnabled: true,
    toolDrivenTiming: true,
    liveSpeechStyle: true,
    ...extra,
  };
}

function assembled(variantId: string, extra: BuildSystemPromptOptions = {}): string {
  return buildSystemPrompt(resolveSessionScenarioPrompt(INSTITUTION, variantId)!, liveOpts(variantId, extra));
}

// ── ① 흐름 — 인증번호 → 안전계좌 링크 → 이체 화면 ──────────────────────────────────────────────

test("[신고①] 기관 사칭 고급 변형은 전부 인증번호(필수) → 안전계좌 링크 문자(필수) 순서를 선언한다", () => {
  assert.ok(ADVANCED.length >= 2, "고급 변형이 있어야 한다");
  for (const v of ADVANCED) {
    const identity = v.sms.find((s) => s.purpose === "identity");
    const transfer = v.sms.find((s) => s.purpose === "transfer");
    assert.equal(identity?.smsId, "institution-otp", `${v.variantId}: 인증번호 문자`);
    assert.equal(identity?.required, true, `${v.variantId}: 인증번호 백스톱 강제`);
    assert.equal(transfer?.smsId, "institution-safe-account", `${v.variantId}: 안전계좌 문자`);
    assert.equal(transfer?.required, true, `${v.variantId}: 계좌 백스톱 강제`);
    assert.ok(identity!.notBeforeUserTurns < transfer!.notBeforeUserTurns, `${v.variantId}: 인증번호가 먼저 열린다`);
    assert.ok(v.channels.includes("sms"), `${v.variantId}: 채널 메타`);
    assert.equal(resolveDeclaredSms(INSTITUTION, v.variantId).declared.length, 2, `${v.variantId}: 카탈로그 정합`);
  }
});

test("[신고①] 고급 변형 수법 — 인증번호 요구 · 이체 화면 유도 · 안전계좌 이체 요구가 있고, 현금 전달 · 코인 요구는 없다", () => {
  for (const v of ADVANCED) {
    const labels = v.tactics.map((t) => extractTacticLabel(t));
    for (const need of ["인증번호 요구", "이체 화면 유도", "안전계좌 이체 요구"]) {
      assert.ok(labels.includes(need), `${v.variantId}: ${need}`);
    }
    for (const gone of ["인출·전달 요구", "코인 구매·송금 요구"]) assert.ok(!labels.includes(gone), `${v.variantId}: ${gone} 제거`);
    // §115 — 링크 이체 화면 뒤에 대출 실행 유도 단계가 하나 더 있다(마지막 단계).
    const transfer = v.stages[v.stages.length - 2]!.summary;
    assert.match(transfer, /링크/, `${v.variantId}: 끝에서 둘째 단계 = 링크 이체 화면`);
    assert.match(transfer, /은행 앱이나 창구에서 따로 이체하라고 하지 않는다/, `${v.variantId}: "알아서 이체" 차단`);
    const last = v.stages[v.stages.length - 1]!.summary;
    assert.match(last, /대출을 받아 그 돈도 같은 안전계좌로/, `${v.variantId}: 마지막 단계 = 대출 실행 유도(§115)`);
    assert.match(last, /더 조르지 않고 마무리한다/, `${v.variantId}: 거절 뒤 마무리 — 할 게 없으면 끊는다`);
    assert.ok(labels.includes("대출금 이체 요구"), `${v.variantId}: 대출금 이체 요구 수법`);
    assert.match(v.decisionMoment ?? "", /이체 화면/, `${v.variantId}: 결정 순간`);
  }
});

test("[신고①] 자가 · 챌린지 배정 풀 모두 새 선언 변형만 나온다(문자 선언 0 변형 0)", () => {
  for (const challengeId of [undefined, "challenge-x"]) {
    const pool = assignablePool(INSTITUTION, "advanced", challengeId);
    assert.ok(pool.length >= 2, `${challengeId ?? "self"}: 풀`);
    for (const v of pool) assert.ok(v.sms.length === 2, `${challengeId ?? "self"}/${v.variantId}`);
  }
});

test("[신고①] 백스톱 — 모델이 안 불러도 인증번호 → 계좌 문자 순서로 강제 발송된다", () => {
  for (const v of ADVANCED) {
    const { declared } = resolveDeclaredSms(INSTITUTION, v.variantId);
    assert.deepEqual(planSmsBackstop({ declared, delivered: [], userTurns: 1 }), { action: "wait" });
    // §115 B안 — 하한 3 · 6: 인증번호 넛지 5 · 강제 7, 계좌는 인증번호 도착(7) + 간격 2 = 9에서 열려 넛지 11 · 강제 13.
    assert.equal(planSmsBackstop({ declared, delivered: [], userTurns: 2 }).action, "wait", `${v.variantId}: 2발화엔 아직(종전 하한 2)`);
    const nudge = planSmsBackstop({ declared, delivered: [], userTurns: 5 });
    assert.equal(nudge.action, "nudge");
    const first = planSmsBackstop({ declared, delivered: [], userTurns: 7 });
    assert.equal(first.action === "deliver" && first.item.smsId, "institution-otp", `${v.variantId}: 첫 강제 = 인증번호`);
    const delivered = [{ smsId: "institution-otp", userTurnsAtArrival: 7 }];
    assert.equal(planSmsBackstop({ declared, delivered, userTurns: 8 }).action, "wait");
    const second = planSmsBackstop({ declared, delivered, userTurns: 13 });
    assert.equal(second.action === "deliver" && second.item.smsId, "institution-safe-account", `${v.variantId}: 둘째 = 계좌`);
    assert.equal(
      planSmsBackstop({ declared, delivered: [...delivered, { smsId: "institution-safe-account", userTurnsAtArrival: 13 }], userTurns: 20 }).action,
      "none_pending",
    );
  }
});

test("[신고①] 이체 화면(safe-account-transfer · D-115)에 고급 세션이 도달할 수 있다", () => {
  const item = findMockScreenItem(INSTITUTION, "safe-account-transfer")!;
  assert.ok(item);
  for (const v of ADVANCED) {
    assert.equal(
      isMockScreenReachable({ scenarioId: INSTITUTION, difficultyLevel: "advanced", flowVariantId: v.variantId }, item),
      true,
      v.variantId,
    );
  }
});

test("[신고①] Live 조립 — 계좌 예시가 링크 이체 화면 기준이고 '링크 문자는 보낸 적이 없다'가 없다", () => {
  for (const v of ADVANCED) {
    const text = assembled(v.variantId);
    assert.ok(text.includes("계좌 안내(이체 링크 포함)"), `${v.variantId}: 종류 라벨`);
    assert.ok(text.includes("문자로 보낸 계좌 안내의 링크를 열어 그 화면에서 금액을 넣고 이체해 달라"), `${v.variantId}: 예시`);
    assert.ok(text.includes(TRANSFER_VIA_LINK_ONLY_SENTENCE.trim()), `${v.variantId}: 링크 화면에서만`);
    assert.ok(!text.includes("링크 문자는 보낸 적이 없으니"), `${v.variantId}: 모순 문장 0`);
    assert.ok(text.includes(TRANSFER_LINK_IS_ONLY_LINK_SENTENCE.trim()), `${v.variantId}: 다른 링크 문자 지어내기 차단(리뷰 M2)`);
    assert.ok(!text.includes(`"문자로 보낸 계좌로 보내 달라"`), `${v.variantId}: "알아서 보내라" 예시 0`);
    assert.ok(text.includes(`"방금 문자로 간 인증번호를 불러 달라"`), `${v.variantId}: 인증번호 예시`);
  }
});

test("[신고①] transferSmsLink 부재 · false는 종전 문면(바이트 동일) — 다른 경로 회귀 0", () => {
  const v = ADVANCED[0]!;
  const prompt = resolveSessionScenarioPrompt(INSTITUTION, v.variantId)!;
  const base = { ...liveOpts(v.variantId), transferSmsLink: undefined };
  assert.equal(buildSystemPrompt(prompt, { ...base, transferSmsLink: false }), buildSystemPrompt(prompt, base));
  assert.ok(buildSystemPrompt(prompt, base).includes(`"문자로 보낸 계좌로 보내 달라"`));
});

test("[신고①] sessionTransferSmsOpensLanding — 링크가 붙은 계좌 문자 선언만 참 · 변형 부재 = 거짓", () => {
  for (const v of ADVANCED) assert.equal(sessionTransferSmsOpensLanding(INSTITUTION, v.variantId), true, v.variantId);
  assert.equal(sessionTransferSmsOpensLanding(INSTITUTION, undefined), false);
  // loan 계좌 문자(loan-account)는 링크가 없다.
  for (const v of listFlowVariants("loan-refinance-scam", "intermediate")) {
    assert.equal(sessionTransferSmsOpensLanding("loan-refinance-scam", v.variantId), false, v.variantId);
  }
});

// ── ② "내 정보" 카드 — 먼저 말해 확인시킨다 ──────────────────────────────────────────────────

const CARD_FULL: PersonaCardItem[] = [
  { key: "name", label: "이름", value: "김하늘" },
  { key: "birthDate", label: "생년월일", value: "1965년 3월 2일생" },
  { key: "region", label: "사는 곳", value: "대전광역시" },
];

test("[신고②] 원천 존재 — 카드 대상 4종의 요구 예시 문구가 시나리오 프롬프트에 그대로 있다(문구가 바뀌면 치환이 조용히 꺼진다)", () => {
  const text = (id: string) => [SCENARIO_PROMPTS[id]!.personaPrompt, ...SCENARIO_PROMPTS[id]!.weakenedTactics].join("\n");
  assert.equal(text(INSTITUTION).split(INSTITUTION_IDENTITY_DEMAND).length - 1, 2, "institution 2곳");
  assert.equal(text("card-company-impersonation").split(NAME_FIRST_DEMAND).length - 1, 2, "card 2곳");
  assert.equal(text("loan-refinance-scam").split(NAME_FIRST_DEMAND).length - 1, 2, "loan 2곳");
  assert.equal(text("courier-customs-scam").split(NAME_ADDRESS_DEMAND).length - 1, 2, "courier 2곳");
  for (const id of [INSTITUTION, "card-company-impersonation", "loan-refinance-scam", "courier-customs-scam"]) {
    assert.ok(SCENARIO_PROMPTS[id]!.personaPrompt.includes(NOT_YET_SAID_CLAUSE), `${id}: [말투/톤] 줄`);
  }
});

test("[신고②] 카드(이름 · 생년월일) 있는 고급 조립 — 요구 예시 0 · 확인형 예시 · 순서 줄", () => {
  for (const v of ADVANCED) {
    const text = assembled(v.variantId, { personaCard: CARD_FULL });
    assert.ok(!text.includes(INSTITUTION_IDENTITY_DEMAND), `${v.variantId}: 성함·생년월일 요구 예시 0`);
    assert.ok(text.includes("김하늘 님 본인 맞으시죠? 65년 3월 2일생 맞으시고요"), `${v.variantId}: 확인형`);
    assert.ok(text.includes("[미리 확보한 상대 정보]에도 없는 정보는"), `${v.variantId}: 규칙 줄 범위`);
    assert.ok(text.includes(PERSONA_CARD_BLOCK_ORDER), `${v.variantId}: 순서 줄`);
    assert.ok(text.indexOf(PERSONA_CARD_BLOCK_ORDER) < text.lastIndexOf("[안전 지침"), `${v.variantId}: 가드레일 앞`);
  }
});

test("[신고②] 카드 부재 · 빈 배열 · 지역만 — 종전대로 묻는다(바이트 동일)", () => {
  const v = ADVANCED[0]!;
  const none = assembled(v.variantId);
  assert.ok(none.includes(INSTITUTION_IDENTITY_DEMAND));
  assert.equal(assembled(v.variantId, { personaCard: [] }), none);
  const regionOnly = assembled(v.variantId, { personaCard: [CARD_FULL[2]!] });
  assert.ok(regionOnly.includes(INSTITUTION_IDENTITY_DEMAND), "지역만이면 이름·생년월일은 묻는다");
  assert.ok(regionOnly.includes(NOT_YET_SAID_CLAUSE + " "), "규칙 줄 무변경");
});

test("[신고②] 부분 카드 — 없는 항목만 요구한다", () => {
  const nameOnly = applyPersonaCardIdentityConfirm(`("${INSTITUTION_IDENTITY_DEMAND}, 지금")`, [CARD_FULL[0]!]);
  assert.equal(nameOnly, `("김하늘 님, 생년월일 불러주십시오, 지금")`);
  const birthOnly = applyPersonaCardIdentityConfirm(`'${INSTITUTION_IDENTITY_DEMAND}'`, [
    { key: "birthYear", label: "출생 연도", value: "1971년생" },
  ]);
  assert.equal(birthOnly, `'71년생이신 분, 성함 불러주십시오'`);
  assert.equal(applyPersonaCardIdentityConfirm(NAME_FIRST_DEMAND, [CARD_FULL[0]!]), "김하늘 님 본인 맞으시죠");
  assert.equal(applyPersonaCardIdentityConfirm(NAME_ADDRESS_DEMAND, [CARD_FULL[0]!]), "김하늘 님, 주소부터 불러주세요");
  assert.equal(spokenBirth({ key: "birthDate", value: "1965년 3월 2일생" }), "65년 3월 2일생");
});

test("[신고②] 카드 대상 나머지 3종(base 프롬프트)도 이름 카드가 있으면 성함 요구 예시가 0", () => {
  for (const id of ["card-company-impersonation", "loan-refinance-scam", "courier-customs-scam"]) {
    const text = buildSystemPrompt(SCENARIO_PROMPTS[id]!, { difficultyLevel: "advanced", personaCard: [CARD_FULL[0]!] });
    assert.ok(!text.includes(NAME_FIRST_DEMAND) && !text.includes(NAME_ADDRESS_DEMAND), id);
    assert.ok(text.includes("김하늘 님"), id);
  }
});

// ── ③ 추임새 반복 ────────────────────────────────────────────────────────────────────────

test("[신고③] 말투 블록 — '아, 네' 예시 0 · 빈도 · 연속 금지 · '네' 첫머리 금지", () => {
  for (const block of [buildLiveSpeechStyleBlock(true), buildLiveSpeechStyleBlock(false)]) {
    assert.ok(!block.includes("'아, 네', '그러니까'"), "예시 첫머리 '아, 네' 제거");
    assert.match(block, /서너 번 말할 때 한 번 정도/);
    assert.match(block, /같은 추임새로 연달아 말을 시작하지 않고/);
    assert.match(block, /매번 '네'나 '아, 네'로 말을 시작하지 않는다/);
  }
});

test("[신고① 배선 G63] sendMessage · 오프닝 · Live 토큰 — 셋 다 같은 술어로 transferSmsLink를 넘긴다", () => {
  const SRC = path.resolve(__dirname, "../../../src");
  const sites: [string, string][] = [
    ["roleplay/index.ts", "transferSmsLink: sessionTransferSmsOpensLanding(session.scenarioId, session.flowVariantId)"],
    ["roleplay/openingLine.ts", "transferSmsLink: sessionTransferSmsOpensLanding(scenarioId, flowVariantId)"],
    ["realtime/geminiProvider.ts", "transferSmsLink: sessionTransferSmsOpensLanding(input.scenarioId, input.flowVariantId)"],
  ];
  for (const [file, needle] of sites) assert.ok(readFileSync(path.join(SRC, file), "utf8").includes(needle), `${file}: 배선 누락`);
});

test("[신고② 리뷰 6a] 카드 치환 + 세션 계좌 + 가상 은행명을 함께 켜도 셋 다 적용된다(적용 순서 충돌 0)", () => {
  const v = ADVANCED[0]!;
  const text = assembled(v.variantId, { personaCard: CARD_FULL, sessionAccountNumber: "210-3391-5540-08", fictionalBankName: "한결은행" });
  assert.ok(text.includes("김하늘 님 본인 맞으시죠? 65년 3월 2일생 맞으시고요"));
  assert.ok(text.includes("한결은행 210-3391-5540-08"));
  assert.ok(!text.includes("948-2716-5093-27") && !text.includes("OO은행"));
});
