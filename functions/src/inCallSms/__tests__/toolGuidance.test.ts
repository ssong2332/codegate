// §117(DECISIONS #232 · 사용자 실기 신고 *"ai 음성이 유사한 내용을 2번씩 말한다"*) — 모델 도구 응답 문면의 되풀이 금지 꼬리 · 도구 설명 1문장.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { MODEL_TOOL_NO_REPEAT_LEAD, withModelToolNoRepeat } from "../toolGuidance";
import { SMS_DECLINE_NOT_ALLOWED } from "../smsGate";
import { SMS_DECLINE_ALREADY, SMS_DECLINE_TOO_EARLY, findInCallSmsItem } from "../../scenarios/inCallSms";
import { buildLiveToolDeclarations, LIVE_TOOL_SEND_PREPARED_SMS, SEND_PREPARED_SMS_CALL_FIRST_SENTENCE } from "../../realtime/liveTools";

const SRC = path.resolve(__dirname, "../../../src");

test("[§117 판정표] 모델 도구 경로만 꼬리를 앞에 붙인다 · 백스톱 · 옛 클라 · announce 없음은 그대로", () => {
  const otp = findInCallSmsItem("institutional-impersonation", "institution-otp");
  assert.ok(otp);
  const announce = otp.announceInstruction;
  assert.equal(withModelToolNoRepeat(announce, "model_tool"), `${MODEL_TOOL_NO_REPEAT_LEAD} ${announce}`, "1행 도착");
  for (const decline of [SMS_DECLINE_TOO_EARLY, SMS_DECLINE_ALREADY, SMS_DECLINE_NOT_ALLOWED]) {
    assert.equal(withModelToolNoRepeat(decline, "model_tool"), `${MODEL_TOOL_NO_REPEAT_LEAD} ${decline}`, "2행 거부");
  }
  assert.equal(withModelToolNoRepeat(announce, "backstop"), announce, "3행 백스톱 — 다음 응답에 실리는 맥락 주입");
  assert.equal(withModelToolNoRepeat(announce, undefined), announce, "3행 옛 클라(trigger 부재)");
  assert.equal(withModelToolNoRepeat(undefined, "model_tool"), undefined, "3행 호 전환 뒤 announce 생략");
});

test("[§117 문면] 이미 한 말 되풀이 금지 · 이미 문자 이야기를 했으면 멈추고 대기 · 아직이면 안내대로 짧게 · 숫자 0(G130)", () => {
  assert.match(MODEL_TOOL_NO_REPEAT_LEAD, /이미 한 말 · 요구는 말만 바꿔 다시 하지 마라/);
  assert.match(MODEL_TOOL_NO_REPEAT_LEAD, /이미 문자 이야기를 했다면 더 말하지 말고 곧바로 멈춰 상대의 대답을 기다려라/);
  assert.match(MODEL_TOOL_NO_REPEAT_LEAD, /아직 하지 않았다면 아래 안내대로만 짧게 말하라/);
  assert.ok(MODEL_TOOL_NO_REPEAT_LEAD.startsWith("(") && MODEL_TOOL_NO_REPEAT_LEAD.endsWith(")"), "괄호 지문 형식(다른 안내와 같다)");
  assert.ok(!/\d/.test(MODEL_TOOL_NO_REPEAT_LEAD));
});

test("[§117 도구 설명] send_prepared_sms 설명에 '먼저 부르고 · 결과 전에는 말하지 않는다' 1문장이 실린다", () => {
  const decl = buildLiveToolDeclarations("institutional-impersonation", "advanced", "fv-c5fj", {
    channel: undefined,
    relay: undefined,
    liveAvailable: false,
  })
    .flatMap((t) => t.functionDeclarations ?? [])
    .find((d) => d.name === LIVE_TOOL_SEND_PREPARED_SMS);
  assert.ok(decl?.description?.includes(SEND_PREPARED_SMS_CALL_FIRST_SENTENCE));
  assert.match(SEND_PREPARED_SMS_CALL_FIRST_SENTENCE, /어떤 말보다도 먼저 부르고/);
  assert.ok(!/\d/.test(SEND_PREPARED_SMS_CALL_FIRST_SENTENCE));
});

test("[§117 배선] deliverInCallSms — 거부 · 도착 두 응답 모두 trigger로 꼬리를 고른다(백스톱 응답은 종전 그대로)", () => {
  const src = readFileSync(path.join(SRC, "inCallSms/index.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.ok(src.includes("declineInstruction: withModelToolNoRepeat(declineInstructionFor(result.status), trigger)"), "거부");
  assert.ok(src.includes("const announceInstruction = withModelToolNoRepeat(built.announceInstruction, trigger);"), "도착");
  // 백스톱 넛지 · 마무리 지시 응답은 꼬리 함수를 거치지 않는다(다음 응답에 실리는 맥락 주입).
  assert.ok(src.includes('return { status: "nudge", nudgeInstruction: buildSmsNudgeInstruction(plan.item.purpose) };'));
  assert.ok(src.includes('return { status: "none_pending", wrapUpInstruction: GOAL_WRAP_UP_INSTRUCTION };'));
});
