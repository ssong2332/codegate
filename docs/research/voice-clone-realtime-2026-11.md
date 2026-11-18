# 배포 웹 실시간 통화를 복제 목소리로 — 방식 비교 (2026-11-19)

## 금지 · 범위
- 설계 비교 문서입니다. **코드는 바꾸지 않았습니다.** 실 키 호출, 외부 서비스로 음성 · 데이터 전송, VoiceStudio 생성 · 복제는 하지 않았습니다.
- 지연 · 비용 수치는 **측정값이 아닙니다.** 출처가 있는 값은 출처 값, 그 밖은 모두 **추정**입니다. 예외로, 이 저장소에서 예전에 실측한 값(2026-10-20 음성 프로토타입 · 2026-11-08 `live-mic-probe`)은 그렇다고 표시했습니다.
- ⚠️ 이미 내려진 사용자 결정(2026-10-20): **"ElevenLabs는 실서비스에 쓰지 않는다(월 1만 크레딧 안에서 측정용으로만)."** 아래 안 A에서 ElevenLabs는 비교 기준으로만 둡니다.

## 0. 지금 상태 (코드 근거)
| 항목 | 현재 | 근거 |
|---|---|---|
| 복제 공급자 | 항상 Mock. 계약은 ElevenLabs 기준(`createClone` · `synthesize` · `deleteVoice`, 결과마다 `isMock`) | `functions/src/voice/provider.ts:70` |
| 실시간 통화 음성 | Gemini Live 기본 음성(`prebuiltVoiceConfig`). 클론 voiceId는 빈 값으로 돌려준다 | `functions/src/realtime/geminiProvider.ts:264-273` · `:378-380` |
| Live 출력 | `responseModalities: [AUDIO]` · 출력 전사(`outputAudioTranscription`) 켬 | `geminiProvider.ts:261` · `:282` |
| gemini-3.8-live TEXT 출력 | 지원 안 함 → 다른 TTS를 쓰려면 Live 음성을 버리고 출력 자막만 써야 한다 | 2026-10-20 프로토타입 기록(사용자 메모 · 미커밋 `prototypes/voice-cascade/`) |
| 예전 혼합안 실측 | Live 자막 → 문장 단위 Chirp: 첫소리 중앙값 **약 1.3초**(6/6). Live 단독 약 1.7초 · Live + 말투 지시 약 1.1초 | 같은 기록(실측) |
| 복제 음성을 쓰는 통화 | 자녀 사칭 목소리 복제 세션의 **짧은 통화 한 번뿐**(A2 ㉢). 울먹이며 한두 마디 → 늦어도 상대 두 번째 말에서 포기 끊기 | `docs/research/child-clone-short-call-2026-11-01.md` · `functions/src/scenarios/escalation.ts:64` |
| 폐기 | 세션 종료 트리거가 `users/{uid}/sessions/{sid}/**` Storage 삭제 + `deleteVoice(voiceId)` 1회(선점 `purgeClaimedAt`) | `functions/src/guardrails/purge.ts:55-94` · `:108-121` |
| 로컬 VoiceStudio | omnivoice 0.5.8 · **CPU** · 사용자 PC. 배포 웹에서 닿지 않는다 | 과제 배경 |

⇒ **결론부터:** 지금 제품에서 복제 목소리가 들리는 곳은 "짧은 통화 한 번(2~3마디)"뿐입니다. 긴 실시간 대화 전체를 복제 목소리로 바꿀 필요는 아직 없습니다.

## 1. 판정 기준표 (안을 고를 때 이 순서로만 본다)
| # | 기준 | 탈락 조건 |
|---|---|---|
| K1 | 배포 웹(정적 Hosting + Functions)에서 동작 | 사용자 PC 등 배포 밖 자원 필요 |
| K2 | 사용자 결정 · 라이선스 | 결정(ElevenLabs 실서비스 금지)이나 가중치 라이선스와 충돌 |
| K3 | 세션 종료 시 외부 잔존 0을 확인할 수 있음 | 삭제 수단이 없거나 보존 여부를 확인할 길이 없음 |
| K4 | 첫 음성 지연 | 지금 Live(약 1.1~1.7초)보다 체감이 크게 나빠짐(추정 2초 초과) |
| K5 | 기존 Live 파이프라인 변경량 · 세션당 비용 | 동점일 때만 본다 |

