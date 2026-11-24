// 재측정 R-3 · 사용자 결정 (B)(2026-11-24) — 가족 사고 · 손주 말 송금 6변형 → 계좌 문자 · 앱 안 이체 화면.
// 판정표 TS · EP = `docs/research/verbal-transfer-to-screen-2026-11-24.md`. ⛔ 라이브 호출 0건.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findFlowVariant, type FlowVariant } from "../flowVariants";
import { findInCallSmsItem, SMS_SENDER_NUMBER } from "../inCallSms";
import { findMockScreenItem, isBankTransferLanding } from "../mockScreens";
import { extractTacticLabel } from "../tacticFlavor";
import { isDecisionScreenPending, isVerbalTransferPending, VERBAL_TRANSFER_VARIANTS } from "../../scammerHangup/goalAction";
import { requiresServerPromptProvider } from "../../realtime/provider";
import { attachesSmsBackstop } from "../../realtime/index";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACCOUNT_HOLDER_BANKS } from "../../shared/fictionalBank";
import type { DeliveredSmsRecord } from "../../inCallSms/smsGate";

const FAMILY = "family-accident-deepvoice";
const GRANDCHILD = "grandchild-impersonation";
/** 판정표 TS1 ~ TS6 — 변형 · 시나리오 · 문자 · 화면판 송금 라벨. */
const ROUTES: ReadonlyArray<readonly [string, string, string, string]> = [
  ["fv-4dy4", FAMILY, "family-settlement-account", "합의금 송금 요구"],
  ["fv-krq3", FAMILY, "family-settlement-account", "합의금 송금 요구"],
  ["fv-66hh", FAMILY, "family-settlement-account", "합의금 송금 요구"],
  ["fv-h5sz", FAMILY, "family-repair-account", "소액 즉시 송금 요구"],
  ["fv-brcb", GRANDCHILD, "grandchild-money-account", "송금 직접 요구"],
  ["fv-mabg", GRANDCHILD, "grandchild-money-account", "송금 직접 요구"],
];
const variant = (id: string) => findFlowVariant(id) as FlowVariant;

function pending(scenarioId: string, id: string, delivered: DeliveredSmsRecord[]): boolean {
  return isDecisionScreenPending({
    scenarioId,
    flowVariantId: id,
    delivered,
    mockScreens: [],
    declared: variant(id).sms,
    declaredKnown: true,
    verifyEnabled: false,
    followUpUserTurns: undefined,
  });
}

test("[TS1 ~ TS6] 여섯 변형이 이체 화면을 여는 계좌 문자를 선언하고, 송금 수법은 화면판 한 줄뿐", () => {
  for (const [id, scenarioId, smsId, label] of ROUTES) {
    const v = variant(id);
    assert.equal(v.scenarioId, scenarioId, id);
    assert.deepEqual(v.sms.map((s) => [s.purpose, s.smsId, s.required]), [["transfer", smsId, true]], id);
    assert.ok(v.channels.includes("sms"), id);
    const item = findInCallSmsItem(scenarioId, smsId);
    assert.equal(item?.fakeLandingId, "family-send-transfer", id);
    assert.ok(isBankTransferLanding("family-send-transfer"));
    assert.ok(findMockScreenItem(scenarioId, "family-send-transfer"), id);
    // 예금주 은행 고정 · 발신 번호 고정.
    const holder = /예금주: (\S+)/.exec(item!.body ?? "")?.[1];
    assert.ok(holder && ACCOUNT_HOLDER_BANKS[holder], `${id} 예금주 ${holder}`);
    assert.ok(item!.senderLabel.includes(SMS_SENDER_NUMBER[scenarioId]), id);
    // 화면판 수법: 같은 라벨 한 줄 · 문자 속 링크 이체 화면 · 말로만 보냈다 = 미완료.
    const lines = v.tactics.filter((t) => extractTacticLabel(t) === label);
    assert.equal(lines.length, 1, `${id} ${label}`);
    assert.match(lines[0], /문자 속 링크/);
    assert.match(lines[0], /말로만 보냈다고 하면 아직 안 들어왔다/);
    assert.ok(!v.tactics.some((t) => /계좌 불러줄게|계좌 불러드릴게요|예시 계좌만 부른다/.test(t)), `${id} 말로 부르는 계좌 수법 0`);
  }
  // 초급 문자 0~1(AC-096 (b)).
  assert.equal(variant("fv-4dy4").sms.length, 1);
  assert.equal(variant("fv-brcb").sms.length, 1);
});

test("[TS 4-c] 재현 krq3 — 말로만 '보냈어요'(화면 제출 없음)는 끊기 대기 · 화면 제출 뒤에만 해제", () => {
  for (const [id, scenarioId, smsId] of ROUTES) {
    assert.equal(VERBAL_TRANSFER_VARIANTS.includes(id), false, id);
    // 말 보고 경로(VD)는 목록 밖이라 이제 대기를 만들지 않는다 — 4-c(화면)가 맡는다.
    assert.equal(isVerbalTransferPending(id, true), false, id);
    assert.equal(pending(scenarioId, id, []), true, `${id} 문자 전`);
    assert.equal(pending(scenarioId, id, [{ smsId, userTurnsAtArrival: 3 }]), true, `${id} 문자만 · 말로 보냈다`);
    assert.equal(pending(scenarioId, id, [{ smsId, userTurnsAtArrival: 3, landingSubmitted: true, landingAmountComparison: "less" }]), true, `${id} 적게`);
    assert.equal(pending(scenarioId, id, [{ smsId, userTurnsAtArrival: 3, landingSubmitted: true }]), false, `${id} 화면 제출`);
  }
});

test("[TS7] 손주 고급 fv-cx5y(상품권 분기)는 무변경 — 문자 0 · 4-c 대상 아님", () => {
  const v = variant("fv-cx5y");
  assert.deepEqual(v.sms, []);
  assert.equal(pending(GRANDCHILD, "fv-cx5y", []), false);
});

test("[EP1] 서버 프롬프트 경로(gemini · none) — 선언한 계좌 문자에 백스톱 표시가 붙는다", () => {
  assert.equal(attachesSmsBackstop("gemini", true), true);
  assert.equal(attachesSmsBackstop("none", true), true);
  assert.equal(attachesSmsBackstop("gemini", false), false);
});

test("[EP2] ElevenLabs 경로 — 라우팅 무변경 · 문자 백스톱 0 · 끊기 콜러블은 Live 화면만", () => {
  // 사용자 결정: 복제 목소리 판은 말 송금 그대로 — 이체 화면 문자를 선언해도 ElevenLabs를 막지 않는다.
  for (const [id, scenarioId] of ROUTES) assert.equal(requiresServerPromptProvider({ scenarioId, flowVariantId: id }), false, id);
  assert.equal(attachesSmsBackstop("elevenlabs", true), false);
  assert.equal(attachesSmsBackstop("elevenlabs", false), false);
  // 4-c · VD는 끊기 콜러블에서만 판정된다 — ElevenLabs 화면은 그것을 부르지 않는다.
  const root = join(__dirname, "../../../../src/lib/realtime");
  assert.match(readFileSync(join(root, "GeminiVoiceSession.tsx"), "utf8"), /requestScammerHangup/);
  assert.doesNotMatch(readFileSync(join(root, "RealtimeVoiceSession.tsx"), "utf8"), /requestScammerHangup/);
});
