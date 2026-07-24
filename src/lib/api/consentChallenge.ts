import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { ConsentChallengeRequest, ConsentChallengeResponse } from "./types";

/**
 * Callable 실호출 — 사용자2 명시 동의 + 체험 세션 생성(UX-021, T37, AC-040/048). 호출 전 반드시
 * `signInAnonymously(auth)`로 임시 uid를 먼저 확보해야 한다(§14.7/ADR-0006 A1) — 그 uid가 이
 * 호출로 만들어지는 체험 세션의 소유자가 된다.
 */
export async function consentChallenge(
  request: ConsentChallengeRequest,
): Promise<ConsentChallengeResponse> {
  const callable = httpsCallable<ConsentChallengeRequest, ConsentChallengeResponse>(
    functionsClient,
    "consentChallenge",
  );
  const { data } = await callable(request);
  return data;
}
