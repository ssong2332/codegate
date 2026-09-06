---
name: project-codegate-account-placeholder-leak-fix
description: "[계좌]" 리터럴 노출 버그(2026-09-06) — 사기범(LLM) 응답에 guardrails/maskPII를 오적용한 공통층 버그, 근거·수정·경계 사례
metadata:
  type: project
---

## 증상 → 원인
라이브 신고 2건(institutionalImpersonation 고급·kidnappingThreat 중급, **둘 다 텍스트 입력**)에서
사기범 발화의 가짜 계좌/접수번호 숫자열이 리터럴 `"[계좌]"` 토큰으로 그대로 노출됐다. 서로 다른
시나리오·난이도에서 **공통 재현** → 개별 시나리오 파일이 아니라 공통 층(guardrails/maskPII를
사기범 응답에도 적용하던 `roleplay/index.ts` sendMessage·`roleplay/openingLine.ts`)이 원인.

`promptAssembly.ts`의 `SCENARIO_PROGRESSION_TEMPLATE`("페이로드는 가상값만 쓴다 ... 숫자는
실제처럼 들리는 형식으로 또박또박 부른다")·`ADVANCED_L3_PROCEDURAL`("접수번호를 남겨 주고")이
14개 시나리오·3개 난이도 전체에 공통으로 걸려 모델이 8자리 이상 그럴듯한 가짜 숫자열을 실제로
말하게 만드는데, 그 값이 `guardrails/index.ts`의 `ACCOUNT_PATTERN`(`/\b\d[\d -]{6,}\d\b/g`, 8자리
이상 연속 숫자 휴리스틱, 실존 여부 구분 안 함)에 걸려 `"[계좌]"`로 오탐 마스킹됐다.

## 핵심 증명 기법 — "마스킹이 지킬 실제 PII가 없다"를 코드 추적으로 확정
`roleplay/index.ts`의 `llmHistory`는 `toLlmHistory(storedHistory)`(Firestore에 **이미 저장 전
maskPII를 거친** 과거 메시지들)에 **현재 턴의 `maskedUserText`**(마스킹 후 값)만 push한다
(`llmHistory.push({role:"user", content: wrapUserInputAsData(maskedUserText)})`) — 원문 userText는
어디에도 들어가지 않는다. `openingLine.ts`는 애초에 `messages: []`. **⇒ 모델은 참가자의 원문 PII를
입력으로 받은 적이 단 한 번도 없다** — 따라서 모델 응답(사기범 발화)에 마스킹으로 지킬 실제 PII가
구조적으로 없고, 이 마스킹은 오직 프롬프트가 의도적으로 생성시키는 **가짜** 계좌/접수번호를 깨는
효과만 냈다. 이 사실을 확인한 것이 "공통층 문제 vs 시나리오별 실수" 판정의 결정적 근거였다.

## 왜 realtime(Gemini Live 음성) 경로는 손대지 않았나 — 경계 판단
`realtime/submitTranscript.ts`도 동일하게 양쪽 role에 `maskPII`를 적용한다(scammer 포함). 겉보기엔
같은 버그처럼 보이지만 **구조가 다르다** — Gemini Live는 실시간 음성 스트림이라 모델이 참가자의
**원문(마스킹 안 된) 음성**을 그대로 듣는다(서버가 실시간 오디오 파이프라인 중간에서 텍스트를
가로채 마스킹할 지점이 없음, Architecture.md §22 실측). 즉 realtime 경로에서는 사기범이 참가자의
**진짜** PII를 되읽어 줄 가능성이 이론상 존재해 `maskPII`가 정당한 목적을 가진다 — 텍스트/폴백
경로와 달리 여기서 마스킹을 제거하면 실제 프라이버시 회귀가 될 수 있다. 다만 같은 근본 원인(가짜
계좌번호도 같이 오탐 마스킹됨)이 **저장된 transcript/리포트/리플레이**에는 여전히 남아 있다 —
라이브 오디오 자체는 이미 masking 이전에 참가자가 들은 뒤라 안 들리지만, replay 화면에는 "[계좌]"가
남을 수 있다. 이번 태스크는 명시적으로 "텍스트 입력" 2건만 신고돼 있었고, realtime 쪽은 fix가
"진짜 PII 보호"와 "가짜 페이로드 보존"이 충돌해 **더 어려운 별도 설계 문제**라 손대지 않고 리포트에
플래그만 남겼다(스코프 규율 — [[feedback-doc-ownership-boundaries]]와 같은 태도).

## 수정 방식
`functions/src/roleplay/scammerReplyMasking.ts`에 항등 함수 `finalizeScammerReplyText()`를 새로
만들어 "사기범 쪽에는 마스킹을 적용하지 않는다"는 결정을 **테스트 가능한 지점**으로 고정(코드
자체는 no-op이지만, 향후 실수로 `maskPII(...)`가 그 자리에 다시 끼어드는 걸 리뷰에서 눈에 띄게
하는 목적 — 이 레포의 "판정만 소유하는 순수 함수" 관례를 그대로 따름). `roleplay/index.ts`
sendMessage·`roleplay/openingLine.ts` generateOpeningLine 두 호출부에서 `maskPII` 대신 사용.
참가자(user) 쪽 마스킹(AC-024)은 무변경.

## 테스트 전략 — MockLlmClient로는 재현 불가능했던 이유
이 버그는 **실 Gemini**가 SCENARIO_PROGRESSION 지시를 따라 그럴듯한 숫자를 만들 때만 나타난다.
`MockLlmClient`는 systemPrompt를 안 읽고 `weakenedTactics` 인용구만 재조합하므로 8자리 숫자를
자연 생성하지 않는다 — `generateOpeningLine`/`sendMessage`는 `getLlmClient()`를 직접 호출해
DI 지점이 없어(팩토리가 내부에서 Mock/Gemini를 고름) 실 LLM 완성 텍스트를 유닛테스트에서 통제할
수 없다. 그래서 **추출한 순수 함수를 직접 문자열로 테스트**하고, 같은 입력을 옛 코드처럼
`guardrails/maskPII`에 통과시키면 실제로 `"[계좌]"`가 나온다는 것까지 나란히 assert하는
역검증을 추가해 "이 테스트가 실제로 회귀를 잡아낼 수 있다"를 증명했다
(`functions/src/roleplay/__tests__/scammerReplyMasking.test.ts`).

## 문서 드리프트 (architect 소관, 미수정·recommend만)
`docs/Database.md` 79-85행 근처 `messages.textMasked` 행과 `functions/src/shared/types.ts`의
기존 주석("PII 마스킹된 텍스트만 저장")은 scammer role에 대해서는 더 이상 정확하지 않다.
`shared/types.ts`(소스 코드, implementer 소유)는 role별로 나눠 갱신했지만 `docs/Database.md`는
architect 소유라 건드리지 않고 커밋 메시지에 recommend만 남겼다 — [[feedback-doc-ownership-boundaries]].

## 관련 메모리
- [[feedback-unobservable-behavior-gates]] — 이번엔 반대로 "관측 가능한 지점(순수 함수)으로
  내려서 고정"한 성공 사례.
- [[project-codegate-t86-harmlessness-guards]] — "AI 자기 정상 발화가 자기 자신의 가드레일에
  걸리는" 유사 함정 계열(다만 그쪽은 금지어, 이쪽은 PII 마스킹 오적용이라 원인 층이 다름).
