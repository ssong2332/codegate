// §55 D3 — "말하지 않은 첫 대사" 마크 대상 선택 규칙 (순수 함수, docs/Architecture.md §55.4 (1) 5).
//
// **왜 별도 모듈인가**: `submitTranscript.ts`는 `onCall`·firebase-admin에 의존해 node:test에서
// 부트스트랩 없이 부를 수 없다. 마크 대상 판정은 **G350/G351이 걸린 지점**이라 회귀 테스트로
// 고정해야 하므로, 부수효과 없는 규칙만 여기로 분리한다(rewind/scammerLine.ts·judge.ts·
// sessionLimits.ts와 동일 관례).
export type OpeningMarkCandidate = { role: "scammer" | "user"; turnIndex: number };

/**
 * 전사 제출 트랜잭션에서 `notSpoken: true`를 붙일 문서의 **위치**를 고른다(없으면 `-1`).
 *
 * | `openingNotSpoken` | 결과 |
 * |---|---|
 * | `true` | `turnIndex === 0 && role === "scammer"` 인 **첫 문서**의 위치 |
 * | `false`·부재·그 밖의 값 | **`-1`**(종전 동작 — 아무것도 마크하지 않는다) |
 *
 * ⛔ **G351** — 이 함수는 "전사가 제출됐다"는 사실만으로 마크하지 않는다. 판별자는 **클라가 보낸
 * 플래그 하나**뿐이다. Gemini로 시작했다가 폴백으로 강등된 세션에서는 오프닝이 **실제로 표시·
 * 재생되므로**, 서버가 추론하면 참가자가 본 대사를 리플레이에서 지운다.
 *
 * ⛔ **G350** — 반환값을 이어 붙일 `turnIndex`(= `historySnap.size`) 계산에 반영하지 말 것. 이
 * 함수는 **무엇을 마크할지**만 답하고 **문서 수에는 관여하지 않는다**(실시간 앵커 `+1`이 이 행에
 * 매달려 있다, G348).
 */
export function findOpeningToMarkNotSpoken(
  messages: readonly OpeningMarkCandidate[],
  openingNotSpoken: boolean | undefined,
): number {
  if (openingNotSpoken !== true) return -1;
  return messages.findIndex((m) => m.turnIndex === 0 && m.role === "scammer");
}
