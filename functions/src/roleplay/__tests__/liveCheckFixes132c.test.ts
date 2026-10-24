// §132.7 · §132.9 · §132.10(DECISIONS #248 · 실 키 회귀 프로브 2026-10-24b N4 · D12 + 메인 라이브 관찰) — 서버 쪽.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { LANDING_SUBMITTED_INSTRUCTION } from "../../inCallSms/confirmResult";
import { SMS_CLAIM_NOT_YET } from "../../scenarios/inCallSms";
import { neutralizeUserMentionedFinancialNames } from "../../guardrails/realFinancialNames";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

test("[§132.7 N4] 이체 화면 제출을 처음 기록하면 실시간 맥락 1줄을 돌려준다 — 아직 안 됐다고 말하지 말 것 · 마무리는 끊기 항목대로 · 숫자 0", () => {
  assert.match(LANDING_SUBMITTED_INSTRUCTION, /아직 완료되지 않았다거나 다시 이체하라는 말은 하지 마라/);
  assert.match(LANDING_SUBMITTED_INSTRUCTION, /\[진행 강제\]의 통화 끝내기 항목이 정한 대로 하라/);
  assert.ok(!/\d/.test(LANDING_SUBMITTED_INSTRUCTION));
  const src = read("inCallSms/index.ts");
  // 최초 기록 분기 안에서만(이미 기록됨 = 없음 · 중복 주입 0).
  assert.match(
    src,
    /if \(!snap\.get\(field\)\) \{\n\s*await smsRef\.update\(\{ \[field\]: Timestamp\.now\(\) \}\);\n(?:\s*\/\/[^\n]*\n)?\s*if \(event === "landing_submitted"\) return \{ recorded: true, contextInstruction: LANDING_SUBMITTED_INSTRUCTION \};\n\s*\}\n\s*return \{ recorded: true \};/,
  );
});

test("[§132.9 D12] 하한 전 '보냈다' 주장 — waiting 응답에 정정 1줄(주장일 때만) · 하한은 그대로", () => {
  assert.match(SMS_CLAIM_NOT_YET, /문자는 아직 가지 않았다/);
  assert.match(SMS_CLAIM_NOT_YET, /되풀이하지 말고/);
  assert.ok(!/\d/.test(SMS_CLAIM_NOT_YET));
  const src = read("inCallSms/index.ts");
  assert.ok(
    src.includes(
      'if (plan.action === "wait") return smsClaimed ? { status: "waiting", claimNotYetInstruction: SMS_CLAIM_NOT_YET } : { status: "waiting" };',
    ),
  );
});

test("[§132.10] 이름 뒤에 이미 참가자 발언을 가리키면 '말씀하신' 대신 '그'로 받는다", () => {
  const users = ["저는 국민은행만 써요"];
  for (const [reply, expected] of [
    ["국민은행 계좌라고 말씀하셨는데, 그 계좌가 문제입니다.", "그 은행 계좌라고 말씀하셨는데, 그 계좌가 문제입니다."],
    ["국민은행이라고 하셨죠?", "그 은행이라고 하셨죠?"],
    ["국민은행 말씀하신 대로 확인해 보겠습니다.", "그 은행 말씀하신 대로 확인해 보겠습니다."],
  ] as const) {
    const out = neutralizeUserMentionedFinancialNames(reply, users).text;
    assert.equal(out, expected, reply);
    assert.ok(!/말씀하신\s*\S*\s*[^.?!]{0,16}말씀하/.test(out), `${reply}: '말씀' 겹침 0`);
  }
  // 뒤에 발언 표지가 없으면 종전(§127).
  assert.equal(neutralizeUserMentionedFinancialNames("국민은행 잔액이 얼마인가요?", users).text, "말씀하신 은행 잔액이 얼마인가요?");
  // 다른 문장의 표지는 보지 않는다.
  assert.equal(
    neutralizeUserMentionedFinancialNames("국민은행 계좌 맞으시죠. 아까 그렇게 말씀하셨어요.", users).text,
    "말씀하신 은행 계좌 맞으시죠. 아까 그렇게 말씀하셨어요.",
  );
});
