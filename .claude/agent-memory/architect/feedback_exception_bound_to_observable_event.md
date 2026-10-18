---
name: feedback-exception-bound-to-observable-event
description: 무조건 금지 규칙에 User가 예외를 열면, 예외를 관측 가능한 승인 사건(BLOCKING 도구 응답·허용 턴에만 실리는 문면)에 묶어 "어느 쪽이 적용됐는지 판정 불가"를 피한다
metadata:
  type: feedback
---

무조건형 프롬프트 금지(예: "너는 통화를 끝내지 않는다")를 User가 좁히면, 예외 문면을 그냥 옆에 붙이지 말고 **서버 승인 사건 뒤에만 행동하도록** 순서를 박는다. 실시간 = BLOCKING 도구 → 서버 판정 → 결과 뒤 행동, 텍스트 = 판정을 LLM 호출 전에 해서 허용 턴에만 예외 문면을 싣는다.

**Why:** T192(§79) — 신고 ⑪은 "끊겠다고 말했는데 안 끊김"이었다. NON_BLOCKING이면 행동 선언이 승인보다 먼저 나와 거절 시 같은 결함이 재발한다. G128(모순 2문장) 교훈과 같은 계보.

**How to apply:** 예외 설계 시 ① 선언/행동이 승인보다 앞설 수 있는 경로를 표로 지운다 ② 기존 문면은 NONE 변형으로 바이트 동일 보존 ③ 시나리오 파일 문장은 모든 변형에서 참이 되게 고친다. 관련: [[feedback-exception-belongs-to-conditional-layer]] · [[feedback-client-shortcut-loses-the-contract-half]]. 또: 화면 값이 Firestore 문서→구독을 거치면 "컴포넌트만 고치면 된다"는 인계는 거짓일 수 있다(page 구독 매핑 1줄).
