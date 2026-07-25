---
name: project-codegate-t36-challenge-creation
description: T36 2-person social challenge (user1 side) — Database.md storage-path deviation, entry-point flag design, isolated-emulator-instance technique for a missing Storage emulator, live scheduled-function trigger verification
metadata:
  type: project
---

T36 (2인 — 사용자1 챌린지 생성·클론 스코프·공유 링크) implemented 2026-07-24, left at Tasks.md Status
`done` (self-check — not a T7/T10/T11 gate task; T38 will do the formal reviewer/QA batch security
gate covering both T36+T37, same structure as T27-T30→T31). Files: `functions/src/challenge/
{types,token,purge,index}.ts` (new module folder), `functions/src/shared/types.ts` (+`ChallengeDoc`
family, `DeletionLogDoc.challengeId?`/`.sessionId?` now optional), `functions/src/shared/
constants.ts` (+`CHALLENGE_FREE_ACTIVE_CAP`/`_LINK_EXPIRY_MS`/`_DEFAULT_RETENTION_MS`),
`firestore.rules`/`firestore.indexes.json` (+`challenges` block/composite index), `functions/src/
index.ts` (+3 export lines, coexisted cleanly with a concurrent T40 export addition), `src/app/
challenge/{create,results}/page.tsx` (UX-019/020), `src/lib/challenge/` (new, fetch+pure mapping,
mirrors `src/lib/history/` pattern), `src/lib/api/{createChallenge,deleteChallenge}.ts`, `src/lib/
recording/pendingSession.ts` (+`setChallengeMode`/`consumeChallengeMode`), `src/app/scenarios/
voice/{page.tsx,ScenarioListView.tsx}` (entry card + branch).

**Real Database.md vs. task-instruction conflict, resolved by following the explicit instruction and
flagging the deviation (not by silently picking one)**: Database.md defines a dedicated
`users/{uid}/challenges/{cid}/voice_input.webm` upload path + implies a new recording screen for
challenge creation. The task's detailed instructions explicitly said to reuse the caller's *existing*
onboarding-session recording via `voiceInputStoragePath` instead, and the "What to build" list never
mentioned a new recording screen. Implemented the instructed approach (query caller's most recent
`cloneStatus:"ready"` session via the existing uid+createdAt index, reuse its recording as source for
a *fresh* dedicated ElevenLabs clone) and documented the deviation prominently in code comments +
the Tasks.md done() note, recommending architect follow-up. **Known consequence**: since T10's
`onSessionEnded` trigger immediately purges a session's Storage files once that session ends, this
only works if the source session hasn't been ended+purged yet — handled by treating a missing
recording the same as "no clone" (`failed-precondition`, redirects to onboarding), not a crash.

**`DeletionLogDoc.sessionId` made optional (not explicitly instructed by ADR-0005's follow-up text,
but logically required)**: ADR-0005 only said "add optional `challengeId`" to `DeletionLogDoc`, but
challenge-triggered deletion logs have no `sessionId` at all — leaving `sessionId` as a required TS
field would make it impossible to type-check a challenge deletion log correctly. Made it optional too,
documented the reasoning inline as a judgment call, flagged for architect confirmation. See
[[project-codegate-t10-purge-guardrail]] for the original `DeletionLogDoc` shape this extends.

