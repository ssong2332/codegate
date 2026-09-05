---
name: project_codegate_s52_7_s57_drain_gate_d3
description: §52.7 (5) 가·나(G31 큐 드레인 참가자 턴 조건+상한) + §57.4 D3(전사 기록 시계 통합) 구현 — G369 동일 커밋 제약과 GeminiVoiceSession 크로스-effect 브리지 패턴
metadata:
  type: project
---

브랜치 `fix/s52-7-drain-condition-d3`(main `140135a` 기준, PR 미생성 — 지시로 스킵), 커밋 `e4414c3`.

**① `shouldDrainInstructionQueue`**(`src/lib/verifyintercept/verifyIntercept.ts`) — G99(`shouldReinjectTransferState`)와 같은 순수 함수 형태. 입력은 `userSpokeSinceLastInjection`(불리언, **첫 지시 전엔 `true`로 시작** — "아직 아무 빚도 없음"을 "열림"으로 표현)과 `suppressedBoundaryStreak`. 상한 `INSTRUCTION_DRAIN_MAX_SUPPRESSED_BOUNDARIES = 1`(agentSpeechGate.ts STALL_GRACE_MS와 같은 "판단으로 고른 값" 논리, bank 시나리오가 5~8턴 내외라 AC-007 전 도착 보장 우선). `play/page.tsx`의 `drainInstructionQueue`에 배선 — `instructionGateOpenRef`(기본 true)·`instructionSuppressedStreakRef`(기본 0) 두 ref로 구현하며, 실제 드레인 성공 시 `false`/`0`, `handleTranscriptTurn`의 `role==="user"` 분기에서 `true`/`0`으로 리셋. ⛔ 큐 자체는 항상 유지(G31 계약) — 억제돼도 `instructionQueueRef`에서 빼지 않는다.

**② D3**(`src/lib/realtime/GeminiVoiceSession.tsx`) — 타이핑 입력(`textMessage` effect)이 과거 `handlersRef.current.onTranscriptTurn("user", …)`을 **즉시** 불렀던 것을, 음성/모델 발화와 같은 flush 큐(`userBuffer`, 메인 connect effect의 지역 변수)에 적립하도록 변경. 두 effect가 서로 다른 클로저라 지역 변수를 공유 못 하므로, `liveSessionRef`와 같은 **크로스-effect ref 브리지 패턴**을 재사용 — `appendUserTranscriptRef`를 신설해 메인 effect가 `session` 연결 직후(line ~464) `appendUserBuffer` 함수를 담고, cleanup에서 null로 되돌린다. `onclose`의 `flushTranscript()` 호출이 그대로 남은 버퍼를 내보내므로 유실 없음(변경 불필요, 기존 경로 재사용 확인만).

**G369(동일 커밋 강제)** — ①의 `userSpokeSinceLastInjection` 게이트는 `handleTranscriptTurn`(=`onTranscriptTurn` 콜백)이 호출되는 시점으로 리셋되는데, D3가 그 호출 시점을 "입력 즉시"에서 "턴 완료(flush) 시각"으로 옮긴다. 두 처방을 분리하면 "참가자가 말했는가"의 뜻이 커밋 사이에서 갈린다 — 이번 세션에서는 하나의 커밋(`e4414c3`)으로 병합해 이 제약을 지켰다.

**검증**: `npm test`(root) 349 pass / 0 fail(신규 5개 포함, §52.7 태그 10 grep 매치=5 테스트×2줄) · `npm --prefix functions test` 706 pass / 0 fail(무변경 확인용) · `npm run build` 통과(TS 포함) · 대상 파일 5개 `npx eslint` 개별 실행 무경고(전체 `npm run lint`는 2분 타임아웃으로 백그라운드 전환 후 직접 대상 파일만 검사).

관련: [[project_codegate_t83_verify_intercept]](G31 큐·G99 원 설계) · [[project_codegate_t118_transfer_persistence]](G99 유래) · [[project_codegate_s55_d3_d4]](§57 계열 직전 작업).
