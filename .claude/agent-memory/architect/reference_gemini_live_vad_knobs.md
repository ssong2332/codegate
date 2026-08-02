---
name: gemini-live-vad-knobs
description: Gemini Live VAD는 시작/종료 손잡이가 따로다 — 이 저장소는 종료만 설정했고 시작은 기본 HIGH로 열려 있다
metadata:
  type: reference
---

`automaticActivityDetection`에는 **서로 독립된 네 손잡이**가 있다(`@google/genai` `dist/genai.d.ts`):

| 손잡이 | 무엇을 정하나 | 이 저장소 상태 |
|---|---|---|
| `startOfSpeechSensitivity` (`:871`) | *"사용자가 말하기 **시작**했다"* 판정 → **모델 자기-끊김(interrupted)** 의 손잡이 | ⛔ **미설정 = 기본 `START_SENSITIVITY_HIGH`**(`:12420`이 *"The default is … START_SENSITIVITY_HIGH for Gemini Live"* 라고 명시) |
| `prefixPaddingMs` (`:875`) | start 확정 전 필요한 발화 지속시간 | ⛔ **미설정** |
| `endOfSpeechSensitivity` | 침묵을 발화 **종료**로 볼 속도 → **응답 지연**의 손잡이 | 설정됨(`END_SENSITIVITY_HIGH` = 기본값과 동일 ⇒ 추가 효과 0) |
| `silenceDurationMs` | 종료 판정 침묵 길이 | 설정됨(**400** — Google 문서 권장 하한 **500 미만**이라 이미 지연 축으로 최대 조임) |

⭐ **그래서 "자기-끊김 ↔ 응답 지연은 같은 손잡이의 트레이드오프"는 거짓이다.** 자기-끊김은 **시작 손잡이**, 지연은 **종료 손잡이**다. 종료 손잡이는 이미 한계까지 조여져 있어 **지연 축의 잔여 수단이 0**이고, 시작 손잡이는 **한 번도 손댄 적이 없다**.

⭐ **첫 발화 지연은 VAD와 인과가 0이다** — 선행 사용자 발화가 없다. 원인은 직렬 6단계(콜러블 왕복 + Functions 콜드스타트 → `authTokens.create()` 왕복 → `getUserMedia`/AudioContext → `live.connect()` → 오프닝 트리거 → 모델 생성량)이며, 앱이 줄일 수 있는 것은 **트리거가 요구하는 첫 발화 길이**와 **마이크 준비의 병렬화**뿐이다.

**대가**: `START_SENSITIVITY_LOW`/`prefixPaddingMs` 상향은 짧은 맞장구("네","응")를 놓칠 수 있다. 되돌릴 때는 `prefixPaddingMs`를 먼저 낮추고 `LOW`는 유지한다(맞장구에 더 민감한 쪽이 padding이다).

⚠️ 워크트리엔 `node_modules`가 없다 — 본체 체크아웃 `C:\codegate\functions\node_modules\@google\genai\dist\genai.d.ts`를 직접 열 것([[absence-claims-check-the-sdk]]).

클라이언트 반이중 게이트(`src/lib/realtime/agentSpeechGate.ts`)와는 **다른 층**이다 — 그쪽이 열리는 창은 정확히 3개(turnComplete 후 tail 250ms / 턴 진행 중 stall **4000ms 상한** / `interrupted` 직후 **즉시**)이고 뒤 둘이 결함 창이다. [[gemini-live-session-constraints]] · [[stated-absence-check-the-scan-set]]
