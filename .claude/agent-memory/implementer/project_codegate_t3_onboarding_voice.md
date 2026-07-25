---
name: project-codegate-t3-onboarding-voice
description: T3 onboarding consent + voice recording UI — pendingSessionId cross-track design gap for T4/T8, files created, emulator verification approach reused
metadata:
  type: project
---

T3 (온보딩 동의 게이팅 + 본인 목소리 등록 UI) implemented 2026-07-21. Files: `src/app/onboarding/consent/page.tsx`
(UX-001, writes `users/{uid}/consents/{consentId}` via new `src/lib/consent/index.ts`
`grantConsent`/`hasGrantedConsent`), `src/app/onboarding/record/page.tsx` (UX-002, consent-gated —
redirects to `/onboarding/consent` if `hasGrantedConsent(uid)` is false), `src/lib/recording/
useVoiceRecorder.ts` (new — `getUserMedia`+`MediaRecorder` hook, 30s auto-stop / 20s min length,
mic-only capture, no file-upload UI anywhere per AC-020/ADR-0002), `src/lib/recording/
pendingSession.ts` (new).

**Cross-track design gap flagged (not silently resolved) — matters for whoever implements T4/T8:**
API.md's `createVoiceClone` needs an existing `sessionId`, and Database.md's Storage path is
`users/{uid}/sessions/{sid}/voice_input.webm` — but the real `sessions/{sessionId}` Firestore doc
is only created later by `createSession` (T8), which **generates its own new sessionId
server-side** (its request doesn't accept a client-supplied id) after scenario selection. So at
recording time (UX-002/003) no session id exists yet. Resolved for T3's scope only: record page
generates a `crypto.randomUUID()` "pending session id" via `getOrCreatePendingSessionId()`,
stored in `sessionStorage` (not Firestore), reused for the Storage upload path. **This id will
only line up with the real session unless T4/T8 deliberately adopt it** (e.g. `createSession`
accepting a client-supplied id, or T4's `createVoiceClone` handler creating the `sessions/{sid}`
doc itself using this id) — that contract change is out of T3's authority (API.md is
architect-owned) and was not made. Whoever picks up T4 needs to read `getPendingSessionId()`
(exported from `src/lib/recording`) to know which id the uploaded recording lives under.
Same applies to `identitySelfConfirmed` (Database.md `sessions` field) — logged to
`sessionStorage` via `setIdentityConfirmed(true)` on successful upload since no `sessions` doc
exists yet to write it into; T4/T8 must copy this into the real Firestore doc once created.

**Emulator verification approach (reused from [[project-codegate-firebase-build-blocker]]):** wrote
a throwaway `verify-t3.mjs` at repo root (deleted after use, never committed), ran against
`firebase emulators:start --only auth,firestore,storage --project demo-test`, confirmed: (1)
consent doc write under own uid succeeds, (2) the `hasGrantedConsent` query finds it, (3) a
1KB `audio/webm` upload to `users/{uid}/sessions/{sid}/voice_input.webm` succeeds under
storage.rules, (4) the same upload to a different uid's path is rejected with
`storage/unauthorized`. All 4 passed. Cleanup verified: script deleted, emulator java/node
processes killed, ports confirmed no longer LISTENing (only transient TIME_WAIT), `firestore-debug.log`
(gitignored by `*.log`) removed.

**What is NOT verified** (same class of gap as T18): actual browser mic permission prompts,
real `MediaRecorder` capture/playback in a live browser, and the record page's UI state machine
(idle → requesting-permission → recording → stopped) were reviewed by reading the code, not
exercised in a real browser — no browser-automation tool is available in this environment. Said
so explicitly in Tasks.md's T3 Status cell rather than claiming full verification.

See also [[project-codegate-context]] (hackathon DoD mode — T3 is not one of the 3 security-gate
tasks, so self-check alone can make it `done`) and [[project-codegate-firebase-build-blocker]]
(the `.env`/emulator setup this verification reused).
