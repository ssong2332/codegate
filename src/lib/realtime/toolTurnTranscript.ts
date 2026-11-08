// ⭐ §117(2026-10-23 사용자 실기 신고 *"유사한 내용을 2번씩 말하는데 대화 리포트에서는 안 보이네"* · DECISIONS #232 · UX D-153)
// 한 모델 턴 안에서 도구 호출(BLOCKING — 결과를 기다리는 동안 소리가 멈춘다)을 사이에 둔 두 발화의 전사 경계.
//
// 원인: 출력 전사는 `turnComplete`까지 한 버퍼에 모여 말풍선 1개가 된다. 도구 앞 발화와 도구 뒤 발화가 공백 하나로 붙어
// "한 번 길게 말한 것"처럼 보였다(운영 세션 f7047187 — 참가자에게는 사이에 멈춤이 있는 두 번의 말로 들렸다).
//
// 판정(둘 다 남긴다 · 정확히 하나로 합치지 않는다):
// | # | If | Then |
// |---|---|---|
// | 1 | 도구 호출 시점에 이 턴의 사기범 전사가 비어 있다 | 표시 없음(도구 뒤 발화가 턴의 첫 말) |
// | 2 | 도구 호출 시점에 전사가 있다 → 도구 뒤 첫 글자 조각이 온다 | 그 조각 앞에 줄바꿈 1개 — **같은 턴(문서 1개 · 턴 수 +1 그대로)** 안의 두 문단 |
// | 3 | 표시가 있는데 공백 조각만 온다 | 표시 유지(다음 글자 조각에서 2행) |
// | 4 | 도구 뒤 글자 조각 없이 턴이 닫힌다(`turnComplete` · 끼어들기 · close) | 표시 버림(호출부가 flush에서 초기화 — 꼬리 줄바꿈 0) |
// 왜 말풍선 2개로 나누지 않는가: 사기범 전사 flush 수가 문자 게이트(`scammerTranscriptTurns`) · 앵커 턴(G21) · 리포트 짝짓기의 단위다(§82.3.4 G539).
// 한 턴을 둘로 세면 그 셋이 한 칸씩 밀린다. 문단 구분은 수를 바꾸지 않고 "두 번 말했다"를 리포트에 그대로 보인다.

/** 판정표 1 · 2행 — 도구 호출 시점에 이 턴의 전사가 이미 있으면 경계 표시를 건다. */
export function shouldMarkToolBoundary(scammerBuffer: string): boolean {
  return scammerBuffer.trim().length > 0;
}

/** 출력 전사 조각을 버퍼에 붙인다(판정표 2 · 3행). 표시가 없으면 종전과 같은 단순 이어 붙이기다. */
export function appendScammerChunk(
  scammerBuffer: string,
  chunk: string,
  boundaryPending: boolean,
): { buffer: string; boundaryPending: boolean } {
  if (!boundaryPending || !chunk.trim()) return { buffer: scammerBuffer + chunk, boundaryPending };
  return { buffer: `${scammerBuffer.trimEnd()}\n${chunk.trimStart()}`, boundaryPending: false };
}

/**
 * ⭐ 2026-11-08(라이브 재시험 7 · 사용자 결정 "고치기" — 문자 위치) — 문자 · 확인 오퍼 앵커 입력(서버로 넘기는 사기범 전사 수).
 * 앵커 = "문자가 도착한 시점까지 사기범 문서 수"(`functions/src/inCallSms/buildDoc.ts` `realtimeAnchorScammerTurn`). 도구 호출 · 말하는 도중 "보냈다" 주장은
 * **사기범이 한 턴을 말하는 도중**에 오므로, 이미 말했지만 아직 flush되지 않은 그 턴도 곧 문서 1개가 된다(위 표 2행 — 도구 뒤 말은 같은 문서).
 * 그 턴을 빼면 리포트 · 리플레이에서 문자가 한 대사 앞에 놓였다(재시험 7: ⑥과 함께 온 문자 → ⑤ 뒤 · ⑨ 직전에 온 문자 → ⑦ 뒤).
 *
 * | # | If | Then |
 * |---|---|---|
 * | K6 | 이 턴에 이미 말한 사기범 대사가 있다(사고 문장 · 금지 표식을 거른 뒤 비어 있지 않음) | 세션 누적 + 1 |
 * | K7 | 없다(턴 시작 직후 도구 · 발화 뒤 백스톱) | 세션 누적 그대로 |
 * 사용자 발화 수의 같은 보정(`claimedUserTurns` — 응답 중인 발화 +1)과 같은 규칙이다.
 */
export function claimedScammerTranscriptTurns(sessionScammerTurns: number, currentTurnSpoken: boolean): number {
  return sessionScammerTurns + (currentTurnSpoken ? 1 : 0);
}
