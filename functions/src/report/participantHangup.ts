// 사용자 결정 2026-11-07(답 원문 "방어로 집계 (권장)" — 메인 전달) — 참가자가 사기범 통화를 먼저 끊은 것(`relay.hungUpBy`)을 잘 대처한 행동으로 리포트에 싣는다.
// 순수 함수(Firestore 0 — 호출부 `generateReportCore.ts`가 이미 읽은 세션 · 메시지 · 최종 속은 순간을 넘긴다).
//
// ⛔ 금지: 속은 순간 · `wasDeceived` · 방어 등급 입력을 바꾸지 않는다 — "끊기 전에 이미 속았으면 속음 판정은 그대로"(결정 원문 조건).
// ⚠️ 한계(투명 고지): 서버는 끊은 **시각**을 남기지 않는다(`callLegs/legPlan.ts` `planLegHangup` — relay 상태만). 그래서 끊은 시각 = 그 통화(레그)의
//    마지막 대사 시각으로 본다. `hungUpBy`는 다통화 변형(카드사 고급)에만 있다 — 단일 통화 세션의 끊기는 서버 기록이 없어 이 표 밖이다
//    (세션 종료 사유 필드는 "훈련 종료" 버튼도 같은 값이고 리포트가 읽지 않는다 — G511).
//
// | # | If | Then |
// |---|---|---|
// | P1 | `relay.hungUpBy !== "participant"` | 없음 |
// | P2 | 끊은 시각 = `legIndex === relay.legEnded`인 마지막 메시지 시각(그런 메시지가 없으면 마지막 메시지 · 메시지 0이면 시각 없음) | — |
// | P3 | 속은 순간 중 시각이 끊은 시각 이하인 것이 있다(시각을 읽을 수 없는 순간은 "끊기 전"으로 본다 · 끊은 시각이 없으면 순간이 하나라도 있으면) | 없음 — 속음 판정 그대로 |
// | P4 | 그 밖 | `{ legIndex, timeLabel? }` — 리포트 "잘 대처함 · 먼저 전화를 끊음" |

export type HangupMessage = { createdAtMs: number; legIndex?: number };

function parseSeconds(timeLabel: string | undefined): number | null {
  const m = typeof timeLabel === "string" ? timeLabel.trim().match(/^(\d+)초 시점$/) : null;
  return m ? Number(m[1]) : null;
}

export function resolveParticipantHangup(input: {
  relay?: { hungUpBy?: "participant"; legEnded?: number; legIndex?: number };
  messages: readonly HangupMessage[];
  deceivedMoments: readonly { timeLabel: string }[];
  baseMs: number;
}): { legIndex: number; timeLabel?: string } | undefined {
  const { relay, messages, deceivedMoments, baseMs } = input;
  if (relay?.hungUpBy !== "participant") return undefined; // P1
  const legIndex = relay.legEnded ?? relay.legIndex ?? 0;
  const legMessages = messages.filter((m) => m.legIndex === legIndex);
  const pool = legMessages.length > 0 ? legMessages : messages;
  const lastMs = pool.reduce<number | undefined>((acc, m) => (acc === undefined || m.createdAtMs > acc ? m.createdAtMs : acc), undefined); // P2
  if (lastMs === undefined) {
    return deceivedMoments.length > 0 ? undefined : { legIndex }; // P3 · P4(시각 없음)
  }
  const hangupSec = Math.max(0, Math.round((lastMs - baseMs) / 1000));
  const deceivedBefore = deceivedMoments.some((moment) => {
    const sec = parseSeconds(moment.timeLabel);
    return sec === null || sec <= hangupSec;
  });
  if (deceivedBefore) return undefined; // P3
  return { legIndex, timeLabel: `${hangupSec}초 시점` }; // P4
}
