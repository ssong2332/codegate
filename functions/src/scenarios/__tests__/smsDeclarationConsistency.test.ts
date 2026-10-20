// R3-B(2026-10-20 · 감사 A R3) — 조립 대상 문면(페르소나 + 흐름 단계 + 수법)과 세션 문자 선언의 정합 단언.
//
// 재현된 결함: card-company 고급 fv-akj5(문자 선언 0)에서 Live가 "인증번호가 갈 텐데, 받으시는 대로 바로 불러주시겠어요?"라고
// 했다 — 원천은 원본 카드 수법의 '본인확인 문자 지금 갈 거예요, 오시면 그 번호 바로 불러주세요'가 keepLabels로 문자 미선언 변형에
// 복사된 것. bank 수법의 '방금 보내드린 확인번호도 불러주세요'(세 변형 모두 transfer만 선언 — Architecture §52.6 (1) F-A)도 같은 꼴.
// 이 파일은 "문면이 가리키는 문자 = 세션이 선언한 문자"를 데이터 전수로 고정한다.
//
// ── 판정 규칙표(임의 판단 0 — 표에 없는 케이스가 나오면 행을 추가할지 먼저 물을 것) ──────────────────────────────
// | If | Then |
// |---|---|
// | 문면 어디든 OTP_MENTION(인증번호 · 확인번호 · OTP · 인증 문자 · 본인확인 문자)이 있다 | 그 세션은 `identity` 목적을 선언해야 한다 |
// | 한 문장에 SENT_SMS("문자로 보낸" · "방금 보내드린" · "문자 지금 갈" · "오시면 그 번호" 등)가 있다 | 그 문장을 아래 순서로 분류해 그 목적을 선언해야 한다 |
// |   ① 문장에 인증 · 확인번호 · 본인확인 문자 · "그 번호" · OTP | `identity` |
// |   ② (①이 아니고) 계좌 · 이체 · 송금 · 입금 | `transfer` |
// |   ③ (①②가 아니고) 링크 · 앱 · 설치 · 접수 · 주소 | `link`(세금 환급의 "접수는 문자로 보낸 안내에서" = 환급 링크 문자) |
// |   ④ 어느 것도 아니다 | **분류 불가 = 위반**(조용한 통과 0 — 새 문면이면 이 표에 행을 더할 것) |
// | 세션의 "선언" | 변형 세션 = `sessionDeclaredSmsPurposes`(호출부 3곳이 프롬프트에 넘기는 값과 같은 술어) · 변형 없는 세션 = 그 시나리오 카탈로그 전부(kind → 목적 — `sessionDeclaresInCallSms`가 `hasInCallSms`로 종전 템플릿을 켜고, 그 템플릿이 세 종류를 모두 "도착한다"고 말하므로) |
// | 제외 | 메신저 스미싱 계열(`messenger-parcel-smishing-sms` · `messenger-subsidy-smishing-sms`) — 채널 자체가 문자 메시지라 "문자로 보낸 링크"가 대화창 본문 그 자체이고 통화 중 문자 선언(`sms`)과 무관하다 |
//
// ⚠️ 자기 고지(못 잡는 것): 표기 검사다. "번호 하나 갈 거예요"처럼 위 어휘를 피한 문면, 그리고 조립부(promptAssembly)가 붙이는
// 공통 문면은 대상이 아니다(공통 문면은 `[A-1/②]` 계열 테스트가 본다). OTP_MENTION은 금지형 문장("인증번호를 요구하지 않는다")도
// 위반으로 센다 — 현재 데이터에 그런 문장은 0건이다(이 실행이 통과하는 것이 그 증거). 생기면 위 표에 금지형 예외 행을 더할 것.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIO_PROMPTS } from "../index";
import { IN_CALL_SMS, type InCallSmsKind } from "../inCallSms";
import { beginnerBriefingLabels, FLOW_VARIANTS, resolveVariantPrompt, type FlowVariant, type SmsPurpose } from "../flowVariants";
import { sessionDeclaredSmsPurposes, sessionDeclaresInCallSms } from "../../inCallSms/smsGate";
import { extractTacticFlavor, extractTacticLabel } from "../tacticFlavor";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import { hasVerifyIntercept } from "../verifyIntercept";
import { isL3Procedural } from "../../roleplay/l3Depth";
import { asksIdentityCheck } from "../../roleplay/personaAuthority";
import { analyzeConversation } from "../../report/analyzeConversation";

