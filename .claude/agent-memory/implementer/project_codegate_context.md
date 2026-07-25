---
name: project-codegate-context
description: Codegate hackathon fraud-vaccine project — non-obvious repo state facts (pre-existing doc drift, hosting choice rationale)
metadata:
  type: project
---

Project: "안 당해본 사기는 못 막는다" (AI 금융사기 백신) — 코드게이트 해커톤, Next.js + Firebase.
Absolute deadline: Day2 오전 11시 (see docs/PRD.md Constraints). Hackathon DoD mode: only
T7/T10/T11 (security-gate tasks) require formal reviewer/QA sign-off; all other tasks use
implementer self-check with evidence (docs/DefinitionOfDone.md 하카톤 모드).

**Pre-existing git drift (not caused by any implementer task):** As of the T2 scaffolding task
(2026-07-21), `git diff` showed docs/PRD.md, docs/Architecture.md, docs/API.md, docs/Database.md,
docs/DECISIONS.md, docs/DefinitionOfDone.md, docs/Tasks.md, docs/UX.md, docs/adr/*.md as
modified/untracked relative to the repo's single "Initial commit" (48f947d) — that commit only
captured the starter-kit's `{{placeholder}}` template versions, while the working tree already
had the fully-written v0.6 PRD / v1.2 UX / etc. This is normal — the planning agents did their
work after the initial commit without a follow-up commit. Don't assume you (implementer) broke
something if `git status` shows these as changed; verify with `git diff` before reacting, and
never `git add -A` blindly in this repo since it would sweep in these large pre-existing
planning-doc diffs alongside your own scoped changes.

**Hosting choice (T2, Architecture.md left as team's free choice between Firebase Hosting/Vercel):**
Picked Firebase Hosting + Next.js static export (`output: "export"` in next.config.ts) because the
whole app is client-only (Firebase SDK + Cloud Functions callables, no SSR needed) and it lets
`firebase deploy` push Hosting+Functions+Firestore/Storage rules in one command — no separate
Vercel account/env-var setup needed. See next.config.ts comment for the same rationale.
