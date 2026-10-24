// §128(2)(2026-10-24 메인 세션 라이브 실측 — 통화 겹침 중 카톡 "방금 50만원 보냈어"가 속은 순간에서 빠졌다) — H4 이행 보고 · T-1 시도된 수법 보강.
// ⛔ 라이브 호출 0건.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";

const tactics = resolveSessionScenarioPrompt("messenger-child-impersonation-kakao", "fv-tdgg")?.weakenedTactics ?? [];

function conversation(lines: [AnalysisMessage["role"], string, Partial<AnalysisMessage>?][]): AnalysisMessage[] {
  return lines.map(([role, textMasked, extra], i) => ({ role, textMasked, turnIndex: i, createdAtMs: i * 10_000, ...(extra ?? {}) }));
}

// 실측 흐름(대사는 실측 요지 — 원문 미보존).
const LIVE = conversation([
  ["scammer", "아빠 나야 ㅠㅠ 폰 액정이 깨져서 친구 폰으로 톡해"],
  ["user", "무슨 일이야?"],
  ["scammer", "아빠 보험 접수에 아빠 신분증 사진이 필요하대, 찍어서 보내 줘"],
  ["user", "(사진 1장을 보냈다)", { photo: true }],
  ["scammer", "고마워 잘 받았어! 수리비가 급해서 그런데 50만원만 OO은행 948-2716-5093-27로 보내줘"],
  ["scammer", "아빠 나 지금 친구 폰이라 길게 통화 못 해", { channel: "voice" }],
  ["user", "방금 50만원 보냈어", { channel: "messenger" }],
  ["scammer", "고마워 아빠 ㅠㅠ 근데 30만원만 더 보내줄 수 있어?", { channel: "messenger" }],
  ["user", "더는 못 보내", { channel: "messenger" }],
  ["scammer", "그럼 아빠 계좌 비밀번호 앞자리만 알려줘", { channel: "messenger" }],
  ["user", "그걸 왜 알려줘 이상한데", { channel: "messenger" }],
]);

test("[§128(2) H4] 송금 요구 뒤 이행 보고(통화 중 카톡 · 바로 앞이 통화 대사여도) = 속은 순간 · 라벨은 요구한 대사에서", () => {
  const result = analyzeConversation(LIVE, 0, tactics);
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 6);
  assert.ok(moment, "방금 50만원 보냈어");
  assert.equal(moment.tacticCategory, "payment_demand");
  assert.ok(result.deceivedMoments.some((m) => m.turnIndex === 3), "사진 턴(H3) 유지");
  assert.ok(!result.deceivedMoments.some((m) => m.turnIndex === 8 || m.turnIndex === 10), "거절 · 의심은 속음 아님");
});

test("[§128(2) H4] 부정 · 요구 없음 · 거절 어휘가 있으면 열지 않는다", () => {
  const demand: [AnalysisMessage["role"], string] = ["scammer", "50만원만 이 계좌로 보내줘"];
  for (const reply of ["아직 안 보냈어", "못 보냈어", "보냈는데 이상해서 은행에 물어볼게"]) {
    const result = analyzeConversation(conversation([demand, ["user", reply]]), 0, tactics);
    assert.equal(result.deceivedMoments.length, 0, reply);
  }
  const noDemand = analyzeConversation(conversation([["scammer", "아빠 잘 지내?"], ["user", "응 아까 택배 보냈어"]]), 0, tactics);
  assert.equal(noDemand.deceivedMoments.length, 0, "송금 요구 없이 '보냈어'");
});

test("[§128(2) T-1] 거절한 요구도 '시도된 수법'에 오른다(세션 목록 안 라벨만)", () => {
  const result = analyzeConversation(
    conversation([
      ["scammer", "30만원만 더 이 계좌로 보내줄 수 있어?"],
      ["user", "더는 못 보내"],
    ]),
    0,
    tactics,
  );
  assert.equal(result.deceivedMoments.length, 0);
  assert.ok(result.tacticsUsed.includes("송금 직접 요구"), JSON.stringify(result.tacticsUsed));
});
