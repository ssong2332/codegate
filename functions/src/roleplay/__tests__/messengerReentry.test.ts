// turnsSinceMessengerEntry 단위 테스트 (reviewer 리뷰 Major #2 수정, 2026-07-24).
import { test } from "node:test";
import assert from "node:assert/strict";
import { turnsSinceMessengerEntry } from "../messengerReentry";
import type { ChannelTransitionEntry } from "../../shared/types";

const at = {} as ChannelTransitionEntry["at"]; // 테스트에선 Firestore Timestamp 값 자체는 무관

test("channelHistory가 없으면(=한 번도 채널을 벗어난 적 없음) 누적 turnCount를 그대로 쓴다", () => {
  assert.equal(turnsSinceMessengerEntry(6, undefined), 6);
  assert.equal(turnsSinceMessengerEntry(6, []), 6);
});

test("메신저로의 전이 기록이 없으면(예: messenger→voice 정방향만 있음) 누적 turnCount를 그대로 쓴다", () => {
  const history: ChannelTransitionEntry[] = [
    { from: "messenger", to: "voice", at, trigger: "manual_button" },
  ];
  assert.equal(turnsSinceMessengerEntry(8, history), 8);
});

test("가장 최근 메신저 재진입(voice→messenger) 이후 턴 수만 센다 — 핑퐁 회귀 방지", () => {
  // 정방향 6턴째 폴백 발화 → 사용자가 T40으로 즉시 복귀(turnCountAtTransition=6 기록) →
  // 복귀 후 첫 메시지(turnCount=7)에서 재차 6턴 폴백이 즉시 발화하면 안 된다.
  const history: ChannelTransitionEntry[] = [
    { from: "messenger", to: "voice", at, trigger: "maxturn_fallback" },
    { from: "voice", to: "messenger", at, trigger: "manual_button", turnCountAtTransition: 6 },
  ];
  assert.equal(turnsSinceMessengerEntry(7, history), 1, "복귀 후 1턴만 지난 것으로 계산돼야 한다");
  assert.equal(turnsSinceMessengerEntry(11, history), 5, "복귀 후 5턴 지남 — 아직 폴백 미도달");
  assert.equal(turnsSinceMessengerEntry(12, history), 6, "복귀 후 6턴 지남 — 폴백 도달");
});

test("메신저 재진입이 여러 번이면 가장 최근 것만 기준으로 삼는다", () => {
  const history: ChannelTransitionEntry[] = [
    { from: "voice", to: "messenger", at, trigger: "manual_button", turnCountAtTransition: 2 },
    { from: "messenger", to: "voice", at, trigger: "manual_button" },
    { from: "voice", to: "messenger", at, trigger: "manual_button", turnCountAtTransition: 9 },
  ];
  assert.equal(turnsSinceMessengerEntry(10, history), 1);
});

test("turnCountAtTransition이 기록 안 된 옛 엔트리(하위호환)는 0을 기준으로 삼는다", () => {
  const history: ChannelTransitionEntry[] = [
    { from: "voice", to: "messenger", at, trigger: "manual_button" }, // 필드 부재
  ];
  assert.equal(turnsSinceMessengerEntry(3, history), 3);
});
