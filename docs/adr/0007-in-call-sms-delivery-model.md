# ADR-0007: 통화 중 문자(in-call SMS) 도착 신호 전달 모델 — 앱 오케스트레이션

- Status: accepted
- Date: 2026-07-25
- Owner: architect
- DECISIONS.md entry: #32
- 관련: UX.md UF-008 · UX-027 · D-35~D-38 / Architecture.md §15.1 / OQ-U16
- 관계: DECISIONS #15(sentinel 토큰 = 에스컬레이션 트리거)를 **뒤집지 않는다** — #15는 텍스트 채널에서 계속 유효하며, 본 ADR은 sentinel이 **구조적으로 성립하지 않는 실시간 음성 채널**에 대한 별도 결정이다.

## Context

UX v1.11(D-35~D-38)은 "전화를 끊지 않은 채 사기범이 보낸 문자(계좌·링크·인증번호)를 확인하는" 경험을 요구한다. 이는 사용자 신고 두 건 — *"돈·계좌를 문자로 보내는 흐름을 통화 유지한 채 겪게 해달라"*, *"화면에 뜨는 인증번호를 불러달라는데 아무것도 보이는 게 없다"* — 에서 나왔다.

기존 코드베이스에는 유사 선례가 있다: 메신저 채팅의 스미싱 링크는 역할극 LLM의 **어시스턴트 완성 텍스트**에 실린 `[[LINK:id]]` 마커를 서버가 스캔·제거하고 구조화 `attachments`로 변환해 내려준다(`functions/src/roleplay/linkMarker.ts`, §13.2/13.4). UX는 이 패턴의 확장을 권고했다.

그러나 통화(UX-014)의 주 경로는 **Gemini Live speech-to-speech**이며, 여기에는 그 패턴의 전제가 없다:

- 응답 모달리티가 오디오로 고정돼 있다 — `responseModalities: [Modality.AUDIO]`(`functions/src/realtime/geminiProvider.ts:76`).
- 클라이언트는 오디오 청크와 전사(`outputTranscription`)만 받는다(`src/lib/realtime/GeminiVoiceSession.tsx:279-321`).
- 전사는 통화 **종료 직전 일괄** 제출된다(`src/app/session/play/page.tsx:115-124`, `functions/src/realtime/submitTranscript.ts`).
- 즉 **서버가 사기범 텍스트를 중간에 손에 쥐는 지점이 존재하지 않는다.** 모델 출력에 마커를 넣으면 제거할 기회가 없고, 모델은 그것을 **소리 내어 읽는다.**

또한 `/session/play`와 `/session/messenger`는 별도 라우트라, 문자를 보러 이동하면 통화 컴포넌트가 언마운트되어 실시간 세션·마이크·타이머가 끊긴다(D-35의 출발점).

## Decision

**문자 도착은 "서버가 소유한 문자 카탈로그 + 턴 경계 트리거"로 앱이 전달하고, 사기범의 '문자 보냈어요' 대사는 그 순간 주입되는 1줄 지시로 유도한다. 오버레이는 라우트가 아니라 같은 컴포넌트 트리의 형제 노드로 렌더한다.**

| Option | Pros | Cons |
|---|---|---|
| **앱 오케스트레이션(채택) ✅** — 카탈로그의 `afterScammerTurns`에 도달하면 앱이 문자를 도착시키고, 서버가 준 `announceInstruction`을 같은 Live 세션에 텍스트 턴으로 주입해 캐릭터가 알리게 한다 | **도착이 결정론적으로 보장**되어 UF-008 Failure (a)("말은 했는데 문자가 안 옴")가 구조적으로 사라짐. 신규 메커니즘 0 — 기존 `sendClientContent` 텍스트 턴 주입(선례 `OPENING_TRIGGER_TURN`)과 Firestore 구독만 재사용. 프로바이더 중립. 콘텐츠가 13개 프롬프트에 마커를 심을 필요 없음. 테스트 결정론적 | **인과가 역전**된다(앱이 보내고 모델에게 알리라고 시킴). 모델이 지시를 무시하면 "문자는 왔는데 언급이 없는" 반대 실패가 남음. D-36이 적은 *메커니즘*(사기범 턴에 실린 마커)과 다름(의도 — "UX는 서버가 준 구조만 렌더"—는 충족) |
| sentinel 마커 `[[SMS:id]]`를 실시간 경로에도 적용 | D-36 문면 그대로. `[[LINK:]]`와 완전 대칭 | **불가능** — 서버가 텍스트를 보는 지점이 없어 제거할 수 없고 **모델이 마커를 낭독**한다(위 Context 실측). 몰입 파괴 |
| Gemini Live function calling(`tools`)로 도구 호출 신호 | 음성으로 새지 않는 진짜 out-of-band 신호 | 의도적으로 잠근 `tools: []` 보안 설계를 건드림(`geminiProvider.ts:122-123`). DECISIONS #15가 기각한 배선 복잡도를 **프로바이더별로**(ElevenLabs client tools는 규약이 다름) 되살림. `toolResponse` 왕복을 오디오 루프에 넣어야 함. **그러고도 도착을 보장 못 함**(모델이 안 부르면 문자가 영영 안 옴) |
| 전사(transcript)를 실시간 제출해 서버가 "문자 보냈다" 문구를 탐지 | 대사와 완벽 동기 | **자유텍스트 분류** — AC-024·D-36이 금지한 바로 그것. 오탐/미탐이 안전 문화에 구멍을 냄 |
| 별도 라우트(`/session/sms`)로 문자함 이동 | 구현 단순 | 통화 컴포넌트 언마운트 → **실시간 세션·마이크·타이머 소실**. 이 기능의 존재 이유가 사라짐(D-35 하드 금지) |

