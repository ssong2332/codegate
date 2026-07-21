# Claude Code Starter Kit

A production-ready Starter Kit for Claude Code projects: 6 specialized subagents, a documented agent contract, and a full project-documentation template set.

## Features
- ✅ 6 Specialized Subagents (planner, architect, implementer, reviewer, quality-assurance, docs)
- ✅ CLAUDE.md
- ✅ AGENTS.md (Agent Contract: Authority, Input/Output, Ownership, Document Priority)
- ✅ PRD Workflow
- ✅ Architecture Workflow
- ✅ Decision Log
- ✅ ADR
- ✅ Definition of Done
- ✅ Git Workflow
- ✅ Prompt Rules

## Quick Start
1. Use this repository as a GitHub Template.
2. Clone your new repository.
3. Open Claude Code.
4. Ask:
   ```
   planner 에이전트로 요구사항 정리해줘
   ```

> After cloning, replace this README with your own project's README (`## Overview` / `## Getting Started` / the Documentation table below are a good starting shape). Fill in the `{{placeholders}}` in `CLAUDE.md`. Do **not** carry over this kit's root `CHANGELOG.md` — your project starts from the blank `docs/CHANGELOG.md` instead. Full agent invocation guide: `docs/PromptRules.md`.

## Configuration

This project uses a `.env` file for local secrets and configuration, which is git-ignored and never committed.

1. Copy the example file:
   ```
   cp .env.example .env
   ```
2. Fill in the values in `.env`:

   | Variable | Purpose |
   |---|---|
   | `YOUR_API_KEY` | API key for external service integration |
   | `YOUR_SECRET` | Application secret (session signing, encryption, etc.) |
   | `DATABASE_URL` | Database connection string |

3. When the architecture is defined and new environment variables are introduced, add them to `.env.example` (placeholder value only) and to this table.

## Documentation
| Document | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) | Agent contract: I/O, ownership, priority |
| [docs/PRD.md](docs/PRD.md) | Requirements and MVP scope |
| [docs/Architecture.md](docs/Architecture.md) | System design |
| [docs/Tasks.md](docs/Tasks.md) | Implementation tasks and status |
| [docs/CodingRules.md](docs/CodingRules.md) | Coding standards |
| [docs/GitWorkflow.md](docs/GitWorkflow.md) | Branch/commit/PR rules |
| [docs/DefinitionOfDone.md](docs/DefinitionOfDone.md) | Completion criteria |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log (details in docs/adr/) |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Release history |
