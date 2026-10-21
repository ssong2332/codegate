// 2026-10-21 — createRealtimeCall 처리 시간 분해 1줄(`setupTiming.ts`).
//
// 이 파일이 고정하는 것:
//   ⓐ 구간 계산(Firestore · 토큰 발급 · 전체)과 빠진 구간 = null.
//   ⓑ 콜드 스타트 플래그는 인스턴스 첫 호출에서만 true.
//   ⓒ 레코드에는 숫자 · 종류만 — 식별자 · 토큰 필드가 없다. 콜러블이 두 반환 경로(정상 · 강등) 모두에서 남긴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startSetupTiming, takeColdStartFlag } from "../setupTiming";

function clock(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

test("ⓐ 구간: 진입 → Firestore → 토큰 발급 → 끝", () => {
  const timing = startSetupTiming(clock([1000, 1180, 2650, 2660]), true);
  timing.mark("firestore");
  timing.mark("credentials");
  timing.mark("credentials"); // 두 번째 표시는 무시한다
  assert.deepEqual(timing.finish({ provider: "gemini", isMock: false }), {
    coldStart: true,
    firestoreMs: 180,
    credentialsMs: 1470,
    totalMs: 1660,
    provider: "gemini",
    isMock: false,
  });
});

test("ⓐ 강등 경로(토큰 발급 실패) — 발급 구간은 null", () => {
  const timing = startSetupTiming(clock([0, 90, 3100]), false);
  timing.mark("firestore");
  assert.deepEqual(timing.finish({ provider: "none", isMock: true }), {
    coldStart: false,
    firestoreMs: 90,
    credentialsMs: null,
    totalMs: 3100,
    provider: "none",
    isMock: true,
  });
});

test("ⓑ 콜드 스타트 플래그는 인스턴스 첫 호출에서만 true", () => {
  // 같은 테스트 프로세스의 다른 파일이 이 모듈을 먼저 부르지 않는다(콜러블 본체는 테스트에서 실행되지 않는다).
  assert.equal(takeColdStartFlag(), true);
  assert.equal(takeColdStartFlag(), false);
  assert.equal(takeColdStartFlag(), false);
});

test("ⓒ 레코드 키는 숫자 · 종류뿐이고, 콜러블은 정상 · 강등 두 경로 모두에서 1줄을 남긴다", () => {
  const record = startSetupTiming(() => 0, false).finish({ provider: "gemini", isMock: false });
  assert.deepEqual(Object.keys(record).sort(), [
    "coldStart",
    "credentialsMs",
    "firestoreMs",
    "isMock",
    "provider",
    "totalMs",
  ]);
  // lib/realtime/__tests__ → src/realtime/index.ts
  const src = readFileSync(join(__dirname, "..", "..", "..", "src", "realtime", "index.ts"), "utf8");
  const logs = src.match(/logger\.info\(REALTIME_SETUP_LOG_MESSAGE, timing\.finish\(/g) ?? [];
  assert.equal(logs.length, 2, "정상 · 강등 두 경로에 1줄씩");
  assert.ok(src.indexOf('timing.mark("firestore")') < src.indexOf('timing.mark("credentials")'));
});
