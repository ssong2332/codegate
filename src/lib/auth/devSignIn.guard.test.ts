import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// reviewer Major #1(2026-07-25) — 개발용 빠른 로그인이 프로덕션 번들에 실리지 않는다는 보장이
// **사람의 기억에만** 의존하고 있었다. 호출부가 인라인 `process.env.NODE_ENV !== "production"`를
// 함께 검사해야만 Next가 JSX를 데드코드 제거하는데(모듈 경계를 넘는 const는 접히지 않는다 —
// 실제로 첫 구현이 이 함정에 빠져 버튼 문구가 배포 산출물에 남았다), 이걸 강제하는 게 아무것도
// 없었다. 누군가 "중복이니 정리하자"며 인라인 검사를 지우면 인증 우회가 조용히 배포본에 실린다.
//
// 이 테스트는 **소스 문자열을 직접 검사**한다. 빌드 산출물을 검사하는 방법(scripts/verify-no-dev-auth-in-build.mjs)
// 과 역할이 다르다 — 이쪽은 `npm test`만으로 즉시 돌아 회귀를 곧바로 잡고, 저쪽은 최종 산출물로
// 실제 결과를 확인한다. 둘 다 있어야 "빠뜨릴 수 없는" 상태가 된다.
const LOGIN_PAGE = "src/app/(auth)/login/page.tsx";
const DEV_SIGN_IN = "src/lib/auth/devSignIn.ts";

test("개발용 로그인 버튼은 인라인 NODE_ENV 검사와 함께 게이팅되어야 한다(데드코드 제거 보장)", () => {
  const source = readFileSync(LOGIN_PAGE, "utf8");

  // 버튼 블록이 존재한다면, 반드시 인라인 리터럴 검사와 함께 게이팅되어야 한다.
  if (source.includes("DEV_AUTH_ENABLED")) {
    assert.ok(
      /process\.env\.NODE_ENV\s*!==\s*"production"\s*&&\s*DEV_AUTH_ENABLED/.test(source),
      `${LOGIN_PAGE}: 개발용 로그인 버튼은 반드시 ` +
        `\`process.env.NODE_ENV !== "production" && DEV_AUTH_ENABLED\` 형태로 게이팅해야 한다. ` +
        `DEV_AUTH_ENABLED만 쓰면 모듈 경계 때문에 상수가 접히지 않아 JSX가 프로덕션 번들에 남는다 ` +
        `(실측으로 확인된 함정 — devSignIn.ts 상단 주석 참고).`,
    );
  }
});

test("devSignIn은 DEV_AUTH_ENABLED와 useEmulator를 모두 확인해야 한다(실 프로젝트 대상 우회 차단)", () => {
  const source = readFileSync(DEV_SIGN_IN, "utf8");

  // reviewer Major #2 — 두 플래그가 오늘은 같은 식이지만 서로 묶여 있지 않다. useEmulator가
  // 세분화되면(스테이징이 실 프로젝트를 보는 경우 등) 익명 인증 우회가 실 데이터에 동작할 수 있다.
  assert.ok(
    /!DEV_AUTH_ENABLED\s*\|\|\s*!useEmulator/.test(source),
    `${DEV_SIGN_IN}: devSignIn()은 \`!DEV_AUTH_ENABLED || !useEmulator\`로 두 조건을 모두 ` +
      `확인해야 한다 — "개발 빌드"만으로는 "로컬 에뮬레이터를 보고 있다"가 보장되지 않는다.`,
  );
});
