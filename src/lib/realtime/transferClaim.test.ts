// 2026-11-24 페르소나 점검 N3 — 판정표 VD 클라 사본 고정(서버 `functions/src/shared/transferClaim.ts`와 같은 글자) · 실시간 배선.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { participantSaidSent, TRANSFER_DONE_REPORT } from "./transferClaim.ts";

test("[드리프트] 서버 정규식과 같은 글자", () => {
  const server = readFileSync(new URL("../../../functions/src/shared/transferClaim.ts", import.meta.url), "utf8");
  assert.ok(server.includes(TRANSFER_DONE_REPORT.source), "서버 transferClaim.ts와 source가 다르다");
});

test("[VD3] 보냈다는 말 · 부정 · 재현 대사", () => {
  assert.equal(participantSaidSent(["음… 알겠어요. 은행 하나 쓰고 있어요."]), false); // probe N3 재현
  assert.equal(participantSaidSent(["보냈어요. 이제 풀어 주세요."]), true);
  assert.equal(participantSaidSent(["아직 안 보냈어요."]), false);
});

test("[배선] end_call 판정 요청에 participantSaidSent를 싣는다(이 통화 참가자 줄 전부)", () => {
  const src = readFileSync(new URL("./GeminiVoiceSession.tsx", import.meta.url), "utf8");
  assert.match(src, /participantSaidSent: participantSaidSent\(userTextsForGuard\(\)\)/);
});
