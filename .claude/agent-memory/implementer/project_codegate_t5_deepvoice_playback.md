---
name: project-codegate-t5-deepvoice-playback
description: T5 deepvoice in-app playback + synthetic label — how the T4 scenario-selection gap was closed, sequential multi-line playback design, what was deliberately left untouched in functions/src/voice/index.ts
metadata:
  type: project
---

T5 (딥보이스 가족사칭 오디오 인앱 재생 + "AI 훈련용 합성" 표식) implemented 2026-07-21, left at
Status `done` (self-check — T5 is not one of the 3 hackathon security-gate tasks per
DefinitionOfDone.md). Files: `src/app/scenarios/page.tsx` (UX-004, full rewrite from T2/T6 stub),
`src/app/session/play/page.tsx` (UX-005, full rewrite from T2 stub).

**Closed the [[project-codegate-t4-voice-clone-pipeline]] cross-track gap:** `scenarios/page.tsx`
now actually calls `createSession`. Design: read `getPendingSessionId()` (T3's client-only pending
id) → one-shot `getDoc(sessions/{sid})` to confirm `cloneStatus==="ready"` and read `voiceId` → user
picks a scenario card from `src/content/scenarios` (static content, **not** a Firestore `scenarios`
collection read — deliberate choice, see below) → `createSession({sessionId: pendingId, scenarioId,
voiceId})` → on success `router.push("/session/play")`. This is the first real caller of the
sessionId-adoption logic T4 added to `functions/src/session/index.ts` — confirmed via emulator that
the response `sessionId` exactly equals the client-supplied `pendingSessionId` (no new id minted).

**Why static content instead of Firestore `scenarios` read for the list:** UX.md UX-004 Architect
Handoff explicitly allows either ("Firestore 또는 정적 콘텐츠"), and [[project-codegate-t6-scenario-content]]
confirmed the seed script has never actually been run against a real Firebase project (no
`firebase use --add` yet) — depending on a Firestore read here would silently break in this
environment. `session/play/page.tsx` reuses the same static-content lookup keyed by the
`scenarioId` written into `sessions/{sid}` by `createSession`, so no new client-side storage
mechanism was needed to carry the selection across pages — Firestore itself is the hand-off.

**session/play/page.tsx (UX-005) design:** plays the scenario's `deepvoiceLines` **sequentially**
(3 lines for the family-accident scenario), calling `synthesizeDeepvoice({sessionId, lineId})` once
per line, showing each line's text as a caption (`aria-live="polite"`) while its (currently mock
beep) audio plays, auto-advancing on the `<audio>` element's `onEnded`. A user tap ("재생 시작") is
required to begin (browser autoplay-policy note in UX.md), and `<audio controls>` is always
rendered once a line's `audioUrl` resolves so a blocked `.play()` promise still leaves the user a
manual fallback (silently swallowed rejection, not treated as an error state). `SyntheticLabel`
(persistent screen label) + a text preroll notice paragraph (AC-022's "오디오 프리롤 안내" —
implemented as text-only per this task's explicit instruction that Mock-stage text is sufficient,
no TTS/audio preroll added) are both always visible. `EndTrainingButton` is always rendered
regardless of playback state (AC-006) and — since T8's `endSession` callable is still
`unimplemented` — its `onClick` **only** does `audioRef.current?.pause()` +
`router.push("/session/end")`, no real session-termination API call. This is a deliberate minimal
choice per this task's explicit instruction, flagged in Tasks.md's T5 row for whoever implements T8.
"계속 (역할극 시작)" after the last line links to `/session/chat` (UX-006) — that screen itself was
**not** touched (still T7/T8's stub), only the navigation link was wired, per this task's explicit
scope boundary.

**Deliberately did NOT touch `functions/src/voice/index.ts`'s `synthesizeDeepvoice`**, despite its
inline `TODO(T5)` comments (resolve `lineId`→real dialogue text server-side, look up
`sessions/{sid}.voiceId` instead of a hardcoded placeholder, Storage upload + `artifacts/{artifactId}`
manifest write). Reasoning: (1) this task's own instructions explicitly named this exact file and
said "don't touch unless truly necessary"; (2) under `MockVoiceProvider`, `text`/`voiceId` inputs to
`provider.synthesize()` are ignored entirely (`void input`), so this TODO is currently a
latent/invisible gap, not a functional bug — it only becomes a real problem once a real ElevenLabs
provider replaces Mock; (3) the Storage-upload/artifacts-manifest half of the TODO is arguably
[[project-codegate-context]]'s T10 (AC-021 "생성물 즉시 폐기") territory, not named in T5's own AC
scope (AC-019/022/006). Recommend whoever swaps in the real ElevenLabs provider (post T1) or
picks up T10 revisit these TODO(T5) markers — they are still exactly as T19 left them.

**No new frontend test framework added** (same precedent as [[project-codegate-t3-onboarding-voice]]/
[[project-codegate-t4-voice-clone-pipeline]]/T18 — see [[project-codegate-t19-voice-mock]]'s note
that this needs an architect DECISIONS.md entry, out of implementer authority to just add). Evidence
for DoD instead came from (a) `npm run lint`/`npm run build` (root, clean) + `functions`
`npm run build`/`npm test` (34/34, unmodified, confirms no regression), (b) a throwaway
`verify-t5.mjs` (deleted after use, never committed) exercising the exact client callable-request
shapes both new pages now use against `firebase emulators:start --only auth,firestore,storage,
functions --project demo-test`: createVoiceClone → createSession (sessionId-adoption assertion) →
synthesizeDeepvoice×3 (audioUrl/isMock/syntheticLabel per line) → cross-uid session-hijack rejection
(`permission-denied`). All 19/19 assertions passed. **Emulator gotcha hit and fixed**: calling
`signInAnonymously(auth)` a second time on the same client `Auth` instance does **not** mint a new
uid — Firebase Auth silently reuses the existing anonymous session. Must `await auth.signOut()`
before the second `signInAnonymously()` call to actually simulate a different user; this initially
made the ownership-rejection assertion falsely fail (call succeeded instead of throwing) until
fixed. Emulator cleanup followed [[feedback-background-emulator-task-tracking]]'s pattern exactly
(background task reported "completed" instantly; real PIDs found via `netstat`, killed via
`taskkill //PID <pid> //F //T`, ports re-confirmed clear).

**What is NOT verified:** real browser interaction (tapping "재생 시작", sequential autoplay
across 3 lines, `<audio onEnded>` firing correctly, EndTrainingButton click) — same class of gap as
every prior UI task in this repo ([[project-codegate-t3-onboarding-voice]],
[[project-codegate-t4-voice-clone-pipeline]], T18) since no browser-automation tool is available
here. Reviewed by reading the code, not exercised live.

See also [[project-codegate-context]] (hackathon DoD self-check mode), [[project-codegate-t19-voice-mock]]
(the `VoiceProvider`/Mock + `isMock` pattern this task's pages consume via `synthesizeDeepvoice`),
[[project-codegate-t6-scenario-content]] (the static scenario content this task reads directly),
[[project-codegate-t4-voice-clone-pipeline]] (the sessionId-adoption gap this task closes, and the
exact wording of the gap left for "whoever builds the scenario-selection UI").
