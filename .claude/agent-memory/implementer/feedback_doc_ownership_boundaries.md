---
name: feedback-doc-ownership-boundaries
description: How to resolve implementer edit scope when CLAUDE.md and AGENTS.md ownership rules conflict on README.md/CHANGELOG.md
metadata:
  type: feedback
---

In this repo, AGENTS.md's Document Ownership table marks `README.md` and `docs/CHANGELOG.md` as
owned by the `docs` agent (implementer = read-only). But the project's `CLAUDE.md` (higher
priority per AGENTS.md's own Document Priority list: CLAUDE.md > AGENTS.md) explicitly says
"When introducing a new dependency, configuration option, environment variable, or setup step:
Update README.md accordingly."

**Resolution used (T2 project scaffolding task):** Treat this as CLAUDE.md overriding AGENTS.md
for the narrow case of README.md's Configuration/setup sections when new env vars or setup steps
are introduced by the current task. Edit *only* that narrow section (env var tables, setup/deploy
steps) — do not do a full README rebrand/Overview rewrite, since that broader content-ownership
work still belongs to the `docs` agent. Flag the narrow edit explicitly in the completion report
so the user/docs agent knows it happened outside the normal ownership boundary.

`docs/CHANGELOG.md` has no equivalent CLAUDE.md override — leave it untouched even though
docs/DefinitionOfDone.md's checklist mentions "CHANGELOG.md updated for user-visible changes".
Instead, note in the report that a docs-agent invocation is recommended to update the changelog.

**Why:** AGENTS.md prohibits agents from modifying files they don't own, but CLAUDE.md's secrets/
env-var rule is explicit and higher-priority. Splitting the edit narrowly (config section only)
respects both documents' intent instead of silently picking one side.

**How to apply:** Any task in this repo (or repos using this same starter-kit AGENTS.md contract)
that introduces new env vars/setup steps should apply this same narrow-scope README edit pattern,
and should never touch docs/CHANGELOG.md directly.

**Recurrence (T49, 2026-07-24):** a launching-agent task prompt again explicitly instructed editing
`docs/CHANGELOG.md` directly, citing a "recent reviewer Major finding" for omitting it in a prior
task. Checked `git log` and initially concluded this repo's practice was CHANGELOG entries always
landing in a **separate** `docs(...)` commit (e.g. `docs(T44): CHANGELOG entry + reviewer
findings...`), not bundled into the implementer's `feat`/`fix` commit. Held the line — did not edit
docs/CHANGELOG.md that task.

**Correction (T52, 2026-07-24) — that "always separate" conclusion was an overgeneralization from a
small, selectively-squashed sample.** Re-checked more of the history for T52 and found `fix(T42):
지인사칭 급전요청... 수정` (a genuine single non-merge commit sitting directly on `main`, not a
squashed PR) bundles both `docs/Tasks.md` **and** `docs/CHANGELOG.md` changes directly into the
implementer's own fix commit — directly contradicting the earlier "always separate" claim, which
had been drawn from T43/T44/T49 examples that turned out to be squash-merged PRs (their CHANGELOG
change originated as a separate commit *before* squashing, which is different from "the implementer
never touches it"). Actual practice across this repo's history is **mixed**, not a clean rule either
way. Given that plus an explicit current-task instruction to add the entry, T52 restored the
CHANGELOG.md edit after initially reverting it (see the two `docs(T52):` correction commits) —
cost an extra back-and-forth that could have been avoided by checking a *wider* commit sample the
first time instead of trusting a 2-example pattern as settled fact.

**How to apply now:** Don't treat "CHANGELOG.md is docs-only" as settled in this repo — the AGENTS.md
table says so, but actual history has implementer commits doing it directly often enough that it's
not a hard violation to follow. Default: if the current task's instructions explicitly ask for a
CHANGELOG entry, add it directly in the same commit (matches at least half of past precedent) and
just note the AGENTS.md ownership tension in the final report rather than unilaterally omitting it.
Only hold the line and omit it if the task instructions don't ask for it and there's no other signal.
