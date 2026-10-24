// §129 에뮬 D2(사용자 결정 2026-10-24 ㉠ "받은 시각 기준") — 통화를 받은 시각(`answeredAt`) 기록 · 리포트 시각 기준을 정하는 순수 판정.
//
// 재현(에뮬레이터 · 검찰 고급): 통화 시계 2분대에 응한 순간이 리포트에 "3분 48초"로 나왔다 — 리포트가 세션 **생성** 시각을 기준으로 써서
// 준비 · 통화 전 안내 · 벨 시간이 더해졌다. 또 폴백 경로 `answeredAt`이 받은 시각이 아니라 첫 사용자 발화 시각이었다.
//
// ── 표 A: 리포트 시각 기준(`resolveReportTimeBaseMs`) ──────────────────────────────────────────
// | # | If | Then |
// |---|---|---|
// | A1 | 처음부터 통화인 세션(`channel` 부재 · "voice" ∧ 메신저를 거친 기록 없음) ∧ `answeredAt` 있음 | `answeredAt` |
// | A2 | 그 밖(메신저 세션 · 메신저에서 넘어온 통화 · 받은 기록 없음) | `createdAt`(종전) |
// - 메신저 세션을 A2로 두는 이유: 메신저의 `answeredAt`은 받은 시각이 아니라 첫 답장 시각이다 — 기준으로 쓰면 그 전에 일어난 일(링크 열기 등)이 모두 0초가 된다.
//
// ── 표 B: 폴백 첫 턴의 받은 시각(`answeredAtFromClient`) ───────────────────────────────────────
// | # | If | Then |
// |---|---|---|
// | B1 | 이미 `answeredAt`이 있다 | 그대로(이 함수는 부르지 않는다) |
// | B2 | 처음부터 통화인 세션이 아니다 | 이번 발화 시각(종전) |
// | B3 | 클라 값(`answeredElapsedMs`)이 없거나 유한한 0 이상의 수가 아니다 | 이번 발화 시각(종전) |
// | B4 | 그 외 | `max(createdAt, 이번 발화 시각 − answeredElapsedMs)` |
// ⚠️ 클라 주장값이다(OQ-A120과 같은 등급) — 세션 생성 시각보다 앞으로는 가지 않게 아래로 막는다. 늘어난 경과는 서버 시간 한도(answeredAt 기점)에도
//    그대로 들어간다(통화 타이머와 같은 기점 — OQ-U8).
// ⛔ 잎 모듈(타입 import만).
import type { SessionDoc } from "../shared/types";

type SessionTimeView = Pick<SessionDoc, "channel" | "channelHistory">;

/** 처음부터 통화인 세션인가(메신저를 거친 적이 없다). */
export function isVoiceOriginSession(session: SessionTimeView): boolean {
  const viaMessenger = (session.channelHistory ?? []).some((entry) => entry.from === "messenger" || entry.to === "messenger");
  return (session.channel ?? "voice") === "voice" && !viaMessenger;
}

/** 표 A. */
export function resolveReportTimeBaseMs(
  session: SessionTimeView & { createdAt: { toMillis(): number }; answeredAt?: { toMillis(): number } },
): number {
  if (isVoiceOriginSession(session) && session.answeredAt) return session.answeredAt.toMillis(); // A1
  return session.createdAt.toMillis(); // A2
}

/** 표 B(B2~B4) — 돌려주는 값은 ms. */
export function answeredAtFromClient(
  session: SessionTimeView,
  createdAtMs: number,
  userWriteMs: number,
  answeredElapsedMs: unknown,
): number {
  if (!isVoiceOriginSession(session)) return userWriteMs; // B2
  if (typeof answeredElapsedMs !== "number" || !Number.isFinite(answeredElapsedMs) || answeredElapsedMs < 0) return userWriteMs; // B3
  return Math.min(userWriteMs, Math.max(createdAtMs, userWriteMs - answeredElapsedMs)); // B4
}
