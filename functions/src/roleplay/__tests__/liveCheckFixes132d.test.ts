// §132.11 · §132.12(DECISIONS #248 · 메인 라이브 2026-10-24 · 자녀 납치 협박 초급 · 텍스트 폴백) — "보냈어요" 뒤 끊지 않음 · 첫마디 동그라미 자리표시.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { tidyScammerReplyMarkup } from "../replyMarkup";
import { stripLeakedThought } from "../../realtime/thoughtLeak";
import { buildConfirmResultInstruction, isCompletionClaim } from "../../inCallSms/confirmResult";
import { KIDNAPPING_THREAT_SCENARIO_ID } from "../../scenarios/kidnappingThreat.prompt";
import { resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

test("[§132.12] 동그라미 자리표시 — 라이브 오프닝 재현 · '씨' · 기관 · 직함 앞만 지운다 · 가린 학원 표기 · OO은행은 그대로", () => {
  const live = "여보세요, 거기 혹시 ○○ 씨 본인 맞으세요? 저는 시내 ○○경찰서 수사과 소속입니다.";
  const expected = "여보세요, 거기 혹시 본인 맞으세요? 저는 시내 경찰서 수사과 소속입니다.";
  assert.equal(tidyScammerReplyMarkup(live).text, expected, "폴백 · 오프닝");
  assert.equal(stripLeakedThought(live), expected, "Live 전사 · 자막");
  for (const [input, out] of [
    ["저는 ○○○ 수사관입니다.", "저는 수사관입니다."],
    ["○○지방검찰청에서 연락드렸습니다.", "지방검찰청에서 연락드렸습니다."],
  ] as const) {
    assert.equal(tidyScammerReplyMarkup(input).text, out, input);
    assert.equal(stripLeakedThought(input), out, `Live: ${input}`);
  }
  for (const keep of ["○○학원 앞이에요.", "OO은행 210-3391-5540-08입니다.", "○○이 지금 여기 있습니다."]) {
    assert.equal(tidyScammerReplyMarkup(keep).text, keep, keep);
    assert.equal(stripLeakedThought(keep), keep, `Live: ${keep}`);
  }
});

test("[§132.11] 납치 협박 — 돈을 받은 뒤 '기다려라'로 붙잡지 않고 끝내기 항목대로 · 폴백은 송금 완료 주장 턴에 확인 결과 지시(문자 선언 없는 변형만)", () => {
  const prompt = resolveSessionScenarioPrompt(KIDNAPPING_THREAT_SCENARIO_ID, "fv-c5ih")!;
  assert.ok(!prompt.personaPrompt.includes("이 통화를 끊지 말고 시키는 대로 기다리라는 지시로 넘어간다"), "종전 문장 0");
  // §132.13 — 같은 문장을 "확인하는 그 대답 안에서 … 같은 대답에서 끝낸다"로 다시 고쳤다(liveCheckFixes132f).
  assert.ok(prompt.personaPrompt.includes("같은 대답에서 [진행 강제]의 통화 끝내기 항목이 정한 대로 통화를 끝낸다."));
  assert.ok(isCompletionClaim("네, 보냈어요.", "transfer"), "라이브 발화");
  assert.ok(!isCompletionClaim("보내야 하나요?", "transfer"));
  const src = read("roleplay/index.ts");
  assert.ok(
    src.includes(
      'hangupMode === "signal" &&\n      smsDeclared.length === 0 &&\n      turnChoice === "none" &&\n      !otpCheckInstruction &&\n      !confirmPlan?.instruction &&\n      isCompletionClaim(maskedUserText, "transfer")\n        ? buildNoSmsTransferClaimInstruction(',
    ),
  );
  // 후속 단계 마무리 지시가 우선 · 없으면 이 지시(같은 자리 1개).
  assert.ok(src.includes("? FALLBACK_GOAL_WRAP_UP_INSTRUCTION\n        : claimWrapUp;"));
  assert.match(buildConfirmResultInstruction("transfer"), /더 요구할 것이 남지 않았으면 \[진행 강제\]의 통화 끝내기 항목이 정한 대로 하라/);
});

test("[§132.13] 폴백 — 마커 없이 '문자 속 링크'라고 하면 게이트가 열린 필수 문자를 그 응답에 보낸다(하한 그대로) · 목적이 맞을 때만 · 화면 정규식과 같은 글자", async () => {
  const { SMS_SENT_CLAIM, claimMatchesPurpose, replyClaimsSmsSent } = await import("../smsClaim");
  const { planSmsBackstop, resolveDeclaredSms } = await import("../../inCallSms/smsGate");
  // 라이브 재현 대사.
  const live = "확인됐습니다, 홍길동 고객님. 문자 속 링크를 눌러 이체 화면을 열고, 3천만 원 전액을 그 화면에서 이체해 주십시오.";
  assert.ok(replyClaimsSmsSent(live));
  assert.ok(claimMatchesPurpose(live, "transfer"));
  for (const t of ["문자로 보내 드렸습니다.", "보내 드린 링크 눌러 보세요.", "문자에 있는 주소로 들어가세요."]) assert.ok(replyClaimsSmsSent(t), t);
  for (const t of ["문자 보내 드릴게요.", "곧 안내 문자를 보내 드리겠습니다.", "본인 확인부터 하겠습니다."]) assert.ok(!replyClaimsSmsSent(t), t);
  // 이미 받은 인증번호를 말한 턴에는 계좌 문자가 미리 가지 않는다.
  assert.ok(!claimMatchesPurpose("방금 보내 드린 인증번호 불러 주세요.", "transfer"));
  // 세션 68777e88 재현 — 인증번호 발화 7 도착 · 발화 9에 주장 → 계좌 문자 지금 보낼 수 있다(종전은 마커가 온 발화 10).
  const { declared } = resolveDeclaredSms("institutional-impersonation", "fv-c5fj");
  const plan = planSmsBackstop({ declared, delivered: [{ smsId: "institution-otp", userTurnsAtArrival: 7 }], userTurns: 9, claimed: true });
  assert.equal(plan.action, "deliver");
  // 하한 전이면 보내지 않는다(인증번호 하한 5 — 발화 3의 주장).
  assert.notEqual(planSmsBackstop({ declared, delivered: [], userTurns: 3, claimed: true }).action, "deliver");
  // 화면 사본과 같은 글자.
  const client = readFileSync(path.resolve(__dirname, "../../../../src/lib/realtime/toolWindow.ts"), "utf8");
  assert.ok(client.includes(SMS_SENT_CLAIM.source), "SMS_SENT_CLAIM 사본 일치");
  // 배선 — 마커가 없는 턴 · 도착 기록을 읽은 턴 · 전환 전만.
  const src = read("roleplay/index.ts");
  assert.ok(src.includes("} else if (\n      smsDeliveredLoaded &&\n      smsDeclared.length > 0 &&\n      verifyState?.placed !== true &&\n      replyClaimsSmsSent(finalReplyText)\n    ) {"));
  assert.ok(src.includes('if (claimPlan.action === "deliver" && claimMatchesPurpose(finalReplyText, claimPlan.item.purpose)) {'));
});
