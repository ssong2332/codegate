---
name: row-ownership-conflict
description: 다른 브랜치가 점유 중이라고 지목된 Tasks.md 행은 통째로 회피하고, 필요한 내용은 다른 행·섹션에 적는다
metadata:
  type: feedback
---

오케스트레이터가 *"이 행은 다른 브랜치가 수정 중"* 이라고 지목하면 **그 행은 한 글자도 건드리지 않는다** — Status 열만이 아니라 행 전체다. 그 행에 대해 적어야 할 내용이 있으면 **신규 행이나 섹션 서두 주석**에 적고 *"그 행은 planner가 읽지도 고치지도 않았다 — 병합 상태는 오케스트레이터에게 확인할 것"* 을 명시한다.

**Why:** `docs/Tasks.md`는 행 하나가 수백~수천 자짜리 한 줄이라, 같은 줄을 두 브랜치가 만지면 git이 병합할 수 없고 통째로 충돌한다. 열 수가 어긋나면 표 전체가 깨진다.

**How to apply:** 편집 전 지목된 행 번호를 확인하고, 편집 후에는 `^\| T\d+ \|(?:(?:[^|]\|\\\|)*\|){7}\r?$` 형태의 정규식으로 **건드린 행의 열 수가 8인지 grep으로 재검증**한다(셀 안의 파이프는 `\|` 로 escape). 신규 행은 항상 append. 관련: [[feedback_edit_only_handoff]], [[project_ac_number_reservation]]
