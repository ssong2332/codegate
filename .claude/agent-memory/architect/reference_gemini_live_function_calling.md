---
name: gemini-live-function-calling-constraints
description: Gemini Live function calling의 SDK 사실 4개 — BLOCKING 기본값(무응답=통화 정지), allowedFunctionNames는 ANY 전용, toolCall/sendToolResponse 이름, tools와 responseModalities 공존
metadata:
  type: reference
---

`@google/genai` **2.13.0** 실측(`functions/node_modules/@google/genai/dist/genai.d.ts` 직접 열람, 2026-09-06). ⚠️ 워크트리에 `node_modules`가 있을 때만 성립 — 없으면 열람 자체가 불가하다([[feedback_absence_claims_check_the_sdk]]).

| 사실 | 값 | 왜 설계를 바꾸는가 |
|---|---|---|
| **`Behavior` 기본 = `BLOCKING`** (`:1201-1214`) | *"the system will **wait** to receive the function response before continuing the conversation"* | ⛔ **클라가 `sendToolResponse`를 보내지 않으면 모델이 그 자리에서 멈춘다 — 회귀가 아니라 통화 정지다.** ⇒ 클라 수신 배선이 **도구 선언보다 반드시 먼저** 배포돼야 하고, 콜러블 throw·네트워크 실패에도 **응답은 무조건 보낸다.** `NON_BLOCKING`을 쓰면 모델이 기다리지 않지만 그러면 "도구 결과를 받고 이어 말한다"가 성립하지 않는다 |
| **`allowedFunctionNames`는 `mode: ANY`일 때만 유효** (`:4653-4654`) | SDK 주석이 *"Only set when the Mode is ANY"* 라고 명시 | ⛔ **허용목록을 SDK 필드로 걸 수 없다**(`AUTO`에서는 무시된다). 허용목록은 **선언 배열 자체**가 지고, 잠금은 **회귀 테스트의 집합 동등 단언**이 져야 한다. `ANY`로 바꿔 허용목록을 쓰면 모델이 **매 턴 도구를 강제 호출**해 다른 결함이 생긴다 |
| **수신·송신 API 이름** | 수신 `LiveServerMessage.toolCall?: LiveServerToolCall`(`:9262`, `functionCalls?: FunctionCall[]` `:9322-9325`) · 취소 `toolCallCancellation?`(`:9264`) · 송신 `session.sendToolResponse(LiveSendToolResponseParameters)`(`:12177`, `functionResponses: FunctionResponse[] \| FunctionResponse` `:9201-9204`) · `FunctionResponse`는 `{ id, name, response: Record<string, unknown> }`(`:4741-4746`, *"Use 'output' key to specify function output"*) | 배선 스펙 그대로 |
| **`tools`와 `responseModalities`가 같은 `LiveConnectConfig`에 공존** (`:8777`·`:8826`) | 오디오 전용 세션에서도 도구 선언 가능 | ⭐ *"오디오 모달리티라 도구를 못 쓴다"* 는 흔한 추정이 **거짓**이다 |

**라이브 실측(P-A, 2026-09-06 — 인계 인용값)**: 오디오 모달리티 세션에서 `toolCallReceived:true` · `sendToolResponseThrew:null` · `sawServerContentAfterToolResponse:true` ⇒ **완전 지원**.

**설계 결론(codegate §59/ADR-0015)**: 인자 없는 도구(`parameters.properties = {}`)로 좁히고, 모델에게 돌려줄 문자열은 전부 서버가 소유하며, 도구 이름은 클라에 하드코딩하지 않고 자격증명으로 내려보낸다(드리프트 게이트 대신 드리프트가 성립할 자리를 없앤다).

관련: [[reference_gemini_live_session_constraints]] · [[reference_gemini_live_vad_knobs]] · [[feedback_absence_claims_check_the_sdk]] · [[feedback_safety_closed_by_path_leaves_the_wording]] · [[feedback_rejected_candidate_revives_with_backstop]]
