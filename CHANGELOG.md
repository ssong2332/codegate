# Changelog

All notable changes to this Starter Kit will be documented in this file.

This file tracks changes to the **kit itself**. It stays at the kit's root and is not copied into new projects — new projects get `docs/CHANGELOG.md` (a blank template) instead.

## [1.0.0] - 2026-07-14

### Added
- Initial Claude Code Starter Kit
- Six project subagents
  - planner
  - architect
  - implementer
  - reviewer
  - quality-assurance
  - docs
- CLAUDE.md
- AGENTS.md
- Project documentation templates
- ADR template
- Decision Log
- Definition of Done
- Git Workflow
- Prompt Rules

### Changed
- Switched to project-local `.claude/agents`
- Standardized documentation under `docs/`
- Introduced Required / Optional document loading
- Added document priority rules
- Added Authority model
- Added Decision logging
- Added Git diff–based review workflow

### Notes
Project-local agents take precedence over user-global agents (`~/.claude/agents`) following Claude Code's documented behavior.
