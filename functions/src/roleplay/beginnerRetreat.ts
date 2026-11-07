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
import { GIVE_UP_POLITE_ENDING } from "./screenAction";

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
  "(초급 — 상대가 방금 의심하거나 거절하거나 직접 확인하겠다고 했다. 이번 대답에서는 이 지시가 위 [캐릭터] · [말투/톤] · [대화 방식] · [진행 강제]보다 우선한다. 상대가 확인해 보겠다는 뜻을 그대로 받아들이며 짧게 물러서라. 전화를 받을 수 없다거나 메시지로만 이야기하자는 말처럼 확인을 막거나 비밀로 하라는 말, 새 이유나 핑계, 서운함이나 죄책감 호소, 새 금액이나 낮춘 요구를 꺼내지 마라. 아직 무엇을 해 달라고 말한 적이 없다면 그 요구만 짧게 한 문장으로 말해 두고 물러서라.)";

/** B4 지시(서버 소유). */
export const BEGINNER_WRAP_UP_INSTRUCTION =
  "(초급 — 상대가 의심이나 거절을 되풀이했다. 이번 대답에서는 이 지시가 위 [캐릭터] · [말투/톤] · [대화 방식] · [진행 강제]보다 우선하고, 요구를 반드시 한다는 항목도 이번 대답에는 적용하지 않는다. 요구를 거두고 짧게 마무리하라. 앞에서 요구를 말한 적이 없더라도 금액 · 계좌 · 송금 이야기는 꺼내지 말고, 확인을 막는 말, 새 이유, 서운함 호소도 꺼내지 마라. [진행 강제]의 끝내기 항목에 끝내는 방법이 적혀 있으면 그대로 끝내라.)";

export function beginnerRetreatInstruction(kind: BeginnerRetreatKind | null): string | undefined {
  if (kind === "retreat") return BEGINNER_RETREAT_INSTRUCTION;
  if (kind === "wrapUp") return BEGINNER_WRAP_UP_INSTRUCTION;
  return undefined;
}

// ── D4 3차(2026-11-08 Edge 재시험 3 · 라이브 main 1d61b7b5 · #523 배포 뒤 — 같은 꼴 재발) ──────────────────────────────
// 재시험 대사 3줄은 판정표 B로 물러섬 → 마무리 → 마무리로 분류되고(`beginnerRetreatTurn.test.ts`) 지시는 그 턴 프롬프트의 턴 지시 자리에 실린다
// (`roleplay/index.ts` · 주 모델 Claude · 2차 Gemini · 3차 Groq 모두 같은 `systemPrompt` — `llm/claudeClient.ts` · `groqClient.ts` `groqSystemPrompt`).
// 그런데도 모델은 확인 차단("지금 전화하면 안 받을 거야 … 톡으로만") · 첫 요구("200만 원만 먼저")를 냈다. 조립된 프롬프트에 남은 반대 문장(추정 원인):
//   [캐릭터] "상대가 걸어도 받을 수 없다" · [대화 방식] "의심하면 해명 · 되묻기 · 압박으로 목적지로 되돌린다" — 초급 블록의 예외 대상이 아니었다.
//   초급 블록 "요구는 초급에서도 반드시 한다" + 마무리 지시 "요구를 다시 말하지 말고" — 아직 요구를 말하지 않은 턴에는 "다시"가 성립하지 않는다.
// ⇒ (1) 위 두 지시가 그 블록들보다 우선한다고 적고 "다시"를 뺐다. (2) 모델 종류와 무관하게 서버가 대답을 검사해(판정표 V) 어긴 대답은 물러섬 1줄로 바꾼다.
//
// 판정표 V(초급 물러섬 · 마무리 턴의 대답 검사 — 텍스트 턴 `sendMessage` · 대사 손질의 마지막 단계):
// | # | If | Then |
// |---|---|---|
// | V1 | 판정표 B 결과가 없다(B1 · B2) | 무변경 |
// | V2 | `retreat` · 대답에 확인 차단(`VERIFY_BLOCK`) · 죄책감 · 재설득(`GUILT_PLEA`)이 있다 | 물러섬 1줄로 교체 · 칩 떼기 |
// | V3 | `wrapUp` · 대답에 V2 표현 또는 금액 · 계좌 · 송금 요구(`MONEY_DEMAND`) · 시간 재촉(`TIME_PRESSURE`)이 있다 | 물러섬 1줄로 교체 · 칩 떼기 |
// | V4 | 그 밖 | 무변경 |
// (에뮬레이터 실측 2026-11-08 — 마무리 턴에 "지금 당장, 더 늦으면 큰일난다."가 V3를 통과했다 → 재촉도 마무리 턴에서는 막는다.)
// ⛔ `retreat` 턴의 첫 요구 한 문장 · 시간 재촉은 막지 않는다(초급 블록 "요구는 초급에서도 반드시 한다" — 확인 차단이 함께 있으면 V2가 이긴다).
// ⛔ 끊기 신호(`endCall`)는 바꾸지 않는다 — 대사만 바꾼다(끝내는 방법은 [진행 강제]의 끊기 슬롯이 정한다).
// 말투는 모델 대답의 어미로 고른다(`screenAction.ts` `GIVE_UP_POLITE_ENDING` — 이체 화면 포기 1줄과 같은 판정).

