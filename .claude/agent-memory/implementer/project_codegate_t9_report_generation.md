---
name: project-codegate-t9-report-generation
description: T9 취약점 리포트 생성 — generateReport 실구현, rule-based (non-LLM) conversation analysis design, single-core-function pattern shared by callable + trigger, UX-008 page
metadata:
  type: project
---

T9 (취약점 리포트 생성·표시) implemented 2026-07-21, left at Status `done` (self-check — T9 is not
one of the 3 hackathon security-gate tasks per DefinitionOfDone.md). Files: `functions/src/report/
analyzeConversation.ts` (new, pure functions), `functions/src/report/generateReportCore.ts` (new,
`generateReportForSession(sessionId)` — the single core function both the `generateReport` onCall
and `triggerReportGeneration` call), `functions/src/report/index.ts` (`generateReport` onCall body
filled in, `triggerReportGeneration` wired to actually call the core function instead of just
logging), `functions/src/report/__tests__/analyzeConversation.test.ts` (new, 7 tests),
`src/lib/api/generateReport.ts` (T2 stub → real `httpsCallable`, same pattern as
[[project-codegate-t8-session-lifecycle]]), `src/app/report/page.tsx` (UX-008, full implementation).

**Key design decision — no real LLM call, rule-based analysis instead (flagged, not silent):**
API.md's `generateReport` contract literally says "LLM으로 deceivedMoments/tacticsUsed/
preventionAdvice/wasDeceived 산출", but `getLlmClient()` still only returns `MockLlmClient`
(LLM_API_KEY never provisioned, same gap [[project-codegate-t7-roleplay-mock]] flagged). Calling
the Mock and pretending its output is "LLM analysis" would be an unfounded-success claim per this
user's global CLAUDE.md prohibition. Instead, `analyzeConversation.ts` derives everything directly
from the conversation log via regex: (1) a **resistance-keyword pattern** (직접 전화/경찰/신고/의심
등) takes priority over a **compliance-keyword pattern** (알겠어/계좌/송금 등) when judging whether
a user's turn right after a scammer turn counts as a "deceived moment" — resistance wins ties
deliberately, since falsely accusing a user of having been deceived is worse than under-counting;
(2) `tacticsUsed` is identified by checking whether a scammer message's text contains (substring
match, first 8 chars of the tactic's flavor) the `weakenedTactics` flavor text from
`scenarioPrompts` — this works because `MockLlmClient.craftOpeningLine`/`craftEscalationLine`
(`functions/src/llm/mockClient.ts`) literally embeds the *entire* flavor phrase verbatim into its
generated dialogue, so the substring match reliably fires against real Mock output (verified live,
not just unit-tested — see below). **This matching approach is Mock-shaped**: once a real
Claude/Gemini client replaces `MockLlmClient`, dialogue will no longer echo `weakenedTactics` text
verbatim, so `tacticsUsed` detection will likely need to move to an actual LLM call at that point.
Flagged in the Tasks.md T9 row's "알려진 갭" note for whoever does the LLM swap.

**AC-026 timeLabel design decision:** used real elapsed seconds from `MessageDoc.createdAt` (e.g.
`"15초 시점"`), not `turnIndex`-based labels — directly matches PRD's own AC-026 example wording
("15초 시점에 속았습니다") and `MessageDoc.createdAt` already exists as real Firestore write-time
data, so no synthetic timing data was invented. `turnIndex` is still preserved alongside `timeLabel`
in `DeceivedMoment` for completeness (matches Database.md schema).

**Single-core-function pattern (same principle as [[project-codegate-t8-session-lifecycle]]'s
`triggerReportGeneration`):** `generateReportForSession(sessionId)` in
`functions/src/report/generateReportCore.ts` does NOT do auth/ownership checks (it's called both
from the `generateReport` onCall, which does its own auth+ownership check first via a separate
Firestore read, and from `triggerReportGeneration`, which is only ever invoked by
`endSession`/`sendMessage` after *they* already verified ownership — same trust boundary
[[project-codegate-t8-session-lifecycle]] established for its own trigger). It IS idempotent:
checks `reports/{sessionId}` existence first and returns early without recomputing — reportId is
literally `sessionId` (Database.md's own recommended PK choice), which both keeps AC-007's "exactly
one report" invariant trivially true and makes double-calling (client `generateReport` +
server-internal trigger, which is the actual UX-008 design below) safe.

