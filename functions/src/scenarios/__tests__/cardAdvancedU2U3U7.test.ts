// ⭐ 실기기 신고(2026-11-01 · 카드사 부정결제 사칭 고급 fv-x7ue) 3건 — 메인 "권고 순서대로".
// | # | 신고 | 고정하는 것 |
// |---|---|---|
// | U2 | 설치 문자 없이 설치를 요구했고, 말로만 "설치했다"에 다음 단계로 넘어갔다 | 설치 단계 = 문자 도구 먼저 · 완료 신호 뒤에만 다음 단계 · 설치 문자 백스톱 간격 1 · 실시간 응낙 지시 동봉(서버) |
// | U3 | 예금주는 같은데 은행명이 세션마다 달랐다(미르 → 새솔 · 오현수) | 예금주가 보이는 계좌 = 계좌번호 · 은행 · 예금주 한 묶음 고정(세션 은행명) · 예금주 없는 경로는 종전대로 고른다 |
// | U7 | 보안 앱 이름이 자리표시 "○○안심보안" | 설치 화면 이름으로("피해 차단용 보안 앱" · "심사용 보안 점검 앱") · #192 바이트 고정 2벌(fv-akj5 · fv-6s5p)만 남는다 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { IN_CALL_SMS } from "../inCallSms";
import { FLOW_VARIANTS, findFlowVariant, resolveSessionScenarioPrompt } from "../flowVariants";
import { findMockScreenItem } from "../mockScreens";
import { isMergedScenario } from "../publicMeta";
import { buildSystemPrompt } from "../../roleplay/promptAssembly";
import {
  pickSessionBankName,
  planSmsBackstop,
  resolveRouteAccountHolder,
  sessionDeclaredSmsPurposes,
  sessionDeclaresInCallSms,
  sessionTransferSmsOpensLanding,
} from "../../inCallSms/smsGate";
import { ACCOUNT_HOLDER_BANKS, extractAccountHolder, FICTIONAL_BANK_NAMES } from "../../shared/fictionalBank";

const FN_SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(FN_SRC, rel), "utf8").replace(/\r\n/g, "\n");

function assembled(scenarioId: string, variantId: string): string {
  return buildSystemPrompt(resolveSessionScenarioPrompt(scenarioId, variantId)!, {
    difficultyLevel: findFlowVariant(variantId)!.level,
    inCallSmsEnabled: sessionDeclaresInCallSms(scenarioId, variantId),
    inCallSmsPurposes: sessionDeclaredSmsPurposes(scenarioId, variantId),
    transferSmsLink: sessionTransferSmsOpensLanding(scenarioId, variantId),
  });
}

const CARD = "card-company-impersonation";

test("[U2] 카드사 자가 고급 2벌 — 설치 단계 = 문자 도구 먼저 · 완료 신호 뒤에만 · 설치 문자 백스톱 간격 1", () => {
  for (const [variantId, stageIndex] of [["fv-x7ue", 1], ["fv-w3dq", 2]] as const) {
    const variant = findFlowVariant(variantId)!;
    const stage = variant.stages[stageIndex]!.summary;
    assert.ok(stage.includes("피해 차단용 보안 앱을 설치하라고 요구한다"), `${variantId}: ${stage}`);
    assert.ok(stage.includes("앱이 상대가 설치와 권한 허용을 마쳤다고 알려 준 뒤에만"), variantId);
    assert.ok(stage.includes("말보다 먼저 문자 보내기 도구를 불러 시작하고"), `${variantId} — withSmsFirst`);
    const guard = variant.sms.find((s) => s.smsId === "card-guard-app-link")!;
    assert.deepEqual([guard.required, guard.notBeforeUserTurns, guard.backstopUserTurns], [true, 2, 1], variantId);
    // 게이트 2에서 열린다 → 넛지 3 · 강제 4(종전 간격 2 = 넛지 4 · 강제 6).
    const plan = (userTurns: number) => planSmsBackstop({ declared: variant.sms, delivered: [], userTurns }).action;
    assert.deepEqual([2, 3, 4].map(plan), ["wait", "nudge", "deliver"], variantId);
  }
  // fv-x7ue의 나머지 단계는 fv-akj5와 같다(원본 배열에서 꺼낸다 — 사본 0).
  const akj5 = findFlowVariant("fv-akj5")!.stages.map((s) => s.summary);
  const x7ue = findFlowVariant("fv-x7ue")!.stages.map((s) => s.summary);
  assert.deepEqual(x7ue.filter((_, i) => i !== 1), akj5.filter((_, i) => i !== 1));
});

