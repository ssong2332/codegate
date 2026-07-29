---
name: judgment-may-already-be-a-section
description: 지시받은 architect 판정이 Architecture.md에 이미 절로 존재할 수 있다 — 착수 전 절 제목 전수 grep 필수
metadata:
  type: feedback
---

**착수 전에 `docs/Architecture.md`의 `^## ` 절 제목을 전수 grep해 그 태스크 번호가 이미 있는지 본다.** 지시문이 "판정하라"고 해도 그 판정이 이미 끝나 있을 수 있다.

**Why:** T116(2026-07-29)에서 실측 — 지시문은 E①~④를 처음부터 판정하라고 했으나 **§32가 이미 존재**했다(후보 전수표 6행 · 프로브 P-4 · if/then 강등표 9행 · 대상 전수 확정 · 병존 확정 · G139~G145 · OQ-A21). 지시문은 그 절을 한 번도 언급하지 않았다. 모르고 새로 썼다면 **번호 충돌 · 상충 판정 · 두 벌 정본**이 동시에 생겼을 것이다. `docs/UpdateRequests.md` 행 #12가 *"§32가 이미 완성된 판정 문서인데 Tasks.md 상태 열이 `todo`"* 라고 2026-07-28에 이미 등재해 뒀는데도 지시문에는 반영되지 않았다.

**How to apply:**
- 1차: `^## ` grep으로 절 제목 전수 → 태스크 번호(`T1xx`)로 재grep.
- 2차: `docs/UpdateRequests.md`의 `open` 행에 그 태스크가 있는지 — 상태 드리프트가 여기 먼저 등재된다.
- 있으면 **재작성이 아니라 "위에 얹는 절"** 로 쓴다(이 저장소 관례 = 원문 무삭제, §28→§30 · §32.4 (3) 하단 고지 선례). 새 절의 첫 블록에 **뒤집은 항목 / 유지한 항목 전수표**를 둔다 — 그게 없으면 implementer가 어느 쪽을 따를지 모른다.
- 상류가 "미확인"으로 남긴 프로브에 실측이 도착한 경우, 할 일은 **재설계가 아니라 기존 절의 if/then 강등표를 발동시키는 것**이다.

- ⭐ **선행 판정은 "있다/없다"가 아니라 *항목별*로 갈린다.** 2026-07-29 신고 3건 패스에서 지정 키워드 4개를 grep하니 3개(`L4`·`ADVANCED_BASE`·`difficultyApplied`)는 판정 절이 **여러 개** 있었고 1개(`OQ-36`)는 **0히트**였다. ⇒ 같은 절 안에 **"얹는 것"과 "신설하는 것"이 공존**한다. 절 서두에 *"무엇이 이미 있고 무엇이 없는가"* 를 히트 수와 함께 표로 적어라 — 그게 없으면 다음 사람이 전체를 신설로 읽는다.

관련: [[feedback_handoff_todos_may_be_discharged]] · [[project_upstream_cited_identifiers_may_not_exist]] · [[feedback_stale_header_vs_actual_baseline]]