const OTP_MENTION = /인증\s*번호|확인\s*번호|OTP|인증\s*문자|본인\s*확인\s*문자/;
const SENT_SMS =
  /문자로\s*(?:방금\s*)?(?:보낸|보내|간|온|받)|방금\s*보내\s*드린|보내\s*드린\s*(?:문자|번호|확인)|문자\s*(?:지금\s*)?(?:갈|가요|갑니다|보낼|보내\s*드릴)|문자가?\s*오(?:면|시면)|오시면\s*그\s*번호/;
const CLASSIFY: ReadonlyArray<[SmsPurpose, RegExp]> = [
  ["identity", /인증|확인\s*번호|본인\s*확인\s*문자|그\s*번호|OTP/],
  ["transfer", /계좌|이체|송금|입금/],
  ["link", /링크|앱|설치|접수|주소/],
];
const KIND_TO_PURPOSE: Record<InCallSmsKind, SmsPurpose> = { otp: "identity", account: "transfer", link: "link" };
const EXCLUDED_SMS_CHANNEL_SCENARIOS = new Set(["messenger-parcel-smishing-sms", "messenger-subsidy-smishing-sms"]);

type Session = { key: string; scenarioId: string; declared: readonly SmsPurpose[]; text: string };

function sessionText(prompt: { personaPrompt: string; weakenedTactics: readonly string[] }): string {
  return [prompt.personaPrompt, ...prompt.weakenedTactics].join("\n");
}

function variantSession(variant: FlowVariant): Session {
  const prompt = resolveVariantPrompt(SCENARIO_PROMPTS[variant.scenarioId], variant);
  return {
    key: variant.variantId,
    scenarioId: variant.scenarioId,
    declared: sessionDeclaredSmsPurposes(variant.scenarioId, variant.variantId) ?? [],
    text: sessionText(prompt),
  };
}

function noVariantSession(scenarioId: string): Session {
  const declared = [...new Set((IN_CALL_SMS[scenarioId] ?? []).map((item) => KIND_TO_PURPOSE[item.kind]))];
  return { key: `(변형 없음) ${scenarioId}`, scenarioId, declared, text: sessionText(SCENARIO_PROMPTS[scenarioId]) };
}

function allSessions(): Session[] {
  return [...FLOW_VARIANTS.map(variantSession), ...Object.keys(SCENARIO_PROMPTS).map(noVariantSession)].filter(
    (s) => !EXCLUDED_SMS_CHANNEL_SCENARIOS.has(s.scenarioId),
  );
}

/** 규칙표대로 위반을 센다(빈 배열 = 정합). */
function violations(session: Session): string[] {
  const out: string[] = [];
  const otp = OTP_MENTION.exec(session.text);
  if (otp && !session.declared.includes("identity")) out.push(`${session.key}: "${otp[0]}" 언급 — identity 미선언`);
  for (const sentence of session.text.split(/(?<=[.。])\s+|\n/)) {
    const sent = SENT_SMS.exec(sentence);
    if (!sent) continue;
    const purpose = CLASSIFY.find(([, pattern]) => pattern.test(sentence))?.[0];
    if (purpose === undefined) out.push(`${session.key}: "${sent[0]}" — 분류 불가(규칙표 ④) :: ${sentence.slice(0, 80)}`);
    else if (!session.declared.includes(purpose)) out.push(`${session.key}: "${sent[0]}" → ${purpose} 미선언 :: ${sentence.slice(0, 80)}`);
  }
  return out;
}

