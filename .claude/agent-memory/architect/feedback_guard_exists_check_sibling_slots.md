---
name: guard-exists-check-sibling-slots
description: 이 저장소는 같은 함정을 한 슬롯에서만 막아 두는 버릇이 있다 — 가드를 찾으면 형제 슬롯을 전수 대조하라
metadata:
  type: feedback
---

어떤 결함의 원인을 찾았을 때, **같은 파일·같은 계층에 그 함정을 이미 막아 둔 가드가 있는지** 먼저 본다. 있으면 결함은 "새 설계가 필요한 것"이 아니라 **"가드가 형제 슬롯에 복제되지 않은 것"** 이고, 처방은 그 가드와 **같은 형태**여야 한다.

**Why:** §52 R5에서 `personaStateTurn`(A5-α)은 `userTurnsSinceLastInjection >= 1`을 **G99로 명문화해** 자기 구동 루프를 막고 있는데(`src/lib/verifyintercept/verifyIntercept.ts:296-305`), **바로 옆의 `instructionTurn` G31 큐에는 같은 조건이 없어** 지시 주입이 참가자 턴을 통째로 소비하고 있었다. G99 주석이 그 실패를 *"참가자가 끼어들 수 없고 에러가 나지 않아 조용히 망가진다"* 라고 **이미 정확히 서술**해 두었다. 같은 형태를 §51도 겪었다(§50.6이 부작용을 1종만 고치고 5종에 남겼다).

**How to apply:**
- 원인을 확정하면 **그 파일의 다른 export·다른 prop 슬롯·다른 시나리오 항목**을 전수 대조한다. 대조 축은 "이 조건을 갖는가" 한 줄.
- 가드가 있으면 ⛔ 새 메커니즘을 발명하지 말고 **같은 순수 함수 계열로 신설**한다(복제 금지 — 이 저장소는 복제를 G84로 금지한다).
- 가드 주석이 적어 둔 **실패 서술**을 그대로 인용하면 판정 근거가 된다("설계가 이미 알고 있었다").
- 전역 가드에는 **상태별 예외와 상한**이 필요하다 — 조건을 곱하면서 상한을 안 두면 기능이 영영 안 나온다([[global-guard-needs-per-state-exception]]).

[[norm-beats-example]] · [[correction-sweep-reuse-sites]] · [[global-guard-needs-per-state-exception]]
