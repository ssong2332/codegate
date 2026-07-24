# API — 안 당해본 사기는 못 막는다 (AI 금융사기 백신)

Owner: architect (see AGENTS.md). Others read-only.
Based on PRD Version: v1.1 · Based on UX Version: 1.6

> **v1.1 증분(2026-07-23, T26·T35):** 메신저→보이스 에스컬레이션(sendMessage 확장·transitionChannel)과 2인 소셜 챌린지 콜러블을 §"메신저 확장·2인 소셜"에 추가. 설계 근거 Architecture.md §13·§14, Database.md, DECISIONS #14~#24, ADR-0005. 기존 P0 루프 함수는 무변경.

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
| Purpose | 실시간 speech-to-speech 통화 자격증명 발급. 브라우저가 음성 AI와 직접 대화하되 API 키는 서버에만 남는다. |
| Auth | required. `sid` 소유 + `status:"active"` 검증. |
| Request | `{ sessionId: string }` |
| Response | `{ provider: "elevenlabs"\|"gemini"\|"none", signedUrl, geminiToken, geminiModel, voiceId, language: "ko", isMock }` |
| 처리 | 서버가 시나리오에 맞는 프로바이더를 고른다(functions/src/realtime/provider.ts). **① ElevenLabs**(키+에이전트 매핑 있을 때): 본인 목소리 클론 가능(유료), `GET /v1/convai/conversation/get-signed-url`로 서명 URL 발급, 프롬프트는 에이전트 쪽 보관. **② Gemini Live**(키 있고 generic 시나리오일 때): 무료 티어 가능하지만 고정 프리셋 음성만, `authTokens.create`로 단기 토큰 발급하며 모델·시스템 프롬프트·도구를 `liveConnectConstraints`로 서버에서 고정(ADR-0004 — 프롬프트가 클라로 안 감, 클라가 setup 프레임을 바꿔치기 못함). 어느 쪽이든 클라가 받는 건 접속 자격증명뿐이다. |
| **challenge 분기**(T37·§14.7/ADR-0006·A1) | `session.challengeId`가 있으면(2인 사용자2 체험 세션): `session.voiceId`(부재) 대신 `challenges/{challengeId}` admin read로 voiceId 해석 + **그 챌린지 `status∈{consented,in_progress}`+미만료 재검증**(§14.2 발급 게이트) 후 자격증명 발급. 소유권 검증(`session.uid===request.auth.uid`, 익명 uid)은 유지. challengeId 부재 세션은 기존 경로 무변경. |
| Errors | 프로바이더 미설정·발급 실패는 **에러가 아니라** `provider:"none"`+`isMock:true`로 응답해 클라가 텍스트 폴백으로 강등한다(P-4 핵심 루프 비차단). `unauthenticated`/`permission-denied`/`failed-precondition`(세션 없음·비활성·challenge 만료/미동의)만 throw. |

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

## Callable/Trigger Functions — 메신저 확장·2인 소셜 (T26·T35)
> 신규 함수. 시그니처는 기존과 동일하게 `src/lib/api/*`·`functions/src/shared`에서 단일 정의(ADR-0001). 시크릿 추가: `FALLBACK_VOICE_MALE_ID`, `FALLBACK_VOICE_FEMALE_ID`(gendered 폴백, AC-046) — `.env.example`에 placeholder.
>
> **사용자2 접근 메커니즘(T37, §14.7/ADR-0006 확정):** 사용자2는 **익명 인증**으로 임시 uid를 얻어 체험 세션을 소유한다 — landing/report는 세션 이전이라 **무인증(토큰만)**, consent부터는 **익명 사인인 후**(uid로 세션 소유). 이로써 `createRealtimeCall`·`submitRealtimeTranscript`·`endSession`·`generateReport`가 소유권 검증째 무개정 재사용된다. 아래 `consentChallenge`·`createRealtimeCall` challenge 분기 참고.

