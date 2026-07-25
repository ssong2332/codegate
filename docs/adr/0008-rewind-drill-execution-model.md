# ADR-0008: 즉시 되감기(재연 드릴)의 실행·판정 모델 — 원 세션 미재개, 리포트 하위 append

- Status: accepted
- Date: 2026-07-25
- Owner: architect
- DECISIONS.md entry: #33
- 관련: UX.md UF-009 · UX-028 · D-39/D-40 / Architecture.md §15.2 / OQ-U17
- 관계: 기존 ADR을 뒤집지 않는다. **AC-007("종료된 모든 세션은 정확히 1개 리포트")** 불변식을 명시적으로 보호하기 위한 신규 결정이다.

## Context

UX v1.11(UF-009/UX-028)은 세션 종료 후 "속은 그 턴으로 되돌아가 **사용자가 직접 다시 답하고 즉시 판정을 받는** 한 턴 드릴"을 요구한다. 기존 UX-018(리플레이 해설)이 *읽는 복기*인 것과 달리 이쪽은 *입력이 있는 재연*이다.

이 기능은 앱에서 가장 깨지기 쉬운 두 불변식에 인접해 있다:

1. **AC-007 — 세션당 정확히 1리포트.** 현행은 `reportId = sessionId`를 멱등 키로 삼아 이미 있으면 재계산하지 않는다(`functions/src/report/generateReportCore.ts:28-35`). 되감기가 리포트를 덮어쓰거나 두 번째 리포트를 만들면 이 불변식이 깨진다.
2. **AC-021 — 세션 종료 즉시 폐기(ADR-0003).** 종료된 세션은 Storage 산출물·ElevenLabs voice가 이미 삭제됐다. 세션을 "재개"하려면 이 폐기를 되돌려야 한다.

또한 판정 후보인 `analyzeConversation`은 **대화 전체**를 훑어 scammer/user 쌍을 짝짓는 규칙 기반 순수 함수이고(`functions/src/report/analyzeConversation.ts:118-161`), 산출이 **2치**(속았다/아니다)라 UX가 요구한 3단계 중 "판단하기 어렵습니다"(기권)를 표현할 수 없다.

## Decision

**되감기는 원 세션·원 리포트를 읽기 전용으로만 참조하는 별도 1회성 평가다. 시도 기록은 `reports/{reportId}/rewindAttempts/{attemptId}` 서브컬렉션에만 append하며, 판정은 신규 콜러블 `judgeRewindAnswer`(LLM 1차 + 기존 규칙 패턴 폴백)가 담당한다.**

| Option | Pros | Cons |
|---|---|---|
| **별도 1회성 드릴 + 리포트 하위 append(채택) ✅** | AC-007·AC-021을 **건드릴 수 있는 코드 경로 자체가 없다**. 최상위 `db.collection("reports")` 쿼리(방어등급 재계산·아카이브)는 서브컬렉션을 포함하지 않아 기존 집계 무오염. 시도 기록이 원 리포트와 **같은 수명**을 가져 고아 레코드가 없다 | 판정 경로가 하나 늘어난다(LLM 호출 1종 추가). 되감기 기록을 리포트 삭제 없이 따로 지울 수는 없다(요구되지 않음) |
| 원 세션 재개(`status`를 active로 되돌림) | 대화 맥락이 살아 있음 | 종료·폐기(ADR-0003)를 되돌려야 하고 리포트 재생성이 필요해 **AC-007·AC-021이 동시에 흔들린다**. UX도 "원 세션 미재개"를 권고 |
| 되감기마다 새 세션 생성 | 기존 세션 기계 재사용 | `updateDefenseGrade`의 `sessionCount`/`defenseGrade`가 오염되고(`generateReportCore.ts:90-95`) 히스토리(UX-012)에 "훈련하지 않은 세션"이 쌓인다 |
| 시도를 저장하지 않음(순수 일회성) | 가장 단순, 스키마 0 | UX-028의 "한 번 더 답해보기"·UX-030의 반복 학습 서사와 어긋나고, 학습 이력이 남지 않는다. 저장 비용은 문서당 수백 바이트로 무시할 만함 |
| 판정에 `analyzeConversation`을 그대로 재사용 | 신규 코드 0, 결정론적 | 대화 전체 짝짓기 구조라 단일 답변에 안 맞고, **2치라 "판단하기 어렵습니다"를 표현할 수 없으며**, 그 순간의 수법 맥락을 보지 않는다 |
| 판정을 LLM에만 의존 | 맥락 반영이 가장 좋음 | 키 미설정 시 `getLlmClient()`가 Mock을 반환해(`functions/src/llm/index.ts`) 판정이 무의미해지고, 테스트가 비결정론적이 된다 |

