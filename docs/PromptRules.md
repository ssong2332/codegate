# Prompt Rules — {{project-name}}

Owner: User. How to invoke the six agents. Contract details: AGENTS.md.

## Pipeline with Approval Gates
```
planner → [user reviews PRD + answers Open Questions]
→ ux-design (if the project has a user-facing UI) → [user approves flows/screens]
→ architect → [user approves design]
→ implementer (one Tasks.md ID at a time)
→ reviewer + quality-assurance
→ (issues? → implementer again / design defect? → architect first / UX defect? → ux-design first)
→ docs
```

## Invocation Table
| When | Say | Agent invoked |
|---|---|---|
| Project start / new requirements | "planner 에이전트로 요구사항 정리해줘" | planner |
| PRD approved, project has a UI | "ux-design 에이전트로 UX 설계해줘" | ux-design |
| PRD (and UX, if applicable) approved, need design | "architect 에이전트로 아키텍처 설계해줘" | architect |
| Design approved, build task | "implementer로 Tasks.md의 T{{n}} 구현해줘" | implementer |
| After implementation | "reviewer로 방금 변경분 리뷰해줘" | reviewer |
| Before marking done | "quality-assurance로 T{{n}} 검증해줘" | quality-assurance |
| After merge / release | "docs 에이전트로 문서 동기화해줘" | docs |

## Always
- Explain assumptions before acting on ambiguous input.
- Cite modified files (path + line) in every report.
- Produce a suggested commit message after code changes.
- **Run `git branch --show-current` before touching any file, and again before committing.** If it is not the branch you were told to work on, stop and report — do not switch and continue. Another agent may have moved the shared checkout, and there may be uncommitted work belonging to someone else. (T100)

## Never
- Guess requirements — list them as Open Questions instead.
- Modify files unrelated to the current task.
- Rewrite large files when a small diff suffices.

## Rules
- **Any agent that writes files must be invoked with worktree isolation.** That is `implementer`, `planner`, `architect`, `ux-design`, `docs` — everything in AGENTS.md whose Outputs column is not read-only. `reviewer` and `quality-assurance` do not write files, but isolating them too is preferred: it gives them a clean checkout of the branch under review. (T100)

  **왜**: 2026-07-26 세션 실측에서 격리한 에이전트(reviewer·QA·planner)는 충돌 **0건**, 격리하지 않고 공유 저장소 `C:\codegate`에서 돌린 implementer는 **2건**이었다 — ① 커밋이 `main`에 떨어짐 ② 다른 작업자가 편집 중이던 파일이 브랜치 전환으로 사라짐. 공유 저장소는 체크아웃이 **하나뿐**이라 동시에 두 브랜치를 잡을 수 없다. 격리 없이 여러 에이전트를 띄우면 서로의 브랜치를 갈아엎는다.

- One implementer invocation = one task ID. Never batch tasks in one prompt.
- Always pass the reviewer/QA report verbatim when re-invoking implementer for fixes.
- Approval gates are the user's job — agents report and stop; they never self-approve.
- If an agent's report contains Open Questions, answer them before invoking the next agent.
