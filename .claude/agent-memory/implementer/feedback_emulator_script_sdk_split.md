---
name: feedback-emulator-script-sdk-split
description: This repo's root node_modules has the `firebase` client SDK only; functions/node_modules has firebase-admin only — a verification script needing both (signInAnonymously + Firestore admin seeding) can't `npm install` neither is present in the other tree without touching package.json/lockfile.
metadata:
  type: feedback
---

When writing a throwaway emulator verification script (`verify-*.mjs`, deleted after use, never
committed — see [[project-codegate-t5-deepvoice-playback]] for the established pattern) that needs
**both** the Firebase client SDK (`signInAnonymously`, `httpsCallable`) **and** `firebase-admin`
(to seed Firestore documents directly, bypassing security rules), neither package tree has both:
root `C:\codegate\node_modules` only has `firebase` (the Next.js app's client SDK dependency);
`C:\codegate\functions\node_modules` only has `firebase-admin` (the Cloud Functions dependency).

**Why this matters:** don't reach for `npm install <missing-package>` to patch this — even with
`--no-save` it still writes into a node_modules tree that isn't meant to carry that dependency, and
CLAUDE.md prohibits introducing unnecessary dependencies. It also wastes time since the fix is
purely at the verification-script level, not the product.

**How to apply:** write the script inside `functions/` (so `firebase-admin` resolves) and replace
every client-SDK call with a plain `fetch()` against the emulator's REST/HTTP surface instead of
importing `firebase`:
- Anonymous sign-in: `POST http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=any`
  with `{"returnSecureToken": true}` → returns `{localId, idToken}`.
- Callable function invocation (v2 `onCall`, default region `us-central1`): `POST
  http://127.0.0.1:5001/{projectId}/us-central1/{functionName}` with header `Authorization: Bearer
  {idToken}` and body `{"data": {...}}` → success is `{"result": ...}`, error is `{"error":
  {"message", "status"}}` (e.g. `status: "PERMISSION_DENIED"`).
- Firestore seeding: use `firebase-admin/firestore`'s `getFirestore()` after
  `initializeApp({projectId: "demo-test"})` with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` set —
  this bypasses security rules the way the client SDK wouldn't.

Also remember `firebase-admin` v14 is modular-only: `import { initializeApp } from
"firebase-admin/app"` / `import { getFirestore } from "firebase-admin/firestore"`, **not**
`import admin from "firebase-admin"; admin.firestore()`, which throws `TypeError: admin.firestore
is not a function` (same gotcha as [[project-codegate-t6-scenario-content]]).

Confirmed working end-to-end 2026-07-21 verifying the `synthesizeDeepvoice` ownership-check fix
(see [[project-codegate-synthesizedeepvoice-bugfix]]) — 3/3 cases (owner success, cross-uid
`permission-denied`, nonexistent-session pass-through) all correctly asserted via this REST
approach with zero new dependencies installed.
