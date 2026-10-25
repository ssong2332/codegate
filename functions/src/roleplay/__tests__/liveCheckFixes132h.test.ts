// §132.17(메인 라이브 2026-10-25 main `faa38dc` · 기관 사칭 고급 금 구매형 fv-g2ld · 텍스트 대체 · 세션 2ea4c42f) — 인증번호 문자 전 번호 요구.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  SMS_OTP_DEMAND,
  claimMatchesPurpose,
  combineReplyGuards,
  otpDemandGuardFor,
  replyClaimsSmsSent,
} from "../smsClaim";
import { planSmsBackstop, resolveDeclaredSms } from "../../inCallSms/smsGate";
import { INSTITUTION_PERSONA } from "../personaGuard";

const LIVE = "네, 확인됐습니다. 문자에 적힌 인증번호 여섯 자리를 지금 불러 주시겠습니까?";

test("[§132.17] O1 — 라이브 대사는 인증번호 문자 주장 · 발화 5(하한)에 주장 백스톱이 그 응답에 보낸다", () => {
  assert.ok(replyClaimsSmsSent(LIVE));
  assert.ok(claimMatchesPurpose(LIVE, "identity"));
  const { declared } = resolveDeclaredSms("institutional-impersonation", "fv-g2ld");
  const plan = planSmsBackstop({ declared, delivered: [], userTurns: 5, claimed: true });
  assert.equal(plan.action, "deliver");
  assert.equal(plan.action === "deliver" && plan.item.purpose, "identity");
  for (const t of ["인증번호 불러 주세요.", "인증 코드 알려 주십시오.", "방금 받으신 인증번호 여섯 자리 말씀해 주세요."]) {
    assert.ok(replyClaimsSmsSent(t), t);
  }
  // 앞으로 보내겠다 · 언급만 = 주장 아님.
  for (const t of ["인증번호 문자 보내 드릴게요.", "곧 인증 절차를 안내하겠습니다.", "인증번호는 더 이상 필요 없습니다."]) {
    assert.ok(!replyClaimsSmsSent(t), t);
  }
  // 인증번호 요구만으로는 계좌 · 링크 문자를 보내지 않는다.
  assert.ok(!claimMatchesPurpose("인증번호 불러 주시면 계좌 확인해 드리겠습니다.", "transfer"));
  assert.ok(claimMatchesPurpose("문자 속 링크를 눌러 계좌 화면을 여세요.", "transfer"));
});

test("[§132.17] O2 · O3 — 기관 사칭 고급 3루트: 하한 전에는 인증번호 요구 가드 · 하한부터 · 도착 뒤 · 인증번호 문자 없는 루트는 가드 0", () => {
  for (const variant of ["fv-c5fj", "fv-q7cn", "fv-g2ld"]) {
    const { declared } = resolveDeclaredSms("institutional-impersonation", variant);
    for (let userTurns = 1; userTurns <= 4; userTurns += 1) {
      assert.equal(otpDemandGuardFor({ declared, delivered: [], userTurns }), SMS_OTP_DEMAND, `${variant} 발화 ${userTurns}`);
    }
    assert.equal(otpDemandGuardFor({ declared, delivered: [], userTurns: 5 }), undefined, `${variant} 하한`);
    assert.equal(
      otpDemandGuardFor({ declared, delivered: [{ smsId: "institution-otp", userTurnsAtArrival: 5 }], userTurns: 6 }),
      undefined,
      `${variant} 도착 뒤`,
    );
    assert.ok(SMS_OTP_DEMAND.test(LIVE));
  }
  for (const variant of ["fv-k9ra", "fv-p3jx", "fv-t8ga"]) {
    const { declared } = resolveDeclaredSms("asset-protection-notice-call", variant);
    assert.equal(otpDemandGuardFor({ declared, delivered: [], userTurns: 1 }), undefined, variant);
  }
});

test("[§132.17] 가드 합치기 — 하나면 그대로 · 둘이면 어느 쪽이든 걸린다 · 없으면 부재", () => {
  assert.equal(combineReplyGuards(undefined, undefined), undefined);
  assert.equal(combineReplyGuards(undefined, SMS_OTP_DEMAND), SMS_OTP_DEMAND);
  const both = combineReplyGuards(INSTITUTION_PERSONA, SMS_OTP_DEMAND)!;
  assert.ok(both.test(LIVE));
  assert.ok(both.test("고객님, 확인해 볼게요."));
  assert.ok(!both.test("엄마 나 폰 고장 나서 그래."));
});

test("[§132.17] 배선 — sendMessage 생성 요청의 가드 = 역할 가드 + 인증번호 요구 가드(도착 기록을 읽은 턴만)", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/roleplay/index.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.ok(
    // §132.19 — 가드 값을 턴 지시(판정표 B)와 함께 쓰려고 변수로 뺐다(liveCheckFixes132i).
    src.includes(
      "const otpDemandGuard = smsDeliveredLoaded\n      ? otpDemandGuardFor({ declared: smsDeclared, delivered: smsDelivered, userTurns: userTurnsNow })\n      : undefined;\n    const replyGuard = combineReplyGuards(personaGuardFor(session.scenarioId), otpDemandGuard);",
    ),
  );
  assert.ok(src.includes("...(replyGuard ? { personaGuard: replyGuard } : {}),"));
});
