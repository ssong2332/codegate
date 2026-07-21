// 라우트 가드·인증 세션 훅 (Track C, T18, AC-027). Architecture.md §7.
export { useCurrentUser } from "./useCurrentUser";
export type { CurrentUserState } from "./useCurrentUser";
export { ensureUserProfile } from "./userProfile";
export { signInWithGoogle } from "./signInWithGoogle";
export type { SignInOutcome } from "./signInWithGoogle";
export { default as RouteGuard } from "./RouteGuard";
