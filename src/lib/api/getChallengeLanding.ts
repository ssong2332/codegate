import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { GetChallengeLandingRequest, GetChallengeLandingResponse } from "./types";

/**
 * Callable 실호출 — 사용자2 동의 랜딩 조회(UX-021, T37, AC-040/048). 무로그인·토큰만으로 호출한다.
 * 소모(1회성)하지 않는다 — 링크 미리보기 크롤러가 선fetch해도 안전하다(§14.4).
 */
export async function getChallengeLanding(
  request: GetChallengeLandingRequest,
): Promise<GetChallengeLandingResponse> {
  const callable = httpsCallable<GetChallengeLandingRequest, GetChallengeLandingResponse>(
    functionsClient,
    "getChallengeLanding",
  );
  const { data } = await callable(request);
  return data;
}