test("[R3-B 정합] 전 흐름 변형 + 변형 없는 세션 — 문면이 가리키는 인증번호 · 문자는 그 세션이 선언한 목적이다(메신저 스미싱 2종 제외)", (t) => {
  const sessions = allSessions();
  assert.equal(sessions.length, FLOW_VARIANTS.filter((v) => !EXCLUDED_SMS_CHANNEL_SCENARIOS.has(v.scenarioId)).length +
    Object.keys(SCENARIO_PROMPTS).filter((id) => !EXCLUDED_SMS_CHANNEL_SCENARIOS.has(id)).length);
  // 제외 목록이 실재하는 시나리오인지(오타로 아무것도 안 빼는 상태 차단).
  for (const id of EXCLUDED_SMS_CHANNEL_SCENARIOS) assert.ok(SCENARIO_PROMPTS[id], `제외 대상 ${id}가 시나리오에 없다`);
  const found = sessions.flatMap(violations);
  const sentChecked = sessions.filter((s) => s.text.split(/(?<=[.。])\s+|\n/).some((x) => SENT_SMS.test(x))).length;
  t.diagnostic(`세션 ${sessions.length}개 검사 · 문자 언급 세션 ${sentChecked}개 · 위반 ${found.length}건`);
  assert.ok(sentChecked > 0, "문자 언급 세션이 0개 — 검사가 아무것도 재지 않았다");
  assert.deepEqual(found, []);
});

test("[R3-B 정합 · 대상] 수정 대상 세션 — card fv-aqp6 · fv-akj5 · fv-x7ue 와 bank 세 변형은 인증번호 · 미선언 문자 언급 0", () => {
  for (const id of ["fv-aqp6", "fv-akj5", "fv-x7ue", "fv-xuvu", "fv-mhnv", "fv-62q8"]) {
    const variant = FLOW_VARIANTS.find((v) => v.variantId === id);
    assert.ok(variant, id);
    const session = variantSession(variant);
    assert.equal(OTP_MENTION.test(session.text), false, `${id}: 인증번호 언급이 남았다`);
    assert.deepEqual(violations(session), [], id);
  }
  // 라벨은 원본과 같다(리포트 분류 · T92 게이트 · 브리핑 라벨 유지) — 원본 카드 라벨 집합 ⊇ 변형 라벨.
  const cardLabels = new Set(SCENARIO_PROMPTS["card-company-impersonation"].weakenedTactics.map(extractTacticLabel));
  for (const id of ["fv-aqp6", "fv-akj5"]) {
    const variant = FLOW_VARIANTS.find((v) => v.variantId === id)!;
    for (const label of ["카드정보 직접 요구", "부인 시 명의 도용 암시"]) {
      assert.ok(variant.tactics.some((x) => extractTacticLabel(x) === label), `${id}: "${label}" 라벨이 사라졌다`);
      assert.ok(cardLabels.has(label));
    }
  }
  // 원본(identity · transfer를 선언한 fv-35f2와 변형 없는 세션이 쓰는 것)은 그대로 문자 의존 인용을 갖는다 — 원본 무수정 확인.
  const original = SCENARIO_PROMPTS["card-company-impersonation"].weakenedTactics.join("\n");
  assert.ok(original.includes("본인확인 문자 지금 갈 거예요, 오시면 그 번호 바로 불러주세요"));
});

