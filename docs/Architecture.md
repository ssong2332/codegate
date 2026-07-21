# Architecture — {{project-name}}

Owner: architect (see AGENTS.md). Others read-only.
Major decisions are logged in DECISIONS.md; details in adr/.
Based on PRD Version: {{x.x}} · Based on UX Version: {{y.y or N/A}} · Last Updated: {{date}}

## Tech Stack
| Layer | Choice | Reason |
|---|---|---|
| {{frontend/backend/db/...}} | {{...}} | {{...}} |

## Folder Structure
```
{{project tree}}
```

## Layers & Module Boundaries
{{layer diagram or list — which layer may depend on which}}

## Data Flow
{{request → ... → response}}

## Authentication / Authorization
{{strategy, or "N/A"}}

## Conventions
{{architectural rules implementer must follow — e.g., business logic never imports framework code}}

## Risks & Trade-offs
| Decision | Trade-off | ADR |
|---|---|---|
| {{...}} | {{...}} | adr/0001 |

## UX Traceability
{{Only when docs/UX.md exists. Maps each Screen ID/Flow ID to the component, endpoint, or table that implements it — e.g. "UX-001 → /api/users endpoint (API.md), users table (Database.md)". Otherwise state "N/A — no docs/UX.md".}}
