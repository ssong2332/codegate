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
| Response | `{ provider: "elevenlabs"\|"gemini"\|"none", signedUrl, geminiToken, geminiModel, voiceId, language: "ko", isMock, difficultyApplied?: boolean, inCallSmsTriggers?: Array<{ smsId: string, afterScammerTurns: number }> }` |
| **T57 증분**(§15.1.2·§15.3.3) | ① **`inCallSmsTriggers`** — 이 시나리오의 통화 중 문자 **트리거만**(`smsId` + 몇 번째 사기범 턴 이후) 내려준다. **본문·인증번호·발신번호는 포함하지 않는다**(도착 시점에 `deliverInCallSms`가 서버에서 렌더 — 사전 유출 방지). 카탈로그가 없는 시나리오는 필드 부재. ② **`difficultyApplied`** — 이 통화 경로에 난이도 모디파이어가 실제로 주입됐는지. Gemini Live는 `liveConnectConstraints.systemInstruction`에 조립해 넣으므로 `true`. **ElevenLabs 경로는 프롬프트가 에이전트 쪽에 저장돼 주입 지점이 없어 기본 `false`**(`agentMap.ts:3-11` — 클라 오버라이드로 프롬프트를 넘기는 것은 ADR-0004 위반이라 금지). 클라는 `false`면 난이도 배지를 표시하지 않는다(근거 없는 표기·조용한 미적용 금지). 난이도별 에이전트가 `ELEVENLABS_AGENT_IDS`에 매핑돼 있으면 `true`로 반환(§15.3.3 확장 경로). |
| 처리 | 서버가 시나리오에 맞는 프로바이더를 고른다(functions/src/realtime/provider.ts). **① ElevenLabs**(키+에이전트 매핑 있을 때): 본인 목소리 클론 가능(유료), `GET /v1/convai/conversation/get-signed-url`로 서명 URL 발급, 프롬프트는 에이전트 쪽 보관. **② Gemini Live**(키 있고 generic 시나리오일 때): 무료 티어 가능하지만 고정 프리셋 음성만, `authTokens.create`로 단기 토큰 발급하며 모델·시스템 프롬프트·도구를 `liveConnectConstraints`로 서버에서 고정(ADR-0004 — 프롬프트가 클라로 안 감, 클라가 setup 프레임을 바꿔치기 못함). 어느 쪽이든 클라가 받는 건 접속 자격증명뿐이다. |
| **challenge 분기**(T37·§14.7/ADR-0006·A1) | `session.challengeId`가 있으면(2인 사용자2 체험 세션): `session.voiceId`(부재) 대신 `challenges/{challengeId}` admin read로 voiceId 해석 + **그 챌린지 `status∈{consented,in_progress}`+미만료 재검증**(§14.2 발급 게이트) 후 자격증명 발급. 소유권 검증(`session.uid===request.auth.uid`, 익명 uid)은 유지. challengeId 부재 세션은 기존 경로 무변경. **T38 QA 수정, ADR-0006 Addendum A2**: 응답의 `voiceId`는 challenge 세션이면 `provider==="elevenlabs"`일 때만 채워진다(ElevenLabs 프로토콜상 클라 개시 TTS override에 실제로 필요 — `RealtimeVoiceSession`이 그 경우에만 마운트) — mock/none(`isMock:true`) 폴백은 어차피 클라가 쓰지 않으므로 `voiceId:""`로 비워 불필요한 노출을 막는다. challenge 아닌 일반 세션은 무변경(본인 소유 voiceId 그대로 반환). |
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
| **T57 증분**(§15.3.2) | Request에 **`difficultyLevel?: "beginner"\|"intermediate"\|"advanced"`**(옵셔널) 추가. 서버가 enum 검증 후 `sessions.difficultyLevel`에 기록하며, **부재·enum 밖이면 조용히 임의값으로 진행하지 않고 `intermediate`로 확정**한다. 이 값은 `generateOpeningLine`에도 전달되어야 한다(오프닝 대사부터 난이도가 반영되도록 — §15.6 G5). 응답 계약 무변경. |

