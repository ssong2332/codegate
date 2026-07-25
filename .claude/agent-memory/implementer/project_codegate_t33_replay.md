---
name: project-codegate-t33-replay
description: T33 사후 리플레이 해설(UX-018) implementation — pure-fn merge design, Empty-state data gap, firebase-admin emulator script gotchas (RSA cert credential, :runQuery hang).
metadata:
  type: project
---

T33 built `/report/replay?sessionId=...` (UX-018) as a fully separate screen from
`/report` (UX-008), per D-18. Zero new Firestore writes/fields, zero new backend analysis —
only reads `sessions/{id}`, `reports/{id}`, `sessions/{id}/messages` (T9 output) and merges
them client-side by `turnIndex` in a pure fn `src/lib/replay/buildReplayTimeline.ts`.

**Why:** UX.md UX-018's own Architect Handoff explicitly says "Read only, no write" and
"no new analysis pipeline" — stronger/more specific than Tasks.md's looser wording, and
UX.md outranks Tasks.md in AGENTS.md Document Priority, so when they read differently
resolve in UX.md's favor and cite that priority explicitly in the done() note.

**How to apply:** When a UX.md Architect Handoff section and a Tasks.md task description
disagree on data-operation scope, treat UX.md as authoritative and say so in writing —
don't silently average the two.

**Known real gap, documented not silently dropped:** UX-018's Empty-state spec asks for
per-turn "지점에서 잘 대응했다" markers, but `ReportDoc` (functions/src/shared/types.ts)
only stores `deceivedMoments` (compliance turns), never resistance-turn indices — and the
regex/flavor-text logic needed to derive that client-side lives server-only
(`scenarioPrompts`, ADR-0004 blocks client read). Re-deriving it client-side would violate
"no new analysis logic." Resolution: show wasDeceived===false + tacticsUsed (real field)
+ full transcript, but no fabricated per-turn "good response" markers — documented as an
explicit spec-vs-architecture gap in the Tasks.md done() note rather than papered over.
Relates to [[project-codegate-t9-report-generation]] (analyzeConversation.ts internals).

**firebase-admin v14 + local Firestore/Auth emulator scripting, two new gotchas found
this session (beyond the earlier v14 modular-API one, see
[[project-codegate-t6-scenario-content]]):**
1. `initializeApp()` with no explicit credential in a sandbox with no outbound internet
   hangs indefinitely on ADC/metadata-server lookup even with `FIRESTORE_EMULATOR_HOST`/
   `FIREBASE_AUTH_EMULATOR_HOST`/`NO_GCE_CHECK=true` set — `getAuth().createCustomToken()`
   still tries to resolve a signer via network. Fix: generate a throwaway RSA keypair with
   Node's `crypto.generateKeyPairSync("rsa", ...)` and pass it via
   `cert({ projectId, clientEmail: "anything@...iam.gserviceaccount.com", privateKey })` —
   this signs the custom token locally with no network call. The Auth Emulator does not
   verify custom-token signatures against real Google keys, so a self-signed fake cert
   works fine for local verification scripts.
2. The Firestore emulator's `:runQuery` REST endpoint hung indefinitely (never returned,
   not even a status) in this environment when called via Node's global `fetch`, even
   though individual document GETs to the same emulator returned instantly. Root cause
   not fully isolated (suspected NDJSON/streaming response handling), workaround: read
   documents individually by known doc ID instead of running an ordered query — fine for
   verification scripts since the actual sort/merge logic should be unit-tested separately
   anyway (`node --experimental-strip-types --test`, see
   [[project-codegate-t15-history]]).

**How to apply:** Reuse the RSA-cert-credential trick for any future implementer task that
needs to mint emulator custom tokens in this sandbox. Avoid `:runQuery` in throwaway
verification scripts here — use per-document GETs instead.

No browser/computer-use tools were bound to this implementer session's tool list at all
(confirmed by checking the actual tool list, not just the generic MCP boilerplate text) —
stated so explicitly in the done() note rather than the usual softer "미검증" phrasing,
since it's a session-tooling fact, not a skipped-effort judgment call.
