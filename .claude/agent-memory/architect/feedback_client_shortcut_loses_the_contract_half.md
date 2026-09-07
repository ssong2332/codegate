---
name: client-shortcut-loses-the-contract-half
description: 클라가 서버 왕복을 건너뛰는 조기 응답을 설계하면 그 계약의 서버 소유 반쪽(문면)이 사라진다 — "다시 부르면 되지"는 서버 멱등성부터 확인하고, 미리 내려보낸 선례를 먼저 찾아라
metadata:
  type: feedback
---

**클라가 서버를 안 부르고 즉시 답하는 경로를 만들면, 그 응답 계약의 *서버 소유 반쪽*(모델 대면 문면)이 조용히 빠진다.** 조기 반환을 설계·리뷰할 때 물어야 하는 것은 "상태값이 맞는가"가 아니라 **"이 경로에서 그 문자열을 어디서 얻는가"** 다.

**Why:** codegate §59 커밋 D(2026-09-07). verify 오퍼 announce 이중 발동을 막는 클라 클레임 가드가 경합에서 지면 `{status:"already_announced"}` 만 돌려줬는데, 계약(§59.6 ⑥)은 `{status, guidance}` 이고 서버는 그 상태에서 **항상** `declineInstruction`을 함께 보낸다. 도구가 `BLOCKING`이라 **억제 지시 없이 상태만 오면 모델이 자기 판단으로 안내를 또 말한다** — 막으려던 버그가 다른 경로로 재현된다. reviewer REJECTED의 내용이 정확히 이것이었다.

**How to apply:**
- ⓐ **후보 "그냥 서버를 한 번 더 부른다"는 서버 멱등성부터 코드로 확인**하라. codegate에서 SMS 쪽은 성립했고(`.create()` 원자적 존재 검사) verify 쪽은 **성립하지 않았다** — `resolveVerifyOfferPlan`은 문서를 안 쓰는 announce 단계라 `placed===false`인 한 **몇 번을 불러도 "안내하라"를 돌려준다** ⇒ 부르는 순간 그게 곧 이중 안내다. **같은 계열의 두 콜러블이 서로 다른 답을 준다.**
- ⓑ **경합/진행 중 같은 "문서를 남기지 않는 상태"는 서버가 관측할 자리가 없다** — 그런 상태의 문면은 **미리 내려보내는 것**(자격증명/세션 토큰에 실어 보내기)이 유일한 해다. 이 저장소엔 이미 선례가 있었다(`liveTools.failureInstruction`) ⇒ **새 기전을 만들지 말고 동형으로 얹어라.**
- ⓒ 필드를 더할 때 **부착 조건은 그 문자열이 딸린 도구/기능의 선언 조건과 1:1**로 하고 패리티를 테스트로 단언하라(둘이 갈리면 없는 도구의 문면이 내려가거나 있는 도구의 문면이 빠진다).
- ⓓ 조기 응답 **조립을 순수 함수로 내려라** — 그래야 "guidance가 실리는가"를 소스 문자열 트립와이어가 아니라 단위 단언으로 건다([[feedback_tripwire_not_contract]]).
- ⓔ 문면은 **재사용**한다(정본 1벌). 새 상태 전용 문장을 저작하면 정본이 N벌이 되고, 시제가 어긋나는 대가는 고지+프로브로 받는다([[feedback_wording_must_hold_in_every_emitting_state]]).

관련: [[feedback_guard_exists_check_sibling_slots]] · [[reference_gemini_live_function_calling]] · [[feedback_indistinguishable_states_pick_the_signal]]
