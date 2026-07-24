// 본인 챌린지 목록 조회 (Track A/C, T36, UX-020, AC-043).
// reviewer 리뷰 Critical #1 수정(2026-07-24): 예전엔 firestore.rules의 challenges 소유자 read
// 허용을 근거로 클라 Firestore SDK가 직접 read했으나, 문서에 담긴 voiceId(ElevenLabs 클론
// id)·linkTokenHash까지 그대로 브라우저로 전송돼 ADR-0005 §14.2("raw voiceId를 반환하는 경로가
// 어디에도 없다")를 위반했다 — `listMyChallenges` 콜러블(functions/src/challenge/index.ts)이
// 민감 필드를 제외한 안전한 형태로만 반환하도록 교체했고, firestore.rules의 challenges read는
// 전면 거부로 좁혔다(이제 이 콜러블이 유일한 조회 경로).
import { listMyChallenges } from "@/lib/api";
import type { ChallengeSource } from "./mapChallengeItems";

export async function fetchMyChallenges(): Promise<ChallengeSource[]> {
  const { challenges } = await listMyChallenges();
  return challenges.map((item) => ({
    challengeId: item.challengeId,
    displayName: item.displayName,
    status: item.status as ChallengeSource["status"],
    resultSharingConsented: item.resultSharingConsented,
    suspicionTimeLabel: item.suspicionTimeLabel,
    createdAt: item.createdAt ? new Date(item.createdAt) : null,
  }));
}
