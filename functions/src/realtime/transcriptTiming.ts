// §57.2 (6) 처방 D1 — 전사 제출 시각 계산 (순수 함수, docs/Architecture.md §57.2 (6)).
//
// **왜 별도 모듈인가**: `submitTranscript.ts`는 `onCall`·firebase-admin에 의존해 node:test에서
// 부트스트랩 없이 부를 수 없다. 시각 계산은 D1이 회귀 테스트로 고정해야 할 규칙이라, 부수효과
// 없는 계산만 여기로 분리한다(`openingMark.ts`와 동일 관례).
//
// **배경(T-1, §57.2)**: 실시간 경로의 `messages.createdAt`은 실제 발화 시각이 아니라 "전사 제출
// 시각(baseTimeMs) + 턴 인덱스 × 1초"로 합성된 값이었다 — 리포트 타임라인 라벨이 실제 통화
// 타이머보다 커지는 원인이었다(관측 108초 타이머 vs 148/150초 라벨). 이 함수는 클라가 참가자
// 시계의 상대 시각(`answeredAtMs`·`turns[].atMs`)을 함께 보낸 경우에만 그 값을 쓰고, **둘 다
// 없으면 기존 합성 로직을 한 글자도 바꾸지 않는다**(무백필 · 과거 세션·과거 클라이언트 무영향).
export type ResolveTurnCreatedAtMsInput = {
  /** 이 턴의 `turns` 배열 내 위치(0-base) — 부재 시 합성 로직의 `i`와 동일하게 쓰인다. */
  index: number;
  /** 참가자 시계 기준 상대 ms(받기 시각 대비). 부재 = 현행 합성 로직 그대로. */
  atMs: number | undefined;
  /** 참가자가 "받기"를 누른 시각(클라 타임스탬프). 부재 = `sessionCreatedAtMs`로 대체. */
  answeredAtMs: number | undefined;
  /** `session.createdAt`(ms) — 기준점 폴백이자 클램프 하한. */
  sessionCreatedAtMs: number;
  /** 전사 제출 시각(ms, 트랜잭션 시작 시 1회 캡처) — 현행 합성 로직의 앵커. */
  baseTimeMs: number;
  /** 클램프 상한(ms) — 통상 `baseTimeMs`와 같은 시점. */
  nowMs: number;
};

/**
 * 전사 1턴의 `createdAt`(ms)을 정한다.
 *
 * | `atMs` | 결과 |
 * |---|---|
 * | 부재 | **현행 합성 로직 그대로**: `baseTimeMs + index * 1000`(클램프 없음 — 과거 동작과 100% 동일) |
 * | 존재 | `(answeredAtMs ?? sessionCreatedAtMs) + atMs`를 **`[sessionCreatedAtMs, nowMs]`로 클램프** |
 *
 * ⛔ **클램프는 `atMs`가 있을 때만 적용된다.** 합성 경로(`atMs` 부재)를 클램프하면 "턴마다 1초씩
 * 벌어진다"는 기존 산식이 `nowMs`(≈`baseTimeMs`) 근처로 뭉개져 과거 동작을 바꾼다 — 이는
 * "부재 시 100% 동일"이라는 D1의 하드 요구를 어긴다.
 */
export function resolveTurnCreatedAtMs(input: ResolveTurnCreatedAtMsInput): number {
  const { index, atMs, answeredAtMs, sessionCreatedAtMs, baseTimeMs, nowMs } = input;
  if (atMs === undefined) {
    return baseTimeMs + index * 1000;
  }
  const base = answeredAtMs ?? sessionCreatedAtMs;
  const raw = base + atMs;
  return Math.min(Math.max(raw, sessionCreatedAtMs), nowMs);
}
