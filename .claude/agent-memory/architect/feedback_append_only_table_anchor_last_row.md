---
name: append-only-table-anchor-last-row
description: DECISIONS.md 같은 오름차순 append-only 표에 행을 추가할 땐 직전 행의 머리가 아니라 마지막 행의 꼬리를 앵커로 잡아라 — 머리를 잡으면 역순으로 들어간다
metadata:
  type: feedback
---

`docs/DECISIONS.md`처럼 **오름차순 append-only 표**에 새 행(`#N`)을 추가할 때, 앵커는 **직전 행 `#N-1`의 *머리*(`| 103 | 2026-09-16 | **(`)가 아니라 마지막 행의 *꼬리*** 여야 한다.

**Why:** `#104`를 만들면서 `| 103 | ...` 머리를 `old_string`으로 잡고 `new_string = #104행 + "\n" + #103머리` 로 썼더니 **`#104`가 `#103` 위에 들어갔다**. 이 저장소의 행은 한 줄이 수천 토큰이라, 되돌리려면 **그 거대한 줄 전체를 `old_string`으로 두 번 더 타이핑**해야 했다(삭제 1회 + 재삽입 1회). 순서가 틀린 것 자체보다 **복구 비용이 비싼 것**이 문제다.

**How to apply:**
- 추가 전에 `^\| ?1?\d\d \|` 류로 `-o` grep해 **행 번호가 오름차순인지 내림차순인지부터 확인**한다(줄이 길어 `Read`가 토큰 한도에 걸리므로 `-o`가 사실상 유일한 수단이다).
- 오름차순이면 앵커 = **마지막 행의 짧고 유일한 꼬리 문자열**(보통 "되돌리는 비용" 칸 끝). `new_string = 그 꼬리 + "\n" + 새 행`.
- 같은 규칙이 `docs/Architecture.md`의 `## N.` 절에도 적용된다 — 거기서는 **직전 절의 마지막 footnote 줄**이 앵커다(§65는 §64.11의 `UpdateRequests` 줄을 앵커로 잡아 한 번에 성공했다).
- 관련: [[feedback_numbering_is_settled_by_merge_order]] · [[feedback_handoff_numbers_may_run_ahead]]
