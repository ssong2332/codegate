# ADR-0016: 익명 uid의 서버 권한 범위 — 챌린지 수신 경로로 한정

- Status: accepted (User 결정 C, 2026-09-30 — 오케스트레이터 전달)
- Date: 2026-10-01
- Owner: architect
- DECISIONS.md entry: #108
- 관련: ADR-0006(사용자2 익명 인증 재사용 — **본문 불변**, 이 ADR은 그 Decision의 "기존 콜러블 전부 무개정 재사용" 한 줄을 좁히는 후속이다) · DECISIONS #2(Google Provider) · #27 · Architecture.md §68(상세·근거 파일:줄 정본)

## Context
ADR-0006은 사용자2가 익명 인증으로 임시 uid를 얻고 **기존 콜러블을 무개정 재사용**하도록 정했다(`0006-user2-anonymous-auth-access.md:23`). 그런데 서버는 익명 여부를 어디에서도 검사하지 않는다(`functions/src` 비테스트 코드에서 `sign_in_provider`·`isAnonymous` 0건). 따라서 익명을 켜면 공개 웹 API 키만 있으면 익명 uid를 무한히 발급받아, 자가 훈련 LLM 경로(`createSession`·`sendMessage` 등)와 챌린지 생성(`createChallenge`)을 쓸 수 있다. §66의 uid 롤링 윈도우도 uid를 바꾸면 우회된다. 라이브에서는 익명이 꺼져 있어(오케스트레이터 실측: 400 `ADMIN_ONLY_OPERATION`) 지인 챌린지 수신 흐름이 0% 동작한다. User는 선택지 C — **익명은 켜되 서버가 익명 uid를 챌린지 수신 경로로만 제한한다** — 를 골랐다.

## Decision
**익명 호출자(`request.auth.token.firebase.sign_in_provider === "anonymous"`)는 챌린지 수신 경로에서만 허용한다.** 허용 범위는 입구 `consentChallenge`, 토큰으로 매개되는 `setChallengeResultSharing`, 그리고 **대상 세션·리포트에 `challengeId`가 있고 소유 uid가 호출자인** 세션·리포트 스코프 콜러블 14개다. 나머지 6개(`createSession`·`createVoiceClone`·`getBeginnerBriefing`·`createChallenge`·`deleteChallenge`·`listMyChallenges`)는 `permission-denied`로 거부한다. 판별식은 `functions/src/shared/anonymousGate.ts` 한 곳에 두고, 각 콜러블 본문에서 한 줄씩 부른다. 서버에는 환경 분기를 두지 않으며, 에뮬레이터 개발용 로그인은 익명에서 이메일 계정으로 바꾼다.

| Option | Pros | Cons |
|---|---|---|
| (C) 익명 켜기 + 서버 스코프 게이트 ✅ | 수신 흐름 복구. 익명 uid로는 유효한 챌린지 토큰 없이 LLM을 태울 수 없다. Google 동작은 바이트 단위 무변경. 규칙·인덱스 배포 불필요 | 콜러블 20곳에 한 줄씩 추가. 새 콜러블마다 분류가 필요하다(트립와이어로 강제). App Check 부재는 그대로 |
| 익명 켜기만(게이트 없음) | 변경 0 | 익명 uid 무한 발급으로 LLM·챌린지 루프를 남용할 수 있다. §66 창 우회 |
| ADR-0006 (B) 완전 자체 토큰으로 이행 | 익명 인증 자체가 불필요 | UX-014/018 재작성·병렬 콜러블 신설 — ADR-0006이 기각한 비용 그대로 |
| 에뮬레이터 예외를 서버에 둠(`FUNCTIONS_EMULATOR`) | dev 로그인 무변경 | 라이브 전에 게이트를 검증할 유일한 장소에서 게이트가 꺼진다. 보안 게이트에 환경 분기(백도어 형태)가 생긴다 |

## Consequences
- Positive: 익명이 LLM을 쓸 수 있는 상한 = "Google 계정이 만든 챌린지 수 × 챌린지 세션당 상한"(Architecture.md §68.8). 익명이 챌린지를 만드는 루프(`createChallenge`)가 닫힌다. Firestore 규칙 변경이 없다(익명이 새로 여는 쓰기 표면 0). 거부 코드 `permission-denied`는 T128 인증 무효화 배너를 발화시키지 않는다.
- Negative / accepted trade-offs: (1) ADR-0006의 "무개정 재사용"이 "스코프 검사 1줄 추가 후 재사용"으로 바뀐다. (2) 익명 사용자가 수신 흐름 밖으로 나가면 일반 오류를 본다 — 안내 문구는 OQ-A84. (3) 챌린지 경로 자체의 남용 상한(생성·삭제 루프, 실시간 자격증명 발급 횟수)은 **기존 문제**로 남는다 — OQ-A85. (4) App Check 부재는 이 결정으로 해소되지 않는다.
- Follow-ups required: Architecture.md §68.13 C1(게이트 + 20곳 + 테스트 T-1~T-4), C2(개발용 로그인 E2 + T-5), C3(README 활성화 순서 경고). 배포는 §68.10 순서를 따른다 — **익명 활성화는 전체 함수 배포와 Google 회귀 스모크 이후에만 하고, 롤백은 익명 끄기가 먼저다.** 구현 병합 뒤 API.md Auth 열을 갱신한다.
