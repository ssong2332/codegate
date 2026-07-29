---
name: codereview-log-reference
description: docs/CodeReview.md가 이 저장소의 유일한 reviewer·QA 판정 기록처다 — 단 로그가 뒤처지므로 PR 번호 검증에 그대로 의존하면 안 된다
metadata:
  type: reference
---

**PR 번호·reviewer/QA 판정을 문서에 적어야 할 때 먼저 `docs/CodeReview.md`를 연다.** reviewer·QA는 규정상 어떤 파일도 수정할 수 없어(`AGENTS.md:8`) 자기 판정을 저장소에 남길 수 없고, **docs 에이전트가 오케스트레이터의 PR 요약을 대신 옮겨 적는 것**이 이 파일이다(행 전부가 **인용값**이며 docs가 diff를 직접 대조한 것이 아니다 — 파일 서두가 그렇게 자기 고지한다).

**⚠️ 이 로그는 항상 뒤처진다.** 2026-07-29 실측: main HEAD가 `5aeb655`(= 인용된 PR **#166**)인데 로그 섹션 제목은 **`## Log — 2026-07-28~29 리뷰/QA (PR #149~#158)`** 였고 **#159~#166 행이 0건**이었다. ⇒ **PR 번호는 planner가 검증할 수 없는 값**이다(셸·`gh` 없음 — [[no-shell-measurement]]).

**How to apply:**
1. **병합 판정은 PR 번호가 아니라 산출물 실재로** 한다(main 체크아웃에서 심볼·테스트 파일을 직접 grep). PR 번호는 *"오케스트레이터 인용값 — planner 미대조"* 로 명시해 적는다.
2. 로그에 행이 있으면 **`docs/CodeReview.md:{줄}` 을 근거로 인용**한다(T132 행이 이 방식을 쓴다).
3. ⭐ 이 파일의 **끝부분 "참고" 절은 `docs/Tasks.md` 상태 열과의 불일치를 docs가 나열해 둔 곳**이라, 상태 점검 패스에서 **드리프트 후보 목록으로 그대로 쓸 수 있다**(2026-07-29 기준 T128·T130·T131·T132·T136·T137이 나열돼 있었다).
4. `docs/CodeReview.md`의 소유권은 `AGENTS.md`에 아직 정식 등재돼 있지 않다(파일 스스로 미해결 메타 이슈로 적어 둔다) ⇒ **planner가 이 파일을 편집하지 않는다.**

관련: [[no-shell-measurement]], [[row-ownership-conflict]]