### `sendMessage` **확장** — 메신저 단계 + 에스컬레이션 신호 (T26 · AC-034/035)
| Item | Value |
|---|---|
| 변경점 | 메신저 채널에서도 동일 함수를 재사용(표면만 다름). 응답에서 **어시스턴트 sentinel `[[SIGNAL:ESCALATE_VOICE]]`를 제거**한 뒤, 감지 시 전이 플래그를 실어 반환. 사용자 입력의 sentinel 형태는 수신 시 선제거(§13.2, AC-024). |
| Response 증분 | `{ ..., escalation?: { toChannel: "voice" } }` — 있으면 클라가 통화 전환 연출(T25)로 진입. |
| 폴백 | 메신저 단계 `MESSENGER_ESCALATION_FALLBACK_TURNS=6`(잠정) 도달 또는 명시 버튼 → 신호 없이도 전이(§13.3). |

### `transitionChannel` — 채널 전이(방향 무관) (T26 · AC-035/036/039)
| Item | Value |
|---|---|
| Purpose | 세션의 `channel`을 바꾸고 `channelHistory` 기록. `to==="voice"`면 통화 진입 준비. **MVP는 messenger→voice만 허용**, 그 외 조합은 `failed-precondition`(unimplemented, AC-039). |
| Auth | required. `sid` 소유 + active 검증. |
| Request | `{ sessionId: string, from: "messenger"\|"voice", to: "messenger"\|"voice", trigger: "structured_signal"\|"maxturn_fallback"\|"manual_button" }` |
| Response | `{ channel: "voice", ready: true }` — 이후 클라가 `createRealtimeCall`(기존 재사용)로 통화 자격증명 획득. |
| 처리 | ① channel 갱신 ② channelHistory append ③ 단일 세션·연속 turnIndex 유지(AC-035). 통화 음성은 `session.voiceId`(조건부 clone/gendered, §13.6). |
| Errors | `failed-precondition`(미지원 방향·비활성 세션), `permission-denied`. |

### `createChallenge` — 2인 챌린지 생성·링크 발급 (T35 · UX-019 · AC-044/048/049)
| Item | Value |
|---|---|
| Purpose | 챌린지 레코드 생성 + 공유 링크 토큰 발급. |
| Auth | required(사용자1). 클론 보유 전제. |
| Request | `{ scenarioId: string, voiceId: string, displayName: string, retentionDays?: number(7~90, 기본 30) }` |
| Response | `{ challengeId: string, linkToken: string }` — **평문 토큰은 이 응답에서 1회만 반환**(공유용), 서버는 해시만 저장(§14.4). |
| 처리 | ① `creatorUid` 활성 챌린지 개수 상한(무료 3/유료 10) 검증 → 초과 시 거부 ② `randomBytes(32)`→base64url 토큰, `linkTokenHash=SHA-256` 저장 ③ `linkExpiresAt=생성+3일`(무료), `retentionDeleteAt=생성+보존기간` ④ voiceId 챌린지 스코프 고정(ADR-0005). |
| Errors | `resource-exhausted`(개수 상한, AC-049), `failed-precondition`(클론 없음), `invalid-argument`(표시이름 없음). |

### `getChallengeLanding` — 사용자2 진입(무로그인·토큰) (T35 · UX-021 · AC-040/048)
| Item | Value |
|---|---|
| Purpose | 토큰으로 챌린지 랜딩 메타 조회(동의 전). **복제 음성은 반환하지 않음.** |
| Auth | **불필요**(무로그인, 토큰이 자격). |
| Request | `{ token: string }` |
| Response | `{ displayName: string, status, expired: boolean }` — 만료/소진이면 `expired:true`(진입 차단). 음성·voiceId·scenario 상세 미노출. |
| 처리 | `SHA-256(token)`으로 `linkTokenHash` 조회 → 만료·소진 검증. **소모는 여기서 하지 않음**(동의 시 소모, §14.4 — 크롤러 선fetch 방지). |
| Errors | `not-found`(토큰 무효), `failed-precondition`(만료/신고/삭제). |