부수 결정(같은 맥락이라 함께 못박는다):

1. **문자는 `sessions/{sid}/inCallSms` 서브컬렉션에 둔다. `messages`에 넣지 않는다.** `analyzeConversation`이 `messages`를 scammer(i) ↔ user(i+1)로 짝지어 속은 순간을 판정하므로(`functions/src/report/analyzeConversation.ts:127-154`), 문자 행을 끼우면 짝짓기가 어긋나 **리포트 판정이 손상된다**(AC-008/009/026 회귀).
2. **`MessengerAttachment`는 무변경.** 인증번호형은 링크가 아니라 표시용 코드라 `{kind:"link",displayText,fakeLandingId,harmless}`에 담기지 않는다 — 억지 확장은 "link인데 fakeLandingId가 없는" 부재-오버로드를 만든다(§14.8.1/§14.9.1이 반복 기각한 안티패턴). 별도 타입 `InCallSmsDoc`을 둔다.
3. **`url`/실 URL 필드는 어떤 스키마에도 도입하지 않는다.** 링크는 `linkDisplayText` + `fakeLandingId`로만 표현하고 기존 인앱 가짜 랜딩(`src/components/MessengerFakeLanding.tsx`)을 무개정 재사용한다(AC-032/045의 구조적 금지 — AC-023 송금 금지와 동형).
4. **오버레이 열림 = 마이크 입력만 정지**(`muted || overlayOpen`). 사기범 오디오 재생·경과 타이머·세션 한도·소켓은 **멈추지 않는다**(통화가 살아 있다는 것이 이 기능의 전부).
5. **오버레이 안에 자체 "훈련 종료" 컨트롤을 둔다.** 포커스 트랩이 통화 셸 하단의 종료 버튼을 가두면 AC-006 위반이다(선례: `MessengerFakeLanding.tsx:50`).

## Consequences

- **Positive**
  - UX가 지목한 진짜 실패("문자 보냈어요"만 나오고 문자가 안 옴)가 **구조적으로 불가능**해진다.
  - 신규 외부 의존성·신규 프로토콜 0. 기존 Firestore 구독(DECISIONS #12)·기존 텍스트 턴 주입·기존 가짜 랜딩 컴포넌트만 조합한다.
  - 문자 내용이 **100% 서버 카탈로그**에서만 나오므로 LLM이 실계좌·실 URL·실 인증번호를 만들어낼 경로가 없다(AC-005/013/032/033).
  - 실시간·폴백 두 경로가 **같은 컬렉션 하나**를 쓰므로 화면 코드가 갈라지지 않는다.
- **Negative / accepted trade-offs**
  - 인과 역전. 모델이 announce 지시를 무시하면 문자만 도착한다 — 배너·aria-live·문자함으로 학습 가치는 보존되지만 대사와의 자연스러움은 모델 협조에 의존한다(**추정** — 실 모델로 라이브 검증 필요).
  - 트리거 카운팅(몇 번째 사기범 턴인가)이 실시간 경로에서는 클라에 있다. 이는 §13.5 스킨과 같은 **프레젠테이션 층위**이며 안전 판정을 게이팅하지 않는다(서버가 `smsId` 소속을 재검증하므로 위조의 최대 효과는 "자기 훈련용 모의 문자를 조금 일찍 보는 것"뿐).
  - D-36이 적은 *메커니즘*(사기범 턴에 실린 마커)과 다르다. **의도**(UX는 서버가 준 구조만 렌더·자유텍스트 미분류)는 충족하지만, ux-design이 D-36 문면을 갱신할지는 별도 판단 사항으로 남긴다.
- **Follow-ups required**
  1. `functions/src/roleplay/promptAssembly.ts:45`의 "**이 앱 화면에 없는 것을 가리키지 않는다**"(인증번호 요구 금지) 항목을 조건형으로 교정 — 안 고치면 기능을 다 만들어도 사기범이 인증번호를 요구하지 않아 **발동하지 않는다**.
  2. `deliverInCallSms`가 `smsId ∈ IN_CALL_SMS[session.scenarioId]`를 재검증(누락 시 임의 문자 주입 경로).
  3. 오버레이 구현 시 early return·신규 라우트·`key` 변경 금지(위반 시 통화 단절).
  4. planner: 이 능력을 규정하는 PRD AC 신설(OQ-U15) — 현재 재사용 AC로만 추적되고 있어 DoD 기준이 비어 있다.
