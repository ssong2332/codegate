# ADR-0022: 참가자가 직접 거는 확인 전화(재연결) · 통화 중 문자 → 모의 설치 · 에스컬레이션의 (시나리오 × 난이도) 술어

- Status: proposed (진입 표면 OQ-A144 · S7 병합 뒤 accepted)
- Date: 2026-10-19
- Owner: architect
- DECISIONS.md entry: 미기재 — 초안은 `docs/Architecture.md` §84.12(다음 미사용 번호 #176~ 후보)
- 상세: `docs/Architecture.md` §84

## Context
PRD v1.26 AC-105는 모의 앱 설치에 응한 고급 세션에서 참가자가 **스스로 건** 확인 전화도 같은 조직이 받는 상황을 요구하고, DECISIONS #177(Q2)는 통화형 3종(`card-delivery-call` · `card-company-impersonation` · `loan-refinance-scam`) 고급에서 통화 중 문자 링크가 기존 `app-install` 화면을 열게 한다. AC-106은 `messenger-parcel-smishing-sms` 고급만 문자 → 설치 → 상담원 전화 3단계로 바꾼다. 현행 코드는 세 가정 위에 있다: ① 통화→통화는 같은 Live 소켓의 호 전환뿐이다(§22 · ADR-0013) ② 통화 중 문자로 `app-install`을 열지 않는다(§15.9.1 R6 · §19 G-A · G81 — 응낙 앵커를 합성 타임스탬프로 풀 위험) ③ 에스컬레이션은 시나리오 공개 메타 1필드다(`functions/src/scenarios/publicMeta.ts:31` — 서버 5곳 · 클라 4곳이 직접 읽는다). 또 UX D-121이 재사용하려던 *"직접 확인해 볼게요"* 컨트롤은 §49 V5로 삭제돼 있다(`src/lib/verifyintercept/verifyCallContinuity.test.ts:194-200`).

## Decision
1. **self-dial = 재연결.** 참가자가 창구를 고르면 신규 콜러블 `placeSelfDial`이 자격을 재계산하고(고급 · 비챌린지 · 도달 가능한 `app-install` 응낙 · 창구 카탈로그 · 끊기 미승인), 전사 델타를 마스킹 append한 뒤 **새 Gemini 토큰**(창구 페르소나 · 서버 인계문 · 다른 음성 가능)을 발급한다 — S7(`startRelayLeg`)과 **같은 코어**를 쓴다. 텍스트 폴백은 같은 트랜잭션 + 다음 `sendMessage`의 창구 프롬프트. 배치 뒤 AC-071 오퍼는 **선언 층에서** 끈다(거절 문면 재사용 0). 끊기 판정표에 `2-c self_dial_pending` 행을 더한다. §22는 고치지 않는다(대상 AC-071 무변경).
2. **Q2 = 금지 게이트의 허용목록 대체.** `in-call-sms ∧ app-install`은 위 3종에서만, 그 항목을 가리키는 문자는 고급 변형에서만 선언한다. 통화 중 응낙은 `recordMockScreenEvent`가 **명시 앵커**(`anchorScammerTurn` — `deliverInCallSms`와 같은 함수)를 써서 R6이 피하던 시각 기반 앵커를 타지 않는다.
3. **에스컬레이션 = `resolveScenarioEscalation(meta, level)`** — 공개 메타 `advancedEscalation`(parcel만) · 변형 플래그 `escalatesToVoice`와의 균일성을 테스트로 고정(AC-106 (i)). 챌린지 게이트 · send 목록은 시나리오 단위 그대로.

| Option | Pros | Cons |
|---|---|---|
| self-dial 재연결(S7 코어 공유) ✅ | 끊김 → 발신 → 새 통화가 소켓 종료 → 새 연결에 1:1 · 원 페르소나가 새 leg에 없다(§22 폐기 근거 소멸) · 목소리 결정(OQ-U86)과 독립 | S7 선행 또는 코어 선추출 필요 · 연결 지연(웜 0.8~1.5초 추정 · 미측정) · ElevenLabs 불가 → 라우팅 회피(OQ-A131) |
| self-dial 같은 소켓 지시 주입(AC-071 방식) | 신규 콜러블 0 | 음성 토큰 고정 → 같은 목소리 · 원 페르소나 잔류(§22가 폐기한 결함 재현) |
| Q2 허용목록 대체 + 명시 앵커 ✅ | R6의 원인(시각 앵커) 제거 · 범위가 3종 고급으로 닫힌다 | 하드 게이트 3개 개정 · 통화 세션에 `mockScreens` 문서 등장(stages 파생 세션화 필요 — G587) |
| Q2 문자 목적 `install` 신설 | loan의 `link` 슬롯 유지 | Live 도구 enum · 마커 · 넛지 · 테스트 전부 변경 |
| 에스컬레이션 (시나리오 × 난이도) 술어 ✅ | AC-046 ↔ AC-096 (e) 해석(#176)과 같은 단위 · 9곳이 함수 1개 | 리터럴 고정 테스트 갱신 · 클라 미러 1필드 |
| 에스컬레이션을 배정 변형 값으로 | 데이터 1곳 | 세션 전 화면(UX-025 · start-notice)이 변형을 알게 된다 — AC-096 (e) 위반 |

## Consequences
- Positive: AC-105가 지원금 · 택배 3단계와 통화형 3종 고급에서 일어날 수 있다. 3단계 메커니즘이 시나리오 신설 없이 난이도 1칸에 재사용된다. 통화 중 응낙의 리포트 앵커가 시각 합성과 무관해진다.
- Negative / accepted trade-offs: 진입 표면이 미정이라(OQ-A144 — §49 · DECISIONS #84와의 양립) U2 클라 구현이 그 결정을 기다린다. self-dial · 카드 · 릴레이 세션은 ElevenLabs로 가지 않는다. loan 고급의 신청서 링크가 설치 링크로 바뀐다(OQ-A145). 설치 문자를 백스톱이 강제하면 고급 문자 수가 1 늘어난다(OQ-A146).
- Follow-ups required: §84.10 병합 순서(U7 → PR-A1 → U1 → PR-A2 · D-115 → Q2 → S7 → U2) · `docs/API.md` · `docs/Database.md` 델타(구현 PR) · DECISIONS 행 4건 · ux-design의 D-121 전제 정정.

## Addendum (2026-10-20 — `docs/Architecture.md` §84.14 · DECISIONS #178 · #179 · #181 · #184)
- 진입 표면 확정: 통화 그리드 2행 3열 "연락처" 칸(UX D-125) — 렌더 원천은 세션 문서 `selfDial` 하나 · 상태는 순수 함수 1개(G592). Status의 "진입 표면 OQ-A144" 조건은 해소됐고 남은 accepted 조건은 S7 병합이다.
- 창구 목록에 공공 창구(`경찰청` · `금융감독원`)를 필수로 넣는다(D-123 번복) — 세션 중 숫자 0 · 서버 가나다순(G573 뒤집기). 대가: 세션 체험이 "112도 소용없다"로 남을 위험(High)은 리포트 L-1~L-3 · W-9~W-11(G578)과 모델 대면 문자열 검사(G594)로 줄이지만 관측 수단은 없다.
- 창구 상담원은 이전 모든 leg와 다른 음성(G595) — 오늘 성별당 음성 1개라 같은 성별 창구는 성별이 바뀐다(OQ-A136 풀 확장이 해소).

## Addendum 2 (2026-10-20 — `docs/Architecture.md` §84.15 · T194-c 착수 전)
- Decision 2의 명시 앵커는 **그 설치 랜딩을 연 문자 문서의 `anchorScammerTurn`을 복사**한 값이다(`deliverInCallSms`가 도착 때 계산한 값 — 응낙 시점의 클라 계수 아님). 응낙 요청의 `scammerTurns` 필드는 두지 않는다.
- D-61 오분류(T129)는 (시나리오 × 변형) 단위 도달 랜딩이 1건인 한 성립하지 않는다 — Q2 세 변형은 OQ-A145 = 교체(또는 loan 제외)일 때 1건이다. 대안 "목적 신설"이면 단위 2건이 되어 §35.6 1행(T129 (b) 선행 · 영속 스키마 · 별도 ADR)이 적용된다 — 이 ADR은 그 경우를 덮지 않는다.