## 2. 안 A — 관리형 스트리밍 TTS 복제 + Live는 자막만
**구성:** 참가자 녹음 → 공급자 즉시 복제(voiceId 또는 key) → 통화 중 Live는 듣고 · 생각하고 · 도구를 부르기만 하고, 클라가 Live 출력 오디오를 버린 뒤 출력 전사를 TTS 스트림에 흘려 재생.

| 후보 | 한국어 | 스트리밍 | 브라우저 직접 연결 | 비고 |
|---|---|---|---|---|
| ElevenLabs IVC + Flash v2.5 | 지원(`ko`, [models](https://elevenlabs.io/docs/models)) | WebSocket `…/v1/text-to-speech/{voice_id}/stream-input`([문서](https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input)) | `single_use_token` 쿼리 파라미터가 스키마에 있음(브라우저용이라는 설명은 없음) | ⛔ 사용자 결정으로 실서비스 불가 |
| Google Chirp 3 즉석 커스텀 음성 | ko-KR 지원([문서](https://docs.cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice)) | `StreamingSynthesize` + `voice_clone` 지원(같은 문서) | 불가 — gRPC라 서버 중계 필요(2026-10-20 기록) | ⚠️ **허용 목록 사용자만**("contact a member of the sales team") |

**첫 음성 지연 (추정):**
- Live 첫 출력 전사 도착 ≈ Live 첫 오디오와 비슷하다고 보면 약 1.1초(말투 지시 포함 실측값을 빌림).
- \+ TTS 첫 바이트: ElevenLabs 동북아 150~200ms([지연 문서](https://elevenlabs.io/docs/eleven-api/guides/how-to/best-practices/latency-optimization)) · 제3자 측정 중앙값 197ms(북미 · [Vapi](https://humannessindex.vapi.ai/models/elevenlabs-flash-v2-5)). Chirp는 미측정.
- \+ 문장 단위로 끊으면 첫 문장이 끝날 때까지의 대기.
- ⇒ **약 1.3~1.6초(추정).** 예전 Chirp 혼합안 실측 중앙값 1.3초와 같은 범위. Chirp 스트림은 5초 무입력이면 끊겨 문장마다 다시 열어야 하고 첫 연결이 10초 이상 걸릴 수 있어 미리 데워야 한다(같은 기록).

**Live 파이프라인 변경 (큼):**
| 부분 | 영향 | 파일 |
|---|---|---|
| 재생 | Live 오디오 재생을 끄고 TTS 오디오 재생으로 교체. 음량 정규화도 TTS 쪽으로 | `src/lib/realtime/GeminiVoiceSession.tsx`(재생 큐 `:603` 부근) · `src/lib/realtime/loudnessNormalizer.ts` |
| 반이중 | "사기범이 말하는 중" 판정이 Live 오디오가 아니라 **TTS 재생 시간**을 따라야 한다. Live는 자기 턴이 끝났다고 보는데 TTS는 아직 재생 중인 구간이 생긴다 → 그동안 마이크 프레임을 계속 막아야 자기 끊김(스피커 잔향)이 안 생긴다 | `src/lib/realtime/agentSpeechGate.ts` |
| 끼어들기 | Live `interrupted` 이벤트에서 TTS 재생 중지 + 스트림 닫기/비우기를 같이 해야 한다. 반대로 TTS가 아직 재생 중일 때 참가자가 말하면 Live는 이미 턴이 끝난 상태라 `interrupted`가 안 올 수 있다 → 클라가 직접 TTS를 끊는 규칙 필요 | `GeminiVoiceSession.tsx:926-978` |
| 자막 · 전사 | 출력 전사가 그대로 원천이라 자막 · 저장 전사는 유지된다. **장점:** 실존 기관명 가드(`liveTranscriptGuard`)를 TTS 입력 전에 걸 수 있어, 지금은 소리로 나가 버리는 실존 은행명을 소리에서도 막을 수 있다 | `src/lib/realtime/liveTranscriptGuard.ts` · `functions/src/realtime/liveTranscriptGuard.ts` |
| 도구 호출 | `end_call` · 문자 도구는 Live가 그대로 부른다. 단 끊기는 **TTS 재생이 끝난 뒤**로 미뤄야 마지막 말이 잘리지 않는다 | `src/lib/realtime/toolTurnTranscript.ts` · `functions/src/scammerHangup/commit.ts` |
| 토큰 | `speechConfig`는 남겨도 무해(어차피 버림). Chirp면 서버 중계(Cloud Run — Functions는 장시간 WebSocket 부적합, 추정)를 새로 둔다 | `functions/src/realtime/geminiProvider.ts:247-363` |

**세션당 비용 (추정):** Live 음성 출력 과금은 그대로 남고(버려도 생성됨) TTS가 더해지는 **이중 과금**.
- ElevenLabs Flash API $0.04 / 1천 자([가격](https://elevenlabs.io/pricing/api)). 짧은 통화(약 150자) ≈ $0.006, 10분 긴 통화(사기범 발화 약 2,000~3,000자 추정) ≈ $0.08~0.12.
- Chirp 즉석 커스텀 음성: 가격 페이지를 읽지 못함(미확인). 확인: [가격 페이지](https://cloud.google.com/text-to-speech/pricing).
- Chirp 중계용 Cloud Run 상시 인스턴스 비용 별도(추정 · 미산정).

**동의 · 폐기:**
- ElevenLabs: `DELETE /v1/voices/{voice_id}`([문서](https://elevenlabs.io/docs/api-reference/voices/delete))가 `VoiceProvider.deleteVoice`와 1:1. `purge.ts`의 `elevenlabs_voice` target 그대로. 생성 응답에 `requires_verification`이 있어 검증 대기로 복제가 막힐 수 있다. 기본 데이터 보관은 미국 · 무보존 모드는 선택 · 요금제 조건 미확인([데이터 거주](https://elevenlabs.io/docs/overview/administration/data-residency.md)).
- Chirp: 동의문을 **정해진 문장 그대로** 녹음해야 한다(한국어: "나는 이 음성의 소유자이며 구글이 …"). 동의 기록으로는 강하다. 복제 결과는 **클라이언트가 보관하는 문자열 key**라 우리 쪽 key 삭제 = `deleteVoice`. 다만 Google이 참조 · 동의 음성을 key 생성 뒤 보존하는지는 문서에 없고 삭제 API도 없다 → **K3 미확인**.

**규칙 충돌:**
- 실존 기관명: Chirp 동의문에 실제 회사명 "구글"이 들어간다. 세션 밖(시작 전 동의 화면)이라 시나리오 금지 대상은 아니지만, 고지 문구 검사가 있는지 확인 필요(추정).
- G437(세션 화면 '모의' · '훈련용' 0): 합성 표식 `syntheticLabel: "AI 훈련용 합성"`(`provider.ts`)을 통화 화면에 띄우면 충돌. 표식은 시작 전 고지 · 리포트에만 둔다.

## 3. 안 B — VoiceStudio/OmniVoice 자체 호스팅 (Cloud Run GPU)
| 항목 | 내용 | 근거 |
|---|---|---|
| 모델 | 0.6B · 확산 언어 모델 방식 · 32단계(16단계 빠름) · 24kHz · 한국어 학습 약 8,609시간 | [GitHub README](https://github.com/k2-fsa/OmniVoice) · [모델 카드](https://huggingface.co/k2-fsa/OmniVoice) |
| 스트리밍 | **문서에 없음.** 출력은 발화 단위 배열 → 문장 통째 생성 | 같은 README |
| 속도 | H100 · fp16 · 32단계 · 배치 1 RTF 0.0899(가속 0.0367). L4 수치 없음 | 같은 README |
| 서버 | HTTP API 없음(Python API · CLI · Gradio 데모만) → 서버를 직접 만들어야 한다 | 같은 README |
| ⛔ 라이선스 | 코드 Apache 2.0, **가중치 CC-BY-NC(비상업)** | 같은 README |
| GPU 비용 | Cloud Run L4 약 $0.0001867/초(≈ $0.67/시간, 비중복) · GPU 무료 구간 없음 | [Cloud Run GPU](https://docs.cloud.google.com/run/docs/configuring/services/gpu) · [가격 해설](https://www.gmicloud.ai/en/blog/cloud-run-gpu-pricing-explained) |
| 콜드 스타트 | 드라이버 포함 인스턴스 시작 약 5초 + 모델 적재. 0에서 시작해 첫 토큰까지 gemma3:4b 약 19초 사례 | 같은 Cloud Run 문서 · [GA 블로그](https://cloud.google.com/blog/products/serverless/cloud-run-gpus-are-now-generally-available) |

**첫 음성 지연 (추정):** 실시간 대화에 쓰면 Live 첫 문장 전사 약 1.1초 + 문장 통째 생성(L4는 H100보다 3~5배 느리다고 보면 3초짜리 문장에 약 0.8~1.4초) ⇒ **약 2~2.5초(추정)**, 콜드면 +20초 안팎. **K4 탈락.** 확인 방법: 아래 실측 계획 M3.

**Live 파이프라인 변경:** 안 A와 같다(재생 교체 · 반이중 · 끼어들기 · 끊기 지연) + GPU 서비스 신설 · 인증 · 동시성. 스트리밍이 없어 끼어들기 때 버리는 생성분이 더 크다.

**세션당 비용 (추정):** 상시 1대 유지 시 L4 약 $480/월(세션 수와 무관). 0까지 줄이면 세션당 몇 센트지만 콜드 스타트를 통화에서 그대로 겪는다.

**동의 · 폐기:** 참조 음성을 요청마다 넘기고 서버에 저장하지 않으면 외부 잔존 0을 우리가 보장할 수 있다(가장 강함). `deleteVoice`는 no-op, 참조 음성은 이미 Storage `users/{uid}/sessions/{sid}/` 아래라 `purge.ts` ①이 지운다.

**규칙 충돌:** CC-BY-NC — 이 서비스가 비상업인지 판단이 필요(법무 · 사용자 결정). 모델 면책 조항이 사칭 · 사기 용도를 금지하므로 "훈련 목적"임을 기록으로 남겨야 한다(추정 · 법무 확인).

## 4. 안 C — Live 음성 유지 + 짧은 통화 대사만 미리 생성
**구성:** 목소리 복제가 끝나면(메신저 대화 단계 — 통화까지 수 분이 있다) 짧은 통화 대사 2~3줄을 복제 목소리로 **미리 합성**해 세션 Storage에 저장. 짧은 통화는 그 클립을 재생한다. 그 밖 통화(다른 시나리오 · 긴 통화)는 지금처럼 Live 기본 음성.

| 갈래 | 동작 | 장단 |
|---|---|---|
| C1 대본 재생 | 클립 1 재생 → 참가자 말 끝(클라 음성 감지 또는 최대 대기) → 클립 2 → 포기 끊기 | Live 0 · 가장 단순. 참가자 말은 전사되지 않는다 |
| C1b 대본 재생 + Live 듣기만 | 위와 같되 Live를 입력 전사 전용으로 열고 출력 오디오는 버림 | 리포트용 참가자 전사 유지 · Live 비용 남음 |

**첫 음성 지연:** 클립이 이미 있으므로 **재생 시작 지연 ≈ 0**(Storage 서명 URL 미리 받아 둠). 생성 지연 · 콜드 스타트는 메신저 단계 뒤로 숨는다. 생성이 통화 전까지 안 끝나면 → 지금처럼 Live 기본 음성 짧은 통화로 폴백(새 판정표 행 필요).

**Live 파이프라인 변경 (작음):**
| 부분 | 영향 | 파일 |
|---|---|---|
| 서버 | 복제 완료 시 `synthesize()`로 대사 2~3개 생성 → `VoiceSynthesisResult.audioUrl`(이미 있는 계약) | `functions/src/voice/provider.ts` · `functions/src/voice/index.ts` |
| 짧은 통화 규칙 | 대사를 모델이 즉흥으로 만들던 것을 고정 대본으로. 규칙(계좌 · 금액 · 앱 설치 · 신분증 말하지 않기)을 대본 검사로 옮김 | `functions/src/realtime/priorChatContext.ts` · `functions/src/scammerHangup/decide.ts`(`shortCloneCall`) |
| 클라 | 짧은 통화일 때만 클립 재생 경로. 끼어들기 · 도구 호출 · 반이중은 C1이면 해당 없음, C1b면 출력 오디오만 끄면 됨 | `src/lib/realtime/GeminiVoiceSession.tsx` · `src/app/session/play/page.tsx` |
| 자막 | 대본 문장을 그대로 자막 · 전사에 넣는다(실존 기관명 0을 대본 단계에서 검사) | `liveTranscriptGuard.ts`(두 곳) |

**세션당 비용 (추정):** 약 150자 1회 생성. ElevenLabs 단가 기준 약 $0.006. 공급자는 실시간 스트리밍이 필요 없어 **비스트리밍 일괄 합성이면 무엇이든** 된다 — Chirp 즉석 커스텀 음성, 또는 자체 호스팅 OmniVoice를 **Cloud Run Job(0까지 축소)**으로 돌려 콜드 스타트를 메신저 단계에 숨김(GPU 1회 1~2분 ≈ $0.01~0.02 추정).

**동의 · 폐기:** 클립을 `users/{uid}/sessions/{sid}/` 아래에 두면 지금 `purge.ts` ①이 그대로 지운다. 외부 voice가 생기는 공급자면 `deleteVoice` ②로. 자체 호스팅이면 외부 잔존 0.

**규칙 충돌:** 대본이 고정이라 실존 기관명 · G437 검사를 **생성 전에** 걸 수 있다(가장 유리). 대본 다양성이 낮아 반복 체험 때 같은 말이 나온다(대본 3~5벌 중 고르기로 완화).

## 5. 비교 요약
| 기준 | A 관리형 스트리밍 | B 자체 호스팅 실시간 | C 짧은 통화 사전 생성 |
|---|---|---|---|
| K1 배포 웹 | ○(Chirp는 중계 서버 필요) | ○(GPU 서비스 신설) | ○ |
| K2 결정 · 라이선스 | ElevenLabs ⛔ · Chirp 허용 목록 필요 | CC-BY-NC ⚠️ | 공급자 선택에 따름 |
| K3 외부 잔존 0 확인 | ElevenLabs ○ · Chirp 미확인 | ○ | ○(자체 호스팅이면 가장 강함) |
| K4 첫 음성 | 약 1.3~1.6초(추정) | 약 2~2.5초 + 콜드(추정) ✗ | ≈ 0(사전 생성) |
| K5 Live 변경 | 큼(재생 · 반이중 · 끼어들기 · 끊기) | 큼 + GPU 운영 | 작음(짧은 통화 경로만) |
| 세션당 비용 | Live + TTS 이중 과금 | 상시 GPU 또는 콜드 | 1회 약 150자 |
| 복제가 들리는 범위 | 모든 통화 | 모든 통화 | 짧은 통화(지금 복제가 쓰이는 유일한 곳) |

## 6. 추천: **안 C (짧은 통화 대사 사전 생성)**
- 지금 제품에서 복제 목소리가 필요한 곳은 A2 ㉢ 짧은 통화뿐이고, 그 통화는 원래 "울먹이며 한두 마디 뒤 끊기"라 대본으로 충분합니다.
- 첫 음성 지연 문제가 사라지고, Live 파이프라인(끼어들기 · 반이중 · 도구 호출)을 건드리지 않습니다.
- 생성이 일괄이라 공급자 선택이 넓어집니다. ElevenLabs 금지 결정을 지키면서도 Chirp 즉석 커스텀 음성이나 자체 호스팅 OmniVoice(Job)를 쓸 수 있습니다.
- 긴 통화 전체를 복제 목소리로 바꾸는 일(안 A)은 복제를 쓰는 시나리오가 늘어날 때 다시 봅니다.

**사용자 결정이 필요한 것 (구현 전):**
| # | 결정 | 선택지 |
|---|---|---|
| D1 | C의 합성 공급자 | ① Chirp 즉석 커스텀 음성(허용 목록 신청 필요) ② 자체 호스팅 OmniVoice Cloud Run Job(CC-BY-NC 판단 필요) |
| D2 | 참가자 말 전사 | C1(전사 없음) / C1b(Live 듣기만 · 비용 남음) |
| D3 | 실측에서 ElevenLabs를 쓸지 | 측정 전용 허용 범위(월 1만 크레딧) 안에서 품질 기준선으로만 |

## 7. 최소 실측 계획 (⛔ 실 키 · GPU 과금 — 매번 사용자 승인 필요)
- 목표: 안 C가 성립하는지 — (1) 한국어 울먹이는 짧은 대사를 복제 목소리로 들을 만하게 만드는가, (2) 생성 시간이 메신저 단계(수 분) 안에 끝나는가, (3) 폐기 후 외부 잔존 0을 확인할 수 있는가.
- **참조 음성은 실제 사람 목소리를 쓰지 않습니다.** Windows 한국어 TTS(Microsoft Heami)로 만든 15초 클립을 "가족 목소리"로 씁니다(기존 클립 생성 절차와 같음 — `CLAUDE.md` 'Analyze (입력 음성 쉼)' 행).
- 대사: 고정 3줄(합계 150자 이내 · 실존 기관명 0 · 계좌 · 금액 · 앱 · 신분증 언급 0).

| # | 측정 | 세션 · 호출 | 비용 상한 | 판정 |
|---|---|---|---|---|
| M1 | 품질 기준선: ElevenLabs IVC 생성 → 3줄 합성 → `DELETE /v1/voices/{id}` → 같은 id 조회가 404인지 | 복제 1 · 합성 3 · 삭제 1 · 조회 1 | 600자 · 기존 크레딧 안($0.03 이하) | 생성 시간 · 삭제 후 404 |
| M2 | D1-① Chirp 즉석 커스텀 음성 — **허용 목록 승인이 난 경우에만** | key 생성 1 · 합성 3 | 600자(단가 미확인 — 승인 전에 가격 확인) | 생성 시간 · 청취 |
| M3 | D1-② OmniVoice Cloud Run **Job** L4 · 0에서 시작 · 3줄 생성 · 종료 | Job 실행 2회(콜드 1 · 연속 1) | GPU 15분 이내 ≈ $0.2 + 이미지 빌드 · 저장 | 콜드 포함 총 시간 · RTF |
| — | 합계 | 실측 3묶음 | **$5 이하** | 사용자 청취 비교(3묶음 × 3줄) |

**명령 초안 (스크립트는 아직 없음 — 구현 승인 뒤 작성):**
```powershell
# 0) 참조 클립 (오프라인 · 과금 0) — 기존 Heami 절차로 ref.wav + lines.json
# M1 · M2 (실 키 — 승인 필요)
npm --prefix functions run build
node scripts/voice-clone-short-call-probe.mjs --provider elevenlabs --secret "C:/Projects/codegate/functions/.secret.local" --key-var ELEVENLABS_API_KEY --ref <스크래치>/ref.wav --lines <스크래치>/lines.json --out <스크래치>/m1 --max-chars 600 --delete-after
node scripts/voice-clone-short-call-probe.mjs --provider chirp-icv --ref <스크래치>/ref.wav --consent <스크래치>/consent-ko.wav --lines <스크래치>/lines.json --out <스크래치>/m2 --max-chars 600
# M3 (GPU 과금 — 승인 필요)
gcloud run jobs deploy omnivoice-probe --image <이미지> --gpu 1 --gpu-type nvidia-l4 --region <L4 지원 리전> --task-timeout 15m --max-retries 0 --no-gpu-zonal-redundancy
gcloud run jobs execute omnivoice-probe --wait --args="--ref,gs://<임시 버킷>/ref.wav,--lines,gs://<임시 버킷>/lines.json"
gcloud run jobs delete omnivoice-probe --quiet
```
- 스크립트 규칙(기존 프로브와 같음): 429면 `STOP-429` 파일로 즉시 멈춤 · `--max-chars` 넘으면 호출 전 거절 · 결과는 스크래치 폴더에 wav + 시간 json.
- Chirp는 동의문 음성이 필요합니다. Heami로 정해진 한국어 문장을 읽힌 클립이 동의로 인정되는지(실제 소유자 동의가 아님)는 **허용 목록 승인 시 Google에 확인할 사항**입니다.

## 8. 남은 것 · 확인 안 한 것
- Chirp 3 HD · 즉석 커스텀 음성 단가: 가격 페이지를 못 읽음.
- ElevenLabs IVC가 어느 요금제에서 되는지 · 동의 정책: 읽은 문서에 없음.
- OmniVoice L4 속도 · 필요 VRAM: 문서에 없음(H100 수치만).
- "재사용" 목소리(`voiceSelectionSource` 재사용)가 세션 사이에 어디에 남는지 — 이번 범위에서 코드 확인 안 함. 안 C를 구현하기 전에 폐기 범위와 맞는지 봐야 한다(`functions/src/realtime/scenarioVoice.ts` · `functions/src/realtime/index.ts`).
- VoiceStudio MCP는 이 세션 중 연결이 끊겨 읽기 조회도 하지 못했다(설치 상태는 과제 배경 값을 그대로 씀).
