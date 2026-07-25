// 개발 전용 빠른 로그인 (2026-07-25, 사용자 승인 — 아이디어 #1).
//
// 목적: Google OAuth 팝업은 별도 창이라 자동화 도구·에뮬레이터 환경에서 끝까지 클릭할 수 없다.
// 그래서 로그인 이후의 모든 화면(온보딩·시나리오·통화·리포트)이 자동 검증 사각지대로 남아 있었다.
// 이 모듈은 **인증 단계만** 익명 사인인으로 대체해 그 사각지대를 없앤다.
//
// ⚠️ 의도적으로 인증만 우회한다 — 동의(UX-001/AC-012/017)·연령 확인(UX-011/AC-014) 화면은 그대로
// 거친다. 그 화면들은 일반 DOM(체크박스+버튼)이라 자동화로 정상 조작할 수 있어 우회할 이유가 없고,
// 안전 게이트를 개발 편의로 건너뛰는 코드를 만들어 두면 언젠가 그 경로가 남는다.
//
// ⚠️ 프로덕션 차단 — 2단 방어. 처음엔 `useEmulator`(다른 모듈의 const)를 재사용했는데, **프로덕션
// 빌드 산출물을 실제로 grep해 보니 버튼 문구가 그대로 남아 있었다**(모듈 경계를 넘는 const는
// 번들러가 리터럴로 접어주지 못해 JSX 분기가 데드코드로 제거되지 않는다). 추정으로 넘어갔으면
// 개발용 인증 우회가 배포본에 실려 나갈 뻔했다. 그래서:
//   1. **호출부(login/page.tsx)에서 `process.env.NODE_ENV !== "production"`를 인라인으로** 함께
//      검사한다 — 이건 Next가 빌드 시 리터럴로 치환하므로 `false && (...)`가 되어 JSX가 실제로
//      제거된다(빌드 후 grep으로 재확인).
//   2. 아래 런타임 가드 — 혹시 코드가 남더라도 프로덕션에서는 무조건 거부한다.
import { signInAnonymously } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useEmulator } from "@/lib/firebase/emulator";
import { ensureUserProfile } from "./userProfile";

/** 개발용 빠른 로그인을 노출할지. 프로덕션 빌드에서는 리터럴 치환으로 false가 된다. */
export const DEV_AUTH_ENABLED = process.env.NODE_ENV !== "production";

export type DevSignInOutcome = { status: "success" } | { status: "error"; message: string };

/**
 * 익명 사용자로 즉시 로그인한다(개발 전용). Auth 에뮬레이터는 프로바이더 활성화 없이도 익명
 * 사인인을 지원하며, RouteGuard·Firestore 규칙은 익명 사용자도 정상 `request.auth`로 취급한다
 * (2인 챌린지 수신자 경로가 이미 같은 메커니즘을 쓴다 — §14.7/ADR-0006).
 */
export async function devSignIn(): Promise<DevSignInOutcome> {
  // reviewer Major #2(2026-07-25) — 예전엔 `DEV_AUTH_ENABLED`만 확인했다. 그런데 그 값과
  // `useEmulator`는 **우연히 같은 식**(`NODE_ENV !== "production"`)일 뿐 서로 묶여 있지 않았다.
  // 즉 "개발 빌드"라는 사실만 확인하고 "지금 로컬 에뮬레이터를 보고 있다"는 사실은 확인하지 않았다.
  // 훗날 `useEmulator`가 더 세분화되면(예: NODE_ENV=development인 스테이징 빌드가 실 Firebase
  // 프로젝트를 보게 되는 경우) 이 익명 인증 우회가 **실 데이터에 조용히 동작**하게 된다.
  // 이제 둘 다 참일 때만 진행한다 — 우연이 아니라 명시적 조건으로.
  if (!DEV_AUTH_ENABLED || !useEmulator) {
    return { status: "error", message: "개발용 로그인은 프로덕션에서 사용할 수 없습니다." };
  }
  try {
    const result = await signInAnonymously(auth);
    await ensureUserProfile(result.user);
    return { status: "success" };
  } catch {
    return { status: "error", message: "개발용 로그인에 실패했습니다. 에뮬레이터가 실행 중인지 확인하세요." };
  }
}
