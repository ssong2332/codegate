# Documentation Update Requests — {{project-name}}

Owner: docs (see AGENTS.md). Appended when docs finds a document it doesn't own has drifted from the implementation. docs never edits the target document directly — it logs the drift here so the owning agent can act on it, even across sessions.

| # | Date | Target Document | Section | Stale Content | What the Code Actually Shows | Owning Agent | Status |
|---|---|---|---|---|---|---|---|
| 1 | {{YYYY-MM-DD}} | {{docs/PRD.md}} | {{section}} | {{...}} | {{...}} | {{planner}} | open |

## Rules
- Rows are appended by docs only; docs never rewrites or deletes a past row.
- The Status column is the one exception: the named Owning Agent (planner/ux-design/architect) may update it from `open` to `resolved` once they've acted on the row — mirrors implementer's narrow Status-only exception on docs/Tasks.md.
- Everyone else is read-only.
