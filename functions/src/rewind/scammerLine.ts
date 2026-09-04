// 되감기 드릴이 보여줄 "그 순간 사기범이 한 말" 선택 — 순수 함수 (T84 §15.9.7 G57 수정 분리,
// Architecture.md §15.2.2/§15.9.5 e-2, AC-062/AC-063).
//
// **왜 별도 모듈인가**: `rewind/index.ts`는 `onCall`·firebase-admin에 의존해 node:test에서 부트스트랩
// 없이 부를 수 없다. 이 선택 규칙은 **G57이 지적한 실제 결함 지점**이라 회귀 테스트로 고정해야
// 하므로, 부수효과 없는 로직만 여기로 분리한다(judge.ts·sessionLimits.ts와 동일 관례).
export type ScammerLineMessage = {
  role: "scammer" | "user";
  textMasked: string;
  turnIndex: number;
  /** §55 D3 — 참가자에게 도달하지 않은 문서(부재 = 도달함). 후보에서 제외한다. */
  notSpoken?: true;
};

/**
 * `deceivedMoments[i].turnIndex`가 가리키는 순간의 사기범 대사를 찾는다.
 *
 * | 앵커의 성격 | 만드는 주체 | 이 함수가 집는 것 |
 * |---|---|---|
 * | **사용자 응답 턴** | `analyzeConversation`(대화 발화로 잡히는 순간) | 정렬 순서상 **바로 앞**의 사기범 메시지 |
 * | **사기범 턴 자체** | T84 승격(모의 설치 응낙 — 대응하는 사용자 발화가 없다) | **그 메시지 자신** |
 *
 * ⚠️ **G57**: 예전 구현은 루프를 `position - 1`부터 시작해, 앵커가 사기범 턴이면 **한 칸 앞의 다른
 * 사기범 대사**를 집었다. 시작점을 `position`으로 일반화하면 두 경우가 한 규칙으로 처리되고,
 * 기존 순간은 `messages[position].role === "user"`가 보장되므로 **한 번 더 도는 반복이 절대
 * 매치되지 않아 결과가 한 글자도 바뀌지 않는다**(회귀 0 — 아래 테스트가 고정).
 *
 * turnIndex 산술(−1)이 아니라 **정렬 위치**로 찾는 이유는 채널 전이 등으로 turnIndex가 연속이
 * 아닐 수 있기 때문이다. 못 찾으면 빈 문자열 — 판정은 tactic/correctAction만으로도 계속된다(P-4).
 */
export function pickScammerLineForMoment(
  messages: readonly ScammerLineMessage[],
  momentTurnIndex: number,
): string {
  // ⭐ §55 D3 — 낭독되지 않은 문서는 후보에서 뺀다. 그것을 집으면 되감기가 참가자가 **들은 적 없는
  // 대사**를 "그 순간 사기범이 한 말"로 제시한다. ⛔ `momentTurnIndex` 값은 손대지 않는다 —
  // 매칭은 종전대로 같은 값으로 하고(G350), 상대 순서도 필터로 바뀌지 않는다.
  const visible = messages.filter((m) => !m.notSpoken);
  const position = visible.findIndex((m) => m.turnIndex === momentTurnIndex);
  if (position < 0) return "";
  for (let i = position; i >= 0; i -= 1) {
    if (visible[i].role === "scammer") return visible[i].textMasked;
  }
  return "";
}
