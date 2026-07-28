---
name: codegate-t122-securetoken-probe
description: T122 securetoken 400 조사 — 벤더 에뮬레이터 소스로 원인을 "전수 열거"하는 기법, 서명 없는 토큰이 실패를 가리는 구조, 다른 트리 node_modules를 file:/// 로 빌려 쓰는 SDK 하네스
metadata:
  type: project
---

**조사 태스크(고치지 않고 판정만)에서 검증된 기법 3종.** T122(Firebase Auth 에뮬레이터
`securetoken` 400)에서 실측으로 얻었다.

**Why:** 브라우저에서 1회 관측된 사건을, 브라우저 도구 없이 "추정"이 아닌 근거로 닫아야 했다.
관측 당시의 응답 본문은 회수 불가였다(에뮬레이터는 요청 로그를 남기지 않고 `firebase-debug.log`는
다음 기동 때 덮인다 — 사후 포렌식을 기대하지 말 것).

**How to apply:**

1. **원인 후보를 "샘플"이 아니라 "전수"로 만들려면 벤더 소스를 읽어라.** 프로브로 400을 몇 개
   재현하는 것은 표본일 뿐이다. 대신 그 엔드포인트 핸들러의 **모든 실패 분기를 열거**한 뒤 각
   분기가 우리 환경에서 성립 가능한지 하나씩 지우면, 브라우저 재현 없이도 "남는 원인은 하나"까지
   좁혀진다. firebase-tools는 전역 설치라 소스가 그대로 있다:
   `C:/Users/<user>/AppData/Roaming/npm/node_modules/firebase-tools/lib/emulator/auth/`
   (`operations.js`의 `grantToken`, `state.js`의 `validateRefreshToken`/`decodeRefreshToken`).
   같은 방식이 다른 에뮬레이터 층에도 쓰인다.

2. **에뮬레이터는 "서명 없는 토큰"을 서로 받아준다 — 그래서 인증 실패가 조용히 가려진다.**
   실측: 완전히 다른 Auth 에뮬레이터 인스턴스(격리 포트)가 발급한 idToken으로 공유 Functions
   에뮬레이터의 인증 필수 콜러블을 부르면 **200**이 온다. ⇒ 로컬에서 "복구된 것처럼 보였다"는
   관측은 **복구가 아니라 무처리**일 수 있다. 프로덕션 대비 판정을 할 때 이 차이를 먼저 분리하라.
   (Firebase 공식 문서도 emulator는 unsigned ID token을 발급하며 다른 에뮬레이터만 받는다고 명시)

3. **다른 트리의 `node_modules`를 빌려 SDK 레벨 하네스를 만들 수 있다.** 격리 워크트리에 루트
   deps가 없어도 `import ... from "file:///C:/codegate/node_modules/firebase/auth/dist/index.mjs"`
   (node 빌드)로 실제 SDK 동작을 잰다. ⚠️ 함정 2개: (a) 브라우저 esm 빌드가 아니라 **node 빌드**를
   써야 import가 통한다(persistence만 다르고 토큰 갱신 코어는 같다), (b) **`globalThis.fetch`를
   감싸도 SDK 요청은 안 잡힌다** — `FetchProvider`가 import 시점에 참조를 캡처한다. 와이어 원문이
   필요하면 SDK 대신 REST로 따로 재현하라.

관련: [[codegate-t115-emulator-freshness]]((다) 배제에 `emu:check` 사용),
[[feedback-false-reassurance-over-precision]](조용히 복구되는 실패를 신뢰하지 않는 태도),
[[feedback-emulator-script-sdk-split]], [[codegate-t107-field-divergence]](새 워크트리
`npm --prefix functions install`이 `functions/package.json`에 `fraud-vaccine-web` 의존을
몰래 추가한다 — T122에서 **또** 재발했다. 설치 후 `git status` 확인 필수).
