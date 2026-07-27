---
name: elevenlabs-agent-prompt-api
description: ElevenLabs Agents Platform에서 에이전트에 저장된 시스템 프롬프트를 조회·갱신하는 경로와 그 검증 방식(되읽기)
metadata:
  type: reference
---

에이전트에 저장된 시스템 프롬프트(ADR-0004 때문에 저장소 정본과 이중화되는 그 문자열)의 위치:

- 조회: `GET https://api.elevenlabs.io/v1/convai/agents/{agentId}` — 헤더 `xi-api-key`
- 갱신: `PATCH` 같은 경로, body `conversation_config.agent.prompt.prompt`
- **PATCH 200을 성공 근거로 쓰지 말 것.** GET으로 서버 저장분을 되읽어 대조하는 방식이 실제로 동작함이 확인됐다(오케스트레이터 실측 2026-07-27, 7종 PATCH 후 7/7 일치).
- 별개 경로: 서명 URL 발급은 `GET /v1/convai/conversation/get-signed-url?agent_id=...` — 저장소에 유일하게 구현돼 있는 ElevenLabs 호출이며 프롬프트와 무관하다.

**Why:** 저장소 코드에는 프롬프트를 GET/PATCH하는 경로가 **없다**(구현은 서명 URL 2건뿐). 즉 이 경로 정보는 코드를 읽어 알 수 없고, 라이브 사본 드리프트를 다룰 때마다 다시 필요해진다.

**How to apply:** 에이전트 프롬프트 동기화·감사·드리프트 검출을 설계할 때 이 경로를 전제로 삼되, 실제 필드명은 착수 시 1회 재확인하게 할 것(외부 API는 바뀐다). 관련: [[reference-elevenlabs-voice-selection]]
