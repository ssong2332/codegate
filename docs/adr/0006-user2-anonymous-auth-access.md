# ADR-0006: 2인 소셜 사용자2 접근 메커니즘 — 익명 인증 재사용(정제형 A1)

- Status: accepted
- Date: 2026-07-24
- Owner: architect
- DECISIONS.md entry: #27
- Supersedes(문구 한정): Architecture.md §14.0 point 1 "직접 Firestore 접근 없음", §14.1 "소유자 없음/토큰 바운드"
- 관련: ADR-0002(본인 목소리만), ADR-0003(즉시 폐기), ADR-0005(챌린지 스코프 클론), DECISIONS #2(Google Provider), #21/#22

## Context
PRD v1.1의 2인 소셜 훈련(AC-040~044/048)에서 **사용자2**는 로그인 없이 링크 토큰만으로 진입해(AC-048) 딥보이스 통화를 체험하고, 종료 시 강제 정체 공개(AC-042)+리플레이(AC-038)를 본다. T35(§14)가 데이터 계약(`challenges` 스키마·토큰·보존)을 고정했으나 **사용자2가 실제로 백엔드에 접근하는 메커니즘**은 미정으로 남았다. T37(사용자2 측 구현)이 이 위에 세워지므로 착수 전에 확정이 필요하다.

**미정이 낳은 실측 모순:** 기존 인프라(`createSession`/`sendMessage`/`createRealtimeCall`/`submitRealtimeTranscript`/`endSession`/`generateReport`, UX-014 통화 화면, UX-018 리플레이 화면)는 전부 `request.auth.uid` 소유권 + `firestore.rules`의 `resource.data.uid == request.auth.uid` read 게이트 위에 서 있다. 그런데 §14.1/API.md는 사용자2 세션을 "소유자 없음"으로 두라면서 동시에 `createRealtimeCall`(uid 소유 강제)을 "재사용"하라 한다 — 코드 레벨에서 성립 불가능한 조합이다.

두 가지 근본 구현형이 갈린다:
- **(A) 익명 인증**: 사용자2 브라우저가 로그인 UI 없이 Firebase Anonymous Auth로 임시 uid를 얻어 체험 세션을 소유. 기존 인프라 무개정 재사용.
- **(B) 완전 자체 토큰**: `request.auth` 없이 세션-스코프 비밀을 매 콜러블에 파라미터로 전달. `firestore.rules`는 이를 못 보므로 사용자2 경로 문서를 전부 `if false`로 잠그고 100% Functions 매개 → UX-014/UX-018 화면 재작성 + 병렬 콜러블 스택 신설.

## Decision
**(A) Firebase 익명 인증을 내부적으로 재사용한다 — 정제형 A1.**

- 사용자2는 **동의 시점**에 로그인 UI·비밀번호·계정 없이 익명 사인인해 **임시 `request.auth.uid`**를 얻고, 그 uid가 체험 `sessions/{sid}`를 소유한다.
- 이후 `createRealtimeCall`·`submitRealtimeTranscript`·`endSession`·`generateReport`·`report/replay` 화면·`firestore.rules` 소유자 read가 **전부 무개정 재사용**된다.
- 신규 콜러블은 **챌린지 문서만 만지는 토큰-매개**(getChallengeLanding·consentChallenge·reportChallenge·setChallengeResultSharing)뿐 — `challenges`가 `if false`라 어느 옵션이든 필요한 것들이다. T36의 `resolveChallengeByTokenHash`/`markChallengeConsumed`/`hashToken`을 재사용한다.

