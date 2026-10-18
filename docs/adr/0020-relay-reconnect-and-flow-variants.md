# ADR-0020: 릴레이 화자 교대 = 새 Live 연결 + 서버 인계 블록 (§22.2 B 재판정) · 흐름 변형 서버 전용 데이터

- Status: proposed
- Date: 2026-10-18
- Owner: architect
- DECISIONS.md entry: #137 후보(미기록 — 이번 패스는 DECISIONS 편집 금지. 병합 순서로 번호 확정)
- 상세: `docs/Architecture.md` §78

## 금지 (이 ADR을 근거로 구현할 때 먼저)
- ⛔ 인계문을 클라가 만들거나 클라가 보낸 요약을 프롬프트에 넣지 않는다. 인계문을 클라에 돌려주지 않는다.
- ⛔ ElevenLabs 경로에서 릴레이 변형을 실행하지 않는다(허용목록 `["gemini","none"]`).
- ⛔ 흐름 변형 데이터를 클라 번들 · `publicMeta` · `scenarios/{}` 에 두지 않는다. 세션 문서에는 불투명 ID만.
- ⛔ §22.2의 A · C · D · E 판정과 §16.5 원문은 바꾸지 않는다 — 이 ADR은 B 한 행의 근거만 정정한다.

## Context
User 결정 D3(DECISIONS #130)는 여러 사람 릴레이를 *"다른 목소리로 재연결"* 로 골랐다. §22.2 B는 소켓 재연결을 두 근거로 기각했었다: ① Live 대화 컨텍스트 소실 ② 컨텍스트를 넘기려면 미마스킹 전사를 통화 중 서버로 올려야 해 §19.6 (4) · G79 논거가 무너진다. AC-101 (d)는 이 둘을 다시 판정하고, 해소 못 하면 구현하지 말라고 했다. 동시에 AC-096은 난이도별 흐름 변형을 서버 데이터로 정의하라고 했다.

## Decision
릴레이 교대는 **이전 Live 연결을 끊고, 서버가 마스킹 저장된 `messages`와 변형 데이터로 만든 인계 블록을 새 토큰의 `systemInstruction`에 넣어 다른 음성으로 새로 연결**한다(텍스트 폴백은 같은 인계 블록 + leg 프롬프트 교체). 재판정: ①은 인계 블록으로 해소(조건부), ②는 전제 오류 — 같은 원문 전사가 이미 통화 종료 때 `submitRealtimeTranscript`로 서버에 올라가 `maskPII` 후에만 저장되며(`functions/src/realtime/submitTranscript.ts:110-136`), G79는 화면 표시 규칙이다(`docs/Architecture.md:2711` · `:2733`).

| Option | Pros | Cons |
|---|---|---|
| 새 Live 연결 + 서버 인계 블록 ✅ | 다른 목소리 성립 · 프롬프트 서버 고정(ADR-0004) 유지 · 인계 PII는 마스킹본뿐 · 유료 과금 모형에 따라 누적 문맥 재과금이 줄 수 있음 | 교대당 3.8~5.1초(웜, 추정) 지연 · Live 연결 1+R · 정확한 어조 · 오래된 세부 소실 |
| 같은 목소리로 역할만 교대(초안 권고 (a)) | 지연 · 연결 증가 0 | User가 선택하지 않음(D3) |
| 세션 중 음색 · 프롬프트 교체 | 연결 1 | §22.2 A · C — 불가/미확인, ADR-0004 잠금 붕괴 |
| 클라가 인계 요약을 만들어 전달 | 서버 호출 단순 | 미마스킹 · 변조 가능 · 프롬프트 재료 클라 노출 — ⛔ |
| 인계문을 LLM으로 요약 | 문장 자연스러움 | 교대당 +$0.0012 · +지연 · 비결정성 — 결정론 블록으로 충분 |
| ElevenLabs 경로에서도 릴레이 | 3경로 문면 일치 | 인계를 넣을 서버 통로 없음(클라 경유 동적 변수 = 가드레일 우회 통로) · 그 경로는 난이도 자체 미적용 — ⛔ |

흐름 변형: Functions 전용 `scenarios/flowVariants.ts`, 세션 문서에 불투명 `flowVariantId`, 회전 배정은 `users/{uid}/variantRotation/{scenarioId}__{level}` 키 조회 1건(새 복합 인덱스 0).

## Consequences
- Positive: D3 실현(Gemini · 폴백) · 화자 경계가 `relay.legStartTurnIndex` · `messages.speakerLabel`로 처음 관측됨(릴레이 한정) · 변형 데이터가 D-46 경계 안에 남음.
- Negative / accepted trade-offs: 교대 지연(목표 p50 ≤4초 · p95 ≤8초, 최대 대기 15초) · 무료 등급 Live 세션 시작 1+R배 소비 · 유료 환산 −19%~+27%(R=2, 과금 모형 미확인) · ElevenLabs는 라우팅으로 회피(AC-101 (e) 해석은 User 결정 OQ-A108).
- Follow-ups required: OQ-A108(User) · OQ-A109/OQ-U73(planner) · 3.8 프로브 P6 · Gemini 음성 풀 확장(OQ-A113) · DECISIONS 행 기록 · API.md/Database.md 갱신(S7).
