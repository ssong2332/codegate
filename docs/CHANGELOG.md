# Changelog

Owner: docs agent (see AGENTS.md). Format: [Keep a Changelog](https://keepachangelog.com/), newest first.

## [Unreleased]
### Added
- **프로젝트 스캐폴딩(T2)**: Next.js(App Router, TypeScript, Tailwind, 정적 export) + Firebase(Auth/Functions/Firestore/Storage) 초기화, 배포 파이프라인(`firebase deploy`), API/DB 계약 스텁, `firestore.rules`/`storage.rules`, `.env.example`(클라)·`functions/.env.example`(서버) 2분리.
- **Google 로그인 + 전역 라우트 가드(T18)**: Firebase Auth Google Provider로 로그인/가입. 인증되지 않은 사용자는 로그인 화면 외 모든 라우트에서 리다이렉트되며, 모든 데이터는 로그인한 사용자의 uid에 귀속된다. 로컬 Firebase 에뮬레이터 기준으로 빌드/lint/Firestore write까지 검증됨 — 실제 브라우저에서 Google OAuth 팝업을 끝까지 클릭해보는 것은 아직 미검증(에뮬레이터 한계).
- **한국어 "가족 납치/사고" 딥보이스 시나리오 콘텐츠(T6)**: 공개 메타데이터(제목·사기 유형·난이도 등)와 민감한 역할극 프롬프트(페르소나·약화 수법)를 분리 저장.
- **음성 프로바이더 인터페이스(T19, 임시 목업)**: 공통 `VoiceProvider` 인터페이스 뒤에 `MockVoiceProvider`를 붙여 클론/합성 파이프라인 개발을 언블록. **ElevenLabs API 키가 아직 준비되지 않아 실제 음성 클론/합성이 아닌 임시 목업(플레이스홀더 오디오)이며, 응답에 `isMock: true` 표식이 붙는다. 추후 ElevenLabs 실연동으로 교체 예정(최종 데모 필수 조건).**
- **AI 사기범 역할극 엔진(T7, 임시 목업)**: `createSession`/`sendMessage`로 시나리오 기반 대화를 주고받을 수 있다. 서버가 시스템 프롬프트를 조립하고 사용자 입력은 별도 role/구분자로 감싸 프롬프트 인젝션을 구조적으로 방어하며, 응답 시간 초과에 대한 안전망(타임아웃 처리)을 포함한다. **LLM API 키가 아직 준비되지 않아 실제 LLM이 아닌 규칙 기반 목업(`MockLlmClient`)이 응답하며, `isMock: true`로 식별된다. 인격 유지·실시간 적응 등은 실 LLM 연동 후에야 검증 가능. 추후 Claude/Gemini 실연동으로 교체 예정.** reviewer APPROVED, QA GO 통과.
- **온보딩 + 동의 게이팅 + 본인 목소리 등록 UI(T3)**: 명시적 동의 화면, 본인 확인 절차, 30초 대본 녹음 UI. 인증된 세션(T18) 전제로만 진입 가능. Firestore/Storage 에뮬레이터로 동의 write/read·녹음 업로드 경로·타인 uid 거부를 검증. **브라우저 마이크 권한 팝업·실제 녹음 재생 등 실클릭 UI 동작은 미검증**(T18과 동일한 한계, 코드 리뷰로만 확인).
- **음성 클론 파이프라인 통합(T4, Mock 기준)**: 녹음 업로드 → `createVoiceClone`(Mock `VoiceProvider`) → `createSession`이 동일 sessionId를 채택하는 흐름을 실배선. 소유 uid 불일치·녹음 없음 등 오류 처리 포함. functions test 34/34, 에뮬레이터 실호출 7/7 케이스 검증. **미검증**: 브라우저 실클릭(버튼→네비게이션→스피너). 시나리오 선택 UI(당시 `src/app/scenarios/page.tsx`)는 아직 T2/T6 스텁이라 sessionId 채택 경로가 실제 화면에서는 호출되지 않은 상태로 남음(T5가 후속 연결). 음성은 여전히 Mock — 최종 데모 전 ElevenLabs 실클론(T1)으로 교체 필수.
- **딥보이스 가족사칭 오디오 인앱 재생(T5)**: 시나리오 선택 → `synthesizeDeepvoice`로 대사 3줄 순차 재생, "AI 훈련용 합성" 표식(SyntheticLabel)과 재생 전 텍스트 프리롤 안내, 훈련 종료 버튼 상시 노출. 에뮬레이터 실호출 19/19 검증(클론→세션→합성×3→타uid 세션탈취 거부 포함). **미검증**: 오디오 자동재생·순차재생 등 브라우저 실클릭.
- **세션 라이프사이클 + 안전 종료(T8)**: `endSession`(소유권/인자 검증, 멱등 처리)과 "이것은 훈련이었습니다" 고지·디스컬레이션 안심 메시지 화면(UX-007)을 구현. 리포트 생성 트리거를 `endSession`과 자동종료(10턴 한도) 양쪽이 공유하는 단일 지점으로 통합. functions test 36/36, 에뮬레이터 16/16 검증. **알려진 갭**: 종료 사유(`endReason`)가 항상 `user_ended`로 고정(채팅 화면 미구현이라 다른 종료 경로 없음), 브라우저 실클릭 미검증.
- **취약점 리포트 생성·표시(T9)**: `generateReport`가 마스킹된 대화 로그에서 속은 시점 타임라인·시도된 수법·대처법을 산출해 리포트 화면(UX-008)에 표시. **LLM API 키 미확보로 실 LLM 대신 규칙 기반(저항/순응 키워드 매칭) 판정을 사용함을 투명 고지**(API.md는 "LLM 산출"로 서술 — 실제로는 아님). functions test 43/43(신규 7건), 에뮬레이터 시나리오 20/20 검증. **알려진 갭**: tacticsUsed 판정이 Mock 대화 특유의 flavor 문구 삽입 패턴에 의존 — 실 LLM 교체 후 매칭 정확도 재검증 필요. 브라우저 실클릭 미검증.
- **가드레일2 — 생성물 즉시 폐기(T10)**: 세션 종료(`status → ended`) 시 발화하는 Firestore 트리거 `onSessionEnded`가 Storage `users/{uid}/sessions/{sid}/**` 파일 삭제 + ElevenLabs voice 삭제 + `session.voiceId` 클리어 + `deletionLogs` 감사 기록을 수행. 부분 실패도 target별로 기록해 재시도 가능. reviewer APPROVED, QA GO. functions test 54/54(신규 11건), 에뮬레이터 21/21 검증(삭제 실측, 재발화 없음 확인). **설계 이탈(승인 필요, 상세는 UpdateRequests.md #4)**: ADR-0003/API.md는 `sessions/{sid}/artifacts` 서브컬렉션을 매니페스트로 순회하는 설계였으나, 실제 구현은 Storage prefix 실제 나열 방식 — reviewer는 이 쪽이 더 안전한 설계라고 판단(artifacts는 T5가 쓴 적이 없어 항상 비어 있었고, 애초에 원본 녹음을 포함하지 못하는 스키마였음).
- **가드레일5 하드닝 — PII 마스킹 실구현 + 프롬프트 인젝션 방어 레드팀 스팟체크(T11)**: `guardrails/maskPII`를 passthrough 스텁에서 정규식 기반 실구현으로 교체 — 이메일 / 주민번호형(`\d{6}-\d{7}`) / 전화번호형(010-xxxx-xxxx, 02-xxx-xxxx 등) / 8자리 이상 연속 숫자(계좌형) 4종을 이 순서로 토큰화(`[이메일]`/`[주민번호]`/`[전화]`/`[계좌]`)해 원문 대신 저장한다(T7이 이미 배선해 둔 `maskPII` 호출부는 무수정). `roleplay/promptAssembly.ts`의 `wrapUserInputAsData`에 구분자 하드닝(`escapeDelimiterLookalikes`)을 추가해, 사용자 입력이 `[훈련참가자입력:...]`류 가짜 구분자를 흉내 내도 전각괄호로 치환하고 실제 구분자는 래퍼가 감싼 시작/끝 1쌍만 남도록 방어. **레드팀 스팟체크**: 한국어 인젝션 변형 12종을 `INJECTION_PATTERN`에 직접 검증 — 6종 탐지, 6종 미탐. 미탐 6종 중 2종(계좌번호 요청·링크 요청)은 시나리오 콘텐츠 자체에 유출할 실제 운영정보가 없어 Mock 단계에서는 구조적으로 안전함을 확인했고, 나머지 4종(역할 재정의, 오탈자, 완곡 정체인정, 일반 지시무시)은 정규식이 놓치는 잔존 리스크로 정직하게 남김 — 실LLM 교체 후 재검증 필요. functions test 80/80(신규: maskPII 11건 + promptAssembly 구분자 2건 + injectionRedTeam 13건, 기존 69건 무회귀), 에뮬레이터 실호출 11/11 검증(저장된 `messages.textMasked`에 원문 PII 0건 확인). **알려진 한계**: 8자리 이상 숫자는 문맥과 무관하게 계좌형으로 마스킹되는 과잉마스킹(오탐) 경향이 남아 있음(ADR-0004가 이미 수용한 트레이드오프, 금액/이름 토큰화는 하카톤 스코프 밖). reviewer APPROVED, QA 조건부 GO(오케스트레이터 보고 기준 — 이 docs 세션에서 리뷰/QA 리포트 원문은 직접 확인하지 못했고, docs/Tasks.md T11 행은 이 시점까지 `review`로 남아 있어 판정 반영이 지연된 상태로 보임).
- **사칭 이미지 1종 + 합성 표식(T12)**: `SpoofImage` 컴포넌트를 HTML/CSS로 그린 가짜 은행 앱 "송금완료" 카드로 구현(이미지 생성 도구 미가용). 은행명·수취인·계좌번호·거래시각 전부 placeholder 표기 + "실제 송금이 아닙니다" 문구 명시, `SyntheticLabel` 상시 오버레이, 로드 실패 시 조용히 생략(비차단). 채팅 화면(UX-006)이 당시 스텁이라 실제 오버레이 배선은 하지 않고 통합 지점만 주석으로 남김.
- **게임화 — 사기 방어 등급(T13, 임시 플레이스홀더 v1)**: `computeDefenseGrade`가 누적 리포트의 방어율로 5단계 등급을 산정(OQ-5 미확정 — 사용자 승인 하에 "(v1)" 접미사로 임시값임을 화면에도 노출). `generateReportCore`가 리포트 생성 직후 `users/{uid}.defenseGrade`/`sessionCount`를 갱신, 실패해도 리포트 생성 자체는 막지 않음(비차단). `/grade`(UX-010) 화면 완성.
- **연령 확인 age-gate(T14)**: 만 14세 기준(OQ-8 확정) 자기신고 확인 플래그 방식으로 `AgeGate` 구현. `src/lib/age`로 판정 로직(순수 함수)과 Firestore read/write를 분리. 온보딩 동의(UX-001) 직후·녹음(UX-002) 이전에 배치, URL 직접 접근으로 우회 불가하도록 가드 추가.
- **세션/리포트 히스토리 열람(T15)**: `/history`(UX-012)에서 본인 `reports`를 시간순(최신순)으로 열람. 클라 Firestore SDK 직접 read(콜러블 불필요), 항목 클릭 시 `/report?sessionId=...`로 이동. 에뮬레이터로 소유권 분리(타uid 열람 차단) 검증.
- **역할극 채팅 화면(UX-006) 구현 — 채팅 UI 자체가 없던 마지막 P0 갭 해소**: `sessions/{sid}/messages` 서브컬렉션을 실시간 구독해 대화 내역을 렌더링하고, 입력을 `sendMessage`로 전송한다. 턴 한도(`N/maxUserTurns`) 표시, 한도 도달 시 입력 잠금 + `/session/end` 안내, LLM 응답이 Mock임을 알리는 배지(`isMock`)를 노출해 실 LLM과 혼동되지 않게 했다. 백엔드(T7 역할극 엔진, T8 세션 라이프사이클)는 이미 완성·테스트돼 있었고 화면만 없었던 상태였음. 에뮬레이터 실호출 17/17 검증(오프닝 메시지 write→`sendMessage` 실호출→turnIndex 순서·역할 정합·타uid 탈취 거부까지, 스크립트는 검증 후 삭제·커밋 안 함).

### Changed
- **로컬 개발 방식(사용자 결정, 2026-07-21)**: 프로토타입 단계는 실제 Firebase 콘솔 프로젝트 없이 로컬 Firebase 에뮬레이터로 진행하기로 확정. 실 프로젝트 연결은 데모 준비 시점으로 이연.

### Fixed
- **`synthesizeDeepvoice.ts` 더미 스텁 실배선 교체(T5, 크로스트랙 버그픽스)**: `session/play`(UX-005) 화면이 실제로는 백엔드를 호출하지 않고 하드코딩된 가짜 오디오(`/mock-audio/mock-deepvoice-stub.mp3`, 실존하지 않는 파일)를 재생하고 있던 것을 발견해 실제 `httpsCallable` 호출로 교체.
- **`synthesizeDeepvoice` 콜러블에 세션 소유권 검증 추가(T5, 보안 하드닝)**: `createVoiceClone`/`createSession`/`endSession`과 달리 소유 uid 검증이 없어 타uid 호출이 거부되지 않던 문제를 확인해 동일한 `permission-denied` 검증 패턴을 추가.
- **`createSession.ts`/`endSession.ts` 더미 스텁 실배선 교체(T8)**: T2 이후 더미 스텁 상태였던 것을 실제 `httpsCallable` 호출로 교체(이 교체 없이는 세션 종료 전체 파이프라인이 서버를 타지 않아 T8 자체 검증이 불가능했음).
- **`sendMessage.ts` 더미 스텁 실배선 교체(채팅 화면 구현과 함께)**: T2 이후 유일하게 남아 있던 콜러블 더미 스텁을 실제 `httpsCallable` 호출로 교체.
- **클라 타입 계약 드리프트 해소**: `CreateSessionResponse`/`SendMessageResponse`에 서버는 이미 반환 중이던 `isMock` 필드가 클라 `src/lib/api/types.ts`에는 누락돼 있던 것(T7 known gap)을 추가.

## [0.1.0] - {{YYYY-MM-DD}}
### Added
- Initial release.
