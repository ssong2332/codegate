# Database — 안 당해본 사기는 못 막는다 (AI 금융사기 백신)

Owner: architect (see AGENTS.md). Others read-only.
Based on PRD Version: v1.1 · Based on UX Version: 1.7

> **v1.1 증분(2026-07-23, T26·T35):** 메신저→보이스 채널 전이(§sessions 증분·§messages 증분·§scenarios 증분)와 2인 소셜(§challenges·§users/voices) 스키마를 더한다. **모든 신규 필드는 옵셔널(하위호환, Migration Policy)** — 기존 P0 루프 문서·필드는 무변경. 설계 근거는 Architecture.md §13·§14, DECISIONS #14~#24, ADR-0005.
> **소급 리뷰 증분(2026-07-24, T40·T33):** ① `channelHistory` 항목에 `turnCountAtTransition?`(역방향 핑퐁 방지, Architecture.md §13.8) 정식 편입 ② `reports`에 `resistedMoments?`(UX-018 "잘 대응한 지점", 후속 implementer 태스크로 구현) 추가. 근거 DECISIONS #25/#26. 둘 다 옵셔널 증분.
> **v1.3 증분(2026-07-24, T47 — 메신저 2인 챌린지 #20):** `challenges`에 `channel?`(부재→voice) 추가 + `voiceId`를 required→optional 완화(메신저 챌린지는 클론 없음, AC-051). 사용자2 체험 세션은 `channel:"messenger"`·voiceId 부재로 생성 가능. **모두 옵셔널·하위호환**(기존 보이스 챌린지 문서 무마이그레이션). 설계 근거 Architecture.md §14.8, DECISIONS #30.
> **v1.4 증분(2026-07-24, T55 — generic 보이스 2인 챌린지 #23):** `challenges`에 `voiceMode?`(부재→clone) 추가 — `channel`=voice 챌린지의 clone/generic 판별자(voiceId-부재로 오버로드하지 않음, Architecture.md §14.9.1). generic 보이스 챌린지는 `voiceMode:"generic"`·`voiceId` 부재·`channel` 부재(→voice)로 생성. `deriveChallengeResultSummary`가 이 필드로 결과 요약을 완료-전용 게이트(AC-055/OQ-32). **옵셔널·하위호환**(기존 clone 챌린지 문서 무마이그레이션). 설계 근거 Architecture.md §14.9, DECISIONS #31.
> **v1.13 증분(2026-07-27, OQ-U26 (b) — 통화 경로 랜딩 kind 배선):** `sessions/{sid}/inCallSms/{smsId}`에 **`landingKind?`** 1개 추가(`kind==="link"` + 기본값이 아닐 때만). 서버가 `resolveMockScreenKind`로 확정해 `inCallSms/buildDoc.ts` 한 곳에서만 기록하며, 기본값이면 **키를 만들지 않아** 기존 문서가 바이트 동일하게 유지된다(`MessengerAttachment.landingKind` 생략 규칙과 동일). **다른 컬렉션은 전부 무변경** — 특히 `sessions/{sid}/mockScreens/{landingId}`는 필드·rules 모두 그대로이고, 상황별 랜딩 콘텐츠는 Firestore가 아니라 **서버 소스 카탈로그(`functions/src/scenarios/mockScreens.ts`)의 `MockScreenItem` 필드**로만 존재한다(클라 원문 배포 없음). 신규 컬렉션·인덱스·rules 변경 0건. 설계 근거 Architecture.md §19.4/§19.7, DECISIONS #47·#48, ADR-0012.
> ⚠️ **헤더 "Based on PRD/UX Version"(v1.1 / 1.7)은 이 문서의 관례상 갱신되지 않고 위 증분 노트가 기준선을 대신해 왔다** — 실제 기준은 **PRD v1.7.1 · UX 1.13**(Architecture.md 헤더와 동일)이다. 표기 방식을 이번 패스에서 바꾸지 않고 사실만 적어 둔다.

## Engine
**Cloud Firestore**(NoSQL 문서 DB) + **Firebase Storage**(오브젝트). 이유는 DECISIONS #1(스택 확정)·#12(실시간 onSnapshot). 관계형 마이그레이션 없음 — 컬렉션/문서는 코드가 생성.

> **핵심 설계 원칙(AC-023, DECISIONS #8):** 어떤 컬렉션·필드에도 **송금/계좌/이체/금액 실행** 개념을 두지 않는다. 아래 스키마에 `account`/`transfer`/`pay` 필드는 존재하지 않는다. 사칭 이미지는 정적 에셋일 뿐이다.

## Firestore Collections

### `users/{uid}`  — 사용자 프로필 (UX-013, AC-027)
| Field | Type | Constraints | Description |
|---|---|---|---|
| uid | string | PK(=doc id, Firebase Auth uid) | 소유자 키 |
| displayName | string | | Google 프로필 이름 |
| email | string | | Google 이메일 |
| createdAt | timestamp | | 최초 로그인 시 생성 |
| lastLoginAt | timestamp | | |
| defenseGrade | string? | P1 | 방어 등급(UX-010, AC-010/011) |
| sessionCount | number? | P1 | 누적 세션 수 |
| ageVerified | bool? | P1 | age-gate 통과(UX-011, AC-014) |

### `users/{uid}/consents/{consentId}`  — 동의 로그 (UX-001, AC-012/017)
| Field | Type | Constraints | Description |
|---|---|---|---|
| granted | bool | required | 명시적 동의 여부 |
| grantedAt | timestamp | | |
| consentTextVersion | string | | 동의 문구 버전(추후 문구 변경 추적) |

### `sessions/{sessionId}`  — 세션 (UF-002, AC-003/006/007/021)
| Field | Type | Constraints | Description |
|---|---|---|---|
| sessionId | string | PK(=doc id) | |
| uid | string | required, indexed | 소유자(귀속) |
| scenarioId | string | required | 선택 시나리오 |
| status | string | `created`\|`active`\|`ended` | ended 전이가 폐기 트리거(ADR-0003) |
| endReason | string? | `user_ended`\|`completed`\|`deceived`\|`limit_reached` | AC-007 |
| voiceId | string? | **폐기 시 클리어** | ElevenLabs 클론 voice(임시). AC-021 |
| voiceProvider | string? | `mock`\|`elevenlabs` | 코드 정합(shared/types.ts T19) — voiceId를 만든 VoiceProvider(감사·목업 잔존 방어). UpdateRequests #3 반영 |
| cloneStatus | string | `pending`\|`ready`\|`failed`\|`fallback` | UX-003 구독(DECISIONS #9) |
| identitySelfConfirmed | bool | required | 본인 확인 체크 로그(ADR-0002) |
| turnCount | number | default 0 | 사용자 턴 수 |
| maxUserTurns | number | default 10 | OQ-U4(DECISIONS #10) |
| maxSessionMs | number | default 360000 | 6분 |
| llmProvider | string? | `mock`\|`claude`\|`gemini` | 코드 정합(shared/types.ts T7) — 이 세션 sendMessage가 쓴 LLM 어댑터(감사). UpdateRequests #3 반영 |
| answeredAt | timestamp? | | 첫 사용자 발화 시각 = maxSessionMs 기점(shared/types.ts, 2026-07-22). UpdateRequests #3 반영 |
| createdAt | timestamp | | |
| endedAt | timestamp? | | |

**T26 채널 전이 증분(옵셔널, 하위호환 — Architecture.md §13.1):**
| Field | Type | Constraints | Description |
|---|---|---|---|
| channel | string? | `messenger`\|`voice` | **현재 활성 채널**(방향 무관 상태값). 부재→`voice`. UX-014 내부 phase와 다른 층위(명명 충돌 회피로 `phase` 아닌 `channel`, DECISIONS #14) |
| entryChannel | string? | `messenger`\|`voice` | 세션 시작 채널. 리포트 교차채널 판정(AC-037) |
| channelHistory | array<{from,to,at,trigger,turnCountAtTransition?}>? | | 전이 이력. trigger=`structured_signal`\|`maxturn_fallback`\|`manual_button`(AC-035/037). `turnCountAtTransition?`는 **`to==="messenger"` 전이에만** 기록하는 전이 시점 누적 `turnCount` 기준점 — 메신저 max-turn 폴백의 핑퐁 방지(Architecture.md §13.8, DECISIONS #25) |
| messengerSkin | string? | `ios`\|`samsung`\|`default` | UA 자동 감지 결과(프레젠테이션 전용, 안전 미게이팅, §13.5) |
| skinSource | string? | `auto`\|`manual`\|`fallback` | 스킨 결정 출처 |
| voiceSelectionSource | string? | `recorded`\|`reused`\|`fallback_male`\|`fallback_female` | 조건부 clone/목소리 선택 결과(AC-046, §13.6). 결정된 voiceId는 기존 `voiceId` 필드 재사용 |
| challengeId | string? | indexed | 2인 소셜 사용자2 체험 세션이면 소속 챌린지(§14.1). 이 세션의 `uid`는 **동의 시 발급된 임시 익명 uid**(§14.7/ADR-0006) — 사용자1(실 uid) 접근 규칙·콜러블 거부. 챌린지 clone `voiceId`는 이 세션에 **미저장**(A1) — `createRealtimeCall`이 challenge 문서에서 발급 시 해석(AC-041·폐기 격리). **T47(#20)**: 메신저 챌린지 체험 세션은 `channel:"messenger"`·`surface`·`entryChannel:"messenger"`로 생성되고 voiceId가 애초에 부재(통화·`createRealtimeCall` 미사용) — `onSessionEnded`의 voiceId 삭제는 안전 no-op(Architecture.md §14.8.2) |
| maxUserTurns | number | (에스컬레이션 세션은 상향, 예 14) | 교차채널 총 한도(§13.3, 잠정) |

> 교차채널 세션에서 `maxUserTurns`는 생성 시 상향 발급될 수 있다(§13.3). `maxSessionMs`는 6분 유지.

**T57 난이도 증분(옵셔널, 하위호환 — Architecture.md §15.3.2):**
| Field | Type | Constraints | Description |
|---|---|---|---|
| difficultyLevel | string? | `beginner`\|`intermediate`\|`advanced` | 사용자가 UX-029에서 고른 훈련 강도. **부재→`intermediate`**(계산 기본값, 무백필). `createSession` 요청의 옵셔널 값을 서버가 enum 검증 후 기록하며, enum 밖·부재는 조용히 임의값으로 진행하지 않고 `intermediate`로 확정한다. 2인 챌린지 체험 세션은 `consentChallenge`가 `challenges.difficultyLevel`을 **복사**해 채운다(§15.3.2 — 복사하지 않으면 발신자 선택이 소실). ⚠️ 시나리오 메타의 기존 산문 필드 `difficulty`(예: "중간 — 감정적 압박이 강한 편입니다")와 **다른 축이며 이름을 겹치지 않는다**(§15.3.2, AC-002 무변경). 난이도는 압박 강도·요구 도달 속도·수법 은밀함만 바꾸고 **어떤 안전장치도 게이팅하지 않는다**(D-42/AC-050 — 강제는 프롬프트 조립 순서로, §15.5) |

#### `sessions/{sessionId}/messages/{messageId}`  — 대화 로그 (UX-006, AC-024)
| Field | Type | Constraints | Description |
|---|---|---|---|
| role | string | `scammer`\|`user` | 발신자 |
| textMasked | string | required | **PII 마스킹된 텍스트만 저장**(원문 미저장, ADR-0004). ⚠️ **어시스턴트 sentinel 토큰 `[[SIGNAL:*]]`는 저장 전 제거**(§13.2). 사용자 입력의 sentinel 형태 문자열도 수신 시 선제거 |
| turnIndex | number | | 순서/타임라인(AC-026). 채널을 넘어 **단조 증가**(연속성) |
| channel | string? | `messenger`\|`voice` | T26 증분 — 이 턴의 채널(AC-037 교차채널 타임라인). 부재→voice |
| attachments | array<MessengerAttachment>? | | T26 증분 — 메신저 표면 요소. `MessengerAttachment={kind:"link",displayText,fakeLandingId,harmless:true}`. **실 URL 필드 없음**(AC-045/032, 외부 네비 경로 스키마 부재) |
| createdAt | timestamp | indexed(정렬) | |

#### `sessions/{sessionId}/artifacts/{artifactId}`  — 합성물 메타 = 폐기 매니페스트 (AC-022, ADR-0003)
| Field | Type | Constraints | Description |
|---|---|---|---|
| type | string | `audio`\|`image` | 합성 오디오 / 사칭 이미지(P1) |
| storagePath | string | required | 폐기 대상 Storage 경로 |
| voiceId | string? | | 오디오면 사용된 클론 voice |
| synthetic | bool | always `true` | 합성 표식(AC-022) |
| syntheticLabel | string | `"AI 훈련용 합성"` | 화면 라벨 문구(D-3) |
| prerollLabel | string? | | 오디오 프리롤 안내 문구(D-3) |
| voiceProvider | string? | `mock`\|`elevenlabs` | 코드 정합(shared/types.ts T19) — 합성물을 만든 VoiceProvider. UpdateRequests #3 반영 |
| createdAt | timestamp | | |

#### `sessions/{sessionId}/inCallSms/{smsId}`  — 통화 중 도착 문자 (T57, UX-027/UF-008, Architecture.md §15.1.2)
> **⚠️ 왜 `messages`가 아니라 별도 서브컬렉션인가(치명적):** `analyzeConversation`은 `messages`를 turnIndex 순으로 훑으며 **scammer(i) ↔ user(i+1) 짝짓기**로 속은 순간을 판정한다(`functions/src/report/analyzeConversation.ts:127-154`). 문자를 메시지 행으로 끼워 넣으면 이 짝짓기가 어긋나 **리포트 판정이 손상된다**(AC-008/009/026 회귀). 문자는 대화 턴이 아니라 통화 중 도착한 별개 객체이므로 컬렉션을 분리한다.

| Field | Type | Constraints | Description |
|---|---|---|---|
| smsId | string | PK(=doc id) | 시나리오 문자 카탈로그(`functions/src/scenarios/inCallSms.ts`) 항목 id. 서버가 `IN_CALL_SMS[session.scenarioId]` 소속을 **재검증**한 값만 기록(§15.1.2 G12) |
| kind | string | `account`\|`link`\|`otp` | 계좌·요구형 / 링크형 / 인증번호형(UX-027 Content 3종) |
| senderLabel | string | required | 발신번호 라벨(실존하지 않는 모의값, AC-005/013) |
| body | string | required | 본문. **서버 카탈로그가 원천**이며 사용자·LLM이 생성하지 않는다 → PII 마스킹 대상 아님(사용자 텍스트가 아님) |
| otpCode | string? | `kind==="otp"`일 때만 | **콘텐츠에 고정된 리터럴**(런타임 난수 금지 — 결정론적 테스트 + 모의값 불변식) |
| linkDisplayText | string? | `kind==="link"`일 때만 | 모의 표기 문자열. UX-023(`MessengerFakeLanding`)의 제목으로 그대로 쓰인다 |
| fakeLandingId | string? | `kind==="link"`일 때만 | 인앱 가짜 랜딩 참조. **`url`/실 URL 필드는 이 스키마에 존재하지 않는다**(AC-032/045 구조적 금지 — `MessengerAttachment`와 동형) |
| landingKind | string? | `kind==="link"` + **기본값이 아닐 때만** | **§19.4 증분(OQ-U26 (b)).** `credential-form`\|`app-install`. 서버가 `resolveMockScreenKind(session.scenarioId, fakeLandingId)`로 확정해 `functions/src/inCallSms/buildDoc.ts` **한 곳에서만** 기록한다 — **클라가 `fakeLandingId` 문자열로 kind를 추론하지 않는다**(§15.9.1 R3, AC-024 계승). **값이 기본값(`credential-form`)이면 키 자체를 만들지 않는다** — `MessengerAttachment.landingKind`의 생략 규칙(`functions/src/roleplay/linkMarker.ts:58`)과 **글자 그대로 동일**하며, 같은 개념에 생략 규칙이 두 벌이 되는 것을 막는다. 읽기 규칙: `landingKind ?? "credential-form"`(무백필 — 기존 문서 바이트 동일). ⚠️ 생략된 키가 `app-install`을 뜻할 수 없음은 게이트 **G-A**(`entrySurface==="in-call-sms"` ⇒ `kind!=="app-install"`, Architecture.md §19.5)가 보장한다 |
| arrivedAt | timestamp | indexed(정렬) | 도착 시각. 클라는 이 컬렉션을 `onSnapshot`으로 구독해 배너·문자함을 렌더한다(실시간·폴백 **양 경로 공통 단일 소스**) |
| openedAt | timestamp? | | 사용자가 오버레이에서 열어본 시각(`recordInCallSmsEvent`) |
| linkTappedAt | timestamp? | | 링크 칩 탭 시각. **v1에서 이 값들은 리포트 판정(analyzeConversation) 입력이 아니다** — 리플레이·표시용(근거 없는 판정 변경 금지) |
| anchorScammerTurn | number | required(신규 문서) | **§15.1.5 증분.** "이 문자가 도착한 시점까지 `messages`에 존재하는 `role==="scammer"` 문서 수". **클라 입력이 아니라 서버가 카탈로그 값에서 계산**해 `functions/src/inCallSms/buildDoc.ts` **한 곳에서** 기록한다(실시간 `deliverInCallSms`·폴백 `sendMessage` 두 write 경로가 이미 이 헬퍼를 공유). 값: 실시간=`item.afterScammerTurns`, 폴백=`item.afterScammerTurns - 1`(폴백은 N번째 사기범 응답을 **만들기 직전**에 write하므로 완료된 발화가 하나 적다). **리포트 생성 시점에 실제 `turnIndex`로 해결**돼 `reports/{rid}.smsTimeline[].anchorTurnIndex`가 된다. 기존 문서는 부재 → 앵커 미해결로 취급(`anchorResolved:false`, 무백필) |

> **⚠️ 이 필드가 왜 필요한가(시계로 병합할 수 없는 이유 — 실측):** 실시간 경로의 `messages.createdAt`은 실제 발화 시각이 아니라 **통화 종료 시점에 합성된 값**이다(`functions/src/realtime/submitTranscript.ts:64,78` — `baseTime = Date.now()`(제출 시각) + `i*1000`). 반면 `arrivedAt`은 통화 **중** 실제 시각이다. 시간순으로 병합하면 **모든 문자가 대화 맨 앞에 몰리고**, 폴백 텍스트 경로는 정상 동작해 **두 경로가 갈라진다**. 그래서 병합 축을 시계가 아니라 **턴 앵커**로 둔다(Architecture.md §15.1.5 (4), §15.6 G15).

> **쓰기 주체는 Functions(admin)뿐**이다(클라 직접 write 거부). 실시간 경로는 `deliverInCallSms`, 폴백 텍스트 경로는 `sendMessage`가 같은 문서를 쓴다. `MessengerAttachment`(메신저 채팅 첨부)는 **무변경** — OTP형은 링크가 아니라 표시용 코드라 그 타입에 담기지 않는다(부재-오버로드 회피, §15.1.2).
> **폐기(AC-021):** 이 문서들은 Storage 산출물이 아니라 마스킹 불요한 서버 저작 텍스트이므로 `messages`와 동일하게 세션 종료 후에도 잔존한다(리플레이 UX-018 입력). Storage·ElevenLabs voice 폐기 경로는 무변경.

#### `sessions/{sessionId}/verifyIntercept/{offerId}`  — 확인 시도 무력화(모의 확인 전화) (T79, UX-031/UF-011, Architecture.md §16.3.1)
> **⚠️ 세션당 최대 1건**(이 흐름은 세션에서 한 번만 일어난다). 문자(`inCallSms`)와 **별개 컬렉션**인 이유는 같다 — `messages`에 넣으면 `analyzeConversation`의 scammer(i)↔user(i+1) 짝짓기가 어긋나 리포트 판정이 손상된다(§15.6 G3/G25).
> **⚠️ 실 발신 표면 부재(AC-019 하드):** 이 스키마에는 `url`·`tel`·전화번호 **입력** 필드·발신 대상 식별자가 **존재하지 않는다.** `displayNumber`는 화면에 글자로만 나오는 모의값이며, 탭 대상은 번호가 아니라 버튼이다(UX-031 P-24).

| Field | Type | Constraints | Description |
|---|---|---|---|
| offerId | string | PK(=doc id) | 카탈로그(`functions/src/scenarios/verifyIntercept.ts`) 항목 id. 서버가 `VERIFY_INTERCEPT[session.scenarioId]` 소속을 **재검증**한 값만 기록(§16.1.5, G24) |
| deskLabel | string | required | 모의 창구명(실존 기관·실존 창구 아님 — AC-033/AC-005, 금지 패턴 검증 대상) |
| displayNumber | string | required, `/^\d{3,4}-0000$/` | **표시 텍스트 전용** 모의 번호. 형식(마지막 4자리 `0000`)을 architect가 고정해 구현 임의 판단을 막는다. 실존 대표번호(112·1332·1577-xxxx 등)와 부분 일치 금지 |
| offeredAt | timestamp | required | 확인 권유가 도착한 시각(표시 축 아님 — §16.3.2) |
| offerAnchorScammerTurn | number | required | "이 시점까지 `messages`에 존재하는 `role==="scammer"` 문서 수". **클라 입력이 아니라 서버 계산**(실시간=`scammerTurns+1`, 폴백=서버가 센 scammer 문서 수 — `functions/src/verifyIntercept/buildDoc.ts` 단일 지점, `inCallSms/buildDoc.ts:42-65`와 동형) |
| announcedAt | timestamp? | | **폴백 경로 전용** — `sendMessage`가 `turnInstruction`으로 권유 대사를 주입한 턴(중복 주입 방지 마크). 실시간 경로는 클라가 즉시 주입하므로 세팅되지 않는다 |
| placedAt | timestamp? | | 참가자가 UX-031에서 "확인 전화 걸기"를 누른 시각 = **확인 시도**. 부재 = D-51 ①("권했으나 걸지 않음" — 속은 순간 아님) |
| reconnectAnchorScammerTurn | number? | `placedAt`과 함께 | 재연결 시점의 같은 계수. **판정 앵커**(재연결 대사 = `scammers[이 값]`)의 근거이며 표시 앵커와 **구분된다**(§16.3.2 — 혼동 시 재연결 **전** 순응까지 오분류) |
| reconnectedCallerLabel | string? | `placedAt`과 함께 | 재연결 후 통화 셸 발신자 라벨(모의값). 클라는 **문서 구독**으로 이 값을 읽어 라벨을 오버라이드한다(클라 상태가 아니라 문서가 소스 — 새로고침·재마운트 후에도 유지) |

> **문서에 절대 넣지 않는 것:** `announceInstruction`·`reconnectInstruction`(=**모델 지시**, 프롬프트 재료 — AC-024/ADR-0004. `buildInCallSmsDoc`이 `announceInstruction`을 문서에 쓰지 않는 것과 동일), 실 URL·발신 대상, 참가자 입력값(이 화면에는 자유 입력 필드가 없다).
> **쓰기 주체는 Functions(admin)뿐**(클라 직접 write 거부 — `inCallSms`와 동일 규칙). write 경로는 `deliverVerifyOffer`·`deliverVerifyReconnect` **두 콜러블뿐**이며 둘 다 세션 소유·`status:"active"`·카탈로그 소속·**난이도 advanced**·**프로바이더 non-elevenlabs**를 재검증한다(§16.1.5).
> **폐기(AC-021):** `inCallSms`와 동일 — 서버 저작 텍스트라 Storage 폐기 대상이 아니며 세션 종료 후에도 잔존(리플레이 입력).

### `scenarios/{scenarioId}`  — 시나리오 공개 메타 (UX-004, AC-001/002)
| Field | Type | Constraints | Description |
|---|---|---|---|
| title | string | required | 제목 |
| fraudType | string | required | 사기 유형(예: 가족 납치/사고) |
| estimatedDuration | string | required | 예상 소요 |
| difficulty | string | required | 난이도(강도) 라벨 |
| deepvoiceLines | array<{lineId,text}> | | 딥보이스 재생 대사(UX-005) |
| voiceMode | string? | `clone`\|`generic` | 기존 코드(publicMeta.ts) 필드 — 문서 정합화 반영 |
| callerLabel | string? | | 기존 코드 필드 — 발신자 라벨(UX-014) |
| channel | string? | `voice`\|`messenger` | **T26 증분** — 훈련 채널. 부재→voice(AC-030) |
| surface | string? | `kakao`\|`sms` | **T26 증분** — 메신저 표면(AC-030). 메신저 전용 |
| escalation | {toChannel:"voice",voiceScenarioId?,voiceMode:"clone"\|"generic"}? | | **T26 증분** — 메신저→보이스 전이 가능 표기 + 음성 모드(AC-046 조건부 clone 판정 입력) |

> 클라이언트 read 허용(공개 메타). 최소 한국어 "가족 납치/사고" 1종 필수(AC-001). T6 산출. 메신저 시나리오 콘텐츠는 T27, 표면=콘텐츠와 분리된 프레젠테이션 레이어(Architecture.md §13.4).

### `scenarioPrompts/{scenarioId}`  — 시나리오 민감 프롬프트 (ADR-0004, 클라 read 거부)
| Field | Type | Constraints | Description |
|---|---|---|---|
| personaPrompt | string | required | 사기범 페르소나(서버 조립용) |
| weakenedTactics | array<string> | required | 약화된 수법 집합(AC-005) |
| guardrailPreamble | string | required | 인젝션 방어 프리앰블(AC-013) |

> **Firestore 규칙으로 클라 read 전면 거부** — Functions/admin만 읽는다. `scenarios`와 같은 id로 1:1 매핑하되 분리 저장(필드 단위 읽기 제한이 어려운 Firestore 특성 대응).

> ⚠️ **구현 현황(2026-07-22 실측)**: 런타임은 이 컬렉션을 **읽지 않는다**. `sendMessage`·
> `generateOpeningLine`은 Functions 번들에 함께 배포되는 인메모리 상수
> `functions/src/scenarios/index.ts`의 `SCENARIO_PROMPTS`를 직접 참조한다(문서-코드 드리프트를
> 명시). 이 스키마와 `seed.ts`는 프롬프트를 코드 배포와 분리해 갱신하고 싶어질 때를 위해
> 유지한다. 보안 결론은 동일하다 — 프롬프트는 어느 경로로도 클라이언트에 노출되지 않는다
> (인메모리 상수는 `functions/` 번들 안에만 존재하고 클라 번들에 포함되지 않는다, ADR-0004).
> 실시간 음성 통화 경로에서는 프롬프트가 ElevenLabs 에이전트 쪽에 저장된다
> (`functions/src/realtime/agentMap.ts` 주석 참고).

### `reports/{reportId}`  — 취약점 리포트 (UX-008, AC-008/009/026)
| Field | Type | Constraints | Description |
|---|---|---|---|
| reportId | string | PK(=sessionId 권장) | |
| sessionId | string | required, indexed | |
| uid | string | required, indexed | 소유자 |
| wasDeceived | bool | required | 속았는지(AC-009) |
| deceivedMoments | array<{turnIndex,timeLabel,tactic,correctAction,**tacticCategory?**}> | | 속은 시점 타임라인(AC-026). **T57 증분 `tacticCategory?`**(`urgency`\|`authority`\|`affection`\|`verification_block`\|`payment_demand`\|`personal_info_demand`\|`link_or_install`\|`intimidation`\|`benefit_lure`\|`other`): 자유 문자열 `tactic`(시나리오 콘텐츠의 `weakenedTactics` 라벨)을 **리포트 생성 시점에 고정 카테고리로 정규화**한 값. 실패 아카이브(UX-030)의 "수법별 묶기" **그룹 키**이며, 없으면 같은 수법이 시나리오별 표기 차이("긴급성 조성"/"다급함 조성"/"마감 압박")로 흩어져 "이 수법에 3번 넘어갔습니다"가 성립하지 않는다(Architecture.md §15.4.2). 표시 문구는 기존 `tactic` 원문 그대로. **부재→`tactic` 문자열을 키로 폴백**(기존 리포트 무백필) |
| resistedMoments | array<{turnIndex,timeLabel,tactic,goodResponse}>? | | **T33 소급 결정(DECISIONS #26)** — 사용자가 잘 대응한(저항) 턴 타임라인. UX-018 리플레이 해설의 "잘 대응한 지점"(never-deceived Empty 상태)이 요구하는 per-turn 마커. `deceivedMoments`의 대칭 필드로, 동일 규칙 기반 분석(analyzeConversation.ts의 `RESISTANCE_PATTERN`)이 **이미 매 턴 계산하지만 현재 버리는** 저항 판정을 기록한다. `goodResponse`=그 순간 사용자가 잘한 대응의 긍정 문구(정확 카피는 구현/ux-design 상세). 옵셔널 증분(하위호환, Migration Policy) — 기존 리포트는 부재→빈 배열 취급. **⚠️ 아직 미구현(후속 implementer 태스크): shared/types.ts `ReportDoc`에 필드 추가 + analyzeConversation.ts/generateReportCore.ts가 저항 분기를 기록하도록 확장** |
| tacticsUsed | array<string> | required | 사용된 조작 수법(AC-008) |
| preventionAdvice | array<string> | min 1 | 예방 조언(AC-008) |
| createdAt | timestamp | indexed | 히스토리 정렬(AC-016) |

**T57 아카이브 역정규화 증분(옵셔널, 하위호환 — Architecture.md §15.4.1):** 실패 아카이브(UX-030)가 카드 1장을 그릴 때 세션 문서를 항목 수만큼 추가 read(N+1)하지 않도록, 리포트 생성 시점에 이미 읽고 있는 세션(`generateReportCore.ts:23`)에서 네 값을 역정규화한다.
| Field | Type | Constraints | Description |
|---|---|---|---|
| scenarioId | string? | | 카드의 시나리오 식별. **제목은 역정규화하지 않는다** — 클라의 `PUBLIC_SCENARIOS`에서 얻어 콘텐츠 수정이 과거 카드에도 반영되게 한다 |
| channel | string? | `voice`\|`messenger` | 카드의 채널 표기(보이스/메신저) |
| difficultyLevel | string? | `beginner`\|`intermediate`\|`advanced` | 카드의 난이도 표기(P-22 동일 라벨). 부재→`intermediate` |
| challengeId | string? | | 2인 챌린지 체험 세션에서 나온 리포트 표식. **아카이브는 이 값이 있는 리포트를 제외한다**(AC-043/055 2차 하드닝 — 1차 방어는 익명 uid 소유권 격리, §15.4.3) |

**§15.1.5 증분 — 통화 중 문자 이벤트 스냅샷(옵셔널, 하위호환, 표시 전용):** AC-059의 *"문자 확인·링크 탭·인증번호 노출은 하나의 세션 타임라인에 기록되어 리포트(AC-026)·리플레이 해설(AC-038)에서 함께 다뤄진다"* 를 충족한다. 리포트 생성 시점에 `sessions/{sid}/inCallSms`를 **1회 read**해 **최종 표시 순서로 정렬한 배열**을 기록하므로, 리플레이·리포트 화면은 이미 읽고 있는 `reports/{sid}` 하나만으로 타임라인을 그린다(서브컬렉션 추가 조회·신규 rules 경로 불요).

| Field | Type | Constraints | Description |
|---|---|---|---|
| smsTimeline | array\<SmsTimelineEntry\>? | | 부재→빈 배열 취급(무백필). **최초 리포트 생성 시 1회만** 기록되고 이후 갱신되지 않는다(`reportId=sessionId` 멱등 early-return 유지 — **AC-007 무변경**). 세션 종료 후에는 문자가 더 생길 수 없다(`deliverInCallSms`가 `status:"active"`만 허용) |

```
SmsTimelineEntry = {
  smsId, kind: "account"|"link"|"otp", senderLabel, body,
  linkDisplayText?,        // kind==="link"일 때만. **표시용 텍스트** — 컨트롤로 렌더 금지
  anchorTurnIndex: number, // 이 turnIndex의 메시지 '뒤'에 놓인다. -1 = 대화 맨 앞
  anchorResolved: boolean, // false = 위치 확정 실패 → 화면이 정직하게 고지(조용한 누락 금지)
  timeLabel?: string,      // 앵커 메시지의 경과 초에서 파생 — deceivedMoments와 **같은 시간축**
  events: Array<{ event: "sms_received"|"sms_opened"|"sms_otp_shown"|"sms_link_tapped",
                  what: string, correctAction?: string }>
}
```

> **스냅샷에 절대 넣지 않는 필드(구조적 금지 — Architecture.md §15.1.5 (3)/§15.6 G19):** `fakeLandingId`(넣으면 사후 열람 화면이 가짜 랜딩 재진입 컨트롤을 만들 수 있다 — AC-045는 **세션 중** 재현 규정이고 UX-018은 Read-only 화면), `otpCode`(본문에 이미 있고, 따로 두면 "복사 가능한 필드"가 되어 AC-061의 *앱이 복사·전송 동선을 대신 만들지 않는다* 취지와 어긋난다), `arrivedAt`/`openedAt`/`linkTappedAt` 원시 타임스탬프(표시 축이 아니다 — 넣어 두면 화면이 실수로 그 축을 써서 실시간 경로에서 순서가 뒤집힌다), `url`(애초에 어느 스키마에도 없다 — AC-032/045).
> **판정 무변경(AC-007/008/009/026 보호):** `smsTimeline`은 `analyzeConversation`의 **입력이 아니라 산출 뒤에 나란히 얹히는 배열**이다. `wasDeceived`·`deceivedMoments`·`tacticsUsed`·`preventionAdvice`는 문자 유무와 무관하게 동일해야 하며(회귀 테스트 필수), 문자 상호작용으로 `wasDeceived`를 뒤집거나 `deceivedMoments`에 항목을 추가하는 것은 **금지**다(§15.6 G22 — AC-062/068/010/011이 연쇄로 흔들린다).

**§16.3 증분 — 확인 시도 무력화 스냅샷 + 순간 주석(옵셔널, 하위호환):** AC-071의 *"이 순간은 세션 타임라인에 기록되어 리포트에서 **확인했는데도 속은 순간**으로 짚인다"* 를 충족한다. `smsTimeline`과 **같은 수집 지점·같은 1회 기록 규칙**을 쓴다(리포트 생성 시 `sessions/{sid}/verifyIntercept` 1회 read).

| Field | Type | Constraints | Description |
|---|---|---|---|
| verifyTimeline | array\<VerifyTimelineEntry\>? | | 부재→빈 배열 취급(무백필). **최초 리포트 생성 시 1회만** 기록(AC-007 무변경). D-51 ①/⑤(속은 순간 0건)에서도 이 배열은 존재할 수 있다 — 리포트 타임라인 노출 조건이 `deceivedMoments`에만 걸려 있으면 **항목이 통째로 사라진다**(§16.6 G30) |
| deceivedMoments[].afterVerifyReconnect | true? | | **주석(annotation)** — 그 순간이 모의 재연결 **이후**의 응낙임을 표시. 이 플래그가 붙은 순간은 `tactic="확인 시도 무력화"`·`tacticCategory="verification_block"`·`correctAction=VERIFY_INTERCEPT_CORRECT_ACTION`으로 **덮어쓰여 저장**된다(ADR-0009) |

```
VerifyTimelineEntry = {
  offerId, deskLabel, displayNumber,   // displayNumber는 **텍스트로만** 렌더(링크·복사·재발신 컨트롤 금지)
  anchorTurnIndex: number,             // 표시 위치(= 오퍼 앵커). -1 = 대화 맨 앞
  anchorResolved: boolean,             // false = 위치 확정 실패 → 화면이 정직하게 고지
  timeLabel?: string,                  // 앵커 메시지의 경과 초에서 파생 — deceivedMoments와 같은 시간축
  reconnectTimeLabel?: string,         // placedAt 있을 때, 재연결 앵커 메시지에서 파생
  outcome: "offered_not_placed"        // D-51 ① 권했으나 걸지 않음 → 속은 순간 아님
         | "placed_not_complied"       // D-51 ⑤ 걸었으나 응하지 않음 → 속은 순간 아님("잘 대응한 지점")
         | "placed_and_complied",      // D-51 ② 걸고 응함 → 기존 순간에 주석
  events: Array<{ event: "verify_offer_shown"|"verify_reconnected",
                  what: string, correctAction?: string }>
}
```

> **스냅샷에 절대 넣지 않는 필드(구조적 금지 — Architecture.md §16.3.1):** `announceInstruction`·`reconnectInstruction`(**모델 지시** = 프롬프트 재료, AC-024/ADR-0004), `offeredAt`/`placedAt` 원시 타임스탬프(표시 축이 아니다 — 실시간 경로에서 순서가 뒤집힌다), 실 URL·발신 대상(어느 스키마에도 없다), **가로채기의 수단·작동 원리 서술**(AC-005 불변 — 금지 패턴 테스트 대상. 결과 상황 서술은 허용).
> **계상 단일성(AC-062/007/010/011 보호, ADR-0009):** 확인 무력화는 `deceivedMoments`에 항목을 **추가하지 않는다.** 그 응낙은 참가자의 **대화 발화**라 `analyzeConversation`이 이미 순간으로 잡았고(analyzeConversation.ts:136-164), 추가하면 **같은 응낙이 두 번 계상**되어 아카이브 항목 수·방어등급이 부풀고 되감기 딥링크 인덱스가 어긋난다(§15.6 G16). 순간 개수·`turnIndex`·`timeLabel`·`wasDeceived`는 **한 건도 바뀌지 않는다**(회귀 테스트 필수: 확인 문서 0건·`placedAt` 부재 두 경우 모두 산출이 도입 전과 완전 동일).

#### `reports/{reportId}/rewindAttempts/{attemptId}`  — 즉시 되감기 시도 기록 (T57, UX-028/UF-009, Architecture.md §15.2.2)
> **⚠️ AC-007 불변식 보호가 이 서브컬렉션의 존재 이유다.** 되감기는 원 리포트를 **읽기 전용으로만** 참조한다 — `reports/{reportId}` 문서 필드(`wasDeceived`·`deceivedMoments`·`tacticsUsed`·`preventionAdvice`)를 **update하지 않고**, 두 번째 `reports/*` 문서를 **만들지 않으며**, `updateDefenseGrade`(`users.defenseGrade`/`sessionCount`)를 **호출하지 않는다**. 최상위 컬렉션 쿼리(`db.collection("reports")`)는 서브컬렉션 문서를 포함하지 않으므로 기존 집계·아카이브가 오염되지 않는다.

| Field | Type | Constraints | Description |
|---|---|---|---|
| momentTurnIndex | number | required | 어느 `deceivedMoments` 항목에 대한 시도인지 |
| answerMasked | string | required, ≤500자 | 사용자 새 답변. **`maskPII` 적용 후에만 저장**(원문 미저장, ADR-0004 계승) |
| verdict | string | `good`\|`risky`\|`unclear` | 3단계 판정. `unclear`("판단하기 어렵습니다")는 오류가 아니라 정상 결과값 |
| reason | string | | 이유 1줄 |
| judgedBy | string | `llm`\|`rule` | 판정 주체. LLM 불가·실패 시 기존 `RESISTANCE_PATTERN`/`COMPLIANCE_PATTERN` 규칙 폴백(§15.2.3) |
| createdAt | timestamp | | 리포트당 시도 **50건 상한**(남용 방지 — 학습 흐름에서 도달하지 않는 값) |

> **생성물 음성은 폐기되므로 리포트·메타만 계정에 잔존**(AC-021). 실제 운영정보(실계좌·실링크) 배제(AC-005/013).
> **`resistedMoments`(T33/DECISIONS #26):** UX-018 Empty 상태("한 번도 속지 않은 경우 → 시도된 수법과 '잘 대응한 지점' 주석")를 스키마상 충족 가능하게 만드는 추가. AC-038의 "신규 데이터 모델·분석 파이프라인 도입 금지"와 상충하지 않는다 — 새 컬렉션·새 분석 패스가 아니라 **기존 리포트 문서에 옵셔널 필드 1개** + 이미 도는 규칙 기반 분석이 계산해 둔 저항 판정을 **저장만** 하는 대칭 증분이다. PRD AC-009/037(never-deceived=사실 명시+수법 나열)은 이 필드 없이도 충족되므로 PRD 변경 불요이며, UX-018 spec은 이 필드로 spec 그대로 충족 가능해진다(UX.md 변경 불요).

### `deletionLogs/{logId}`  — 폐기 감사 로그 (AC-021, ADR-0003)
| Field | Type | Constraints | Description |
|---|---|---|---|
| sessionId | string | required, indexed | |
| uid | string | required | |
| deletedAt | timestamp | | |
| targets | array<{kind,ref,result}> | required | kind=`storage`\|`elevenlabs_voice`, result=`success`\|`partial`\|`failed` |
| overallResult | string | `success`\|`partial`\|`failed` | 부분 실패 시 재시도 근거 |

> **T35 재사용:** 챌린지 음성(§challenges)의 기간제/수동 삭제도 이 `deletionLogs` + 동일 폐기 기계(ElevenLabs voice DELETE + Storage 삭제)를 재사용한다(ADR-0005·ADR-0003). `deletionLogs`에 옵셔널 `challengeId?`를 더해 챌린지 폐기 출처를 남길 수 있다(하위호환).

### `challenges/{challengeId}`  — 2인 소셜 챌린지 (UF-004/005, T35, AC-040~044/048/049)
| Field | Type | Constraints | Description |
|---|---|---|---|
| challengeId | string | PK(=doc id) | |
| creatorUid | string | required, indexed | 사용자1(발신)·활성개수 판정 키 |
| scenarioId | string | required | 챌린지 시나리오(생성 시 확정, OQ-29). 보이스=딥보이스(clone), 메신저=`channel:"messenger"` 시나리오 |
| channel | string? | `voice`\|`messenger`, **부재→`voice`**(계산 기본값·무백필) | **T47 증분(#20)** — 채널 판별자. 생성 시 `PUBLIC_SCENARIOS[scenarioId].channel ?? "voice"`로 역정규화. 수신자 라우팅(UX-014 vs UX-022)·발신자 결과 분기의 단일 판별자(scenarioId 룩업 불요). voiceId-부재를 채널 신호로 오버로드하지 않는 이유는 Architecture.md §14.8.1(#21은 messenger+voiceId 병존) |
| voiceId | string? | **T47: required→optional**, 존재 시 **챌린지 스코프 고정** | 클론 voice. 챌린지 밖 재사용·추출 불가(AC-041, ADR-0005). **메신저 챌린지(#20)엔 부재** — 클론·통화 경로 미사용(AC-051). generic 보이스 챌린지(#23)에도 부재(AC-058). 기존 보이스 문서는 전부 세팅돼 하위호환 |
| voiceMode | string? | `clone`\|`generic`, **부재→`clone`**(계산 기본값·무백필) | **T55 증분(#23)** — `channel`=voice 챌린지의 clone/generic 판별자. 생성 시 `PUBLIC_SCENARIOS[scenarioId].voiceMode`로 역정규화. `voiceMode:"generic"`이면 클론·voiceId·통화 자격증명 미탑재, `GENERIC_VOICE_ID` 폴백 합성(AC-058). **voiceId-부재를 판별자로 오버로드하지 않는 이유**는 Architecture.md §14.9.1(결과 요약 게이트가 양 판별자 필요·#21 messenger+voiceId 병존). `channel:"messenger"` 챌린지엔 두지 않음(음성모드 개념 없음). resolveChallengeByTokenHash projection에 포함(비민감, `channel`과 동형) |
| displayName | string | required | "○○님이 준비" 표시이름(사용자2 노출용) |
| status | string | `pending`\|`consented`\|`in_progress`\|`completed`\|`expired`\|`reported`\|`deleted` | 상태 머신 |
| linkTokenHash | string | required, indexed | 공유 토큰 **SHA-256 해시만**(평문 미저장, §14.4) |
| linkExpiresAt | timestamp | required | 링크 만료(무료 생성+3일 / 유료 7일+). AC-048 |
| linkConsumedAt | timestamp? | | 1회성 소모(동의 통과 시). §14.4 |
| retentionDeleteAt | timestamp | required | 복제 음성·챌린지 자동 삭제 예정(생성+보존기간 기본 30일). **링크 만료와 별개**(AC-041) |
| resultSharingConsented | bool? | | 사용자2 결과 공유 동의(AC-043 열람 게이트). 부재=미동의 |
| resultSummary | {completed:bool,suspicionTimeLabel?,suspicionTurnIndex?}? | | **동의 시에만** Functions 기록. **대화 전문 없음**(AC-043). **T47(#20)**: 메신저 챌린지는 `deriveChallengeResultSummary`가 채널 게이트로 `{completed}`만 파생 — suspicion 필드는 애초에 계산·저장 안 함(AC-055/OQ-31 "의심 시점 어떤 형태로도 미노출", 쓰기 시점 강제. Architecture.md §14.8.3). **T55(#23)**: generic 보이스 챌린지도 `voiceMode` 게이트로 `{completed}`만 파생(OQ-32 default "완료 여부만"=AC-055 동형). clone 보이스 챌린지만 장래 의심-타이밍 확장 여지 유지. Architecture.md §14.9.3 |
| reportedAt | timestamp? | | 사용자2 신고 시각(AC-049) |
| reportReason | string? | `unwanted`\|`harassment`\|`impersonation_concern`\|`other` | 신고 사유 enum |
| reportNote | string? | 마스킹 | 선택 신고 메모(PII 마스킹) |
| tier | string? | `free`\|`paid`(부재=free) | **용량 축에만 영향**(§14.6, AC-050 위반 없음) |
| difficultyLevel | string? | `beginner`\|`intermediate`\|`advanced`, **부재→`intermediate`** | **T57 증분** — 발신자가 UX-029에서 고른, 수신자가 겪을 강도(§15.3.2). `createChallenge`가 기록 → 동의 랜딩(UX-021) 표시 → **`consentChallenge`가 사용자2 체험 세션의 `difficultyLevel`로 복사**(프롬프트는 세션 단위 조립이라 복사하지 않으면 소실 — §15.6 G9). **난이도는 활성 챌린지 상한(AC-049)·링크 토큰(AC-048)·결과 열람 범위(AC-043/055)를 포함해 어떤 안전·정책 판정도 바꾸지 않는다**(D-42/AC-050) |
| createdAt | timestamp | | |

> **사용자2 접근은 전부 Functions 매개**(무로그인·토큰). 사용자1은 자기 챌린지 문서를 read하되 `resultSummary`는 동의 시에만 채워진다. **대화 전문 컬렉션(사용자2 체험 세션의 messages)에 사용자1 접근은 규칙으로 거부**(AC-043 스키마 강제). 챌린지 음성 스코프·삭제 구조는 ADR-0005.

### `users/{uid}/voices/{voiceId}`  — 유지형 복제 음성 보관함 (P-8·AC-046 재사용, ADR-0005)
| Field | Type | Constraints | Description |
|---|---|---|---|
| voiceId | string | PK(=doc id) | ElevenLabs 클론 voice id |
| label | string | | 사용자 지정 라벨("내 목소리 1") |
| retentionDeleteAt | timestamp | required | 기간제 보존(기본 30일, 조정 7~90일). 자동/수동 삭제 |
| source | string? | `onboarding`\|`escalation` | 생성 경위 |
| createdAt | timestamp | | |

> **ADR-0003(세션 종료 즉시 폐기)의 예외가 아니라, 사용자가 명시적으로 "보관"을 택한 별도 opt-in 저장소**(ADR-0005). 기본 세션 클론은 여전히 즉시 폐기. AC-046 "기존 목소리 재사용"·P-8 "내 목소리 금고"가 이 컬렉션을 읽는다. **추출·다운로드 콜러블 없음.** MVP 최소는 이 컬렉션 없이 즉시녹음+gendered 폴백만으로 성립(§13.6) — 스키마는 T30 비차단용으로 정의.

## Storage Layout
| Path | Contents | 수명 | Writer |
|---|---|---|---|
| `users/{uid}/sessions/{sid}/voice_input.webm` | 30초 녹음 | 세션 종료 시 폐기 | 클라(rules 강제) |
| `users/{uid}/sessions/{sid}/synth/{artifactId}.mp3` | 합성 오디오 | 세션 종료 시 폐기 | Functions(admin) |
| `users/{uid}/sessions/{sid}/images/{artifactId}.png` | 사칭 이미지(P1) | 세션 종료 시 폐기 | Functions/정적 |
| `users/{uid}/challenges/{cid}/voice_input.webm` | 챌린지용 사용자1 30초 녹음 | **기간제 보존**(retentionDeleteAt, 기본 30일)·수동 삭제 | 클라(rules 강제·소유자 uid) |
| `/public/...`(Next.js) 또는 비-사용자 Storage | 폴백 오디오·표식 프리롤·사칭 이미지 템플릿 | 영구(비민감) | 팀 사전 준비 |

> 챌린지 녹음은 `creatorUid`만 read(storage.rules, ADR-0002 규칙 계승). 합성 산출물은 Functions만 write. **다운로드/추출 콜러블·경로 없음**(AC-041). 세션 종료 즉시 폐기(ADR-0003)와 달리 챌린지 음성은 기간제 보존(ADR-0005) — 비동기 3일 링크 때문.

## Relationships
- `users` 1:N `sessions` (uid) · `users` 1:N `consents`(서브컬렉션)
- `sessions` 1:N `messages`(서브) · 1:N `artifacts`(서브) · **1:N `inCallSms`(서브, T57)** · **1:N(최대 1) `verifyIntercept`(서브, T79)** · 1:1 `reports`(sessionId) · 1:N `deletionLogs`(sessionId)
- **`reports` 1:N `rewindAttempts`(서브, T57)** — 되감기 시도는 리포트 문서를 바꾸지 않고 하위에만 쌓인다(AC-007, §15.2.2)
- `scenarios` 1:1 `scenarioPrompts`(같은 id) · `sessions` N:1 `scenarios`(scenarioId)
- **`users` 1:N `challenges`(creatorUid)** · **`challenges` 1:1 `voiceId`(챌린지 스코프 고정)** · **`challenges` 1:N `sessions`(challengeId — 사용자2 체험 세션)** · **`users` 1:N `voices`(보관함, ADR-0005)**

## Indexes
| Collection | Index | Reason |
|---|---|---|
| `sessions/{}/messages` | `createdAt` asc | 대화 시간순 표시(AC-026) |
| `sessions` | `uid` + `createdAt` desc | 히스토리 열람(UX-012, AC-016) |
| `reports` | `uid` + `createdAt` desc | 리포트 히스토리(AC-016) |
| `deletionLogs` | `sessionId` | 감사 조회 |
| `challenges` | `linkTokenHash` | **토큰 조회**(사용자2 진입, §14.4) — 단일 필드 인덱스 |
| `challenges` | `creatorUid` + `status` | 활성 챌린지 개수 상한 판정(§14.5, AC-049) + 사용자1 목록(UX-020) |
| `challenges` | `retentionDeleteAt` | 기간제 자동 삭제 스캔(AC-041) |
| `sessions` | `challengeId` | 챌린지 체험 세션 조회(§14.1) |

> **T57 실패 아카이브(UX-030) — 신규 인덱스 불요(실측):** 아카이브 쿼리는 `reports where uid == auth.uid orderBy createdAt desc limit 50` + `startAfter` 커서뿐이며, 필요한 복합 인덱스 `reports: uid ASC + createdAt DESC`가 **이미 존재한다**(`firestore.indexes.json:11-18`, 위 표 3행). `collectionGroup` 인덱스도 불요다 — 신규 서브컬렉션(`inCallSms`·`rewindAttempts`)은 부모 문서 경로로만 조회하며 컬렉션 그룹 쿼리를 하지 않는다(Architecture.md §15.4.1).

## Security Rules (요지 — implementer가 firestore.rules/storage.rules로 구현)
**Firestore:**
- `users/{uid}/**`: `request.auth.uid == uid`만 read/write(본인 귀속, DECISIONS #13).
- `sessions/{sid}`,`reports/{}`,`deletionLogs/{}`: read/write는 `resource.data.uid == request.auth.uid`. write는 Functions 위주(클라 write 최소화).
- `scenarios/{}`: 인증 사용자 read 허용(공개 메타). write 금지(seed/admin).
- `scenarioPrompts/{}`: **클라 read/write 전면 거부**(Functions/admin only, ADR-0004).
- `messages`: `textMasked`만 존재(원문 필드 자체가 없음, ADR-0004).
- **`challenges/{}` (T35, AC-041/043 스키마 강제, reviewer Critical #1 반영 실측):**
  - read: **`if false` — 클라 직접 read 전면 금지**(사용자1·사용자2 공통). 문서에 raw `voiceId`·`linkTokenHash`가 담겨 소유자 read조차 브라우저 유출이라 잠갔다(ADR-0005 §14.2). 사용자1 목록은 `listMyChallenges` 콜러블이 민감 필드 제외 후 반환(유일 조회 경로). 사용자2(무로그인)는 토큰-매개 콜러블(getChallengeLanding 등).
  - write: **클라 직접 write 전면 금지** — 생성·동의·결과요약·신고·삭제 모두 Functions(admin)만. 개수 상한·토큰 검증·동의 게이트를 서버에서만 강제(AC-040/041/043/048/049).
  - `resultSummary`는 사용자2 동의 시에만 Functions가 세션 리포트에서 파생해 채운다(§14.7.3). 대화 전문은 이 문서에 존재하지 않는다(AC-043).
- **`sessions/{}` (challengeId 바운드, AC-043, §14.7/ADR-0006):** 사용자2 체험 세션은 `uid`가 **임시 익명 uid**(사용자1의 실 uid 아님)이므로 `resource.data.uid == request.auth.uid` 규칙에 의해 **사용자1의 직접 read·콜러블이 거부**된다(§14.7.2 실측). 사용자2 본인(익명 uid)만 자기 세션·리포트·리플레이를 read → UX-014/UX-018 무개정 재사용. 사용자1은 오직 `challenges/{}.resultSummary`만 본다 → 결과 열람 제한을 규칙으로 강제.
- **`users/{uid}/voices/{}` (ADR-0005):** `request.auth.uid == uid`만 read/write. **오디오 바이트·다운로드 경로 없음**(메타만). 실제 클론 삭제는 Functions.
- **`sessions/{sid}/inCallSms/{}` (T57, §15.1.2):** read는 부모 세션 소유자(`get(/sessions/$(sid)).data.uid == request.auth.uid`)만. **write는 클라 전면 거부** — 쓰기는 Functions(admin)뿐이다(`deliverInCallSms` / `sendMessage` / `recordInCallSmsEvent`). 문자 본문·인증번호는 **서버 카탈로그가 원천**이며 클라가 임의 문자를 주입하는 경로가 존재하지 않는다.
- **`sessions/{sid}/verifyIntercept/{}` (T79, §16.3.1):** `inCallSms`와 **완전히 같은 규칙**(read=부모 세션 소유자만, **write 클라 전면 거부**). 쓰기는 `deliverVerifyOffer`·`deliverVerifyReconnect` 두 콜러블(Functions admin)뿐이며, 창구명·번호·재연결 라벨은 **서버 카탈로그가 원천**이라 클라가 임의 값을 주입하는 경로가 존재하지 않는다(AC-033/AC-005). 규칙 블록은 `inCallSms`(firestore.rules:56-60) 바로 아래에 **같은 형태로** 추가한다.
- **`reports/{rid}/rewindAttempts/{}` (T57, §15.2.2):** read는 부모 리포트 소유자만(사용자2=익명 uid도 자기 리포트에 한해 동일하게 성립, §14.7/ADR-0006). **write는 클라 전면 거부** — `judgeRewindAnswer` 콜러블만 append한다. 이 콜러블은 **부모 `reports/{rid}` 문서를 절대 update하지 않는다**(AC-007 불변식 — §15.2.2 금지표).

**Storage (ADR-0002 · AC-020) — 본인 목소리만 등록의 서버측 원천 차단:**
```
match /users/{uid}/sessions/{sid}/{allPaths=**} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if request.auth != null
            && request.auth.uid == uid
            && request.resource.size < 3 * 1024 * 1024      // ≈30초 상한
            && request.resource.contentType.matches('audio/.*'); // 파일 업로드/타인음성 차단
}
```
> 합성 산출물(synth/images)은 Functions(admin SDK)가 규칙을 우회해 write. 클라 write 경로는 마이크 녹음(audio/*)뿐 — 파일 업로드 UI 부재(클라)와 합쳐 이중 차단.

## Migration Policy
- 스키마는 코드가 문서 생성 시점에 형성(NoSQL, 사전 DDL 없음). 필드 추가는 하위호환 우선(옵셔널 필드).
- `scenarios`/`scenarioPrompts` seed는 `src/content/scenarios`(T6)에서 배포 스크립트로 주입.
- 규칙 변경은 `firestore.rules`/`storage.rules` 파일로만(수동 콘솔 편집 금지).

---

## 부록 A — 3단계 결합·모의 앱 설치 증분 (T80 · Architecture.md §15.9 · AC-072/AC-073)
> **왜 부록인가:** T78·T79 architect 패스와 **병렬 작성**돼 기존 표를 편집하면 병합 충돌이 난다. 내용은 위 본문 표와 동등한 계약이며, 병합 후 각 컬렉션 절로 흡수해도 된다(그때 이 부록은 제거).
> **전부 옵셔널·무백필.** 기존 `sessions`/`reports` 문서는 한 건도 손대지 않고 유효하다.

### A.1 `sessions/{sessionId}/mockScreens/{landingId}` — 인앱 목업 상호작용 (신규 서브컬렉션)
> 문서 id = `landingId`라 **멱등**(같은 랜딩에 대한 반복 기록이 문서를 늘리지 않는다). 클라 직접 write **금지** — `recordMockScreenEvent` 콜러블 경유(API.md 부록 A). read는 세션 소유자만(기존 `sessions/{sid}/**` 규칙과 동일).

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| landingId | string | ✔ | `MessengerAttachment.fakeLandingId`와 동일 값 |
| kind | `"credential-form"`\|`"app-install"` | ✔ | **서버가 카탈로그(`functions/src/scenarios/mockScreens.ts`)에서 확정**. 클라 입력을 그대로 믿지 않는다 |
| shownAt | Timestamp | ✔ | 목업이 열린 시각. 최초 1회만 세팅 |
| consentedAt | Timestamp? | | 가짜 "권한 허용"에 응한 시각. 최초 1회만 세팅. **부재 = 응낙 없음**(D-51 ③) |
| consentAnnouncedAt | Timestamp? | | 사기범이 그 사실을 언급하도록 프롬프트 1줄 지시를 주입한 시각(§15.9.3 — 1회 주입 보장) |

- **저장하지 않는 것(구조적 금지):** 참가자 입력값(애초에 컴포넌트 로컬 state를 벗어나지 않는다 — AC-045), 실 URL·스토어 URL·실존 앱명·OS 권한 목록(AC-072). **`url` 계열 필드는 이 스키마에도 존재하지 않는다.**

### A.2 `reports/{reportId}` 증분 — 3단계 구분·목업 타임라인 (전부 옵셔널)
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| stages | array<ReportStage>? | | AC-073 "세 단계 구분"의 판정 근거. **의도된 단계가 2개 이상일 때만** 기록(그 외 필드 부재). `ReportStage = { stage: "messenger"\|"mock_install"\|"voice", reached: boolean }` — **미도달 단계도 `reached:false`로 싣는다**(OQ-U24 판정, §15.9.5 e-3) |
| mockScreenTimeline | array<MockScreenTimelineEntry>? | | 표시 전용 스냅샷. `{ landingId, kind, anchorTurnIndex, anchorResolved, timeLabel?, consented }`. 리포트 생성 시 `sessions/{sid}/mockScreens` **1회 read**로 역정규화(dual write 금지 — §15.1.5 (1)과 동형) |

- **`deceivedMoments` 증분 규칙(스키마 변경 없음, 생성 규칙만 추가):** `consented === true`인 항목 1건당 `DeceivedMoment` 1건을 **`analyzeConversation` 산출 뒤에 병합**하고 배열을 **`turnIndex` 오름차순으로 정렬**한다. `turnIndex` = 설치 링크를 실은 **사기범 메시지**의 turnIndex, `tactic`/`correctAction` = 카탈로그 저작값, `tacticCategory` = 기존 `resolveTacticCategory` 결과(→ `link_or_install`). **앵커 미해결이면 승격하지 않는다**(§15.9.5 e-2 인덱스 정합 보호). `wasDeceived`는 병합 후 배열 기준으로 재계산한다.
- **스냅샷에 넣지 않는 것:** 목업 화면 콘텐츠 원문(`headline`/`bodyLines`/`consentLabel`) — 사후 열람 화면이 목업을 재구성·재진입할 수 있게 된다(§15.6 G19와 동형 취지). 원시 타임스탬프도 넣지 않는다(표시 축이 아니다).
- **인덱스 변경 없음.** 서브컬렉션은 최상위 `reports` 쿼리에 포함되지 않고, `mockScreens`는 세션 단위 전체 조회만 한다.
