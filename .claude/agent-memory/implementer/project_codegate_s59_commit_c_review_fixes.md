---
name: project-codegate-s59-commit-c-review-fixes
description: §59 커밋 C reviewer REJECTED 2건(Critical #1 실제 도구 라우팅 부재·Critical #2 verifyOfferSeries 미게이팅) 수정. 클라 dispatch를 순수판정/부수효과로 분리한 설계, node 테스트 러너 디렉터리-import 제약 재확인, 소스스캔 테스트가 리팩터를 깨뜨린 사례.
metadata:
  type: project
---

브랜치 `feat/s59-tool-ignition`(`dd47173` 기준, 새 커밋들로 이어붙임)에서 reviewer가 REJECTED한
Critical 2건을 고쳤다. [[project_codegate_s59_commit_c_tool_ignition]]·[[project_codegate_s59_commit_ab_tool_timing]]의 후속.

**Critical #1(실제 도구 라우팅 부재) — 판정/부수효과 분리 설계.** `GeminiVoiceSession.tsx`가
`toolCall`을 전부 `{status:"unsupported"}`로만 답하던 문제를, "어느 콜러블인가"(`resolveToolCallKind`,
credentials.liveTools 값과 비교 — G385 하드코딩 금지)·"어느 smsId를 고를 것인가"(`pickModelToolSmsId`,
턴 게이트를 client가 보지 않고 서버 model_tool 경로에 위임)는 `liveToolResponse.ts`에 순수 함수로,
실제 `deliverInCallSms`/`deliverVerifyOffer` 호출(비동기·부수효과)은 `GeminiVoiceSession.tsx`의
`onmessage` 클로저 안에서만 하도록 갈랐다. 실패(콜러블 자체가 안 닿음)는 `credentials.liveTools.
failureInstruction`(서버 소유 문자열, G386)을 그대로 돌려주는 것으로 처리 — 새 한국어 문자열을
클라에서 저작하지 않는다. `offer_verification_desk`는 announce 단계만 이 경로로 태우고 commit
단계(문서 실제 생성)는 손대지 않았다 — announce는 side-effect-free(§38.4 후보 E, write 없음)라
기존 backstop 경로와 경합 없이 공존한다.

**smsId 선택 — "미도착 0건"을 서버 재호출로 흡수.** 카탈로그의 모든 항목이 이미 도착했을 때
`null`을 반환하는 대신 카탈로그의 가장 이른 항목을 다시 골라 서버에 보낸다 — 서버가 멱등하게
`already_delivered`로 응답하고, 그 문면이 §59.6 표가 `none_pending`에 요구한 것과 **동일**하다.
새 클라 문자열 0건으로 표의 요구를 만족시킨 판단(architect 원문에 이 케이스의 명문 처리 없음,
코드 주석+커밋 메시지로 인계).

**Critical #2(계열 미게이팅) — 값 흐름은 이미 있던 계층을 그대로 통과.** `verifySeriesFor()`
(`realtime/liveTools.ts`, 이미 `buildLiveToolDeclarations`가 쓰던 함수)를 재구현하지 않고,
`geminiProvider.ts`(유일한 `toolDrivenTiming:true` 호출부)가 계산해 `promptAssembly.ts`에
`verifyOfferSeries: "A"|"B"|undefined` 옵션으로 전달했다. `promptAssembly.ts`는 시나리오 카탈로그를
직접 읽지 않는다는 §17.3 원칙을 지키기 위해 옵션 타입은 인라인 `"A"|"B"`로 새로 선언(다른 옵션들
—speakerGender 등—과 같은 관례, liveTools.ts의 타입을 import하지 않음). `useToolDriven =
toolDrivenTiming && verifyOfferSeries === "A"`.

**소스스캔 게이트가 리팩터를 깼다 — T113.** `BuildSystemPromptOptions`에 옵션을 추가하면
`scenarios.test.ts`의 "[T113] 옵션이 전부 조립 스캔 헬퍼에서 쓰인다" 게이트가 그 옵션 키를
`assembledPrompts()` 헬퍼 영역에서 리터럴로 찾는다 — 새 옵션을 실제 조립 매트릭스(`assembledPrompts`)
에도 반영해야 통과한다(다른 시나리오-derive 옵션인 `identityCheckAllowed`/`speakerGender`와
동일한 패턴으로 `verifySeriesFor(scenarioId)`를 추가). 이런 종류의 "옵션 목록 vs 사용처" 소스스캔
게이트는 옵션을 추가할 때마다 재확인이 필요하다는 걸 재확인한 사례.

**geminiProvider.test.ts의 byte-equality 테스트도 함께 갱신 필요.** `sentPrompt === buildSystemPrompt(...)`
형태의 회귀 테스트는, 실제 호출부가 새 옵션을 넘기기 시작하면 **기대값 쪽도 그 옵션을 넘겨야** 계속
통과한다 — 옵션이 결과 문자열에 영향을 주는 조건(여기서는 `verifyInterceptEnabled:true`인 시나리오)
에서만 실제로 걸린다. 영향받지 않는 다른 테스트(옵션이 무효과인 조건)는 그대로 통과해 안전한 대조군
역할을 했다.

**node 테스트 러너 제약 재확인** [[feedback_unobservable_behavior_gates]] 계열 —
① `@/` 별칭은 `import type`이면 strip 단계에서 지워져 무해하지만, 실제 런타임 import(값)에는
tsconfig paths가 적용되지 않는다(webpack 전용). ② 디렉터리를 가리키는 값 import(`from "../incallsms"`,
배럴 index.ts를 향함)는 Node ESM에서 `ERR_UNSUPPORTED_DIR_IMPORT`로 즉시 깨진다 — 파일까지 명시하거나
(`.ts` 확장자 포함, 테스트 파일 전용 관례) 아예 로직을 인라인으로 재구현하는 것이 더 안전할 때가
있다(이번엔 `pickDueInCallSms` 재사용 대신 4줄짜리 선택 로직을 직접 작성 — 프로덕션 파일 간
`.ts` 확장자 상대 import는 이 저장소에 전례가 없어 새 패턴을 만들지 않는 쪽을 택함).

**소스스캔 테스트가 리팩터에 걸린 사례 — fallbackCredentials.test.ts.** `play/page.tsx`의
`GeminiVoiceSession` 마운트 조건에 `sessionId &&` null-guard를 추가하다가, 그 JSX 줄의 정확한
리터럴(`realtime.credentials?.provider === "gemini" && (`)을 그대로 검사하는 기존 소스스캔 테스트를
깼다. 해결: 조건을 두 줄로 나눠(바깥은 원래 리터럴 그대로, `sessionId &&`는 그 안쪽에 중첩) 테스트가
찾는 정확한 문자열을 보존하면서 실제 null-guard도 추가 — 테스트를 고치는 대신 코드 구조를 테스트가
기대하는 형태에 맞췄다(이 게이트가 지키려는 불변식—provider 판별자 존재—자체는 내가 훼손한 적이
없었으므로 정당).

**테스트 결과**: functions 748→751(+3: geminiProvider 계열B 테스트 1건 + promptAssembly 계열B
DEFAULT 유지·SMS 역검증 2건) · root 357→364(+7: resolveToolCallKind 3건 + pickModelToolSmsId 4건).
회귀 0. `npm --prefix functions run build`·`npm --prefix functions run lint`·`npm --prefix functions test`·
`npm test`(root)·`npm run build`(root) 전부 통과. 루트 `npm run lint`(비문서화 명령, functions
lint와 별개)는 5분 이상 응답이 없어 중단 — CLAUDE.md 검증 표에 없는 명령이라 DoD 판단에서 제외했다.
