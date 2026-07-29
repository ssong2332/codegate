---
name: overloaded-flag-judge-by-live-extension
description: 한 필드가 두 의미를 지는 결함은 "오늘 값이 같다"로 기각하지 말고 살아 있는 확장 후보로 판정한다 — 그리고 이름이 아니라 판별자를 간다
metadata:
  type: feedback
---

**한 이름이 두 가지를 뜻하는지 물으면, "현행 값이 전부 일치하니 무해하다"로 닫지 마라. 두 의미가 갈라지는 *실현 경로가 문서에 후보로 올라 있는지*를 찾아라.**

**Why:** 2026-07-29 `difficultyApplied` 판정에서 실측 — 현행 4경로(gemini·elevenlabs·mock·텍스트 폴백)에서 **M1(난이도 반영)과 M2(서버 지시 주입 자격)의 값이 4/4 동일**했다. 거기서 멈췄다면 *"겹쳐도 무해"* 로 닫혔을 것이다. 그런데 `docs/UpdateRequests.md` #5(resolved)가 **난이도별 에이전트 매핑 확장에 코드 변경이 필요하다**고 이미 확정해 뒀다 — 그 확장이 오면 M1=true·M2=false가 되어 **게이트가 조용히 열린다.** 값이 같은 것은 우연이 아니라 **하나의 구조적 사실**이 두 성질을 동시에 만들기 때문이고, 그 사실이 깨지는 시점이 곧 결함 발현 시점이다.

**How to apply:**
- 겹침 후보를 찾으면 **소비처를 전수 grep**해 의미를 두 줄로 각각 정의하고, **그 둘이 갈라지는 조건**을 한 문장으로 써라. 갈라지는 조건이 문서(UpdateRequests·§확장 경로·OQ)에 있으면 **살아 있는 결함**이다.
- ⭐ **고치는 것은 이름이 아니라 판별자다.** 개명은 정당한 소비처(배지·표기)의 주석·문서를 전부 낡게 만들면서 얻는 것이 0이다. **게이트가 묻는 질문을 직접 묻는 기존 값**(예: `credentials.provider`)으로 조건을 교체하면 신규 필드 0건·API/스키마 델타 0건으로 끝난다.
- **방향은 허용목록**이다. `!== "특정값"` 차단목록은 새 구현체가 **기본 통과**하게 만들어 같은 결함을 재생산한다.
- ⛔ 교체는 **무약화 증명표(현행 경로 전수 × before/after 판정)를 같은 커밋의 역검증 테스트로** 고정하지 않으면 게이트 약화와 구분되지 않는다.

관련: [[feedback_indistinguishable_states_pick_the_signal]] · [[feedback_inherited_impossibility_is_layered]] · [[feedback_tripwire_not_contract]]
