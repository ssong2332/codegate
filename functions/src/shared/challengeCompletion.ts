// T181 C1 — 챌린지 완료 전이(docs/Architecture.md §69.3 (3) · G424~G426 · DECISIONS #112).
//
// 완료의 정의(정본 §69.3 (2)): "그 챌린지의 체험 세션이 `ended`가 됐다" — 종료 사유 무관(받기 전
// 거절 포함). 리포트 존재 · 결과 공유 여부와 무관하다.
//
// ⛔ G424 — 전이는 `onSessionEnded` 트리거 1곳에서만 부른다(guardrails/index.ts). endSession ·
//    sendMessage · generateReportCore · setChallengeResultSharing에 복제하지 않는다.
// ⛔ G425 — 조건부 · 트랜잭션 · 멱등. consented · in_progress → completed만. 쓰는 필드는 status 1개.
//    reported · deleted · completed · pending · expired는 덮어쓰지 않는다. endReason(클라 주장값)으로
//    분기하지 않는다. voiceId · retentionDeleteAt · 폐기 함수는 무접촉(ADR-0006).
// ⛔ G426 — 잎 모듈이다. **런타임 내부 import 0건**(아래 두 줄은 type import라 컴파일 후 사라진다).
//    트리거가 ../challenge를 끌어오면 모듈 상호 import가 되고(challenge/userAccess.ts가 이미
//    ../guardrails를 import한다) §41 시크릿 폐포 판정이 바뀔 수 있다(G212). 선례: anonymousGate.ts.
import type { Firestore } from "firebase-admin/firestore";
import type { ChallengeDoc, ChallengeStatus } from "./types";

/** ⭐ 루트 테스트가 이 줄의 리터럴을 소스에서 직접 읽는다(§69.8 C-1 · G428) — 형태를 바꾸지 말 것. */
export const CHALLENGE_STATUS_ON_EXPERIENCE_END = "completed" satisfies ChallengeStatus;

/** consented · in_progress → "completed" / pending · completed · expired · reported · deleted → null. */
export function nextChallengeStatusOnExperienceEnd(status: ChallengeStatus): "completed" | null {
  if (status === "consented" || status === "in_progress") {
    return CHALLENGE_STATUS_ON_EXPERIENCE_END;
  }
  return null;
}

/**
 * 세션 업데이트 1건이 "챌린지 체험 종료"인지 판정해, 완료로 옮길 challengeId를 돌려준다.
 * 조건은 onSessionEnded의 기존 필터와 같다(after 존재 · status가 바뀜 · after.status === "ended") +
 * challengeId가 비어 있지 않은 문자열일 때만. 비챌린지 세션은 null(추가 I/O 0).
 */
export function challengeIdToCompleteOnSessionUpdate(
  before: { status?: unknown } | undefined,
  after: { status?: unknown; challengeId?: unknown } | undefined,
): string | null {
  if (!after || before?.status === after.status || after.status !== "ended") {
    return null;
  }
  const { challengeId } = after;
  return typeof challengeId === "string" && challengeId !== "" ? challengeId : null;
}

export type ExperienceEndOutcome =
  | { outcome: "completed"; from: ChallengeStatus }
  | { outcome: "unchanged"; status: ChallengeStatus }
  | { outcome: "missing" };

/**
 * 트랜잭션 1회: challenges/{challengeId} read 1 → nextChallengeStatusOnExperienceEnd가 값을 줄
 * 때만 tx.update(ref, { status }). 트리거 중복 전달(최소 1회 전달)도 두 번째 트랜잭션이 completed를
 * 읽고 쓰기 0으로 흡수한다. db는 인자다 — 메모리 가짜로 테스트한다(§69.8 S-3).
 */
export async function completeChallengeOnExperienceEnd(
  db: Firestore,
  challengeId: string,
): Promise<ExperienceEndOutcome> {
  const ref = db.collection("challenges").doc(challengeId);
  return db.runTransaction(async (tx): Promise<ExperienceEndOutcome> => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { outcome: "missing" };
    }
    const status = (snap.data() as ChallengeDoc).status;
    const next = nextChallengeStatusOnExperienceEnd(status);
    if (next === null) {
      return { outcome: "unchanged", status };
    }
    tx.update(ref, { status: next });
    return { outcome: "completed", from: status };
  });
}