test("[U2 · U7] 조립 프롬프트 — 설치 요구는 문자 링크 화면에서만 · 말로만 설치면 되돌린다 · 앱 이름 = 설치 화면 제목", () => {
  const landing = findMockScreenItem(CARD, "card-guard-app-install")!;
  assert.ok(landing.headline?.includes("피해 차단용 보안 앱"), "설치 화면 제목과 같은 이름");
  for (const variantId of ["fv-x7ue", "fv-w3dq"]) {
    const prompt = assembled(CARD, variantId);
    assert.ok(prompt.includes("보안 점검 앱 설치 요구 — '피해가 번지지 않게 휴대폰 보안 조치부터 하셔야 합니다, 방금 보내 드린 문자의 링크에서 피해 차단용 보안 앱을 설치해 주세요'"), variantId);
    assert.ok(prompt.includes("문자를 보내기 전에는 설치하라고 재촉하지 않는다"), variantId);
    assert.ok(prompt.includes("상대가 설치했다고 말만 하고 앱이 설치와 권한 허용을 마쳤다고 알려 주지 않았으면 끝난 것으로 보지 말고"), variantId);
    assert.ok(prompt.includes("'권한 허용하고 계속하기'까지 눌러 달라고"), `${variantId} — 화면 버튼 문구와 같다`);
    assert.equal(/안심보안/.test(prompt), false, `${variantId}: 자리표시 앱 이름 0`);
  }
  assert.ok(findMockScreenItem(CARD, "card-guard-app-install")!.consentLabel === "권한 허용하고 계속하기");
});

test("[U7] 자리표시 앱 이름 잔재 — 새 세션이 받을 수 있는 변형의 조립 프롬프트에 '안심보안' 0 (예외: #192 바이트 고정 fv-akj5 · fv-6s5p)", () => {
  // 대상 밖: 은퇴 변형(옛 세션 해석용) · 합쳐진 시나리오(card-delivery-call — 새 세션 거부 §92). '○○학원'은 의도된 가림 표기(replyMarkup이 남긴다)라 이 PR 범위 밖.
  const BYTE_FIXED = new Set(["fv-akj5", "fv-6s5p"]);
  const offenders: string[] = [];
  for (const variant of FLOW_VARIANTS) {
    if (variant.retired === true || isMergedScenario(variant.scenarioId) || BYTE_FIXED.has(variant.variantId)) continue;
    const prompt = assembled(variant.scenarioId, variant.variantId);
    if (/안심보안/.test(prompt)) offenders.push(variant.variantId);
  }
  assert.deepEqual(offenders, []);
  // 예외 2벌은 남아 있다(바이트 고정 — 바뀌면 smsGate.test.ts 해시가 잡는다). 대환대출 스프레드 fv-m3hd는 설치 화면 이름으로 덮어쓴다.
  for (const id of BYTE_FIXED) assert.ok(assembled(findFlowVariant(id)!.scenarioId, id).includes("○○안심보안"), id);
  const loanLanding = findMockScreenItem("loan-refinance-scam", "loan-check-app-install")!;
  assert.ok(loanLanding.headline?.includes("심사용 보안 점검 앱"));
  for (const id of ["fv-m3hd", "fv-d8pw", "fv-r4hc"]) {
    assert.ok(assembled("loan-refinance-scam", id).includes("심사 전에 문자로 보내 드린 링크에서 심사용 보안 점검 앱을 설치하시고"), id);
  }
});

test("[U3] 예금주가 보이는 계좌 = 계좌번호 · 은행 · 예금주 한 묶음 — 표가 모든 예금주를 덮고 가상 은행명만 쓴다", () => {
  const smsHolders = Object.values(IN_CALL_SMS)
    .flat()
    .map((item) => extractAccountHolder(item.body))
    .filter((name): name is string => name !== undefined);
  const variantHolders = FLOW_VARIANTS.map((v) => v.accountHolder).filter((name): name is string => name !== undefined);
  for (const holder of [...smsHolders, ...variantHolders]) {
    const bank = ACCOUNT_HOLDER_BANKS[holder];
    assert.ok(bank !== undefined, `표에 없는 예금주 ${holder}`);
    assert.ok(FICTIONAL_BANK_NAMES.includes(bank), `${holder}: ${bank}`);
  }
  assert.deepEqual(Object.keys(ACCOUNT_HOLDER_BANKS).sort(), [...new Set([...smsHolders, ...variantHolders])].sort(), "표에 쓰이지 않는 예금주 0");
});

