# API — 안 당해본 사기는 못 막는다 (AI 금융사기 백신)

Owner: architect (see AGENTS.md). Others read-only.
Based on PRD Version: v0.5 · Based on UX Version: 1.2

> 이 프로젝트는 REST 엔드포인트가 아니라 **Firebase Cloud Functions(2nd gen)** 를 노출한다. 대부분 **Callable**(클라 SDK `httpsCallable`)이고, 폐기는 **Firestore 트리거**다. 외부 API 키(ElevenLabs/LLM)는 Functions 런타임에만 존재하며 클라이언트에 절대 노출하지 않는다(Architecture.md §8). 함수 시그니처는 `src/lib/api/*`·`functions/src/shared`에서 단일 정의(계약, ADR-0001).

## Conventions
- 호출 방식: Firebase **Callable Functions**(`httpsCallable(functions, name)`). 트리거 함수는 클라가 직접 호출하지 않음.
- Auth: 모든 callable은 `context.auth` 필수. 없으면 `unauthenticated`로 거부(AC-027 게이팅). 모든 데이터는 `context.auth.uid` 귀속.
- 인가: 함수는 대상 리소스의 소유 uid == `context.auth.uid`를 검증. 불일치 시 `permission-denied`.
- 에러 포맷: Firebase `HttpsError` 표준 — `{ code, message, details? }`. `code`는 아래 표의 값 사용.
- 표준 에러 코드: `unauthenticated`(미로그인), `permission-denied`(타인 리소스), `invalid-argument`(입력 오류), `failed-precondition`(선행 상태 미충족, 예: 동의 없음/클론 없음), `deadline-exceeded`(외부 API 타임아웃), `resource-exhausted`(rate/credit 초과), `internal`(외부 API·기타 실패).
- PII: 대화·리포트 관련 함수는 Firestore 쓰기 **전** `guardrails/maskPII()` 통과(ADR-0004).
- 시크릿(런타임 config, `.env`→Functions): `ELEVENLABS_API_KEY`, `LLM_API_KEY`, `LLM_PROVIDER`(claude|gemini), `FALLBACK_VOICE_ID`. `.env.example`에 placeholder만.

---

## Callable Functions

