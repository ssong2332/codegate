# ADR-0001: 3트랙 병렬 개발 경계와 계약 고정 방식

- Status: accepted
- Date: 2026-07-21
- Owner: architect
- DECISIONS.md entry: #3

## Context
개발이 Day1 하루(무박 야간 포함)에 끝나야 하고 코어 3명(제윤·진우·수홍)이 Tasks.md의 트랙 A/B/C로 병렬 작업한다(실명 미배정). Day2 오전은 버그픽스만 가능(신규 개발 금지). 병렬 개발이 서로를 기다리면(직렬화되면) 하루 안에 끝나지 않는다. 즉 **병렬 가능성 = 하루 완성 가능성**이며, 이 아키텍처의 존재 이유는 세 트랙이 상호 무차단으로 동시 진행되게 하는 것이다. 마이크로서비스·복잡한 레이어링은 하루 스코프에서 오버헤드다.

## Decision
트랙 경계를 코드 폴더로 나누고(Architecture.md §2·§4), 트랙 간 인터페이스를 **세 가지 계약**으로 T2 스캐폴딩 직후 스텁으로 먼저 고정한다: ① Firestore 문서 계약(`functions/src/shared/types.ts` = Database.md), ② Callable 함수 계약(`src/lib/api/*` = API.md), ③ 이벤트 이름 계약(UX Architect Handoff의 이벤트 상수화). 각 트랙은 실데이터/실구현이 없어도 계약(스텁)에 맞춰 개발한다.

| Option | Pros | Cons |
|---|---|---|
| 계약(Firestore+Callable+이벤트) 선고정 후 병렬 ✅ | 트랙 무차단, 스텁으로 즉시 병렬, 하루 스코프 최적 | 계약 변경 시 트랙 간 재조율 필요 |
| 별도 API 게이트웨이/마이크로서비스 분리 | 명확한 서비스 경계 | 하루 스코프 초과, 배포·통신 오버헤드 |
| 계약 없이 각자 개발 후 통합 | 초기 속도감 | 통합 시점 대량 충돌, 야간에 병목→하루 실패 위험 |

## Consequences
- Positive: A(음성·AI)/B(플랫폼·세션)/C(인증·온보딩·가드레일)가 T2 이후 동시 진행. 크로스트랙 의존은 2건(A→C의 `maskPII`, B→A의 `generateOpeningLine`)뿐이며 둘 다 passthrough/더미 스텁으로 선(先)해소.
- Negative / accepted trade-offs: 계약(스키마·시그니처) 변경은 세 트랙에 파급되므로 T2 직후 계약을 신중히 못 박고 이후 변경은 트랙 간 합의 필요. 얇은 결합(공유 타입 단일 정의)을 감수한다.
- Follow-ups required: T2에서 `functions/src/shared`·`src/lib/api` 스텁 커밋을 최우선 산출물로. 직렬 의존(T18→T3, T1→T4)은 Tasks.md대로 순서 유지.
