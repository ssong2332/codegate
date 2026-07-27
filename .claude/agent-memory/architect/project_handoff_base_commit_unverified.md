---
name: handoff-base-commit-unverified
description: 오케스트레이터가 알려준 base 커밋·줄번호는 실제 refs/파일과 어긋날 수 있다 — .git/refs를 직접 읽고 인용 줄번호를 재확인할 것
metadata:
  type: project
---

상류(오케스트레이터·planner)가 인계문에 적은 **base 커밋 해시와 `파일:줄` 인용은 검증 없이 쓰지 않는다.** 셸이 없어도 `.git/refs/heads/main`·`.git/refs/heads/<worktree-branch>`·`.git/worktrees/<name>/HEAD`는 **Read로 직접 읽을 수 있다.**

**Why:** T118 패스(2026-07-27)에서 인계문의 base `cd00c12`는 워크트리 HEAD와는 일치했지만 `refs/heads/main`은 이미 `7b549b0`이었고, planner가 인계한 `page.tsx` 줄번호 5건(`:666`·`:438`·`:425`·`:442`·`:820`)이 전부 10줄 안팎씩 어긋나 있었다(실제 `:676`·`:448`·`:435`·`:452`·`:830`). **T119 패스(2026-07-28)에서 또 9건이 어긋났다** — `verifyIntercept.ts` 게이트 6건(`:85`→`:109` 등)·주석 1건·`Architecture.md` 2건. **원인 패턴이 반복된다: planner는 등재 시점 트리를 읽고, 그 뒤 다른 태스크(T118)가 같은 파일에 필드를 얹으면 인용이 통째로 아래로 밀린다.** 두 번 다 **값·문면은 맞았고 줄번호만 틀렸다** ⇒ 내용을 의심하지 말고 **위치만 재실측**하면 된다. 이전에도 상류 수치가 과소집계된 사례가 있다 — [[upstream-breakage-counts-undercount]].

**How to apply:** 절을 쓰기 전에 ① `.git/refs`로 실제 커밋을 확인해 **기준선 고지 문장에 적고**, ② 인용할 `파일:줄`은 **직접 Grep/Read로 재확인**하고, ③ 어긋난 줄번호는 내가 고치지 말고(Tasks.md는 planner 소유) **인계 항목에 정정 목록으로 남긴다**. 조상 관계(base가 main에 있는가)는 셸 없이 확인 불가이므로 **"미확인"으로 명시**한다.
