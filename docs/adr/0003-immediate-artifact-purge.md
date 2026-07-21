# ADR-0003: 생성물 즉시 폐기 — Firestore 트리거 + ElevenLabs voice 삭제

- Status: accepted
- Date: 2026-07-21
- Owner: architect
- DECISIONS.md entry: #5

## Context
AC-021(가드레일2)은 "훈련 세션 종료 시 생성된 클론 음성 및 기타 합성물이 스토리지에서 삭제되고 서버에 영구 저장되지 않으며, 삭제 이벤트가 로그로 남는다"를 요구한다. 프라이버시 리스크(생성물·민감 세션 기록 유출, PRD Risk)의 핵심 완화책이자 보안 배점 근거다. 폐기가 UI 흐름(사용자가 UX-007을 본다)에만 의존하면 사용자가 도중 이탈·브라우저 종료 시 생성물이 남는다. 또한 클론 음성은 Firebase Storage뿐 아니라 **ElevenLabs 측에도 voice로 저장**되므로, Storage만 지우면 외부에 클론이 잔존한다.

## Decision
`sessions/{sid}.status`가 `ended`로 바뀌면 실행되는 Firestore 트리거 함수 `onSessionEnded`가 폐기를 수행한다(UI 흐름과 분리). 폐기 대상은 ① Storage `users/{uid}/sessions/{sid}/**`(녹음·합성 오디오·사칭 이미지) ② **ElevenLabs의 클론 voice 자체**(DELETE voice API)다. 폐기 후 `session.voiceId`를 클리어하고, 감사 추적을 위해 `deletionLogs/{id}`에 sessionId·uid·deletedAt·targets[]·target별 결과(success/partial/failed)를 기록한다. 리포트·메타만 계정에 잔존(음성 없음).

| Option | Pros | Cons |
|---|---|---|
| Firestore 트리거 폐기 + ElevenLabs voice 삭제 + 삭제로그 ✅ | 이탈에도 폐기 보장, 외부에도 미잔존, 감사 로그 | 트리거 실패 시 잔존 위험(→ 로그·재시도로 완화) |
| 클라이언트가 종료 시 삭제 호출 | 구현 단순 | 이탈/브라우저 종료 시 미실행 → AC-021 위반 위험 |
| Storage만 삭제(ElevenLabs voice 유지) | 구현 최소 | 외부(ElevenLabs)에 클론 잔존 → 가드레일 취지 위반 |

## Consequences
- Positive: 사용자 이탈과 무관하게 서버가 폐기를 보장. Storage+ElevenLabs 양쪽 삭제로 "서버 미저장" 충족. `deletionLogs`가 삭제 이벤트 감사 근거(AC-021).
- Negative / accepted trade-offs: 외부 API(ElevenLabs) 삭제 호출이 일시 실패할 수 있음 → target별 결과를 남겨 `partial`/`failed`는 재시도 가능하게 설계. 완전 실시간 즉시성 대신 트리거 지연(수 초) 수용.
- Follow-ups required: `onSessionEnded` 구현(T10). `artifacts` 서브컬렉션을 폐기 매니페스트로 사용(무엇을 지울지 목록). 부분 실패 재시도 경로. 리포트 생성은 폐기와 독립적으로 마스킹 로그만 입력받아 진행.