세부 계약:

- **금지 목록(불변식 — 코드 리뷰 체크포인트):** `reports/{rid}` 문서 필드 update 금지 · 두 번째 `reports/*` 생성 금지 · `updateDefenseGrade`/`users.defenseGrade`·`sessionCount` 갱신 금지 · `sessions/*` write 금지.
- **판정:** LLM 1차 → 실패·Mock이면 **규칙 폴백**. 폴백은 `analyzeConversation`의 `RESISTANCE_PATTERN`/`COMPLIANCE_PATTERN`을 **export해 공유**한다(복제 금지 — 두 곳이 갈라지면 같은 답변이 리포트와 되감기에서 다르게 판정된다). 저항→`good`, 순응→`risky`, 둘 다 아님→`unclear`.
- **판정 프롬프트에 페르소나·`weakenedTactics` 원문을 넣지 않는다** — 이것은 역할극 재개가 아니라 평가이며, 새 사기 대사를 생성해서는 안 된다(AC-005/013). 입력은 그 순간의 `tactic`·`correctAction`·마스킹된 사기범 대사 + `wrapUserInputAsData(answerText)`(AC-024).
- **판정 불가(`unclear`)도 정상 결과**이며 이때도 `correctAction`은 반드시 반환한다(학습 최소 보장 — 조용한 실패 금지).
- **저장 전 `maskPII`**(원문 미저장, ADR-0004 계승). 답변 500자 상한, 리포트당 시도 50건 상한.
- **음성 입력은 v1 미제공**(텍스트 전용). 되감기는 통화 종료 후 화면이라 마이크 스트림이 이미 닫혀 있고, 한 턴 드릴에 마이크 재권한 비용이 학습 이득보다 크다.
- **2인 사용자2:** 익명 uid가 자기 리포트를 소유하므로(§14.7/ADR-0006) 소유권 검증만으로 그대로 동작하며, 사용자1은 접근할 수 없다(uid 격리 — 되감기가 그 격리를 새로 뚫지 않는다). AC-042 순서(정체공개 → 강제 해설 → 되감기)는 기존 UX-018 강제와 **같은 클라 층위**로 유지한다.

## Consequences

- **Positive**
  - AC-007을 "지키자"가 아니라 **"깰 수 있는 경로가 없다"** 로 만든다(쓰기 대상이 다른 문서라 실수로도 덮어쓸 수 없음).
  - 방어등급·히스토리·아카이브 등 기존 집계가 연습 반복으로 왜곡되지 않는다.
  - 규칙 폴백 덕에 LLM 키 없이도(현재 개발 환경 포함) 결정론적으로 동작·테스트된다.
- **Negative / accepted trade-offs**
  - 판정 품질이 두 종류(LLM/규칙)로 갈린다 — 그래서 응답에 `judgedBy`를 실어 **어느 쪽이 판정했는지 숨기지 않는다**.
  - 규칙 폴백은 문장 맥락을 보지 않아 `unclear`가 잦을 수 있다. UX가 이미 `unclear`를 정상 상태로 설계했고 모범 대처는 항상 제공되므로 학습이 끊기지는 않는다.
  - 되감기 시도는 리포트가 사라지면 함께 사라진다(별도 보존 정책 없음) — 의도된 설계다.
- **Follow-ups required**
  1. `analyzeConversation.ts`의 두 패턴 상수를 export(복제 금지 — §15.6 G7).
  2. `firestore.rules`에 `reports/{rid}/rewindAttempts` 규칙 추가(부모 리포트 소유자 read, 클라 write 전면 거부).
  3. 회귀 테스트: 되감기 호출 후 `reports/{rid}` 문서와 `users/{uid}.defenseGrade`·`sessionCount`가 **바이트 단위로 불변**임을 단언.
  4. planner: 재연 드릴을 규정하는 PRD AC 신설(OQ-U15).