### `createVoiceClone` — (Track A · T4 · UX-003)
| Item | Value |
|---|---|
| Purpose | 업로드된 30초 녹음으로 ElevenLabs Instant Voice Clone 생성 → `voiceId` 반환. AC-018. |
| Auth | required. `sid` 소유 uid == caller. |
| Request | `{ sessionId: string }` — 녹음은 이미 `users/{uid}/sessions/{sid}/voice_input.*`에 업로드됨(클라 Storage SDK). |
| Response | `{ voiceId: string, cloneStatus: "ready" }` (성공). 진행 상태는 `sessions/{sid}.cloneStatus` 구독으로도 반영. |
| 처리 | ① Storage에서 녹음 read → ② ElevenLabs IVC 호출(soft 15s/hard 45s, DECISIONS #9) → ③ `sessions/{sid}` 에 `voiceId`·`cloneStatus` write. |
| Errors | `failed-precondition`(녹음 없음/동의 없음), `deadline-exceeded`(hard 45s 초과 → 클라가 폴백 경로 안내), `resource-exhausted`(크레딧/rate), `internal`(ElevenLabs 실패). |

### ~~`synthesizeDeepvoice`~~ — **제거됨 (2026-07-22)**

UX-014 화면 통합 이후 호출부가 사라져 삭제했다. 오프닝 음성은 `createSession`이 반환하는
`openingAudioUrl`로, 통화 중 음성은 실시간 speech-to-speech(`createRealtimeCall`)로 처리한다.
삭제 시점까지 본문이 placeholder를 반환하는 상태였다(제거 이력은 `functions/src/voice/index.ts`
상단 주석 참고). `VoiceProvider.synthesize` 자체는 남아 있고 위 두 경로에서 계속 쓰인다.

### `createRealtimeCall` — (UX-014 live phase · 2026-07-22)
| Item | Value |
|---|---|
| Purpose | 실시간 speech-to-speech 통화용 ElevenLabs 서명 URL 발급. 브라우저가 에이전트와 직접 대화하되 API 키는 서버에만 남는다. |
| Auth | required. `sid` 소유 + `status:"active"` 검증. |
| Request | `{ sessionId: string }` |
| Response | `{ signedUrl: string, voiceId: string, language: "ko", isMock: boolean }` |
| 처리 | `scenarioId → agentId` 매핑(`ELEVENLABS_AGENT_IDS`) 조회 → ElevenLabs `GET /v1/convai/conversation/get-signed-url` 호출. 페르소나 프롬프트는 에이전트 쪽에 저장돼 클라로 내려가지 않는다(ADR-0004) — 클라가 보내는 오버라이드는 `voice_id`/`language`뿐. |
| Errors | 발급 실패·키/에이전트 미설정은 **에러가 아니라** `isMock:true`로 응답해 클라가 텍스트 폴백으로 강등한다(P-4 핵심 루프 비차단). `unauthenticated`/`permission-denied`/`failed-precondition`(세션 없음·비활성)만 throw. |

### `createSession` — (Track B · T8 · UX-006 진입)
| Item | Value |
|---|---|
| Purpose | 세션 문서 생성 + 사기범 오프닝 라인 반환. 턴/시간 한도 초기화. AC-003, AC-007. |
| Auth | required. |
| Request | `{ scenarioId: string, voiceId: string }` |
| Response | `{ sessionId: string, openingMessage: { role: "scammer", text: string }, maxUserTurns: 10, maxSessionMs: 360000 }` |
| 처리 | `sessions/{sid}` 생성(status=active, turnCount=0, 한도값 DECISIONS #10) → roleplay 모듈 `generateOpeningLine(scenarioId)`(서버 조립 프롬프트, ADR-0004) 호출 → 오프닝 메시지를 `messages`에 마스킹 저장. |
| Errors | `failed-precondition`(동의/클론 미완), `invalid-argument`(없는 scenarioId), `internal`(LLM 실패). |

### `sendMessage` — (Track A · T7 · UX-006)
| Item | Value |
|---|---|
| Purpose | 사용자 턴 처리 → 사기범 응답 생성. 인젝션 방어·PII 마스킹·한도 체크. AC-003~005, AC-013, AC-024, AC-007. |
| Auth | required. `sid` 소유 검증. |
| Request | `{ sessionId: string, userText: string }` — **시스템 프롬프트/페르소나는 클라가 보내지 않음**(서버 조립, ADR-0004). |
| Response | `{ reply: { role: "scammer", text: string }, turnCount: number, ended: boolean, endReason?: "limit_reached" }` |
| 처리 | ① `maskPII(userText)` → `messages` write ② 서버에서 `scenarioPrompts/{id}`(클라 read 거부) + 히스토리로 프롬프트 조립 → LLM(어댑터, DECISIONS #11) ③ 응답 마스킹 저장 ④ turnCount++·경과시간 체크 → 한도 도달 시 `ended:true`+자동 종료 트리거. |
| Errors | `failed-precondition`(세션 미활성/종료됨), `deadline-exceeded`(LLM 지연, AC-004 목표 p95≤10s), `resource-exhausted`, `internal`. |

### `endSession` — (Track B · T8 · UX-007)
| Item | Value |
|---|---|
| Purpose | 세션을 정확히 마감(status=ended, endReason). 폐기 트리거·리포트 생성 개시. AC-006, AC-007, AC-021. |
| Auth | required. `sid` 소유 검증. |
| Request | `{ sessionId: string, endReason: "user_ended" \| "completed" \| "deceived" \| "limit_reached" }` |
| Response | `{ status: "ended", reportPending: true }` |
| 처리 | `sessions/{sid}.status=ended`·`endReason`·`endedAt` write. 이 write가 ① `onSessionEnded`(폐기 트리거) ② `generateReport` 개시를 유발. 클라는 `reports/{sid}`·`deletionLogs` 구독으로 완료 반영. |
| Errors | `permission-denied`, `failed-precondition`(이미 ended면 멱등 처리). |

### `generateReport` — (Track A · T9 · UX-008)
| Item | Value |
|---|---|
| Purpose | 마스킹 대화 로그로 취약점 리포트 생성. 속은 시점 타임라인·수법·대처법. AC-008, AC-009, AC-026. |
| Auth | required(또는 `endSession` 후 서버 내부 호출). `sid` 소유 검증. |
| Request | `{ sessionId: string }` |
| Response | `{ reportId: string }` — 내용은 `reports/{id}` 구독으로 표시. |
| 처리 | **마스킹된 `messages`만 입력**(원문·실제 운영정보 배제, AC-005/013). LLM으로 `deceivedMoments[]`·`tacticsUsed[]`·`preventionAdvice[]`·`wasDeceived` 산출 → `reports/{id}` write. |
| Errors | `failed-precondition`(세션 미종료), `internal`(LLM 실패 → 재시도). |

---

## Trigger Functions (클라 직접 호출 아님)

### `onSessionEnded` — Firestore trigger (Track C · T10 · AC-021)
| Item | Value |
|---|---|
| Trigger | `sessions/{sid}` document update where `status` → `ended`. |
| Purpose | 생성물 즉시 폐기 + 삭제 로그. ADR-0003. |
| 처리 | ① `sessions/{sid}/artifacts` 매니페스트 순회 → Storage `users/{uid}/sessions/{sid}/**` 삭제 ② **ElevenLabs DELETE voice**(`session.voiceId`) ③ `session.voiceId` 클리어 ④ `deletionLogs/{id}` write(targets[]·target별 success/partial/failed). |
| Errors(내부) | 외부 삭제 실패는 `deletionLogs`에 `partial`/`failed`로 기록 후 재시도 가능. 리포트 생성과 독립. |

---

## 외부 API 연동 지점 (Functions 내부에서만)
| 외부 | 사용 함수 | 용도 | 비고 |
|---|---|---|---|
| ElevenLabs IVC | `createVoiceClone` | 30초 샘플 → 클론 voice 생성 | 키 `ELEVENLABS_API_KEY`(서버). 타임아웃 DECISIONS #9. |
| ElevenLabs TTS | `createSession`, `sendMessage` | 오프닝·응답 대사 합성(폴백 경로) | `VoiceProvider.synthesize`. 실패해도 텍스트 응답을 막지 않는다(P-4). |
| ElevenLabs Agents | `createRealtimeCall` | 실시간 speech-to-speech 통화 서명 URL 발급 | 프롬프트는 에이전트 쪽 보관(ADR-0004). 미설정 시 `isMock:true`로 텍스트 폴백. |
| ElevenLabs DELETE voice | `onSessionEnded` | 클론 voice 외부 삭제(AC-021) | 미삭제 시 외부 잔존 → 반드시 호출. |
| LLM(Claude/Gemini) | `createSession`, `sendMessage`, `generateReport` | 역할극·리포트 | 어댑터 `functions/src/llm`(DECISIONS #11). 프롬프트 서버 조립(ADR-0004). |

## 직접 SDK 사용(함수 불필요) — 참고
| 동작 | 방식 | 규칙 |
|---|---|---|
| 로그인(UX-013) | Firebase Auth Google SDK | `signInWithPopup`/`signInWithRedirect` |
| 동의 기록(UX-001) | Firestore write | `users/{uid}/consents` — rules로 본인만 |
| 녹음 업로드(UX-002) | Storage put | storage.rules 강제(ADR-0002) |
| 시나리오 목록(UX-004) | Firestore read | `scenarios`(공개 메타만). `scenarioPrompts`는 read 거부 |
| 히스토리(UX-012, P1) | Firestore read | 본인 `sessions`/`reports`만 |
