// §129 에뮬 D2(사용자 결정 2026-10-24 ㉠) — "받기" 시각 기록 · 폴백 첫 sendMessage에 받은 뒤 지난 ms를 싣는 배선(소스 스캔 —
// `pendingSession.ts`는 `@/` 별칭 import가 있어 이 러너에서 직접 import할 수 없다). 서버 판정은 functions `probeRegression129.test.ts` 표 B.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel: string): string => fs.readFileSync(rel, "utf8").replace(/\r\n/g, "\n");

test("[§129 에뮬 D2] markSessionAnswered가 세션 id와 받은 시각을 함께 남기고 · readAnsweredElapsedMs는 같은 세션만 읽는다", () => {
  const src = read("src/lib/recording/pendingSession.ts");
  assert.match(src, /window\.sessionStorage\.setItem\(ANSWERED_AT_KEY, `\$\{sessionId\}\|\$\{nowMs\}`\);/);
  assert.match(src, /if \(sep < 0 \|\| raw\.slice\(0, sep\) !== sessionId\) return undefined;/);
  assert.match(src, /return Number\.isFinite\(at\) && elapsed >= 0 \? elapsed : undefined;/);
});

test("[§129 에뮬 D2] sendMessage 래퍼가 통화 중 카톡이 아닐 때만 answeredElapsedMs를 싣는다 · 요청 타입이 서버와 같은 이름", () => {
  const wrapper = read("src/lib/api/sendMessage.ts");
  assert.match(wrapper, /const answeredElapsedMs = request\.duringCall \? undefined : readAnsweredElapsedMs\(request\.sessionId\);/);
  assert.match(wrapper, /answeredElapsedMs === undefined \? request : \{ \.\.\.request, answeredElapsedMs \}/);
  assert.match(read("src/lib/api/types.ts"), /answeredElapsedMs\?: number;/);
  assert.match(read("functions/src/roleplay/types.ts"), /answeredElapsedMs\?: number;/);
});
