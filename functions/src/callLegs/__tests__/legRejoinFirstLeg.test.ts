import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findFlowVariant, type FlowVariant } from "../../scenarios/flowVariants";
import { IN_CALL_SMS } from "../../scenarios/inCallSms";
import { buildLegRejoinContext, legSentSmsDescriptions, messageLegIndex, planLegHangup, planLegStart, type RelayState } from "../legPlan";
import { LANDING_SUBMITTED_SHORT_INSTRUCTION, landingSubmittedInstructionFor } from "../../inCallSms/confirmResult";
import { buildLiveScreenStatusInstruction, SCREEN_PRESSURE_SENTENCES, type ScreenFact } from "../../roleplay/screenAction";

// 2026-11-07 Edge 시험 판 26(카드사 고급 R1 · fv-k3dn) — 참가자가 끊은 배송원 통화(첫 레그)에 배송원이 다시 걸어 왔는데 처음부터 시작했고,
// 이미 보낸 반송 문자를 "보내 드릴 테니"라고 다시 말했다 · 980만 원 요구에 300만 원을 보냈는데 "아직 입금 확인이 되지 않았습니다".

const SCENARIO = "card-company-impersonation";
const R1 = () => findFlowVariant("fv-k3dn") as FlowVariant;
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
const catalogFirstLine = (smsId: string) => (IN_CALL_SMS[SCENARIO] ?? []).find((s) => s.smsId === smsId)!.body.split("\n")[0]!;

test("[판 26 · 첫 레그] 세션 시작 통화(relay 부재)도 끊기 → callback = 같은 레그 재연결 · 그 통화 전사는 레그 0으로 저장된다(추정 '첫 레그는 기록이 없다' 반증)", () => {
  // 세션 시작 = 배송원 수신 통화 · relay 문서 없음. 전사 제출(끊기 전)의 레그 번호 = 0.
  assert.equal(messageLegIndex(R1(), { scenarioId: SCENARIO, relay: undefined }), 0);
  const hung = planLegHangup(R1(), undefined);
  assert.equal(hung.status, "ended");
  const relay = (hung as { relay: RelayState }).relay;
  assert.deepEqual(relay, { legIndex: 0, legStartUserTurns: [0], connected: false, legEnded: 0, hungUpBy: "participant" });
  const plan = planLegStart({ variant: R1(), relay, action: "callback", installConsented: false, userTurns: 3 });
  assert.equal(plan.status, "connected");
  if (plan.status !== "connected") return;
  assert.equal(plan.legIndex, 0);
  assert.equal(plan.rejoin, "callback");
  assert.deepEqual(plan.relay.rejoin, { kind: "callback", atUserTurns: 3 });
  // 재연결 맥락은 레그 0 대화(오프닝 = legIndex 부재 포함)를 싣는다.
  const block = buildLegRejoinContext("callback", 0, [
    { role: "scammer", text: "카드 배송 안내 드리려고 연락드렸습니다" },
    { role: "user", text: "신청한 적 없는데요", legIndex: 0 },
    { role: "scammer", text: "반송 접수 안내 문자 보내 드릴 테니", legIndex: 0 },
  ]);
  assert.ok(block.includes("상대: 신청한 적 없는데요") && block.includes("너: 반송 접수 안내 문자 보내 드릴 테니"));
});

test("[판 26] 이 통화에서 이미 도착한 문자 — 레그 선언 · 도착한 것만 · 본문 첫 줄 + 발신 번호", () => {
  assert.deepEqual(legSentSmsDescriptions(R1(), 0, []), [], "도착 0 = 줄 0");
  const leg0 = legSentSmsDescriptions(R1(), 0, ["card-callback-number", "card-remote-support-link"]);
  assert.deepEqual(leg0, [`'${catalogFirstLine("card-callback-number")}'(02-0767-3051에서 보냄)`], "다른 레그 문자 제외");
  assert.equal(legSentSmsDescriptions(R1(), 1, ["card-callback-number", "card-remote-support-link"]).length, 1);
  assert.deepEqual(legSentSmsDescriptions(R1(), 3, ["card-callback-number"]), []);
});