**정제(A1) — 두 지점을 손대야 하는 이유(정합성 요건, 선택 아님):** 챌린지 clone `voiceId`를 **사용자2 세션 문서에 저장하지 않는다.**
1. **유출 방지(AC-041):** 세션 문서에 담으면 사용자2가 소유자 자격으로 자기 세션을 직접 read할 때 사용자1의 raw clone id가 브라우저로 나간다(reviewer가 `challenges`를 잠근 Critical #1과 동형).
2. **폐기 격리:** `onSessionEnded`(guardrails/index.ts L131)가 `after.voiceId`를 ElevenLabs DELETE voice로 폐기 → 세션에 챌린지 voiceId가 있으면 **사용자2 첫 체험 종료 시 사용자1 챌린지 clone이 삭제**돼 기간제 보존(30일)·2차 taker가 깨진다.

따라서 체험 세션은 `challengeId`만 갖고, `createRealtimeCall`이 발급 시 `challenges/{challengeId}`에서 서버측(admin)으로 voiceId를 해석하고 **§14.2 발급 게이트(status∈{consented,in_progress}+미만료)를 재검증**한다. clone 수명은 챌린지 문서(`retentionDeleteAt`)에만 묶여 체험 세션 폐기와 분리된다.

| Option | Pros | Cons |
|---|---|---|
| (A/A1) 익명 인증 재사용 ✅ | UX-014·UX-018 무개정 재사용, 신규 콜러블 3–4개(양쪽 공통분), §0.1·§14.2 정합, 격리=앱 전체가 이미 신뢰하는 소유권 격리 동일 메커니즘 | Firebase 콘솔 익명 프로바이더 활성화 필요(설정), "무로그인"이 "보이는 로그인 없음"으로 해석됨, `createRealtimeCall`에 challenge 분기 1개 추가 |
| (B) 완전 자체 토큰 | "Auth 토큰 0"의 가장 문자적 해석 | UX-014/018 재작성 또는 포크(라이브 `onSnapshot` 상실), 병렬 콜러블 ~8–10개, 손으로 재구현한 토큰 스레딩이 검증된 Auth 토큰보다 취약, §0.1·§14.2 정면 위반 |

**AC-048 "무로그인" 판독:** 요구는 "사용자2에게 로그인을 요구하지 않는다"이다. 익명 인증은 계정·자격증명·로그인 화면이 전무하고 사용자에게 불가시하므로 문자 그대로 성립한다. DECISIONS #2 "Google Provider only"는 사용자1 로그인 UX 최소화 결정이지 익명 인증 금지가 아니며, 익명 인증은 그 회피 대상(로그인 UI)을 도입하지 않는다.

## Consequences
- **Positive:** 대규모 재작성 없이 T37 성립. AC-043 격리가 기존 소유권 규칙(내 세션은 남이 못 봄)의 재사용으로 강제됨 — 새 보증 표면 없음. resultSummary는 T9 리포트에서 서버 파생(별도 분석 파이프라인 없음). UX-018 리플레이 무개정 재사용.
- **Negative / accepted trade-offs:** (1) 익명 프로바이더 콘솔 활성화 의존(문서화·배포 체크리스트). (2) T9 defense-grade 갱신이 `users/<익명 uid>` 에페메랄 문서를 만든다(무해; 원하면 challenge 세션에서 grade 갱신 skip 최적화 — 정합성 무관). (3) "무로그인"의 문자적 순수성을 익명 토큰과 맞바꿈(§14.7.1 판독으로 정당화). (4) `createRealtimeCall`에 challenge 분기 신설(소규모).
- **Follow-ups required (T37 implementer):**
  1. `SessionDoc`에 옵셔널 `challengeId?: string`(indexed) 증분 — 체험 세션↔챌린지 링크(Migration Policy: 옵셔널, 기존 세션 무영향). `voiceId`는 challenge 세션에 **미저장**.
  2. `consentChallenge`가 세션 생성 시 익명 uid를 소유자로 세팅(voiceId 미저장, channel=voice, 한도·오프닝 라인은 `createSession` 로직 참고). `createSession`(사용자1 경로)은 **무개정**.
  3. `createRealtimeCall`에 `session.challengeId` 분기 추가: challenge admin read로 voiceId 해석 + status/만료 재검증. 소유권 검증(익명 uid)은 유지.
  4. 클라 사용자2 랜딩이 동의 시 `signInAnonymously(auth)` 호출(불가시). `firebase/auth`의 익명 사인인은 프로바이더 인스턴스 불필요.
  5. `setChallengeResultSharing(share=true)`가 세션 리포트를 서버 read해 `resultSummary` 파생(대화 전문 없음, AC-043).
  6. 검증: `onSessionEnded`가 voiceId 없는 challenge 세션에서 안전 no-op인지(purge.ts는 이미 "voiceId 없던 세션 안전" 명시) + 익명 uid Storage 경로가 비어 있는지 에뮬레이터 확인.
  7. 배포 문서: Firebase 콘솔 Anonymous 프로바이더 활성화 단계 README 반영.

---

## Addendum A2 (2026-07-24) — 챌린지 라이브 통화 voice 참조 예외 (§14.2 불변식 정밀화, T38 통합 게이트)

- Status: accepted
- Date: 2026-07-24
- Owner: architect
- DECISIONS.md entry: #28
- **정정 대상:** ADR-0005 §Decision "추출 차단" 문구 + Architecture.md §14.2 "추출 차단" 불변식의 무조건형 표현("어디에도 없다"). 두 라티파이드 결정(ADR-0005 불변식 ↔ ADR-0006 A1 "createRealtimeCall 무개정 재사용") 사이에서 T38 QA가 실측한 모순을 해소한다. **본 애드덤은 A1을 뒤집지 않는다** — A1(세션 문서에 voiceId 미저장)은 그대로 유효하고, A2는 A1이 다루지 않은 `createRealtimeCall` **응답 계약**을 정밀화한다.

### 발견 (T38 QA, 실측 재현 — 추정 아님)
`createRealtimeCall` 응답에는 예전부터 `voiceId` 필드가 있었다(`functions/src/realtime/callTypes.ts:13`, `docs/API.md:46`). 정상 세션에선 응답 수신자 = voice 소유자 본인이라 무해했다. 그러나 A1대로 T37이 challenge 세션의 voiceId를 서버측에서 해석해(`functions/src/realtime/index.ts:81` `effectiveVoiceId = challenge.voiceId`) **같은 응답 계약으로 반환**하면, 수신자가 이제 **사용자2(익명·무인증·voice 비소유자)**다. 즉 challenge 세션에 한해 이 콜러블이 §14.2가 "어떤 콜러블도 하면 안 된다"고 못박은 행위(사용자1의 raw voiceId를 타인 브라우저로 반환)를 정확히 수행한다. 실측: seed `voiceId:"mock-voice-c1-raw-id"` → 사용자2 세션의 `createRealtimeCall` 응답 `voiceId==="mock-voice-c1-raw-id"`, 세 응답 구성 경로 전부(`elevenLabsProvider.ts:53`·`mockProvider.ts:17`·index.ts:101 폴백)에서 재현 → ElevenLabs 라이브 여부와 무관.

### 왜 "필드를 그냥 지운다"가 답이 아닌가 (ElevenLabs Agents 프로토콜 실측)
- ElevenLabs Agents는 **런타임 TTS voice 지정을 클라 개시(conversation_initiation_client_data)로만** 받는다. `RealtimeVoiceSession.tsx:71`이 `overrides.tts.voiceId`로 보내는 그 값이다. `signedUrl` 단독은 voice를 인코딩하지 않는다.
- **서버측 대체 경로 없음(검증):** `GET /v1/convai/conversation/get-signed-url`은 `agent_id`·`include_conversation_id`·`branch_id`·`environment`만 받고 **voice/override 파라미터를 받지 않는다**. 서명 URL/토큰에 voice를 굽는 공식 경로가 없다.
- 따라서 challenge 세션에서 응답의 `voiceId`를 무조건 비우면, 사용자2 브라우저가 에이전트에게 사용자1 클론을 지정할 방법이 사라져 "본인/지인 목소리로 걸려오는 통화"(이 기능의 전체 목적, AC-041/044) 자체가 깨지거나 generic 음성으로 폴백한다.
- **더 무거운 대안과 기각 사유:** (a) *챌린지별 전용 에이전트에 voice를 굽기* — 에이전트는 현재 시나리오당 1개 공유(프롬프트를 대시보드에 수기 저작, agentMap.ts·ADR-0004)라 challenge마다 서버가 에이전트를 프로그램적으로 생성·프롬프트 조립 푸시·수명 삭제해야 함. agentMap.ts가 경고한 프롬프트 드리프트를 **자동화로 재도입** + 에이전트 쿼터/비용/라이프사이클 신규 기계 → §0.1·ADR-0006 A1(무개정 재사용) 정면 위배, 한계이득 ~0(아래). (b) *서버측 TTS 릴레이/프록시* — 브라우저↔ElevenLabs 직결 WebSocket 아키텍처(키·voice 미노출 + 오디오 직결)를 통째로 폐기, 지연·스트리밍 인프라 신설 → 범위 밖.

### 결정
**(1) 스코프 한정 예외를 명문화한다.** raw ElevenLabs voiceId는 **오직** 아래 전 조건을 만족할 때만 클라(사용자2)에 도달할 수 있다 — 그 외 어떤 콜러블·다운로드 경로로도 반환되지 않는다:
- 수신자가 **동의를 마친 단일 토큰 바운드 taker(사용자2)**이고,
- §14.2 발급 게이트(`challenge.status∈{consented,in_progress}` + 미만료 + 보존기간 내)를 통과했으며,
- **라이브 ElevenLabs speech 세션을 실제로 여는 경로에서만**(`provider==="elevenlabs"`), 그 통화 duration 동안만.

**(2) 그래서 실제 노출을 기능적 최소로 조인다(T38 발견이 드러낸 gratuitous 노출 차단 — 신규 요건).** challenge 세션의 `createRealtimeCall` 응답 `voiceId`는 `provider==="elevenlabs"`가 **아닌** 모든 경로에서 `""`여야 한다:
- clone 시나리오는 Gemini 경로(generic 전용, 고정 음성)를 타지 않으므로 Gemini는 애초에 voiceId를 안 쓴다.
- mock/none(텍스트 폴백)은 `RealtimeVoiceSession`을 마운트하지 않아(`src/app/session/play/page.tsx:448` — 이 컴포넌트는 `provider==="elevenlabs"`일 때만 렌더) voiceId를 **소비하지 않는다**. 여기서 voiceId를 실으면 기능적 쓰임 0의 순수 노출이다.
- 결과: raw voiceId는 "실제로 사용자2 귀에 그 목소리가 재생될 라이브 통화" 경로에만 도달한다.

### 왜 이 예외가 §14.2 위협모델상 안전한가 (ADR-0005가 ADR-0003 즉시폐기에 판 예외와 동형의 정당화)
| 위협모델 질문 | 판정 |
|---|---|
| raw **오디오 바이트**가 추출·다운로드되나? | **아니오, 불변** — 오디오는 ephemeral WebSocket 재생뿐, 다운로드 경로 부재. §14.2의 "raw 오디오 바이트" 절은 **무조건형 그대로 유지**. |
| voiceId 문자열을 사용자2가 **앱 밖(자기 ElevenLabs 계정)에서** 재사용 가능한가? | **아니오** — ElevenLabs IVC(이 앱이 만드는 클론, API.md:30)는 생성 계정 전용·공유 불가. voiceId는 앱 계정 API 키로만 유효한 **불투명·계정 스코프 참조**. taker가 문자열을 알아도 자기 계정에서 합성 못 함. |
| voiceId + signedUrl로 사용자2가 **임의 발화**를 사용자1 목소리로 뽑을 수 있나? | **아니오** — signedUrl은 프롬프트가 서버 잠금된 시나리오 **에이전트**용(ADR-0004), 15분 만료, 에이전트 매개 speech-to-speech라 사용자2가 "이 문장을 말해"로 임의 TTS를 못 뽑는다(인젝션 방어). 얻는 건 각본된 롤플레이뿐 = 동의한 체험 그 자체. |
| voiceId 문자열 노출이 주는 **한계 추출능력**은? | **~0** — 동의한 통화가 이미 그 목소리를 사용자2 귀·브라우저에 재생한다("들으면서 녹음" 리스크는 문자열 노출과 무관하게 통화 자체에 내재). 불투명·계정 스코프 참조 1개가 추가로 여는 추출 능력은 없다. |

즉 §14.2가 진짜 막으려던 것(오디오 바이트 추출 + 앱 외부 재사용)은 **여전히 완전 차단**이고, 이 예외가 내주는 것은 그 둘 중 어느 것도 가능케 하지 않는 불투명 참조다. 발급 게이트·단일 taker·15분 만료·계정 스코프가 노출 창을 최소화한다.

### 구현 지침 (implementer — 판단 여지 없이 실행 가능)
파일: `functions/src/realtime/index.ts` (challenge 분기 하류, L86–105).
1. **성공 경로(L86–92):** `provider.createCallCredentials(...)` 반환 후 그대로 반환하지 말고 — `session.challengeId`가 있고 `credentials.provider !== "elevenlabs"`이면 `{ ...credentials, voiceId: "" }`로 반환. (elevenlabs면 credentials.voiceId 유지 = 라이브 override에 필요.)
2. **catch 폴백(L96–104):** provider가 "none"이므로 challenge 세션은 voiceId 노출 불요. L101 `voiceId: effectiveVoiceId` → `voiceId: session.challengeId ? "" : effectiveVoiceId`.
3. **정상 세션(challengeId 부재): 무변경** — 소유자가 자기 voiceId를 받는 것은 §14.2 위반 아님(교차 사용자 수신자 없음, 계정 스코프 참조).
- 변경 없음: `callTypes.ts`(voiceId 필드 유지 — 조건부로 채워짐), `elevenLabsProvider.ts`(라이브 경로엔 voiceId 정당 반환), `mockProvider.ts`(블랭킹은 challengeId를 아는 유일 지점인 index.ts 오케스트레이션 층에서 강제). 클라(`RealtimeVoiceSession.tsx`·`play/page.tsx`) 무변경 — elevenlabs 경로에서만 voiceId를 이미 소비.
- **QA 재검증 기준:** seed challenge를 (a) ElevenLabs 설정 有 → 사용자2 `createRealtimeCall` 응답 `provider==="elevenlabs"`·`voiceId===challenge.voiceId`(라이브 통화 정상), (b) ElevenLabs 설정 無/발급 실패 → `provider==="none"`·`isMock:true`·**`voiceId===""`**(노출 0, 텍스트 폴백 정상). 정상(비challenge) 세션은 (a)/(b) 모두 종전과 동일.

### 정상 세션 자기-노출 (범위 밖·비차단·로그만)
정상 세션은 소유자에게 **자기** voiceId를 반환한다 — 사용자1이 자기 네트워크 트래픽에서 자기 voiceId를 볼 수 있으나 (i) 교차 사용자 수신자 없음, (ii) 계정 스코프 참조라 앱 밖 재사용 불가, (iii) 오디오 다운로드 경로 없음 → **§14.2 위반 아님**(§14.2의 취지는 타인으로부터 사용자1 보호). T38 게이트 범위 밖. 장래 opaque voice 핸들(ElevenLabs가 지원 시)로 정상 세션까지 참조를 불투명화하는 강화는 선택적 후속 지점으로만 기록.
