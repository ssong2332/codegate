# ADR-0021: 사기범의 먼저 끊기 — 서버 승인형 끊기와 단일 종료 순서

- Status: proposed (메인 세션 승인 · 프로브 P-H 결과 뒤 accepted)
- Date: 2026-10-18
- Owner: architect
- DECISIONS.md entry: #138 · #139
- 상세: `docs/Architecture.md` §79

## Context
PRD v1.21 AC-103은 통화형 훈련에서 사기범 AI가 목적 달성(이체 제출 · 정보 받아냄) 또는 포기(반복 거절 · 의심)일 때 먼저 끊고, 참가자는 조작 없이 UX-007로 가도록 요구한다. 지금은 사기범 종료 경로가 0이고(`src/app/session/end/page.tsx:69` 사유 고정), 프롬프트는 무조건 *"너는 끝내지 않는다"*(DECISIONS #85 ⑪ · `functions/src/roleplay/promptAssembly.ts:160`)를 싣는다. 신고 ⑪의 결함은 *"끊겠다고 말하는 것"* 자체였다 — 끊기를 허용하면서 *"말만 하고 안 끊김"* 을 다시 만들지 않는 순서가 필요하다. 실시간(Gemini 3.8 Live)은 프롬프트가 토큰 발급 시 고정되고 응답이 오디오라 서버가 대사를 쥐지 못하며, 통화 화면은 세션 문서를 구독하지 않는다.

## Decision
끊기는 **서버가 승인한 뒤에만** 일어나고 작별 인사도 그 뒤에만 나온다: 실시간은 `BLOCKING` 도구 `end_call` → 콜러블 `requestScammerHangup`(판정 함수 `decideScammerHangup`) → 승인 응답 뒤 짧은 작별, 텍스트 폴백은 LLM 호출 전에 같은 판정을 통과한 턴에만 신호 문면을 싣는다. 사유는 새 값 `scammer_ended`이며 서버 표식(`sessions.scammerHangup`)이 있을 때만 기록되고, 모든 종료 트리거는 화면 함수 하나(오버레이 닫기 → 마지막 대사 대기 → 정지 → 전사 제출 → 사유 힌트 → 자동 이동)를 탄다.

| Option | Pros | Cons |
|---|---|---|
| BLOCKING 도구 + 서버 판정 콜러블 + 허용 턴 신호 ✅ | 승인 전 작별 0이 구조로 가능(3.8 BLOCKING = 먼저 호출 → 결과 뒤 말 — §71.2 인용값) · 기존 G390 · G430 · 보류 큐 재사용 · 두 경로가 판정 함수 1개 | 콜러블 1개 신설 · 도구 0개였던 Gemini 세션에도 선언 · 3.8 `end_call` 동작은 프로브 전 유추 |
| NON_BLOCKING 도구 | 응답 대기 없음 | 호출 = 턴 끝 → 작별이 승인보다 앞 → 거절 시 신고 ⑪ 재발 · §71.0 #4 범위 밖 |
| 출력 전사 키워드 감지 | 새 도구 0 | 승인 개념 없음 · 오탐 · 미탐 |
| 사유 `deceived` / `completed` 재사용 | 열거값 추가 0 | 모델 판단이 *"속았다"* 로 기록(AC-103 (e) 위반 위험) · *"사용자 완료"* 와 겹침 |
| 표식 없이 클라 주장 `scammer_ended` 그대로 기록 | 서버 변경 최소 | 기록 근거 0 · `endSession`이 오늘 열거 검증도 하지 않는다 |

## Consequences
- Positive: AC-007의 *"속아 넘어감/완료"* 종료 조건에 첫 도달 경로가 생기고 AC-089 (b) 해당 행이 탭 없이 성립한다. 종료 3경로의 복사 코드가 함수 하나로 모이고, 실시간 한도 종료가 `limit_reached`로 바르게 기록된다. `endSession`이 사유 허용목록을 검증한다. 리포트 판정은 사유를 읽지 않는다(현행 유지).
- Negative / accepted trade-offs: 끊기 판단은 모델이 하므로 너무 이르거나 늦은 끊기가 남는다(하한 4턴 판단값 — OQ-A118). 실시간의 턴 수 · 대기 여부는 클라 주장값이다(위조 효과 = 하한 우회뿐 — OQ-A120). 확인 무력화 고급 세션에서 호 전환이 없으면 끊기 0(OQ-A117). 참가자가 말로 끊기를 유도할 수 있다(OQ-A121). ElevenLabs는 미지원(PRD OQ-53).
- Follow-ups required: 프로브 P-H(H1 · H3 0/10 · H2 10/10 — §79.4) · `docs/API.md` · `docs/Database.md` 델타(§79.5) · ux-design 끊김 표시 정본(UpdateRequests #54) · scenario-review S3 · S4 · S5b · S7과의 병합 순서(§79.13) · 배포 Hosting → Functions.
