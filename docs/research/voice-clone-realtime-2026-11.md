# 배포 웹 실시간 통화를 복제 목소리로 — 1차안 VoiceStudio(OmniVoice) 실현 설계 (2026-11-19)

## 금지 · 범위
- 설계 문서입니다. **코드는 바꾸지 않았습니다.** 실 키 호출, 외부 서비스로 음성 · 데이터 전송, VoiceStudio 생성 · 복제는 하지 않았습니다.
- 지연 · 비용 수치는 **측정값이 아닙니다.** 출처가 있으면 출처 값이고, 그 밖은 모두 **추정**입니다. 이 저장소에서 예전에 실측한 값(2026-10-20 음성 프로토타입, 2026-11-08 `live-mic-probe`)은 실측이라고 표시했습니다.
- 우선순위는 사용자 결정(2026-11-19)을 따릅니다. 원문: *"실시간 통화 목소리 복제는 1차적으로는 voicestudio에서 진행할 수 있게 하는 걸로, 차선책이 elevenlabs나 다른 거"*.
  - **1차안:** VoiceStudio(OmniVoice)를 배포 웹에서 실시간으로 씁니다.
  - **차선책:** ElevenLabs 등 관리형 서비스로 넘어갑니다. 넘어가는 기준은 §5 판정표가 정합니다.
- ⚠️ 이전 사용자 결정(2026-10-20)은 *"ElevenLabs는 실서비스에 쓰지 않는다(측정용만)"* 였습니다. 이번 결정이 ElevenLabs를 차선책으로 올렸으므로, 실서비스 전환 시점에 이 결정을 다시 확인해야 합니다(§5 F8).

## ⭐ 0원 제약 (사용자 결정 2026-11-19 — 이 절이 아래 모든 절보다 우선)
원문: *"추천으로 형태로 진행하는데, 과금 요소는 사전에 차단하는 걸로 가고 내가 지출해야 하는 금액은 0원으로 가야 돼"*.

