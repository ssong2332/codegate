# CLAUDE.md — Project Rules
## Project Startup Behavior

When a project is opened and no explicit user task is provided:

1. Analyze the repository structure.
2. Detect existing project documentation (PRD.md, Architecture.md, Tasks.md, README.md, etc.).
3. Determine the current project phase.
4. Suggest the single most logical next step instead of asking a generic question.

Priority:
- If `PRD.md` is missing, suggest generating it.
- Else if `Architecture.md` is missing, suggest generating it from the PRD.
- Else if `Tasks.md` is missing, suggest generating implementation tasks.
- Else recommend the highest-priority incomplete task from `Tasks.md`.

Do not respond only with "What would you like help with?".
Be proactive and guide the workflow based on the current repository state.

---

## Environment Variables

### Secrets Management

- Never hardcode API keys, passwords, tokens, database credentials, or any other secrets in source code.
- Store all sensitive configuration in a `.env` file.
- Commit only `.env.example` with placeholder values.
- Ensure `.env` is listed in `.gitignore` and is never committed.
- When introducing a new environment variable, update both `.env.example` and the README configuration section.
- If required environment variables are missing, clearly inform the user instead of guessing or using placeholder secrets.
- Never print or expose secret values in logs, documentation, examples, generated code, or commit messages.

### Configuration

Before generating code:

- Check whether the required environment variables already exist.
- If a required variable is missing, instruct the user to add it to `.env` and update `.env.example`.
- Never invent API keys, tokens, passwords, secrets, or credentials.
- Use sensible placeholder names such as `YOUR_API_KEY`, `YOUR_SECRET`, or `DATABASE_URL` in examples.

---

## Documentation Maintenance

When introducing a new dependency, configuration option, environment variable, or setup step:

- Update `README.md` accordingly.
- Keep installation and configuration instructions synchronized with the current project state.
- Ensure new contributors can set up the project using only the README and `.env.example`.
## Prohibitions (override all other rules)
- No success reports without evidence (file:line, log, number).
- No unrequested modifications, refactoring, or deletions.
- No silent workarounds — report the blocker and get approval first.
- No guesses stated as facts — mark them as estimates and say how to verify.

## Project Overview
- Name: {{project-name}}
- Goal: {{one line}}
- Stack: {{fill in after docs/Architecture.md is approved}}

## Verified Commands
Record commands verbatim after the first success. Reuse without modification; if a change is needed, state what and why first.

> ⚠️ **npm 스크립트를 거치지 않고 직접 명령을 치지 말 것.** `npx tsc` 같은 직접 실행은
> `functions/lib`의 스테일 컴파일 산출물을 지우는 단계를 건너뛰어 **테스트 수치를 조용히 오염시킨다**
> (T101 / `docs/Architecture.md` §20.7 (1) — 실측으로 확인된 유일한 잔여 구멍이며 이 표가 그 완화 수단이다).
> 이 오염으로 2026-07-26~27 세션에서 **테스트 수 오보가 3회** 발생했다.

| Purpose | Command | Verified on |
|---|---|---|
| Build (functions) | `npm --prefix functions run build` | 2026-07-27 |
| Test (functions) | `npm --prefix functions test` | 2026-07-28 — 525 pass / 0 fail (main `38b419f`) |
| Test (root) | `npm test` | 2026-07-28 — 216 pass / 0 fail (main `32b3da2`) |
| Build (root) | `npm run build` | 2026-07-27 — 통과 (main `1157d7d`). ⚠️ **`.env`가 있는 트리에서만 통과한다** — 격리 워크트리처럼 `.env`가 없으면 TS 컴파일은 성공한 뒤 정적 생성 단계에서 `auth/invalid-api-key`로 실패한다. 이것은 코드 결함이 아니다(T108에서 base main 대조로 실측 확인) |
| Lint (functions) | `npm --prefix functions run lint` | 2026-07-27 |
| Clean (functions) | `npm --prefix functions run clean` | 2026-07-27 — 멱등 |

## Report Template
```
### 결론: {한 줄 — 됐는가/안 됐는가/얼마나}
| 항목 | 결과 | 이전/기준값 | 근거 (파일:줄, 로그, 수치) |
### 문제/다음 단계: {있으면}
```

## Agent Workflow
- Agent contract (I/O, ownership, priority): AGENTS.md
- How to invoke agents: docs/PromptRules.md
- Completion criteria: docs/DefinitionOfDone.md
- Git rules: docs/GitWorkflow.md


## Change Workflow

Do not restart the entire workflow for every change.

Choose the earliest affected agent.

Examples:

- Documentation only → Docs
- Bug fix → Implementer → Reviewer → QA → Docs
- UI change → UX → Architect → Implementer → Reviewer → QA → Docs
- Feature addition → Planner → UX → Architect → Implementer → Reviewer → QA → Docs
- Architecture change → Architect → Implementer → Reviewer → QA → Docs

Never invoke upstream agents unless the change affects their responsibility.