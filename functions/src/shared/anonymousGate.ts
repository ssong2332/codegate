// T176 — 익명 uid를 챌린지 수신 경로로만 제한하는 서버 게이트(Architecture.md §68, ADR-0016,
// DECISIONS #108). 익명 판별식의 **유일한 정본**이다(§68.6 (1)).
//
// ⛔ G415 — 익명 판별은 `token.firebase.sign_in_provider === "anonymous"` 하나뿐이다.
//    `isAnonymous`(클라 User 속성)·email 부재·uid 형태·`provider_id`로 판정하지 않는다(§68.2).
// ⛔ G416 — 환경 분기(`FUNCTIONS_EMULATOR` 등)를 두지 않는다. 에뮬레이터 대응은 클라 개발용
//    로그인(E2, `src/lib/auth/devSignIn.ts`)이 맡는다 — 여기에 예외를 두면 라이브 전에 이 게이트를
//    실제로 돌려 볼 유일한 장소가 사라진다.
// ⛔ G417 — 거부 코드는 `permission-denied`다. `unauthenticated`는 금지다 — 클라 단일 래퍼
//    (`src/lib/api/callable.ts`)는 그 코드 하나만 보고 인증 무효화 배너를 띄우고 이후 콜러블을 전부
//    잠근다. 익명은 재인증이 불가능하므로 막다른 상태가 된다.
// ⛔ 내부 모듈 import 0건(§68.6 (2)) — 콜러블 20개가 이 파일을 import하므로 여기서 다른 모듈을
//    끌어오면 §41 시크릿 폐포 게이트의 판정이 전 함수에서 바뀐다(G212). `functions/src/index.ts`에서
//    재export하지 않는다(배포 대상 목록·T-2 정책표가 흔들린다).
//
// ⭐ 방향 = 거부목록(`anonymous`와 일치할 때만 거부). 비익명(Google·password·custom·클레임 부재)
//    호출자에 대해 세 함수는 **I/O 0회·throw 0회로 반환**한다 — Google 동작 바이트 무변경(§68.6 (4)).
import { HttpsError } from "firebase-functions/v2/https";

type AuthLike = { token?: { firebase?: { sign_in_provider?: unknown } } } | undefined;

export const ANONYMOUS_SIGN_IN_PROVIDER = "anonymous";
export const ANONYMOUS_DENIED_MESSAGE = "이 기능은 로그인한 계정에서만 이용할 수 있습니다.";

/** 익명 제공업체로 로그인한 호출자일 때만 true. */
export function isAnonymousCaller(auth: AuthLike): boolean {
  return auth?.token?.firebase?.sign_in_provider === ANONYMOUS_SIGN_IN_PROVIDER;
}

/**
 * 클래스 D(§68.3) — 익명이면 거부한다. 삽입 위치는 `if (!request.auth)` 블록 **바로 다음**,
 * 인자 검증·Firestore read·LLM 호출보다 앞이다(G419).
 */
export function denyAnonymous(auth: AuthLike): void {
  if (isAnonymousCaller(auth)) {
    throw new HttpsError("permission-denied", ANONYMOUS_DENIED_MESSAGE);
  }
}

/**
 * 클래스 S/R(§68.3) — 익명이면 대상 문서(세션 또는 리포트)의 `challengeId`가 비어 있지 않은
 * 문자열일 때만 통과시킨다(§68.5). 소유 uid 비교는 각 콜러블의 기존 소유권 검사가 이미 했으므로
 * 새로 하지 않는다 — 호출 위치는 그 검사 **바로 다음**이다(G420). 판정 재료는 이미 읽은 문서뿐이라
 * 추가 read는 0회다. `judgeRewindAnswer`는 `report.challengeId`를 넘기고, 값이 없으면 거부한다(G423).
 */
export function assertAnonymousChallengeScope(
  auth: AuthLike,
  owned: { challengeId?: unknown },
): void {
  if (!isAnonymousCaller(auth)) return;
  const { challengeId } = owned;
  if (typeof challengeId === "string" && challengeId !== "") return;
  throw new HttpsError("permission-denied", ANONYMOUS_DENIED_MESSAGE);
}
