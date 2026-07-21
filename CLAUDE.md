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

| Purpose | Command | Verified on |
|---|---|---|
| Build | {{...}} | {{date}} |
| Test | {{...}} | {{date}} |
| Run | {{...}} | {{date}} |

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