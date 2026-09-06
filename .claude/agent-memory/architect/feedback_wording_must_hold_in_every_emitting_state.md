---
name: wording-must-hold-in-every-emitting-state
description: 문면(모델 대면 지시·거절 문구)을 정본으로 확정하기 전에, 그 문자열을 방출하는 상태 집합을 판정 함수에서 직접 세어라 — status 하나가 두 상태를 덮으면 초안은 한쪽에서 기존 게이트를 위반한다
metadata:
  type: feedback
---

문면을 확정할 때 **문자열이 나가는 조건(status 값)** 이 아니라 **그 status를 만드는 상태 집합**을 판정 함수에서 세어라. 값 하나가 둘 이상의 상태를 덮으면, 정본은 **그 전부에서 동시에 참**이어야 한다.

**Why:** §59.6 `deliverVerifyOffer` 거절 문구 확정(2026-09-06)에서 실제로 났다. `status:"already_announced"`는 `resolveVerifyOfferPlan`의 `includeInstruction:false` **하나**로 결정되는데 그 값은 ① `placedAt` 존재(호 전환 완료) ② `stage:"commit"` **두 상태**에서 나온다. implementer 초안은 ②만 상정해 *"이미 안내한 확인창구로 연결해 드리겠다고 하거나"* 를 넣었는데, ①에서는 말하는 사람이 **이미 그 창구의 담당자**라 T118/R-1(전환 후 재권유 금지)과 `transferStateLine`을 정면으로 위반했다. 이름(`already_*`)만 보면 한 상태로 읽힌다.

**How to apply:**
- 문면 확정 전 3단계: ⓐ 그 문자열을 반환하는 지점 grep → ⓑ status를 만드는 **순수 판정 함수**를 열어 진리표(입력 조합 → 값)를 확인 → ⓒ 상태마다 "이 문장을 그 화자가 말해도 참인가"를 한 행씩 판정한다.
- **자매 문면과 갈라지는 지점을 근거로 남겨라.** 같은 계열(`SMS_DECLINE_*`)이 "대체 행동" 절을 갖더라도, 그 대체 행동이 **아직 소비 가능한 사건**일 때만 성립한다. 이미 소비된 사건에는 대체 행동 절이 거짓이 된다.
- 공개 콜러블의 모델 대면 문자열은 **직접 호출로 노출된다**를 전제하고, 노출 판정을 "새 표면이 열리는가"로 물어라 — 같은 콜러블이 이미 더 민감한 값(`announceInstruction`의 창구명)을 돌려주면 표면은 새로 열리지 않는다.
- ⚠️ 거절 문구 같은 **모듈 상수**는 카탈로그 필드 순회 게이트(G86 계열)의 스캔 집합 **밖**이다 — "문면 조건을 만족한다"는 기계 집행이 아니라 문면 자체가 유일한 보증임을 고지하라([[feedback_stated_absence_check_the_scan_set]]).

관련: [[feedback_exception_belongs_to_conditional_layer]] · [[feedback_overloaded_flag_judge_by_live_extension]] · [[feedback_scope_is_decided_by_gates_not_taxonomy]]
