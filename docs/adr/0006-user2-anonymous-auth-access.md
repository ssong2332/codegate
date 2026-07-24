# ADR-0006: 2인 소셜 사용자2 접근 메커니즘 — 익명 인증 재사용(정제형 A1)

- Status: accepted
- Date: 2026-07-24
- Owner: architect
- DECISIONS.md entry: #27
- Supersedes(문구 한정): Architecture.md §14.0 point 1 "직접 Firestore 접근 없음", §14.1 "소유자 없음/토큰 바운드"
- 관련: ADR-0002(본인 목소리만), ADR-0003(즉시 폐기), ADR-0005(챌린지 스코프 클론), DECISIONS #2(Google Provider), #21/#22

## Context
PRD v1.1의 2인 소셜 훈련(AC-040~044/048)에서 **사용자2**는 로그인 없이 링크 토큰만으로 진입해(AC-048) 딥보이스 통화를 체험하고, 종료 시 강제 정체 공개(AC-042)+리플레이(AC-038)를 본다. T35(§14)가 데이터 계약(`challenges` 스키마·토큰·보존)을 고정했으나 **사용자2가 실제로 백엔드에 접근하는 메커니즘**은 미정으로 남았다. T37(사용자2 측 구현)이 이 위에 세워지므로 착수 전에 확정이 필요하다.

**미정이 낳은 실측 모순:** 기존 인프라(`createSession`/`sendMessage`/`createRealtimeCall`/`submitRealtimeTranscript`/`endSession`/`generateReport`, UX-014 통화 화면, UX-018 리플레이 화면)는 전부 `request.auth.uid` 소유권 + `firestore.rules`의 `resource.data.uid == request.auth.uid` read 게이트 위에 서 있다. 그런데 §14.1/API.md는 사용자2 세션을 "소유자 없음"으로 두라면서 동시에 `createRealtimeCall`(uid 소유 강제)을 "재사용"하라 한다 — 코드 레벨에서 성립 불가능한 조합이다.

두 가지 근본 구현형이 갈린다:
- **(A) 익명 인증**: 사용자2 브라우저가 로그인 UI 없이 Firebase Anonymous Auth로 임시 uid를 얻어 체험 세션을 소유. 기존 인프라 무개정 재사용.
- **(B) 완전 자체 토큰**: `request.auth` 없이 세션-스코프 비밀을 매 콜러블에 파라미터로 전달. `firestore.rules`는 이를 못 보므로 사용자2 경로 문서를 전부 `if false`로 잠그고 100% Functions 매개 → UX-014/UX-018 화면 재작성 + 병렬 콜러블 스택 신설.

## Decision
**(A) Firebase 익명 인증을 내부적으로 재사용한다 — 정제형 A1.**

- 사용자2는 **동의 시점**에 로그인 UI·비밀번호·계정 없이 익명 사인인해 **임시 `request.auth.uid`**를 얻고, 그 uid가 체험 `sessions/{sid}`를 소유한다.
- 이후 `createRealtimeCall`·`submitRealtimeTranscript`·`endSession`·`generateReport`·`report/replay` 화면·`firestore.rules` 소유자 read가 **전부 무개정 재사용**된다.
- 신규 콜러블은 **챌린지 문서만 만지는 토큰-매개**(getChallengeLanding·consentChallenge·reportChallenge·setChallengeResultSharing)뿐 — `challenges`가 `if false`라 어느 옵션이든 필요한 것들이다. T36의 `resolveChallengeByTokenHash`/`markChallengeConsumed`/`hashToken`을 재사용한다.

