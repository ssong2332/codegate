import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { ReportChallengeRequest, ReportChallengeResponse } from "./types";

/**
 * Callable 실호출 — "원치 않는 챌린지" 신고(UX-021, T37, AC-049). 무로그인·토큰만으로 호출한다.
 * 동의 여부와 무관하게(동의 전이든 후든) 호출 가능하다.
 */
export async function reportChallenge(
  request: ReportChallengeRequest,
): Promise<ReportChallengeResponse> {
  const callable = httpsCallable<ReportChallengeRequest, ReportChallengeResponse>(
    functionsClient,
    "reportChallenge",
  );
  const { data } = await callable(request);
  return data;
}
