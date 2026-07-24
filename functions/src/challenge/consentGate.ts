// 사용자2 동의 게이트 순수 판정 로직 (T37, Architecture.md §14.4/§14.7.5, ADR-0006, AC-040/048).
//
// consentChallenge(userAccess.ts)가 Firestore 조회 결과(만료·status·기존 체험 세션 소유 uid)를
// 넘기면, 이 함수가 "생성/재개/거부" 중 무엇을 할지만 판정한다(Firestore/네트워크 없이 유닛
// 테스트 가능 — guardrails/purge.ts·challenge/purge.ts의 "순수 로직과 부수효과 분리" 관례와 동일).
//
// §14.4 "1회성 소모" 원칙: 동의 통과 시점에 소모되고(linkConsumedAt+status="consented"), 이후
// 재진입은 "status==='in_progress' + 보존기간 내에서만 재개 허용(중도 이탈 복귀)"이다. 하지만
// "재개를 허용"하는 대상은 어디까지나 **그 동의를 한 사용자2 본인**이어야 한다 — 링크가 카톡 대화방
// 등에서 여러 사람에게 다시 공유되면, 이미 소진된 링크로 "다른 사람"이 동의를 시도할 수 있다.
// Firebase Anonymous Auth는 로컬(브라우저) persistence라 같은 사람이 같은 브라우저로 돌아오면
// 같은 uid를 다시 얻는다(§14.7 A1) — 그래서 "재개"와 "타인의 소진된 링크 재사용 시도"를 기존 체험
// 세션의 uid와 호출자 uid 일치 여부로 구분할 수 있다.
import type { ChallengeStatus } from "../shared/types";

export type ConsentGateInput = {
  expired: boolean;
  status: ChallengeStatus;
  /** challengeId로 조회한 기존 체험 세션의 소유 uid. 세션이 아직 없으면 null. */
  existingSessionUid: string | null;
  /** 이 콜러블을 호출한 익명 uid(request.auth.uid). */
  callerUid: string;
};

// "resume"이면 sessionId는 이 함수가 모른다(순수 함수라 조회를 하지 않는다) — 호출부(userAccess.ts)가
// existingSessionUid 조회 시 이미 그 세션 문서를 갖고 있으므로 sessionId도 그대로 재사용하면 된다.
export type ConsentGateResult =
  | { action: "create" }
  | { action: "resume" }
  | { action: "reject"; message: string };

export function decideConsentGate(input: ConsentGateInput): ConsentGateResult {
  if (input.expired) {
    return { action: "reject", message: "이 링크는 만료되었습니다." };
  }
  if (input.status === "pending") {
    return { action: "create" };
  }
  if (input.status === "consented" || input.status === "in_progress") {
    if (input.existingSessionUid && input.existingSessionUid === input.callerUid) {
      return { action: "resume" };
    }
    return { action: "reject", message: "이미 다른 사람이 동의한 챌린지입니다." };
  }
  // completed | expired | reported | deleted — 더 이상 진행 불가.
  return { action: "reject", message: "더 이상 진행할 수 없는 챌린지입니다." };
}
