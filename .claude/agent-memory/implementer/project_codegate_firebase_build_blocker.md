---
name: project-codegate-firebase-build-blocker
description: npm run build failed with auth/invalid-api-key without a real Firebase project — resolved via local emulators for the prototype phase (user decision 2026-07-21)
metadata:
  type: project
---

**Original finding (T18, 2026-07-21):** `npm run build` (`next build`, static export) failed with
`FirebaseError: auth/invalid-api-key` during the "Collecting page data" prerender step, because
no `.env` existed (only `.env.example` placeholders) and `src/lib/firebase/auth.ts`'s module-level
`getAuth(firebaseApp)` validates the API key format eagerly — this executes even for "use client"
components because Next's `output: "export"` still server-renders every route once at build time.

**Resolved (same day) — user decided to run the whole prototype phase on local Firebase
emulators instead of waiting for a real cloud project** (real project connection deferred to
demo-prep time). What's now in place:
- Root `.env` (gitignored, not committed) has **format-valid but fake** demo values —
  `NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-test` (the `demo-`-prefixed project ID is Firebase's own
  documented convention for "this ID should never touch real cloud resources"), plus a
  dummy-but-correctly-shaped `apiKey` (`AIza...` 39-ish char format) so `getAuth()` stops throwing.
  **If this `.env` ever goes missing again, recreate it with the same shape** — copy
  `.env.example` and fill with any `AIzaSy...`-format string + `demo-test`-style project ID, never
  a real key.
- `src/lib/firebase/emulator.ts` (new) exports `useEmulator = process.env.NODE_ENV !== "production"`.
- `src/lib/firebase/{auth,firestore,storage,functions}.ts` each call their respective
  `connect*Emulator(...)` (ports 9099/8080/9199/5001, matching `firebase.json`'s existing
  `emulators` block — auth/firestore/storage/functions ports were already configured there from
  T2, nothing needed adding) guarded by `if (useEmulator)`.
- **Verified this is actually stripped from production output, not just logically skipped:**
  `grep -rc "127\.0\.0\.1" out/` after `npm run build` returns 0 matches across the entire static
  export — the emulator connect call-sites (which pass the literal `"127.0.0.1"` string) are fully
  dead-code-eliminated when `NODE_ENV=production`. (A generic `connectFirestoreEmulator` string
  does appear in one bundled chunk, but that's just the Firebase SDK's own exported function
  definition sitting unused in the vendor chunk — not a live call. Don't be alarmed by that
  specific grep hit; check for the `127.0.0.1` literal instead, that's the real signal.)
- `functions/src/shared/config.ts` needed **no changes** — the Functions emulator (started via
  `firebase emulators:start`) automatically serves callables on the port `firebase.json` already
  declares; only the *client's* `connectFunctionsEmulator` call (frontend) was missing, which is
  now added. `defineSecret`/`defineString` in that file are unaffected either way.

**Verified firsthand (not just claimed) by running `firebase emulators:start --only
auth,firestore,storage --project demo-test` and confirming ports 9099/8080/9199 match the
frontend's `connect*Emulator` calls, then running a throwaway `.mjs` script (deleted after use,
never committed) that: signed in anonymously against the Auth emulator (closest substitute for an
authenticated uid without a real Google OAuth popup — no browser-automation tool is available in
this environment), called the exact `ensureUserProfile` logic from `src/lib/auth/userProfile.ts`
twice, and confirmed (a) first call creates `users/{uid}` with `createdAt`+`lastLoginAt`, (b)
second call only bumps `lastLoginAt` (re-login path), (c) `firestore.rules` correctly rejects a
cross-uid write with `permission-denied`. Cleaned up: emulator processes killed, debug logs and
the temp script deleted, ports confirmed free afterward. `firebase-tools` was installed globally
via `npm install -g firebase-tools` (already documented as an optional prerequisite in README —
not a project dependency, no DECISIONS.md entry needed) since it wasn't present in this
environment; Java (OpenJDK 21) was already available, which the Firestore/Storage emulators need.

**What is still NOT verified — and can't be, without a browser-automation tool:** actually
clicking the "Google로 로그인" button and clicking through the Auth emulator's fake-IdP popup
screen end-to-end. The `signInWithGoogle()` popup/redirect-fallback/error-classification code in
`src/lib/auth/signInWithGoogle.ts` was verified by reading/reasoning about Firebase SDK error
codes, not by triggering them in a live browser. Say so plainly if asked — don't imply this was
covered by the emulator script above.

**When a real Firebase project is eventually connected (demo prep):** swap `.env` to real values,
`firebase use --add` (`.firebaserc` still has the `YOUR_FIREBASE_PROJECT_ID` placeholder),
enable Google as a Sign-In provider in the Firebase Console (can't be done via CLI), and the
`useEmulator` flag needs no change — it's already `NODE_ENV`-driven, so `npm run dev` will still
default to the emulator unless someone explicitly wants to point local dev at the real project too
(not currently supported by a flag — would need a deliberate follow-up if that's ever wanted).

See also [[project-codegate-context]] for the broader hackathon DoD-mode context and
[[feedback-doc-ownership-boundaries]] for what implementer may/may not touch outside source code.
