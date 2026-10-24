// §131(5)(2026-10-24 메인 세션 라이브 확인 — 자녀 사칭 카톡 고급 · 참가자가 건 보이스톡) — 메신저에서 이어진 통화의 빨간 버튼 이름.
// (§131(3) 통화 대사 접기는 `threadItems.test.ts`가 고정한다.)
//
// ⚠️ CRLF 체크아웃에서도 맞도록 소스는 `\r\n`→`\n`으로 정규화해 읽는다(callAudio.test.ts 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

test("[§131(5)] 메신저발 통화의 빨간 버튼 = '통화 종료'(끊으면 대화방) · 통화 시나리오는 '통화 종료 — 훈련 종료' 그대로", () => {
  const play = read("src/app/session/play/page.tsx");
  assert.match(play, /aria-label=\{returnsToMessengerOnHangup \? "통화 종료" : "통화 종료 — 훈련 종료"\}/);
  // 이름의 조건과 끊기 동작(대화방 복귀)의 조건이 같은 값이다.
  assert.match(play, /const returnsToMessengerOnHangup = scenario\?\.channel === "messenger";/);
  assert.match(play, /if \(returnsToMessengerOnHangup && !isEndLatched\(callEndingRef\.current\)\) \{\s*await handleRequestReverseEscalation\("hangup"\);/);
});