**Entry-point judgment call**: added a "지인에게 딥보이스 체험 보내기" card to `/scenarios/voice`
(UX-016) that sets a `challengeMode` sessionStorage flag (new `setChallengeMode`/`consumeChallengeMode`
in `pendingSession.ts`, same idiom as T30's `messengerVoiceSelectReturn`) and routes straight into the
clone drilldown (`/scenarios/voice/clone`), skipping the redundant clone/generic choice since
challenges are always clone-only. The actual branch happens in `ScenarioListView.handleStart` — if the
flag is set (consumed unconditionally every call, a deliberate self-healing design so a stale flag
from an abandoned attempt clears itself on the next click) **and** the chosen scenario is clone-mode,
it skips record/clone/wait and `createSession` entirely and navigates straight to `/challenge/
create?scenarioId=...` — `createChallenge` re-verifies "has a completed clone" server-side, so users
who already have one skip re-recording (matches UF-004's "reuse existing clone" alternative flow).
Known narrow edge case documented in code: an abandoned challenge attempt followed immediately by an
unrelated *clone*-scenario normal training could get one wrongly redirected click before self-healing
— accepted as disproportionate to fix for hackathon scope.

**Isolated-emulator-instance technique for a shared emulator missing a required component (new
pattern, extends [[feedback_background_emulator_task_tracking]])**: found an already-running shared
emulator (per the established "check `curl 127.0.0.1:4000` before starting your own" convention) that
lacked the Storage emulator entirely (only auth/functions/firestore/eventarc/tasks were up, confirmed
via `curl 127.0.0.1:4400/emulators` hub listing) — `createChallenge` needs Storage to check recording
existence, and calling it against that shared instance crashed with a raw `ECONNRESET` (admin SDK
falling through to real GCS with no credentials) instead of a clean error. Rather than disrupt the
shared instance (concurrent T33/T40 work might depend on it) by restarting it with Storage added,
temporarily edited `firebase.json`'s `emulators` port block to alternate ports (auth 19099/functions
15001/firestore 18080/storage 19199, `ui.enabled:false` to dodge the 4000 conflict), started a fully
isolated second emulator instance via `Bash` tool's own `run_in_background` (not a manual `&`
launcher — this time `TaskStop` on it still didn't actually kill the process tree, same gotcha as
[[feedback_background_emulator_task_tracking]], had to `taskkill //PID <pid> //F //T` regardless),
verified everything there (26/26 REST-script assertions), then killed it and `git checkout --
firebase.json` to restore the tracked file exactly, confirmed via `git diff --stat` showing empty.
Confirmed the original shared emulator's ports/state were untouched throughout. **General lesson**:
"an emulator is already running" is necessary but not sufficient — check it actually has every
component (`--only` list) the task needs before trusting it, via the hub's `/emulators` endpoint, not
just a port-listening check.

**Scheduled function (`onSchedule`, first one in this codebase) got genuine live E2E verification, not
just a pure-fn fallback**: the task description anticipated pure-unit-test-only verification might be
necessary since "Cloud Scheduler may not be triggerable in the emulator." In practice the Firebase
Functions emulator exposes scheduled functions at `<name>-0` and accepts a plain `POST` to that path
as a manual trigger (confirmed via the emulator's function-list error message enumerating
`us-central1-purgeExpiredChallenges-0`). Seeded a challenge with a past `retentionDeleteAt`, POSTed to
`.../purgeExpiredChallenges-0`, and confirmed `status` flipped `pending`→`deleted` and a `deletionLogs`
entry appeared — real proof, not just the `selectChallengesToPurge` pure-fn unit test. Worth trying
this endpoint pattern before assuming a scheduled function can't be verified live in future tasks.

**Test counts**: functions `npm test` 134/134 (125 pre-existing + 9 new: 4 `token.test.ts` + 5
`purge.test.ts`) — coexisted cleanly with T40's concurrent test additions landing in the same run.
Root `npm test` 29/29 (23 + 6 new `mapChallengeItems.test.ts`). Root `next build` 24 routes (+2:
`/challenge/create`, `/challenge/results`).

See also [[project-codegate-t10-purge-guardrail]] (purge architecture reused here),
[[feedback_background_emulator_task_tracking]] (background-emulator PID-kill gotcha, now confirmed to
also apply when launched via the Bash tool's own `run_in_background` rather than a manual `&`),
[[feedback_emulator_script_sdk_split]] (REST-script pattern reused), [[project-codegate-context]]
(hackathon self-check DoD mode), [[project-codegate-t30-channel-escalation]] (the
`messengerVoiceSelectReturn` sessionStorage-flag idiom this task's `challengeMode` flag copies).
