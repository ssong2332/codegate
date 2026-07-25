---
name: project-codegate-t40-reverse-escalation
description: T40 fast-follow — voice→messenger reverse channel transition (manual button only), scenario-gating judgment call, and a chained edge case found in session/play's answered-flag model but deliberately left unfixed
metadata:
  type: project
---

T40 (fast-follow, P1) completed 2026-07-24 as `done` (self-check, non-security-gate task per
DefinitionOfDone.md — same tier as T28/T29/T30). Files: `functions/src/session/channelTransition.ts`
(guard refactored to a whitelist `isSupportedChannelTransition(from,to)` pure predicate — same
"extract pure logic" idiom as analyzeConversation.ts/purge.ts, exported for unit testing without
firebase-admin init), `functions/src/session/index.ts` (+`requestReverseEscalation`),
`functions/src/session/types.ts`, `functions/src/index.ts` (+1 additive export line),
`src/lib/api/requestReverseEscalation.ts` (new), `src/lib/api/types.ts`, `src/lib/api/index.ts`,
`src/app/session/play/page.tsx` (+"메시지로 전환" button in the existing always-visible control row).

**Scope-narrowing decision (explicit, matches T28/T29's "명시적 축소" tone):** unlike the forward
direction (structured signal + max-turn fallback + manual button, designed in Architecture.md §13.2/
13.3), there is zero UX/Architecture spec for what a "signal" would even mean during a live voice call
— `functions/src/realtime/*` (ElevenLabs/Gemini) has no text-completion-scanning hook the way messenger
`sendMessage` does (audio-stream based, not text-turn based). Implemented **manual button only**, per
explicit task instruction not to invent a signal scheme.

**Scenario-gating judgment call (concrete, not speculative — found via reading the actual client
guard):** `transitionChannel` itself doesn't require scenario content, but
`src/app/session/messenger/page.tsx:108` rejects rendering (`"시나리오 정보를 찾을 수 없습니다"`)
unless `scenarios[scenarioId].channel === "messenger"` — and pure-voice scenarios
(`functions/src/scenarios/publicMeta.ts`) never have that field. So flipping the channel flag alone
for a pure-voice scenario would produce a "successful" backend transition the client can't render.
Chose **reject with `failed-precondition`** (`PUBLIC_SCENARIOS[scenarioId]?.channel !== "messenger"`)
over "flip anyway" — this in practice restricts the reverse button to sessions that originated as
messenger scenarios and were forward-escalated (`messenger-child-impersonation-kakao`,
`messenger-subsidy-smishing-sms` — the only two with `channel:"messenger"` + `escalation`), which is
also the only semantically meaningful case anyway.

**Edge case found via chained reasoning, documented but deliberately NOT fixed (not data corruption,
UX-only, three-hop scenario the task explicitly allows deferring):** `src/lib/recording/
pendingSession.ts`'s `isSessionAnswered(sessionId)` sessionStorage flag is set once ("받기" tapped) and
**never cleared**. If a session goes messenger→voice (forward, T30) → messenger (reverse, T40) →
voice again (forward, re-triggered — same engine, valid reuse), landing on `/session/play` a *second*
time reads the same stale `isSessionAnswered` flag as true, skipping the incoming/ring phase and
`PREROLL_NOTICE` — the same class of AC-036 gap [[project-codegate-t30-channel-escalation]] already
found and fixed once for the *first* entry, but this round-trip path didn't exist before T40 created
it. Deliberately left unfixed: real fix requires redesigning session/play's "answered" model (per-phase
vs per-session), which is a UX/architecture decision beyond a P1 fast-follow's wiring scope, and
session/play is the same file T30 already used its one narrow "don't touch unless proven broken"
exception on. Flagged prominently in the Tasks.md T40 done() note for whoever next touches that file.
Also noted (fine, no fix needed): `roleplay/index.ts`'s TTS-gating and `canEscalate` checks re-read the
session doc fresh on every call (no staleness), so reverse-then-continue-chatting correctly stops TTS
and can legitimately re-trigger forward escalation via accumulated turnCount — not a bug, just an
undesigned ping-pong UX possibility, also documented rather than fixed.

**Test design:** extracted `isSupportedChannelTransition` as a plain exported predicate specifically so
the "voice→messenger is now allowed" case could be unit-tested without firebase-admin init (this file's
own header comment establishes the "no firebase-admin in node:test" convention, inherited from T30) —
avoided the fragile alternative of asserting on `err.code === "app/no-app"` to prove the guard passed.
Firestore-write-level proof (channelHistory gets *appended* not *replaced*, 2 entries after round trip)
was done via emulator live verification instead, consistent with established convention.

**Shared-worktree concurrency (heavier than usual this time):** T36 (2인 소셜 챌린지) and an unnamed
replay-feature track were both actively committing to the *same* files I touched
(`functions/src/index.ts`, `src/lib/api/index.ts`, `src/lib/api/types.ts`) *during* this session — saw
`functions/src/index.ts` gain `createChallenge`/`purgeExpiredChallenges` exports mid-task via a system
reminder. Both diffs were purely additive line-inserts so no conflict occurred, but this is worth
remembering: re-run full build/lint/test right before finishing even if you already verified earlier in
the same session, since the shared tree can and does change under you. See also
[[feedback_background_emulator_task_tracking]] (this task reused an already-running emulator rather
than restarting, confirmed fresh via a direct curl to the new callable before trusting it).