**UX-008 page calls `generateReport` itself on mount, not just relying on the endSession trigger:**
`triggerReportGeneration` swallows all errors internally (deliberate, per
[[project-codegate-t8-session-lifecycle]], so a failing report generator never blocks the
session-end response) — meaning a silent failure there would otherwise leave `/report` with no
document to read and no way to recover except a manual Firestore write. So `report/page.tsx` calls
the real `generateReport` callable itself on mount (idempotent, cheap if already generated) and
offers a genuine retry button on failure — this is what makes UX-008's documented "Error: 리포트
생성 실패 → 재시도" state actually meaningful rather than decorative. Confirmed live via emulator
that `endSession` alone already writes `reports/{sid}` (the trigger path) AND that a subsequent
client-side `generateReport` call returns the same `reportId` without rewriting (idempotency
holds across both call paths).

**Emulator verification (established pattern, see [[project-codegate-t8-session-lifecycle]] for the
precedent):** throwaway `verify-t9.mjs` (client SDK against `firebase emulators:start --only
auth,firestore,storage,functions --project demo-test`, `npm run --prefix functions
seed:scenarios` run first to populate `scenarioPrompts`), 20/20 assertions: scenario A (compliant
user → `wasDeceived:true`, `deceivedMoments` populated with correct `timeLabel` format,
`tacticsUsed`/`preventionAdvice` non-empty), scenario B (resistant user → AC-009's `wasDeceived:
false` + non-empty `tacticsUsed` still listed + no "면역" overclaiming in `preventionAdvice`),
nonexistent-session/cross-uid/not-yet-ended-session error cases all returning the correct
`failed-precondition`/`permission-denied` codes. Deleted after use, never committed. Hit the same
`signInAnonymously` reuse gotcha [[project-codegate-t5-deepvoice-playback]] already documented
(must `auth.signOut()` before a second `signInAnonymously()` call to actually get a new uid) —
applied the fix directly from memory without rediscovering it. Emulator cleanup followed
[[feedback-background-emulator-task-tracking]] exactly.

**Unit tests:** `analyzeConversation.test.ts` (7 tests, pure-function style matching
`roleplay/__tests__/sessionLimits.test.ts`'s established convention) — covers AC-008 (deceived
moment recorded with tactic+correctAction+timeLabel), AC-009 (resistant user → not deceived,
tacticsUsed still populated), AC-026 (timeLabel format), and the "no overclaiming" requirement
(regex-asserts `preventionAdvice` never contains "면역"). functions `npm test`: 43/43 (36
pre-existing + 7 new), no regressions. Root/functions lint and build both clean.

**Known gaps flagged (not fixed, out of this task's scope):** (1) Mock-shaped tactic-matching (see
above) will need rework once a real LLM replaces `MockLlmClient`. (2) T11 (PII masking) is still a
passthrough stub, so `messages.textMasked` is still raw user text — report `tactic`/timeline text
could theoretically echo unmasked user input; resolves automatically once T11 lands, no report-side
change needed. (3) Real browser click-through of `/report` (mount → loading → success/error →
retry button) not exercised — same standing gap as every other UI task in this repo
([[project-codegate-t3-onboarding-voice]] etc., no browser-automation tool available).

See also [[project-codegate-t8-session-lifecycle]] (the `triggerReportGeneration` stub and
single-trigger-point design this task filled in), [[project-codegate-t7-roleplay-mock]] (the
`weakenedTactics`/`MockLlmClient` flavor-embedding behavior this task's tactic-matching depends on),
[[project-codegate-t5-deepvoice-playback]] (the `signInAnonymously` reuse gotcha reused here),
[[feedback-background-emulator-task-tracking]] (emulator process cleanup pattern).
