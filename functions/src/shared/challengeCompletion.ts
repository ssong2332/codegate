// T181 C1 — 챌린지 완료 전이(docs/Architecture.md §69.3 (3) · G424~G426 · DECISIONS #112).
// T181 C4 — 동의 끝 consented → in_progress 조건부 전이(§69.15.4 · G429 · DECISIONS #113) — 파일 아래쪽.
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

// --- T181 C4(§69.15.4 · OQ-A88 (a) · G429) — 동의 끝 consented → in_progress를 조건부 트랜잭션으로 ---
//
// 예전 consentChallenge 끝(userAccess.ts)의 트랜잭션 밖 **무조건** in_progress 쓰기는, 동의 트랜잭션
// 커밋과 그 쓰기 사이(음성 오프닝 합성 수 초)에 먼저 커밋된 종결 상태 — 완료(completed · R-1) · 신고
// (reported — 신고 뒤 실시간 통화 허용) · 폐기(deleted — 삭제한 챌린지 부활) — 를 덮었다. 지금
// consented일 때만 쓴다. 두 전이의 상태 집합이 맞물리므로(이 전이의 출력이 완료 전이의 입력이다) 같은
// 잎 모듈 · 같은 테스트가 교차 불변식을 건다(S-11).

/** ⭐ S-12가 userAccess.ts에 이 리터럴이 0건임을 단언한다 — 쓰기는 아래 헬퍼 1곳뿐이다(G429). */
export const CHALLENGE_STATUS_ON_CONSENT_END = "in_progress" satisfies ChallengeStatus;

/** consented → "in_progress" / pending · in_progress · completed · expired · reported · deleted → null. */
export function nextChallengeStatusOnConsentEnd(status: ChallengeStatus): "in_progress" | null {
  return status === "consented" ? CHALLENGE_STATUS_ON_CONSENT_END : null;
}

export type ConsentEndOutcome =
  | { outcome: "in_progress" }
  | { outcome: "unchanged"; status: ChallengeStatus }
  | { outcome: "missing" };

/**
 * 트랜잭션 1회: challenges/{challengeId} read 1 → nextChallengeStatusOnConsentEnd가 값을 줄 때만
 * tx.update(ref, { status }). ⛔ 예외는 삼키지 않는다 — 호출부(consentChallenge)의 실패 의미론은
 * 예전 무조건 쓰기와 같다(§69.15.4 (3) — 실패해도 문서는 consented로 남고 모든 읽기 지점이
 * consented와 in_progress를 같게 다룬다).
 */
export async function markChallengeInProgressIfConsented(
  db: Firestore,
  challengeId: string,
): Promise<ConsentEndOutcome> {
  const ref = db.collection("challenges").doc(challengeId);
  return db.runTransaction(async (tx): Promise<ConsentEndOutcome> => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return { outcome: "missing" };
    }
    const status = (snap.data() as ChallengeDoc).status;
    const next = nextChallengeStatusOnConsentEnd(status);
    if (next === null) {
      return { outcome: "unchanged", status };
    }
    tx.update(ref, { status: next });
    return { outcome: "in_progress" };
  });
}
