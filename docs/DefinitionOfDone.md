# Definition of Done — {{project-name}}

Owner: User. Enforced by implementer (self-check) and quality-assurance (gate).
A task's Status may become `done` in docs/Tasks.md only when every item below passes.

## Checklist
- [ ] Acceptance Criteria (AC-xxx in docs/PRD.md, referenced by docs/Tasks.md) are met, with evidence (output, screenshot, or log).
- [ ] Code follows docs/CodingRules.md.
- [ ] Code is consistent with docs/Architecture.md (no layer violations).
- [ ] Lint passes — command output attached.
- [ ] Build succeeds — command output attached.
- [ ] Tests exist for the change and pass — actual test run output attached, not claimed.
- [ ] No unrelated files modified (`git diff` contains only task-scoped changes).
- [ ] reviewer Status: `APPROVED` (or user explicitly accepted the risks of a REJECTED item).
- [ ] quality-assurance Release Recommendation: `GO` (or user explicitly accepted the risks of a NO-GO item).
- [ ] Documentation impact reported (docs agent invoked if docs changed).
- [ ] docs/CHANGELOG.md updated for user-visible changes.

## Rules
- "Tests pass" without attached output = not done (see CLAUDE.md prohibitions).
- Skipped items must be listed explicitly with the user's approval noted.
