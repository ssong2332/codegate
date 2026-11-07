// D4 2차(2026-11-07 Edge 재시험 2 · 라이브 main 143c1cfa · #513 배포 뒤) — 자녀 사칭 카카오톡 초급(메신저)에서 참가자가 의심
// ("진짜 지수 맞아? … 원래 번호로 전화해 볼게") · 거절("안 믿어 … 돈 못 보내")을 했는데 사기범이 새 핑계 · 죄책감 호소 · "일단 200만 원만"
// 새 요구를 이어 갔고, 셋째 거절에서야 물러났다(#513 초급 블록 규칙보다 한 단계 늦음).
//
// 왜 블록만으로 부족했나(추정 — 확인 방법은 아래): 초급 블록은 시스템 프롬프트 중간(가드레일 앞)에 한 번 실리고, 그 뒤 같은 턴의
// 턴 지시 자리에는 `repeatBreak.ts`의 "다른 수법이나 다른 요구, 다른 이유를 꺼내라"가 붙을 수 있다(직전 두 사기범 대사가 비슷하면
// — 초급 메신저의 짧은 하소연 대사가 이 조건에 걸리기 쉽다). 더 가까운 자리의 반대 지시와 페르소나 [말투/톤]의 구체 예시("왜 내 말을
// 못 믿어")가 이겼다. ⇒ 판정은 모델이 아니라 서버가 하고(결정적 층), 그 턴에만 1줄을 턴 지시 자리에 둔다.
// 확인 방법: 같은 대본(의심 → 거절)을 초급으로 프로브해 `[§104] sendMessage 반복 차단 지시` 로그가 그 턴에 찍혔는지 본다(실 키 — 승인 필요).
//
// 판정표 B(초급 물러섬 턴 지시 — 텍스트 턴 `sendMessage`):
// | # | If | Then |
// |---|---|---|
// | B1 | 난이도가 초급이 아니다 | 지시 없음(종전 그대로 — 중급 · 고급 무변경) |
// | B2 | 초급 · 이번 참가자 말에 거절 · 의심 · 확인 기색(`PARTICIPANT_PUSHBACK`)이 없다 | 지시 없음 |
// | B3 | 초급 · 이번 말에 기색이 있고 앞선 참가자 말에는 없었다 | `retreat` — 물러섬 1줄 · 반복 차단 지시는 싣지 않는다 |
// | B4 | 초급 · 이번 말에 기색이 있고 앞선 참가자 말에도 있었다 | `wrapUp` — 마무리 1줄 · 반복 차단 지시는 싣지 않는다 |
// ⛔ 숫자 · 서수 0(G130 — 순서는 서버가 셌다) · 따옴표 대사 예시 0(턴 지시 스캔 게이트 대상 — `scenarios.test.ts` `turnInstructionSources`).
// ⛔ 끝내는 방법은 [진행 강제]의 끊기 슬롯이 정한다(SIGNAL 허용 턴이면 신호 · NONE이면 끝내겠다는 말 없이 요구만 거둔다) — 이 줄은 새 끝내기 경로를 만들지 않는다.
import type { DifficultyLevel } from "../shared/difficulty";
import { PARTICIPANT_PUSHBACK } from "./signalConsistency";

export type BeginnerRetreatKind = "retreat" | "wrapUp";

/** 판정표 B. `priorUserTexts` = 이번 말 **전**까지의 참가자 말(저장된 이력). */
export function decideBeginnerRetreat(
  difficultyLevel: DifficultyLevel,
  currentUserText: string,
  priorUserTexts: readonly string[],
): BeginnerRetreatKind | null {
  if (difficultyLevel !== "beginner") return null; // B1
  if (!PARTICIPANT_PUSHBACK.test(currentUserText)) return null; // B2
  return priorUserTexts.some((text) => PARTICIPANT_PUSHBACK.test(text)) ? "wrapUp" : "retreat"; // B4 : B3
}

/** B3 지시(서버 소유). */
export const BEGINNER_RETREAT_INSTRUCTION =
  "(초급 — 상대가 방금 의심하거나 거절하거나 직접 확인하겠다고 했다. 이번 대답에서는 새 이유나 핑계, 서운함이나 죄책감 호소, 새 금액이나 낮춘 요구, 확인을 막거나 비밀로 하라는 말을 꺼내지 마라. 상대가 확인해 보겠다는 뜻을 그대로 받아들이며 짧게 물러서라. 아직 무엇을 해 달라고 말한 적이 없다면 그 요구만 짧게 한 문장으로 말해 두고 물러서라.)";

/** B4 지시(서버 소유). */
export const BEGINNER_WRAP_UP_INSTRUCTION =
  "(초급 — 상대가 의심이나 거절을 되풀이했다. 이번 대답에서 요구를 거두고 짧게 마무리하라. 금액 · 계좌 · 송금 같은 요구를 다시 말하지 말고, 새 이유나 서운함 호소도 꺼내지 마라. [진행 강제]의 끝내기 항목에 끝내는 방법이 적혀 있으면 그대로 끝내라.)";

export function beginnerRetreatInstruction(kind: BeginnerRetreatKind | null): string | undefined {
  if (kind === "retreat") return BEGINNER_RETREAT_INSTRUCTION;
  if (kind === "wrapUp") return BEGINNER_WRAP_UP_INSTRUCTION;
  return undefined;
}
