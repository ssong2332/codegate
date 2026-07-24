import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
import type { ListMyChallengesRequest, ListMyChallengesResponse } from "./types";

/**
 * Callable 실호출 — 본인 챌린지 목록 조회(UX-020, T36, reviewer 리뷰 Critical #1 수정). 예전엔
 * 클라가 challenges 컬렉션을 직접 read했으나(firestore.rules 소유자 read 허용), 문서에 담긴
 * voiceId(ElevenLabs 클론 id)·linkTokenHash까지 그대로 브라우저로 전송돼 ADR-0005 §14.2 위반이었다
 * — 이제 이 콜러블이 민감 필드를 제외한 안전한 형태로만 반환하고, firestore.rules의 challenges
 * read는 전면 거부로 좁혀졌다(이 콜러블이 유일한 조회 경로).
 */
export async function listMyChallenges(): Promise<ListMyChallengesResponse> {
  const callable = httpsCallable<ListMyChallengesRequest, ListMyChallengesResponse>(
    functionsClient,
    "listMyChallenges",
  );
  const { data } = await callable({});
  return data;
}
