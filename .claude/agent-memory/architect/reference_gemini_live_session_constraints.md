---
name: gemini-live-session-constraints
description: Gemini Live 경로에서 세션 중 바꿀 수 없는 것들(음성·프롬프트·도구) — 목소리/페르소나 전환 설계를 판단할 때의 고정 제약
metadata:
  type: reference
---

Gemini Live 실시간 통화 경로의 제약(2026-07-26 코드+웹 확인). 코드에서 바로 안 보이는 "왜"가 섞여 있어 남긴다:

- **음성·모델·시스템 프롬프트·도구는 단기 토큰 발급 시점에 서버가 `liveConnectConstraints`로 고정한다**(`functions/src/realtime/geminiProvider.ts` `authTokens.create`). 클라가 세션 중에 바꿀 수 있게 만드는 것은 ADR-0004 잠금(프롬프트 클라 미노출 + setup 프레임 바꿔치기 차단)을 **스스로 뚫는 것**이다 — "API가 되느냐"보다 이 점이 먼저다.
- **세션 중 `speechConfig`(음성) 갱신 가능 여부는 공식 문서로 확인되지 않았다.** 웹 검색 결과가 상충하고 모델별 제한 보고가 있다 → **추정에 기능 가치를 걸지 말 것**. 소켓 재연결로 우회하면 Live 세션의 대화 컨텍스트가 소실된다(통화 연속성 전제가 깨진다).
- **대신 이미 배선돼 있는 것**: 텍스트 턴 주입(`sendClientContent`)으로 "지금 이렇게 행동하라"는 오케스트레이션 지시를 넣을 수 있고(전사 미기록), 사기범 턴 경계(`turnComplete`)를 클라가 관측할 수 있다. **상대를 "바꾸는" 연출은 음색이 아니라 이 주입 + 라벨·연출로 만든다.**

**How to apply:** 실시간 통화에서 "상대가 바뀐다/목소리가 달라진다" 류 요구가 오면 먼저 이 표를 적용한다 — 음색 전환은 v1 기각, 표면 전환(라벨·소개·톤 지시·연결 연출)로 대체하고 한계를 갭으로 등재한 뒤 QA 라이브 측정으로 넘긴다(DECISIONS #40 선례). ElevenLabs 쪽 제약은 [[elevenlabs-voice-selection]] 참조 — 그 경로는 지시 주입 지점 자체가 없어 더 좁다.
