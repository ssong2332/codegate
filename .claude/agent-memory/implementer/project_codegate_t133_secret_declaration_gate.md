---
name: codegate-t133-secret-declaration-gate
description: T133 — 시크릿 선언-사용 정합 게이트 구현 중 얻은 실측 4건(__endpoint 실재·SDK warn 중복·폐포 스캐너 레시피·강등표 적용)
metadata:
  type: project
---

T133(AC-081, Architecture.md §41)에서 서버 콜러블의 "읽는 시크릿 = 선언한 시크릿" 정적 게이트를 만들었다.

**Why:** `deliverVerifyOffer`·`deliverVerifyReconnect`가 `getRealtimeProvider`로 자격증명을 읽으면서
`secrets` 선언이 0건이었다. 배포에서 미주입이면 두 콜러블이 서로 다른 프로바이더를 본다.

**How to apply — 재사용 가치가 있는 실측 4건:**

1. ⭐ **`__endpoint.secretEnvironmentVariables`는 실재하고 쓸 만하다**(firebase-functions@7.3.0).
   컴파일된 `lib/**/index.js`를 import해 `fn.__endpoint.secretEnvironmentVariables` 를 읽으면
   `[{key: "GEMINI_API_KEY"}, ...]` 형태로 **스프레드(`...GEMINI_KEY_SECRETS`)까지 해석된 실효 선언**을
   얻는다. `@alpha` 표기지만 throw하지 않고 접근된다. 선언이 없는 콜러블은 `__endpoint`는 있고
   `secretEnvironmentVariables`만 `undefined`다 ⇒ **"판독 불가(null)"와 "선언 0건([])"을 반드시
   구분**해야 한다. 안 그러면 SDK가 바뀐 날 전부 조용히 초록이 된다.
   선언 판독은 `functions/src/index.ts` 배럴을 import하면 26개 진입점을 이름으로 한 번에 얻는다.

2. ⭐ **SDK가 이미 미주입 경고를 낸다 — 자체 신호를 추가하면 중복이다.**
   `SecretParam.runtimeValue()`가 `process.env[name] === undefined` 일 때
   *"No value found for secret parameter … include the secret in the function's dependency array."*
   를 찍는다. 실측: `getRealtimeProvider` 1회 호출 = **경고 2줄**(읽는 시크릿 수만큼).
   ⇒ 설계가 "absent면 신호 1줄"을 지시해도 **먼저 재라 — 중복이면 SDK 경고를 그대로 쓰는 쪽**이다.
   ⚠️ 반대로 **빈 문자열·`YOUR_` placeholder 주입에는 경고가 나지 않는다**(관측 사각).
   ⛔ `param.value()`를 두 번 부르면 경고도 2배가 된다 — 판별과 값 읽기를 한 번의 호출로 합쳐라.

3. **폐포 스캐너 레시피**(`functions/src/devtools/secretDeclarationScan.ts`):
   `^(?:import|export)\s+((?!type\b)[\s\S]*?)from\s+["']([^"']+)["']` 로 **`export … from` 재export까지**
   따라가야 한다(verifyIntercept가 `../realtime` 배럴 경유로 ELEVENLABS를 읽는 경로가 여기서만 잡힌다).
   인라인 `{ type X }` 지정자도 걸러야 `import type` 거짓 양성이 안 난다.
   ⚠️ 심볼 목록을 손으로 적지 말고 `shared/config.ts`를 파싱하라(`defineSecret` + `[...] as const`).

4. **before/after를 게이트 함수 자신으로 잰다.** 수정 **전에** 스캐너만 먼저 만들어 probe로 돌리면
   `불일치 9건`(결함 2 + 파일 폐포 경계 7)이 나오고, 수정 후 `0건`이 된다 — 이게 in-test 오염
   역검증보다 강한 실제 red→green 증거다. 설계 표(§41.3)와 행 단위로 정확히 일치했다.

**남은 것:** 배포 환경 미주입은 **여전히 미재현**(OQ-A29, 배포 권한 없음). `llm/index.ts`의 쌍둥이
`readSecret`은 3값화하지 않았다(AC-081의 좁은 대상 3개가 전부 `realtime/provider.ts` 경유).

관련: [[codegate-t83-verify-intercept]] · [[codegate-t132-key-failover]]
