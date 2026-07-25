---
name: project-codegate-t37-user2-access
description: T37 2-person challenge (user2 recipient side) — anonymous-auth A1 wiring, consentGate resume/reject state machine, RouteGuard PUBLIC_PATHS gap found+fixed, 36/36 live cross-identity emulator proof
metadata:
  type: project
---

T37 (2인 — 사용자2 동의·체험·정체공개·리플레이·결과공유·신고) implemented 2026-07-24, following
[[project-codegate-t36-challenge-creation]] (sender side) and ADR-0006/§14.7 (architect design
that unblocked this task after a real leak-vs-data-loss design gap was found). Left at Tasks.md
`done` via self-check — same pattern as T36: not a T7/T10/T11-style solo security gate, formal
reviewer/QA is a separate downstream batch task (T38) covering both T36+T37.

**Core files**: `functions/src/challenge/userAccess.ts` (new — the four user2 callables, kept
separate from `challenge/index.ts` to avoid a circular import since it imports T36's
`resolveChallengeByTokenHash`/`markChallengeConsumed`/`hashToken` primitives),
`functions/src/challenge/consentGate.ts` (new pure fn `decideConsentGate` — the §14.4 "1회성
소모 + 중도 이탈 복귀" state machine: same-anon-uid-returns=resume, different-uid=reject "이미
다른 사람이 동의", unit-tested without Firestore), `functions/src/realtime/index.ts` (added the
challenge branch to `createRealtimeCall` — resolves voiceId from `challenges/{id}` in-memory,
re-validates status+expiry, throws `failed-precondition` on failure rather than the usual
silent-isMock-fallback path, per API.md's explicit exception for this case),
`functions/src/shared/types.ts` (+`SessionDoc.challengeId?`/`.challengeCreatorDisplayName?`,
**never** `voiceId` on that doc — the A1 invariant), `src/app/challenge/join/page.tsx` (new,
UX-021), `src/app/session/end/page.tsx` + `src/app/report/replay/page.tsx` (2-person variants
added, gated on `session.challengeId`), `src/lib/recording/pendingSession.ts` (+`setPendingSessionId`
for adopting a server-generated id since session/play reads `getPendingSessionId()` not a query
param, +`setChallengeToken`/`getChallengeToken` for carrying the plaintext link token across the
join→play→end→replay tab flow since `setChallengeResultSharing` needs it and challenges docs are
unreadable by the client).

**A1 invariant (never write challenge voiceId onto the user2 session doc) verified live, not just
by code review**: the whole point of ADR-0006's "정제(A1)" is that two prior incidents this same
session (a voiceId leak via `challenges` collection reads, and a purge-isolation data-loss bug)
were both instances of this exact failure mode. Live-verified via emulator: (1) `voiceId` key is
literally absent from the session doc (`!("voiceId" in sessionData)`), (2) `createRealtimeCall`
still resolves the *correct* voiceId (matches `challenges/{id}.voiceId` exactly) by reading the
challenge doc server-side, (3) after user2's session ends, `challenges/{id}.voiceId` is
byte-for-byte unchanged (purge never touches it because it was never on the session in the first
place — `purgeSessionArtifacts` skips the ElevenLabs target entirely when `voiceId` is undefined).

**Real design gap found and fixed, flagged prominently as outside the task's enumerated file
list**: `src/lib/auth/RouteGuard.tsx`'s global `PUBLIC_PATHS` only had `/login` — without adding
`/challenge/join`, AC-048 ("무로그인 진입") is impossible to satisfy at all, because before the
consent tap there's no `request.auth` yet and the global guard immediately redirects the landing
page itself to `/login`. Judged this as a narrow, low-stakes, easily-revisited implementation
detail (one string added to an allowlist, not a redesign) rather than something requiring a stop
for architect — same class of judgment call as T3/T4/T30's precedent of fixing genuine blockers
found mid-implementation and flagging them. Post-consent screens (session/play/end, report/replay)
needed *no* RouteGuard change because `useCurrentUser()`/`onAuthStateChanged` treats an anonymous
Firebase Auth user as a normal `User` — this is inherent to the A1 design, not something I had to
wire myself.

**consentChallenge resume semantics — a design detail the task left as "your call" that turned out
to matter**: Firebase Anonymous Auth persists locally (survives tab close, not just sessionStorage),
so the *same* browser/device re-opening an already-consumed link naturally gets the *same* anon
uid back. `decideConsentGate` uses this: looks up the existing experience session via
`sessions.where("challengeId","==",...)` (the exact index Database.md already declared for this
purpose, no new composite index needed — confirmed via live query), and if the caller's uid matches
that session's owner, treats it as a legitimate "중도 이탈 복귀" resume (returns the same sessionId,
no re-write of `linkConsumedAt`/status). A different uid on an already-consumed token is rejected
("이미 다른 사람이 동의한 챌린지입니다") — this is what actually stops a re-shared/forwarded link
from being consumable by more than one person, since the "1회성 소모" flag alone doesn't distinguish
"the same person retrying" from "someone else got the link too."