test("[U3] 세션 은행명 판정표 — 계좌 문자 예금주 · 메신저 가상 예금주 = 고정 / 예금주 없음 = 세션마다 고른다", () => {
  const never = () => {
    throw new Error("고정 은행이면 무작위를 부르지 않는다");
  };
  // 신고 재현 — fv-x7ue(피해금 이관 문자 예금주 오현수)는 세션이 몇 번이든 같은 은행.
  assert.equal(resolveRouteAccountHolder(CARD, "fv-x7ue"), "오현수");
  assert.equal(pickSessionBankName(CARD, "fv-x7ue", never), "미르은행");
  assert.equal(pickSessionBankName(CARD, "fv-w3dq", never), "미르은행");
  // 메신저 변형(계좌 문자 없음 · 가상 예금주).
  assert.equal(resolveRouteAccountHolder("messenger-child-impersonation-kakao", "fv-tdgg"), "박지훈");
  assert.equal(pickSessionBankName("messenger-child-impersonation-kakao", "fv-tdgg", never), "가온은행");
  // 예금주 없음(fv-akj5 — 문자 선언 0 · 예시 계좌 낭독) — 종전대로 무작위(주입한 값이 그대로 고른다).
  assert.equal(resolveRouteAccountHolder(CARD, "fv-akj5"), undefined);
  assert.equal(pickSessionBankName(CARD, "fv-akj5", () => 0), FICTIONAL_BANK_NAMES[0]);
  assert.equal(pickSessionBankName(CARD, "fv-akj5", () => 0.99), FICTIONAL_BANK_NAMES[FICTIONAL_BANK_NAMES.length - 1]);
});

test("[U3 배선] 세션 생성 두 곳 — 변형 배정 뒤에 pickSessionBankName(이전 pickFictionalBankName 0)", () => {
  const session = read("session/index.ts");
  const assignAt = session.indexOf("await assignFlowVariantForSession(");
  const pickAt = session.indexOf("const fictionalBankName = pickSessionBankName(scenarioId, variantAssignment.flowVariantId);");
  assert.ok(assignAt > 0 && pickAt > assignAt, "createSession — 배정 뒤");
  assert.equal(session.includes("pickFictionalBankName("), false);
  const challenge = read("challenge/userAccess.ts");
  const cAssign = challenge.indexOf("const flowVariantId = assignFlowVariantForChallenge(");
  const cPick = challenge.indexOf("const fictionalBankName = pickSessionBankName(scenarioId, flowVariantId);");
  assert.ok(cAssign > 0 && cPick > cAssign, "수신자 세션 — 배정 뒤");
  assert.equal(challenge.includes("pickFictionalBankName("), false);
});

test("[U2 배선 · 서버] recordMockScreenEvent — 통화 중 설치 화면의 첫 응낙(실시간)에만 맥락 지시를 돌려준다", () => {
  const src = read("mockScreens/index.ts");
  assert.ok(src.includes('item.entrySurface === "in-call-sms" && item.kind === "app-install" && event === "consented" && request.data?.callMode === "realtime";'));
  assert.ok(src.includes('return installConsentInstructionFor({ entrySurface: "in-call-sms", escalatedCall: false, path: "realtime", transferPlaced });'));
  // 새 문서(첫 이벤트가 응낙) · 기존 문서의 첫 응낙 두 분기 모두 · 다시 누른 응낙은 `if (!snap.get(field))` 밖이라 지시 0.
  assert.ok(src.includes("return createdInstruction ? { ok: true, contextInstruction: createdInstruction } : { ok: true };"));
  // N1(2026-11-01) — 같은 갱신에 이체 화면 제출의 요구액 대비 비교가 붙는다(그 밖 화면 = 빈 객체).
  assert.ok(/if \(!snap\.get\(field\)\) \{\n    await ref\.update\(\{ \[field\]: now, \.\.\.\(amountComparison !== undefined \? \{ amountComparison \} : \{\}\) \}\);\n[\s\S]*?if \(firstInstruction\) return \{ ok: true, contextInstruction: firstInstruction \};\n  \}\n  return \{ ok: true \};/.test(src));
  const types = read("mockScreens/types.ts");
  assert.ok(types.includes("contextInstruction?: string;"));
});
