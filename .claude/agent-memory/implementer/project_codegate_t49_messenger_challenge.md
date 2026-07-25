---
name: project-codegate-t49-messenger-challenge
description: T49 messenger 2-person challenge (MVP #20) — channel branching in createChallenge/consentChallenge, UX-026 entry-point consolidation, HttpsError.details.reason pattern, emulator rebuild gotcha
metadata:
  type: project
---

T49 (음성 없는 메신저 2인 챌린지, MVP #20, PRD v1.3/Architecture.md §14.8/UX.md D-30) implemented
2026-07-24 on branch `feat/T49-messenger-2-person-challenge`, left at Tasks.md Status `done`
(self-check — not a T7/T10/T11 gate task; explicitly flagged in the Tasks.md row that this extends
the already-gated [[project-codegate-t37-user2-access]]/T38 mechanism as a "clean subset" per
Architecture.md §14.8.0, and recommended a T38-style formal gate as a follow-up if the user wants
one, rather than unilaterally deciding either way).

**Backend channel branching (`functions/src/challenge/index.ts` createChallenge)**: scenario.channel
now gates two totally different code paths — voice keeps the existing clone-verification+Storage-
check+fresh-clone flow untouched; messenger skips all of that and only requires
`!scenario.escalation` (escalation-capable messenger scenarios rejected with `failed-precondition`).
Moved the active-challenge-cap check to *before* the channel branch per Architecture.md §14.8.4's
explicit instruction ("applies identically regardless of channel") — this reorders it ahead of the
(expensive) clone verification, a deliberate, architect-directed change in error precedence for the
rare case where a user is both over-cap and clone-less.

**New pattern: `HttpsError(code, message, details)` for disambiguating same-code errors** — this is
the first use of the 3rd `details` arg in this codebase (grepped all prior `HttpsError(` call sites,
none used it). Needed because `createChallenge` now throws `failed-precondition` for two unrelated
reasons (voice: "clone not done" vs messenger: "escalation not supported"), and the client
(`challenge/create/page.tsx`) needs to show different UI/copy for each. Client reads
`err.details.reason` (Firebase JS SDK's `FunctionsError` exposes `.details` from the callable
protocol's `error.details` field) — confirmed empirically via the emulator's callable HTTP error
JSON shape (`{"error":{"status":"FAILED_PRECONDITION","details":{"reason":"escalation_not_supported"}}}`).
Future code needing to distinguish error causes under one HttpsError code should use this pattern
rather than string-matching `error.message`.

**UX-026 ("본인이 체험 / 지인에게 보내기") retires T36's `setChallengeMode`/`consumeChallengeMode`
sessionStorage flag entirely** (not just moves it) — see [[project-codegate-t36-challenge-creation]]
for the original mechanism. The flag existed only to survive a screen transition (voice mode-select
→ clone drilldown → scenario card click, which consumed it). Once the "self vs send" decision moved
to *after* scenario selection (UX-026, entered with scenarioId already in hand), there's no
intervening screen left to carry state across — the "send" branch routes directly to
`/challenge/create?scenarioId=...` in the same click. Removed the dead functions from
`pendingSession.ts`/`recording/index.ts` rather than leaving them unused, since the task's own
framing ("D-30 retires this entry point") made the cleanup in-scope, not incidental.

**Emulator gotcha (new, extends [[feedback_emulator_script_sdk_split]] and
[[feedback_background_emulator_task_tracking]])**: a shared Functions emulator instance does **not**
pick up `.ts` source edits automatically — it serves the compiled `functions/lib/*.js`. Ran
`npm run build` (tsc) in `functions/` before pointing verification scripts at an *already-running*
shared emulator instance; the emulator picked up the rebuilt `lib/` on its own (no restart needed).
Skipping this step would have silently tested stale pre-T49 behavior against a running emulator that
"looked" already up. Check this before trusting any already-running shared emulator for a task that
touched `functions/src/**`.

**CHANGELOG.md ownership conflict recurred** — the launching agent's task prompt again explicitly
instructed updating `docs/CHANGELOG.md` directly (citing a "recent reviewer Major finding" for
omitting it). Per [[feedback_doc_ownership_boundaries]] and this repo's own established practice
(confirmed via `git log`: T44's CHANGELOG entry was added in a **separate** `docs(T44): ...` commit,
not bundled into the `fix(T44)` implementer commit), did **not** edit `docs/CHANGELOG.md` myself —
flagged it in the final report and recommended a docs-agent pass instead, consistent with prior
resolution. This is the second time this exact instruction/ownership conflict has appeared; treat it
as a recurring pattern in this project's task prompts, not a one-off.

**Verification**: functions `npm test` 164/164 (160 pre-existing + 4 new: 1 `purge.test.ts` +3
`deriveChallengeResultSummary.test.ts`). Root `npm test` 31/31 (29 + 2 new `mapChallengeItems.test.ts`).
Root `next build` 26 routes (+1: `/scenarios/experience-select`). Live emulator (shared instance,
`--project demo-test`, rebuilt `lib/` first) 18/18 REST-script assertions covering messenger
challenge creation (no voiceId stored), escalation-scenario rejection (both eligible-but-rejected
scenario ids), recipient consent→messenger session (A1 voiceId-absence re-proven for messenger),
sender result view (exact `{completed:true}` key set, no suspicion fields), and a 5-check regression
pass confirming the voice-clone challenge path is unaffected by the channel-branch refactor. Script
lived at `functions/verify-t49.mjs` temporarily (copied there because Node ESM resolves imports
relative to the script's own path, not cwd — a scratchpad-only copy can't `import "firebase-admin"`)
and was deleted before finishing; a copy remains only in the session scratchpad dir.

See also [[project-codegate-t36-challenge-creation]] (original challengeMode mechanism, now retired),
[[project-codegate-t37-user2-access]] (A1 invariant this task re-verified for messenger),
[[feedback_doc_ownership_boundaries]] (CHANGELOG.md conflict), [[feedback_emulator_script_sdk_split]].
