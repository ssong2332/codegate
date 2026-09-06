---
name: project-codegate-s59-commit-ab-tool-timing
description: §59 (라) 흐름주도 하이브리드 — 커밋 A(클라 toolCall 배선)·B(서버 콜러블 증분) 구현. C(도구 점화)는 의도적으로 손대지 않음. createRealtimeCall liveTools 필드가 B가 아니라 C 소관이라는 지시문-Architecture 불일치를 원문 기준으로 해소한 사례.
metadata:
  type: project
---

브랜치 `feat/s59-tool-timing-wiring`(커밋 `32dbc67` A, `be92485` B, main `b6b153e` 기준)에서
`docs/Architecture.md` §59(모델 주도 발동 시점)의 커밋 A·B만 구현. C(도구 선언 자체,
`geminiProvider.ts`의 `tools:[]` 채우기·`liveTools.ts` 신설·프롬프트 조건부 치환)는 명시적으로
손대지 않았다.

**지시문-원문 불일치 발견 및 해소**: 사용자 작업 지시문은 "createRealtimeCall·deliverInCallSms·
deliverVerifyOffer 3건이 B"라고 요약했지만, `docs/Architecture.md` §59.10 커밋 경계 표 원문은
`createRealtimeCall` 응답의 `liveTools` 필드 추가를 명시적으로 **커밋 C** 행에 배치했다(B 행은
`deliverInCallSms`·`deliverVerifyOffer` 2건만 나열). 지시문 자체가 "원문을 반드시 대조하라"고
요청했으므로, 이 불일치는 stop-and-ask 대상이 아니라 원문 우선으로 판단해 B 스코프에서
`createRealtimeCall`을 제외했다(커밋 메시지에 "인계 사항"으로 명시). [[feedback_doc_ownership_boundaries]]

**"동작 0 변화" 증명 기법**: 서버 두 콜러블(`deliverInCallSms`/`deliverVerifyOffer`) 모두
`trigger:"model_tool"`일 때만 새 게이트 로직을 타게 하고, 그 외(부재/`"backstop"` — 오늘 유일한
실호출)는 기존 코드 경로를 한 글자도 건드리지 않고 `status` 필드만 얹었다. 순수 함수
(`resolveModelToolSmsGate`/`resolveModelToolVerifyGate`, `>=` 비교)로 R5 하한 재검증을 테스트
가능하게 분리하고, "gate가 `.create(` 호출보다 먼저 return하는가"는 소스 스캔 테스트로 고정했다
(onCall 핸들러라 에뮬레이터 없이 직접 관측 불가 — [[feedback_unobservable_behavior_gates]] 패턴
재사용). 추가로 `geminiProvider.ts`의 `tools: []`가 그대로인지 소스 스캔 테스트를 별도로 넣어
"커밋 A·B가 커밋 C를 앞당기지 않았다"를 기계적으로 고정했다.

**클라 dispatch 스코프를 좁게 해석**: §59.6 ②~⑥(도구 이름→콜러블 라우팅, `pickDueInCallSms` 등)은
커밋 A의 행 설명에 없고("credentials.liveTools 부재면 즉시 unsupported로 답하고 끝") 오늘
`geminiProvider.ts`가 도구를 하나도 선언하지 않아 Gemini가 `toolCall`을 보낼 수 없으므로, A의
`onmessage` 새 분기는 "항상 unsupported로 응답"만 구현하고 실제 라우팅은 만들지 않았다. 이 덕분에
`credentials.liveTools` 필드 타입 자체를 만들 필요가 없어져(코드가 그 필드를 참조하지 않음) B의
`createRealtimeCall` 제외 판단과 자연스럽게 맞아떨어졌다.

**콘텐츠 문구 공백 발견**: `docs/Architecture.md` §59.6이 `deliverInCallSms`의 거절 문구 2종은
정본으로 확정했지만 `deliverVerifyOffer`의 거절 문구는 API.md 어디에도 저작돼 있지 않다(확인
실측 — grep 0건). implementer가 같은 형식(괄호 지문)으로 초안을 써 넣고 파일 내 주석 + 커밋
메시지에 "architect 정본 확정 전 배포 금지"를 명시했다 — 오늘은 무해(트리거를 보내는 클라가
없어 실행 경로 자체가 없음)하지만, §59 커밋 C 착수 시 재확인이 필요하다고 인계했다.

**Firestore 스키마 무증가**: `deliverInCallSms`/`deliverVerifyOffer` 응답에 `status`/
`declineInstruction`을 추가했지만 Firestore 문서 필드는 늘리지 않았다(§59.11 요구사항 — 관측은
`logger.info` 1종). `too_early`/`already_delivered`(model_tool 전용)는 `.create()` 호출 자체를
건너뛰어 G387(하한 미도달 시 write 금지)을 만족시켰다.

**functions 테스트 수**: main 기준 616 → 이 작업 전 720(다른 태스크들의 누적) → 이 작업 후
731(신규 11건: R5 게이트 순수함수 8건 + 게이트 순서 소스스캔 2건 + tools:[] 불변 소스스캔 2건,
일부는 기존 파일에 추가). root 테스트는 351 → 357(신규 5건, `liveToolResponse.test.ts`).
