// 2026-11-24 브라우저 A 라이브 A7(검찰 고급 상품권 핀 번호형 fv-v2mk) — 핀 번호를 불러 준 답이 리포트에서 '본인확인 정보 직접 요구'에 응함으로 표시.
// 원인: 사기범이 핀 번호를 말로 물으면 Live 전사 거르기(`realtime/liveTranscriptGuard.ts` U1)가 답의 숫자를 `[비밀번호]`로 가린다 →
// 저장 전사 "[비밀번호]에요."에 숫자가 없어 핀 낭독 판정(`analyzeConversation.ts` `isPinGiven` P3)이 놓쳤다.
//
// | # | 고정하는 것 |
// |---|---|
// | PM1 | 재현 P3′ — 핀 요구 뒤 `[비밀번호]`로 가려진 답 → '상품권 핀 번호 요구' 라벨 |
// | PM2 | P3′ — 가림이 걸린 대사가 핀을 '확인'으로 물어도(U1 요구 어형) 같은 라벨 |
// | PM3 | 비밀번호(핀 아님) 요구 뒤 `[비밀번호]` 답은 이 행 밖(핀 라벨 아님) |
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, type AnalysisMessage } from "../analyzeConversation";
import { findFlowVariant } from "../../scenarios/flowVariants";
import { guardLiveUserLineWith } from "../../realtime/liveTranscriptGuard";

const msg = (role: "scammer" | "user", textMasked: string, turnIndex: number): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: 1_000 + turnIndex * 10_000,
});
const tactics = () => [...findFlowVariant("fv-v2mk")!.tactics];

test("[PM1 재현] 핀 요구 뒤 `[비밀번호]`로 가려진 답 → 상품권 핀 라벨(신원 라벨 아님)", () => {
  const ask = "결제 확인됐습니다. 화면에 뜬 핀 번호를 지금 불러 주십시오.";
  const reply = guardLiveUserLineWith("4821 7730 1956에요.", ask);
  assert.equal(reply, "[비밀번호]에요.", "전제 — Live 전사 거르기가 핀 숫자를 가린다");
  const result = analyzeConversation([msg("scammer", ask, 1), msg("user", reply, 2)], 0, tactics());
  assert.equal(result.deceivedMoments[0]?.tactic, "상품권 핀 번호 요구", JSON.stringify(result.deceivedMoments));
});

test("[PM2] 핀을 '확인'으로 물은 대사(U1 요구 어형) 뒤 가린 답도 같은 라벨", () => {
  const ask = "상품권 핀 번호 확인 부탁드립니다.";
  const reply = guardLiveUserLineWith("사팔이일 칠칠삼공이요", ask);
  assert.ok(reply.includes("[비밀번호]"), reply);
  const result = analyzeConversation([msg("scammer", ask, 1), msg("user", reply, 2)], 0, tactics());
  assert.equal(result.deceivedMoments[0]?.tactic, "상품권 핀 번호 요구", JSON.stringify(result.deceivedMoments));
});

test("[PM3] 비밀번호(핀 아님) 요구 뒤 가린 답은 핀 라벨이 아니다", () => {
  const ask = "계좌 비밀번호 네 자리 불러 주세요.";
  const reply = guardLiveUserLineWith("1234요", ask);
  const result = analyzeConversation([msg("scammer", ask, 1), msg("user", reply, 2)], 0, tactics());
  assert.ok(result.deceivedMoments.every((m) => m.tactic !== "상품권 핀 번호 요구"), JSON.stringify(result.deceivedMoments));
});
