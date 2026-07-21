# UX — {{project-name}}

Owner: ux-design (see AGENTS.md). Others read-only.
Created only when the project has a user-facing UI (ux-design: "if required").
Update this document in place — do not recreate it from scratch. Preserve existing sections unless explicitly superseded by a newer decision. The **UX Decision Log** is append-only — never rewrite or delete a past entry; append a new one if a decision changes.
Flow IDs and Screen IDs are immutable once assigned — never renumber existing IDs, even if one becomes Deprecated. New flows/screens always get the next available ID.

## Overview
| Item | Value |
|---|---|
| Document Version | {{e.g. 1.4}} |
| Based on PRD Version | {{docs/PRD.md version/date this UX was designed against}} |
| Last Updated | {{date}} |

{{one paragraph — what this UX covers}}

## User Flows
Every flow must use this template — do not vary the shape.

### {{Flow Name}} (Flow ID: {{UF-001}})
| Item | Value |
|---|---|
| Actor | {{who}} |
| Trigger | {{what starts this flow}} |
| Related Acceptance Criteria | {{AC-# — docs/PRD.md MVP Scope row #}} |
| Steps | {{1. ... 2. ... 3. ...}} |
| Alternative Flow | {{branch, or "N/A"}} |
| Failure Flow | {{what happens on failure}} |
| Success Criteria | {{observable end state}} |

## Screen Catalog
Every screen must use this template — do not vary the shape.

### {{Screen Name}} (Screen ID: {{UX-001}})
| Item | Value |
|---|---|
| Belongs to Flow(s) | {{Flow ID(s), e.g. UF-001}} |
| Acceptance Criteria | {{AC-# this screen satisfies}} |
| Purpose | {{...}} |
| User Goal | {{what the user is trying to accomplish here}} |
| Entry | {{where the user arrives from}} |
| Exit | {{where the user goes on success}} |
| Primary Actions | {{...}} |
| Secondary Actions | {{...}} |
| States | Loading: {{...}} / Empty: {{...}} / Error: {{...}} / Success: {{...}} |
| Validation | {{input validation rules, or "N/A"}} |
| Failure | {{error conditions specific to this screen — e.g. "camera permission denied"}} |
| Accessibility | {{keyboard nav, contrast, screen reader notes, or "N/A"}} |

**Architect Handoff**
| Item | Value |
|---|---|
| Priority | {{Critical / High / Medium / Low}} |
| Business Rules | {{rules architect/implementer must enforce — e.g. "password must be at least 8 characters"}} |
| Data Required | {{data this screen reads/writes}} |
| Data Operations | {{which of Read / Create / Update / Delete apply}} |
| External Dependencies | {{services/APIs this screen calls}} |
| Permissions | {{OS/app permissions needed, or "None"}} |
| Navigation Targets | {{screens this screen can navigate to}} |
| Events Emitted | {{events this screen fires — e.g. "image_captured"}} |
| Expected Outputs | {{what this screen produces for the next step}} |
| Assumptions | {{what architect can assume true when designing this — e.g. "user is already authenticated", "product exists", "network available"}} |

## Deprecated
When a screen or flow is no longer supported by the latest docs/PRD.md: never delete it — move its entry here, mark it Deprecated, and explain why. This section is the design history; it does not need to satisfy the Consistency Check below.

### {{Flow/Screen Name}} ({{Flow ID / Screen ID}})
| Item | Value |
|---|---|
| Type | {{Flow / Screen}} |
| Deprecated Since | {{date or docs/PRD.md version}} |
| Reason | {{why this is no longer valid}} |

## Information Architecture
{{navigation structure, screen hierarchy, or sitemap}}

## Interaction Patterns
{{reusable patterns for implementer — e.g. loading (skeleton/spinner), empty state, error, validation (timing/message placement), permission denied, session expired, offline, button-disabled-while-pending, retry-on-failure, confirmation dialogs, undo, animation}}

## Accessibility
| Item | Value |
|---|---|
| Keyboard Navigation | {{tab order, shortcuts, or "N/A"}} |
| Focus Order | {{...}} |
| Screen Reader Support | {{labels/roles for assistive tech, or "N/A"}} |
| Color Contrast | {{minimum contrast ratio, or "N/A"}} |
| Touch Target Size | {{minimum tappable size, or "N/A"}} |
| Error Messaging | {{confirm errors are conveyed by more than color alone — e.g. icon + text, or "N/A"}} |

## Responsive Behavior
| Breakpoint | Layout Changes |
|---|---|
| Desktop | {{...}} |
| Tablet | {{...}} |
| Mobile | {{...}} |

If no behavior differs across breakpoints, state explicitly: "No breakpoint-specific behavior." Do not leave a row blank — a blank row is ambiguous between "not designed yet" and "no difference."

## UX Decision Log
Append-only — never rewrite or delete a past entry. If docs/PRD.md changes make a decision no longer valid, add a new entry and mark the old one's Status as Superseded or Deprecated — never delete it.

### {{Decision name — e.g. "Navigation: Bottom Nav vs Hamburger"}}
| Item | Value |
|---|---|
| Decision | {{what was decided}} |
| Reason | {{why}} |
| Alternatives Considered | {{...}} |
| Rejected Because | {{...}} |
| Impact | {{which of Architecture / API / Database / Implementation this affects, or "None"}} |
| Status | {{Active / Superseded / Deprecated}} |

## Open Questions
| # | Question | Priority | Owner | Reason | Blocking Impact | Suggested Resolution | Status | Decision |
|---|---|---|---|---|---|---|---|---|
| 1 | {{unresolved UX decision}} | {{Critical / High / Medium / Low}} | {{Planner / User / Architect / Implementer — whoever must decide}} | {{why this can't be decided by ux-design alone}} | {{what is blocked until this is answered}} | {{ux-design's recommendation, if any}} | open | |
