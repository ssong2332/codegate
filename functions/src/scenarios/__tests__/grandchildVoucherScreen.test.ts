// 사용자 결정 (B)(2026-11-24) — 손주 고급 fv-cx5y 말 송금 · 편의점 상품권 사진 → 문자 링크 · 앱 안 상품권 구매 화면(검찰 fv-v2mk 방식).
// 판정표 VC = `docs/research/grandchild-voucher-screen-2026-11-24.md`. ⛔ 라이브 호출 0건.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findFlowVariant, type FlowVariant } from "../flowVariants";
import { findInCallSmsItem, SMS_SENDER_NUMBER } from "../inCallSms";
import { findMockScreenItem, VOUCHER_PURCHASED_INSTRUCTION } from "../mockScreens";
import { extractTacticLabel } from "../tacticFlavor";
import { isDecisionScreenPending, VERBAL_DECISION_VARIANTS, VERBAL_TRANSFER_VARIANTS } from "../../scammerHangup/goalAction";
import { requiresServerPromptProvider } from "../../realtime/provider";
import { attachesSmsBackstop } from "../../realtime/index";

const GRANDCHILD = "grandchild-impersonation";
const SMS_ID = "grandchild-voucher-link";
const v = findFlowVariant("fv-cx5y") as FlowVariant;

test("[VC1 · VC2] fv-cx5y — 상품권 구매 문자 단계 · 말 송금 · 편의점 사진 수법 0 · 상품권 핀 번호 요구 한 줄", () => {
  assert.equal(v.scenarioId, GRANDCHILD);
  assert.equal(v.level, "advanced");
  assert.match(v.stages[v.stages.length - 1]!.summary, /상품권 구매 안내 문자를 보낸 뒤 문자 속 링크의 구매 화면/);
  const labels = v.tactics.map(extractTacticLabel);
  assert.equal(labels.includes("송금 직접 요구"), false);
  assert.equal(labels.includes("상품권 대체 요구"), false);
  assert.equal(labels.filter((l) => l === "상품권 핀 번호 요구").length, 1);
  assert.ok(!v.tactics.some((t) => /계좌 불러|사진 찍어|편의점 가서/.test(t)), "말 계좌 · 편의점 사진 문면 0");
  assert.equal(v.routeKey, "voucher");
});

test("[VC3] 문자 — 필수 transfer 1통 · 손주 번호 · 계좌 줄 0 · 링크 = 상품권 구매 화면 호스트", () => {
  assert.deepEqual(v.sms.map((s) => [s.purpose, s.smsId, s.required]), [["transfer", SMS_ID, true]]);
  assert.ok(v.channels.includes("sms"));
  const item = findInCallSmsItem(GRANDCHILD, SMS_ID)!;
  assert.equal(item.fakeLandingId, "voucher-purchase");
  assert.equal(item.senderLabel, SMS_SENDER_NUMBER[GRANDCHILD]);
  assert.doesNotMatch(item.body, /\d{3}-\d{4}-\d{4}-\d{2}/, "계좌 줄 0");
  const screen = findMockScreenItem(GRANDCHILD, "voucher-purchase")!;
  assert.ok(item.linkAddress!.startsWith(`${screen.mockHost}/`));
});

test("[VC4 · VC5] 화면은 검찰과 같은 객체 · 리포트 문구 · 결제 뒤 지시에 검찰 전용 표현 0", () => {
  const screen = findMockScreenItem(GRANDCHILD, "voucher-purchase");
  assert.ok(screen);
  assert.equal(screen, findMockScreenItem("prosecution-cooperation-call", "voucher-purchase"), "같은 객체");
  assert.doesNotMatch(`${screen!.momentTactic} ${screen!.correctAction}`, /검수|수사나/);
  assert.doesNotMatch(VOUCHER_PURCHASED_INSTRUCTION, /검수/);
});

test("[VC6] 4-c — 결제 기록 전 goal 끊기 대기 · 말로만 샀다 = 대기 · 결제 뒤 해제", () => {
  assert.equal(VERBAL_DECISION_VARIANTS.includes("fv-cx5y"), false);
  assert.equal(VERBAL_TRANSFER_VARIANTS.includes("fv-cx5y"), false);
  const pending = (delivered: Parameters<typeof isDecisionScreenPending>[0]["delivered"]) =>
    isDecisionScreenPending({
      scenarioId: GRANDCHILD,
      flowVariantId: "fv-cx5y",
      delivered,
      mockScreens: [],
      declared: v.sms,
      declaredKnown: true,
      verifyEnabled: false,
      followUpUserTurns: undefined,
    });
  assert.equal(pending([]), true, "문자 전");
  assert.equal(pending([{ smsId: SMS_ID, userTurnsAtArrival: 4 }]), true, "문자만 · 말로 샀다");
  assert.equal(pending([{ smsId: SMS_ID, userTurnsAtArrival: 4, landingSubmitted: true }]), false, "화면 결제");
});

test("[VC7] 경로 — 라우팅 무변경 · EP1 백스톱 · EP2(ElevenLabs) 백스톱 0", () => {
  assert.equal(requiresServerPromptProvider({ scenarioId: GRANDCHILD, flowVariantId: "fv-cx5y" }), false);
  assert.equal(attachesSmsBackstop("gemini", true), true);
  assert.equal(attachesSmsBackstop("elevenlabs", true), false);
});