**정제(A1) — 두 지점을 손대야 하는 이유(정합성 요건, 선택 아님):** 챌린지 clone `voiceId`를 **사용자2 세션 문서에 저장하지 않는다.**
1. **유출 방지(AC-041):** 세션 문서에 담으면 사용자2가 소유자 자격으로 자기 세션을 직접 read할 때 사용자1의 raw clone id가 브라우저로 나간다(reviewer가 `challenges`를 잠근 Critical #1과 동형).
2. **폐기 격리:** `onSessionEnded`(guardrails/index.ts L131)가 `after.voiceId`를 ElevenLabs DELETE voice로 폐기 → 세션에 챌린지 voiceId가 있으면 **사용자2 첫 체험 종료 시 사용자1 챌린지 clone이 삭제**돼 기간제 보존(30일)·2차 taker가 깨진다.

따라서 체험 세션은 `challengeId`만 갖고, `createRealtimeCall`이 발급 시 `challenges/{challengeId}`에서 서버측(admin)으로 voiceId를 해석하고 **§14.2 발급 게이트(status∈{consented,in_progress}+미만료)를 재검증**한다. clone 수명은 챌린지 문서(`retentionDeleteAt`)에만 묶여 체험 세션 폐기와 분리된다.

| Option | Pros | Cons |
|---|---|---|
| (A/A1) 익명 인증 재사용 ✅ | UX-014·UX-018 무개정 재사용, 신규 콜러블 3–4개(양쪽 공통분), §0.1·§14.2 정합, 격리=앱 전체가 이미 신뢰하는 소유권 격리 동일 메커니즘 | Firebase 콘솔 익명 프로바이더 활성화 필요(설정), "무로그인"이 "보이는 로그인 없음"으로 해석됨, `createRealtimeCall`에 challenge 분기 1개 추가 |
| (B) 완전 자체 토큰 | "Auth 토큰 0"의 가장 문자적 해석 | UX-014/018 재작성 또는 포크(라이브 `onSnapshot` 상실), 병렬 콜러블 ~8–10개, 손으로 재구현한 토큰 스레딩이 검증된 Auth 토큰보다 취약, §0.1·§14.2 정면 위반 |

**AC-048 "무로그인" 판독:** 요구는 "사용자2에게 로그인을 요구하지 않는다"이다. 익명 인증은 계정·자격증명·로그인 화면이 전무하고 사용자에게 불가시하므로 문자 그대로 성립한다. DECISIONS #2 "Google Provider only"는 사용자1 로그인 UX 최소화 결정이지 익명 인증 금지가 아니며, 익명 인증은 그 회피 대상(로그인 UI)을 도입하지 않는다.

## Consequences
- **Positive:** 대규모 재작성 없이 T37 성립. AC-043 격리가 기존 소유권 규칙(내 세션은 남이 못 봄)의 재사용으로 강제됨 — 새 보증 표면 없음. resultSummary는 T9 리포트에서 서버 파생(별도 분석 파이프라인 없음). UX-018 리플레이 무개정 재사용.
- **Negative / accepted trade-offs:** (1) 익명 프로바이더 콘솔 활성화 의존(문서화·배포 체크리스트). (2) T9 defense-grade 갱신이 `users/<익명 uid>` 에페메랄 문서를 만든다(무해; 원하면 challenge 세션에서 grade 갱신 skip 최적화 — 정합성 무관). (3) "무로그인"의 문자적 순수성을 익명 토큰과 맞바꿈(§14.7.1 판독으로 정당화). (4) `createRealtimeCall`에 challenge 분기 신설(소규모).
- **Follow-ups required (T37 implementer):**
  1. `SessionDoc`에 옵셔널 `challengeId?: string`(indexed) 증분 — 체험 세션↔챌린지 링크(Migration Policy: 옵셔널, 기존 세션 무영향). `voiceId`는 challenge 세션에 **미저장**.
  2. `consentChallenge`가 세션 생성 시 익명 uid를 소유자로 세팅(voiceId 미저장, channel=voice, 한도·오프닝 라인은 `createSession` 로직 참고). `createSession`(사용자1 경로)은 **무개정**.
  3. `createRealtimeCall`에 `session.challengeId` 분기 추가: challenge admin read로 voiceId 해석 + status/만료 재검증. 소유권 검증(익명 uid)은 유지.
  4. 클라 사용자2 랜딩이 동의 시 `signInAnonymously(auth)` 호출(불가시). `firebase/auth`의 익명 사인인은 프로바이더 인스턴스 불필요.
  5. `setChallengeResultSharing(share=true)`가 세션 리포트를 서버 read해 `resultSummary` 파생(대화 전문 없음, AC-043).
  6. 검증: `onSessionEnded`가 voiceId 없는 challenge 세션에서 안전 no-op인지(purge.ts는 이미 "voiceId 없던 세션 안전" 명시) + 익명 uid Storage 경로가 비어 있는지 에뮬레이터 확인.
  7. 배포 문서: Firebase 콘솔 Anonymous 프로바이더 활성화 단계 README 반영.
