---
name: exception-belongs-to-conditional-layer
description: 규칙 충돌을 풀 때 예외는 "그 조건을 아는 층"에 둔다 — 무조건 방출되는 콘텐츠를 좁히면 조건이 없는 세션까지 약해진다
metadata:
  type: feedback
---

두 지시가 충돌할 때, 예외·우선순위 선언은 **충돌 조건이 성립할 때만 방출되는 층**에 얹는다. 무조건 방출되는 콘텐츠(시나리오 카탈로그·페르소나 문면)를 좁혀서 풀지 않는다.

**Why:** T125 실측 — 확인 시도 저지 충돌에서 시나리오 수법(`weakenedTactics`/`personaPrompt`)은 난이도·메커닉 상태를 모른 채 무조건 방출되고, 예외 블록은 `verifyInterceptEnabled`(= 그 예외가 정당한 조건 그 자체)일 때만 붙는다. 수법 쪽을 좁히면 **예외의 근거가 없는 난이도에서도 수법이 무뎌진다** — 사용자가 명시적으로 금지한 방향이었다. 부수적으로 규칙이 N벌로 복제되는 드리프트(G84 계열)도 함께 온다.

**How to apply:** 후보를 고르기 전에 "이 문자열은 **어떤 조건에서 방출되는가**"를 코드로 먼저 확인하고, 조건이 예외의 정당화 조건과 **일치하는 층**을 고른다. 예외를 얹을 때는 **반대 조건(원래 규칙이 그대로 적용되는 경우)을 같은 블록에 명문화**해야 모델이 과일반화하지 않는다. 관련: [[feedback-norm-beats-example]] · [[feedback-inherited-impossibility-is-layered]]