test("[R3-B 정합 · 역방향] 수정 전 card(원본 3라벨 복사) · bank('방금 보내드린 확인번호') 문면으로 만든 사본은 위반으로 잡힌다", (t) => {
  const card = SCENARIO_PROMPTS["card-company-impersonation"];
  const originalByLabel = (label: string) => card.weakenedTactics.find((x) => extractTacticLabel(x) === label)!;
  const taintedCard: string[] = [];
  for (const id of ["fv-aqp6", "fv-akj5"]) {
    const variant = FLOW_VARIANTS.find((v) => v.variantId === id)!;
    // 수정 전: 변형 수법의 같은 라벨 자리를 원본 문면으로 되돌린다(= base main ea97aa0의 keepLabels 복사 결과와 같은 문면).
    const before: FlowVariant = {
      ...variant,
      tactics: variant.tactics.map((x) =>
        ["카드정보 직접 요구", "부인 시 명의 도용 암시", "피해금 이관 요구"].includes(extractTacticLabel(x))
          ? originalByLabel(extractTacticLabel(x))
          : x,
      ),
    };
    const found = violations(variantSession(before));
    t.diagnostic(`역방향 ${id}: ${JSON.stringify(found)}`);
    assert.ok(found.length > 0, `${id}: 수정 전 문면을 놓쳤다 — 죽은 검사`);
    taintedCard.push(...found);
  }
  assert.ok(taintedCard.some((x) => x.includes("identity 미선언")), "인증번호 미선언 위반이 잡혀야 한다");

  const bankBefore = noVariantSession("bank-security-verify-scam");
  const tainted: Session = {
    ...bankBefore,
    key: "bank(수정 전 사본)",
    text: bankBefore.text.replace(
      "'출금 정지 걸려면 계좌 비밀번호까지 확인돼야 해요, 불러주세요'로 비밀번호를 따로 요구한다",
      "'방금 보내드린 확인번호도 불러주세요'로 인증 정보를 요구한다",
    ),
  };
  assert.notEqual(tainted.text, bankBefore.text, "역검증 전제 — 현행 bank 문면이 치환 대상과 같아야 한다");
  const bankFound = violations(tainted);
  t.diagnostic(`역방향 bank: ${JSON.stringify(bankFound)}`);
  assert.ok(bankFound.some((x) => x.includes("identity 미선언")), "bank 수정 전 사본을 놓쳤다 — 죽은 검사");
  // 분류 불가(④)도 위반이다.
  assert.ok(violations({ key: "샘플", scenarioId: "x", declared: ["transfer", "link", "identity"], text: "그건 문자로 보낸 걸 보세요." }).length > 0);
});

// ── R3 리뷰 C1 — 문자 예외 블록의 SMS_METHOD_LINE과 수법의 계좌 낭독 지시는 한 조립에 공존하지 않는다 ─────────────────────────
// SMS_METHOD_LINE(DEFAULT · TOOL_DRIVEN 공통 꼬리 절 — §59.3 G386-b 보존 절)은 문자 예외 블록이 실릴 때(= 세션이 문자를 1개 이상 선언)만
// 조립된다. 그 절은 "계좌번호의 구체적인 값을 네가 지어내 읽어 주지도 않는다"고 하므로, 같은 조립의 수법이 계좌를 소리 내 불러 주라고
// 하면 정면 모순이다(리뷰가 fv-x7ue에서 찾은 형태). 판정 단위는 **수법 목록**이다(공통 조립부는 대상이 아니다).
const SMS_METHOD_NO_READOUT = "구체적인 값을 네가 지어내 읽어 주지도 않는다";
/** 계좌 낭독 지시 — "계좌 불러줄게/불러드릴게" 인용 · "계좌는 '…' 같은/처럼 … 부른다" 지시. */
const ACCOUNT_READOUT = /계좌\s*불러\s*(?:줄게|드릴게)|계좌는\s*'[^']+'\s*(?:같은|처럼)[^.]*부르/;

