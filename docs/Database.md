# Database — 안 당해본 사기는 못 막는다 (AI 금융사기 백신)

Owner: architect (see AGENTS.md). Others read-only.
Based on PRD Version: v0.5 · Based on UX Version: 1.2

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
| cloneStatus | string | `pending`\|`ready`\|`failed`\|`fallback` | UX-003 구독(DECISIONS #9) |
| identitySelfConfirmed | bool | required | 본인 확인 체크 로그(ADR-0002) |
| turnCount | number | default 0 | 사용자 턴 수 |
| maxUserTurns | number | default 10 | OQ-U4(DECISIONS #10) |
| maxSessionMs | number | default 360000 | 6분 |
| createdAt | timestamp | | |
| endedAt | timestamp? | | |

#### `sessions/{sessionId}/messages/{messageId}`  — 대화 로그 (UX-006, AC-024)
| Field | Type | Constraints | Description |
|---|---|---|---|
| role | string | `scammer`\|`user` | 발신자 |
| textMasked | string | required | **PII 마스킹된 텍스트만 저장**(원문 미저장, ADR-0004) |
| turnIndex | number | | 순서/타임라인(AC-026) |
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
| createdAt | timestamp | | |

### `scenarios/{scenarioId}`  — 시나리오 공개 메타 (UX-004, AC-001/002)
| Field | Type | Constraints | Description |
|---|---|---|---|
| title | string | required | 제목 |
| fraudType | string | required | 사기 유형(예: 가족 납치/사고) |
| estimatedDuration | string | required | 예상 소요 |
| difficulty | string | required | 난이도(강도) 라벨 |
| deepvoiceLines | array<{lineId,text}> | | 딥보이스 재생 대사(UX-005) |

> 클라이언트 read 허용(공개 메타). 최소 한국어 "가족 납치/사고" 1종 필수(AC-001). T6 산출.

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
| tacticsUsed | array<string> | required | 사용된 조작 수법(AC-008) |
| preventionAdvice | array<string> | min 1 | 예방 조언(AC-008) |
| createdAt | timestamp | indexed | 히스토리 정렬(AC-016) |

> **생성물 음성은 폐기되므로 리포트·메타만 계정에 잔존**(AC-021). 실제 운영정보(실계좌·실링크) 배제(AC-005/013).

### `deletionLogs/{logId}`  — 폐기 감사 로그 (AC-021, ADR-0003)
| Field | Type | Constraints | Description |
|---|---|---|---|
| sessionId | string | required, indexed | |
| uid | string | required | |
| deletedAt | timestamp | | |
| targets | array<{kind,ref,result}> | required | kind=`storage`\|`elevenlabs_voice`, result=`success`\|`partial`\|`failed` |
| overallResult | string | `success`\|`partial`\|`failed` | 부분 실패 시 재시도 근거 |

## Storage Layout
| Path | Contents | 수명 | Writer |
|---|---|---|---|
| `users/{uid}/sessions/{sid}/voice_input.webm` | 30초 녹음 | 세션 종료 시 폐기 | 클라(rules 강제) |
| `users/{uid}/sessions/{sid}/synth/{artifactId}.mp3` | 합성 오디오 | 세션 종료 시 폐기 | Functions(admin) |
| `users/{uid}/sessions/{sid}/images/{artifactId}.png` | 사칭 이미지(P1) | 세션 종료 시 폐기 | Functions/정적 |
| `/public/...`(Next.js) 또는 비-사용자 Storage | 폴백 오디오·표식 프리롤·사칭 이미지 템플릿 | 영구(비민감) | 팀 사전 준비 |

## Relationships
- `users` 1:N `sessions` (uid) · `users` 1:N `consents`(서브컬렉션)
- `sessions` 1:N `messages`(서브) · 1:N `artifacts`(서브) · 1:1 `reports`(sessionId) · 1:N `deletionLogs`(sessionId)
- `scenarios` 1:1 `scenarioPrompts`(같은 id) · `sessions` N:1 `scenarios`(scenarioId)

## Indexes
| Collection | Index | Reason |
|---|---|---|
| `sessions/{}/messages` | `createdAt` asc | 대화 시간순 표시(AC-026) |
| `sessions` | `uid` + `createdAt` desc | 히스토리 열람(UX-012, AC-016) |
| `reports` | `uid` + `createdAt` desc | 리포트 히스토리(AC-016) |
| `deletionLogs` | `sessionId` | 감사 조회 |

## Security Rules (요지 — implementer가 firestore.rules/storage.rules로 구현)
**Firestore:**
- `users/{uid}/**`: `request.auth.uid == uid`만 read/write(본인 귀속, DECISIONS #13).
- `sessions/{sid}`,`reports/{}`,`deletionLogs/{}`: read/write는 `resource.data.uid == request.auth.uid`. write는 Functions 위주(클라 write 최소화).
- `scenarios/{}`: 인증 사용자 read 허용(공개 메타). write 금지(seed/admin).
- `scenarioPrompts/{}`: **클라 read/write 전면 거부**(Functions/admin only, ADR-0004).
- `messages`: `textMasked`만 존재(원문 필드 자체가 없음, ADR-0004).

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
