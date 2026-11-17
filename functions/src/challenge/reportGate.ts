// 저장소 감사 C5(2026-11-17) — reportChallenge가 챌린지 상태를 보지 않고 status:"reported"를 써서
// 삭제(deleted)된 챌린지를 되살렸다(purgeChallenge는 문서를 지우지 않고 status만 deleted로 바꾸고
// linkTokenHash를 남기므로, 링크를 가진 사람이 신고하면 update가 그대로 성공했다 → 목록에 다시 뜨고
// 다음 purgeExpiredChallenges가 이미 지운 voice를 또 지우며 deletionLogs를 한 번 더 쓴다).
//
// 판정표 RP — 신고 시점 상태(트랜잭션 안에서 읽은 값)별 동작:
// | 행  | 상태                                                   | 동작 |
// | RP1 | pending · consented · in_progress · completed · expired | 신고 기록(reportedAt · reason · note · status reported) |
// | RP2 | reported                                               | 쓰기 0 — 첫 신고 유지 · 응답은 reported(멱등) |
// | RP3 | deleted                                                | 쓰기 0 · not-found(삭제된 링크) — 되살리지 않는다 |
// | RP4 | 문서 없음                                              | 쓰기 0 · not-found |
// (링크 해석 실패 · 링크 만료는 이 표 앞, reportChallenge의 기존 검사가 거절한다 — 무변경.)
//
// 잎 모듈 — 런타임 import 0(type import만). db는 인자라 메모리 가짜로 시험한다.
import type { Firestore } from "firebase-admin/firestore";
import type { ChallengeDoc, ChallengeStatus } from "../shared/types";

export type ReportDecision = "write" | "already_reported" | "gone";

export function decideReport(status: ChallengeStatus | undefined): ReportDecision {
  if (status === undefined || status === "deleted") return "gone";
  if (status === "reported") return "already_reported";
  return "write";
}

/** 트랜잭션 1회: 상태 read → "write"일 때만 tx.update(ref, fields). fields에는 status:"reported"가 들어 있다. */
export async function reportChallengeInTransaction(
  db: Firestore,
  challengeId: string,
  fields: Partial<ChallengeDoc>,
): Promise<ReportDecision> {
  const ref = db.collection("challenges").doc(challengeId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const decision = decideReport(snap.exists ? (snap.data() as ChallengeDoc).status : undefined);
    if (decision === "write") tx.update(ref, fields);
    return decision;
  });
}