function assembleLikeSendMessage(prompt: { personaPrompt: string; weakenedTactics: string[]; guardrailPreamble: string }, scenarioId: string, level: FlowVariant["level"], variantId: string | undefined, toolDrivenTiming: boolean): string {
  return buildSystemPrompt(prompt, {
    difficultyLevel: level,
    inCallSmsEnabled: sessionDeclaresInCallSms(scenarioId, variantId),
    inCallSmsPurposes: sessionDeclaredSmsPurposes(scenarioId, variantId),
    verifyInterceptEnabled: hasVerifyIntercept(scenarioId) && level === "advanced",
    l3Procedural: isL3Procedural(scenarioId),
    identityCheckAllowed: asksIdentityCheck(scenarioId),
    toolDrivenTiming,
  });
}

function readoutConflicts(variant: FlowVariant, tactics: readonly string[] = variant.tactics): string[] {
  const out: string[] = [];
  const prompt = resolveVariantPrompt(SCENARIO_PROMPTS[variant.scenarioId], { ...variant, tactics: [...tactics] });
  for (const toolDrivenTiming of [false, true]) {
    const assembled = assembleLikeSendMessage(prompt, variant.scenarioId, variant.level, variant.variantId, toolDrivenTiming);
    if (!assembled.includes(SMS_METHOD_NO_READOUT)) continue;
    for (const tactic of tactics) {
      const hit = ACCOUNT_READOUT.exec(tactic);
      if (hit) out.push(`${variant.variantId}(tool=${toolDrivenTiming}): "${extractTacticLabel(tactic)}" 수법의 "${hit[0]}" ↔ SMS_METHOD_LINE`);
    }
  }
  return out;
}

test("[R3 리뷰 C1] 문자를 선언한 모든 변형 — 조립에 SMS_METHOD_LINE이 실리면 수법에 계좌 낭독 지시 0 · 문자 선언 0인 fv-akj5 조립에는 SMS_METHOD_LINE 자체가 없다", (t) => {
  const declaring = FLOW_VARIANTS.filter((v) => sessionDeclaresInCallSms(v.scenarioId, v.variantId));
  assert.ok(declaring.length > 0);
  const found = declaring.flatMap((v) => readoutConflicts(v));
  t.diagnostic(`문자 선언 변형 ${declaring.length}개 × toolDrivenTiming 2값 검사 · 충돌 ${found.length}건`);
  assert.deepEqual(found, []);
  // 전제 — 패턴이 살아 있다: 낭독형 문면(fv-akj5)과 원본 family 문면은 패턴에 걸린다.
  const akj5 = FLOW_VARIANTS.find((v) => v.variantId === "fv-akj5")!;
  assert.ok(akj5.tactics.some((x) => ACCOUNT_READOUT.test(x)), "fv-akj5 낭독형이 패턴에 안 걸린다 — 죽은 검사");
  // fv-akj5(문자 선언 0)는 낭독형을 유지해도 된다 — 조립에 SMS_METHOD_LINE이 실리지 않는다.
  for (const toolDrivenTiming of [false, true]) {
    const assembled = assembleLikeSendMessage(resolveVariantPrompt(SCENARIO_PROMPTS[akj5.scenarioId], akj5), akj5.scenarioId, "advanced", "fv-akj5", toolDrivenTiming);
    assert.equal(assembled.includes(SMS_METHOD_NO_READOUT), false, `fv-akj5(tool=${toolDrivenTiming}): SMS_METHOD_LINE이 실렸다`);
    assert.equal(assembled.includes("문자로 도착한 것은 예외다"), false, "fv-akj5: 문자 예외 블록이 실렸다");
  }
  assert.deepEqual(readoutConflicts(akj5), []);
});

