---
name: rejection-premise-same-flow-exists
description: "X를 서버로 올려야 해서 기각" 류 근거는 같은 X가 이미 다른 시점·같은 경로로 올라가는지부터 확인 — §22.2 B 재판정(T191 §82)에서 전제 오류로 판명
metadata:
  type: feedback
---

기각 근거가 "새 데이터 흐름이 생긴다(예: 미마스킹 전사를 통화 중 서버로)"이면, 그 데이터가 **이미 다른 시점에 같은 콜러블로** 서버에 가는지 먼저 grep한다. T191 §82에서 §22.2 B의 근거 ②는 `submitRealtimeTranscript`가 통화 종료 때 같은 원문을 받아 마스킹 후 저장하고 있어 전제 오류였다. 또 인용된 안전 규칙(G79)이 실제로 지키는 층(화면 vs 저장)을 원문으로 확인할 것.

**Why:** 상속된 기각은 시점(통화 중/종료)과 층(화면/서버/모델)을 섞어 적는 경우가 많고, User가 권고와 다른 선택을 하면 그 근거를 재판정해야 한다.

**How to apply:** 재판정 표에 "판별 질문 · 코드 실측 · 판정" 3열을 두고, 해소 조건(예: 서버 마스킹본으로만 인계 · 클라 요약 금지)을 금지 항목으로 승격한다. 관련: [[inherited-impossibility-is-layered]] · [[reserved-risk-may-be-impossibility]]
