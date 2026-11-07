// 사용자 결정 2026-11-07 — 참가자가 사기범 통화를 먼저 끊은 것을 잘 대처한 행동으로 리포트에 싣는다(메인 전달).
//   ① 답 원문 "방어로 집계 (권장)" — 다통화(`relay.hungUpBy`): 끊기 전에 응한 순간이 없으면 방어로 집계 · 이미 속았으면 속음 그대로.
//   ② 답 원문 "단일 통화도 집계 (권장)" — 단일 통화도 같은 블록. 이 때문에 G511(리포트는 종료 사유를 읽지 않는다)을 좁혔다:
//      **이 모듈 1곳만** 종료 사유를 읽고, 그 값은 이 블록 하나에만 쓴다. 속음 판정(`wasDeceived` · 속은 순간 · 방어 등급 입력)에는 계속 쓰지 않는다.
// 순수 함수(Firestore 0 — 호출부 `generateReportCore.ts`가 이미 읽은 세션 · 메시지 · 최종 속은 순간을 넘긴다).
//
// 종료 사유 허용목록(`session/endReason.ts` `END_SESSION_ALLOWED_REASONS`)과 이 블록:
// | 기록 값 | 클라가 보내는 경우(`src/lib/session/callEnding.ts` · 종료 화면) | 이 블록 |
// |---|---|---|
// | `scammer_ended` | 사기범 끊기 승인(서버 표식이 있을 때만 이 값으로 남는다) | 없음 |
// | `limit_reached` | 시간 · 턴 한도 | 없음 |
// | `user_ended` | 참가자의 통화 종료 버튼 · ⚠️ "훈련 종료" 버튼 · ⚠️ 원격 끊김(`remote` — 연결 끊김 등은 사유를 주장하지 않아 종료 화면 기본값) | 아래 S2 조건이면 있음 |
// | 부재 | 옛 세션 | 없음 |
// ⚠️ 한계(투명 고지): `user_ended` 하나로는 통화 종료 버튼 · 훈련 종료 버튼 · 원격 끊김(오류)을 가를 수 없다 — 서버가 받는 값이 같다.
//    가르려면 종료 요청에 새 값이 필요하다(통화 화면 몫 · 이 PR 범위 밖).
// ⚠️ 끊은 시각 필드는 서버에 없다 — 끊은 통화의 마지막 대사 시각으로 근사한다.
//
// | # | If | Then |
// |---|---|---|
// | S1 | 다통화 세션 | `relay.hungUpBy === "participant"`일 때만(아래 P2 · P3 · P4) — 그 밖 없음 |
// | S2 | 단일 통화 세션 ∧ 종료 사유 `user_ended` ∧ 세션 채널이 메신저가 아님 ∧ 참가자 발화 ≥ 1 | P2 · P3 · P4(끊은 통화 = 레그 0 · 끊은 시각 = 마지막 메시지) |
// | S3 | 그 밖(`scammer_ended` · `limit_reached` · 부재 · 메신저 종료 · 0턴) | 없음 |
// | P2 | 끊은 시각 = 끊은 레그의 마지막 메시지 시각(그 레그 메시지가 없으면 마지막 메시지 · 메시지 0이면 시각 없음) | — |
// | P3 | 끊은 시각 이하의 속은 순간이 있다(시각을 읽을 수 없는 순간은 끊기 전으로 본다 · 끊은 시각이 없으면 순간이 하나라도 있으면) | 없음 — 속음 판정 그대로 |
// | P4 | 그 밖 | `{ legIndex, timeLabel? }` — 리포트 "잘 대처함 · 먼저 전화를 끊음" |
import type { SessionDoc } from "../shared/types";

export type HangupMessage = { createdAtMs: number; legIndex?: number };

function parseSeconds(timeLabel: string | undefined): number | null {
  const m = typeof timeLabel === "string" ? timeLabel.trim().match(/^(\d+)초 시점$/) : null;
  return m ? Number(m[1]) : null;
}

/** S1 · S2 · S3 — 끊은 레그 번호(없으면 이 블록 0). */
function hungUpLeg(
  session: Pick<SessionDoc, "relay" | "endReason" | "channel">,
  isMultiCall: boolean,
  userTurnCount: number,
): number | undefined {
  if (isMultiCall) {
    const relay = session.relay;
    return relay?.hungUpBy === "participant" ? (relay.legEnded ?? relay.legIndex ?? 0) : undefined; // S1
  }
  if (session.endReason === "user_ended" && session.channel !== "messenger" && userTurnCount >= 1) return 0; // S2
  return undefined; // S3
}

export function resolveParticipantHangup(input: {
  session: Pick<SessionDoc, "relay" | "endReason" | "channel">;
  isMultiCall: boolean;
  messages: readonly (HangupMessage & { role?: "scammer" | "user" })[];
  deceivedMoments: readonly { timeLabel: string }[];
  baseMs: number;
}): { legIndex: number; timeLabel?: string } | undefined {
  const { session, isMultiCall, messages, deceivedMoments, baseMs } = input;
  const userTurnCount = messages.filter((m) => m.role === "user").length;
  const legIndex = hungUpLeg(session, isMultiCall, userTurnCount);
  if (legIndex === undefined) return undefined;
  const legMessages = isMultiCall ? messages.filter((m) => m.legIndex === legIndex) : [];
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
