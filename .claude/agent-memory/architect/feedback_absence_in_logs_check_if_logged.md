---
name: absence-in-logs-check-if-logged
description: "로그에 X가 0건"이 증거가 되려면 X가 애초에 기록되는 코드가 있어야 한다 — 성공 경로 무로그면 정상에서도 0건이다
metadata:
  type: feedback
---

인계가 *"로그에 성공이 한 건도 없었다 / X가 0건이었다"* 로 오면, **X를 찍는 코드가 존재하는지부터 grep**한 뒤에야 증거로 쓴다.

**Why:** §56(텍스트 LLM 100% Mock 강등)에서 오케스트레이터의 기둥 증거가 *"성공 로그 0건"* 이었는데, 성공 경로(`GeminiLlmClient.complete`·`completeWithFallback` 성공 분기)는 **애초에 로그를 0줄 남긴다** — 정상 100%인 날에도 그 관측은 참이다. 실제 증거는 **매 호출 남은 warn**과 **화면 대사의 결정론적 역산**이었다. 같은 패스에서 *"실시간이 정상이니 텍스트 쿼터는 무죄"* 도 무너졌다: 두 경로는 **키만 공유**하고 엔드포인트(`authTokens.create` vs `generateContent`)·모델·호출 주체가 전부 달랐다.

**How to apply:**
- 부재 주장 3종을 같은 방식으로 갈라라 — ① 기록되는데 없다(증거) ② 기록되지 않는다(무증거) ③ 조회 범위 밖이다(함수·시간 범위).
- **자원 공유 주장도 같다**: "같은 키/같은 SDK"는 "같은 쿼터·같은 지연 축"이 아니다. 엔드포인트·모델·호출 주체를 표로 대조하고 나서 기각해라.
- 처방 순서는 **관측 증분 먼저**(경과 ms·토큰 수 등 분모를 만드는 1줄), 그 다음 스모크/알림. 순서를 뒤집으면 새 장치가 오늘의 로그와 같은 처지가 된다.
- 관련: [[feedback_cited_cause_must_explain_the_number]] · [[feedback_indistinguishable_states_pick_the_signal]] · [[feedback_stated_absence_check_the_scan_set]]
