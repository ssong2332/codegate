---
name: order-audit-misses-early-return
description: 게이트 순서 대조표(소유→게이트→상태 throw 줄번호)는 게이트 앞의 "성공 조기 반환"을 못 본다 — 핸들러 머리부터 게이트까지 return을 센다; 문서 동기화 범위는 문서 절이 아니라 export 목록으로 잡는다
metadata:
  type: feedback
---

게이트가 "어떤 검사의 바로 뒤/앞"인지 형제 슬롯을 대조할 때 축을 **throw 위치**로만 잡으면, **게이트보다 먼저 나오는 `return`(성공 응답)** 은 표의 어느 열에도 안 잡힌다. AC가 "거부된다"를 요구하면 쓰기 0회의 성공 조기 반환도 **문면 위반**이다.

**Why:** 2026-10-02 T176 API.md 반영 패스. §68.15 (1) 형제 대조표는 S/R 14곳의 "소유 throw · 게이트 · 상태 검사" 줄번호만 비교해 M-1(2곳)을 찾았지만, `submitRealtimeTranscript`가 `turns: []`이면 세션 read·소유·게이트 **전에** `{ written: 0 }`을 반환하는 것(`functions/src/realtime/submitTranscript.ts:65-67`)은 놓쳤다. AC-085 (b) 갱신 고지는 *"성공 응답은 여전히 위반"* 이라고 명시한다. 같은 패스에서 지시문은 *"각 콜러블의 Auth 열"* 을 갱신하라고 했는데, API.md에는 **절 자체가 없는 export가 4개**(`updateMessengerSkin`·`requestEscalation`·`requestReverseEscalation`·`listMyChallenges`) + 존재하지 않는 export 이름의 절 1개(`transitionChannel`)가 있었다 — 문서 절 기준으로 돌았다면 5개가 조용히 빠졌다.

**How to apply:**
- 순서 대조표에 **"게이트 앞 return" 열**을 추가한다. 각 핸들러를 머리부터 게이트 줄까지 읽고 `return`·빈 배열 단축·멱등 분기를 센다.
- 발견하면 ⛔ 예외로 등재하지 말고(G420류 *"새 예외는 User 결정이 먼저"*) **"미판정 관측"** 으로 문서에 적고 보고한다.
- 문서 동기화 지시의 대상 집합은 **코드의 export 목록**(`functions/src/index.ts`)으로 잡고, 문서 절과 1:1 대조표를 먼저 만든다 — 절 없는 export는 부록 표로 덮는다(절 신설은 범위 밖).
- 관련: [[guard-exists-check-sibling-slots]] · [[stated-absence-check-the-scan-set]] · [[env-failure-control-is-order-evidence]] · [[same-symbols-different-subjects]]