export const VERIFY_BLOCK =
  /(?:전화|통화)[^.?!\n]{0,12}(?:안\s*(?:돼|되|받)|못\s*(?:받|해)|받을\s*수\s*없|하지\s*마)|(?:톡|카톡|메시지|문자|채팅)(?:으로|로)만|확인(?:하지|은|하려고\s*하지)\s*마|비밀로|아무(?:한테|에게|도)\s*(?:말|얘기|알리)/;
export const GUILT_PLEA = /믿어\s*줘|못\s*믿|안\s*믿어\s*줘|왜\s*(?:내\s*말|나를|날)|서운|섭섭|너무해|진짜\s*나(?:야|잖아|라니까)|맞(?:다니까|잖아|아\s*진짜)|딸이잖아|아들이잖아|제발/;
export const MONEY_DEMAND = /\d[\d,]*\s*(?:만\s*)?원|만\s*원|계좌|송금|이체|입금|보내\s*(?:줘|줄래|주라|주면|줄\s*수|달)|부쳐\s*(?:줘|주)/;

export const TIME_PRESSURE = /지금\s*당장|당장\s*(?:보내|해)|큰일|늦으면|급(?:해|하|한)|빨리|서둘/;

export const BEGINNER_RETREAT_REPLY = {
  casual: "알았어. 그럼 직접 확인해 봐.",
  polite: "네, 알겠습니다. 그럼 직접 확인해 보세요.",
} as const;

export type BeginnerRetreatReplyCheck = { text: string; replaced: false } | { text: string; replaced: true; reason: "verify_block" | "guilt" | "money_demand" | "time_pressure" };

/** 판정표 V. */
export function guardBeginnerRetreatReply(kind: BeginnerRetreatKind | null, replyText: string): BeginnerRetreatReplyCheck {
  if (!kind) return { text: replyText, replaced: false }; // V1
  const reason = VERIFY_BLOCK.test(replyText)
    ? ("verify_block" as const)
    : GUILT_PLEA.test(replyText)
      ? ("guilt" as const)
      : kind === "wrapUp" && MONEY_DEMAND.test(replyText)
        ? ("money_demand" as const)
        : kind === "wrapUp" && TIME_PRESSURE.test(replyText)
          ? ("time_pressure" as const)
          : undefined;
  if (!reason) return { text: replyText, replaced: false }; // V4
  const text = GIVE_UP_POLITE_ENDING.test(replyText) ? BEGINNER_RETREAT_REPLY.polite : BEGINNER_RETREAT_REPLY.casual;
  return { text, replaced: true, reason }; // V2 · V3
}
