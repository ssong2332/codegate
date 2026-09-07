---
name: project-codegate-s59-commit-d-tool-backstop
description: §59 커밋 D(천장/백스톱) 구현 — 도구 지연 창(shouldFireBackstop) + 모델 성공/실패 신호를 부모로 되돌리는 콜백 배선(§59 커밋 C가 "커밋 D의 몫"으로 인계한 지점). 중복 발동 방지 설계.
metadata:
  type: project
---

브랜치 `feat/s59-tool-backstop`(main `6544d11` 기준, 커밋 `a2869e7`, push 완료·PR 미생성)에서
`docs/Architecture.md` §59.8/§59.9(R6)/§59.10 커밋 D만 구현. [[project_codegate_s59_commit_ab_tool_timing]]·
[[project_codegate_s59_commit_c_tool_ignition]]·[[project_codegate_s59_commit_c_review_fixes]]·
[[project_codegate_s59_commit_c_major1_fallback]]의 후속(A·B·C는 이미 main).

**핵심 설계 — `src/lib/realtime/toolWindow.ts`(신규, `verifyIntercept.ts`엔 얹지 않음, architect
지시).** `shouldFireBackstop({toolAvailable, boundariesSinceDue, secondsSinceLastBoundary,
toolCallFailed})` 순수 함수 + 판단값 `TOOL_WINDOW_MAX_BOUNDARIES=2`·`TOOL_WINDOW_STALL_SEC=90`
(architect §59.8 원문 그대로, 재검증 없음 — 라이브 미검증 판단값이라고 명시적으로 인계됨).
`toolAvailable===false ⇒ 즉시`(G388, 회귀 0의 유일한 레버) 순서가 1번째임이 핵심 — 도구 미선언
세션/항목은 오늘과 바이트 단위로 같은 타이밍.

**발견한 진짜 위험 — "지연 발동"이 만드는 중복 서술(narration) 문제, 지시문에 명시되지 않았지만
test(d)("모델이 성공 처리하면 백스톱이 개입 안 함")가 요구하는 것.** 기존(커밋 C까지) 앱은 즉시
발동이라 항상 모델보다 먼저 이겼다 — 그래서 모델_tool 경로의 "이미 도착함(alreadyDelivered)"
응답이 announceInstruction/텍스트를 생략하지 않는 기존 결함(`buildInCallSmsResponse`가 status와
무관하게 항상 instruction을 채운다)이 표면화되지 않았다. 지연 발동으로 바꾸면 모델이 먼저
성공할 기회가 생기므로 이 결함이 실제로 중복 서술을 낼 수 있다. 2단 방어로 닫음: ①
`GeminiVoiceSession.tsx`의 `dispatchToolCall`이 성공/실패마다 부모 콜백 4종
(`onModelToolSmsDelivered/Failed`, `onModelToolVerifyAnnounced/Failed`)을 부르고, 부모는
`requestedSmsRef`(SMS)·`verifyOfferPhaseRef`(오퍼)를 즉시 갱신해 다음 렌더에서 아예 "due"가 아니게
만든다(1차 방어, `pickDueInCallSms`/`nextVerifyOfferStage`가 자연히 걸러줌) ② SMS 백스톱 응답은
`result.status === "delivered"`일 때만 `announceInstruction`을 큐에 넣는다(2차 방어, 서버 응답
자체는 §59 범위 밖이라 무수정). 오퍼는 서버가 announce를 persist하지 않아(§38.4 후보 E) status로
구분이 안 되므로 ①(콜백)이 유일한 방어 — 이게 §59 커밋 C의 dispatchToolCall 주석이 "commit
단계는 부모의 기존 이펙트가 진다 — 그 배선은 이번 수정으로 0줄도 건드리지 않는다(범위 밖, §59.10
커밋 D의 몫)"라고 **미리 인계해 둔 지점**이었다(주석을 먼저 읽고 확인, 추측 아님).

**새 타이머 금지 — 기존 `elapsedSec` 틱에 올라탐(§52.7 (5) 나 관례 그대로 재사용).**
`lastScammerBoundaryAtSecRef`(사기범 턴 경계마다 `handleScammerTurnComplete`에서 갱신)를 새로
두고, `secondsSinceLastBoundary = elapsedSec - lastScammerBoundaryAtSecRef.current`로 계산.
`boundariesSinceDue`는 별도 카운터 없이 `scammerTurns - trigger.afterScammerTurns`로 유도(둘 다
같은 카운터가 만드므로 새 ref 불필요) — 코드 최소화.

**폴백 경로 회귀 함정을 사전에 피함.** `toFallbackCredentials`(`fallbackCredentials.ts`)는
`liveTools` 필드를 지우지 않는다(스프레드로 보존) — 그래서 Gemini→폴백 강등 세션은
`credentials.liveTools`가 남아 있을 수 있다. 오퍼 백스톱 게이트를 `stage==="announce" &&
callMode==="realtime"`으로 좁혀서, 폴백 경로(도구 개념 자체가 없다 — `GeminiVoiceSession` 자체가
안 마운트됨)에 지연이 새지 않게 했다. SMS 효과는 애초에 `callMode!=="realtime"`이면 통째로
return하므로 이 문제가 없었다(비대칭 확인 필요 — 확인 완료).

**검증 — 관측 불가 지점([[feedback_unobservable_behavior_gates]]) 2층.** `toolWindow.ts`는
순수 함수라 `toolWindow.test.ts`(10건)로 규칙 5행 전부 + 경계값 직접 고정. `GeminiVoiceSession.tsx`·
`play/page.tsx`는 마이크/WebSocket 강결합이라 `toolWindowWiring.test.ts`(18건, `fallbackCredentials.
test.ts`와 같은 `readFileSync` + `codeOnly` 소스스캔 관례)로 배선 존재·순서(R8: 백스톱 게이트가
단계 전이 대입보다 먼저 와야 return이 성립)·역검증(오염본이 실제로 걸리는지) 고정.

**테스트 결과**: root `npm test` 370→398(+28) pass/0 fail. functions `npm --prefix functions test`
751(무변경, functions/** 0줄 접촉). `npm run build`·`npm --prefix functions run build` 둘 다 통과.
`npx eslint`(대상 5개 파일 개별) 무경고. `package.json`의 `test` 스크립트에 신규 파일 2개를
직접 추가(이 저장소는 글롭이 아니라 수동 나열 — 빠뜨리면 `testRegistration.test.ts`(N-3)가 잡는다,
실측으로 통과 확인).

**인계 2건(커밋 메시지·PR 본문에도 명시)**: ① `offer_verification_desk` announce 성공 시
`verifyAnnounceTurnsRef`에 기록하는 턴 앵커(`scammerTurnsRef.current`)가 정확히 몇 턴인지는
라이브 미검증 — 도구 호출이 `turnComplete`보다 먼저 도착하는 SDK 메시지 순서상 최대 한 턴 어긋날
수 있다. ② 상수 두 값 자체는 §59.13이 이미 "판단값·라이브 미검증"으로 못박은 것을 그대로 계승
(P-E는 커밋 E 소관, 이번 범위 아님).

관련: [[feedback_unobservable_behavior_gates]] · [[project_codegate_s52_7_s57_drain_gate_d3]]
(같은 "기존 타이머에 올라타기" 원칙의 선례) · [[project_codegate_s59_commit_c_major1_fallback]]
(이중 방어 설계 철학의 선례).
