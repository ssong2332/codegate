# UX — 안 당해본 사기는 못 막는다 (AI 금융사기 백신)

Owner: ux-design (see AGENTS.md). Others read-only.
Update this document in place — do not recreate it from scratch. Preserve existing sections unless explicitly superseded by a newer decision. The **UX Decision Log** is append-only — never rewrite or delete a past entry; append a new one if a decision changes.
Flow IDs and Screen IDs are immutable once assigned — never renumber existing IDs, even if one becomes Deprecated. New flows/screens always get the next available ID.

## Overview
| Item | Value |
|---|---|
| Document Version | 1.4 |
| Based on PRD Version | v0.8 · 2026-07-22 |
| Last Updated | 2026-07-22 |

이 문서는 PRD v0.8의 **P0 핵심 루프(예방접종 루프)**에 대한 사용자 플로우·화면·인터랙션 스펙을 정의한다. 채널은 웹(Next.js) 단일, 언어는 한국어, 상호작용은 **실시간 음성 통화형 역할극(브라우저 STT 입력 + TTS 자동재생, v1.3 갱신 — 텍스트는 폴백)** + 클론 오디오 인앱 재생이다. 설계는 **하루 완성(Day1) 제약**을 최우선으로 반영해 화면 수와 상태 복잡도를 최소화했다(UX Decision Log D-1 참조).

**변경 이력 v1.3 → v1.4 (2026-07-22):** 사용자 피드백으로 **통화 경험을 화면 단위 수입(claude.ai/design 원안)에서 이 앱 고유의 "단일 연속 통화"로 재설계**한다. PRD(기능 범위·시나리오 정의)는 무변경 — 화면 흐름·정보구조·상호작용만 다시 그렸다. 반영 내용:
- **(1) 딥보이스 재생(구 UX-005) + 사기범 역할극(구 UX-006)을 하나의 연속 통화 화면 UX-014로 통합**(D-11 신설). 사용자 불만("화면 7→8이 하나의 통화처럼 안 느껴짐 / 받았다가 채팅창으로 넘어가는 느낌")의 원인은 두 라우트(`/session/play`·`/session/chat`) 사이의 full-page 전환과 그 사이의 "통화 종료 → 계속(역할극 시작)" 중간 상태였다. UX-014는 수신→오프닝 딥보이스→실시간 역할극을 **하나의 고정된 통화 셸(발신자·통화 타이머·AI 합성 표식·훈련 종료) 안에서 phase 전이로만** 처리해 단절을 제거한다(D-12: 중간 "계속" 버튼·화면 전환 제거).
- **(2) 구 UX-005·UX-006은 삭제하지 않고 Deprecated로 이관**(사유·이관 대상 AC 명시). D-10(STT/TTS In Scope 전환) 결정은 **반전이 아니라 UX-014로 이관**되어 유효하다(D-11에서 근거 명시).
- **(3) 온보딩 순서(Phase B) 문서 정합화**(D-14 신설). IA 다이어그램·실제 코드(`src/app/scenarios/page.tsx`, `age-gate/page.tsx`)는 이미 "시나리오 선택 → (clone일 때만) 녹음→클론대기" 순서였으나, Screen Catalog의 Entry/Exit·UF Steps·화면-플로우 소속이 구(舊)순서(동의→녹음→클론→시나리오)로 남아 문서 내부가 모순이었다. 이를 실제 순서로 정정하고 녹음(UX-002)·클론대기(UX-003)의 소속을 UF-001→UF-002로 옮겼다.
- **(4) clone/generic 시나리오를 같은 통화 셸로 처리하되 음성 모드 라벨로만 구분**(D-13). "당신의 목소리로 합성"(clone) vs "기본 합성 음성"(generic) — 근거 없는 "본인 목소리" 표기 금지(코드는 이미 `voiceMode`로 분기). 단 이로 인한 차별점 희석 우려 등은 임의 결론 대신 신설 **"재검토 필요(기능 방향)"** 섹션에 질문으로 남겼다.
- **안전장치 무변경**: AC-006(상시 종료)·AC-012/017/023(사전 고지·동의·종료 고지)·AC-019(PSTN 없음, 인앱 전용)·AC-022(합성 표식 상시)는 그대로 유지. 통화 몰입 극대화는 "통화 중" 구간에 한하며 사전 동의·종료 고지는 절대 생략하지 않는다(D-10 근거 계승).

**변경 이력 v1.2 → v1.3 (2026-07-22):** 사용자 결정으로 **UX-006을 텍스트 채팅에서 실시간 음성 통화형으로 전환**(D-10 신설). 반영 내용: (1) UX-006 Primary Actions/States/Accessibility/Architect Handoff 갱신(마이크 탭-투-토크·자동 음성재생·텍스트 폴백), (2) PRD "실시간 통화·STT는 제외" Out of Scope 결정을 뒤집음(단 **실제 전화망(PSTN) 연동은 여전히 제외**, AC-019 무변경), (3) 이 결정 이전에 사용자가 요청했던 "훈련인지 인지하면 안 됨"(사전고지·동의 생략)은 AC-012/017/023 정면 제거에 해당해 **거부**하고 절충안(사전 동의 유지+통화 중 몰입 유지)으로 대체됐음을 D-10에 근거로 남김. 상세는 D-10 참조.

**변경 이력 v1.1 → v1.2 (2026-07-21):** 사용자 결정으로 **인증 수단을 Google 소셜 로그인으로 확정**(OQ-U5 resolved — "구글로 로그인", Firebase Auth Google Provider만 사용). 반영 내용: (1) UX-013을 "Google로 로그인" 버튼 1개 기준으로 구체화(Primary Actions·States·Failure에 팝업 취소/차단·네트워크 실패 등 OAuth 특유 케이스 반영, 이메일/비밀번호 폼 제거), (2) UX-013 Architect Handoff의 External Dependencies를 **Firebase Auth Google Provider(OAuth)**로 확정, `signup_succeeded` 이벤트 제거(Google 최초 인증이 계정 자동 생성=로그인 단일 동작), (3) Google 계정 미보유 어르신 처리는 임의 결론 대신 **OQ-U6** 신설(OQ-3 자녀 대리설정 논의와 연계 권장).

**변경 이력 v1.0 → v1.1 (2026-07-21):** 사용자 결정으로 **P0에 로그인 도입**(OQ-U2 resolved — "로그인 있이 가자"). 반영 내용: (1) 로그인/가입 화면 **UX-013 신설**, (2) UF-001에 로그인 단계 추가, (3) UX-001의 진입점·의존성 갱신(로그인 없이 진행 가정 제거), (4) UX-010·UX-012의 "로그인 종속(OQ-U2)" 문구를 "로그인으로 해소"로 갱신, (5) Information Architecture에 로그인 단계 반영, (6) UX Decision Log **D-9** append, (7) 구체 인증 프로바이더(이메일/구글/전화 등) 선택은 architect 기술 판단 사항이라 **OQ-U5**로 신설. 상세는 D-9 참조.

**스코프 경계 (반드시 준수):**
- **본인 1인 온보딩만 설계한다.** 자녀가 부모 계정을 대신 만드는 화면, 자녀가 부모 리포트를 열람하는 화면은 **설계 대상이 아니다**(OQ-3·OQ-15 여전히 open, 빌드 스코프 밖 — PRD v0.4). 발표 내러티브 전용이므로 화면으로 만들지 않는다.
- **P0(핵심 루프 + 보안 가드레일 + 로그인)만 정식 Flow/Screen으로 설계**했다. **로그인/가입(UX-013)은 사용자 결정으로 P0**이며, AC-016의 "계정 생성/접근" 절반을 실현한다. 나머지 P1(사칭 이미지 AC-025, 게임화 AC-010/011, age-gate AC-014, 세션/리포트 **히스토리 열람** AC-016의 나머지 절반)은 "여유 시 추가" 경량 스케치(UX-009~UX-012)로만 남긴다.
  - 참고: PRD v0.4 MVP Scope는 계정(AC-016)을 P1로 분류하나, 사용자가 로그인을 P0로 상향 결정(2026-07-21). 이 상향은 UX 설계에 반영했으며, PRD 문면과의 정합은 planner가 필요 시 반영(문서 드리프트는 docs가 UpdateRequests로 라우팅).

**시스템 레벨 AC(화면이 아니라 백엔드 동작이지만 UI에서 트리거/표기됨):**
- **AC-021**(생성물 즉시 폐기): 세션 종료 시 백엔드 삭제 동작. UI로 노출되는 것은 UX-007의 "폐기 완료" 표기뿐. 화면 자체가 아니라 UX-007 Architect Handoff의 이벤트/기대출력으로 다룬다.
- **AC-024**(PII 마스킹·프롬프트 인젝션 방어): 백엔드/프롬프트 설계 사항. UX-014(실시간 역할극)의 Architect Handoff에 제약으로 명시하되, 별도 화면을 만들지 않는다.

**보안 가드레일 5종 화면 노출 지점(보안 배점 20% 근거):**
| 가드레일 | AC | 노출 화면 |
|---|---|---|
| 사전 고지(시뮬레이션·실금전 없음·종료 방법) | AC-012 | UX-001 |
| 명시적 동의 게이팅(동의 없이는 세션 불가) | AC-017 | UX-001 |
| 본인 동의·본인 확인(본인 목소리만 등록) | AC-020 | UX-002 |
| 합성물 "AI 훈련용 합성" 표식 | AC-022 | UX-014(오프닝·이미지 시), UX-009 |
| 세션 종료 시 "이것은 훈련이었습니다" 고지 + 디스컬레이션 | AC-015, AC-023 | UX-007 |
| 생성물 즉시 폐기(로그) | AC-021 | UX-007(트리거·표기) |
| 실제 사기 실행 정보 미노출 | AC-005, AC-013 | UX-014, UX-008(리포트 문구 수준 주의) |

## User Flows