### 과금 요소 차단표
| # | 요소 | 과금 여부 | 처리 |
|---|---|---|---|
| Z1 | Cloud Run **GPU**(L4) | GPU 무료 구간 없음([문서](https://docs.cloud.google.com/run/docs/configuring/services/gpu)) | ⛔ **차단.** 단계 2(GPU 실시간)와 실측 M1 · M2는 보류 |
| Z2 | GCE GPU VM(P3) | 과금 | ⛔ 차단 |
| Z3 | Cloud Run **CPU** | 무료 구간(월 180,000 vCPU-초 · 360,000 GiB-초 · 요청 200만) 안이면 0원. 넘으면 과금. 무료 구간이 모든 리전에 적용되는지는 출처가 서로 다름([가격](https://cloud.google.com/run/pricing) · [해설](https://cloudchipr.com/blog/cloud-run-pricing)) | ⚠️ **조건부.** 무료 구간 리전 · 이미지 크기(Z4)를 확인하기 전에는 배포 금지 |
| Z4 | Artifact Registry(컨테이너 이미지 저장) | 0.5GB까지 무료, 넘으면 GB당 월 $0.10(출처 간 일치, 공식 페이지 미확인) | ⚠️ torch가 든 CPU 이미지는 0.5GB를 넘을 가능성이 크다(추정). 넘으면 **0원 위반** → M0b로 크기를 확인 |
| Z5 | ElevenLabs | 무료 플랜 월 1만 크레딧. 무료 플랜에 즉석 복제가 포함되는지는 출처가 충돌한다(공식 페이지는 포함 · 제3자는 불포함). 무료 플랜은 상업 이용이 불가하다는 데 출처가 일치([공식](https://start.elevenlabs.io/voice-cloning/v5) · [제3자](https://gptprompts.ai/elevenlabs-free)) | ⛔ 실서비스 차단. 측정도 **결제 수단 미등록 무료 계정**일 때만 |
| Z6 | Chirp 3 즉석 커스텀 음성 | 유료이고 허용 목록 사용자만 쓸 수 있다 | ⛔ 차단 |
| Z7 | Gemini Live 실 키 측정(M2 · M3) | 기존 키가 무료 등급인지 미확인 | ⛔ 이번 실측에서 제외 |
| Z8 | Hugging Face 무료 CPU Space | 0원 | ⛔ 참가자 녹음이 외부(HF)로 나간다. 폐기 · 개인정보 범위 밖이라 차단 |
| Z9 | 사용자 PC(VoiceStudio) + 무료 터널 | 0원(전기 제외) | ✅ 허용. 단 §2 P2의 위험이 그대로 남는다 |

⚠️ **GCP 예산 알림은 과금을 멈추지 않습니다.** 알림만 보낼 뿐입니다. 자동으로 멈추려면 프로젝트 결제를 끊어야 하는데, 그러면 이 앱의 Functions · Hosting까지 함께 멈춥니다. 그래서 0원은 다음 세 가지로만 지킵니다. (1) 과금 자원을 **만들지 않는다**(Z1 · Z2 · Z6). (2) 코드에 유료 공급자 경로를 **두지 않는다**(엔진 주소가 없으면 지금 동작 = Live 기본 음성). (3) Z3을 쓸 때는 `--max-instances 1` · `--min-instances 0` · GPU 플래그 없음 · 앱 쪽 일일 생성 상한으로 무료 구간 안에 묶는다.

### 0원 안에서 진행할 형태
| 단계 | 0원 판정 | 형태 |
|---|---|---|
| 단계 1 (짧은 통화 대사 사전 생성) | ✅ 가능 | 엔진 = **사용자 PC의 VoiceStudio/OmniVoice(CPU)**. 배포 웹 → Functions → 무료 터널 → PC 순서로 연결하고, 생성 결과는 세션 Storage에 저장한다. **PC가 꺼져 있거나 90초 안에 생성되지 않으면 → 지금처럼 Live 기본 음성 짧은 통화로 폴백한다(0원).** Z3(Cloud Run CPU)은 M0b 결과가 무료 구간 안이라고 확인된 뒤에만 대체 배치로 쓴다 |
| 단계 2 (모든 통화 실시간) | ⛔ 보류 | CPU로는 실시간이 어렵다(추정 · M0으로 확인). GPU는 Z1로 차단 |
| 차선책(관리형) | ⛔ 보류 | Z5 · Z6. 0원 안에서의 차선책은 **"복제 없이 Live 기본 음성 유지"(지금 동작)** |

### M0 실측 결과 (2026-11-19 · 로컬 VoiceStudio · 0원 · 외부 전송 0)
- 환경: 사용자 노트북 i7-1165G7(4코어 8스레드) CPU. VoiceStudio `check_health` = `{"device": "cpu", "engine": "omnivoice", "version": "0.5.8"}`.
- 목소리: 저장된 목소리가 **영어 데모 음성 `demo0001` 하나뿐**이었다(예전 한국어 복제 음성은 목록에 없다). 이 음성으로 한국어(`language: ko`) 문장을 생성했다. 속도는 화자와 거의 무관하다고 보지만(추정), **한국어 품질 판정(F4)에는 쓸 수 없다.**
- 측정 중 같은 PC에서 다른 Claude 세션들이 작업 중이었다. CPU 경합이 있었을 수 있다(미확인).

| # | 문장 | 단계 | 생성 시간 | 오디오 길이 | RTF | 근거 |
|---|---|---|---|---|---|---|
| 0 | "엄마, 나야." (첫 호출) | 16 | **300초 넘어 도구 시간 초과** | — | — | MCP 오류 "no response or progress for 300s" |
| 1 | "엄마, 나야." | 16 | 173.89초 | 1.43초 | **약 122** | `generation_time_s` · `audio_duration_s` |
| 2 | "엄마, 나 큰일 났어." | 8(가장 빠름) | 115.57초 | 1.66초 | **약 70** | 같은 필드 |

계획한 16회(문장 8 × 단계 2) 중 2회만 측정하고 멈췄다. 이유: 한 줄에 2~3분이 걸려 전체를 돌리면 45분이 넘는데, 아래 판정은 이미 바뀌지 않는다.

**판정표 적용 (§5):**
| # | 조건 | 측정 | 결과 |
|---|---|---|---|
| F1 | 로컬 CPU RTF ≥ 1.0 → 사용자 PC 실시간 탈락 | RTF 70 ~ 122 | ✅ **해당 → 사용자 PC로는 실시간 불가** |
| F6 | 단계 1 생성 > 90초 → 짧은 통화는 Live 기본 음성으로 폴백 | 가장 짧은 한 줄(8단계)만으로 116초. 2~3줄이면 약 4~9분(추정) | ✅ **해당 → 지금 PC 성능으로는 단계 1도 메신저 단계 안에 끝나지 않을 위험이 크다** |
| F4 | 한국어 품질 | 영어 데모 음성이라 판정 보류 | 보류 |

**0원 범위 결론:** 지금 노트북 CPU로는 단계 1(사전 생성)도 단계 2(실시간)도 성립하지 않는다. 0원 안에서 남는 길은 다음과 같다.
| # | 조건 | 다음 |
|---|---|---|
| N1 | PC를 다른 작업 없이 비워 두고 다시 쟀는데 3줄 합계가 90초 이하 | 단계 1을 사용자 PC 엔진으로 진행(M0c 터널 측정 → 구현) |
| N2 | N1도 90초 초과 | 0원 안에서는 **복제 목소리 통화를 열지 않고 Live 기본 음성 유지**(지금 동작). 복제 목소리는 GPU 비용을 허용할 때 다시 본다 |
| N3 | 사용자 PC에 NVIDIA GPU가 생기거나 GPU가 있는 다른 PC를 쓸 수 있음 | M0을 그 PC에서 다시 측정 |

## 0. 지금 상태 (코드 근거)
| 항목 | 현재 | 근거 |
|---|---|---|
| 복제 공급자 | 항상 Mock. 계약은 `createClone` · `synthesize` · `deleteVoice`이고 결과마다 `isMock`이 붙는다 | `functions/src/voice/provider.ts:70` |
| 실시간 통화 음성 | Gemini Live 기본 음성(`prebuiltVoiceConfig`)이고, 클론 voiceId는 빈 값으로 돌려준다 | `functions/src/realtime/geminiProvider.ts:264-273` · `:378-380` |
| Live 출력 | `responseModalities: [AUDIO]`로 받고 출력 전사를 켜 둔다 | `geminiProvider.ts:261` · `:282` |
| gemini-3.8-live TEXT 출력 | 지원하지 않는다. 다른 TTS를 쓰려면 Live 음성을 버리고 출력 자막만 써야 한다 | 2026-10-20 프로토타입 기록(미커밋 `prototypes/voice-cascade/`) |
| 예전 혼합안 실측 | Live 자막을 문장 단위로 Chirp에 넘긴 경우 첫소리 중앙값 **약 1.3초**(6/6 성공). Live 단독은 약 1.7초, Live + 말투 지시는 약 1.1초 | 같은 기록(실측) |
| 복제 음성을 쓰는 통화 | 지금은 자녀 사칭 목소리 복제 세션의 짧은 통화 한 번뿐이다(A2 ㉢) | `docs/research/child-clone-short-call-2026-11-01.md` · `functions/src/scenarios/escalation.ts:64` |
| 폐기 | 세션이 끝나면 Storage `users/{uid}/sessions/{sid}/**`를 지우고 `deleteVoice(voiceId)`를 1회 부른다(`purgeClaimedAt` 선점) | `functions/src/guardrails/purge.ts:55-94` · `:108-121` |
| 로컬 VoiceStudio | omnivoice 0.5.8을 사용자 PC에서 **CPU**로 돌린다. 한국어 복제 음성 1개가 있다. MCP는 로컬 HTTP 서버에 붙는데, 이 세션 중 연결이 끊겼다(ECONNREFUSED) | 과제 배경 · 이 세션 관찰 |

## 1. OmniVoice 사실 확인
| 항목 | 내용 | 근거 |
|---|---|---|
| 모델 | 0.6B 크기의 확산 언어 모델이다. 32단계(빠르게는 16단계), 출력은 24kHz | [README](https://github.com/k2-fsa/OmniVoice) · [모델 카드](https://huggingface.co/k2-fsa/OmniVoice) |
| 한국어 | 지원한다(학습 데이터 약 8,609시간). 단 목소리 설계(voice design)는 중국어 · 영어로만 학습됐고, **복제는 된다** | README `docs/languages.md` |
| **스트리밍** | **문서에 없다.** 출력은 발화 단위 `np.ndarray`라서 문장을 통째로 생성한다 | README |
| 속도 | H100 · fp16 · 32단계 · 배치 1에서 RTF 0.0899이고, FlashInfer + CUDA graph를 쓰면 0.0367. **L4와 CPU 수치는 없다** | README |
| 서버 | HTTP API가 없다. Python API, CLI, Gradio 데모만 있다 | README |
| ⛔ 라이선스 | 코드는 Apache 2.0이지만 **가중치는 CC-BY-NC(비상업)**. 면책 조항이 사칭 · 사기 용도를 금지한다 | README |

⇒ **스트리밍 합성은 기대할 수 없습니다.** 1차안은 문장 단위로 끊어 생성한다는 전제로 설계합니다(§3).

## 2. 1차안의 배치 위치
| # | 배치 | 구성 | 위험 | 판정 |
|---|---|---|---|---|
| P1 | **Cloud Run GPU 서비스(L4)** | OmniVoice 파이썬 패키지와 얇은 HTTP · WebSocket 서버를 컨테이너로 만든다(VoiceStudio 앱 자체가 아니라 같은 엔진). Functions가 단기 토큰을 발급하고, 클라가 직접 연결한다 | ① 콜드 스타트: 인스턴스 시작 약 5초에 모델 적재가 더해진다. 0에서 첫 토큰까지 gemma3:4b 사례로 약 19초([GA 블로그](https://cloud.google.com/blog/products/serverless/cloud-run-gpus-are-now-generally-available)) ② 상시 1대를 켜 두면 L4 약 $0.0001867/초(≈ $0.67/시간 · 약 $480/월, [문서](https://docs.cloud.google.com/run/docs/configuring/services/gpu) · [해설](https://www.gmicloud.ai/en/blog/cloud-run-gpu-pricing-explained)). GPU 무료 구간은 없다 ③ L4 리전과 할당량 ④ CC-BY-NC | **기본 배치** |
| P2 | 사용자 PC를 터널로 노출(cloudflared · ngrok 등) | 로컬 VoiceStudio HTTP를 공개 주소로 연다 | ① PC가 꺼지거나 잠자거나 인터넷이 끊기면 훈련 통화가 실패한다 ② **CPU라서 실시간에 못 미칠 가능성이 크다**(추정 · §6 M0으로 확인) ③ 참가자 녹음이 개인 PC로 간다. 그러면 폐기 범위(`purge.ts`)에 PC 디스크가 포함돼야 하고, 개인정보 처리 위치가 바뀐다 ④ 공개 주소가 공격면이 된다(인증 · 요청 상한을 직접 만들어야 한다) ⑤ 가정 업로드 대역과 지연 ⑥ 동시 세션은 1에 가깝다 | **개발 · 시연 전용.** 실서비스 금지를 제안한다 |
| P3 | GCE GPU VM 상시 운영 | VM에 같은 컨테이너를 올린다 | 콜드 스타트는 없지만 상시 비용(P1 상시와 비슷하거나 더 크다, 추정)이 든다. 패치 · 보안 · 확장을 직접 해야 한다 | P1의 최소 인스턴스 비용이 너무 클 때만 검토 |
| P4 | Cloud Run **Job**(일괄 · 0까지 축소) | 통화 전에 대사를 미리 생성한다(아래 단계 1) | 실시간 대화에는 못 쓴다. 생성 실패 시 폴백이 필요하다 | 단계 1 전용 |

**단계로 나눈 실현안 (1차안 안에서):**
| 단계 | 범위 | 배치 | 지연 | 이유 |
|---|---|---|---|---|
| 1 | A2 ㉢ 짧은 통화 대사 2~3줄을 메신저 단계에서 **미리 생성**해 통화 때 재생한다 | P4 | 재생 시작 ≈ 0. 콜드 스타트는 메신저 단계(수 분) 뒤로 숨는다 | 지금 복제가 쓰이는 유일한 곳이다. Live 파이프라인을 거의 건드리지 않는다 |
| 2 | 모든 통화를 **실시간** 복제 목소리로 바꾼다. Live 자막을 문장으로 끊어 생성한다 | P1 | §3 추정 약 1.9~2.5초 | 사용자 목표(실시간)의 본체. §5 문턱을 넘으면 차선책으로 넘어간다 |

## 3. 문장 단위 생성 지연 추정 (스트리밍 없음)
파이프라인은 다음 순서다. Live가 출력 전사를 내보내면 클라 · 서버가 첫 문장 경계(마침표 · 물음표 · 쉼표 · 최대 글자 수)에서 자르고, GPU 서버가 그 문장을 통째로 생성한 뒤 재생한다. 다음 문장은 재생하는 동안 미리 생성한다.

| 구간 | 값 | 근거 |
|---|---|---|
| ① Live 첫 출력 전사 | 약 1.1초 | Live 첫 오디오(말투 지시 포함, 실측)와 비슷하다고 가정한 **추정** |
| ② 첫 문장 경계까지 대기 | 0.2~0.6초 | 첫 조각을 짧게 자르는 경우(예: 첫 쉼표나 12자). **추정** |
| ③ 첫 문장 생성(약 2초 분량) | L4 · 32단계: 0.5~0.9초 / 16단계: 0.3~0.5초 | H100 RTF 0.0899를 바탕으로 L4가 3~5배 느리다고 본 값. **추정** |
| ④ 네트워크 · 디코딩 | 0.1~0.2초 | **추정** |
| **첫 음성 합계(따뜻한 인스턴스)** | **약 1.9~2.5초**(16단계면 약 1.7~2.3초) | 위 합. 지금 Live 단독(약 1.1~1.7초)보다 **0.6~0.8초 느리다** |
| 콜드 인스턴스 | 위에 +20초 안팎 | P1 ① |
| 문장 사이 끊김 | 생성 RTF < 1이면 이어 재생에 틈이 없다 | RTF가 1 이상이면(예: CPU) 문장마다 공백이 생긴다 |

> 확인 방법: §6 M0(로컬 RTF), M1(L4 RTF), M2(전 구간)를 실측한다.

## 4. Live 파이프라인 변경 (단계 2 기준 · 차선책 관리형도 같다)
| 부분 | 영향 | 파일 |
|---|---|---|
| 재생 | Live 오디오 재생을 끄고 생성 오디오를 재생한다. 음량 정규화도 이쪽으로 옮긴다 | `src/lib/realtime/GeminiVoiceSession.tsx`(재생 큐 `:603` 부근) · `src/lib/realtime/loudnessNormalizer.ts` |
| 반이중 | "사기범이 말하는 중" 판정이 Live 오디오가 아니라 **생성 오디오 재생 시간**을 따라야 한다. Live는 턴이 끝났다고 보는데 재생은 아직 이어지는 구간이 생긴다. 그동안 마이크 프레임을 계속 막아야 자기 끊김이 안 생긴다 | `src/lib/realtime/agentSpeechGate.ts` |
| 끼어들기 | Live `interrupted` 이벤트가 오면 재생을 멈추고 생성 대기열을 버린다. Live 턴은 끝났는데 재생은 남아 있을 때 참가자가 말하면 `interrupted`가 안 올 수 있으므로, 클라가 직접 끊는 규칙이 필요하다 | `GeminiVoiceSession.tsx:926-978` |
| 자막 · 전사 | 출력 전사가 그대로 원천이라 유지된다. **장점:** 실존 기관명 가드를 생성 **전에** 걸 수 있다. 지금은 소리로 먼저 나가 버린다 | `src/lib/realtime/liveTranscriptGuard.ts` · `functions/src/realtime/liveTranscriptGuard.ts` |
| 도구 호출 | `end_call` · 문자 도구는 Live가 그대로 부른다. 끊기는 **재생이 끝난 뒤**로 미뤄야 마지막 말이 잘리지 않는다 | `src/lib/realtime/toolTurnTranscript.ts` · `functions/src/scammerHangup/commit.ts` |
| 토큰 · 연결 | Live 토큰은 그대로 쓴다. GPU 서버용 단기 토큰을 Functions가 따로 발급한다(Functions는 장시간 WebSocket 중계에 맞지 않는다, 추정) | `functions/src/realtime/geminiProvider.ts:247-363` · `functions/src/realtime/index.ts` |
| 단계 1만 | 복제가 끝나면 `synthesize()`로 대사를 생성해 `audioUrl`로 넘긴다(계약이 이미 있다). 짧은 통화는 클립을 재생하고, 대본에 짧은 통화 규칙을 검사한다 | `functions/src/voice/provider.ts` · `functions/src/voice/index.ts` · `functions/src/realtime/priorChatContext.ts` · `functions/src/scammerHangup/decide.ts` |

**동의 · 폐기 (1차안):** 참조 음성을 요청마다 넘기고 GPU 서버에 저장하지 않으면, 외부 잔존 0을 우리 쪽에서 보장할 수 있다. `deleteVoice`는 no-op이고, 참조 음성과 생성 클립은 Storage `users/{uid}/sessions/{sid}/` 아래에 있으므로 `purge.ts` ①이 지운다. 서버는 메모리 캐시만 쓰고 세션이 끝나면 비우며, 디스크 쓰기는 0이다(구현 시 시험으로 고정). ⚠️ P2(사용자 PC)는 이 보장이 PC 디스크에 달려 있다.

**규칙 충돌:**
- G437(세션 화면에 '모의' · '훈련용' 0): 합성 표식 `syntheticLabel: "AI 훈련용 합성"`(`provider.ts`)을 통화 화면에 띄우면 충돌한다. 표식은 시작 전 고지와 리포트에만 둔다.
- 실존 기관명: 생성 전 가드로 오히려 강해진다(위 자막 행).
- CC-BY-NC: 이 서비스가 비상업에 해당하는지 법무 · 사용자 판단이 필요하다. 면책 조항이 사칭 용도를 금지하므로 "대응 훈련 목적"을 기록으로 남긴다(추정 · 법무 확인).

## 5. 차선책으로 넘어갈 판정표
문턱 값은 **제안값**이고, 사용자 확정이 필요합니다. 기준값은 §0의 Live 실측입니다.

| # | If (측정 결과) | Then |
|---|---|---|
| F1 | M0 로컬 CPU RTF ≥ 1.0 | P2(사용자 PC)는 실시간에서 탈락하고 P1 측정으로 간다. 1차안 자체는 유지한다 |
| F2 | M1 L4 RTF(16단계) ≥ 0.5 | 단계 2 탈락. 단계 1(P4 사전 생성)만 1차안으로 남기고, 실시간은 차선책으로 넘어간다 |
| F3 | M2 첫 음성 p50 > 2.5초 또는 p90 > 3.5초(따뜻한 인스턴스) | 단계 2 탈락. 처리는 F2와 같다 |
| F4 | 한국어 품질: 사용자 청취 5점 척도 평균 < 3, 또는 생성 음성을 다시 인식한 글자 오류율 > 10% | 1차안 탈락. 단계 1 · 2 모두 차선책으로 넘어간다 |
| F5 | 비용: 상시 GPU 월 > $150, 또는 세션당 > $0.10(사용자 확정 필요) | 최소 인스턴스를 0으로 둔다. 콜드 스타트 때문에 F3에 걸리면 차선책으로 넘어간다 |
| F6 | 단계 1 생성(콜드 포함) > 90초 | 메신저 단계 안에 못 끝날 위험이 있다. 짧은 통화는 Live 기본 음성으로 폴백하고, 단계 1 공급자는 차선책으로 넘어간다 |
| F7 | CC-BY-NC가 이 서비스와 맞지 않는다는 판단 | 1차안 탈락. 차선책으로 넘어간다 |
| F8 | 차선책으로 넘어가기로 할 때 | ElevenLabs 실서비스 금지 결정(2026-10-20)을 사용자에게 다시 확인한다. 금지가 유지되면 Chirp 3 즉석 커스텀 음성(허용 목록 신청)으로 간다 |
| F9 | 위 어디에도 걸리지 않음 | 1차안 단계 1 → 단계 2를 순서대로 구현한다 |

## 6. 1차안 검증 실측 계획 (로컬부터 · ⛔ 과금 단계는 매번 승인)
- **참조 음성은 실제 사람 목소리를 쓰지 않습니다.** VoiceStudio에 이미 있는 한국어 복제 음성을 쓰거나, Windows 한국어 TTS(Microsoft Heami) 15초 클립을 씁니다(기존 클립 생성 절차는 `CLAUDE.md` 'Analyze (입력 음성 쉼)' 행).
- 문장 세트 8개: 짧은 문장(8~12자) 3개, 중간 문장(20~30자) 3개, 긴 문장(50자 내외) 2개. 실존 기관명 0, 계좌 · 금액 · 앱 · 신분증 언급 0, 울먹이는 짧은 통화 대사 3줄 포함.

| # | 측정 | 위치 | 세션 · 호출 | 비용 | 기록 · 판정 |
|---|---|---|---|---|---|
| **M0** | 로컬 VoiceStudio 한국어 생성 속도. 문장마다 벽시계 시간 ÷ 오디오 길이 = RTF. 32단계와 16단계 각각, 첫 호출(모델 적재)은 따로 기록 | 사용자 PC(CPU) · **외부 전송 0** | 문장 8 × 단계 2 = 16회 | 0 | RTF · 적재 시간 · 청취 메모 → F1 · F4(초벌) |
| **M0b** | Cloud Run CPU 대체 배치(Z3 · Z4) 판단용: 로컬 Docker로 CPU 전용 이미지를 빌드해 **크기만** 잰다(푸시 0). M0의 문장당 CPU 초를 바탕으로 세션당 vCPU-초 · GiB-초를 계산한다 | 사용자 PC · 외부 전송 0 | 빌드 1회 | 0 | 이미지 ≤ 0.5GB이고 월 예상 사용량이 무료 구간의 50% 이하일 때만 Z3 허용 |
| **M0c** | 무료 터널 왕복 지연: **음성이 아닌 더미 텍스트**로 배포 Functions → 터널 → PC 상태 확인 요청 20회 | 무료 터널 | 요청 20회 | 0 | p50 · p90 왕복. 참가자 데이터는 보내지 않는다 |
| — | **합계** | | | **0원** | 사용자 청취 점수 확정 |
| ~~M1~~ | ~~Cloud Run GPU L4 생성~~ | | | ⛔ Z1 차단 | 0원 제약이 풀릴 때까지 보류 |
| ~~M2~~ | ~~Live 전 구간 첫 음성~~ | | | ⛔ Z1 · Z7 차단 | 보류 |
| ~~M3~~ | ~~Live로 글자 오류율~~ | | | ⛔ Z7 차단 | 대신 M0 청취 점수로 F4를 판정한다. 로컬 무료 인식기를 쓸 수 있으면 그것으로 대체한다(미확인) |
| ~~(차선)~~ | ~~ElevenLabs 기준선~~ | | | ⛔ Z5 | 결제 수단이 없는 무료 계정이 있을 때만, 사용자 승인 뒤 |

**명령 초안 (프로브 스크립트는 아직 없음 — 구현 승인 뒤 작성):**
```powershell
# M0 — 로컬만 · 과금 0 · VoiceStudio 실행 중이어야 함(이 세션에서는 연결 거부 상태였음)
#   방법 1: VoiceStudio MCP generate_speech를 문장마다 호출하고 시작 · 끝 시각을 기록(사용자 승인 후)
#   방법 2: omnivoice CLI 직접
omnivoice-infer --help   # 먼저 옵션 이름 확인(문서상 CLI 존재 · 옵션은 미확인)
node scripts/omnivoice-rtf-probe.mjs --engine local --ref <스크래치>/ref.wav --lines <스크래치>/lines-ko.json --steps 16,32 --out <스크래치>/m0
# M0b (0원 · 푸시 금지)
docker build -t omnivoice-cpu-probe <Dockerfile 폴더>; docker image inspect omnivoice-cpu-probe --format "{{.Size}}"
# ⛔ 아래 M1 ~ M3은 0원 제약(Z1 · Z7)으로 실행 금지 — 기록용으로만 남김
# M1 (GPU 과금)
gcloud run jobs deploy omnivoice-probe --image <이미지> --gpu 1 --gpu-type nvidia-l4 --region <L4 지원 리전> --task-timeout 15m --max-retries 0 --no-gpu-zonal-redundancy
gcloud run jobs execute omnivoice-probe --wait
gcloud run jobs delete omnivoice-probe --quiet
# M2 · M3 (Live 실 키 + GPU — 승인 필요)
npm --prefix functions run build
node scripts/live-clone-voice-probe.mjs --secret "C:/Projects/codegate/functions/.secret.local" --key-var GEMINI_API_KEY2 --tts-url <Cloud Run 서비스 주소> --clips <Heami 클립 폴더> --out <스크래치>/m2 --sessions 3
```
- 스크립트 규칙은 기존 프로브와 같습니다. 429가 나면 `STOP-429` 파일로 즉시 멈추고, 세션 · 글자 상한을 넘으면 호출 전에 거절하며, 결과는 스크래치 폴더에 wav와 시간 json으로 남깁니다.
- M1 · M2가 끝나면 Cloud Run 서비스 · Job · 임시 버킷을 지우고, 지웠다는 것을 목록 명령으로 확인합니다.

## 7. 차선책 — 관리형 스트리밍 TTS 복제
1차안과 같은 Live 변경(§4)을 쓰고, 생성만 관리형 서비스에 맡깁니다. 스트리밍을 지원하므로 문장 경계 대기가 줄어듭니다.

| 후보 | 한국어 | 스트리밍 | 첫 바이트 | 폐기 | 걸림돌 |
|---|---|---|---|---|---|
| ElevenLabs IVC + Flash v2.5 | 지원([models](https://elevenlabs.io/docs/models)) | WebSocket stream-input([문서](https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input)). 스키마에 `single_use_token`이 있다 | 동북아 150~200ms([지연 문서](https://elevenlabs.io/docs/eleven-api/guides/how-to/best-practices/latency-optimization)). 제3자 측정 중앙값 197ms([Vapi](https://humannessindex.vapi.ai/models/elevenlabs-flash-v2-5)) | `DELETE /v1/voices/{voice_id}`([문서](https://elevenlabs.io/docs/api-reference/voices/delete))가 `deleteVoice`와 1:1이다. `purge.ts`의 `elevenlabs_voice` target을 그대로 쓴다 | 2026-10-20 실서비스 금지 결정(F8). 기본 데이터 보관은 미국이고 무보존 모드의 요금제 조건은 미확인([데이터 거주](https://elevenlabs.io/docs/overview/administration/data-residency.md)). `requires_verification`으로 복제가 막힐 수 있다 |
| Google Chirp 3 즉석 커스텀 음성 | ko-KR 지원([문서](https://docs.cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice)) | `StreamingSynthesize`에서 `voice_clone` 지원. gRPC라 서버 중계가 필요하다 | 미측정. 예전 Chirp(복제 아님) 혼합안의 첫소리 실측은 1.3초 | key는 클라이언트 쪽 문자열이라 우리 쪽 삭제가 곧 `deleteVoice`다. Google이 참조 음성을 보존하는지는 문서에 없다(미확인) | **허용 목록 사용자만** 쓸 수 있다. 동의문을 정해진 문장 그대로 녹음해야 한다(실제 회사명 '구글'이 들어간다) |

- 첫 음성 추정: 약 1.3~1.6초. 1차안보다 0.4~0.9초 빠르다(추정).
- 세션당 비용(추정): Live 음성 출력 과금이 남아 **이중 과금**이 된다. ElevenLabs Flash는 $0.04/1천 자([가격](https://elevenlabs.io/pricing/api))라서 짧은 통화(약 150자)는 약 $0.006, 10분 통화(약 2,000~3,000자)는 약 $0.08~0.12다. Chirp 단가는 미확인([가격 페이지](https://cloud.google.com/text-to-speech/pricing)).

## 8. 비교표 (남겨 둠)
| 기준 | 1차안 단계 1 (P4 사전 생성) | 1차안 단계 2 (P1 실시간) | 1차안 P2 (사용자 PC) | 차선 ElevenLabs | 차선 Chirp ICV |
|---|---|---|---|---|---|
| 배포 웹 동작 | ○ | ○ | △ PC가 켜져 있을 때만 | ○ | ○(중계 필요) |
| 첫 음성 | ≈ 0 | 약 1.9~2.5초(추정) | CPU면 실시간 미달 가능(추정) | 약 1.3~1.6초(추정) | 약 1.3초대(추정) |
| 스트리밍 | 불필요 | 없음(문장 단위) | 없음 | 있음 | 있음 |
| 외부 잔존 0 | ○ | ○ | △ PC 디스크 | ○ 삭제 API | 미확인 |
| 비용 | 1회 약 1~2분 GPU | 상시 약 $480/월 또는 콜드 | 0(전기 · PC) | 이중 과금 · 자당 | 미확인 · 이중 과금 |
| 라이선스 · 결정 | CC-BY-NC 판단 | 같음 | 같음 | 2026-10-20 결정 재확인 | 허용 목록 |
| Live 변경 | 작음 | 큼 | 큼 | 큼 | 큼 |

## 9. 결정 · 확인이 필요한 것
| # | 무엇 | 누가 |
|---|---|---|
| D1 | §5 문턱 값(F2 ~ F6) 확정 | 사용자 |
| D2 | CC-BY-NC가 이 서비스에 맞는지(F7) | 사용자 · 법무 |
| D3 | M0 · M0b · M0c(모두 0원) 실행 승인과 VoiceStudio 재기동 | 사용자 |
| D4 | ~~M1 ~ M3 실행 승인~~ → 0원 제약(Z1 · Z7)으로 보류 | — |
| D5 | 단계 1에서 참가자 말을 전사할지(Live를 듣기만 하는 용도로 열면 비용이 남는다) | 사용자 |

## 10. 확인 안 한 것
- OmniVoice의 L4 · CPU 속도, 필요 VRAM: 문서에 없다(H100 수치만 있다).
- VoiceStudio 앱이 로컬 HTTP API를 공개하는지, 앱 자체의 라이선스: 확인하지 못했다(MCP 연결 거부). 클라우드에는 VoiceStudio 앱이 아니라 OmniVoice 엔진을 올린다는 전제로 썼다.
- Chirp와 ElevenLabs IVC의 단가 · 요금제.
- "재사용" 목소리(`voiceSelectionSource` 재사용)가 세션 사이에 어디에 남는지(`functions/src/realtime/scenarioVoice.ts` · `functions/src/realtime/index.ts`). 단계 1을 구현하기 전에 폐기 범위와 맞는지 봐야 한다.
