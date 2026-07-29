---
name: codegate-s38-verify-ordering
description: §38 확인창구 전환 순서 — 문서 존재를 판별자로 쓰는 2단 콜러블 패턴, 소스 게이트가 신설 설계와 정면 충돌한 사례, 격리 에뮬레이터 REST 4단 장애물
metadata:
  type: project
---

§38(확인창구 전환이 사기범 예고보다 먼저 일어난다)을 표시 층 + 런타임 층 2커밋으로 구현했다(PR #166, base main `c8c01a4`).

**Why:** 이 저장소는 "관측 불가 지점에 동작 걸지 말 것"과 "문서 구독이 단일 렌더 소스"를 반복해서 지불해 왔는데, §38이 그 둘을 **동시에** 요구한 첫 사례다. 아래 4건은 설계 문서에 없었고 실측으로만 나왔다.

**How to apply:**

1. ⭐⭐ **"클라 ref로 게이팅하면 새로고침에서 무너진다"의 해법은 *새 필드*가 아니라 *write 시점 이동*이다.**
   컨트롤 가시성을 늦추려 할 때 반사적으로 "새 타임스탬프 필드"를 떠올리게 되는데, 이 저장소는 그것을 §25.6에서 이미 기각해 뒀다(의미 오버로드). 채택된 형태는 **콜러블 요청에 `stage` 판별자 1개만 더하고 문서 `create`를 2단계로 미루는 것** — **문서 존재 자체가 판별자**가 되어 신규 문서 필드 0건 · 응답 스키마 델타 0건으로 새로고침 생존을 얻는다. 같은 모양이 필요해지면 `functions/src/verifyIntercept/buildDoc.ts`의 `resolveVerifyOfferPlan`(stage × placed 4칸 판정표)을 먼저 보라.
   ⚠️ **단, 그 문서가 다른 경로에서 *트리거*로도 쓰이면 순환한다** — 폴백은 문서를 읽어 announce를 고르므로 write를 미루면 예고가 영영 안 나온다. 그래서 경로별로 판별자를 달리 썼다(실시간=문서 존재 / 폴백=기존 `announcedAt` 읽기만). **한 메커니즘으로 억지 통합하지 말 것.**

2. ⭐⭐ **소스 스캔 게이트가 신설 설계와 정면 충돌할 수 있다 — 그때 지우지 말고 "같은 보호를 새 모양으로" 옮기고 항목을 늘려라.**
   `verifyCallContinuity.test.ts`의 T118 R-2 게이트가 `if (shouldRetryVerifyOffer(error)) requestedVerifyRef.current = false` **한 줄을 문자열로 못박고** 있었는데, 설계(G187)가 그 boolean을 단계 상태로 바꾸라고 지시했다 ⇒ 게이트가 반드시 빨간불이 된다. 처방: 어서션 **문면만** 새 모양으로 교체 + 갱신 사유를 주석으로 남기고 **항목을 2건 추가**(순수 함수 사용 강제 + boolean 부활 금지). 리뷰어가 "검사를 지웠다"로 읽지 않게 diff에서 순증이 보이게 만드는 것이 핵심이다.
   ⚠️ 파생 함정: `codeOnly()`는 주석을 걷으므로 **금지 토큰을 자기 주석에 쓰면 통과하지만 매우 취약하다** — 실제로 `requestedVerifyRef`를 설명 주석에 남겼다가 표현을 바꿔 지웠다(T83·T110에서 이미 데인 형태의 재발).

3. ⭐ **격리 에뮬레이터 REST 프로브의 장애물은 매번 4단이다 — 순서를 기억하면 왕복이 준다.**
   ⓐ 기본 포트 전부 점유 → 워크트리 안에 `firebase.probe.json`(상대 경로만, 절대 경로 불가) + 별도 포트 + `--project demo-*`.
   ⓑ env 파라미터 프롬프트로 기동이 멈춘다 → `functions/.env`를 **전 키 빈 값**으로 만든다(값이 없으면 프롬프트, 빈 값이면 통과). 부수 효과로 `getLlmClient()`가 `MockLlmClient`를 골라 **라이브 0회**가 된다 — P-4/E4에 그대로 쓸 수 있다.
   ⓒ Firestore REST 직접 write는 **rules에 막힌다** → `Authorization: Bearer owner`로 우회하되 ⛔ **Auth 에뮬레이터 요청에는 붙이지 말 것**(붙이면 `accounts:signUp`이 200을 주면서 `idToken`을 안 주고 `localId`만 준다 — 원인이 안 보인다). URL 접두사로 갈라 붙여라.
   ⓓ 콜러블 필드명은 추측하지 말고 소스에서 확인: `createSession`은 `voiceId` **필수**(scenarioId만으로 400), `sendMessage`는 `text`가 아니라 **`userText`**, 동의는 `users/{uid}/consents/*`에 **`granted:true`**.
   프로브 원본: 스크래치패드 `p38probe.mjs`.

4. ⭐ **한 스냅샷 항목을 둘로 쪼갤 때 진짜 비용은 React key와 "공유되는 필드"다.**
   `verifyTimeline[]` 항목을 오퍼/전환 2건으로 쪼개니 ⓐ `verify-${offerId}` id가 **중복**돼 두 렌더러(`report/page.tsx`·`buildReplayTimeline.ts`) 모두에 seq를 붙여야 했고, ⓑ `outcome`이 **두 항목에 공유**되므로 화면이 `outcome`으로 분기하면 **오퍼 항목까지 전환을 단언**한다 — 분기 기준은 "그 항목이 들고 있는 이벤트"여야 한다(`hasVerifyTransfer`). ⓒ 정렬 tie-breaker가 비교자 0 + **안정 정렬**에 의존하므로 비교자에 필드를 더 추가하면 조용히 깨진다.

관련: [[codegate-t83-verify-intercept]] · [[codegate-t118-transfer-persistence]] · [[codegate-t119-offer-gate-values]] · [[feedback-unobservable-behavior-gates]] · [[codegate-t130-npm-drift-guard]]
