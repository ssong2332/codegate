---
name: project-codegate-t29-messenger-chat
description: T29 messenger chat shell (UX-022/023/024) design and scope — sentinel-pattern reuse for smishing links, updateMessengerSkin callable rationale, escalation-scenario stub scoping, and a judgment call to skip emulator scripting when one was already running concurrently
metadata:
  type: project
---

T29 (메신저 채팅 화면, kakao/sms surfaces) completed 2026-07-23 as a self-check task (not a
T7/T10/T11 formal security gate, per docs/DefinitionOfDone.md). Files: `functions/src/roleplay/
linkMarker.ts` (new), `functions/src/session/index.ts` (+`updateMessengerSkin` callable),
`functions/src/shared/types.ts`/`session/types.ts`/`roleplay/types.ts` (schema increments),
`src/app/scenarios/messenger/page.tsx` (UX-024, new), `src/app/session/messenger/page.tsx`
(UX-022, new), `src/components/MessengerFakeLanding.tsx` (UX-023, new), `src/lib/messenger/
detectSkin.ts` (+test, new), `src/lib/api/updateMessengerSkin.ts` (new).

**Sentinel-pattern reuse for smishing links (design precedent worth remembering):** Architecture.md
§13.2 had already established the pattern for `[[SIGNAL:ESCALATE_VOICE]]` — assistant-output-only
control marker, server scans/strips before storage, never shown to the user. T29 applied the exact
same structural pattern to `[[LINK:id]]` markers (parsed by `extractLinkMarker`, called from both
`generateOpeningLine` and `sendMessage`, applied only to LLM completion text — never to user input).
This is a reusable idiom in this codebase: when a task asks the LLM-as-character to emit a
machine-readable side-channel signal inside its natural-language output, the established solution is
a fixed `[[NAMESPACE:value]]` bracket marker parsed server-side and stripped before the user ever
sees it, not function-calling.

**Why `updateMessengerSkin` needed to be a new callable, not a direct client write:**
`firestore.rules` blocks all client writes to `sessions/{sessionId}` (`allow write: if false`, added
during an earlier security-hardening pass, finding #3) — verified by reading the rules file rather
than assuming. Any session-document mutation from the client (skin auto-detect/manual-toggle
persistence here) requires a new `onCall` following the existing `endSession`
auth+existence+ownership-check pattern. This will recur for any future client-initiated session-field
update.

**Escalation-scenario scoping decision (explicit, user-directed narrowing — not my own call):** Of
T27's 4 messenger scenarios, 2 have `escalation` (child-impersonation-kakao, subsidy-smishing-sms) and
2 don't (friend-loan-kakao, parcel-smishing-sms). T29's instructions explicitly scoped the
escalation-capable 2 to a "coming soon" stub in `/scenarios/messenger` (same pattern T28 used for the
whole messenger branch before T29 existed) since UX-025/T30 (voice-selection subflow + actual
escalation trigger) don't exist yet. Only the non-escalation 2 got a fully working end-to-end chat
(kakao no-link + sms with-link), which was sufficient to cover kakao/sms/link-tap paths for AC-030/
031/032/045/047. Whoever implements T30 needs to wire this stub branch to the real UX-025 flow — flagged
in the Tasks.md T29 row as a required follow-up, same lineage as the T28→T29 handoff.

**Judgment call: skipped spinning up a fresh Firebase emulator for scripted REST verification this
time.** Unlike T4/T5/T8/T9/T10 (which each started their own emulator suite, scripted verification via
REST calls, then deleted the script), this session found a Firebase Emulator UI *already listening* on
port 4000 (via `netstat`) when starting the verification step — almost certainly another concurrent
agent/session's active state (see [[project-codegate-t15-history]] for the general shared-worktree
hazard this repo has). Rather than risk writing test users/sessions into another session's live
emulator data, verification for this task relied on: lint/build/test (functions 107/107 including 4 new
linkMarker tests, root 19/19 including 7 new detectSkin tests) + structural grep evidence (zero
`window.open`/`location.href`/`fetch`/`httpsCallable` matches in `MessengerFakeLanding.tsx` and no
external-URL `router.push` in the chat page, as code-level proof for AC-045's "no send path exists"
requirement) instead of a live emulator click-through. No computer-use/Chrome MCP browser tool was
bound in this session either (consistent with every prior implementer task in this project) — real
click-through remains unverified and is flagged as such in the Tasks.md status.

**Recurrence confirmed:** the multi-agent shared-worktree hazard from [[project-codegate-t15-history]]
happened again here — `git status` showed several files modified that this task never touched
(`src/app/globals.css`, `src/content/scenarios/familyAccidentDeepvoice.ts`,
`src/lib/recording/{index.ts,pendingSession.ts}`, `functions/src/scenarios/__tests__/
scenarios.test.ts`, plus various T27 content files) — confirmed via `git diff --stat` on exactly the
files this task's own Edit/Write calls touched, which matched intent precisely. Lesson reaffirmed:
always diff-check scope after editing in this repo rather than trusting the initial `git status`
snapshot, since it can go stale mid-session.

See also [[project-codegate-t26-channel-transition]] (if it exists — Architecture.md §13 schema this
task implemented against), [[project-codegate-t15-history]] (shared-worktree hazard origin),
[[feedback_doc_ownership_boundaries]] (why API.md/CHANGELOG.md drift was flagged, not fixed).
