import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { CreateChallengeRequest, CreateChallengeResponse } from "./types";

/**
 * Callable 실호출 — 2인 소셜 챌린지 생성(UX-019, T36, AC-041/044/048/049). 서버가 완료된 클론
 * 재사용 확인·활성 개수 상한 검증·챌린지 전용 신규 클론 발급·공유 토큰 발급까지 한 번에 처리한다.
 * `shareToken`은 이 응답에서만 평문으로 반환되고 어디에도 저장되지 않는다(§14.4).
 */
export async function createChallenge(
  request: CreateChallengeRequest,
): Promise<CreateChallengeResponse> {
  const callable = httpsCallable<CreateChallengeRequest, CreateChallengeResponse>(
    functionsClient,
    "createChallenge",
  );
  const { data } = await callable(request);
  return data;
}
