---
name: secret-declaration-is-a-list-not-a-site
description: 시크릿을 여러 핸들러가 각자 선언하는 구조는 반드시 드리프트한다 — 단일 배열 상수로 바꾸고, 손으로 유지되던 목록은 전수 grep으로 재집계할 것
metadata:
  type: feedback
---

**Firebase Functions v2에서 `{ secrets: [...] }`를 핸들러마다 손으로 선언하는 구조는, 항목이 늘어나는 순간 "빠뜨린 핸들러만 조용히 실패하는" 결함을 만든다. 설계 시 단일 배열 상수(`GEMINI_KEY_SECRETS` 같은)를 export하고 모든 핸들러가 그것을 스프레드하게 하라.**

**Why:** §37(Gemini 키 순환) 설계 중 전수 grep으로 두 가지가 동시에 드러났다.
- **코드 주석이 자기 목록을 과소 서술하고 있었다** — `llm/index.ts`가 *"현재 3곳이 해당"* 이라 적는데 실제 `secrets: [` 선언은 **5곳**이었다(나중에 추가된 두 핸들러가 주석에 반영되지 않았다). 손으로 유지되는 목록은 반드시 밀린다.
- **선언 자체를 빠뜨린 핸들러가 이미 2개 있었다** — `verifyIntercept/index.ts`의 두 콜러블이 **옵션 객체 없이** `onCall<…>(async …)` 로 선언돼 있으면서 `getRealtimeProvider`(시크릿을 읽는다)를 호출한다. ⭐ **결과가 "조용한 실패"가 아니라 "조용한 통과"** 였다 — 키를 못 읽어 Mock 프로바이더로 해석되고, 그 결과 서버측 재검증 가드가 **발동하지 않는다**. 에뮬레이터는 `.env`를 선언과 무관하게 로드해서 드러나지 않는다(추정).

**⚠️ 정정(2026-07-29, T133/§41 — SDK 실측):** 위 문단이 물려받은 서술 중 **메커니즘 한 줄이 틀렸다.** *"미바인딩에서 `.value()`가 throw하고 `readSecret`의 `catch`가 삼킨다"* 는 **런타임에서 거짓**이다 — `SecretParam.value()`는 배포 분석 단계에서만 throw하고, 그 외에는 `process.env` 판독 + `logger.warn` + `""` 반환이다. **결론(조용한 통과)은 그대로 살아남았고 메커니즘만 바뀌었다.** 상세·파일:줄은 [[firebase-secret-param-semantics]]. ⇒ **"결과가 같다"는 메커니즘 검증을 면제하지 않는다.**

**How to apply:**
- 시크릿·환경변수가 **하나에서 목록으로 바뀌는** 설계를 할 때는, 개수를 늘리는 비용이 **"한 파일 한 줄"** 이 되게 만들어라. 핸들러를 N곳 고치게 하는 설계는 반려 대상이다.
- 상류(또는 코드 주석)가 *"이 시크릿을 쓰는 곳은 N곳"* 이라고 인용하면 **믿지 말고 `secrets:\s*\[` 전수 grep으로 재집계**하라 — [[upstream-cited-identifiers-may-not-exist]]와 같은 부류다.
- 그리고 **반대 방향도 grep하라**: 시크릿을 *읽는* 코드 경로(팩토리·프로바이더)를 호출하면서 *선언하지 않은* 핸들러. 이쪽이 진짜 결함이 숨는 자리다.
- 미설정 슬롯을 선언해도 되는지는 **가정하지 말 것** — 이 저장소는 `defineString`이 미설정 값을 대화형으로 물어 **배포·기동을 멈춰 세운 실측 선례**가 있고(`shared/config.ts` 주석), 그래서 `ELEVENLABS_AGENT_IDS`는 `process.env` 직접 읽기다. **강등 목적지가 이미 선례로 존재**하므로 프로브 + if/then 강등표로 남겨라.

관련: [[gemini-quota-429-shape]] · [[hard-gate-executability]] · [[absence-claims-check-the-sdk]]
