---
name: codegate-prefetch-race-audio-prime
description: 2026-10-18 미리 받기 경합(createPrefetchSlot) + 수정안 A(받기 탭 안 AudioContext 동기 생성) + ?audiodebug=1 패널 — 소유권 설계, 게이트 갱신 지점, 재발 함정
metadata:
  type: project
---

라이브 d13e718 무음(갤럭시 S25 · 웨일) 조사 중 작업. 브랜치 claude/fix-realtime-prefetch-race.

- 미리 받기 판단은 `prefetchFreshness.ts` `createPrefetchSlot`(잎 모듈) — 훅은 ref 하나에 담아 쓰기만 한다. 가짜 mint로 발급 횟수를 세는 실행 테스트가 가능해졌다(소스 단언보다 강하다).
- 수정안 A 소유권 = 통화 화면 한 곳. GeminiVoiceSession은 빌려 쓰고 닫지 않는다 — **Strict Mode mount→cleanup→mount에서 첫 cleanup이 닫으면 두 번째 실행이 닫힌 ctx를 받기 때문**.
- 새 `src/components/*.tsx`를 만들면 갱신할 곳 3군데: inSessionMarkers G436 등록부(개수 단언) · G437 범위 개수(in-session이면 +1) · harmlessnessScreens CLIENT_SCREEN_INVENTORY.
- 터치에서는 pointerdown이 사용자 활성화가 아니다(pointerup/touchend가 활성화) — resume 안전망 이벤트 선택 근거.

**Why:** 다음 실기 결과(패널 수치)로 후속 수정이 올 가능성이 높다.
**How to apply:** 함정 재발 — python heredoc 안에서 `"\n"`을 쓰면 실제 개행이 소스에 박힌다(TS 문자열 깨짐). JS 정규식/개행 리터럴은 Edit 도구로 넣을 것. 근거 주석에 금지어("await")를 쓰면 내 소스 단언이 걸린다 — 단언 전에 주석을 걷어 낼 것.