test("[R3 리뷰 C1 · 역방향] fv-x7ue가 fv-akj5의 낭독형 피해금 문면을 받은 사본(리뷰 지적 상태)은 위반으로 잡힌다", (t) => {
  const x7ue = FLOW_VARIANTS.find((v) => v.variantId === "fv-x7ue")!;
  const akj5 = FLOW_VARIANTS.find((v) => v.variantId === "fv-akj5")!;
  const readout = akj5.tactics.find((x) => extractTacticLabel(x) === "피해금 이관 요구")!;
  const tainted = x7ue.tactics.map((x) => (extractTacticLabel(x) === "피해금 이관 요구" ? readout : x));
  assert.notDeepEqual(tainted, x7ue.tactics, "역검증 전제 — fv-x7ue는 fv-akj5와 다른 피해금 문면이어야 한다");
  const found = readoutConflicts(x7ue, tainted);
  t.diagnostic(`역방향 fv-x7ue: ${JSON.stringify(found)}`);
  assert.ok(found.length > 0, "리뷰 지적 상태를 놓쳤다 — 죽은 검사");
  // 현행 fv-x7ue 피해금 문면은 계좌를 부르지도, 문자로 보냈다고도 하지 않는다.
  const current = x7ue.tactics.find((x) => extractTacticLabel(x) === "피해금 이관 요구")!;
  assert.equal(ACCOUNT_READOUT.test(current), false);
  assert.equal(SENT_SMS.test(current), false);
});

// ── R3 리뷰 M2 — 수법 순서는 base(main ea97aa0) 그대로 ────────────────────────────────────────────────────────────────────
test("[R3 리뷰 M2] 카드 3변형의 수법 라벨 순서 = base 순서 · 초급 브리핑 라벨 = main과 같은 순서", () => {
  const order = (id: string) => FLOW_VARIANTS.find((v) => v.variantId === id)!.tactics.map(extractTacticLabel);
  const advancedBase = ["놀람 유발", "긴급성 조성", "카드정보 직접 요구", "피해금 이관 요구", "부인 시 명의 도용 암시", "안심 유도", "보안 점검 앱 설치 요구", "기관 조사 언급"];
  assert.deepEqual(order("fv-akj5"), advancedBase);
  assert.deepEqual(order("fv-x7ue"), advancedBase);
  const beginnerBase = ["놀람 유발", "긴급성 조성", "카드정보 직접 요구", "부인 시 명의 도용 암시", "안심 유도"];
  assert.deepEqual(order("fv-aqp6"), beginnerBase);
  // main ea97aa0의 브리핑 라벨(초급 변형 1벌 = fv-aqp6의 keepLabels 순서 그대로).
  assert.deepEqual(beginnerBriefingLabels("card-company-impersonation"), beginnerBase);
});

test("[R3 리뷰 M2] 리포트 인용 매칭 — 카드 3변형 세션에서 각 수법 인용구 대사가 잡는 라벨 집합이 수정 전(원본 문면 복사)과 같다", (t) => {
  const card = SCENARIO_PROMPTS["card-company-impersonation"];
  const original = (label: string) => card.weakenedTactics.find((x) => extractTacticLabel(x) === label);
  const detected = (tactics: string[]) =>
    tactics.map((tactic) => {
      const used = analyzeConversation([{ role: "scammer", textMasked: extractTacticFlavor(tactic), turnIndex: 0, createdAtMs: 0 }], 0, tactics).tacticsUsed;
      return used.includes(extractTacticLabel(tactic)) ? extractTacticLabel(tactic) : `(못 잡음) ${extractTacticLabel(tactic)}`;
    });
  for (const id of ["fv-aqp6", "fv-akj5", "fv-x7ue"]) {
    const variant = FLOW_VARIANTS.find((v) => v.variantId === id)!;
    const before = variant.tactics.map((x) => (["카드정보 직접 요구", "부인 시 명의 도용 암시", "피해금 이관 요구"].includes(extractTacticLabel(x)) ? original(extractTacticLabel(x))! : x));
    const now = detected(variant.tactics);
    t.diagnostic(`${id} 지금 ${JSON.stringify(now)}`);
    assert.deepEqual(now, detected(before), `${id}: 리포트 인용 매칭 결과가 수정 전과 다르다`);
    assert.equal(now.some((x) => x.startsWith("(못 잡음)")), false, `${id}: 인용구 대사로 자기 수법을 못 잡는 수법이 있다`);
  }
});
