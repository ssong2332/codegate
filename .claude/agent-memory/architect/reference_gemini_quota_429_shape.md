---
name: gemini-quota-429-shape
description: Gemini 무료 티어 429의 구조와 @google/genai가 그것을 코드에 전달하는 방식 — 일일/분당 판별자는 quotaId뿐이고 retryDelay는 판별력이 0이다
metadata:
  type: reference
---

**Gemini 무료 티어(generateContent)의 쿼터와 429 구조** — §37(키 순환 설계)의 전제.

## 쿼터
- **프로젝트·모델당 하루 20건** + **분당 5건**. 두 제한이 **같은 429 상태코드**로 온다.
- ⭐ **429는 쿼터를 소모하지 않는다.** 무상태 순차 재시도(키 순환)가 성립하는 이유이며, 낭비가 지연뿐인 근거.
- 리셋은 **태평양 자정**. 상태를 저장하는 설계는 이 시간대를 서버가 알아야 한다.

## ⭐ 판별 규칙 (이걸 틀리면 설계 전체가 틀린다)
- **판별자는 `quotaId` 하나뿐**: `PerDay` 포함 → 일일(키 전환) / `PerMinute` 포함 → 분당(전환 금지).
- ⛔ **`retryDelay`로 판별하지 말 것 — 판별력이 0이다.** 실측된 *일일* 429 원문에 `retryDelay: 49s`가 **함께** 실려 왔다. 둘 다에 존재한다.
- 실측 원문 예: `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `limit: 20`, `metric: generativelanguage.googleapis.com/generate_content_free_tier_requests`.
- ⛔ 분당 429에 키를 바꾸면 **멀쩡한 키의 하루치를 조기 소모**한다. 이 앱의 병목은 분당 5가 아니라 **일일 20**이다.

## ⭐ SDK가 구조화 필드를 주지 않는다
- `@google/genai`의 `ApiError`가 보존하는 것은 **`status`와 `message` 둘뿐**(`dist/node/index.cjs` ApiError 클래스 · `dist/genai.d.ts`의 `ApiErrorInfo`).
- `message`는 **`JSON.stringify(errorBody)`** — 응답 본문 전체를 문자열로 뭉갠 값이다(`throwErrorIfNotOK`).
- ⇒ `details[].violations[].quotaId`는 **`JSON.parse(err.message)` 해야만** 얻는다. 이것은 [[gemini-error-string-vs-structure]]가 아니라 **구조화 문서의 전송 형식**이라, "에러 메시지 문자열로 판정하지 말라"(T98 죽은 게이트)는 금지와 충돌하지 않는다 — 단 파싱 실패를 삼키지 말고 `unknown`으로 **분류하고 로그에 남길 것**.
- **SDK는 기본적으로 재시도하지 않는다**: `apiCall`이 `httpOptions.retryOptions` 없으면 그냥 `fetch`를 반환한다. 이 저장소는 그 무재시도를 **회귀 테스트로 못박아 뒀다**(`geminiClient.test.ts`의 `calls === 1`).

## 누출 분석
- REST는 키를 **`x-goog-api-key` 헤더**에 싣는다(URL 아님) ⇒ **`ApiError.message`(=응답 본문)는 키를 담지 않는다.** 기존 `logger.warn(..., error.message)`는 안전하다.
- WebSocket(Live)만 `?key=`로 URL에 싣는데 거기 실리는 값은 **단기 토큰**(`auth_tokens/...`)이다.

## 검증 수단(라이브 쿼터 안 태우고 가능)
`geminiClient.test.ts`가 이미 **`globalThis.fetch`를 갈아끼워** 429 JSON 본문을 돌려준다. 일일/분당 429를 **주입**해 시험할 수 있다. 그 픽스처는 `details`가 없는 산문형 429라 **`unknown` 분기의 기성 음성 픽스처**이기도 하다.

관련: [[gemini-live-session-constraints]] · [[handoff-base-commit-unverified]]