**Deliberately out-of-scope, documented not silently dropped**: `resultSummary.suspicionTimeLabel`/
`.suspicionTurnIndex` are left unset (`{completed:true}` only) — "의심(저항) 시점" requires
DECISIONS #26's separate not-yet-built `resistedMoments` follow-up; T9's existing `deceivedMoments`
is "속은 시점" (a different concept) and can't substitute. The task's own instructions explicitly
flagged this exact confusion as something to avoid conflating.

**Known accepted low-probability race, documented not silently ignored**: `consentChallenge`'s
first-consent gate is read-then-write, not a Firestore transaction — two genuinely simultaneous
first-time consents on the same freshly-shared token could theoretically both observe `status:
"pending"` and both pass. Matches this codebase's existing risk posture (T36's active-challenge-cap
check in `createChallenge` is equally non-transactional) — left as a T38/architect judgment call
rather than unilaterally introducing a transaction pattern not used elsewhere in the module.

**Live emulator verification — 36/36 assertions, full cross-identity flow, script written to
`functions/tmp-t37-verify.mjs` then deleted (not committed)**: mint user1 via `createCustomToken`
+ Auth Emulator REST `signInWithCustomToken` (note: unlike `accounts:signUp`, this REST response
has **no `localId` field** — the uid is simply whatever you passed into `createCustomToken`, don't
try to read it back from the response), user2 via anonymous `accounts:signUp`. Covered: landing
non-destructive read, consent auth-gate + resume + cross-uid-reject, realtime-call voiceId
resolution + tampered-status re-validation throw, cross-owner permission-denied on both callables
and raw Firestore REST (`GET .../documents/sessions/{id}` → 403 for user1, 200 for user2 owner),
purge isolation, result-sharing ownership check + PII-masked report note, expired-link gating.
Reused [[project-codegate-t33-replay]]'s RSA-cert-credential trick (real gotcha reconfirmed:
`admin.credential.cert` doesn't exist on the default `firebase-admin` import in this v14 setup —
must import `cert` from `firebase-admin/app` specifically, same modular-API gotcha as
[[project-codegate-t6-scenario-content]]).

**Test counts**: functions `npm test` 149/149 (139 pre-existing + 10 new `consentGate.test.ts`).
Root `npm test` 29/29 (unchanged — new client code was page-wiring with no new pure-fn logic worth
extracting, matching how T29/T36 also skipped new root tests for similar UI-wiring-only work).
Root `next build` 25 routes (+1: `/challenge/join`).

See also [[project-codegate-t36-challenge-creation]] (sender-side primitives reused, purge
architecture), [[feedback_emulator_script_sdk_split]] (REST-vs-admin-SDK split still applies),
[[project-codegate-t33-replay]] (RSA-cert-credential + UX.md-over-Tasks.md priority precedent,
also reused here for README.md Anonymous-provider doc update per CLAUDE.md's "new setup step"
rule).
