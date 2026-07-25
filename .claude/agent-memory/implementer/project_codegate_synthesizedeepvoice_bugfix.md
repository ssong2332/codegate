---
name: project-codegate-synthesizedeepvoice-bugfix
description: Cross-track bugfix (2026-07-21) — src/lib/api/synthesizeDeepvoice.ts was still a T2 dummy stub despite T5's session/play screen calling it; fixed to real httpsCallable. Also documents the server-side ownership-check gap this fix flagged, later closed same day.
metadata:
  type: project
---

Standalone cross-track bugfix (not a numbered Tasks.md task) fixed 2026-07-21, discovered during
[[project-codegate-t8-session-lifecycle]]'s self-check and reported by the user as a follow-up bug
report. Files: `src/lib/api/synthesizeDeepvoice.ts` only (source). `docs/Tasks.md` T5 row's Status
column appended with a note (per user's explicit direction to place it there, since UX-005/
`session/play/page.tsx` is the T5-owned screen this bug silently broke).

**The bug:** `src/lib/api/synthesizeDeepvoice.ts` was still the T2 dummy stub (hardcoded
`audioUrl: "/mock-audio/mock-deepvoice-stub.mp3"`, a file that doesn't exist) despite
[[project-codegate-t5-deepvoice-playback]]'s `session/play/page.tsx` calling it and T5's own
Tasks.md row claiming "실호출" verification — T5's emulator verification exercised the server
callable directly via a throwaway script, never through this client wrapper, so the gap went
undetected. Same root cause class as [[project-codegate-t8-session-lifecycle]]'s
createSession/endSession stub-gap fix, just for the one file T8 explicitly flagged but didn't fix
(out of T8's own scope at the time).

**Fix:** replaced with `httpsCallable(functionsClient, "synthesizeDeepvoice")`, exact same pattern
as `createSession.ts`/`endSession.ts`/`createVoiceClone.ts`. No changes to
`functions/src/voice/index.ts` (server side) or `session/play/page.tsx` (already called the
wrapper correctly — the wrapper itself was the only broken link).

**Scope decision — did NOT fix `src/lib/api/sendMessage.ts` in the same pass**, even though it's
the identical T2-stub pattern (flagged again by [[project-codegate-t8-session-lifecycle]]).
Reasoning recorded in Tasks.md T5 row and here: (1) `session/chat/page.tsx` (UX-006) is still a
full stub with zero references to `sendMessage` — unlike synthesizeDeepvoice, this stub is not
currently causing any live screen to silently show fake data, so it isn't "the bug" being
reported; (2) the server `SendMessageResponse` (functions/src/roleplay/types.ts, via
`completion.isMock`) includes an `isMock` field that the client `src/lib/api/types.ts`
`SendMessageResponse` type does **not** declare — a second, separate contract-drift issue that
would need to be untangled too, expanding this fix beyond a narrow bugfix; (3) DoD explicitly
requires "no unrelated files modified" and CLAUDE.md prohibits unrequested scope expansion. Left
as an explicit recommendation for whoever builds the UX-006 chat screen next.

**Newly discovered gap (flagged, not fixed — out of scope per task instruction not to touch this
file unless truly necessary):** `functions/src/voice/index.ts`'s `synthesizeDeepvoice` callable
has **no session-ownership check** (`session.uid === request.auth.uid`), unlike
`createVoiceClone`/`createSession`/`endSession`. Verified live: a second uid's call on someone
else's `sessionId` succeeds instead of throwing `permission-denied`. Recommend a security-hardening
follow-up (adjacent to T11's PII/injection scope) add this check.

**CLOSED 2026-07-21 (same-day follow-up security fix):** added the exact `createVoiceClone`
ownership pattern (`sessions/{sessionId}` read → `existingSnap.exists && data.uid !== uid` →
`permission-denied`) to `synthesizeDeepvoice` in `functions/src/voice/index.ts`. Non-existent
sessionId still passes through permissively (deliberately matches `createVoiceClone`, not
invented). Re-verified live via emulator REST calls (not client SDK this time — see
[[project-codegate-t5-deepvoice-playback]] for why the client SDK approach needs both `firebase`
and `firebase-admin` in the same node_modules tree, which don't coexist in this repo's root vs
`functions/` split; REST calls to the Auth/Functions emulator sidestepped that): owner call still
succeeds (no regression), cross-uid attacker call now gets `permission-denied`, nonexistent-session
call still passes through. functions build/lint/test (36/36) all clean, no regression. Noted in
Tasks.md T5 row's Status cell as a dated addendum, same placement convention as this bugfix.

**Verification:** root lint/build clean; `functions` lint/build clean, `npm test` 36/36 unmodified
(no regression); a throwaway `verify-synthesizeDeepvoice-fix.mjs` (client SDK, deleted after use,
never committed) against `firebase emulators:start --only auth,firestore,storage,functions
--project demo-test` — 6/6 assertions passed confirming the real Mock response (data-URI beep
audio, `isMock:true`, correct `syntheticLabel`) is now reached through the client wrapper, and the
old hardcoded stub path is gone. Cross-uid ownership gap above was observed via the same script but
NOT asserted as pass/fail (pre-existing server gap, not caused by or fixable within this change).
Emulator cleanup followed [[feedback-background-emulator-task-tracking]]'s pattern.

**docs/Tasks.md note:** this fix has no dedicated task row (not one of planner's numbered tasks) —
per user's explicit direction, appended a dated note to the end of T5's Status cell rather than
creating a new row (creating/renumbering rows is planner's exclusive ownership per AGENTS.md;
appending to an existing Status cell for a screen this task owns is within implementer's Status
column authority).

See also [[project-codegate-t8-session-lifecycle]] (where this gap was first flagged but not
fixed, alongside the createSession/endSession stub-gap that WAS fixed there),
[[project-codegate-t5-deepvoice-playback]] (the screen whose silent breakage this fixes),
[[feedback-background-emulator-task-tracking]] (emulator cleanup pattern reused).
