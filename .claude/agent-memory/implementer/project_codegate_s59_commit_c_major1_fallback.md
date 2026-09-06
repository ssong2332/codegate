---
name: project-codegate-s59-commit-c-major1-fallback
description: §59 커밋 C reviewer APPROVED 후 남은 Major #1(도구 응답 배치의 구조적 방어 공백) 수정. collectToolResponses 설계, 관측 불가 지점을 소스스캔 배선 게이트로 고정한 방식.
metadata:
  type: project
---

브랜치 `feat/s59-tool-ignition`(`a6d3574` APPROVED 기준, `5888740`으로 이어붙임)에서
reviewer가 APPROVED와 함께 남긴 Major #1을 고쳤다. [[project_codegate_s59_commit_c_review_fixes]]의
후속(그 REJECT 2건과 달리 이번엔 APPROVED 상태에서의 개선 요청).

**문제.** `GeminiVoiceSession.tsx`의 `onmessage`에서 `void (async () => { const responses =
await Promise.all(calls.map(dispatchToolCall)); ... session.sendToolResponse(...) })()` 형태였다.
`sendToolResponse` 자체는 try/catch로 감쌌지만 `Promise.all(...)` 부분은 무방비 — `dispatchToolCall`이
오늘 모든 분기에서 값을 반환하는 건 우연이지 구조적 보장이 아니었다(Gemini Live 도구 기본값이
`Behavior.BLOCKING`이라 응답 생략=통화 정지, G390).

**해법 — collectToolResponses(순수 함수, `liveToolResponse.ts`).**
```ts
export async function collectToolResponses(calls, dispatch) {
  try {
    return await Promise.all(calls.map((call) => dispatch(call)));
  } catch {
    return buildUnsupportedToolResponses(calls); // 이미 있던 폴백 빌더 재사용
  }
}
```
`GeminiVoiceSession.tsx`는 `await collectToolResponses(calls, dispatchToolCall)`로 이 함수를
부르기만 한다 — 기존 `sendToolResponse` 자체의 try/catch(전송 실패 대응)는 그대로 유지해 이중
방어(안쪽=콜러블별 실패, 바깥쪽=collectToolResponses의 구조적 폴백)가 되게 했다. "하나를 없애지
말고 겹치게 배치하라"는 지시를 그대로 따른 설계.

**검증 — 관측 불가 지점([[feedback_unobservable_behavior_gates]])을 두 층으로 나눠 고정.**
① `collectToolResponses` 자체는 순수 함수라 단위 테스트로 직접 강제 실패를 재현할 수 있었다
(dispatch를 throw하도록 모킹 → 여전히 `buildUnsupportedToolResponses(calls)`와 동일한 폴백이
나오고 응답 배열 길이가 생략 없이 유지됨을 확인 — reviewer가 요구한 정확한 시나리오).
② 하지만 `GeminiVoiceSession.tsx`의 `onmessage` 클로저 자체는 AudioContext·getUserMedia·
GoogleGenAI에 강결합돼 node:test로 직접 실행 불가 — `fallbackCredentials.test.ts`(§54)와 같은
관례로 **소스스캔 배선 게이트**를 추가해 "collectToolResponses가 sendToolResponse보다 먼저 실제로
불린다"를 문자열 위치 비교로 고정하고, 옛 무방비 `Promise.all` 패턴으로 되돌린 오염본이 같은
게이트에서 실제로 떨어지는지 역검증까지 넣었다(공회전 방지).

**테스트 결과**: root 364→370(+6: collectToolResponses 강제실패/부분실패/회귀0/빈배열 4건 +
GeminiVoiceSession.tsx 배선 소스스캔 2건). functions 751 유지(무변경, functions 쪽 파일은
건드리지 않음). `npm test`(root)·`npm --prefix functions test`·`npm run build`(root)·
`npm --prefix functions run build` 전부 통과. 커밋 `5888740`, push 완료.

**스코프 준수**: 지시받은 대로 라우팅/계열 게이팅 등 이미 리뷰 통과한 로직은 0줄 수정 — 오직
`Promise.all` 호출 부분의 방어 구조만 바꿨다. architect 전용 문서(Architecture.md 등)도 미수정.
