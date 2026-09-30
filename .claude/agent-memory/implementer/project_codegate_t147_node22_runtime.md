---
name: project-codegate-t147-node22-runtime
description: T147 Node 20→22 engines bump (2026-09-30) — worktree dry-run needs placeholder functions/.env, intermittent 10s discovery timeout is not runtime-related, emulator mismatch warning text, root build failure route set is nondeterministic.
metadata:
  type: project
---

T147 (C1 engines + C2 @types/node ^22) implemented on `feat/T147-node22-runtime`, left at `review`, not deployed (deploy is User/orchestrator, §67.9).

**Why these notes matter:** each one cost a detour and will recur in T148 (SDK bump) and any later runtime bump (22→24 due by 2027-10-31).

**How to apply:**
- `firebase deploy --only functions --dry-run` in a fresh worktree fails with *"In non-interactive mode but have no value for ... LLM_PROVIDER, FALLBACK_VOICE_ID, FALLBACK_VOICE_MALE_ID, FALLBACK_VOICE_FEMALE_ID"*. A `functions/.env` with just those 4 keys copied from `.env.example` (placeholders, no secrets) is enough; delete it afterwards. Disclose it in the report.
- Discovery `Timeout after 10000` is intermittent and unrelated to engines: dry-run failed on the 1st try in 2 of 3 states, then succeeded on an identical retry. Emulator (`npm --prefix functions run serve`) failed 2/2 at C0 and succeeded at C1 on the same host Node. A plain `require('./lib/index.js')` takes 2.1–2.9 s. Count *consecutive* failures per OQ-A83 (2 in a row → FUNCTIONS_DISCOVERY_TIMEOUT only if approved).
- Emulator's engines-mismatch line (C0): `!  functions: Your requested "node" version "20" doesn't match your global version "22". Using node@22 from host.` After the bump: `+  functions: Using node@22 from host.` 26 definitions load; onSessionEnded/purgeExpiredChallenges are "ignored" without firestore/pubsub emulators (normal).
- Root `npm run build` without `.env`: the *set* of failing routes varies run to run (3 vs 2 routes). Compare error codes (`auth/invalid-api-key` only), not route lists.
- @types/node change leaves emitted lib hash identical (`recordLibBuild` hash), which is good cheap evidence of "no output change".
- Emulator process kill: ports were free beforehand, so the PID on 5001/4400 and the "Serving at port N" discovery PID are mine; `taskkill //PID <pid> //T //F`. `wmic` and `powershell` are unavailable/blocked in the worktree-isolated Bash.

Related: [[feedback-background-emulator-task-tracking]], [[project-codegate-t130-npm-drift-guard]]
