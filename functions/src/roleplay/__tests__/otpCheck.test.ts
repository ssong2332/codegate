// 인증번호 대조(2026-10-18 사용자 신고 — 문자로 보낸 번호와 다른 번호를 불러도 사기범이 그냥 진행) 회귀 테스트.
// Architecture §77. 원인: 모델이 받는 지시·프롬프트 어디에도 실제 번호가 없었다 ⇒ 대조 불가.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { buildOtpCheckInstruction, findInCallSmsItem, listOtpItems } from "../../scenarios/inCallSms";
import { buildInCallSmsResponse } from "../../inCallSms/buildDoc";
import { resolveOtpCheckInstruction } from "../otpCheck";

const OTP_SCENARIOS = [
  ["institutional-impersonation", "institution-otp", "048231"],
  ["card-company-impersonation", "card-otp", "739104"],
] as const;

test("[OTP] 대조 지시 문면: 실제 번호 · 먼저 말하지 말 것 · 다르면 다시 불러 달라 · 같으면 진행", () => {
  const text = buildOtpCheckInstruction("048231");
  assert.ok(text.includes("048231"));
  assert.match(text, /먼저 말하거나 일부라도 알려 주지 마라/);
  assert.match(text, /한 자리씩 대조/);
  assert.match(text, /번호가 안 맞는데요, 문자 다시 확인해서 불러 주세요/);
  assert.match(text, /다음 단계로 넘어가지 말고/);
  assert.match(text, /같으면 확인됐다고 하고 다음 단계로 진행/);
});

test("[OTP] 카탈로그: 인증번호 문자 2종이 listOtpItems로 잡힌다(거짓 초록 방지)", () => {
  for (const [scenarioId, smsId, code] of OTP_SCENARIOS) {
    const items = listOtpItems(scenarioId);
    assert.deepEqual(items.map((i) => i.smsId), [smsId]);
    assert.equal(items[0]!.otpCode, code);
  }
  assert.deepEqual(listOtpItems("no-such-scenario"), []);
});

test("[OTP] 실시간 경로 — 도착 응답의 지시에 실제 번호와 대조 지시가 붙는다(Live 문맥에 남는다)", () => {
  for (const [scenarioId, smsId, code] of OTP_SCENARIOS) {
    const item = findInCallSmsItem(scenarioId, smsId)!;
    const res = buildInCallSmsResponse(item, { placed: false });
    assert.equal(res.announceInstruction, `${item.announceInstruction}\n${buildOtpCheckInstruction(code)}`);
    assert.ok(res.announceInstruction!.startsWith(item.announceInstruction), "기존 도착 지시는 그대로 앞에 둔다");
  }
});

test("[OTP] 실시간 경로 — 인증번호가 아닌 문자는 지시가 한 글자도 바뀌지 않는다 · 호 전환 뒤에는 지시 자체가 없다", () => {
  const account = findInCallSmsItem("institutional-impersonation", "institution-safe-account")!;
  assert.deepEqual(buildInCallSmsResponse(account, { placed: false }), {
    smsId: account.smsId,
    announceInstruction: account.announceInstruction,
  });
  const otp = findInCallSmsItem("institutional-impersonation", "institution-otp")!;
  assert.deepEqual(buildInCallSmsResponse(otp, { placed: true }), { smsId: otp.smsId });
});

test("[OTP] 텍스트 경로 판정표 — 도착 전 없음(읽기 0) · 도착 턴 즉시 · 도착 후 매 턴 · 미도착·조회 실패면 없음", async () => {
  const item = findInCallSmsItem("institutional-impersonation", "institution-otp")!;
  const expected = buildOtpCheckInstruction(item.otpCode!);
  let reads = 0;
  const delivered = async () => {
    reads += 1;
    return true;
  };

  // 도착 전: 지시 없음 · Firestore 읽기 0회
  assert.equal(
    await resolveOtpCheckInstruction({ scenarioId: "institutional-impersonation", scammerTurnNumber: item.afterScammerTurns - 1, isDelivered: delivered }),
    undefined,
  );
  assert.equal(reads, 0);

  // 이번 턴에 방금 도착: 읽기 없이 지시
  assert.equal(
    await resolveOtpCheckInstruction({
      scenarioId: "institutional-impersonation",
      scammerTurnNumber: item.afterScammerTurns,
      deliveredThisTurn: item.smsId,
      isDelivered: delivered,
    }),
    expected,
  );
  assert.equal(reads, 0);

  // 도착 이후 턴: 존재 확인 후 지시
  assert.equal(
    await resolveOtpCheckInstruction({ scenarioId: "institutional-impersonation", scammerTurnNumber: item.afterScammerTurns + 2, isDelivered: delivered }),
    expected,
  );
  assert.equal(reads, 1);

  // 도착 턴은 지났지만 문서가 없다(문자 실패) → 없음
  assert.equal(
    await resolveOtpCheckInstruction({ scenarioId: "institutional-impersonation", scammerTurnNumber: 9, isDelivered: async () => false }),
    undefined,
  );
  // 조회 실패 → 없음(대화를 막지 않는다)
  assert.equal(
    await resolveOtpCheckInstruction({
      scenarioId: "institutional-impersonation",
      scammerTurnNumber: 9,
      isDelivered: async () => {
        throw new Error("firestore down");
      },
    }),
    undefined,
  );
  // 인증번호 문자가 없는 시나리오 → 없음 · 읽기 0
  let otherReads = 0;
  assert.equal(
    await resolveOtpCheckInstruction({
      scenarioId: "family-accident-deepvoice",
      scammerTurnNumber: 9,
      isDelivered: async () => {
        otherReads += 1;
        return true;
      },
    }),
    undefined,
  );
  assert.equal(otherReads, 0);
});

test("[OTP] 텍스트 경로 배선 — sendMessage가 대조 지시를 턴 지시와 합쳐 시스템 프롬프트에 넣는다(소스 스캔)", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /const otpCheckInstruction = await resolveOtpCheckInstruction\(\{/);
  assert.match(src, /\[turnInstruction, otpCheckInstruction\]\.filter\(Boolean\)\.join\("\\n"\)/);
  assert.match(src, /\.\.\.\(promptTurnInstruction \? \{ turnInstruction: promptTurnInstruction \} : \{\}\)/);
  assert.doesNotMatch(src, /\.\.\.\(turnInstruction \? \{ turnInstruction \} : \{\}\)/, "옛 배선이 남아 있으면 대조 지시가 빠진다");
});

test("[OTP] 세션 시작 시스템 프롬프트(Live 토큰)에는 번호를 넣지 않는다 — 도착 전 유출 방지", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/realtime/geminiProvider.ts"), "utf8");
  assert.doesNotMatch(src, /buildOtpCheckInstruction|otpCode/);
});
