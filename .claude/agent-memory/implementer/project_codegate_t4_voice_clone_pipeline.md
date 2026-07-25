---
name: project-codegate-t4-voice-clone-pipeline
description: T4 voice clone pipeline integration — how the T3 pendingSessionId/createSession gap was closed, createSession's minimal diff, emulator verification, what's left for T5/T8/scenario-selection UI
metadata:
  type: project
---

T4 (음성 클론 파이프라인 통합) implemented 2026-07-21, left at Status `done` (self-check — T4 is not
one of the 3 hackathon security-gate tasks per DefinitionOfDone.md, so no formal reviewer/QA gate
was required). Files: `functions/src/voice/index.ts` (`createVoiceClone` — added Storage
`voice_input.webm` existence check, `sessions/{sid}` merge-write of
uid/voiceId/cloneStatus/voiceProvider/identitySelfConfirmed, ownership check via
`permission-denied`; exported `voiceInputStoragePath()` helper + unit test),
`functions/src/session/{index,types}.ts` (`createSession` — see diff below),
`src/lib/api/{createVoiceClone,types}.ts` (real `httpsCallable` wiring, replacing the T2 dummy
stub), `src/app/onboarding/record/page.tsx` (wired "클론 생성" button to actually call
`createVoiceClone` after upload, added a `cloning` UI state), `src/app/clone/wait/page.tsx`
(UX-003, implemented — subscribes to `sessions/{sid}.cloneStatus` via `onSnapshot`, no real
timeout/fallback logic since Mock always resolves instantly — explicit prototype-stage scope
decision, not an oversight).

**How the [[project-codegate-t3-onboarding-voice]] sessionId gap was closed:** `createVoiceClone`
now treats the client-supplied `sessionId` (which may be T3's client-generated
`pendingSessionId`, no real `sessions/{sid}` doc yet) as the doc id directly — if the doc doesn't
exist it creates a **minimal pending doc** (`sessionId`, `status:"created"`, `createdAt`, plus the
clone-result fields) via `.set(patch, {merge:true})`; it deliberately omits `scenarioId` since
Database.md's "required" is a completed-session invariant, not a mid-clone one.

**`createSession`'s exact minimal diff (T7-owned file, only this touched):** added optional
`sessionId?: string` to `CreateSessionRequest` (both `functions/src/session/types.ts` and
`src/lib/api/types.ts`, additive/backward-compatible). In the callable body: if `sessionId` is
provided, look up `db.collection("sessions").doc(sessionId)` instead of `.doc()` (auto-id);
verify `existing.data()?.uid === caller.uid` else `permission-denied`; changed the final
`.set(sessionDoc)` to `.set(sessionDoc, {merge:true})` so it doesn't clobber the pending doc's
`voiceProvider` field. Nothing else in the file changed — persona/guardrail/prompt-assembly logic
untouched, verified by reading the diff before finishing.

**Emulator verification (reused [[project-codegate-t3-onboarding-voice]]'s approach):** wrote a
throwaway `verify-t4.mjs` (deleted after use, never committed) using the **client** `firebase/*`
SDKs (not admin) against `firebase emulators:start --only auth,firestore,storage,functions
--project demo-test`, signing in anonymously as separate users to simulate different uids. All 7
assertions passed: (1) `createVoiceClone` returns `isMock:true`+`mock-`-prefixed voiceId, (2) the
pending doc is created with the right fields and no `scenarioId`, (3) `createSession` adopts the
exact same `sessionId` (no new id minted), (4) the adopted doc merges `scenarioId`/`status:active`
while keeping `voiceId`/`cloneStatus`/`voiceProvider` from the clone step, (5) `createVoiceClone`
on another uid's sessionId → `permission-denied`, (6) same for `createSession`, (7)
`createVoiceClone` with no uploaded recording → `failed-precondition`. Cleanup verified: script
deleted, emulator process tree force-killed via `taskkill /PID <pid> /F /T` (see
[[feedback-background-emulator-task-tracking]] for why — the Bash tool's own background-task
tracker reported "completed" instantly even though the real emulator process kept running), ports
confirmed no longer LISTENing, `firestore-debug.log` removed.

**`npm run build` at the repo root now succeeds** (both root Next.js and `functions/`) —
[[project-codegate-firebase-build-blocker]]'s original failure was already resolved by T18's
demo-project `.env`; re-verified fresh in this task, no action needed.

**What is NOT verified:** actual browser clicking through record page → clone/wait navigation
(same class of gap as T3/T18 — no browser-automation tool available). Also,
`src/app/scenarios/page.tsx` is still a T2/T6 stub that doesn't call `createSession` yet, so the
`sessionId`-adoption path was only exercised via the emulator script's direct callable
invocation, not through any real screen — **whoever builds the scenario-selection UI next must
remember to pass `getPendingSessionId()` as `sessionId` into `createSession`**, or the adoption
logic added here goes unused and a fresh id gets minted instead (silently reintroducing the T3
gap). Flag this explicitly to whoever picks up scenario-selection/T5/T8 continuation.

**Docs drift (not fixed here, out of implementer's edit authority):** API.md's `createSession`
request contract (`{scenarioId, voiceId}`) doesn't document the new optional `sessionId` field —
recommend an architect/docs Update Request next time API.md is touched.

See also [[project-codegate-context]] (hackathon DoD mode — T4 needed only self-check, not
reviewer/QA), [[project-codegate-t19-voice-mock]] (the `VoiceProvider`/Mock this task builds on
top of), [[project-codegate-t7-roleplay-mock]] (the `createSession` file this task made a scoped
edit to).
