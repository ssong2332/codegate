// 2026-11-24 페르소나 점검 묶음 ⑤ — 리플레이 모의 화면 문구(browser-c N4) · 실시간 자막 첫 줄(browser-b N-B2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mockScreenWhat, mockScreenSubmittedText } from "./reportAccuracy.ts";

const replaySrc = readFileSync(new URL("../../app/report/replay/page.tsx", import.meta.url), "utf8");

test("[N4 재현 · 처리] 이체 화면 = '훈련용 이체 화면' · 제출 = 이체 문장(리포트와 같은 함수)", () => {
  const entry = { kind: "credential-form" as const, bankTransfer: true, submitted: true, amountComparison: "equal" as const };
  assert.equal(mockScreenWhat(entry), "훈련용 이체 화면이 표시됐습니다.");
  assert.equal(mockScreenSubmittedText(entry), "이 화면에서 이체를 진행했습니다. 요구받은 금액을 그대로 보냈습니다.");
});

test("[N4 배선] 리플레이 칸이 kind 이분 문구를 쓰지 않고 reportAccuracy 함수를 쓴다", () => {
  assert.doesNotMatch(replaySrc, /:\s*"본인확인 입력 화면이 표시됐습니다\."/);
  assert.match(replaySrc, /const what = mockScreenWhat\(mockScreen\)/);
  assert.match(replaySrc, /mockScreenSubmittedText\(mockScreen\)/);
});

test("[N-B2 배선] 실시간 자막 대체값은 낭독하지 않은 서버 오프닝(turnIndex 0)을 건너뛴다", () => {
  const playSrc = readFileSync(new URL("../../app/session/play/page.tsx", import.meta.url), "utf8");
  assert.match(playSrc, /callMode === "realtime" && messages\[0\]\?\.turnIndex === 0 \? Math\.max\(legCaptionFrom, 1\) : legCaptionFrom/);
});
