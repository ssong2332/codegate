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
