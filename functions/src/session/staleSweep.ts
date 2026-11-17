// 2026-11-17 저장소 감사 '꼭 고칠 것 5' — 중간에 버려진 세션(탭 닫기 · `createSession` 커밋 뒤 오프닝 · 문자 단계 실패)이
// 영원히 `active`로 남아 녹음 · 복제 음성이 지워지지 않던 결함. 세션을 `ended`로 바꾸기만 하면 기존 `onSessionEnded`
// (guardrails/index.ts)가 Storage 녹음 · 복제 음성 삭제 · `deletionLogs`를 한다 — 이 모듈은 "언제 끝난 것으로 볼지"만 판정한다.
// 잎 모듈(Firestore 런타임 · 네트워크 · LLM import 0) — `challenge/purge.ts` `selectChallengesToPurge`와 같은 관례.
//
// 기점 · 한도는 기존 판정과 같다 — `realtime/issueBudget.ts` `realtimeSessionTimeExceeded` · sendMessage `isSessionLimitReached`:
// 기점 = `answeredAt ?? createdAt`, 한도 = `maxSessionMs ?? MAX_SESSION_MS`(60분). 기점 + 한도 이후에는 새 실시간 연결 발급이
// 거절되고(issueBudget) sendMessage는 세션을 `limit_reached`로 끝낸다. 그때 이미 연결된 통화는 토큰 메시지 수명
// `TOKEN_EXPIRE_MINUTES`(30분 · 통화 상한 20분 포함)까지 이어질 수 있다 ⇒ 정상 활동의 마지막 = 기점 + 한도 + 30분.
// 유예 `STALE_SESSION_GRACE_MS` 60분 = 그 30분 + 여유 30분.
//
// 판정표(한 세션 · 트랜잭션 안에서 다시 읽은 값으로 판정):
// | # | If | Then |
// |---|---|---|
// | S1 | `status` ≠ "active"(ended · created · 부재) | 유지 — ended = 이미 끝남(재작성 0 · 트리거 중복 0) · created = 클론 대기 문서(범위 밖) |
// | S2 | active ∧ 기점이 숫자 아님(깨진 문서) | 유지(fail-closed — 지우는 쪽으로 추측하지 않는다) |
// | S3 | active ∧ 지금 < 기점 + 한도 + 유예 | 유지 — 정상 진행 중(20분 통화 · 다통화 레그 · 재연결 · 메신저 → 통화 모두 이 안) |
// | S4 | active ∧ 지금 ≥ 기점 + 한도 + 유예 | 종료 — `status: "ended"` · `endReason: "limit_reached"`(기존 허용 사유 · 세션 시간 한도와 같은 뜻) · `endedAt` |
// 다통화(`relay`) · 챌린지(`challengeId`) 세션은 따로 다루지 않는다 — 레그 발급도 같은 issueBudget 세션 시간 예산을 지나므로 S3 · S4가 그대로 맞다.
import { MAX_SESSION_MS } from "../shared/constants";

export const STALE_SESSION_GRACE_MS = 60 * 60 * 1000;
/** 한 번 실행에서 읽는 후보 수 상한(쿼리 `limit`). 남은 세션은 다음 실행이 이어 받는다. */
export const STALE_SESSION_SWEEP_LIMIT = 200;
export const STALE_SESSION_END_REASON = "limit_reached" as const;

export type StaleSessionInput = {
  status?: unknown;
  createdAtMs?: number;
  answeredAtMs?: number;
  maxSessionMs?: unknown;
};

export type StaleSessionVerdict =
  | { action: "end"; row: "S4" }
  | { action: "keep"; row: "S1" | "S2" | "S3" };

export function judgeStaleSession(session: StaleSessionInput, nowMs: number): StaleSessionVerdict {
  if (session.status !== "active") return { action: "keep", row: "S1" };
  const anchorMs = session.answeredAtMs ?? session.createdAtMs;
  if (typeof anchorMs !== "number" || !Number.isFinite(anchorMs)) return { action: "keep", row: "S2" };
  const limitMs =
    typeof session.maxSessionMs === "number" && Number.isFinite(session.maxSessionMs) && session.maxSessionMs > 0
      ? session.maxSessionMs
      : MAX_SESSION_MS;
  if (nowMs < anchorMs + limitMs + STALE_SESSION_GRACE_MS) return { action: "keep", row: "S3" };
  return { action: "end", row: "S4" };
}

/**
 * 쿼리 1차 필터의 `createdAt` 상한. 기점(`answeredAt`)은 항상 `createdAt` 이후라(`submitTranscript`가 생성 시각 밑으로 내리지 않는다)
 * 이 상한보다 늦게 만든 세션은 S4가 될 수 없다 — 쿼리는 넓게, 확정은 `judgeStaleSession`이 한다.
 */
export function staleSessionCreatedBeforeMs(nowMs: number): number {
  return nowMs - MAX_SESSION_MS - STALE_SESSION_GRACE_MS;
}