### `consentChallenge` — 사용자2 동의(무동의 차단 게이트) (T35 · UX-021 · AC-040/048)
| Item | Value |
|---|---|
| Purpose | 명시적 동의 기록 + 링크 **1회성 소모** + 체험 세션 생성. **이 함수 성공 전에는 어떤 복제 음성 자격증명도 발급되지 않는다**(AC-040). |
| Auth | **익명 사인인 후 호출**(§14.7/ADR-0006) — 클라가 동의 탭 시 `signInAnonymously`(로그인 UI 없음)로 임시 uid를 얻은 뒤 호출. 토큰이 진입 자격, 익명 uid가 생성될 세션의 소유자. |
| Request | `{ token: string }` |
| Response | `{ sessionId: string }` — 이후 통화 자격증명은 `createRealtimeCall`(challengeId 바운드 세션) 재사용. |
| 처리 | ① 토큰 유효·미만료·미소진 검증 ② `markChallengeConsumed`(linkConsumedAt 세팅+`status="consented"`, T36 primitive 재사용) ③ **익명 uid 소유** `sessions/{}` 생성 — `challengeId` 세팅, **`voiceId`는 미저장**(A1, `createRealtimeCall`이 challenge에서 해석), `scenarioId`·`channel="voice"`·한도·오프닝 라인 ④ `status="in_progress"`. `createSession`(사용자1 경로)은 무개정. | 
| Errors | `failed-precondition`(만료/이미 소진), `not-found`, `unauthenticated`(익명 사인인 누락). |

### `reportChallenge` — 사용자2 신고 (T35 · UX-021 · AC-049)
| Item | Value |
|---|---|
| Purpose | "원치 않는 챌린지" 신고 → 데이터 축적 + **즉시 비활성화**(재생 차단). 관리자 검토·자동 조치 없음(MVP). |
| Auth | 불필요(토큰). |
| Request | `{ token: string, reason: "unwanted"\|"harassment"\|"impersonation_concern"\|"other", note?: string }` |
| Response | `{ status: "reported" }` |
| 처리 | 챌린지 문서에 `reportedAt`·`reportReason`·`reportNote`(마스킹) 임베드 + `status="reported"`(재진입/재생 차단). |
| Errors | `not-found`, `failed-precondition`(만료). |

### `setChallengeResultSharing` — 사용자2 결과 공유 동의(AC-043 게이트) (T35 · UX-018)
| Item | Value |
|---|---|
| Purpose | 사용자2가 결과(완료/의심 시점) 공유에 동의하면 사용자1이 볼 `resultSummary`를 채운다. **미동의 시 사용자1은 상세 미열람.** |
| Auth | 익명(세션 소유 확인 권장). |
| Request | `{ token: string, share: boolean }` |
| Response | `{ shared: boolean }` |
| 처리 | `share=true`면 그 챌린지의 체험 세션 리포트를 **서버측(admin) read**해(T9 산출물 재사용, 독립 분석 없음) `resultSummary={completed, suspicionTimeLabel?, suspicionTurnIndex?}` 파생·write + `resultSharingConsented=true`(대화 전문·상대 발화 원문 없음, AC-043, §14.7.3). |

### `deleteChallenge` — 사용자1 수동 삭제 (T35 · UX-020 · AC-041)
| Item | Value |
|---|---|
| Purpose | 챌린지·복제 음성 즉시 폐기(기간제 이전에도 수동). |
| Auth | required. `creatorUid==caller`. |
| Request | `{ challengeId: string }` |
| 처리 | ADR-0003 폐기 기계 재사용(ElevenLabs voice DELETE + Storage 삭제 + `deletionLogs`(옵셔널 challengeId)) → `status="deleted"`. |

### `onChallengeRetentionExpiry` — 스케줄 트리거 (T35 · AC-041)
| Item | Value |
|---|---|
| Trigger | 스케줄 함수가 `retentionDeleteAt <= now`인 챌린지를 스캔. |
| 처리 | 보존기간 도달 챌린지의 복제 음성·녹음을 폐기(ADR-0003 기계 재사용) + `status` 정리. 링크 만료(3일)와 독립. |

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
