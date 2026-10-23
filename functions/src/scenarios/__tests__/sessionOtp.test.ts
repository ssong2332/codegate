// §114(DECISIONS #229) — 세션별 인증번호: 문자 문서 · Live 대조 1줄 · 텍스트 대조 · 리포트 정답이 같은 값인가.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findInCallSmsItem, listOtpItems, buildOtpLiveCompareLine, IN_CALL_SMS } from "../inCallSms";
import { isTrivialOtp, sessionOtpCode, withSessionOtp } from "../sessionOtp";
import { deliverSmsThroughGate, type SmsStore } from "../../inCallSms/smsDelivery";
import { buildInCallSmsResponse } from "../../inCallSms/buildDoc";
import { evaluateOtpCheck } from "../../roleplay/otpCheck";
import type { InCallSmsDoc } from "../../shared/types";

const SCENARIO = "institutional-impersonation";
const OTP = findInCallSmsItem(SCENARIO, "institution-otp")!;
const SESSIONS = Array.from({ length: 200 }, (_, i) => `sess-${i}-${(i * 7919).toString(36)}`);

test("[§114] 세션마다 다른 6자리 · 같은 세션은 같은 번호(고정) · 쉬운 번호 0", () => {
  const codes = SESSIONS.map((s) => sessionOtpCode(s, OTP.smsId, OTP.otpCode!));
  for (const code of codes) {
    assert.match(code, /^\d{6}$/);
    assert.equal(isTrivialOtp(code), false, code);
  }
  assert.ok(new Set(codes).size >= 195, `200세션 중 서로 다른 번호 ${new Set(codes).size}`);
  assert.ok(codes.filter((c) => c === OTP.otpCode).length <= 1, "카탈로그 번호가 그대로 나오는 세션은 사실상 0");
  assert.deepEqual(SESSIONS.map((s) => sessionOtpCode(s, OTP.smsId, OTP.otpCode!)), codes, "다시 계산해도 같다");
});

test("[§114] 재발송 정책 — 같은 세션의 다른 인증번호 문자는 다른 번호 · sessionId 없으면 카탈로그 그대로", () => {
  assert.notEqual(sessionOtpCode("s-1", "institution-otp", "048231"), sessionOtpCode("s-1", "card-otp", "048231"));
  assert.equal(sessionOtpCode(undefined, OTP.smsId, "048231"), "048231");
  assert.equal(sessionOtpCode("", OTP.smsId, "048231"), "048231");
  assert.equal(withSessionOtp(OTP, undefined), OTP);
  const account = findInCallSmsItem(SCENARIO, "institution-safe-account")!;
  assert.equal(withSessionOtp(account, "s-1"), account, "인증번호 문자가 아니면 원본 그대로");
});

test("[§114] isTrivialOtp — 반복 · 연속만 걸러낸다", () => {
  for (const c of ["000000", "111111", "123456", "654321", "345678"]) assert.equal(isTrivialOtp(c), true, c);
  for (const c of ["048231", "739104", "112233", "135790"]) assert.equal(isTrivialOtp(c), false, c);
});

test("[§114] 모든 인증번호 문자 — 본문에 세션 번호가 보이고 카탈로그 번호는 사라진다", () => {
  for (const scenarioId of Object.keys(IN_CALL_SMS)) {
    for (const item of listOtpItems(scenarioId)) {
      const got = withSessionOtp(item, "session-abc");
      assert.notEqual(got.otpCode, item.otpCode, scenarioId);
      assert.ok(got.body.includes(`[${got.otpCode}]`), `${scenarioId} 본문에 세션 번호`);
      assert.ok(!got.body.includes(item.otpCode!), `${scenarioId} 본문에 카탈로그 번호 0`);
    }
  }
});

const FAKE_TS = { seconds: 0, nanoseconds: 0 } as unknown as FirebaseFirestore.Timestamp;
function memoryStore(): SmsStore & { docs: Map<string, InCallSmsDoc> } {
  const docs = new Map<string, InCallSmsDoc>();
  return {
    docs,
    transact: async (fn) =>
      fn({
        listDelivered: async () => [...docs.values()].map((d) => ({ smsId: d.smsId, userTurnsAtArrival: d.userTurnsAtArrival })),
        create: (smsId, doc) => void docs.set(smsId, doc),
      }),
  };
}

test("[§114] 네 곳 일치 — 문자 문서 본문 · otpCode 필드 · Live 대조 1줄 · 텍스트 서버 대조가 같은 세션 번호", async () => {
  const sessionId = "live-session-7f3a";
  const expected = sessionOtpCode(sessionId, OTP.smsId, OTP.otpCode!);
  const store = memoryStore();
  const result = await deliverSmsThroughGate(store, {
    scenarioId: SCENARIO,
    declared: [{ purpose: "identity", smsId: OTP.smsId, required: true, notBeforeUserTurns: 2 }],
    purpose: "identity",
    userTurns: 2,
    anchorScammerTurn: 3,
    trigger: "model_tool",
    sessionId,
    now: () => FAKE_TS,
  });
  assert.equal(result.status, "delivered");
  const doc = store.docs.get(OTP.smsId)!;
  assert.equal(doc.otpCode, expected, "문서 otpCode 필드");
  assert.ok(doc.body.includes(`[${expected}]`), "문자함 본문");
  // Live — 사기범 모델이 아는 번호(도착 응답의 대조 1줄)
  if (result.status !== "delivered") throw new Error("unreachable");
  const response = buildInCallSmsResponse(result.item, { placed: false });
  assert.ok(response.announceInstruction?.endsWith(buildOtpLiveCompareLine(expected)), "Live 대조 1줄");
  assert.ok(!response.announceInstruction?.includes(OTP.otpCode!.split("").join(" ")), "카탈로그 번호 0");
  // 텍스트 폴백 서버 대조
  const base = {
    scenarioId: SCENARIO,
    sessionId,
    lastScammerText: "방금 문자로 간 인증번호 여섯 자리 불러 주십시오.",
    scammerTurnNumber: 6,
    isDelivered: async () => true,
    deliveredRecords: [{ smsId: OTP.smsId, userTurnsAtArrival: 2 }],
  };
  assert.equal((await evaluateOtpCheck({ ...base, userText: `${expected}이요` })).outcome, "match");
  assert.equal((await evaluateOtpCheck({ ...base, userText: `${OTP.otpCode}이요` })).outcome, "mismatch", "옛 고정 번호는 이제 오답");
});

test("[§114] 리포트 정답 배선 — generateReportCore가 세션 번호로 오답을 판정한다(소스 고정)", () => {
  const src = readFileSync(path.join(__dirname, "../../../src/report/generateReportCore.ts"), "utf8");
  assert.match(src, /listOtpItems\(session\.scenarioId\)\.map\(\(item\) => withSessionOtp\(item, sessionId\)\.otpCode!\)/);
});
