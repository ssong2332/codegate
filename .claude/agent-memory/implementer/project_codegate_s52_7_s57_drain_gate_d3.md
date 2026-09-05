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

---

**REJECTED 후속(커밋 `1e9cd24`, 2026-09-06)** — reviewer가 `e4414c3`를 REJECTED: 상한(나)이 재평가될
"다음 호출"이 영영 안 올 수 있다(`handlePlaceVerifyCall`의 재연결 지시가 큐의 마지막 항목이고
참가자가 계속 침묵하면 `drainInstructionQueue`를 다시 부를 자연 이벤트가 없다 — 정체가 세션
타임아웃까지 간다).

⭐⭐ **reviewer의 제안 문구를 문자 그대로 구현하면 안 된다** — "억제가 상한에 닿으면 그 호출
안에서 즉시 방출"은 `shouldDrainInstructionQueue`의 상한 비교를 사전값(streak>=cap)에서
사후값(streak+1>=cap)으로 바꾸는 것과 같다. 그런데 bank 턴3(예고)→턴4(재연결) 전환은 §49 V5
자동 전환이 참가자 의사와 무관하게 게이트 도달만으로 진행되므로, 이 경계에서는 **항상**(드문
예외가 아니라 매번) streak가 0→1로 오르며 그 즉시 통과한다 — guarded 회귀 테스트("[§52.7
가/T-4] 직전 주입 이후 참가자가 한 번도 말하지 않았으면 다음 경계에서는 억제한다",
`suppressedBoundaryStreak: 0` 입력)의 취지와 정면 충돌하고, T-4를 **일반 경로에서** 재현한다.
이 결론은 추측이 아니라 실제 호출 그래프(두 call site: `handleScammerTurnComplete`·
`enqueueTurnInstruction`, `instructionBusyRef` busy-gate)를 추적해서 얻었다 — reviewer 지시문의
표면적 문구를 그대로 옮기면 안전해 보이는 리팩터가 실제로는 이 코드베이스가 이미 테스트로
고정해 둔 회귀를 되살린다는 사례.

**채택한 처방**: 판정 함수는 그대로 두고, `agentSpeechGate.ts`의 `STALL_GRACE_MS` 패턴(이미
`INSTRUCTION_DRAIN_MAX_SUPPRESSED_BOUNDARIES` 자체의 존재 근거로 인용돼 있었다)을 재사용해
**유예 시간 있는 재평가**를 추가했다: 상한 도달 시각을 `instructionCapReachedAtSecRef`에 찍고,
이미 떠 있는 통화 경과 타이머(`elapsedSec`, 1초 틱, `play/page.tsx`)가 신설
`INSTRUCTION_DRAIN_BACKSTOP_SEC`(5초, `verifyIntercept.ts`)를 넘기면 `drainInstructionQueue`를
다시 불러 **기존 로직**이 정상적으로 방출하게 한다. reviewer가 명시적으로 금지한 "타이머 기반
백스톱"을 최후 수단으로 명시적 정당화(위 규명)와 함께 채택했다 — 새 타이머를 만들지 않고 이미
존재하는 elapsedSec 틱에 올라탄 것이 핵심 절충(완전히 새로운 setTimeout이 아니다).

⚠️ **바렐 재수출 함정 재발**([[project_codegate_t133_secret_declaration_gate]]와 같은 종류) —
`src/lib/verifyintercept/verifyIntercept.ts`에 새 상수를 export해도 `src/lib/verifyintercept/
index.ts`의 `export { ... } from "./verifyIntercept"` 목록에 없으면 `npm run build`가 실패한다
(런타임 아님, TS/webpack 정적 export 검사). 이 파일에서만 벌써 2번째(§45.7 V2 때도 아니었으나
이번에 처음 직접 겪음) — **새 export를 추가할 때마다 barrel(index.ts)도 함께 고쳤는지 확인할
것**, `npm test`(node --test)는 barrel을 거치지 않고 `./verifyIntercept.ts`를 직접 import해서
이 누락을 못 잡는다(빌드에서만 걸린다).

검증: `npm test`(root) 352 pass / 0 fail(신규 3개, 349→352) · `npm --prefix functions test` 706
pass / 0 fail(무변경) · `npm run build` 통과(barrel 수정 후) · 대상 파일 4개 `npx eslint` 무경고.