test("[판 26] 재연결 맥락에 이미 보낸 문자 줄 — 다시 보낸다고 하지 않는다 · 문자 부재면 종전 바이트", () => {
  const messages = [{ role: "user", text: "신청한 적 없어요", legIndex: 0 }];
  const sent = legSentSmsDescriptions(R1(), 0, ["card-callback-number"]);
  const block = buildLegRejoinContext("callback", 0, messages, sent);
  assert.ok(block.includes("끊기기 전 이 통화에서 네가 이미 보낸 문자(상대 휴대전화에 이미 도착해 있다)"));
  assert.ok(block.includes("02-0767-3051") && block.includes("다시 보내 주겠다거나 곧 보내겠다고 하지 말고"));
  assert.ok(block.indexOf("이미 보낸 문자") < block.indexOf("오간 말"), "상황 문장 다음 · 대화 줄 앞");
  assert.equal(buildLegRejoinContext("callback", 0, messages, []), buildLegRejoinContext("callback", 0, messages));
  assert.equal(buildLegRejoinContext("redial", 1, undefined, undefined), buildLegRejoinContext("redial", 1));
});

test("[판 26 배선] Live 재연결 = 메시지 + 도착 문자 id를 함께 읽어 맥락에 싣는다", () => {
  const realtime = read("realtime/index.ts");
  const branch = realtime.slice(realtime.indexOf("if (callLeg && rejoin) {"), realtime.indexOf("} else if (callLeg && callLeg.legIndex > 0) {"));
  assert.ok(branch.includes('rejoinRef.collection("inCallSms").get()'));
  assert.ok(branch.includes("legSentSmsDescriptions(rejoinVariant, callLeg.legIndex, smsSnap.docs.map((d) => d.id))"));
  // 읽기 실패 = 상황 문장만(종전).
  assert.ok(branch.includes("priorChatContext = buildLegRejoinContext(rejoin.kind, callLeg.legIndex);"));
});

test("[판 26] 모자란 이체 — '확인 안 됨'류 말 금지 · 돈은 들어왔다 · 화면 규칙이 이 이체엔 해당 안 됨(Live 제출 맥락 · 매 발화 상태 줄)", () => {
  assert.equal(landingSubmittedInstructionFor("less", false), LANDING_SUBMITTED_SHORT_INSTRUCTION);
  const short = LANDING_SUBMITTED_SHORT_INSTRUCTION;
  assert.ok(short.includes("돈은 실제로 들어왔지만"));
  assert.ok(short.includes("입금이 확인되지 않았다거나 아직 확인 중이라고 말하지 마라"));
  assert.ok(short.includes("규칙은 이 이체에 더는 해당하지 않는다"));
  assert.ok(short.includes("모자란 금액을 같은 화면에서 마저 보내라고 하라") && short.includes("이번 대답에서 통화를 끝내지 마라"));
  assert.ok(!/\d/.test(short) && !/["“”]/.test(short), "금액 값 · 큰따옴표 0");
  const facts: ScreenFact[] = [
    { landingId: "card-remote-support-install", kind: "install", done: true, offeredAtUserTurns: 4 },
    { landingId: "card-safe-transfer", kind: "transfer", done: true, offeredAtUserTurns: 14, amount: "less" },
  ];
  const line = buildLiveScreenStatusInstruction(true, facts, 16, []);
  assert.ok(line && line.includes("요구한 금액보다 적게 보냄") && line.includes(SCREEN_PRESSURE_SENTENCES.transferLess), line);
  assert.ok(SCREEN_PRESSURE_SENTENCES.transferLess.includes("입금이 확인되지 않았다거나 아직 확인 중이라고 말하지 말고"));
});