### `sendMessage` — (Track A · T7 · UX-006)
| Item | Value |
|---|---|
| Purpose | 사용자 턴 처리 → 사기범 응답 생성. 인젝션 방어·PII 마스킹·한도 체크. AC-003~005, AC-013, AC-024, AC-007. |
| Auth | required. `sid` 소유 검증. |
| Request | `{ sessionId: string, userText: string }` — **시스템 프롬프트/페르소나는 클라가 보내지 않음**(서버 조립, ADR-0004). |
| Response | `{ reply: { role: "scammer", text: string }, turnCount: number, ended: boolean, endReason?: "limit_reached" }` |
| 처리 | ① `maskPII(userText)` → `messages` write ② 서버에서 `scenarioPrompts/{id}`(클라 read 거부) + 히스토리로 프롬프트 조립 → LLM(어댑터, DECISIONS #11) ③ 응답 마스킹 저장 ④ turnCount++·경과시간 체크 → 한도 도달 시 `ended:true`+자동 종료 트리거. |
| Errors | `failed-precondition`(세션 미활성/종료됨), `deadline-exceeded`(LLM 지연, AC-004 목표 p95≤10s), `resource-exhausted`, `internal`. |
| **T57 증분**(§15.1.2 폴백 경로) | 이 턴이 문자 카탈로그의 `afterScammerTurns`에 도달했으면 서버가 ① `sessions/{sid}/inCallSms/{smsId}` 문서를 write하고 ② 그 턴의 시스템 프롬프트에 `turnInstruction`(문자를 보냈다고 알리라는 1줄)을 **`guardrailPreamble` 앞에** 주입한다(§15.5). 응답에 `sms?: { smsId }`를 실어 클라가 즉시 배너를 띄울 수 있게 하되, **렌더링의 단일 소스는 `inCallSms` 구독**이다(실시간 경로와 동일 — 두 경로가 같은 컬렉션을 본다). 난이도 블록도 `session.difficultyLevel`로 이 조립에 포함된다(§15.3.3). |

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
| 처리 | **마스킹된 `messages`만 입력**(원문·실제 운영정보 배제, AC-005/013). `deceivedMoments[]`·`tacticsUsed[]`·`preventionAdvice[]`·`wasDeceived` 산출 → `reports/{id}` write. `reportId = sessionId`이며 이미 존재하면 재계산 없이 반환한다(**AC-007 "세션당 정확히 1리포트" 멱등 키** — `generateReportCore.ts:28-35`). ※ **정정(2026-07-25 실측):** 이 산출은 LLM이 아니라 **규칙 기반 순수 함수**다(`functions/src/report/analyzeConversation.ts` — `getLlmClient()`를 호출하지 않음. 기존 "LLM으로 산출" 서술은 코드와 불일치했다). |
| Errors | `failed-precondition`(세션 미종료), `internal`. |
| **§15.1.5 증분**(통화 중 문자 타임라인 통합 · AC-059) | ④ `sessions/{sid}/inCallSms`를 **1회 추가 read**(`orderBy("arrivedAt","asc")`)해 각 문서의 `anchorScammerTurn`을 **실제 `turnIndex`로 해결**하고, 최종 표시 순서로 정렬한 **표시 전용 배열 `smsTimeline`** 을 리포트 문서에 함께 기록한다(Database.md `reports` §15.1.5 증분). **⑤ 판정 로직은 무변경** — 이 배열은 `analyzeConversation`의 **입력이 아니라** 산출 뒤에 얹히는 값이며, `wasDeceived`·`deceivedMoments`·`tacticsUsed`·`preventionAdvice`는 문자 유무와 무관하게 동일하다(회귀 테스트 필수, §15.6 G3/G22). **⑥ 멱등 무변경** — 이미 리포트가 있으면 early-return이라 스냅샷도 **최초 1회만** 기록된다(AC-007). ⑦ 앵커 해결은 순수 함수 `functions/src/report/smsTimeline.ts`(규칙표는 §15.1.5 (4)) — **시각(`arrivedAt`)으로 병합하지 않는다**(실시간 경로의 `messages.createdAt`이 종료 시점 합성값이라 문자가 전부 대화 맨 앞으로 몰린다, §15.6 G15). |
| **T57 증분**(§15.4.1·§15.4.2) | ① 각 `deceivedMoments` 항목에 **`tacticCategory`**(고정 10종 enum)를 함께 산출·저장한다 — 자유 문자열 `tactic`을 정규화하는 순수 함수 `functions/src/report/tacticCategory.ts`. ② 세션에서 **`scenarioId`·`channel`·`difficultyLevel`·`challengeId`를 역정규화**해 리포트에 함께 기록한다(아카이브 N+1 방지). 세션 문서는 이 함수가 이미 읽고 있어 추가 read가 없다. ③ **판정 로직 자체는 무변경** — 난이도는 `analyzeConversation`의 입력이 아니다(§15.3.5, 아카이브 누적 비교의 잣대를 통일하기 위해). |

---

## Trigger Functions (클라 직접 호출 아님)

### `onSessionEnded` — Firestore trigger (Track C · T10 · AC-021)
| Item | Value |
|---|---|
| Trigger | `sessions/{sid}` document update where `status` → `ended`. |
| Purpose | 생성물 즉시 폐기 + 삭제 로그. ADR-0003. |
| 처리 | ① **Storage prefix 실나열 → 삭제**: `users/{uid}/sessions/{sid}/` 를 `bucket.getFiles({prefix})`로 나열해 삭제 대상을 식별한다(`functions/src/guardrails/purge.ts:15-38` 실측) ② **ElevenLabs DELETE voice**(`session.voiceId`) ③ `session.voiceId` 클리어 ④ `deletionLogs/{id}` write(targets[]·target별 success/partial/failed). |
| **정정 고지(2026-07-25, UpdateRequests #4 해소 — DECISIONS #36)** | 이 행은 원래 "① `artifacts` 서브컬렉션 **매니페스트 순회**"라고 적혀 있었다(ADR-0003 원안). 실제 구현은 Storage prefix 나열이며, **이 이탈이 원안보다 옳다**: (a) `artifacts`는 합성물 메타만 다루도록 설계돼 원본 녹음 `voice_input.webm`을 **매니페스트로는 절대 식별할 수 없어** 원안대로면 녹음이 영구 잔존하는 **실질적 AC-021 위반**이 발생했을 것이고, (b) T5의 합성 경로가 Storage에 파일을 쓰지 않아 매니페스트가 실제로 비어 있었다. **ADR-0003은 accepted 후 불변이므로 재작성하지 않고 본 정정 + DECISIONS #36으로 비준한다**(ADR-0006 Addendum A2와 동일 처리 방식). 폐기 대상·삭제 로그·부분 실패 재시도 등 나머지 설계는 ADR-0003 그대로 유효하다. |
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

## Callable Functions — v1.11 신규 기능 4건 (T57 · Architecture.md §15)
> 신규 콜러블 4개. 시그니처는 기존과 동일하게 `src/lib/api/*`·`functions/src/shared`에서 단일 정의(ADR-0001). **신규 시크릿·신규 외부 의존성 없음**(LLM은 기존 `GEMINI_API_KEY` 어댑터 재사용).
>
> **실패 아카이브(UX-030)에는 콜러블이 없다** — 본인 `reports`를 기존 인덱스(`uid + createdAt desc`)로 직접 read하고 클라가 `deceivedMoments`를 평탄화한다(§15.4.1). 신규 컬렉션·신규 인덱스 불요.

### `deliverInCallSms` — 통화 중 문자 도착(실시간 경로) (T57 · UX-027 · §15.1.2)
| Item | Value |
|---|---|
| Purpose | 실시간 통화 중 문자 1건을 **서버 카탈로그에서 렌더해 도착시킨다**. 사기범이 그 사실을 알리도록 하는 지시문도 함께 반환. |
| Auth | required. `session.uid === request.auth.uid` + `status:"active"` 검증(익명 uid=사용자2도 동일하게 성립). |
| Request | `{ sessionId: string, smsId: string }` |
| Response | `{ smsId: string, announceInstruction: string }` |
| 처리 | ① **`smsId`가 `IN_CALL_SMS[session.scenarioId]` 소속인지 재검증**(⚠️ 이걸 빼면 임의 문자 주입 경로가 된다 — §15.6 G12) ② `sessions/{sid}/inCallSms/{smsId}` 문서 write(멱등 — 이미 있으면 재기록하지 않음) ③ 그 문자에 맞는 `announceInstruction` 반환. 클라는 이 문자열을 **같은 Live 세션에 텍스트 턴으로 주입**해 캐릭터가 문자 발송을 알리게 한다(`GeminiVoiceSession.textMessage` → `sendClientContent` 재사용, 선례 `OPENING_TRIGGER_TURN`). |
| 렌더링 | 응답은 렌더 소스가 **아니다** — 화면은 `sessions/{sid}/inCallSms` 구독(onSnapshot)으로 그린다(실시간·폴백 단일 소스, DECISIONS #12). |
| 안전 | 본문·인증번호·계좌·발신번호는 **전부 서버 카탈로그의 모의값**(AC-005/013). **`url` 필드가 스키마에 없어** 외부 이동 경로가 구조적으로 존재하지 않는다(AC-032/045). LLM이 문자 내용을 생성하지 않는다. |
| Errors | `permission-denied`(타인 세션), `failed-precondition`(세션 미활성), `invalid-argument`(카탈로그 밖 `smsId`). 실패해도 **통화는 계속된다** — 클라는 배너 자리에 인라인 오류+재시도만 표시(P-4). |

### `recordInCallSmsEvent` — 문자 확인·링크 탭 기록 (T57 · UX-027 · §15.1.2)
| Item | Value |
|---|---|
| Purpose | 오버레이에서 문자를 열었는지·링크 칩을 탭했는지를 세션 타임라인에 남긴다(UX-027 Data Operations "Update"). |
| Auth | required. 세션 소유 검증. |
| Request | `{ sessionId: string, smsId: string, event: "opened" \| "link_tapped" }` |
| Response | `{ recorded: true }` |
| 처리 | `sessions/{sid}/inCallSms/{smsId}`의 `openedAt`/`linkTappedAt`을 최초 1회만 세팅. |
| 범위 한정(중요) | **v1에서 이 값은 리포트 판정(`analyzeConversation`)의 입력이 아니다** — 리플레이·표시용이다. 판정에 넣으려면 별도 결정이 필요하다(근거 없는 판정 변경 금지). 인증번호를 통화로 불러준 행위는 **전사(음성) 경로로 이미 판정에 들어간다**(숫자만으로 이뤄진 답변을 순응으로 잡는 기존 패턴, `analyzeConversation.ts` `COMPLIANCE_PATTERN` 말미 앵커 `^\s*[\d\s-]{4,}\s*$`). |
| **§15.1.5 증분**(AC-059) | ① **요청 enum은 무변경**(`"opened" \| "link_tapped"`). UX-027 Events Emitted의 `sms_otp_shown`은 신규 저장 이벤트가 **아니라** `kind==="otp" && openedAt != null`의 **파생 표기**이고(명시 필드 두 개의 결합 — 부재 오버로드 아님, §14.9.1 원칙), `sms_overlay_closed`는 **기록하지 않는다**(닫힘은 "무슨 일이 일어난 것"이 아니라 학습 가치가 없다 — UX Events Emitted는 분석 이벤트 명세이지 저장 요건이 아니다). ② **`status === "active"` 검증을 추가한다**(현재 없음 — `functions/src/inCallSms/index.ts:88`은 `loadOwnedSession`만 호출하고 `deliverInCallSms`(:53)와 달리 상태를 보지 않는다). 이유: 리포트 생성 **이후**에 성공한 기록은 스냅샷에 영영 반영되지 않으므로(리포트 멱등 early-return) 종료 후 write를 애초에 받지 않는다. 오버레이는 통화 중에만 존재하므로 정상 경로 영향 0(§15.6 G20). |
| Errors | 실패는 **조용히 흡수**한다(기록 실패로 훈련을 막지 않는다 — 클라는 무시). 위 ② 추가 후에도 동일 — 종료 후 write는 `failed-precondition`이지만 클라는 무시하고 **로그만** 남긴다. |

### `judgeRewindAnswer` — 즉시 되감기 판정 (T57 · UX-028 · §15.2.3)
| Item | Value |
|---|---|
| Purpose | 속은 순간에 대해 사용자가 다시 답한 문장을 3단계로 판정하고 모범 대처를 함께 돌려준다. **새 사기 대사를 생성하지 않는다**(한 턴 드릴). |
| Auth | required. `report.uid === request.auth.uid`(익명 uid=사용자2도 자기 리포트에 한해 성립, §14.7). |
| Request | `{ reportId: string, momentIndex: number, answerText: string }` — `answerText` **≤500자**, 빈 문자열 거부. |
| Response | `{ verdict: "good" \| "risky" \| "unclear", reason: string, correctAction: string, judgedBy: "llm" \| "rule" }` |
| 처리 | ① `maskPII(answerText)` ② 판정 프롬프트는 **전용 빌더**로 조립하며 **페르소나·`weakenedTactics` 원문을 포함하지 않는다**(역할극 재개가 아니라 평가 — AC-005/013). 사용자 답변은 `wrapUserInputAsData`로 감싼다(AC-024) ③ LLM 실패·Mock이면 **규칙 폴백**: `analyzeConversation`의 `RESISTANCE_PATTERN`/`COMPLIANCE_PATTERN`을 **export해 공유**(복제 금지, §15.6 G7) — 저항→`good`, 순응→`risky`, 둘 다 아님→`unclear` ④ `reports/{rid}/rewindAttempts/{auto}`에 append. |
| **금지(불변식)** | `reports/{rid}` 문서 필드 update **금지**, 두 번째 `reports/*` 생성 **금지**, `updateDefenseGrade`/`users.defenseGrade`·`sessionCount` 갱신 **금지**, `sessions/*` write **금지**(AC-007·§15.2.2 금지표). |
| Errors | `permission-denied`, `not-found`(리포트·momentIndex 범위 밖), `invalid-argument`(길이·빈 값), `resource-exhausted`(리포트당 시도 50건 상한). **`unclear`는 에러가 아니라 정상 결과**이며, 이 경우에도 `correctAction`은 반드시 채워 반환한다(학습 최소 보장). |

### `getBeginnerBriefing` — 초급 사전 브리핑 신호 목록 (T57 · UX-029 · §15.3.4)
| Item | Value |
|---|---|
| Purpose | 초급 난이도 선택 시 "이 대화에서 나올 수 있는 신호"를 세션 **시작 전에** 보여주기 위한 수법 라벨 목록. |
| Auth | required. |
| Request | `{ scenarioId: string }` |
| Response | `{ signals: string[] }` — 예: `["긴급성 조성","확인 절차 차단","개인정보 직접 요구"]` |
| 처리 | `SCENARIO_PROMPTS[scenarioId].weakenedTactics`를 `extractTacticLabel`로 **라벨만** 추출해 반환. |
| **ADR-0004 경계(중요)** | 나가는 것은 **수법 라벨뿐**이다. 설명부·인용구(`extractTacticFlavor`가 뽑는 대사 예시)·`personaPrompt`·`guardrailPreamble`은 **어떤 경우에도 응답에 싣지 않는다**. 라벨 노출은 이미 리포트 `tacticsUsed`가 하는 것과 같은 등급의 데이터다(`analyzeConversation.ts:133`). |
| 범위 한정 | 브리핑은 **세션 시작 전 화면에서만** 소비된다 — 대화 중 실시간 힌트·실시간 판정 파이프라인은 신설하지 않는다(D-6 유지, D-43). |
| Errors | `invalid-argument`(없는 scenarioId). 실패 시 브리핑만 생략하고 난이도 선택·세션 생성은 계속된다(P-4 비차단). |

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
