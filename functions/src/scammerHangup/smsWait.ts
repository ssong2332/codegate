// T192 C3 — 끊기 판정 6행의 서버 항 "문자 대기"(Architecture.md §79.19 (4) · G554).
//
// ⭐ 정의: **문자가 참가자에게 보인 뒤 참가자가 아직 한 번도 말하지 않았다** = 마지막 도착 기록의 사용자 발화 수가 있고
//    `userTurns ≤ last`. S5b 문자의 네 길(폴백 백스톱 · 폴백 모델 마커 · 실시간 모델 도구 · 실시간 백스톱) 모두에서
//    "같은 응답에서 끊으면 문자를 못 본다"와 일치한다(§79.19 (4) 표).
// ⭐ 값은 **서버 도착 기록**에서 나온다 — 실시간에서도 이 항은 클라 주장값이 아니다(입력 `userTurns`만 주장값).
// ⛔ 폴백 사전 · 사후 판정과 실시간 콜러블이 **이 함수 하나**를 부른다(G554 — 조건식 복사 금지).
// ⛔ 대기로 **보지 않는 것**: 아직 안 보낸 필수 문자(백스톱 nudge/wait) · 넛지 안내 1줄 · 선택 문자 게이트가 열려 있음.
// `smsGate.ts`의 `lastArrivalUserTurns`를 값 import하므로 잎 모듈 `decide.ts` 밖에 둔다.
import { lastArrivalUserTurns, type DeliveredSmsRecord } from "../inCallSms/smsGate";

export function isSmsAwaitingUser(delivered: readonly DeliveredSmsRecord[], userTurns: number): boolean {
  const last = lastArrivalUserTurns(delivered);
  // 도착 0건 → 대기 아님. `userTurnsAtArrival` 부재 문서는 0으로 본다(`lastArrivalUserTurns` 규칙 그대로).
  if (last === undefined) return false;
  // `!(userTurns > last)` — 정본 `userTurns ≤ last`와 유한값에서 같고, 비유한값(NaN)은 대기 쪽으로 떨어진다(fail-closed).
  return !(userTurns > last);
}
