// §57.2 (6) 처방 D1 — 전사 제출 시각 계산 회귀 테스트(docs/Architecture.md §57.2 (6)).
//
// 이 파일이 고정하는 것:
//   (a) `atMs` 부재 시 현행 합성 로직(`baseTimeMs + index*1000`)과 100% 동일 — 클램프 없음.
//   (b) `atMs` 존재 시 `(answeredAtMs ?? sessionCreatedAtMs) + atMs`로 계산.
//   (c) 클램프 — 과거(세션 생성 이전)·미래(now 이후) 시각은 `[sessionCreatedAtMs, nowMs]`로 잘린다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTurnCreatedAtMs } from "../transcriptTiming";

const SESSION_CREATED_AT_MS = 1_000_000;
const BASE_TIME_MS = 1_500_000; // 전사 제출 시각(레거시 합성 앵커)
const NOW_MS = 1_500_050; // 클램프 상한(트랜잭션 처리 중 약간 흐른 시각)

test("§57.2 D1 (a): atMs 부재면 현행 합성 로직과 100% 동일하다(클램프 없음)", () => {
  for (const index of [0, 1, 2, 199]) {
    const result = resolveTurnCreatedAtMs({
      index,
      atMs: undefined,
      answeredAtMs: undefined,
      sessionCreatedAtMs: SESSION_CREATED_AT_MS,
      baseTimeMs: BASE_TIME_MS,
      nowMs: NOW_MS,
    });
    assert.equal(result, BASE_TIME_MS + index * 1000);
  }
});

test("§57.2 D1 (a'): answeredAtMs만 있고 개별 턴의 atMs가 없으면 그 턴은 여전히 합성 로직을 쓴다", () => {
  const result = resolveTurnCreatedAtMs({
    index: 3,
    atMs: undefined,
    answeredAtMs: 1_200_000,
    sessionCreatedAtMs: SESSION_CREATED_AT_MS,
    baseTimeMs: BASE_TIME_MS,
    nowMs: NOW_MS,
  });
  assert.equal(result, BASE_TIME_MS + 3 * 1000);
});

test("§57.2 D1 (b): atMs가 있으면 answeredAtMs 기준 상대 시각으로 계산한다", () => {
  const answeredAtMs = 1_200_000;
  const result = resolveTurnCreatedAtMs({
    index: 5,
    atMs: 4_500,
    answeredAtMs,
    sessionCreatedAtMs: SESSION_CREATED_AT_MS,
    baseTimeMs: BASE_TIME_MS,
    nowMs: 2_000_000,
  });
  assert.equal(result, answeredAtMs + 4_500);
});

test("§57.2 D1 (b'): answeredAtMs가 없으면 session.createdAt이 기준점이 된다", () => {
  const result = resolveTurnCreatedAtMs({
    index: 0,
    atMs: 2_000,
    answeredAtMs: undefined,
    sessionCreatedAtMs: SESSION_CREATED_AT_MS,
    baseTimeMs: BASE_TIME_MS,
    nowMs: 2_000_000,
  });
  assert.equal(result, SESSION_CREATED_AT_MS + 2_000);
});

test("§57.2 D1 (c): 음수 atMs(세션 생성 이전으로 계산됨)는 sessionCreatedAtMs로 클램프된다", () => {
  const result = resolveTurnCreatedAtMs({
    index: 0,
    atMs: -999_999,
    answeredAtMs: 1_200_000,
    sessionCreatedAtMs: SESSION_CREATED_AT_MS,
    baseTimeMs: BASE_TIME_MS,
    nowMs: NOW_MS,
  });
  assert.equal(result, SESSION_CREATED_AT_MS);
});

test("§57.2 D1 (c'): 미래로 계산된 atMs(now 초과, 위조/오차)는 nowMs로 클램프된다", () => {
  const result = resolveTurnCreatedAtMs({
    index: 0,
    atMs: 999_999_999,
    answeredAtMs: 1_200_000,
    sessionCreatedAtMs: SESSION_CREATED_AT_MS,
    baseTimeMs: BASE_TIME_MS,
    nowMs: NOW_MS,
  });
  assert.equal(result, NOW_MS);
});

test("§57.2 D1 (c''): 클램프는 atMs가 있는 턴에만 적용된다 — 합성 경로는 now를 넘어도 안 잘린다", () => {
  // 레거시 합성 로직은 turn마다 +1초씩 미래로 나가는 것이 원래 산식이다(리포트 라벨 스프레드 유지
  // 목적). baseTimeMs + index*1000이 nowMs를 넘어도(트랜잭션 처리 지연 없이 캡처된 값이라면 흔한
  // 일) 이 값을 클램프하면 과거 동작이 바뀐다 — 그래서 atMs 부재 경로는 클램프를 타지 않는다.
  const result = resolveTurnCreatedAtMs({
    index: 10, // BASE_TIME_MS + 10000 > NOW_MS(=BASE_TIME_MS+50)
    atMs: undefined,
    answeredAtMs: undefined,
    sessionCreatedAtMs: SESSION_CREATED_AT_MS,
    baseTimeMs: BASE_TIME_MS,
    nowMs: NOW_MS,
  });
  assert.equal(result, BASE_TIME_MS + 10_000);
  assert.ok(result > NOW_MS, "합성 경로는 now를 넘어도 클램프되지 않아야 한다(전제 확인)");
});
