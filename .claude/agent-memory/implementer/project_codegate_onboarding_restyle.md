---
name: project-codegate-onboarding-restyle
description: Onboarding flow visual restyle (page.tsx, login, consent, record, clone/wait) to match design handoff — reuse patterns for other screen restyle passes
metadata:
  type: project
---

Restyled the 5 onboarding-flow screens (`src/app/page.tsx`, `src/app/(auth)/login/page.tsx`,
`src/app/onboarding/consent/page.tsx`, `src/app/onboarding/record/page.tsx`,
`src/app/clone/wait/page.tsx`) 2026-07-24 against a user-supplied high-fidelity design handoff
(`.dc.html` Tailwind prototypes under a Downloads folder, not in the repo). Pure visual pass — zero
state-machine/logic changes.

**Key discovery: `src/components/ui/{Button,Badge,SelectableCard,ProgressSteps,Banner}.tsx` existed
in the repo but were used NOWHERE** (grep for `from "@/components/ui"` returned zero hits before this
task). They were pre-built for this kind of restyle work and sat orphaned — worth grepping for
unused shared components before assuming a screen needs bespoke styling in any restyle/design-system
task in this repo.

**Judgment calls made (flagged to user in the handoff report, not silently decided):**
1. Added a `Banner variant="caution" sticky` to consent page that wasn't there before (new element,
   not just a restyle) — justified because it's literally the shared component the design system
   built for this exact purpose (AC-012 disclosure) and the task brief explicitly named Banner as a
   component to use. Still flagged since "add a new element" nominally exceeds pure restyle.
2. Kept native `<input type="checkbox">` (sized to 32px + `accent-[#0E6B62]` + `rounded-[10px]`)
   instead of replacing with the mock's custom `<div>`+SVG-check-icon pattern — native checkbox
   keyboard/screen-reader semantics are non-negotiable per task's accessibility constraint, and
   reimplementing as a clickable div would need manual `role="checkbox"`/`aria-checked`/keydown
   handling for zero visual gain over `accent-color` styling.
2b. Kept native `<audio controls>` for record-page playback instead of the mock's custom play button
   + progress bar — rebuilding playback control would be new logic (forbidden), not restyle.
3. `clone/wait` mock shows a fake 3-substep timer (`분석 중→생성 중→준비 완료`) driven by its own
   demo `setTimeout`s. Real app only has a binary Firestore `cloneStatus` signal (pending/ready) —
   did NOT fabricate the 3rd step; collapsed to 2 *truthful* steps ("목소리 확인 완료" — always true
   once this page is reached, since upload+createVoiceClone already succeeded — and "가상 음성 생성
   중/완료" tied to real `cloneState`). Documented as a deliberate refusal to fake progress granularity.
4. Mock's clone-wait screen has a manual "훈련 시작하기" button on completion; real app's Effect 2
   auto-calls `createSession` and navigates the instant `cloneState==='ready'` — no user click exists
   in that state (it's transient). Did NOT add a manual button since that would change auto-start to
   manual-start (functional change, forbidden). This is a known irreconcilable mock-vs-code gap, not
   a bug.
5. Reused the *existing* `globals.css` `.call-wave-bar` keyframe (already defined for the call screen,
   already respects `prefers-reduced-motion`) for the record-page waveform bars instead of adding new
   `@keyframes` — `globals.css` was out of this task's file scope, and this class's semantics
   (scaleY pulse bar) matched the mock's "wave" animation closely enough to repurpose without editing
   an out-of-scope file.
6. Added a caption line under the login button ("로그인 시 개인정보는 훈련 목적으로만 사용됩니다.")
   that didn't exist in the original code — it's verbatim mock copy, flagged as new textual content
   (not just restyle) since it makes a quasi-privacy claim.
7. Deliberately did NOT adopt the mock's login-screen hero tagline copy ("안 당해본 사기는 못
   막는다") for the login page's `<h1>` — kept the original literal "로그인" heading text to avoid
   inventing/duplicating marketing copy not requested; that tagline is already used on the root
   `page.tsx` splash. Root `page.tsx`/login now both got the same shield+checkmark logo icon (SVG
   copied verbatim from the mock, purely decorative, no text content risk) as their visual anchor.

**Verification:** `npx eslint <5 files>` clean (no output). `npx tsc --noEmit` fails repo-wide on 6
pre-existing `.test.ts` files (`TS5097`, `.ts` import extensions — see [[project-codegate-t15-history]]
"no test runner in root" note) — confirmed via `git status --porcelain` that none of those test files
are modified by me, so this is pre-existing baseline noise, not a regression. `npm run build`
(Next.js's own typecheck, which excludes `*.test.ts`) succeeded cleanly and listed all 24 routes
including the 5 touched ones. `git diff --stat` scoped to exactly the 5 target files (346
insertions/141 deletions), confirming no unrelated-file bleed despite a heavily concurrent shared
worktree (5 *other* files were mid-edit by other sessions at the same time — `challenge/create`,
`globals.css`, `scenarios/messenger`, `session/end`, `session/play` — none touched by this task, per
the now-familiar [[project-codegate-t33-replay]]/[[project-codegate-t37-user2-access]] concurrent-
worktree pattern).

Not run: live browser/manual click-through (no browser-automation tool in this environment, consistent
with [[project-codegate-t3-onboarding-voice]]'s prior note on the same limitation for this exact
record-page mic/MediaRecorder flow).
