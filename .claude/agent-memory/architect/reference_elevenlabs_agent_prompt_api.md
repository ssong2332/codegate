---
name: elevenlabs-agent-prompt-api
description: ElevenLabs 에이전트 프롬프트 조회·갱신 경로 + 이 계정의 실제 상태(에이전트 12개·이름 규약·키 위치·매핑 미설정)
metadata:
  type: reference
---

에이전트에 저장된 시스템 프롬프트(ADR-0004 때문에 저장소 정본과 이중화되는 그 문자열)의 위치:

- 목록: `GET https://api.elevenlabs.io/v1/convai/agents` — **1회로 id+name 전수**가 나온다(예산 절감 지점).
- 조회: `GET /v1/convai/agents/{agentId}` — 헤더 `xi-api-key`
- 갱신: `PATCH` 같은 경로, body `conversation_config.agent.prompt.prompt`
- **PATCH 200을 성공 근거로 쓰지 말 것.** GET 되읽기 대조가 실제로 동작함이 확인됐다(오케스트레이터 실측 2026-07-27, 7종 PATCH 후 7/7 일치).
- 별개 경로: 서명 URL 발급 `GET /v1/convai/conversation/get-signed-url?agent_id=...` — 저장소에 유일하게 구현된 ElevenLabs 호출이며 프롬프트와 무관하다.

**이 계정의 실제 상태(오케스트레이터 실측 2026-07-29 — architect 재현 불가, 인용값)**
- **에이전트 12개 실재**, 이름이 전부 **`codegate-{scenarioId}`** 정확 일치(파일명이 아니라 **scenarioId** 기준 — `loanScam.prompt.ts`의 id는 `loan-refinance-scam`).
- 12 = `PUBLIC_SCENARIOS`에서 유도되는 실시간 도달 가능 집합(voiceMode 10 + escalation 2). 빠진 2종은 도달 불가 메신저 시나리오라 **결손이 아니라 설계**.
- 키는 `functions/.env`·`functions/.secret.local`에 있고 **유효**하다. ⚠️ `.env`에 `ELEVENLABS_API_KEY`가 **중복 정의**돼 있다 ⇒ 도구는 파일을 파싱하지 말고 `process.env`만 읽을 것.
- ⚠️ **`ELEVENLABS_AGENT_IDS`는 빈 값**이고 매핑은 `shared/config.ts`의 env 단독이다(하드코딩 0건) ⇒ 에이전트가 실재해도 **런타임은 여전히 Gemini/Mock 강등**이며 T99 하드 게이트는 깨지지 않은 상태다.
- `tier: free`, `character_limit`은 **TTS 문자 수**라 convai 읽기와의 관계는 **미확인**. 호출 최소화 설계를 유지할 것.

**Why:** 저장소 코드에는 프롬프트를 GET/PATCH하는 경로가 없다(서명 URL 2건뿐). 이 정보는 코드를 읽어 알 수 없고 드리프트를 다룰 때마다 다시 필요해진다.

**How to apply:** 드리프트 검출·감사 설계 시 이 경로와 이름 규약을 전제로 삼되, **필드명은 착수 시 1회 재확인**하게 할 것(외부 API는 바뀐다). 관련: [[reference-elevenlabs-voice-selection]] · [[feedback_constraint_premise_check_resources]]
