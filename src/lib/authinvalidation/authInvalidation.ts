// 인증 무효화 취급 — 순수 판정 코어 (T128, Architecture.md §34.3~§34.5).
//
// ⛔ **이 파일이 고치는 것을 정확히 적는다**(§34.10 (a)): 토큰 무효화 자체를 막지 않는다. 무효화는
//    Firebase SDK가 이미 감지해 스스로 `signOut`한다(§34.2 (가)(다) — T128 프로브 P-1b가 라이브로
//    관측). 이 모듈이 바꾸는 것은 **그 로그아웃이 일어났을 때 참가자가 무엇을 보는가**다. 현행은
//    훈련 한가운데서 `RouteGuard`가 화면 트리를 통째로 언마운트하고 `/login`으로 보낸다.
//
// 순수 함수만 둔다(React·Firebase import 0건) — 루트 테스트 러너(`node --experimental-strip-types`)가
// 그대로 읽을 수 있어야 하고, 역검증("정상 세션 전 구간 배너 0회")을 실행 출력으로 남길 수 있어야
// 한다(§34.8 ①).

/** 훈련 진행 중 화면 — 언마운트되면 실시간 세션·마이크·타이머가 끊긴다(§15.1.1 G10). */
export const TRAINING_PATHS = ["/session/play", "/session/chat", "/session/messenger"] as const;

/** 리포트 조회·되감기 — 재인증하면 같은 uid로 그대로 읽히므로 리다이렉트할 이유가 없다(§34.4 5행). */
export const RECOVERABLE_PATHS = [
  "/report",
  "/report/replay",
  "/report/rewind",
  "/report/archive",
  "/session/end",
] as const;

/**
 * 배너 상태. `none`이면 현행 규칙(RouteGuard 리다이렉트)이 그대로 산다.
 * - `banner-reauth`   : 계정형(Google) — 팝업 재인증으로 복구 가능(§34.4 2·3·5행)
 * - `banner-anonymous`: 익명(사용자2) — 복구 불가, 정직한 종료 안내(§34.4 4·6행, §34.5)
 */
export type AuthInvalidationMode = "none" | "banner-reauth" | "banner-anonymous";

export type AuthInvalidationInput = {
  pathname: string;
  /** 지금 인증 객체가 없는가(`user === null`). 감지 지점 ②(onAuthStateChanged). */
  signedOut: boolean;
  /**
   * ⭐ 이 마운트에서 **한 번이라도 로그인 상태를 본 적이 있는가**.
   * ⛔ 이 조건이 없으면 "처음부터 비로그인인 채 훈련 URL을 직접 연 사람"까지 배너를 보게 된다 —
   *    그것은 무효화가 아니라 평범한 미인증이고, 오탐이 나면 이 저장소는 장치를 삭제한다(§24.4/§34.6).
   */
  hadUser: boolean;
  /** 감지 지점 ③ — 콜러블이 `functions/unauthenticated`를 냈는가(§34.3 표 ③행, 주 감지 지점). */
  unauthenticatedCallable: boolean;
  /** 마지막으로 관측된 사용자가 익명이었는가(`user.isAnonymous`). 익명 uid는 재발급 불가(§34.5 1). */
  wasAnonymous: boolean;
};

function isProtectedPath(pathname: string): boolean {
  return (
    (TRAINING_PATHS as readonly string[]).includes(pathname) ||
    (RECOVERABLE_PATHS as readonly string[]).includes(pathname)
  );
}

/**
 * §34.4 표를 그대로 옮긴 판정. ⛔ 표에 없는 경로는 전부 1행(현행 유지)이며 여기서 넓히지 않는다(G152).
 *
 * | 상태 | 사건 | 결과 |
 * |---|---|---|
 * | 훈련 밖·리포트 밖 | 무엇이든 | `none` (RouteGuard 현행 리다이렉트) |
 * | 훈련 중/리포트 중 · 계정형 | user→null 또는 콜러블 unauthenticated | `banner-reauth` |
 * | 훈련 중/리포트 중 · 익명 | 위 둘 중 무엇이든 | `banner-anonymous` |
 */
export function resolveAuthInvalidationMode(input: AuthInvalidationInput): AuthInvalidationMode {
  const invalidated = (input.signedOut && input.hadUser) || input.unauthenticatedCallable;
  if (!invalidated) return "none";
  if (!isProtectedPath(input.pathname)) return "none";
  return input.wasAnonymous ? "banner-anonymous" : "banner-reauth";
}

/**
 * G156 — 판정 소스를 **`functions/unauthenticated` 코드 하나**로 한정한다.
 * ⛔ `internal`·`unavailable`·`permission-denied` 등 다른 코드를 "인증 문제"로 넓히지 말 것.
 *    넓히는 순간 네트워크 실패가 배너로 새고, 오탐은 §24.4와 같은 형태로 장치를 삭제시킨다.
 */
export function isUnauthenticatedCallableError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "functions/unauthenticated";
}
