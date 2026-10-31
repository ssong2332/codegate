// §132.13(DECISIONS #248 ⑮ · 메인 라이브 2026-10-25 main `e5fcadd` · 자녀 납치 협박 초급 fv-c5ih · 텍스트 폴백 세션 e76d6616) —
// "보냈어요" 뒤 "이제 끊지 말고 제 말만 들어요"로 두 턴 더 끌기 · 첫마디 "경찰청 사이버수사대 소속".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  buildConfirmResultInstruction,
  buildNoSmsTransferClaimInstruction,
  transferClaimsReachDemandStages,
} from "../../inCallSms/confirmResult";
import { KIDNAPPING_THREAT_SCENARIO_ID } from "../../scenarios/kidnappingThreat.prompt";
import { findFlowVariant, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { personaAnchorInstruction, personaGuardFor } from "../personaGuard";

const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

test("[§132.13 (1)] 문자 없는 변형 — 송금 완료 주장 수가 요구 단계 수에 닿으면 이번 대답에서 끝내기 신호 · 붙잡는 말 금지", () => {
  // 라이브 재현 — 초급(요구 단계 1)의 발화 3 "보냈어요".
  const live = ["네 맞는데요, 무슨 일이세요?", "네? 우리 애가요? 어떻게 해야 돼요?", "보냈어요"];
  assert.equal(findFlowVariant("fv-c5ih")?.demandStages, 1);
  assert.ok(transferClaimsReachDemandStages(live, 1));
  const final = buildNoSmsTransferClaimInstruction(true);
  assert.match(final, /응답 맨 끝에 \[\[SIGNAL:END_CALL_GOAL\]\]을 붙여 이번 대답에서 통화를 끝내라/);
  assert.match(final, /통화를 끊지 말라거나 기다리라거나 네 말만 들으라는 말은 하지 말고/);
  assert.ok(!final.includes("문자"), "문자 없는 통화 문면");
  // 요구 단계 2(중급 · 고급) — 첫 송금 주장은 아직 끝이 아니다(남은 요구 분기 · G625 구절 그대로).
  assert.ok(!transferClaimsReachDemandStages(live, 2));
  assert.ok(transferClaimsReachDemandStages([...live, "네 알겠어요", "또 보냈어요"], 2));
  const pending = buildNoSmsTransferClaimInstruction(false);
  assert.ok(pending.includes("더 요구할 것이 남지 않았으면 [진행 강제]의 통화 끝내기 항목이 정한 대로 하라"));
  assert.ok(!pending.includes("문자"));
  // 변형 부재 · 단계 수 이상값 = 2행(종전 쪽).
  assert.ok(!transferClaimsReachDemandStages(live, undefined));
  assert.ok(!transferClaimsReachDemandStages(live, 0));
  // 문자 선언 변형의 확인 결과 지시는 무변경(문자 안내 문면 그대로).
  assert.ok(buildConfirmResultInstruction("transfer").includes("문자 안내대로"));
  // 배선 — 같은 조건 · 문면만 바뀐다.
  const src = read("roleplay/index.ts");
  assert.ok(
    src.includes(
      'isCompletionClaim(maskedUserText, "transfer")\n        ? buildNoSmsTransferClaimInstruction(\n            transferClaimsReachDemandStages(\n              [...priorUserTexts, maskedUserText],\n              findFlowVariant(session.flowVariantId)?.demandStages,\n            ),\n          )',
    ),
  );
});

test("[§132.13 (1)] 납치 페르소나 — 확인하는 그 대답에서 알리지 말라는 말 한 문장 뒤 끝낸다 · '끊지 마라'로 붙잡지 않는다", () => {
  const prompt = resolveSessionScenarioPrompt(KIDNAPPING_THREAT_SCENARIO_ID, "fv-c5ih")!;
  assert.ok(!prompt.personaPrompt.includes("신고 차단 지시를 한 번 짧게 한 뒤"), "종전(§132.11) 문장 0");
  assert.ok(prompt.personaPrompt.includes("같은 대답에서 [진행 강제]의 통화 끝내기 항목이 정한 대로 통화를 끝낸다."));
  assert.ok(prompt.personaPrompt.includes('"끊지 마라", "기다려라", "내 말만 들어라"며 통화를 붙잡아 두지 않는다'));
});

test("[§132.13 (2)] 납치 협박 — 기관 · 수사기관 자기소개는 쓸 수 없는 응답 · 역할 고정 1줄 · 남을 말하는 문장 · 다른 시나리오는 그대로", () => {
  const prompt = resolveSessionScenarioPrompt(KIDNAPPING_THREAT_SCENARIO_ID, "fv-c5ih")!;
  assert.ok(prompt.personaPrompt.includes("경찰 · 수사기관 · 금융기관 같은 어떤 기관의 직원이나 소속이라고도 자기를 소개하지 않는다"));
  const guard = personaGuardFor(KIDNAPPING_THREAT_SCENARIO_ID)!;
  assert.ok(guard);
  for (const drift of [
    "여보세요, 이정훈 씨 본인 맞으시죠? 저는 지금 경찰청 사이버수사대 소속입니다.", // 이번 라이브
    "여보세요, 거기 혹시 본인 맞으세요? 저는 시내 경찰서 사이버수사팀 담당자입니다.", // 직전 라이브
    "저는 시내 경찰서 수사과 소속입니다.", // §132.9 라이브
    "경찰청 수사관입니다. 묻지 말고 들어요.",
  ]) {
    assert.ok(guard.test(drift), drift);
  }
  for (const ok of [
    "지금 자녀분이 저희 쪽에 있습니다. 설명할 시간 없으니까 묻지 말고 들어요.",
    "경찰이나 다른 데 연락하면 없던 일로 안 끝나요.",
    "경찰에 신고하면 후회할 수도 있어요.",
    "들어왔네요. 누구한테도 말하지 마세요.",
    "고객님, 시간 없어요.",
  ]) {
    assert.ok(!guard.test(ok), ok);
  }
  assert.match(personaAnchorInstruction(KIDNAPPING_THREAT_SCENARIO_ID) ?? "", /신원을 밝히지 않는 협박범이다/);
  // 지인 · 자녀 사칭은 종전 판정(고객님 포함) · 그 밖 시나리오는 검사 0.
  assert.ok(personaGuardFor("messenger-friend-loan-kakao")!.test("고객님 안녕하세요"));
  assert.equal(personaGuardFor("institutional-impersonation"), undefined);
  assert.equal(personaAnchorInstruction("institutional-impersonation"), undefined);
});

test("[§132.13 (3)] 판정표 4-b — 후속 단계 변형은 C-5 전 끊기를 경로와 무관하게 막는다(폴백 · 전환 도달 불가에서도) · 세션 eff12d2b 재현", async () => {
  const { SCAMMER_HANGUP_RULES, decideScammerHangup } = await import("../../scammerHangup/decide");
  const { decideFallbackHangup } = await import("../../scammerHangup/fallback");
  const { hasCompletedGoalAction, goalFollowUpFor } = await import("../../scammerHangup/goalAction");
  const { resolveDeclaredSms } = await import("../../inCallSms/smsGate");
  const { scammerHangupGuidance, SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE } = await import("../../scammerHangup/guidance");
  const rows = SCAMMER_HANGUP_RULES.map((r) => r.row);
  assert.equal(rows.indexOf("4-b"), rows.indexOf("4") + 1, "4행 바로 뒤");
  // 현금 전달형 — 인증번호 도착 발화 6 · "835270 왔어요" = 발화 7.
  const follow = goalFollowUpFor("institutional-impersonation", "fv-q7cn")!;
  assert.equal(follow, 4);
  const { declared } = resolveDeclaredSms("institutional-impersonation", "fv-q7cn");
  const delivered = [{ smsId: declared[0].smsId, userTurnsAtArrival: 6 }];
  const pending = (userTurns: number) =>
    !hasCompletedGoalAction({ delivered, mockScreens: [], declared, declaredKnown: true, userTurns, followUpUserTurns: follow });
  const facts = (userTurns: number) => ({
    status: "active" as const,
    channel: "voice" as const,
    verifyEnabled: true,
    transferPlaced: false,
    // 폴백 · 계열 B · 오퍼 문서 없음 — 4행이 꺼진 칸(라이브 세션).
    transferReachable: false,
    goalActionDone: !pending(userTurns),
    followUpPending: pending(userTurns),
    decisionScreenPending: false,
    userTurns,
    limitReached: false,
    alreadyAccepted: false,
    relay: undefined,
    smsDeclared: true,
    smsDeliveredLoaded: true,
  });
  assert.deepEqual(decideFallbackHangup(facts(7), delivered, false), { status: "blocked_follow_up", hangup: false, row: "4-b" }, "라이브 발화 7");
  assert.equal(decideFallbackHangup(facts(9), delivered, false).status, "blocked_follow_up");
  assert.equal(decideFallbackHangup(facts(10), delivered, false).status, "accepted", "C-5 충족(도착 뒤 4발화)");
  // 인증번호 도착 전 거절도 막는다(사용자 결정 — 실시간 4행과 같은 칸).
  assert.equal(decideFallbackHangup({ ...facts(5), followUpPending: true }, [], false).status, "blocked_follow_up");
  // 실시간(4행 살아 있음)은 종전대로 4행이 먼저 잡는다.
  assert.equal(decideScammerHangup({ ...facts(7), transferReachable: true, isMockTurn: false, pendingInstruction: false, smsAwaitingUser: false, hangupKind: undefined }).row, "4");
  // 후속 단계 없는 변형 = 4-b 무관(종전).
  assert.equal(goalFollowUpFor("kidnapping-threat", "fv-c5ih"), undefined);
  assert.equal(decideFallbackHangup({ ...facts(7), followUpPending: false, goalActionDone: false }, delivered, false).status, "accepted");
  assert.equal(scammerHangupGuidance("blocked_follow_up"), SCAMMER_HANGUP_FOLLOW_UP_PENDING_GUIDANCE);
  // 배선 — 폴백 · 실시간 · 통화 중 카톡이 같은 계산(확인 무력화 여부와 무관).
  const fallbackSrc = read("roleplay/index.ts");
  // P1 M1 — goalActionDone 계산 조건(확인 무력화 ∨ 후속 단계)을 없앴다: 모든 세션에서 같은 함수로 계산한다(C-5는 그대로 후속 단계 변형만).
  assert.ok(!fallbackSrc.includes("if (verifyEnabled || followUpUserTurns !== undefined) {"));
  assert.ok(fallbackSrc.includes("followUpUserTurns, // §115 C-5"));
  assert.ok(fallbackSrc.includes("followUpPending: followUpUserTurns !== undefined && !goalActionDone,"));
  const realtimeSrc = read("scammerHangup/index.ts");
  assert.ok(!realtimeSrc.includes("if (isVerifyInterceptSession(session) || followUpUserTurns !== undefined) {"));
  assert.ok(realtimeSrc.includes("followUpUserTurns, // §115 C-5"));
  assert.ok(realtimeSrc.includes("      goalActionDone,\n      followUpUserTurns !== undefined && !goalActionDone,\n      decisionScreenPending,\n    ),"));
  assert.ok(read("roleplay/chatDuringCall.ts").includes("followUpPending: chatFollowUpPending("));
});

test("[§132.13] 생년월일 가명 — 연도만 되받은 꼴도 원래 연도로 되돌린다 · 날짜 전체 복원은 종전 그대로", async () => {
  const { pseudonymizeForGroq, GROQ_BIRTHDATE_PSEUDONYMS } = await import("../../llm/piiPseudonymizer");
  const messages = [
    { role: "assistant" as const, content: "성함과 생년월일을 말씀해 주십시오." },
    { role: "user" as const, content: "이정훈이고요, 1970년 5월 3일이에요." },
  ];
  const pseudo = pseudonymizeForGroq(messages);
  assert.equal(GROQ_BIRTHDATE_PSEUDONYMS[0], "1971년 3월 14일");
  assert.ok(pseudo.messages[1].content.includes("1971년 3월 14일"), "전송값은 가명");
  assert.equal(pseudo.restore("네, 1971년생이시네요."), "네, 1970년생이시네요.", "라이브 재현");
  assert.equal(pseudo.restore("71년생이시고요."), "70년생이시고요.");
  assert.equal(pseudo.restore("1971년 3월 14일 맞으시죠?"), "1970년 5월 3일 맞으시죠?", "날짜 전체 = 종전");
  assert.equal(pseudo.restore("2019년에 개설된 계좌입니다."), "2019년에 개설된 계좌입니다.", "다른 연도 무변경");
  // 6자리로 말한 경우 — 끝 2자리.
  const six = pseudonymizeForGroq([
    { role: "assistant" as const, content: "생년월일 여섯 자리 불러 주세요." },
    { role: "user" as const, content: "700503이요" },
  ]);
  assert.equal(six.restore("1971년생 맞으시죠?"), "1970년생 맞으시죠?");
  // 가명 연도가 원래 대화에 있으면 바꾸지 않는다.
  const clash = pseudonymizeForGroq([
    { role: "assistant" as const, content: "생년월일 말씀해 주세요." },
    { role: "user" as const, content: "1970년 5월 3일이요. 1971년에 이사 왔어요." },
  ]);
  assert.equal(clash.restore("1971년생이시네요."), "1971년생이시네요.");
});
