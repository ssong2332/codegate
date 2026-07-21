# Decision Log — 안 당해본 사기는 못 막는다 (AI 금융사기 백신)

Owner: architect (see AGENTS.md). One line per decision; anything with lasting structural impact gets a full ADR in adr/.

## Rules
- Decisions are append-only. To reverse one, add a new row that supersedes it (and a new ADR if the original had one).
- "Why" is mandatory — a decision without a reason cannot be evaluated later.

| # | Date | Decision | Why | ADR |
|---|---|---|---|---|
| 1 | 2026-07-21 | 스택 확정 사용: Next.js(App Router)+Firebase(Auth/Functions/Firestore/Storage)+ElevenLabs+LLM(Claude/Gemini). 별도 백엔드 서버·다른 DB·다른 인증 프로바이더 도입 안 함. | PRD Constraints로 이미 확정. 하루 완성 제약상 표준 조합에서 벗어나면 리스크. | — |
| 2 | 2026-07-21 | Firebase Auth **Google Provider 단일**. 최초 인증=계정 자동 생성=로그인(가입 폼 없음). 미인증 시 전 라우트/콜러블 게이팅(AC-027). | OQ-U5 확정(사용자 "구글로 로그인"). 단일 프로바이더로 구현·검증 최소화, 어르신 1클릭. | — |
| 3 | 2026-07-21 | 3트랙 병렬 경계를 **Firestore 문서 계약 + Callable 함수 계약 + 이벤트 이름 계약**으로 고정(별도 API 게이트웨이 없음). T2 직후 스텁 선(先)커밋. | 병렬 가능성=하루 완성 가능성. 계약을 먼저 못 박아야 A/B/C가 서로 안 기다림. | [0001](adr/0001-track-boundaries-and-contracts.md) |
| 4 | 2026-07-21 | 본인 목소리만 등록: 파일 업로드 UI 전면 제거(마이크 캡처만) + storage.rules로 경로/소유자/`audio/*`/크기≤3MB 서버측 강제. 강 KYC는 배제. | OQ-U1 확정. 자기확인 체크만으로는 보안 배점 근거가 약함 → 서버측 원천 차단을 추가해 AC-020 의도(무단 타인 등록 차단) 충족. 강 KYC는 하루 스코프 밖(D-5). | [0002](adr/0002-own-voice-only-enforcement.md) |
| 5 | 2026-07-21 | 생성물 즉시 폐기: `session.status=ended` Firestore 트리거 `onSessionEnded`가 Storage 산출물 + **ElevenLabs voice 자체**를 삭제하고 `deletionLogs`에 감사 기록. | AC-021. UI 흐름과 분리해 사용자 이탈에도 폐기 보장. 외부(ElevenLabs)에도 클론이 남지 않아야 함. | [0003](adr/0003-immediate-artifact-purge.md) |
| 6 | 2026-07-21 | LLM 인젝션 방어를 **구조로**: 시스템 프롬프트/페르소나를 서버(Functions)에서 `scenarioId`로 조립, 클라는 보유/전송 안 함. `scenarioPrompts`는 클라 read 거부. 대화 로그는 저장 전 PII 마스킹(원문 미저장). | AC-024/AC-005/AC-013. 사용자 입력을 시스템 지시로 해석 못 하게 role 분리 + 원천 접근 차단. | [0004](adr/0004-llm-injection-defense-and-pii-masking.md) |
| 7 | 2026-07-21 | 합성 표식(AC-022): 모든 합성물 메타에 `synthetic:true`·`syntheticLabel:"AI 훈련용 합성"` 필드, UI는 화면 라벨+오디오 프리롤 이중 노출(D-3). | 보안 배점 근거를 데이터 모델·UI 양쪽에 명시. 단일 노출은 접근성상 표식을 놓칠 수 있음. | — |
| 8 | 2026-07-21 | 송금/계좌/이체 개념을 시스템에 **애초에 두지 않음**(스키마·필드·엔드포인트 어디에도). 사칭 이미지는 정적 에셋일 뿐 기능 아님. | AC-023. 실제 금전 피해 경로를 구조적으로 제거. | — |
| 9 | 2026-07-21 | **OQ-U3 잠정 확정**: 클론 생성 soft 15s·hard 45s→폴백, TTS hard 20s→사전녹화. 폴백=사전준비 `FALLBACK_VOICE_ID`/정적 녹화본. **T1 PoC 실측 p95×1.5(상한 60s)로 확정** 절차. (Architecture.md §9/§11 참조) | 데모 안정성(라이브 클론 실패 대비, PRD Risk). 근거 없는 확정 금지 원칙상 실측 전 "잠정"임을 명시하고 확정 절차를 남김. | — |
| 10 | 2026-07-21 | **OQ-U4 확정**: `MAX_USER_TURNS=10`, `MAX_SESSION_MS=6분`. 한도 도달 시 자동 종료→UX-007(AC-007). 데모 5~8턴 타겟. (Architecture.md §9 DECISIONS #7로 참조된 항목) | 데모 2분 흐름과 정합(짧으면 몰입 저하·길면 데모 초과). LLM 비용 상한. AC-007 종료 조건 충족. | — |
| 11 | 2026-07-21 | LLM은 **어댑터 1겹**(`functions/src/llm`)으로 Claude|Gemini 교체 가능하게. PoC 후 택1. (Architecture.md §9 DECISIONS #8로 참조된 항목) | 얇은 추상화(오버엔지니어링 아님). 어느 쪽 품질/지연/비용이 나을지 PoC 전 미확정이라 교체 유연성 확보. | — |
| 12 | 2026-07-21 | 실시간 상태 전이는 **Firestore onSnapshot 구독**으로 처리(클론 대기·채팅·리포트 준비). 별도 웹소켓 서버·폴링 금지. | 하루 스코프. Firestore 실시간이 이미 있어 인프라 추가 없이 상태 반영. | — |
| 13 | 2026-07-21 | 동의 로그·리포트·삭제로그는 `uid` 귀속, 본인만 read(Firestore rules). 자녀 대리/자녀 리포트 열람은 **미구현**(D-7, OQ-3/15 빌드 밖). | OQ-11 확정(소유권=본인). 빌드 스코프 밖 임의 구현은 스코프 크립. | — |
