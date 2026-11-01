// ⭐ A2 ㉢(실기기 신고 2026-11-01 · 사용자 결정 "권고대로") — 자녀 사칭은 기본 채팅만 · 목소리 복제를 고른 세션에서만 짧은 딥보이스 통화 1회 ·
// 참가자가 건 보이스톡은 늘 받지 않는다. 판정표 C(`resolveTransitionNow`) · 짧은 통화 규칙 · 포기 끊기 5행 예외 · 배선.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PUBLIC_SCENARIOS } from "../publicMeta";
import { resolveSessionEscalation, resolveTransitionNow } from "../escalation";
import { FLOW_VARIANTS, resolveSessionScenarioPrompt } from "../flowVariants";
import { CLONE_SHORT_CALL_RULE } from "../../realtime/priorChatContext";

const CHILD = "messenger-child-impersonation-kakao";
const SRC = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

test("[A2 ㉢ C] 전환 판정 — 목소리 복제(녹음 · 재사용)만 · 한 번만 · 다른 시나리오는 세션 술어 그대로", () => {
  const base = { scenarioId: CHILD, difficultyLevel: "advanced" };
  assert.ok(resolveSessionEscalation(base, PUBLIC_SCENARIOS), "세션 술어(배정 풀 · 설치 도달 · 단계 파생)는 그대로 통화 단계 있음");
  for (const source of [undefined, "fallback_male", "fallback_female"]) {
    assert.equal(resolveTransitionNow({ ...base, voiceSelectionSource: source }, PUBLIC_SCENARIOS), undefined, `C1 ${String(source)}`);
  }
  for (const source of ["recorded", "reused"]) {
    assert.deepEqual(resolveTransitionNow({ ...base, voiceSelectionSource: source }, PUBLIC_SCENARIOS), { toChannel: "voice", voiceMode: "clone" }, `C3 ${source}`);
    assert.equal(
      resolveTransitionNow({ ...base, voiceSelectionSource: source, channelHistory: [{ from: "messenger", to: "voice" }, { from: "voice", to: "messenger" }] }, PUBLIC_SCENARIOS),
      undefined,
      `C2 ${source} — 짧은 통화는 한 번`,
    );
  }
  const subsidy = { scenarioId: "messenger-subsidy-smishing-sms", difficultyLevel: "beginner", voiceSelectionSource: "fallback_male" };
  assert.deepEqual(resolveTransitionNow(subsidy, PUBLIC_SCENARIOS), resolveSessionEscalation(subsidy, PUBLIC_SCENARIOS), "다른 시나리오 무변경");
  assert.equal(PUBLIC_SCENARIOS[CHILD]!.escalationCloneOnly, true);
});

test("[A2 ㉢] 대사 — 기본은 채팅만 · 먼저 전화하는 신호 지시 0 · 짧은 통화 규칙은 계좌 · 금액 요구 금지 · give_up으로 끊기", () => {
  for (const v of FLOW_VARIANTS.filter((x) => x.scenarioId === CHILD)) {
    const prompt = resolveSessionScenarioPrompt(CHILD, v.variantId)!;
    const text = [prompt.personaPrompt, ...prompt.weakenedTactics].join("\n");
    assert.equal(text.includes("[[SIGNAL:ESCALATE_VOICE]]"), false, v.variantId);
    assert.equal(text.includes("그럼 내가 지금 전화할게"), false, v.variantId);
    assert.ok(prompt.personaPrompt.includes("앱이 짧은 목소리 통화를 이어 줄 때만 그 통화 규칙을 따른다"), v.variantId);
  }
  assert.ok(CLONE_SHORT_CALL_RULE.includes("울먹이는 목소리"));
  assert.ok(CLONE_SHORT_CALL_RULE.includes("계좌번호 · 금액 · 이체"));
  assert.ok(CLONE_SHORT_CALL_RULE.includes("give_up 사유로 불러 끊는다"));
  assert.ok(!/["“”]/.test(CLONE_SHORT_CALL_RULE) && !/\d/.test(CLONE_SHORT_CALL_RULE));
});

test("[A2 ㉢ 배선] 실제 전환 지점 · 보이스톡 늘 응답 없음 · 짧은 통화 규칙 · 포기 끊기 하한 예외", () => {
  const session = read("session/index.ts");
  assert.ok(session.includes("const voiceTalkNeverAnswered = PUBLIC_SCENARIOS[session.scenarioId]?.escalationCloneOnly === true;"));
  assert.ok(session.includes('if (!resolveTransitionNow(session, PUBLIC_SCENARIOS) || (via === "voice_talk" && voiceTalkNeverAnswered)) {'));
  const roleplay = read("roleplay/index.ts");
  assert.equal((roleplay.match(/resolveTransitionNow\(session, PUBLIC_SCENARIOS\) !== undefined/g) ?? []).length, 2, "자동 전이 · 대사 예고 전환");
  assert.ok(read("roleplay/screenActionFollowUp.ts").includes("resolveTransitionNow(session, PUBLIC_SCENARIOS) !== undefined"));
  assert.ok(read("realtime/index.ts").includes("priorChatContext = `${priorChatContext}\\n${CLONE_SHORT_CALL_RULE}`;"));
  assert.ok(read("scammerHangup/commit.ts").includes("PUBLIC_SCENARIOS[session.scenarioId]?.escalationCloneOnly === true && isEscalatedVoiceCall(session.channel, session.channelHistory)"));
});
