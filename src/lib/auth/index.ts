// 라우트 가드·인증 세션 훅 (Track C, T18, AC-027). Architecture.md §7.
export { useCurrentUser } from "./useCurrentUser";
export type { CurrentUserState } from "./useCurrentUser";
export { ensureUserProfile } from "./userProfile";
export { signInWithGoogle } from "./signInWithGoogle";
export type { SignInOutcome } from "./signInWithGoogle";
export { default as RouteGuard } from "./RouteGuard";
// 개발 전용 빠른 로그인(프로덕션 빌드에서는 DEV_AUTH_ENABLED=false로 데드코드 제거).
export { DEV_AUTH_ENABLED, devSignIn } from "./devSignIn";
export type { DevSignInOutcome } from "./devSignIn";
