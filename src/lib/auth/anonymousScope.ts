// OQ-A84 — 익명 세션이 수신 흐름 밖으로 나왔을 때의 라우트 판정 (User 결정 2026-10-17: "로그인 화면으로
// 보냄" · "체험용 접속 안내" 문구). RouteGuard가 이 판정을 쓰고, 로그인 화면이 안내 문구를 쓴다.
//
// 배경(라이브 2026-10-17, Android Whale): 챌린지 링크에서 `signInAnonymously`로 생긴 익명 세션이
// 브라우저에 남으면, RouteGuard가 익명 User도 로그인 상태로 통과시켜 /scenarios → 난이도까지 들어가고
// `createSession`이 익명을 `permission-denied`로 거부한다(T176 게이트, `functions/src/session/index.ts:80`).
// 앱에는 로그아웃 버튼이 없어 빠져나갈 길이 없었다.
//
// ⛔ 익명 판별은 `user.isAnonymous` 하나다(§34.5 4와 같은 값).
// ⛔ 강제 로그아웃(`signOut`)을 하지 않는다. /login에서 Google 로그인이 성공하면 SDK가 익명 사용자를
//    그 자리에서 교체한다. 실패·취소하면 익명 세션이 그대로 남아 수신 흐름 화면은 계속 열린다.
// ⛔ 수신 흐름(ANONYMOUS_RECIPIENT_PATHS)은 현행 그대로다 — 여기서 빼면 AC-048(사용자2 링크 진입)이
//    끊긴다. 목록은 Architecture.md §68.4가 추적한 화면(UX-021·014·022·007·008·018·028)의 라우트다.
//
// 순수 모듈이다(React·Firebase import 0건) — 루트 테스트 러너가 그대로 읽는다.

/** 익명(사용자2)이 머물 수 있는 화면 — 챌린지 동의 랜딩 → 체험 → 종료 → 리포트·리플레이·되감기. */
export const ANONYMOUS_RECIPIENT_PATHS = [
  "/challenge/join",
  "/session/play",
  "/session/chat",
  "/session/messenger",
  "/session/end",
  "/report",
  "/report/replay",
  "/report/rewind",
] as const;

/**
 * 법적 고지 화면(개인정보처리방침 · 이용약관 · 문의) — 외부 점검 2026-10-21 대응. 읽기 전용(Firestore · Functions 호출 0)이라
 * 미인증 · 익명 · 로그인 사용자 누구나 열 수 있어야 한다(받는 분이 동의 전에 처리방침을 읽을 수 있어야 한다).
 */
export const LEGAL_PATHS = ["/privacy", "/terms", "/contact"] as const;

/**
 * 익명 사용자가 /login에 왔을 때 보이는 안내(User 확정 문구 2026-10-17).
 * OQ-U53(User 결정 ⓑ, 2026-10-17) — 셋째 문장을 덧붙였다. Google 로그인은 익명 uid를 교체하므로
 * 방금 본 챌린지 리포트·리플레이·되감기에 다시 닿을 수 없다는 것을 로그인 **전에** 알린다.
 */
export const ANONYMOUS_LOGIN_NOTICE =
  "지금은 친구가 보낸 체험용 임시 접속 상태입니다. 내 훈련을 하려면 Google로 로그인해 주세요. 로그인하면 방금 본 체험 리포트는 다시 열 수 없습니다.";

/**
 * 익명 사용자가 수신 흐름 밖에 있으면 true(→ RouteGuard가 /login으로 보낸다).
 * /login 자체는 false다 — 그곳에서 Google로 로그인해야 하므로 머물러야 한다.
 */
export function isAnonymousOutsideRecipientFlow(isAnonymous: boolean, pathname: string): boolean {
  if (!isAnonymous) return false;
  if (pathname === "/login") return false;
  if ((LEGAL_PATHS as readonly string[]).includes(pathname)) return false;
  return !(ANONYMOUS_RECIPIENT_PATHS as readonly string[]).includes(pathname);
}
