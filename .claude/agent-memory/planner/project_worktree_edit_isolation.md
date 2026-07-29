---
name: worktree-edit-isolation
description: planner는 공유 main 체크아웃(C:\codegate)을 읽을 수는 있으나 편집은 도구가 거부한다 — 워크트리 사본을 고치고 base 동일성을 먼저 증명하는 절차
metadata:
  type: project
---

**`C:\codegate`(공유 main 체크아웃)의 파일은 Read·Grep은 되지만 Edit은 도구가 거부한다** — *"This agent is isolated in the worktree … Edit the worktree copy of this file instead"*. ⇒ base가 main이어도 **편집 대상은 언제나 자기 워크트리 사본**이다.

**Why:** 에이전트가 공유 체크아웃의 작업트리를 더럽히면 다른 에이전트의 브랜치 작업과 충돌한다. 읽기는 base 실측에 필요하므로 허용된다.

**How to apply:**
1. **base 실측은 main 체크아웃에서** 한다(`C:\codegate\.git\logs\refs\heads\main` 마지막 줄, 산출물 파일 실재). 이건 계속 유효하다 — [[no-shell-measurement]].
2. **편집 직전에 워크트리 사본이 base와 같은지 증명한다.** 워크트리가 옛 브랜치(`feat/T83-…`)에 올라가 있어도 내용은 최신일 수 있다(오케스트레이터가 갱신해 둔다). 증명 2단: **(ㄱ)** 대상 행들의 **줄 번호가 main 사본과 일치**하는지 같은 grep을 양쪽에 돌리고, **(ㄴ)** base 직전 PR에서 들어간 **고유 문자열 1개**를 워크트리 사본에서 grep해 1히트인지 본다(예: 최신 태스크 행의 *"base main `73690ed`"*). ⛔ 줄 번호만으로는 부족하다.
3. 지시문이 준 브랜치명(`docs/…-sync-0729`)과 워크트리의 실제 브랜치가 달라도 **체크아웃하지 않는다** — 편집만 하고 *"편집이 브랜치 X 위에 있으니 옮겨서 커밋해 달라"* 를 보고한다([[planner-edit-only-handoff]]).
4. 편집 후 표 열 수 재검증: `^\| T\d+ \|(?:(?:[^|]|\\\|)*\|){7}\r?$` — **`\r?$`를 빼면 CRLF 때문에 0히트가 나온다.** 전건이 아니라 **내가 고친 행 ID만** 걸어서 세는 것이 정확하다(이 저장소엔 원래 8열이 아닌 행이 10개 있다).
