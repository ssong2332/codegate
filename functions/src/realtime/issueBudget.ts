// SEC-08(외부 보안 점검 2차 · 2026-11-02) — 실시간 통화 연결(자격증명) 발급 예산. 사용자 승인 기준: 통화 구간(레그)별 발급 6회 · 그 구간
// 최초 발급 후 25분.
//
// 전: `createRealtimeCall`은 "본인 세션 + active"만 봐서, 오래된 active 세션으로 몇 번이고 새 Live 토큰(외부 호출)을 받을 수 있었다.
// 후: 외부 호출(`provider.createCallCredentials`) **전에** 세션별 예산 문서(`sessions/{sid}/limits/realtimeCall`)를 트랜잭션으로 읽고 쓴다.
//
// 통화 구간 키(정상 재연결 · 대기 · 다통화 전환이 각자 자기 예산을 갖는다):
// | 세션 | 키 |
// |---|---|
// | 다통화 변형(§142 `relay`) | `leg<legIndex>` — `startCallLeg`가 다음 레그를 열면 새 구간 |
// | 그 밖 | `voice<통화로 넘어간 횟수>` — 처음부터 통화 = `voice0` · 메신저→통화 1번째 = `voice1` · 다시 메신저 갔다 오면 `voice2` |
//
// 판정(한 구간):
// | 상태 | 결과 |
// |---|---|
// | 기록 없음 | 허용 · count 1 · firstIssuedAtMs = 지금 |
// | count < 6 이고 지금 − firstIssuedAtMs < 25분 | 허용 · count + 1 |
// | count ≥ 6 또는 25분 경과 | 거절(resource-exhausted · 외부 호출 0) |
//
// ⭐ 6회 근거 — 정상 통화 한 구간의 발급: 받기 전 미리 받기 1 + 미리 받은 토큰 만료(90초) 재발급 1 + 화면 복귀 재연결(§99) · 새로고침 다시
// 열기(§136) 몇 번. 10분 재연결은 같은 토큰(uses 3)이라 발급을 쓰지 않는다. 25분 = Live 새 세션 창(`NEW_SESSION_EXPIRE_MINUTES`).
// ⛔ 예산 문서는 서버 전용(`firestore.rules` 끝의 `/{document=**}` 전면 거부 — 규칙 변경 0).
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { SessionDoc } from "../shared/types";
import { NEW_SESSION_EXPIRE_MINUTES } from "./geminiProvider";

export const REALTIME_ISSUE_MAX_PER_LEG = 6;
export const REALTIME_ISSUE_WINDOW_MS = NEW_SESSION_EXPIRE_MINUTES * 60_000;

export type RealtimeIssueEntry = { count: number; firstIssuedAtMs: number };

export function realtimeIssueLegKey(
  session: Pick<SessionDoc, "channelHistory">,
  callLeg: { legIndex: number } | undefined,
): string {
  if (callLeg) return `leg${callLeg.legIndex}`;
  const voiceEntries = (session.channelHistory ?? []).filter((entry) => entry.to === "voice").length;
  return `voice${voiceEntries}`;
}

/** 순수 판정 — 허용이면 다음 기록, 거절이면 null. 깨진 기록(숫자 아님)은 거절(fail-closed). */
export function nextRealtimeIssue(entry: unknown, nowMs: number): RealtimeIssueEntry | null {
  if (entry === undefined || entry === null) return { count: 1, firstIssuedAtMs: nowMs };
  const { count, firstIssuedAtMs } = entry as Partial<RealtimeIssueEntry>;
  if (typeof count !== "number" || typeof firstIssuedAtMs !== "number" || !Number.isFinite(count) || !Number.isFinite(firstIssuedAtMs)) {
    return null;
  }
  if (count >= REALTIME_ISSUE_MAX_PER_LEG) return null;
  if (nowMs - firstIssuedAtMs >= REALTIME_ISSUE_WINDOW_MS) return null;
  return { count: count + 1, firstIssuedAtMs };
}

export async function reserveRealtimeIssue(
  db: Firestore,
  sessionRef: DocumentReference,
  legKey: string,
  nowMs: () => number = Date.now,
): Promise<void> {
  const ref = sessionRef.collection("limits").doc("realtimeCall");
  const granted = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const legs = (snap.exists ? (snap.get("legs") as Record<string, unknown> | undefined) : undefined) ?? {};
    const next = nextRealtimeIssue(legs[legKey], nowMs());
    if (!next) return false;
    tx.set(ref, { legs: { [legKey]: next } }, { merge: true });
    return true;
  });
  if (!granted) {
    throw new HttpsError("resource-exhausted", "이 통화는 더 이상 다시 연결할 수 없습니다. 통화를 마치고 결과를 확인해 주세요.");
  }
}