### 로그인·사전 고지·동의·연령 확인 (Flow ID: UF-001)
> **v1.4 갱신(2026-07-22, D-14)**: 녹음(UX-002)·클론 생성 대기(UX-003)는 시나리오 선택(UX-004) 이후에 조건부로 일어나므로 UF-002로 이관했다. UF-001은 이제 "인증→동의→(연령)→시나리오 선택 진입"까지만 다룬다. 이전 Steps(동의 직후 녹음)는 아래로 대체됐다.
| Item | Value |
|---|---|
| Actor | 훈련 대상 본인(어르신 또는 일반 사용자). 자녀 보조는 계정 생성 UI까지만(빌드 스코프 밖이므로 이 플로우는 본인 단독 경로만 다룸). |
| Trigger | 사용자가 서비스에 처음 진입한다. |
| Related Acceptance Criteria | AC-012, AC-017, AC-016(계정 생성/접근 부분), AC-014(P1 연령 확인) (MVP Scope #1 일부·#10·#12, 로그인은 사용자 결정으로 P0) |
| Steps | 1. 로그인/가입 화면(UX-013)에서 Google 계정으로 로그인한다(유효 세션이 있으면 이 단계를 건너뛴다). 2. 사전 고지 화면(UX-001)에서 "이것은 훈련 시뮬레이션이며 실제 금전·자격증명이 관여하지 않고, 언제든 종료할 수 있다"를 읽는다. 3. 명시적 동의 체크 후 "동의하고 시작"을 누른다(동의 없이는 다음 단계 잠금, AC-017). 4. (P1, 미구현 시 생략) 연령 확인(UX-011)을 통과한다(AC-014). 5. 시나리오 선택(UX-004, UF-002 시작)으로 이동한다. |
| Alternative Flow | (a) 재로그인: 유효 세션 보유 시 UX-013을 건너뛰고 UX-001로 직행. (b) 이미 연령 확인을 통과한 계정: UX-011을 재질문 없이 통과(코드상 계정 단위 플래그). |
| Failure Flow | (a) 로그인/가입 실패(인증 오류·팝업 취소/차단·네트워크) → UX-013이 오류 상태로 전환, 재시도(Interaction Pattern P-4). (b) 동의 거부 → 다음 단계 시작 불가, UX-001에 머무름(AC-017). (c) 연령 기준 미달 → UX-011이 접근 제한 안내 상태(AC-014). |
| Success Criteria | 인증·명시적 동의(·연령 확인)를 마치고 시나리오 선택 화면(UX-004)으로 진입한다. 이후 모든 데이터는 인증된 계정(uid)에 귀속된다. |

### 시나리오 선택·(조건부)목소리 등록·통화·종료·리포트 (Flow ID: UF-002)
> **v1.4 갱신(2026-07-22, D-11·D-14)**: (1) 녹음(UX-002)·클론 대기(UX-003)를 UF-001에서 이관받아 "시나리오 선택 후 clone 시나리오일 때만" 일어나는 조건부 단계로 배치. (2) 딥보이스 재생(구 UX-005)+역할극(구 UX-006)을 단일 연속 통화 **UX-014**로 통합. 이전 Steps(별개 재생 화면→채팅 화면)는 아래로 대체됐다.
| Item | Value |
|---|---|
| Actor | 훈련 대상 본인(UF-001 완료 상태). |
| Trigger | UF-001 완료 후 시나리오 선택 화면 진입. |
| Related Acceptance Criteria | AC-001, AC-002, AC-018, AC-020, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-013, AC-015, AC-019, AC-021, AC-022, AC-023, AC-024, AC-026 (MVP Scope #1 녹음 부분·#2~#7) |
| Steps | 1. 시나리오 선택(UX-004)에서 시나리오의 제목·사기 유형·예상 소요·난이도와 **음성 모드(본인 목소리 등록 필요 여부)**를 확인하고 선택한다(AC-001/002). 2. 분기: **(clone 시나리오, 예: 가족 납치/사고 딥보이스)** 목소리 녹음(UX-002)에서 본인 확인 문항에 동의하고 30초 대본을 녹음한 뒤 "클론 생성" → 클론 생성 대기(UX-003)를 거친다(AC-020/018). **(generic 시나리오, 예: 기관 사칭)** 녹음/클론을 생략하고 바로 다음 단계로 간다. 3. 통화(UX-014)로 진입한다 — ① 수신 화면에서 발신자(가족/기관 사칭)를 확인하고 "받기"(또는 "거절"=훈련 종료). ② 받으면 오프닝 딥보이스(clone은 본인 목소리, generic은 기본 합성 음성)가 "AI 훈련용 합성" 표식과 함께 자동 재생된다(AC-019/022). ③ 오프닝이 끝나면 **화면 전환 없이 그대로** 사기범과 실시간 음성(또는 텍스트 폴백) 역할극이 이어진다(AC-003/004/005/013/024). 4. 통화 전 구간에서 상시 노출된 "훈련 종료" 컨트롤로 언제든 종료할 수 있다(AC-006). 5. 종료 조건(사용자 종료/최대 턴·시간 한도 도달) 중 하나로 통화가 끝난다(AC-007). 6. 세션 종료 화면(UX-007)에서 "이것은 훈련이었습니다" 고지 + 디스컬레이션(안심) 메시지를 본다. 이 시점에 생성물 즉시 폐기가 트리거된다(AC-021/015/023). 7. 취약점 리포트(UX-008)에서 속은 시점 타임라인·놓친 위험 신호·올바른 대처법을 확인한다(AC-008/009/026). |
| Alternative Flow | (a) 재녹음(clone): 녹음이 마음에 안 들면 UX-002에서 재녹음. (b) 한 번도 속지 않은 경우 → 리포트(UX-008)가 이를 명시하고 시도된 수법만 나열(AC-009). (c) 사용자가 사기 실행 방법을 요청 → AI가 거부(AC-013), 캐릭터·가드레일 유지. |
| Failure Flow | (a) 마이크 권한 거부(녹음) → UX-002가 권한 안내 상태(P-6). (b) 클론 생성 실패/타임아웃 → UX-003이 오류 상태, 재시도 또는 데모 폴백 음성 경로(P-1). (c) 오프닝 딥보이스 합성/재생 실패 → UX-014가 폴백 음성/자막만으로 통화를 이어감(P-1, 핵심 루프 비차단). (d) 실시간 LLM/음성 합성 실패·지연 초과 → UX-014가 인라인 재시도(P-4), 통화는 유지. (e) 통화 도중 종료 → 즉시 UX-007로 이동하고 그때까지의 로그로 리포트 생성(AC-007: 종료된 모든 세션은 정확히 1개 리포트). |
| Success Criteria | 세션이 정확히 1개의 리포트를 생성하고, 사용자가 "언제·어디서 속을 뻔했는지"와 대처법을 확인하며, 생성물이 폐기된다. |

## Screen Catalog
> 화면은 플로우 진행 순서로 나열한다. 로그인(UX-013)은 플로우상 첫 화면이지만 ID는 신설 순서에 따라 UX-013이다(ID 불변 규칙 — 기존 ID를 재번호하지 않는다).

### 로그인 / 가입 (Screen ID: UX-013)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-001 |
| Acceptance Criteria | AC-016(계정 생성/접근 부분) |
| Purpose | P0 진입점. 사용자가 **Google 계정으로 로그인**해 이후 동의·클론·리포트를 본인 계정에 귀속시킨다(소유권=본인, OQ-11 확정 정합). Google 최초 인증 시 계정이 자동 생성되므로 별도 가입 단계가 없다. |
| User Goal | Google 계정으로 로그인하여 훈련을 시작한다. |
| Entry | 서비스 최초 진입(랜딩). |
| Exit | 로그인/가입 성공 → UX-001. |
| Primary Actions | "Google로 로그인" 버튼 하나(Firebase Auth Google Provider OAuth 팝업/리다이렉트 시작). 별도 이메일/비밀번호 입력 필드·가입 폼 없음(Google 계정 최초 인증 시 계정이 자동 생성되므로 로그인=가입 단일 동작). |
| Secondary Actions | 재시도(취소·실패 후). |
| States | Loading: "Google로 로그인" 탭 후 OAuth 팝업/리다이렉트 진행 중 스피너(버튼 비활성) / Empty: N/A(버튼 1개 노출) / Error: (a) 사용자가 Google 팝업을 닫음/취소, (b) 팝업 차단됨, (c) 네트워크·OAuth 실패 → 각 케이스별 안내 문구 + "다시 시도" / Success: 인증 완료(uid 확보) 후 UX-001로 이동. |
| Validation | 입력 폼이 없어 필드 검증 없음. 처리 중 중복 탭 방지(버튼 비활성, P-4). |
| Failure | Google OAuth 특유 실패: (a) 팝업 사용자 취소(auth/popup-closed-by-user), (b) 팝업 차단(auth/popup-blocked — 리다이렉트 방식 폴백 안내), (c) 네트워크/제공자 오류 → 오류 상태 + "다시 시도"(Interaction Pattern P-4). |
| Accessibility | 큰 글씨·단순 화면(어르신 우선, 버튼 1개로 인지부하 최소). "Google로 로그인" 버튼은 스크린리더 라벨 명시·큰 터치 타깃(≥48px)·키보드로 도달·Enter 실행. 오류는 아이콘+텍스트(색 단독 금지). 팝업 차단 시 텍스트 안내. |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical (사용자 결정으로 P0 상향) |
| Business Rules | 이후 모든 화면(동의·녹음·클론·세션·리포트)은 인증된 사용자 계정에 귀속된다. 계정 소유권=본인(OQ-11 확정). **자녀가 부모 계정을 대신 만드는 경로는 설계·구현하지 않는다**(D-7, 빌드 스코프 밖). 생성물(클론 음성)은 계정에 영구 저장하지 않고 세션 종료 시 폐기(AC-021)되며, 계정에는 리포트·메타만 귀속. |
| Data Required | Google OAuth로 반환되는 사용자 식별자(uid)·기본 프로필(이름/이메일), 인증 토큰/세션, 사용자 프로필 레코드(uid). |
| Data Operations | Create(최초 로그인 시 프로필 자동 생성), Read(세션 검증), Update(세션 갱신) |
| External Dependencies | **Firebase Auth — Google Provider(OAuth)** (`signInWithPopup`/`signInWithRedirect` 계열). 프로필 레코드는 Firestore. 이메일/비밀번호·전화번호 등 다른 프로바이더는 사용하지 않음(OQ-U5 확정). |
| Permissions | None(Google OAuth 동의 화면은 Google 측에서 처리) |
| Navigation Targets | UX-001 |
| Events Emitted | `login_succeeded`(최초 로그인은 계정 자동 생성 포함), `auth_failed`(취소/차단/네트워크 구분 사유 포함) |
| Expected Outputs | 인증된 사용자 세션(uid) — 이후 모든 화면의 데이터 귀속 키. |
| Assumptions | 네트워크 연결됨. Firebase Auth Google Provider 사용 가능(T2 스캐폴딩에 포함). **사용자가 사용할 Google 계정을 이미 보유하고 있다고 가정**(미보유 시 처리는 OQ-U6). |

### 사전 고지 + 명시적 동의 게이팅 (Screen ID: UX-001)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-001 |
| Acceptance Criteria | AC-012, AC-017 (AC-023 사전 문구 일부) |
| Purpose | 첫 세션 전 훈련 성격을 고지하고, 명시적 동의를 받아야만 다음 단계로 넘어가게 하는 보안 게이트. |
| User Goal | 이 서비스가 안전한 훈련임을 이해하고 동의하여 시작한다. |
| Entry | UX-013 로그인/가입 완료 후(유효 로그인 세션 보유 시 재진입 포함). |
| Exit | 동의 완료 → UX-011(age-gate, P1) 또는 UX-004(시나리오 선택). *(v1.4: Phase B 순서 정합화 — 이전 "→ UX-002"는 잘못된 구(舊)순서였다. 녹음은 시나리오 선택 이후로 이동, D-14.)* |
| Primary Actions | 동의 체크박스 선택, "동의하고 시작" 버튼. |
| Secondary Actions | 고지 전문(시뮬레이션·실금전 없음·종료 방법) 펼쳐보기, 종료/나가기. |
| States | Loading: 없음(정적 콘텐츠) / Empty: N/A / Error: N/A / Success: 동의 체크 시 "동의하고 시작" 활성화 후 다음 화면 이동. |
| Validation | 동의 체크박스가 선택되지 않으면 "동의하고 시작" 비활성(AC-017). 체크 없이 진행 불가. |
| Failure | 사용자가 동의하지 않으면 화면에 머무름(세션 시작 차단). |
| Accessibility | 큰 글씨·단순 문구(어르신 우선). 동의 문구는 아이콘+텍스트로 명확. 키보드로 체크박스·버튼 도달 가능. 스크린리더가 고지 전문과 체크 상태를 읽음. |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | 동의(explicit consent) 없이는 어떤 세션도 시작될 수 없다(AC-017). 고지 문구에는 "시뮬레이션임·실제 금전/자격증명 미관여·언제든 종료 가능"이 반드시 포함된다(AC-012). |
| Data Required | 동의 이벤트(동의 여부·타임스탬프·동의 문구 버전). |
| Data Operations | Create(동의 기록) |
| External Dependencies | Firebase Auth(로그인은 UX-013에서 완료됨 — 이 화면은 인증된 세션을 전제로 함), Firestore(동의 로그를 사용자 계정에 연결 저장). |
| Permissions | None |
| Navigation Targets | UX-011(P1) 또는 UX-004 |
| Events Emitted | `consent_granted`, `session_flow_started` |
| Expected Outputs | 다음 단계로 넘길 동의 완료 상태(사용자 계정에 연결된 동의 로그 레코드). |
| Assumptions | 네트워크 연결됨. **사용자는 UX-013에서 이미 로그인/인증된 상태다**(OQ-U2 resolved: P0에 로그인 필요). 동의 로그는 로그인 계정에 귀속된다. |

### 본인 목소리 녹음 + 본인 확인 (Screen ID: UX-002)
> **v1.4 갱신(2026-07-22, D-14)**: 소속 플로우를 UF-001 → **UF-002**로 이관. Entry가 "UX-001 동의 완료"에서 "UX-004에서 clone 시나리오 선택 후"로 바뀐다(Phase B — 시나리오 선택이 녹음보다 먼저). generic 시나리오는 이 화면을 아예 거치지 않는다.
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-002 |
| Acceptance Criteria | AC-020, AC-018(녹음 부분) |
| Purpose | 본인 확인·본인 동의를 거친 뒤 지정 대본 30초를 녹음해 클론 입력을 만든다. 타인 목소리 무단 등록 경로를 UI에서 원천 차단(AC-020). **clone 시나리오(본인 목소리 사칭)에서만 진입** — generic 시나리오(기관 사칭)는 이 화면을 생략한다. |
| User Goal | 내 목소리를 30초 녹음해 등록한다. |
| Entry | UX-004에서 clone 시나리오 선택(동의·연령 확인 통과가 진입 가드로 강제됨 — 미충족 시 UX-001/UX-011로 되돌림, 코드 `onboarding/record` 가드). |
| Exit | 녹음 확정 + "클론 생성" → UX-003. |
| Primary Actions | 본인 확인 문항 체크("이 목소리는 본인의 것이며 본인이 직접 녹음합니다"), 녹음 시작/정지, 녹음 재생 확인, "클론 생성". |
| Secondary Actions | 재녹음, 대본 다시 보기. |
| States | Loading: 녹음 업로드 중 스피너 / Empty: 녹음 전(대본·녹음 버튼 노출) / Error: 마이크 권한 거부·녹음 실패·업로드 실패 안내 + 재시도 / Success: 30초 녹음 확보 → "클론 생성" 활성화. |
| Validation | 본인 확인 체크 필수(미체크 시 녹음 버튼 잠금, AC-020). 녹음 길이 최소치(≈30초) 미달 시 "클론 생성" 비활성. 대본 낭독 유도(정확 대사 일치 검증은 하지 않음 — 하루 스코프). |
| Failure | 마이크 권한 거부 → 권한 안내 상태(Interaction Pattern P-6). 녹음/업로드 실패 → 재시도. |
| Accessibility | 녹음 버튼은 큰 터치 타깃(≥48px)·명확한 라벨. 녹음 중 상태를 색+아이콘+텍스트로 표기(색만으로 구분 금지). 스크린리더가 녹음 상태("녹음 중", "녹음 완료")를 읽음. 대본은 큰 글씨. |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | 본인 목소리만 등록 가능 — 파일 업로드/타인 음성 입력 경로를 UI에 두지 않는다(AC-020). 녹음/등록 전 본인 확인·본인 동의 통과가 강제된다. |
| Data Required | 30초 오디오 blob, 본인 확인 동의 플래그, 지정 대본 텍스트. |
| Data Operations | Create(오디오 업로드), Read(대본) |
| External Dependencies | 브라우저 MediaRecorder/마이크 API, Firebase Storage(임시 오디오 업로드 — 세션 종료 시 폐기 대상, AC-021). |
| Permissions | 마이크(getUserMedia) |
| Navigation Targets | UX-003 |
| Events Emitted | `identity_confirmed`, `voice_recorded`, `voice_uploaded` |
| Expected Outputs | 클론 입력용 오디오 파일 참조(Storage 경로)와 본인 확인 로그. |
| Assumptions | 사용자 기기에 마이크가 있고 권한을 부여한다. 본인 확인은 경량 자기확인(체크+문구)으로 처리하며 강한 신원인증(KYC)은 하루 스코프 밖(OQ-U1). |

### 클론 생성 대기 (Screen ID: UX-003)
> **v1.4 갱신(2026-07-22, D-14)**: 소속 플로우를 UF-001 → **UF-002**로 이관. Exit이 "→ UX-004"에서 "→ UX-014(통화)"로 바뀐다(Phase B — 시나리오는 이미 UX-004에서 골랐으므로 클론 완료 후 곧바로 통화로 진입. 코드 `clone/wait`가 `createSession` 후 `/session/play`로 이동).
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-002 |
| Acceptance Criteria | AC-018 |
| Purpose | ElevenLabs 클론 생성(수 초~수십 초) 동안 "멈춘 것처럼 보이는" 상황을 막고 데모 흐름을 유지한다. |
| User Goal | 내 목소리 클론이 만들어지는 동안 기다린다. |
| Entry | UX-002에서 "클론 생성". |
| Exit | 클론 생성 완료 → UX-014(통화). |
| Primary Actions | 없음(대기). |
| Secondary Actions | 취소/뒤로(재녹음으로 복귀). |
| States | Loading: 단계형 진행 표시("목소리 분석 중 → 클론 생성 중 → 준비 완료")·예상 시간 안내·진행 애니메이션(정지 인상 방지) / Empty: N/A / Error: 생성 실패·타임아웃 → 재시도 버튼 + 데모 폴백(사전 준비 음성) 안내 / Success: "준비 완료" 후 자동/버튼 이동. |
| Validation | N/A |
| Failure | 클론 생성 API 실패/타임아웃 → 오류 상태(재시도 또는 폴백 경로, Interaction Pattern P-1·P-4). |
| Accessibility | 진행 상태를 텍스트로도 안내(스크린리더). 애니메이션은 감소 모션 설정 존중. 대기 문구 큰 글씨. |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | 데모 안정성상 최대 대기 시간·타임아웃 후 폴백(사전 준비 클론/녹화본) 경로가 필요(OQ-U3). 진행 표시는 실제 단계와 무관해도 "멈춘 인상"을 주지 않아야 함. |
| Data Required | 클론 생성 작업 상태(진행/완료/실패), 생성된 voice/clone ID. |
| Data Operations | Create(클론 생성 요청), Read(작업 상태 폴링) |
| External Dependencies | Firebase Functions → ElevenLabs Instant Voice Cloning API. 상태 확인용 Firestore/폴링. |
| Permissions | None |
| Navigation Targets | UX-014 (성공), UX-002 (취소/재녹음) |
| Events Emitted | `clone_started`, `clone_succeeded`, `clone_failed` |
| Expected Outputs | 합성에 사용할 클론 voice ID. |
| Assumptions | ElevenLabs 클론이 하루 내 사용 가능한 한국어 품질을 낸다(PRD Assumption·T1 PoC로 사전 검증). 지연 목표·타임아웃 값은 T1 결과로 확정. |

### 시나리오 선택 (Screen ID: UX-004)
> **v1.4 갱신(2026-07-22, D-14)**: UF-002의 **시작 화면**. Entry가 "UX-003 클론 완료"에서 "UX-001 동의(또는 UX-011 age-gate) 완료"로 바뀐다(Phase B — 시나리오 선택이 녹음/클론보다 먼저). Exit은 선택한 시나리오의 음성 모드로 분기한다.
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-002 |
| Acceptance Criteria | AC-001, AC-002 |
| Purpose | 세션 시작 전 시나리오를 선택하고 그 성격(난이도·음성 모드)을 미리 이해시킨다. 음성 모드에 따라 이후 경로(녹음 필요 여부)가 갈리므로 여기서 먼저 고른다. |
| User Goal | 체험할 사기 시나리오를 고른다. |
| Entry | UX-001 동의 완료(P1 UX-011 age-gate 구현 시 그 통과 직후). |
| Exit | clone 시나리오 선택 → UX-002(녹음) / generic 시나리오 선택 → `createSession` 후 UX-014(통화)로 직행. |
| Primary Actions | 시나리오 카드 선택 → "시작". |
| Secondary Actions | 시나리오 상세(난이도·음성 모드 설명) 보기. |
| States | Loading: 시나리오 목록 로드 / generic "시작" 후 세션 생성 중 스피너 / Empty: (하루 스코프상 최소 1종 항상 존재하므로 실질 없음) — 목록이 비면 오류로 간주 / Error: 목록 로드 실패·세션 생성 실패 재시도 / Success: 선택 카드 강조 후 시작. |
| Validation | 시나리오 미선택 시 "시작" 비활성. |
| Failure | 콘텐츠 로드 실패·세션 생성 실패 → 재시도. |
| Accessibility | 각 카드에 제목·사기 유형·예상 소요·난이도(강도) + **음성 모드(본인 목소리 등록 필요/불필요)** 라벨을 텍스트로 명시(색 배지 단독 금지, AC-002). 큰 글씨, 키보드로 카드 이동/선택. |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | 최소 한국어 "가족 납치/사고(딥보이스)" 1종 포함(AC-001). 각 시나리오는 제목·유형·예상 소요·난이도 라벨 표시(AC-002). "기관사칭"은 여유 시 추가. |
| Data Required | 시나리오 메타데이터(id·제목·사기 유형·예상 소요·난이도 라벨). |
| Data Operations | Read(시나리오 목록), Create(generic 시나리오는 이 화면에서 `createSession`) |
| External Dependencies | Firestore 또는 정적 콘텐츠(시나리오 대본/메타데이터, T6 산출물). generic 경로는 `createSession` 콜러블. |
| Permissions | None |
| Navigation Targets | UX-002(clone), UX-014(generic) |
| Events Emitted | `scenario_selected` |
| Expected Outputs | 선택된 시나리오 id + 음성 모드 → clone은 UX-002 녹음 경로로, generic은 세션 생성 후 UX-014로 전달. |
| Assumptions | 시나리오 콘텐츠(대본·메타데이터)는 T6에서 준비됨. |

### 딥보이스 재생 (Screen ID: UX-005) — DEPRECATED (v1.4)
> **⛔ DEPRECATED (2026-07-22, v1.4, D-11)**: 단일 연속 통화 **UX-014의 "오프닝 재생(opening-playback) phase"로 흡수**됨. 별개 재생 화면 + 이어지는 "계속(역할극 시작)" 버튼이 통화 몰입을 깨뜨린다는 사용자 피드백에 따라 통합. AC-019/022/006는 UX-014로 이관. 아래 스펙은 삭제하지 않고 설계 이력으로 보존한다(구현은 UX-014를 따를 것). Deprecated 섹션도 참조.
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-002 (→ UX-014로 이관) |
| Acceptance Criteria | AC-019, AC-022, AC-006 (→ UX-014) |
| Purpose | 본인 클론 목소리로 재현된 가족 사칭 대사를 인앱 오디오로 재생해 위협을 신체적으로 자각시킨다(데모 승부처). |
| User Goal | "내 목소리로 가족 사칭 전화가 오면?"을 직접 듣는다. |
| Entry | UX-004 시나리오 선택. |
| Exit | 재생 후 → UX-006(역할극 채팅). |
| Primary Actions | 재생/다시 듣기, "계속(역할극 시작)". |
| Secondary Actions | "훈련 종료"(상시 노출, AC-006). |
| States | Loading: 합성 오디오 준비 스피너 / Empty: N/A / Error: 합성/재생 실패 → 재시도 또는 폴백 음성(Interaction Pattern P-1) / Success: 재생 완료 후 "계속" 노출. |
| Validation | N/A |
| Failure | TTS 합성 실패·오디오 재생 실패 → 재시도/폴백. |
| Accessibility | "AI 훈련용 합성" 표식을 화면 라벨 + 오디오 프리롤 안내로 이중 노출(AC-022, Interaction Pattern P-3). 재생 컨트롤에 스크린리더 라벨. 자막(대사 텍스트) 동시 제공 권장(청각 접근성). |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | 모든 합성 음성에 "AI 훈련용 합성" 표식 필수(AC-022). 실제 전화망/통화 연동 없이 인앱 재생 전용(AC-019). "훈련 종료" 컨트롤 상시 노출(AC-006). |
| Data Required | 클론 voice ID, 시나리오 사칭 대사 텍스트, 합성 오디오 URL(임시), 합성 표식 문구. |
| Data Operations | Create(오디오 합성 요청), Read(대사·합성 결과) |
| External Dependencies | Firebase Functions → ElevenLabs TTS(클론 voice). 임시 오디오는 Firebase Storage(세션 종료 시 폐기 대상, AC-021). |
| Permissions | None(오디오 자동재생 정책상 사용자 탭 필요할 수 있음) |
| Navigation Targets | UX-006, UX-007("훈련 종료" 시) |
| Events Emitted | `deepvoice_played`, `session_end_requested`(종료 시) |
| Expected Outputs | 재생 완료 상태 → 역할극 진입. |
| Assumptions | 클론 voice ID가 준비됨(UX-003). 브라우저 오디오 재생 가능. |

### 사기범 역할극 채팅 (Screen ID: UX-006) — DEPRECATED (v1.4)
> **⛔ DEPRECATED (2026-07-22, v1.4, D-11)**: 단일 연속 통화 **UX-014의 "실시간 역할극(live) phase"로 흡수**됨. D-10(STT/TTS In Scope 전환) 결정은 **반전되지 않고 UX-014로 이관**되어 그대로 유효하다(탭-투-토크·자동 청취·사기범 응답 자동재생·텍스트 폴백 전부 계승). AC-003/004/005/006/007/013/024는 UX-014로 이관. 아래 스펙은 삭제하지 않고 설계 이력으로 보존한다(구현은 UX-014를 따를 것).
> **v0.8 갱신(2026-07-22, D-10)**: 텍스트 채팅 → **실시간 음성 통화형**으로 전환. 텍스트 입력은 STT 미지원 브라우저용 폴백으로 상시 유지.
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-002 (→ UX-014로 이관) |
| Acceptance Criteria | AC-003, AC-004, AC-005, AC-006, AC-007, AC-013, AC-024 (P1 이미지 시 AC-025/AC-022) (→ UX-014) |
| Purpose | AI 사기범과 음성(또는 텍스트 폴백)으로 역할극하며 심리적 압박을 안전하게 경험시킨다. 상시 종료·가드레일이 관통한다. |
| User Goal | 사기범과 대화하며 상황을 겪고, 원할 때 종료한다. |
| Entry | UX-005 재생 후. |
| Exit | 종료 조건 충족 → UX-007. |
| Primary Actions | **탭-투-토크 마이크 버튼(발화 1회 = 전송 1회)**, 텍스트 입력·전송(폴백, 상시 노출), "훈련 종료"(상시 노출·모든 턴에서, AC-006). |
| Secondary Actions | 대화 스크롤, 사기범 응답 음성 수동 재생(자동재생 실패 대비 native controls). |
| States | Loading: AI 응답 대기(타이핑 인디케이터, 지연 목표 내) / Listening: 마이크 인식 중("듣고 있어요") / Empty: 세션 시작 시 사기범 첫 메시지 노출(빈 대화 아님, 오프닝 음성도 자동재생) / Error: LLM 응답 실패·지연 초과 → 재시도(Interaction Pattern P-4), 마이크 권한 거부/미지원 → 텍스트 입력으로 조용히 폴백(단, 왜 텍스트 모드인지 화면에 1줄 고지 — 침묵 실패 금지) / Success: 턴 진행·종료 조건 도달. |
| Validation | 빈 메시지 전송 방지. 전송 대기 중 중복 전송 방지(버튼 비활성). |
| Failure | LLM 실패/타임아웃 → 재시도. 최대 턴·시간 한도 도달 → 자동 종료로 UX-007. 음성 합성 실패 → 텍스트만 표시(핵심 루프 비차단, P-4). |
| Accessibility | 입력창·전송·마이크·"훈련 종료" 키보드 접근. "훈련 종료"는 항상 화면에 고정 노출(스크롤과 무관). 메시지 발신자를 색 아닌 라벨로 구분. 스크린리더가 새 메시지 읽음(aria-live). 음성 응답도 반드시 텍스트 자막을 함께 표시(청각 접근성, AC-024와 별개로 항상 병행). |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | 사기범 인격을 세션 내내 유지(명시적 안전 종료 제외, AC-003). 응답은 사전 정의된 "약화된" 수법 집합에서만 나오며 실제 운영 정보(실계좌·실송금·실링크) 미제공(AC-005). 사기 실행 방법 요청·악용 시도 거부(AC-013). 사용자 입력과 시스템 프롬프트 분리·인젝션 방어(AC-024). 대화 로그 PII 마스킹/토큰화(AC-024). 지연 목표 내 응답(AC-004, 목표 p95 ≤10초·OQ-9). "훈련 종료"는 모든 턴에서 즉시 종료(AC-006). **실제 전화망(PSTN) 연동 없음(AC-019 무변경) — 브라우저 내 STT/TTS만 사용.** AC-012/017/023(사전고지·동의·종료고지)은 D-10에서도 무변경. |
| Data Required | 세션 id, 시나리오 인격/약화 수법 프롬프트, 대화 히스토리(마스킹), 턴 수·경과 시간, 최대 턴/시간 한도, 사기범 응답 합성 음성 URL(1회성). |
| Data Operations | Create(사용자·AI 메시지), Read(대화 히스토리·시나리오 프롬프트), Update(세션 상태·턴 카운트) |
| External Dependencies | Firebase Functions → LLM(Claude/Gemini) + VoiceProvider(ElevenLabs TTS, 현재 Mock). Firestore(세션·대화 로그, PII 토큰화). 브라우저 `SpeechRecognition`/`webkitSpeechRecognition`(비표준 Web API, Safari 등 미지원 — 폴백 필수). |
| Permissions | 마이크(getUserMedia 기반, STT 브라우저 API 경유) |
| Navigation Targets | UX-007 |
| Events Emitted | `message_sent`, `ai_replied`, `session_end_requested`, `limit_reached`, `abuse_request_refused` |
| Expected Outputs | 리포트 생성을 위한 전체 대화 로그(마스킹)와 종료 사유(AC-007). |
| Assumptions | 클론·시나리오 준비 완료. "속은 시점" 판정은 리포트 생성 단계(UX-008)에서 수행하며 채팅 중 실시간 표시하지 않음(D-6). STT는 Chrome/Edge 계열에서만 신뢰 가능(Safari/Firefox 미지원 가능성 — 텍스트 폴백 전제). |

### 통화 세션 — 딥보이스 오프닝 → 실시간 역할극 (단일 연속 통화) (Screen ID: UX-014)
> **v1.4 신설(2026-07-22, D-11·D-12·D-13)**: 구 UX-005(딥보이스 재생) + 구 UX-006(사기범 역할극)을 **하나의 통화 경험**으로 통합한 화면. 사용자 불만("화면 7→8이 하나의 통화처럼 안 느껴짐 / 받았다가 채팅창으로 넘어가는 느낌")을 해소하기 위해, 수신→오프닝→실시간 역할극을 **고정된 통화 셸 안에서 phase 전이로만** 처리한다(화면 전환·중간 "계속" 버튼 없음). claude.ai/design 원안(화면 1a 수신형·1d 상단바 채팅)에 얽매이지 않고 이 앱 고유의 "전화 몰입 + 안전장치 병존" 톤으로 새로 그렸다.
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-002 |
| Acceptance Criteria | AC-019, AC-022, AC-006, AC-003, AC-004, AC-005, AC-007, AC-013, AC-024 (P1 이미지 시 AC-025) |
| Purpose | 하나의 전화 통화 안에서 (1) 본인/기관 사칭 오프닝(clone은 본인 목소리 딥보이스, generic은 기본 합성 음성)을 듣고 (2) **화면 전환 없이 그대로** 사기범과 실시간 음성 역할극을 이어가, "받았다가 못 끊고 말려드는" 심리적 압박을 안전하게 체험시킨다. 통화 셸(발신자·통화 타이머·AI 합성 표식·훈련 종료)이 전 구간 고정되어 단절을 제거한다. |
| User Goal | "내 목소리(또는 기관)로 전화가 오면?"을 받고, 대화에 말려드는 압박을 겪은 뒤 원할 때 끊는다. |
| Entry | generic 시나리오: UX-004에서 `createSession` 직후. clone 시나리오: UX-003 클론 완료 후. |
| Exit | 종료 조건(사용자 종료·최대 턴/시간 한도) 충족 → UX-007. |
| Primary Actions | **① 수신 phase**: "받기"(통화 시작) / "거절"(= 훈련 종료, AC-006). **② 실시간 phase**: 탭-투-토크 마이크(자동 청취 재개 포함) / 텍스트 입력·전송(폴백, 접이식) / "훈련 종료"(전 구간 상시, AC-006). |
| Secondary Actions | 오프닝 다시 듣기(실시간 진입 전 한정), 사기범 응답 수동 재생(자동재생 실패 대비 native controls), 텍스트 입력 토글. |
| States (phase 전이) | **incoming(수신)**: 벨/발신자 라벨·아바타, AC-022 프리롤 고지 문구, "받기/거절". **connecting**: 오프닝 첫 대사 합성 대기 짧은 로딩("연결 중…"). **opening-playback**: 오프닝 대사 자동 연속 재생 + 자막 + 음성 모드 라벨(clone="당신의 목소리로 합성" / generic="기본 합성 음성", D-13) + AI 합성 표식 상시. **live(실시간 역할극)**: 오프닝 종료(오디오 onEnded) 시 화면 전환 없이 자동 청취("듣고 있어요…") 시작 → STT 발화 → 사기범 TTS 자동재생 → 재청취. 타이핑 인디케이터(응답 대기). **error/retry**: LLM/합성 실패 시 인라인 재시도(P-4), 통화 유지. **ended**: 한도 도달 자동 종료 또는 사용자 종료 → UX-007 인계. |
| Validation | 빈 메시지 전송 방지, 전송 대기 중 중복 전송 방지(버튼 비활성). |
| Failure | 오프닝 합성/재생 실패 → 폴백 음성/자막만으로 통화 지속(P-1, 비차단). 실시간 LLM 실패/지연 초과 → 재시도(P-4). 마이크 권한 거부/STT 미지원 → 텍스트 입력으로 폴백 + "왜 텍스트 모드인지" 1줄 고지(침묵 실패 금지). 사기범 음성 합성 실패 → 자막만 표시(핵심 루프 비차단). 최대 턴/시간 한도 도달 → 자동 종료 UX-007. |
| Accessibility | 통화 셸 요소(발신자·타이머·합성 표식·훈련 종료)에 스크린리더 라벨. "훈련 종료"는 스크롤과 무관하게 항상 포커스 도달(AC-006). 오프닝·사기범 음성 대사는 **항상 자막 텍스트 동시 제공**(청각 접근성). 신규 대사 aria-live. 발신자·발신자 구분은 색 아닌 라벨. AI 합성 표식은 점멸 금지·상시 고정(AC-022, 불안 유발 방지). |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | (구 UX-005/006 흡수) 사기범 인격을 통화 내내 유지(안전 종료 제외, AC-003). 응답은 사전 정의된 "약화된" 수법에서만, 실제 운영 정보(실계좌·실송금·실링크) 미제공(AC-005). 사기 실행 방법 요청·악용 시도 거부(AC-013). 사용자 입력/시스템 프롬프트 분리·인젝션 방어 + 대화 로그 PII 마스킹(AC-024). 지연 목표 내 응답(AC-004, p95 ≤10초·OQ-9). 모든 합성 음성/이미지에 "AI 훈련용 합성" 표식(AC-022, 상시 고정). 실제 전화망(PSTN) 연동 없음 — 브라우저 내 STT/TTS만(AC-019 무변경). "훈련 종료"는 모든 phase에서 즉시 종료(AC-006). 한도 도달 시 자동 종료→정확히 1리포트(AC-007). **오프닝 딥보이스 대사는 대화 로그의 사기범 첫 턴(turnIndex 0~)으로 취급되어 리포트 타임라인(AC-026)의 기점이 된다.** AC-012/017/023(사전고지·동의·종료고지)은 무변경 — 통화 몰입 극대화는 "통화 중"에 한정. |
| Data Required | 세션 id, 시나리오 인격/약화 수법 프롬프트, 시나리오 오프닝 대사(deepvoiceLines)·callerLabel·voiceMode, clone voice ID 또는 generic voice ID, 대화 히스토리(마스킹), 턴 수·경과 시간, 최대 턴/시간 한도, 오프닝·사기범 응답 합성 음성 URL(1회성). |
| Data Operations | Create(오디오 합성 요청·사용자/AI 메시지), Read(대사·시나리오 프롬프트·대화 히스토리), Update(세션 상태·턴 카운트) |
| External Dependencies | Firebase Functions → LLM(Claude/Gemini) + VoiceProvider(ElevenLabs TTS, 현재 Mock). Firestore(세션·대화 로그, PII 토큰화, onSnapshot 구독). 브라우저 `SpeechRecognition`/`webkitSpeechRecognition`(비표준, Safari/Firefox 미지원 — 텍스트 폴백 필수). 임시 오디오는 Firebase Storage(세션 종료 시 폐기, AC-021). |
| Permissions | 마이크(getUserMedia 기반 STT). 오디오 자동재생은 브라우저 정책상 "받기" 사용자 제스처 이후 시작(정책 회피점을 수신 phase의 탭에 둔다). |
| Navigation Targets | UX-007 |
| Events Emitted | `call_answered`, `deepvoice_played`, `message_sent`, `ai_replied`, `session_end_requested`, `limit_reached`, `abuse_request_refused` |
| Expected Outputs | 리포트 생성을 위한 전체 대화 로그(마스킹, 오프닝 포함)와 종료 사유(AC-007). |
| Assumptions | clone voice ID(UX-003) 또는 generic voice ID(UX-004)가 준비됨. "속은 시점" 판정은 리포트 단계(UX-008)에서 수행하고 통화 중 실시간 표시하지 않음(D-6). STT는 Chrome/Edge 계열에서만 신뢰(폴백 전제). |
| **아키텍처 트레이드오프 (architect 판단 위임)** | "단일 연속 통화"는 UX 요구(몰입 단절 제거)이지 라우트 구현을 규정하지 않는다. 두 구현안: **(A) 단일 라우트 + phase 상태머신** — 통화 셸을 한 컴포넌트에 두고 phase만 전이. 몰입 단절이 원천적으로 없고 오디오/타이머 컨텍스트가 자연히 연속. 단 딥보이스 재생 + STT/TTS 역할극 로직이 한 라우트에 모여 복잡도↑, 기존 `/session/play`·`/session/chat` 통합 리팩터 필요. **(B) 공유 레이아웃(통화 셸) + 두 라우트 유지** — 셸을 공통 레이아웃으로 올리고 play→chat 전환을 full navigation이 아닌 클라이언트 사이드 내용 교체로. 리팩터는 적으나 라우트 경계에서 통화 타이머·오디오 컨텍스트·STT 상태 연속성 유지가 까다로움. **UX 권고: (A) 단일 라우트가 "하나의 통화" 요구에 가장 부합.** 최종 선택(상태관리·오디오 컨텍스트 연속성)은 architect. 관련 미결: OQ-U7. |

### 세션 종료 + 디스컬레이션 + "훈련이었습니다" 고지 (Screen ID: UX-007)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-002 |
| Acceptance Criteria | AC-007, AC-015, AC-023 (AC-021 트리거) |
| Purpose | 세션을 정확히 마감하고 안심(디스컬레이션) + "이것은 훈련이었습니다" 고지 후 리포트로 인계한다. 생성물 폐기를 트리거한다. |
| User Goal | 훈련이 끝났고 안전하다는 것을 확인한다. |
| Entry | UX-014에서 종료(사용자 종료·완료·최대 턴/시간 한도 도달). |
| Exit | "리포트 보기" → UX-008. |
| Primary Actions | "리포트 보기". |
| Secondary Actions | 처음으로/종료. |
| States | Loading: 폐기 처리·리포트 준비 스피너 / Empty: N/A / Error: 폐기/리포트 준비 실패 → 재시도(단, 고지 메시지는 항상 먼저 노출) / Success: 고지·안심 메시지 표시 + "폐기 완료" 표기 + "리포트 보기". |
| Validation | N/A |
| Failure | 리포트 생성 지연 → 대기 상태(고지 문구는 즉시 노출해 심리적 안심 우선). |
| Accessibility | 안심 메시지는 완화 톤·큰 글씨. 고지 문구를 색 아닌 아이콘+텍스트로 강조. 종료 즉시 포커스를 고지 문구로 이동(스크린리더 우선 안내). |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | 종료된 모든 세션은 정확히 1개 리포트를 생성(AC-007). "이것은 훈련이었습니다" 명시 고지 + 디스컬레이션 메시지 필수(AC-015, AC-023). 세션 종료 시 클론 음성·합성물 파일을 스토리지에서 삭제하고 서버 미저장, 삭제 이벤트를 로그로 남김(AC-021). |
| Data Required | 세션 종료 사유, 대화 로그(리포트 생성 입력), 폐기 대상 생성물 파일 참조. |
| Data Operations | Create(리포트·삭제 로그), Delete(클론 음성·합성물 파일), Update(세션 상태=ended) |
| External Dependencies | Firebase Storage(삭제), Firebase Functions(폐기 처리·리포트 생성 트리거), Firestore(삭제 로그·세션 상태). |
| Permissions | None |
| Navigation Targets | UX-008 |
| Events Emitted | `session_ended`, `artifacts_purged`, `report_generation_started` |
| Expected Outputs | 폐기 완료 상태 + 리포트 생성 트리거. |
| Assumptions | 세션 로그는 마스킹된 형태로 리포트 생성에 사용 가능. 폐기 대상은 UX-002 녹음·UX-014 통화(오프닝·실시간)에서 생성된 임시 오디오·합성물. |

### 취약점 리포트 (Screen ID: UX-008)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-002 |
| Acceptance Criteria | AC-008, AC-009, AC-026 (AC-005/AC-013 문구 주의) |
| Purpose | 사용자가 언제·어디서 속을 뻔했는지 타임라인으로 짚고, 놓친 위험 신호와 올바른 대처법을 제시한다. |
| User Goal | 내 취약점과 다음에 할 행동을 이해한다. |
| Entry | UX-007에서 "리포트 보기". |
| Exit | 처음으로/종료(P1: 게임화 등급 UX-010 또는 히스토리 UX-012). |
| Primary Actions | 리포트 열람(타임라인·수법·대처법), "처음으로". |
| Secondary Actions | (여유 시) 다시 훈련하기, 등급 보기. |
| States | Loading: 리포트 생성 대기 스피너 / Empty: 한 번도 속지 않은 경우 → "속지 않았습니다"를 명시하고 시도된 수법만 나열(AC-009) / Error: 리포트 생성 실패 → 재시도 / Success: 타임라인·수법·대처법 표시. |
| Validation | N/A |
| Failure | 리포트 생성 실패 → 재시도. |
| Accessibility | 타임라인 항목을 텍스트로 명확히("15초 시점에 속았습니다" 등). "개선 영역" 프레임의 완화 톤(과신 방지, PRD Risk). 색만으로 위험도 표기 금지. 큰 글씨·키보드 스크롤. |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Critical |
| Business Rules | 리포트는 최소 (1) 속았/응했을 순간, (2) 사용된 조작 수법, (3) 예방 조언 1개 이상을 포함(AC-008). 속지 않은 경우 이를 명시 + 시도된 수법 나열(AC-009). 속은 시점을 시간축으로 표시 + 그 순간 올바른 대처 제시(AC-026). **실제 사기 실행 정보(실계좌·실송금 절차·실링크)를 절대 노출하지 않는다**(AC-005/AC-013). "이제 면역" 류 과신 표현 금지, "개선 영역" 프레임(PRD Risk). |
| Data Required | 세션 대화 로그(마스킹), 속은 시점/수법/대처법(LLM 분석 결과), 시나리오 메타. |
| Data Operations | Create(리포트 생성), Read(리포트) |
| External Dependencies | Firebase Functions → LLM(리포트 생성). Firestore(리포트 저장 — 단, 생성물 음성은 폐기됨). |
| Permissions | None |
| Navigation Targets | UX-004(다시 훈련), P1: UX-010, UX-012 |
| Events Emitted | `report_viewed`, `retrain_requested`(선택) |
| Expected Outputs | 사용자에게 표시된 취약점 리포트. (P1) 방어 점수 산정 입력. |
| Assumptions | 리포트는 마스킹된 로그만으로 생성 가능하며 실제 운영 정보는 프롬프트·출력에서 배제된다. |

### (P1·스케치) 사칭 이미지 표시 (Screen ID: UX-009)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-002 |
| Acceptance Criteria | AC-025, AC-022 |
| Purpose | 여유 시, 통화(UX-014) 실시간 역할극 중 가짜 송금완료 화면 등 사칭 이미지 1종을 합성 표식과 함께 노출. |
| User Goal | 시각적 사칭물의 위력을 체감한다. |
| Entry | UX-014 실시간 역할극(live phase) 도중. |
| Exit | UX-014로 복귀. |
| Primary Actions | 이미지 보기/닫기. |
| Secondary Actions | "훈련 종료"(상시). |
| States | Loading: 이미지 로드 / Empty: N/A / Error: 로드 실패 시 생략(핵심 루프 비차단) / Success: 표식 포함 이미지 표시. |
| Validation | N/A |
| Failure | 로드 실패 → 조용히 생략(P1, 데모 비차단). |
| Accessibility | "AI 훈련용 합성" 화면 라벨. 이미지 대체 텍스트 제공. |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Low (P1 · 여유 시 추가) |
| Business Rules | 사칭 이미지에도 "AI 훈련용 합성" 표식 필수(AC-022). 실제 송금·계좌 기능 없음(AC-023). |
| Data Required | 사칭 이미지 에셋(정적 또는 생성), 표식 문구. |
| Data Operations | Read(이미지) |
| External Dependencies | 정적 에셋 또는 이미지 생성 파이프라인(T12). Firebase Storage(폐기 대상). |
| Permissions | None |
| Navigation Targets | UX-014 |
| Events Emitted | `spoof_image_shown` |
| Expected Outputs | 표식 포함 사칭 이미지 노출. |
| Assumptions | 여유 시에만 구현. 미구현 시 UF-002 핵심 루프는 영향 없음. |

### (P1·스케치) 방어 등급/게임화 (Screen ID: UX-010)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-002 |
| Acceptance Criteria | AC-010, AC-011 |
| Purpose | 여유 시, 세션 결과로 방어 점수/등급을 산정해 표시하고 세션 간 지속. |
| User Goal | 내 방어 등급을 확인한다. |
| Entry | UX-008 리포트 이후. |
| Exit | 처음으로. |
| Primary Actions | 등급/점수 확인. |
| Secondary Actions | 다시 훈련. |
| States | Loading: 산정 대기 / Empty: 첫 세션 전 "기록 없음" / Error: 산정 실패 시 생략 / Success: 등급·세션 횟수 표시. |
| Validation | N/A |
| Failure | 산정 실패 → 리포트만 표시하고 생략(비차단). |
| Accessibility | 등급을 색 아닌 텍스트/라벨로 표기. 큰 글씨. |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Low (P1 · Day2 여유 시, 신규개발 금지 원칙과 긴장 — 컷 가능) |
| Business Rules | 산정식·레벨 수는 OQ-5 미확정(PRD). 등급/세션 횟수는 세션 간 지속(AC-011). |
| Data Required | 세션 결과, 누적 등급/레벨, 세션 횟수. |
| Data Operations | Create/Update(등급·카운트), Read |
| External Dependencies | Firestore(프로필/등급 지속). |
| Permissions | None |
| Navigation Targets | UX-004 |
| Events Emitted | `grade_calculated` |
| Expected Outputs | 표시된 방어 등급. |
| Assumptions | 지속을 위한 계정/식별자는 UX-013 로그인으로 확보됨(OQ-U2 resolved — P0에 로그인 도입). 산정식은 OQ-5 확정 후 구현. |

### (P1·스케치) 연령 확인(age-gate) (Screen ID: UX-011)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-001 |
| Acceptance Criteria | AC-014 |
| Purpose | 여유 시, 최소 연령 미만 접근 제한. |
| User Goal | 연령 확인을 통과한다. |
| Entry | UX-001 동의 직후(코드 구현은 "직후"를 택함). |
| Exit | 통과 → UX-004(시나리오 선택). *(v1.4: Phase B 정합화 — 이전 "→ UX-002"는 구(舊)순서. 코드 `age-gate`가 통과 시 `/scenarios`로 이동, D-14.)* |
| Primary Actions | 연령 확인 입력/확인. |
| Secondary Actions | N/A |
| States | Loading: N/A / Empty: N/A / Error: 기준 미달 시 차단 안내 / Success: 통과. |
| Validation | 최소 연령값 OQ-8 미확정(PRD). |
| Failure | 기준 미달 → 접근 제한 안내. |
| Accessibility | 큰 글씨·단순 입력. |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Low (P1 · 여유 시) |
| Business Rules | 정의된 최소 연령 미만 접근 제한(AC-014). 기준 연령 = 만 14세(OQ-8 resolved, PRD v0.7). |
| Data Required | 연령/생년 입력 또는 확인 플래그. |
| Data Operations | Create(확인 기록) |
| External Dependencies | 없음(클라이언트 확인) 또는 Firestore. |
| Permissions | None |
| Navigation Targets | UX-004 |
| Events Emitted | `age_verified` |
| Expected Outputs | 연령 확인 통과 상태. |
| Assumptions | 연령값은 OQ-8 확정(만 14세). 확인은 계정 단위 플래그로 1회만 수행하고 재진입 시 재질문하지 않는다(코드 `age-gate` 가드). |

### (P1·스케치) 계정·세션/리포트 히스토리 (Screen ID: UX-012)
| Item | Value |
|---|---|
| Belongs to Flow(s) | UF-001 |
| Acceptance Criteria | AC-011, AC-016 |
| Purpose | 여유 시, 계정 접근 + 과거 세션·리포트의 시간순 히스토리 열람. **본인 열람만**(자녀 열람은 OQ-15 open, 미설계). |
| User Goal | 내 과거 훈련 기록을 본다. |
| Entry | 홈/리포트 이후. |
| Exit | 특정 리포트 열람 → UX-008. |
| Primary Actions | 세션/리포트 목록 열람, 항목 선택. |
| Secondary Actions | 다시 훈련. |
| States | Loading: 목록 로드 / Empty: 기록 없음 안내 / Error: 로드 실패 재시도 / Success: 시간순 목록. |
| Validation | N/A |
| Failure | 로드 실패 → 재시도. |
| Accessibility | 목록 항목 큰 터치 타깃·텍스트 라벨. |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | Low (P1 · 여유 시) |
| Business Rules | 본인 계정 소유 데이터만 열람(OQ-11 확정: 소유권=본인). **자녀의 부모 리포트 열람은 미설계**(OQ-15 open). 시간순 히스토리 제공(AC-016). |
| Data Required | 본인 세션/리포트 목록(메타·타임스탬프). |
| Data Operations | Read(히스토리) |
| External Dependencies | Firestore(세션/리포트 저장). Firebase Auth(계정). |
| Permissions | None |
| Navigation Targets | UX-008 |
| Events Emitted | `history_viewed` |
| Expected Outputs | 시간순 세션/리포트 목록. |
| Assumptions | 로그인/계정은 UX-013에서 확보됨(OQ-U2 resolved — P0에 로그인 도입). 생성물 음성은 폐기되므로 히스토리에는 리포트·메타만 남고 음성은 없음(AC-021). |

## Deprecated
삭제하지 않고 사유와 이관 대상을 남긴다(설계 이력). 상세 스펙은 Screen Catalog의 해당 화면 블록에 DEPRECATED 배너와 함께 그대로 보존되어 있다.

| Screen/Flow ID | 이름 | Deprecated 시점 | 사유 | 이관 대상 |
|---|---|---|---|---|
| UX-005 | 딥보이스 재생 | 2026-07-22 (v1.4, D-11) | 별개 재생 화면 + 이어지는 "계속(역할극 시작)" 버튼이 통화 몰입을 깨뜨린다는 사용자 피드백. "받았다가 채팅창으로 넘어가는" 단절의 원인. | **UX-014**의 opening-playback phase. AC-019/022/006 이관. |
| UX-006 | 사기범 역할극 채팅 | 2026-07-22 (v1.4, D-11) | 위와 동일 — 딥보이스 재생과 별개 라우트(`/session/chat`)로 분리돼 하나의 통화로 느껴지지 않음. | **UX-014**의 live phase. AC-003/004/005/006/007/013/024 이관. D-10(STT/TTS In Scope)의 음성 결정은 반전 아님·계승. |

> 참고: UX-005/UX-006은 PRD 변경이 아니라 **UX 품질 재설계**(동일 PRD v0.8)로 통합됐다. 두 화면의 AC·상호작용은 모두 UX-014에 살아 있으므로 커버리지 손실은 없다(Consistency Check 참조).

## Information Architecture
선형(linear) 단일 여정 구조. 어르신 저인지부하를 위해 분기·메뉴를 최소화한다.

> **v1.4 갱신(2026-07-22, D-11·D-14)**: (1) 딥보이스 재생(구 UX-005)+역할극(구 UX-006)을 **단일 연속 통화 UX-014**로 통합 — 별개 화면 전환과 그 사이 "계속" 버튼을 제거해 "하나의 통화"로 만든다. (2) Phase B 순서(시나리오 선택이 녹음보다 먼저; generic은 녹음/클론 생략)를 유지하되 통합 통화를 반영. 이전 다이어그램(UX-005→UX-006 2단 전환)은 아래로 대체됐다.

```
로그인/가입 (UX-013)   ── P0 진입점(유효 세션 시 건너뜀)
  └─ 사전고지+동의 (UX-001)
  └─ [P1] age-gate (UX-011)
  └─ 시나리오 선택 (UX-004)          ── UF-001 종료 / UF-002 시작
       ├─ voiceMode:"clone" 선택 시 ─ 목소리 녹음·본인확인 (UX-002)
       │                                  └─ 클론 생성 대기 (UX-003) ─┐
       └─ voiceMode:"generic" 선택 시 ─────────────────────────────┤ (둘 다 여기서 합류)
                                                                     ↓
              ┌──────────────── 통화 세션 (UX-014) ─── 단일 연속 통화 ─────────────┐
              │  수신 → 오프닝 딥보이스(clone=본인목소리 / generic=기본합성) → 실시간 역할극  │
              │  (하나의 통화 셸: 발신자·통화 타이머·AI 합성 표식·훈련 종료 상시 고정)          │
              └──────────────────────────────────────────────────────────────────┘
                     │                                    ── [P1] 사칭 이미지 (UX-009)
                     └─ 세션 종료·고지 (UX-007)   ← "훈련 종료"는 UX-014 전 구간에서 상시 진입(AC-006)
                          └─ 취약점 리포트 (UX-008)
                               └─ [P1] 방어 등급 (UX-010)
                               └─ [P1] 히스토리 (UX-012) → 리포트 재열람
```

- **통화 = 화면 전환 없는 phase 전이**: 수신→오프닝→실시간 역할극은 UX-014 한 화면 안의 phase일 뿐 별개 라우트 이동이 아니다(D-11·D-12). 라우트 구현 방식(단일 라우트 vs 공유 레이아웃)은 architect 판단(UX-014 Architect Handoff·OQ-U7).
- **전역 상시 컨트롤**: 통화(UX-014, [P1]UX-009 포함) 전 phase에서 "훈련 종료"가 항상 노출되어 어느 지점에서든 UX-007로 즉시 진입(AC-006). 수신 phase에서는 "거절"이 그 역할을 겸한다.
- 정식 내비게이션 메뉴(햄버거/탭바) 없음 — 하루 스코프·저인지부하 위해 선형 진행 + 상시 종료만 둔다.

## Interaction Patterns
재사용 패턴. 구현자는 화면별로 재발명하지 말고 이 정의를 따른다.

- **P-1 클론 생성 대기 로딩**: 단계형 진행 표시("목소리 분석 중 → 클론 생성 중 → 준비 완료") + 예상 시간 문구 + 계속 움직이는 진행 애니메이션으로 "멈춘 인상" 제거. 지연이 길어도 최소 상태 문구가 주기적으로 갱신되어야 함. 타임아웃 시 재시도 버튼 + **데모 폴백(사전 준비 클론/녹화본)** 경로 노출(OQ-U3). 감소 모션 설정 존중, 진행 상태를 스크린리더용 텍스트로도 안내.
- **P-2 세션 중 상시 종료**: 통화(UX-014 전 phase, [P1]UX-009)에 "훈련 종료" 컨트롤을 스크롤과 무관하게 고정 노출. 누르면 **확인 다이얼로그 없이 즉시** 세션을 종료하고 UX-007로 이동(AC-006, 어르신 저부하 — D-2). 수신 phase에서는 "거절"이 종료를 겸한다. 종료 후 첫 포커스는 안심 고지 문구.
- **P-3 합성물 표식 노출**: 모든 합성 음성/이미지에 "AI 훈련용 합성" 표식을 **① 화면 상시 라벨(점멸 금지·고정) + ② 오디오 프리롤 안내 문구**로 이중 노출(AC-022). 이미지에는 화면 라벨 + 대체 텍스트. 표식은 색 배지 단독이 아니라 텍스트 포함.
- **P-4 응답 대기·재시도**: AI 응답/합성/리포트 대기 중 스피너 또는 타이핑 인디케이터 표시, 전송 버튼 비활성으로 중복 요청 방지. 실패/타임아웃 시 인라인 오류 + "재시도" 버튼. 핵심 루프 비차단 요소(P1 이미지 등)는 실패 시 조용히 생략.
- **P-5 입력 검증 타이밍**: 게이트(동의·본인확인·필수 선택)는 미충족 시 다음 버튼을 **비활성**으로 사전 차단(제출 후 오류 대신 사전 안내). 오류 메시지는 해당 컨트롤 근처에 아이콘+텍스트로 표시.
- **P-6 권한 거부(마이크)**: 마이크 권한 거부 시 UX-002를 "권한 필요" 안내 상태로 전환하고 재요청 방법을 텍스트로 안내. 녹음 버튼은 잠금.
- **P-7 오프라인**: 네트워크 끊김 시 진행 버튼 비활성 + "연결을 확인해 주세요" 배너. 복구 시 재시도 가능. (하루 스코프상 자동 재연결 큐잉은 구현하지 않음.)
- **P-8 디스컬레이션 톤**: 종료·리포트 화면 문구는 완화 톤·안심 우선("훈련이었습니다", "안전합니다"), "면역됨" 류 과신 표현 금지, "개선 영역" 프레임(PRD Risk).
- **P-9 확인 다이얼로그 사용 원칙**: 되돌릴 수 없는 파괴적 동작에만 확인을 둔다. 세션 종료는 되돌릴 필요가 적고 즉시성이 중요하므로 확인을 두지 않는다(P-2·D-2).
- **P-10 통화 셸 연속성(Call Shell continuity)** *(v1.4 신설, D-11·D-12)*: UX-014의 수신→오프닝→실시간 역할극은 **하나의 고정 통화 셸** 안에서 phase 전이로만 처리한다. 통화 셸 = ① 상단 AI 합성 표식(고정) + 통화 경과 타이머, ② 중앙 발신자 아바타·라벨(callerLabel) + 현재 대사 자막, ③ 하단 "훈련 종료"(상시). phase가 바뀌어도 이 셸은 자리를 지켜, full-page navigation·레이아웃 점프·"채팅창으로 넘어가는" 인상을 만들지 않는다. 오프닝 대사와 사기범 실시간 응답은 **같은 대화 로그·같은 자막 영역**에 누적된다(오프닝 = 사기범 첫 턴).
- **P-11 오프닝→실시간 이음새 없는 전환(seamless handoff)** *(v1.4 신설, D-12)*: 오프닝 마지막 대사의 오디오 재생 종료(onEnded) 시 **별도 확인·"계속" 버튼 없이** 곧바로 실시간 청취("듣고 있어요…")로 넘어간다. 오디오가 없거나 합성 실패로 재생할 게 없으면 즉시 청취로 전환(침묵 실패 금지). 중간에 "통화 종료/completed" 상태를 두지 않는다 — 통화는 사용자가 "훈련 종료"를 누르거나 한도에 도달할 때까지 끊기지 않는다.

## Accessibility
| Item | Value |
|---|---|
| Keyboard Navigation | 모든 상호작용 요소(체크박스·버튼·녹음·입력·전송·"훈련 종료")는 Tab으로 도달·Enter/Space로 실행 가능. "훈련 종료"는 세션 화면에서 항상 포커스 도달 가능. |
| Focus Order | 화면 진입 시 포커스는 주 제목/핵심 안내로. 세션 종료 직후 포커스는 UX-007의 "훈련이었습니다" 고지 문구로 이동(안심 우선). 오류 발생 시 포커스를 오류 메시지로. |
| Screen Reader Support | 녹음 상태("녹음 중/완료"), 클론 진행 단계, 채팅 신규 메시지(aria-live), "AI 훈련용 합성" 표식, 리포트 타임라인 항목을 텍스트로 읽을 수 있게 라벨링. 오디오 재생 대사는 자막 텍스트 동시 제공. |
| Color Contrast | 본문·라벨 최소 WCAG AA(일반 텍스트 4.5:1, 큰 텍스트 3:1). 어르신 대상 고려해 큰 글씨 기본. |
| Touch Target Size | 최소 44×44px, 어르신 주요 액션(녹음·시작·"훈련 종료")은 48px 이상 권장. |
| Error Messaging | 오류·상태·위험도·합성 표식은 **색만으로 전달 금지** — 아이콘+텍스트를 함께 사용. |

## Responsive Behavior
웹 단일 채널. 어르신은 모바일 브라우저, 데모는 데스크톱일 가능성이 높아 두 브레이크포인트 모두 지원한다.

| Breakpoint | Layout Changes |
|---|---|
| Desktop | 중앙 정렬 단일 컬럼(가독성 위해 최대 폭 제한). 시나리오 카드(UX-004)는 가로 나열 가능. 통화(UX-014)는 중앙 컬럼 통화 셸, AI 합성 표식·통화 타이머 상단 고정, "훈련 종료" 하단 고정. |
| Tablet | 데스크톱과 동일한 단일 컬럼. 시나리오 카드 1~2열. No breakpoint-specific behavior beyond column count. |
| Mobile | 단일 컬럼 세로 스택. 시나리오 카드 1열. 녹음·"받기/거절"·"훈련 종료" 등 주요 버튼 폭 확대(터치). 통화(UX-014)의 마이크·텍스트 입력·"훈련 종료"는 하단/상단 고정으로 스크롤 무관 상시 노출. |

## UX Decision Log
Append-only — 과거 항목을 고쳐쓰거나 삭제하지 않는다.

### D-1 하루 완성을 위해 화면/상태 최소화
| Item | Value |
|---|---|
| Decision | P0 핵심 루프를 8개 화면(UX-001~008)·선형 단일 여정으로 압축하고, 사전고지+동의를 한 화면(UX-001)에 통합, 정식 내비게이션 메뉴를 두지 않는다. 상태는 화면당 Loading/Error/Success 중심으로만 정의하고 풍부한 엣지케이스는 배제. |
| Reason | 개발이 Day1 하루(무박 포함)에 끝나야 하고 3명 병렬이며 Day2 오전은 버그픽스만 가능(PRD Constraints). 데모 스크립트가 2분 내 매끄럽게 이어져야 함. |
| Alternatives Considered | 온보딩/동의/연령/로그인 화면 분리, 리치 내비게이션, 화면별 다수 엣지 상태. |
| Rejected Because | 하루 스코프에서 구현·검증 불가하고 데모 흐름을 느리게 함. |
| Impact | Architecture / Implementation |
| Status | Active |

### D-2 세션 종료는 확인 다이얼로그 없이 즉시
| Item | Value |
|---|---|
| Decision | "훈련 종료"는 모든 세션 화면에 상시 노출되며 누르면 확인 없이 즉시 종료→UX-007로 이동. |
| Reason | AC-006이 "항상 보이는 단일 컨트롤로 즉시 종료"를 요구. 어르신 저인지부하·심리적 안전(즉시 탈출 가능해야 함). |
| Alternatives Considered | 종료 전 확인 다이얼로그(오조작 방지). |
| Rejected Because | 확인 단계가 "즉시 탈출"을 방해하고 인지부하를 늘림. 종료는 파괴적 동작이 아님(리포트로 안전 인계). |
| Impact | Implementation |
| Status | Active |

### D-3 합성물 표식 이중 노출(화면 라벨 + 오디오 프리롤)
| Item | Value |
|---|---|
| Decision | 합성 음성·이미지에 "AI 훈련용 합성"을 화면 상시 라벨과 오디오 프리롤 안내로 이중 노출. |
| Reason | AC-022 충족 + 보안 배점 20% 근거를 심사에서 명확히 보여주기 위함. |
| Alternatives Considered | 화면 라벨만, 오디오 안내만. |
| Rejected Because | 단일 노출은 청각/시각 어느 한쪽 접근성에서 표식을 놓칠 수 있음. |
| Impact | Implementation |
| Status | Active |

### D-4 클론 생성 대기를 전용 화면으로 분리
| Item | Value |
|---|---|
| Decision | 클론 생성 대기를 UX-002의 로딩 상태가 아닌 전용 화면(UX-003)으로 분리하고 단계형 진행·폴백 경로를 둔다. |
| Reason | ElevenLabs 클론이 수 초~수십 초 걸릴 수 있어 데모 중 "멈춘 것처럼" 보이는 리스크가 큼(PRD Risk: 라이브 클론 데모 실패). 전용 화면이 진행·폴백·재시도를 명확히 다룸. |
| Alternatives Considered | UX-002 인라인 스피너로 처리. |
| Rejected Because | 인라인 스피너는 장시간 대기·폴백 전환을 표현하기 어렵고 데모 리스크를 키움. |
| Impact | Architecture / Implementation |
| Status | Active |

### D-5 본인 확인은 경량 자기확인으로 설계(강한 KYC 배제)
| Item | Value |
|---|---|
| Decision | AC-020의 "본인 확인"을 체크박스+확인 문구("본인 목소리·본인 직접 녹음") 기반 경량 자기확인으로 설계하고, 파일 업로드/타인 음성 입력 경로를 UI에서 제거. |
| Reason | 하루 스코프에서 강한 신원인증(정부 ID·본인인증) 구현 불가. AC-020의 핵심 의도(타인 목소리 무단 등록 차단)는 입력 경로 제거 + 자기확인으로 충족 가능. |
| Alternatives Considered | 휴대폰 본인인증/OAuth 신원확인. |
| Rejected Because | 하루 개발·데모 범위 초과. 단, 강도 충분성은 architect/user 확정 필요(OQ-U1). |
| Impact | Architecture / Implementation |
| Status | Active |

### D-6 "속은 시점" 판정은 리포트 단계에서만(채팅 중 실시간 표시 안 함)
| Item | Value |
|---|---|
| Decision | 사용자가 속은 시점·수법 판정은 리포트 생성(UX-008)에서 수행하고, 역할극 채팅(UX-006) 중에는 실시간으로 표시하지 않는다. |
| Reason | 실시간 판정 UI는 몰입을 깨고 구현 복잡도를 키움. AC-026(타임라인)은 사후 리포트로 충족. |
| Alternatives Considered | 채팅 중 실시간 "위험!" 경고 표시. |
| Rejected Because | 몰입(예방접종 효과) 저해 + 하루 스코프 초과. |
| Impact | Implementation |
| Status | Active |

### D-7 자녀 보조/자녀 리포트 열람 화면 미설계
| Item | Value |
|---|---|
| Decision | 자녀가 부모 계정을 대신 만드는 화면·자녀가 부모 리포트를 열람하는 화면을 설계하지 않는다. 본인 1인 온보딩 경로만 설계. |
| Reason | PRD v0.4에서 OQ-3·OQ-15가 빌드 스코프 관점에서 여전히 open. 발표 내러티브 전용이며 빌드 스코프 밖. |
| Alternatives Considered | 자녀 보조 온보딩 화면 추가. |
| Rejected Because | 빌드 스코프 미확정·미포함(PRD·Tasks 게이팅). 임의 설계는 스코프 크립. |
| Impact | None(설계 제외) |
| Status | Active |

### D-8 P1 화면은 경량 스케치만
| Item | Value |
|---|---|
| Decision | P1(UX-009 사칭 이미지, UX-010 게임화, UX-011 age-gate, UX-012 히스토리)은 상태·핸드오프를 최소로만 스케치하고 "여유 시 추가"로 표시. 핵심 루프 비차단. |
| Reason | P1은 Day1 야간~Day2 여유 시 항목(PRD Priority). 핵심 루프 완성이 우선. |
| Alternatives Considered | P1도 P0 수준으로 상세 설계. |
| Rejected Because | 하루 스코프에서 P0 완성도를 희생시킴. |
| Impact | Implementation |
| Status | Active |

### D-9 P0에 로그인 도입 (OQ-U2 해소)
| Item | Value |
|---|---|
| Decision | P0 진입점에 로그인/가입 화면(UX-013)을 신설하고 UF-001의 첫 단계로 둔다. 로그인은 UX-001(사전고지+동의) **이전**에 배치하며, 이후 모든 데이터(동의·클론·세션·리포트)는 인증된 계정에 귀속된다. |
| Reason | 사용자 확정(2026-07-21) "로그인 있이 가자". 로그인이 계정 소유권(OQ-11: 소유권=본인)·동의 귀속·리포트/등급 지속(AC-011/016)의 앵커가 되어 데이터 모델이 명확해짐. 로그인 우선 배치는 인증 없는 부분 진행 상태를 없애 흐름을 단순화. |
| Alternatives Considered | (1) 로그인 없이 익명/임시 세션(OQ-U2의 원래 제안). (2) 로그인을 UX-001 동의 이후에 배치. (3) 로그인을 UX-002 녹음 직전에 배치. |
| Rejected Because | (1) 사용자가 로그인 필요로 결정. (2)·(3) 동의·부분 데이터가 익명 상태로 먼저 생기면 계정 귀속·소유권 처리가 복잡해지고, 어르신에게 중간 로그인 삽입이 흐름을 끊음. 로그인 우선이 가장 단순. |
| Impact | Architecture(Firebase Auth·데이터 귀속) / Database(사용자 계정 스키마) / API / Implementation. **D-1의 "로그인 화면 분리 rejected" 판단 중 로그인 부분만 본 결정으로 갱신**(D-1의 화면 최소화 원칙 자체는 유효·Active 유지). |
| Status | Active |

### D-10 UX-006을 텍스트 채팅에서 실시간 음성 통화형으로 전환(STT/TTS In Scope 전환)
| Item | Value |
|---|---|
| Decision | UX-006(사기범 역할극)에 브라우저 음성 인식(STT, 탭-투-토크) 입력과 사기범 응답 자동 음성 재생(TTS)을 추가한다. 텍스트 입력창은 STT 미지원 브라우저(Safari 등)를 위한 상시 폴백으로 남긴다. **실제 전화망(PSTN) 연동은 하지 않는다** — 여전히 앱 내부(브라우저)에서만 동작하는 통화형 UI다(AC-019 무변경). |
| Reason | 사용자 결정(2026-07-22). "훈련인지 사용자가 인지하면 안 된다"(사전고지·동의 자체 생략)를 먼저 요청했으나, 이는 AC-012/017/023을 정면으로 제거하는 것이라 어르신 대상 무동의 공포 유발 리스크로 **거부**. 절충안으로 "사전 동의는 유지, 통화 중 몰입은 유지"에 합의. 이어 "전화가 기본 모드"·"진짜 음성 대화(마이크 입력)"·"진짜 전화"(재확인 결과 PSTN 아닌 앱 내 통화형 UI로 확정)로 이어짐. |
| Alternatives Considered | (1) 원안(사전고지·동의 생략) — 거부. (2) 텍스트 채팅 유지, 음성은 화면 7(딥보이스 재생)에만 한정. (3) 실제 전화망(PSTN, Twilio 등) 연동. |
| Rejected Because | (1) AC-012/017/023 제거는 동의 없는 심리적 실험에 해당해 실제 심리적·법적 리스크(특히 주 타겟 어르신). 실제 사례로 동의 없는 "가짜 응급상황" 프랭크는 사망·소송 전례가 있음. (3) PSTN 연동은 AC-019가 이미 명시적으로 배제한 항목이며, 전화번호 수집·통신사업법·보이스피싱 관련 법규 검토가 하루 스코프 내 불가능. |
| Impact | UX-006 States/Primary Actions/Business Rules 갱신(아래), `functions/src/roleplay`(sendMessage에 TTS 합성 훅), `src/lib/recording/useSpeechRecognition`(신규), PRD v0.8, Architecture.md §1 금지 목록. |
| Status | Active |

### D-11 딥보이스 재생(구 UX-005) + 역할극(구 UX-006)을 단일 연속 통화 UX-014로 통합
| Item | Value |
|---|---|
| Decision | 별개 라우트였던 딥보이스 재생(UX-005)과 사기범 역할극(UX-006)을 하나의 통화 화면 **UX-014**로 통합하고, 두 화면은 Deprecated로 이관한다(삭제 금지). 통화는 수신→오프닝→실시간 역할극을 고정 통화 셸 안의 phase 전이로 처리한다. D-10(STT/TTS In Scope)의 음성 결정은 반전 없이 UX-014로 계승된다. |
| Reason | 사용자 피드백(2026-07-22): "화면 7(전화받기)→8(대화)이 하나의 통화처럼 안 느껴짐 / 받았다가 채팅창으로 넘어가는 느낌." 원인은 두 라우트(`/session/play`·`/session/chat`) 사이의 full-page 전환. 하나의 화면·하나의 셸로 합치면 통화 몰입(예방접종 효과의 핵심)이 유지된다. 화면 단위로 claude.ai/design 원안을 수입해온 접근이 단절의 근본 원인이라는 사용자 지적도 반영해, 이 앱 고유 요구(전화 몰입 + 안전장치)에서 새로 그렸다. |
| Alternatives Considered | (1) 두 화면 유지 + 공유 레이아웃(통화 셸)으로 라우트 전환만 부드럽게. (2) 현행(두 라우트 + "계속" 버튼) 유지. (3) 텍스트 채팅으로 회귀. |
| Rejected Because | (2) 현행이 바로 사용자가 지적한 단절의 원인. (3) D-10에서 이미 음성 통화형으로 결정됨(반전 불가). (1)은 유효한 구현 대안이나 UX 스펙 레벨에서는 "하나의 통화"를 단일 화면으로 규정하는 게 명확 — 라우트 구현 방식(단일 vs 공유 레이아웃)은 architect에게 트레이드오프로 위임(UX-014 Architect Handoff, OQ-U7). |
| Impact | Architecture(`/session/play`·`/session/chat` 통합 리팩터 또는 공유 레이아웃) / Implementation. UX-005·UX-006 Deprecated. UF-002 Steps·IA·Interaction Patterns(P-10/P-11) 갱신. D-1(화면 최소화)과 정합 — 화면 수를 오히려 줄인다. |
| Status | Active |

### D-12 오프닝→실시간 이음새 없는 전환(중간 "계속" 버튼·"통화 종료" 상태 제거)
| Item | Value |
|---|---|
| Decision | 오프닝 딥보이스 마지막 대사 재생 종료(onEnded) 시 별도 확인·"계속(역할극 시작)" 버튼 없이 곧바로 실시간 청취로 전환한다. 오프닝과 실시간 사이에 "통화 종료/completed" 중간 상태를 두지 않는다. 통화는 사용자가 "훈련 종료"를 누르거나 한도 도달 시에만 끝난다. |
| Reason | 현행 UX-005의 completed 상태 + "계속" 버튼이 통화를 두 동강 내 "채팅창으로 넘어가는" 인상을 준다. 실제 사기 전화는 인사→본론이 끊김 없이 이어진다 — 이음새를 없애야 심리적 압박(예방접종)이 유지된다. |
| Alternatives Considered | 오프닝 후 "역할극을 시작할까요?" 확인 단계 유지. |
| Rejected Because | 확인 단계가 몰입을 끊고, 사용자가 "이제 다른 화면"으로 인지하게 만든다. 통화 이탈은 "훈련 종료"로 언제든 가능하므로 별도 확인 불필요(P-9와 정합). |
| Impact | Implementation(UX-014 phase 전이 로직). 구 UX-005의 completed 상태·"계속" 버튼 제거. |
| Status | Active |

### D-13 clone/generic 시나리오를 동일 통화 셸로 처리하되 음성 모드 라벨로만 구분
| Item | Value |
|---|---|
| Decision | clone(본인 목소리 사칭)과 generic(기관 사칭) 시나리오를 UX-014의 동일 통화 셸로 처리하되, 오프닝 음성 모드를 라벨로 구분한다: clone="당신의 목소리로 합성", generic="기본 합성 음성". generic은 녹음/클론 단계 자체를 생략한다(코드는 이미 `voiceMode`로 분기). |
| Reason | 화면 구조를 시나리오별로 이원화하면 하루 스코프·유지비용이 커진다. 라벨 분기만으로 "근거 없는 본인 목소리 표기 금지"(generic에 '당신의 목소리로 녹음' 같은 거짓 문구 방지 — 사용자가 과거 지적)를 충족하면서 통화 프레임은 재사용할 수 있다. |
| Alternatives Considered | (1) generic 전용 별도 통화 화면. (2) generic도 "본인 목소리" 문구 그대로(거짓). |
| Rejected Because | (1) 하루 스코프 초과·중복. (2) 사실과 다른 표기(AC 정합·윤리 위반). 단, generic을 딥보이스와 같은 프레임에 넣는 것이 차별점(#1 본인 목소리 복제)을 희석하는지 여부는 ux-design이 단독 판단할 사안이 아니라 "재검토 필요(기능 방향)" 섹션 R-2로 넘긴다. |
| Impact | Implementation(UX-014 라벨 분기). Screen Catalog UX-004/UX-014. |
| Status | Active |

### D-14 온보딩 순서(Phase B) 문서 정합화 — 시나리오 선택 후 조건부 녹음
| Item | Value |
|---|---|
| Decision | Screen Catalog의 Entry/Exit·화면-플로우 소속·UF Steps를 실제 코드 순서(로그인→동의→[age-gate]→**시나리오 선택**→(clone일 때만)녹음→클론대기→통화→종료→리포트)로 정정한다. 녹음(UX-002)·클론 대기(UX-003)의 소속을 UF-001→**UF-002**로 이관한다. |
| Reason | IA 다이어그램(v1.3)과 실제 코드(`scenarios/page.tsx`·`age-gate/page.tsx`·`clone/wait`)는 이미 Phase B 순서였으나, 개별 화면의 Entry/Exit·Nav Targets·UF Steps가 구(舊)순서(동의→녹음→클론→시나리오)로 남아 **문서 내부가 서로 모순**이었다. generic 시나리오가 녹음을 생략하려면 시나리오를 먼저 골라야 분기가 가능하다는 Phase B 근거를 화면 스펙에도 반영. |
| Alternatives Considered | 구 순서 유지(문서만 옛 상태로 방치). |
| Rejected Because | 코드·IA와 화면 스펙이 어긋난 채로 두면 architect/implementer가 어느 순서를 믿을지 혼란. downstream 재검증 무결성 위반. |
| Impact | Screen Catalog UX-001/002/003/004/011 Entry·Exit·Nav·소속. UF-001/UF-002 Steps·Related AC. |
| Status | Active |

### D-15 UX-014 통화 중 "AI 훈련용 합성" 상시 배지 제거(AC-022 편차)

| Item | Value |
|---|---|
| Decision | UX-014(통화) 화면에서 통화 중 상시 노출되던 "AI 훈련용 합성" 배지(SyntheticLabel)를 제거한다. 사전 동의(UX-001)·시나리오 선택 화면의 "실제 사기가 아니라 훈련용 시뮬레이션입니다" 안내·전화받기 전 프리롤 고지(PREROLL_NOTICE)·"훈련 종료" 버튼(AC-006/012/017/023)은 이번 변경 범위가 아니며 그대로 유지된다. |
| Reason | 사용자(제품 소유자)가 명시적으로, 반복적으로 지시. AI 담당자는 통화 중 고압박 구간에서 순간적 판단력 저하 시 기댈 안전장치로서 배지 유지를 권고했고 이 우려를 사용자에게 전달했으나(2026-07-22, 세션 내 3회), 사용자가 이해한 상태에서 최종적으로 제거를 재확인·지시함 — 제품 자체의 UX/안전 톤에 대한 최종 결정권은 제품 소유자에게 있다고 판단해 반영. |
| Alternatives Considered | (1) 배지 유지(AI 권고안). (2) 배지 크기/불투명도만 축소. |
| Rejected Because | 사용자가 (1)·(2) 모두를 거부하고 완전 제거를 재확인. |
| Impact | Implementation(`src/app/session/play/page.tsx`의 `<SyntheticLabel />` 제거, import 정리). AC-022 매핑 표(§Non-Functional/Cross-Cutting)는 "UX-014(오프닝·이미지 시)" 문구가 더 이상 통화 중 상시 노출과는 무관함을 유의 — 사전 고지·프리롤 문구 쪽으로 커버리지가 좁아졌다는 것을 architect/QA가 인지해야 함. |
| Status | Active |

## Open Questions
UX 설계 과정에서 **새로 발견된** 미해결 사항만 기재한다(PRD의 기존 OQ-3/5/8/9/14/15 등은 PRD에 있으므로 중복 기재하지 않음).

| # | Question | Priority | Owner | Reason | Blocking Impact | Suggested Resolution | Status | Decision |
|---|---|---|---|---|---|---|---|---|
| OQ-U1 | AC-020 "본인 확인"의 구체 강도 — 경량 자기확인(체크+문구, D-5)로 충분한가, 별도 신원인증이 필요한가? | High | Architect / User | 보안 배점 20% 근거이나 하루 스코프 내 강도 결정은 기술·정책 판단 필요. ux-design 단독 결정 불가. | UX-002 본인 확인 UI의 최종 형태·문구 확정이 지연됨. | 데모/하루 스코프에서는 자기확인 + 입력경로 제거로 진행하고, 발표에서 "타인 음성 등록 경로 부재"를 가드레일 근거로 제시. | open | |
| OQ-U2 | P0 데모가 로그인 없이(익명/임시 세션)로 동작하는가, Firebase Auth 로그인 화면이 P0에 필요한가? | High | Architect | 계정(AC-016)은 P1인데 동의·클론·리포트가 세션 식별을 필요로 함. 로그인 화면 존재 여부가 UX-001 진입부를 바꿈. | UX-001 진입 흐름·UX-012(히스토리)·UX-010(등급 지속) 설계가 로그인 여부에 종속. | P0는 익명/임시 세션으로 진행(로그인 화면 없음), 계정·히스토리는 P1로 미룸 권장. | resolved | **사용자 확정(2026-07-21): 로그인 있이 진행. P0에 Firebase Auth 로그인이 필요하다.** 로그인/가입 화면 UX-013 신설, UF-001 첫 단계로 배치(D-9). 구체 인증 프로바이더는 OQ-U5로 분리. |
| OQ-U3 | 클론 생성 최대 허용 대기 시간·타임아웃 값과 타임아웃 후 폴백(사전 준비 클론/녹화본) 노출 방식(UX-003, P-1). | High | Architect | T1(ElevenLabs PoC) 실측 지연에 종속하며 데모 안정성에 직결. ux-design이 수치 확정 불가. | UX-003 로딩·폴백 상태의 구체 동작·타임아웃 확정 지연. | T1 PoC 결과로 타임아웃 확정 + 실패 시 사전 준비 폴백 경로 필수화(PRD Risk 대비 녹화본과 연계). | open | |
| OQ-U4 | 세션 최대 턴 수·최대 시간 한도의 구체값(AC-007 종료 조건 표시). | Medium | Architect / User | AC-007이 한도 도달 종료를 요구하나 구체 수치는 미정. 데모 길이(2분)와도 관련. | UX-006 한도 도달 자동 종료 문구·표시의 구체화 지연. | 데모 흐름(2분)에 맞춰 짧은 상한(예: 소수 턴/수 분)으로 설정 후 architect 확정. | open | |
| OQ-U5 | 로그인/가입(UX-013)의 구체 인증 프로바이더·방식(이메일+비밀번호 / Google 등 소셜 / 전화번호 등)과 그에 따른 입력 필드·검증 규칙. | High | Architect | 인증 수단 선택은 Firebase Auth 설정·보안·구현 난이도와 직결된 **기술 판단**이라 ux-design 단독 확정 불가. UX 레벨에서는 "로그인/가입 화면이 존재하고 인증된 세션을 만든다"까지만 설계 가능. | UX-013의 입력 필드·검증(Validation)·Failure 문구 최종 확정과 T2/T3 구현 착수가 여기에 종속. | 하루 스코프·어르신 대상 저부하 고려 시 가장 단순한 수단(예: 이메일+비밀번호 또는 Google 1클릭) 권장. 어르신 타이핑 부담을 줄이려면 소셜 1클릭이 유리하나 데모 계정 준비 편의는 이메일이 유리 — architect가 T2 스캐폴딩 시 확정. | resolved | **사용자 확정(2026-07-21): Google 소셜 로그인(Firebase Auth Google Provider)만 사용.** 이메일/비밀번호·전화번호 등 미사용. UX-013을 "Google로 로그인" 버튼 1개 기준으로 구체화(States/Failure에 팝업 취소·차단·네트워크 실패 반영). |
| OQ-U6 | Google 계정이 없는 사용자(특히 어르신)의 진입 처리 — Google 계정 신규 생성을 앱이 안내/유도할지, 자녀가 미리 Google 계정을 만들어주는 것을 전제할지. | Medium | User / Planner | Google 단일 로그인(OQ-U5 확정)으로 계정 미보유자는 진입 자체가 막힌다. 이는 어르신 타겟(PRD Target Users)과 직결되나, 자녀 대리설정(OQ-3)·발표 내러티브(가족 원격 훈련)와 얽혀 ux-design 단독 결론이 부적절. | Google 계정 미보유 어르신의 첫 진입 경험(안내 문구·계정 생성 유도 UI 필요 여부)이 미확정. 단, P0 본인 온보딩 데모 자체는 로그인 계정 보유를 전제하므로 데모 흐름은 비차단. | (1) 데모/P0: 사용자가 Google 계정 보유를 전제(UX-013 Assumptions에 명시)하고 미보유 처리 UI는 만들지 않음. (2) 미보유 어르신 안내는 OQ-3(자녀 계정 생성 UI 보조) 논의와 함께 다루기를 권장 — 임의 설계는 스코프 크립. | open | |
| OQ-U7 | 통화(UX-014)를 **단일 라우트 + phase 상태머신(A)**로 구현할지, **공유 통화 셸 레이아웃 + 두 라우트 유지(B)**로 구현할지. | High | Architect | "단일 연속 통화"(D-11)는 UX 요구이며 라우트 방식은 상태관리·오디오 컨텍스트·STT 연속성 판단이 필요한 기술 결정이라 ux-design 단독 확정 불가. | UX-014의 구현 착수(기존 `/session/play`·`/session/chat` 통합 리팩터 범위)가 여기에 종속. UX 스펙(phase·통화 셸·이음새 없는 전환)은 두 방식 모두에서 동일하게 만족 가능. | UX 권고는 (A) 단일 라우트(오디오/타이머 컨텍스트가 자연히 연속, 몰입 단절 원천 제거). 최종은 architect가 리팩터 비용 대비 판단. | open | |
| OQ-U8 | 통화 경과 타이머·AC-007 한도(MAX_SESSION_MS, DECISIONS #10=6분)의 **기점** — 오프닝 딥보이스 재생 시간도 6분 한도·타이머에 포함되는가, 아니면 실시간 역할극 진입 시점부터 재는가? | Medium | Architect / User | 오프닝을 "사기범 첫 턴"으로 취급(UX-014 Business Rules)하면 타임라인 기점이 오프닝이지만, 한도 6분에 오프닝 재생을 포함할지에 따라 실제 대화 가능 시간이 달라진다. 데모 길이(2분)와도 관련. | UX-014 통화 타이머 표시·자동 종료 문구의 구체화, 리포트 타임라인(AC-026) "N초 시점" 기준 시각 확정. | 데모 흐름상 타이머·한도 기점을 "받기(call_answered)"로 통일하고 오프닝 재생을 한도에 포함(하나의 통화 = 하나의 시간축). architect 확정. | open | |

## 재검토 필요 (기능 방향 — 사용자 판단 필요)
> 사용자 요청(2026-07-22)에 따라 신설한 **별도 섹션**. 위 Open Questions가 "UX 구현을 위한 architect용 기술 미결"이라면, 여기는 화면 흐름을 그리다 발견한 **기능 자체의 방향에 대한 의문**이다. **ux-design은 여기서 답을 내리지 않는다** — 기능 방향을 임의로 바꾸는 것은 ux-design 권한 밖이므로, 사용자가 판단하도록 질문 형태로만 남긴다. 판단 결과에 따라 planner(PRD)·ux-design(화면)으로 라우팅될 수 있다.

| # | 재검토 항목 | 무엇이 걸리는가(설계 중 발견) | 사용자에게 묻는 질문 | 관련 화면/AC |
|---|---|---|---|---|
| R-1 | **자동 청취(auto-listen)가 정말 이 앱 목표에 맞는가** | 현재 코드(`session/chat`)는 상대 턴이 끝나면(오디오 onEnded, 또는 재생할 오디오가 없으면 즉시) 마이크를 **자동으로** 연다. 통화 몰입엔 자연스럽지만: (a) 주변 소음·침묵을 사용자 발화로 오인, (b) 어르신이 "언제 말해야 하는지" 모른 채 마이크가 열려 불안, (c) 생각할 틈 없이 압박이 이어짐. 예방접종(압박 재현)엔 유리하나 어르신 심리적 안전(PRD Risk "실제 심리적 충격")엔 불리할 수 있어 **상충**한다. | 자동 청취를 기본으로 둘 것인가, 탭-투-토크(사용자가 말할 때만 마이크 탭)를 기본으로 두고 자동 청취는 옵션/제거할 것인가? 어르신 강도 완화 원칙과 자동 청취 몰입 중 무엇이 우선인가? | UX-014 (live phase) / AC-006, PRD Risk(심리적 충격) |
| R-2 | **기관사칭(generic)을 딥보이스와 같은 "통화" 경험으로 묶는 게 맞는가** | 이 앱의 차별점 1번은 "본인 목소리 복제"(딥보이스). generic(기관사칭)은 본인 목소리가 없어 "기본 합성 음성"으로 재생된다(D-13). 둘을 같은 통화 셸에 넣으면 사용자가 (a) "이것도 내 목소리?"로 오해하거나 (b) generic이 밋밋해 차별점이 희석될 수 있다. | 기관사칭을 딥보이스와 동일한 통화 UI로 제공하는 게 맞는가, 아니면 사용자가 두 시나리오를 **명확히 다른 경험**으로 인지하도록 톤/프레임을 분리해야 하는가? 애초에 generic 시나리오를 이번 데모 범위에 넣는 게 맞는가(PRD상 "여유 시" 항목)? | UX-004, UX-014 / AC-001, 차별점 #1 |
| R-3 | **clone 시나리오에서 사기범 실시간 응답도 본인 클론 목소리여야 하는가** | 오프닝은 본인 목소리(가족 사칭)로 재생되는데, 이어지는 실시간 역할극에서 사기범(=그 "가족")의 응답 TTS가 **어떤 목소리**인지 기능 정의가 불명확하다. 오프닝은 클론인데 대화 응답이 기본 음성이면 "같은 사람이 말하는 통화"라는 몰입이 깨진다. (아키텍처 경계와도 얽힘 — VoiceProvider가 세션 내내 clone voice를 쓰는지.) | clone 시나리오의 실시간 사기범 응답도 오프닝과 동일한 본인 클론 목소리로 합성해야 하는가(일관성·몰입)? 비용/지연(ElevenLabs 매 턴 합성) 대비 가치가 있는가? | UX-014 (opening→live) / AC-018/019, D-13 |
| R-4 | **오프닝을 "사기범 첫 턴"으로 리포트 타임라인에 넣을 때 '속은 시점' 기준** | 리포트(AC-026)가 "N초 시점에 속았습니다"를 표시하려면 시간 기점이 필요하다. 오프닝(고정 스크립트, 사용자 응답 전)을 타임라인 0점으로 삼을지, 실시간 대화 시작을 0점으로 삼을지에 따라 "속은 시점" 판정과 사용자에게 보이는 숫자가 달라진다. | 리포트 타임라인의 0초 기점을 통화 시작(오프닝 재생)으로 할 것인가, 실시간 대화 시작으로 할 것인가? (기능 정의 — OQ-U8의 타이머 기점 결정과 함께 다뤄야 함.) | UX-014, UX-008 / AC-026 |
| R-5 | **"거절(전화 안 받기)"을 어떻게 다룰 것인가** | 수신 phase에서 "거절"은 현재 곧바로 훈련 종료다. 그런데 예방접종 관점에서 전화를 안 받으면 사용자는 아무 체험도 못 한다. 반대로 실제로는 "모르는 번호 안 받기"가 정답에 가깝다. | 거절을 "잘하셨습니다(안 받는 게 최선)"로 긍정 피드백하는 미니 학습 지점으로 만들 것인가, 아니면 체험을 위해 받도록 유도(거절 시 안내 후 재수신)할 것인가? 훈련 설계 방향 질문. | UX-014 (incoming phase) / AC-006 |
