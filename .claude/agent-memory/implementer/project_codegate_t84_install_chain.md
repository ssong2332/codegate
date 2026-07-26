---
name: codegate-t84-install-chain
description: T84(모의 앱 설치+3단계 결합) 구현 중 얻은 함정 — 설계가 규율 안 한 문구 전달 경로, kindRank 병렬 충돌, 축 커버리지 게이트 연쇄, 격리 에뮬레이터 config는 절대경로 불가
metadata:
  type: project
---

T84(`feat/T84-install-chain`, 2026-07-26)에서 **설계 문서를 읽어도 알 수 없었던 것들**만 남긴다.
코드·커밋 메시지에 이미 있는 내용은 적지 않는다.

## 1. 아키텍트가 카탈로그에 넣으라고 한 화면 문구의 **전달 경로가 설계에 없었다**
§15.9.1 R3는 서버 전용 카탈로그에 `headline`/`bodyLines`/`consentLabel`을 두라고 했지만,
그 문자열이 **클라 컴포넌트에 어떻게 도달하는지는 어디에도 없다** — 콜러블 응답은 `{ok:true}`뿐이고,
attachment에 실으면 `messages`에 저장돼 사후 화면 재구성 금지(§15.9.5 e-4)와 충돌한다.
**해결**: 컴포넌트가 문구를 하드코딩(기존 credential-form 관례 그대로)하고, 카탈로그를 정본으로 두되
**소스 텍스트 대조 드리프트 테스트**(`src/components/mockScreenCopy.test.ts`)로 두 사본을 묶었다.
**Why:** functions/와 src/는 별도 TS 빌드 루트라 import로 공유할 수 없다(publicMeta 미러와 같은 상황).
**How to apply:** 병렬 작성된 architect 절이 "카탈로그에 넣어라"만 말하고 렌더 경로를 안 적었으면
전달 경로를 임의로 신설하지 말고 하드코딩 + 드리프트 테스트로 닫고 보고하라.

## 2. 병렬 작성된 두 절이 **같은 정렬 rank 번호**를 배정했다
§15.9.5 e-2 (5)는 mock-screen 항목을 `kindRank 2`로 두라고 적었으나, 같은 시기 T79가 확인 항목에
이미 2를 썼다(§16.3.5). 의도(메시지·문자 뒤에 온다)만 지키고 **3으로 내렸다**.
**Why:** 설계 절이 격리 워크트리에서 병렬 작성되면 번호·슬롯 예약이 서로를 모른다 — §15.9 도입부가
"G 번호 예측이 셋 다 빗나갔다"고 자백한 것과 같은 부류다.
**How to apply:** 설계가 지정한 **번호**가 이미 점유돼 있으면 번호가 아니라 **순서 의도**를 지키고
보고하라. 코드에 왜 번호가 달라졌는지 주석으로 남긴다.

## 3. 축 커버리지 게이트(T78)는 **콘텐츠를 건드리면 반드시 함께 깨진다**
`DECLARED_COVERAGE_GAPS` ↔ 실측 0건 집합의 양방향 deepEqual + "0건 값은 정확히 7개"라는
사전 계산 테스트가 있어, 시나리오에 축 값을 추가하면 **테스트 2개가 먼저 실패한다.** 이건 정상이며
해당 행 삭제가 "해소 기록"이다(axisCoverage.ts 주석이 명시).
추가로 `UNCONDITIONAL_DEMAND_BY_SCENARIO`(T91 교착 방지 표)가 **weakenedTactics 라벨 문자열을
손으로 지명**하고 있어, 수법 라벨 이름을 바꾸면 그 표도 함께 갱신해야 한다.
**How to apply:** 시나리오 `weakenedTactics`를 건드리는 태스크는 착수 시점에
`functions/src/scenarios/__tests__/{axisCoverage,scenarios}.test.ts`의 **하드코딩 표 3종**
(gaps·0건 개수·요구 수법 지명)을 먼저 확인하라.

## 4. 격리 에뮬레이터: `firebase.json`의 `functions.source`에 **절대경로를 쓸 수 없다**
CLI가 config 파일 위치 기준으로 join해 `<scratchpad>\C:\codegate\functions`가 된다.
**해결**: 임시 config를 **저장소 루트에** `firebase.t84-verify.json`으로 만들고
`--config firebase.t84-verify.json`으로 띄운 뒤, 검증이 끝나면 삭제하고 `git status`로 확인.
또 격리용으로 고른 9599/8580도 이미 점유돼 있었다(T83 때와 같은 현상) — **띄우기 전에
`netstat`으로 후보 포트를 전수 확인**하고 실패 시 남은 프로세스를 PID로 죽여야 한다.

## 5. 에뮬레이터 REST 검증의 두 함정
- Firestore REST는 **rules를 그대로 적용**한다 → 모든 read/write에 `Authorization: Bearer <idToken>`이
  필요하고, `users/{uid}/consents`를 먼저 심지 않으면 `createSession`이 AC-017 게이팅으로 거부한다.
- 최상위 `reports` 컬렉션 **list는 rules상 통하지 않는다**. AC-007("리포트 정확히 1개")은
  목록 세기 대신 **`reportId === sessionId` + generateReport 재호출 시 `createdAt` 불변**으로 증명하라.

## 6. 이 저장소의 에뮬레이터는 **실 Gemini로 돈다**(Mock 아님)
`GEMINI_API_KEY`가 잡혀 있어 sendMessage 응답이 실제 LLM 문장이다. 그래서 **설치 링크 제시 턴이
매 실행마다 다르다** — 1회는 6턴 내내 마커를 내지 않아 검증이 실패했고, 재실행에서 1턴에 나왔다.
**How to apply:** LLM 출력에 의존하는 라이브 검증은 **1회 성공을 근거로 삼지 말고** 편차를 그대로
보고하라. 결정론이 필요한 단언은 순수 함수 단위 테스트로 내려라.

관련: [[codegate-t83-verify-intercept]] (같은 `pickFallbackTurnInstruction` 슬롯을 확장했다),
[[codegate-t82-axis-model]] (여기서 만든 게이트가 3번 항목의 원인이다).
