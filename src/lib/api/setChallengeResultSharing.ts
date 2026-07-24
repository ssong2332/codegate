import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { SetChallengeResultSharingRequest, SetChallengeResultSharingResponse } from "./types";

/**
 * Callable 실호출 — 사용자2 결과 공유 동의(UX-018, T37, AC-043). 익명 인증 상태(consentChallenge
 * 시점에 확보한 세션)에서 호출한다 — 서버가 그 uid가 실제 체험 세션 소유자인지 재확인한다.
 */
export async function setChallengeResultSharing(
  request: SetChallengeResultSharingRequest,
): Promise<SetChallengeResultSharingResponse> {
  const callable = httpsCallable<SetChallengeResultSharingRequest, SetChallengeResultSharingResponse>(
    functionsClient,
    "setChallengeResultSharing",
  );
  const { data } = await callable(request);
  return data;
}
