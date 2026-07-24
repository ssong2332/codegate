# Database — 안 당해본 사기는 못 막는다 (AI 금융사기 백신)

Owner: architect (see AGENTS.md). Others read-only.
Based on PRD Version: v1.1 · Based on UX Version: 1.7

> **v1.1 증분(2026-07-23, T26·T35):** 메신저→보이스 채널 전이(§sessions 증분·§messages 증분·§scenarios 증분)와 2인 소셜(§challenges·§users/voices) 스키마를 더한다. **모든 신규 필드는 옵셔널(하위호환, Migration Policy)** — 기존 P0 루프 문서·필드는 무변경. 설계 근거는 Architecture.md §13·§14, DECISIONS #14~#24, ADR-0005.
> **소급 리뷰 증분(2026-07-24, T40·T33):** ① `channelHistory` 항목에 `turnCountAtTransition?`(역방향 핑퐁 방지, Architecture.md §13.8) 정식 편입 ② `reports`에 `resistedMoments?`(UX-018 "잘 대응한 지점", 후속 implementer 태스크로 구현) 추가. 근거 DECISIONS #25/#26. 둘 다 옵셔널 증분.

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
| challengeId | string? | indexed | 2인 소셜 사용자2 체험 세션이면 소속 챌린지(§14.1). 이 세션의 `uid`는 **동의 시 발급된 임시 익명 uid**(§14.7/ADR-0006) — 사용자1(실 uid) 접근 규칙·콜러블 거부. 챌린지 clone `voiceId`는 이 세션에 **미저장**(A1) — `createRealtimeCall`이 challenge 문서에서 발급 시 해석(AC-041·폐기 격리) |
| maxUserTurns | number | (에스컬레이션 세션은 상향, 예 14) | 교차채널 총 한도(§13.3, 잠정) |

> 교차채널 세션에서 `maxUserTurns`는 생성 시 상향 발급될 수 있다(§13.3). `maxSessionMs`는 6분 유지.

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
| deceivedMoments | array<{turnIndex,timeLabel,tactic,correctAction}> | | 속은 시점 타임라인(AC-026) |
| resistedMoments | array<{turnIndex,timeLabel,tactic,goodResponse}>? | | **T33 소급 결정(DECISIONS #26)** — 사용자가 잘 대응한(저항) 턴 타임라인. UX-018 리플레이 해설의 "잘 대응한 지점"(never-deceived Empty 상태)이 요구하는 per-turn 마커. `deceivedMoments`의 대칭 필드로, 동일 규칙 기반 분석(analyzeConversation.ts의 `RESISTANCE_PATTERN`)이 **이미 매 턴 계산하지만 현재 버리는** 저항 판정을 기록한다. `goodResponse`=그 순간 사용자가 잘한 대응의 긍정 문구(정확 카피는 구현/ux-design 상세). 옵셔널 증분(하위호환, Migration Policy) — 기존 리포트는 부재→빈 배열 취급. **⚠️ 아직 미구현(후속 implementer 태스크): shared/types.ts `ReportDoc`에 필드 추가 + analyzeConversation.ts/generateReportCore.ts가 저항 분기를 기록하도록 확장** |
| tacticsUsed | array<string> | required | 사용된 조작 수법(AC-008) |
| preventionAdvice | array<string> | min 1 | 예방 조언(AC-008) |
| createdAt | timestamp | indexed | 히스토리 정렬(AC-016) |

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
| scenarioId | string | required | 딥보이스(clone) 시나리오 |
| voiceId | string | required, **챌린지 스코프 고정** | 클론 voice. 챌린지 밖 재사용·추출 불가(AC-041, ADR-0005) |
| displayName | string | required | "○○님이 준비" 표시이름(사용자2 노출용) |
| status | string | `pending`\|`consented`\|`in_progress`\|`completed`\|`expired`\|`reported`\|`deleted` | 상태 머신 |
| linkTokenHash | string | required, indexed | 공유 토큰 **SHA-256 해시만**(평문 미저장, §14.4) |
| linkExpiresAt | timestamp | required | 링크 만료(무료 생성+3일 / 유료 7일+). AC-048 |
| linkConsumedAt | timestamp? | | 1회성 소모(동의 통과 시). §14.4 |
| retentionDeleteAt | timestamp | required | 복제 음성·챌린지 자동 삭제 예정(생성+보존기간 기본 30일). **링크 만료와 별개**(AC-041) |
| resultSharingConsented | bool? | | 사용자2 결과 공유 동의(AC-043 열람 게이트). 부재=미동의 |
| resultSummary | {completed:bool,suspicionTimeLabel?,suspicionTurnIndex?}? | | **동의 시에만** Functions 기록. **대화 전문 없음**(AC-043) |
| reportedAt | timestamp? | | 사용자2 신고 시각(AC-049) |
| reportReason | string? | `unwanted`\|`harassment`\|`impersonation_concern`\|`other` | 신고 사유 enum |
| reportNote | string? | 마스킹 | 선택 신고 메모(PII 마스킹) |
| tier | string? | `free`\|`paid`(부재=free) | **용량 축에만 영향**(§14.6, AC-050 위반 없음) |
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
- `sessions` 1:N `messages`(서브) · 1:N `artifacts`(서브) · 1:1 `reports`(sessionId) · 1:N `deletionLogs`(sessionId)
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
