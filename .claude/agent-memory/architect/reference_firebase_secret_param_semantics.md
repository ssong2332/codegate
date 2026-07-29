---
name: firebase-secret-param-semantics
description: firebase-functions의 SecretParam.value()는 런타임에 throw하지 않고 process.env 판독 + warn + "" 를 준다 — "catch가 삼킨다"는 서술은 거짓이고, __endpoint로 선언 집합을 기계 판독할 수 있다
metadata:
  type: reference
---

**`firebase-functions`(v2) 실측 — `C:\codegate\functions\node_modules\firebase-functions\lib\`**
(⚠️ 격리 워크트리에는 `node_modules`가 없다. **메인 체크아웃에서 읽어라**.)

| 지점 | 실제 동작 | 파일:줄 |
|---|---|---|
| `SecretParam.value()` | `process.env.FUNCTIONS_CONTROL_API === "true"`(**배포 분석 단계**)일 때만 **throw** | `params/types.js:320-325` |
| `SecretParam.runtimeValue()` | `process.env[this.name]` 판독 → `undefined`면 **`logger.warn` 1줄** 뒤 **`val \|\| ""` 반환** | `params/types.js:304-310` |
| warn 문면 | *"No value found for secret parameter `"{name}"`. **A function can only access a secret if you include the secret in the function's dependency array.**"* | `params/types.js:307` |
| `CallableFunction.__endpoint` | 존재한다 — `ManifestEndpoint` (⚠️ `/** @alpha */`) | `v2/providers/https.d.ts:176` |
| `ManifestEndpoint.secretEnvironmentVariables` | `Array<{ key: string; secret?: string }>` — ⭐ **실효 선언 집합을 기계 판독할 수 있다**(스프레드·배럴 재export를 전부 통과한 값) | `runtime/manifest.d.ts:42-45` |

**⇒ 이 저장소에서 쓸 때의 함의 3건**
1. ⛔ ***"`defineSecret`은 미바인딩 컨텍스트에서 throw하므로 감쌌다"* 는 런타임에서 거짓이다.** `""`를 만드는 것은 `catch`가 아니라 `!value` 분기다. 결과가 같아도 **메커니즘이 틀리면 다음 사람이 `catch`를 지우고 "고쳤다"고 믿는다**. 이 저장소는 상류·PRD·코드 주석 **3계층**이 같은 틀린 서술을 공유하고 있었다(`realtime/provider.ts:23` · `llm/index.ts:22-31` · `session/index.ts:41-51` · `docs/PRD.md:8`).
2. ⭐ **`.value()`가 순수 `process.env` 판독이라는 사실이 재현 층을 연다** — *"미주입 → `""` → Mock 강등 → 안전 게이트 미발동"* 전 구간을 **배포 없이 단위 테스트로 결정론적으로 재현**할 수 있다. 배포가 필요한 것은 *"플랫폼이 미선언 시크릿을 실제로 주입하지 않는가"* 한 칸뿐이다. ⇒ [[feedback_inherited_impossibility_is_layered]]를 이 자리에 적용하라.
3. ⭐ **SDK 경고가 이미 처방까지 담고 있다** — *"관측 가능한 신호가 없다"* 로 설계를 시작하지 마라. 단 그 경고는 **`process.env[name]`이 `undefined`일 때만** 나고, 빈 문자열·placeholder 주입에는 나지 않는다.
4. `StringParam`(`defineString`)은 **다른 클래스**다 — 위 판정을 그대로 옮기지 말 것.

관련: [[feedback_absence_claims_check_the_sdk]] · [[feedback_secret_declaration_is_a_list_not_a_site]] · [[reference_gemini_quota_429_shape]]
