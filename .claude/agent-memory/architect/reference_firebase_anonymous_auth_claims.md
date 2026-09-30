---
name: reference-firebase-anonymous-auth-claims
description: 서버에서 Firebase 익명 호출자를 판별하는 키와 에뮬레이터 동작(같은 클레임·서명 미검증·FUNCTIONS_EMULATOR·비밀번호 가입 항상 허용), SDK 소스 위치
metadata:
  type: reference
---

- 판별 키: `request.auth.token.firebase.sign_in_provider === "anonymous"`. Admin SDK `DecodedIdToken.firebase.sign_in_provider: string`은 **필수 필드**다(firebase-admin 14.2.0 `lib/auth/token-verifier.d.ts:69-88`). `isAnonymous`는 클라 `User` 속성이라 서버 토큰에는 없다.
- onCall은 `ctx.auth = { uid, token: 디코드된 토큰, rawToken }`로 넘긴다. 프로덕션은 `verifyIdToken`으로 서명을 검증하고, 에뮬레이터는 `skipTokenVerification`이라 `unsafeDecodeIdToken`을 쓴다(firebase-functions 7.3.0 `lib/common/providers/https.js:322-331`).
- 에뮬레이터 Auth도 익명 가입에 `sign_in_provider: "anonymous"`를 싣는다(firebase-tools 15.24.0 `lib/emulator/auth/operations.js:153-155`·`:1760-1762`, `state.js:11`). 익명이 꺼져 있으면 에러 문자열이 프로덕션과 같은 `ADMIN_ONLY_OPERATION`이다. 에뮬레이터는 `allowPasswordSignup`이 **항상 true**다(`state.js:461-463`). Functions 에뮬레이터는 `FUNCTIONS_EMULATOR="true"`를 설정한다(`functionsEmulator.js:987`).
- 소스 위치: 워크트리에는 node_modules가 없다 → 메인 체크아웃 `C:\codegate\functions\node_modules\`, firebase-tools는 전역 `%APPDATA%\npm\node_modules\firebase-tools\`. Admin SDK 레퍼런스 웹 페이지는 WebFetch가 본문을 못 가져오므로 설치본 `.d.ts`를 읽는다.
- 클라 `callable.ts`는 `functions/unauthenticated`에서만 인증 무효화 배너와 U1 잠금을 연다 → 권한 거부에는 `permission-denied`를 쓴다(§68, G417).

관련: [[feedback-security-gate-no-env-exception]] [[feedback-absence-claims-check-the-sdk]]
