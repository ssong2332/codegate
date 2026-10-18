---
name: pending-flag-self-reference
description: "대기 중이면 막는다" 판정에 큐 대기 플래그를 넣을 때, 판정을 부른 사건 자체가 그 플래그를 먼저 세우는지 확인 — 세우면 항상 참이라 기능이 조용히 0이 된다
metadata:
  type: feedback
---

차단 조건에 "도구 대기 중(toolPending)" 같은 상태 플래그를 OR로 넣기 전에, **그 판정을 호출하는 경로가 플래그를 먼저 세우는지** 이벤트 순서를 코드로 읽는다.

**Why:** T192 §79.8/§79.18 원안이 `pendingInstruction = 지시 큐 ∨ toolPending`으로 썼는데, `end_call` 자체가 도구 호출이라 `toolCall` 이벤트가 `toolPending=true`를 세운 **뒤에** 분기한다(GeminiVoiceSession `:906` → `:908`). 결과는 모든 `end_call`이 `blocked_pending` — 오류도 로그 이상도 없는 기능 정지. S5b 재판정 패스(2026-10-19 §79.19 (3))에서 발견.

**How to apply:** 상태 플래그를 판정 입력으로 쓰면 "판정 호출 시점에 그 플래그의 값이 무엇인가"를 진리표 한 행으로 적고, 자기 자신을 뺀 형태(같은 배치의 *다른* 호출)로 정의한다. 역검증 테스트로 "원안 정의를 넣은 사본은 단독 호출에서 참"을 같은 출력에 보인다. 관련: [[defect-report-recheck-the-other-path]] (카운터 시작점이 경로마다 다른 문제와 같은 계열).
