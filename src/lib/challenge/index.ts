// 2인 소셜 챌린지 — 사용자1 결과 열람 목록(UX-020, T36, AC-043).
export { fetchMyChallenges } from "./fetchChallenges";
export { mapChallengesToListItems } from "./mapChallengeItems";
export type { ChallengeListItem, ChallengeSource, ChallengeStatus } from "./mapChallengeItems";
// T181 C5 — UX-021 동의 랜딩 화면 판정(UX v1.27 Error (c)).
export {
  COMPLETED_LANDING_BODY,
  COMPLETED_LANDING_TITLE,
  resolveChallengeLandingView,
} from "./landingView";
export type { ChallengeLandingView } from "./landingView";
