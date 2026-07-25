---
name: project-codegate-t15-history
description: T15 history/report list (UX-012) design and state — pure-function test workaround for the frontend-no-test-runner gap, and the multi-agent shared-worktree hazard discovered during this task
metadata:
  type: project
---

T15 (세션/리포트 히스토리 열람, P1) completed 2026-07-21. Files: `src/app/(p1)/history/page.tsx`
(T2 stub → full implementation), `src/lib/history/{fetchReportHistory.ts,mapHistoryItems.ts,
mapHistoryItems.test.ts,index.ts}` (new).

**Design:** Client reads `reports` directly (no callable) filtered `uid==self` + `orderBy(createdAt,
desc)` — Database.md already specified this as a direct-read collection, and `firestore.indexes.json`
already had the required `reports` uid+createdAt-desc composite index since an earlier task (T2/T8
era) — nothing to add. Report-detail navigation reuses `report/page.tsx`'s existing `?sessionId=`
contract (no new route) since `reportId === sessionId` (`functions/src/report/generateReportCore.ts`).

**Frontend-test-runner gap workaround (new precedent, see [[project-codegate-t19-voice-mock]] for
the gap itself):** Root `src/` still has zero test framework and JSX blocks `node:test`. For a page
whose only non-trivial logic is Firestore-shape formatting, extracted that logic into a plain
(non-JSX) `.ts` pure function and ran it with Node 22's built-in `--experimental-strip-types` flag —
**no compile step, no new dependency**. Confirmed this works end-to-end on this repo's Node v22.14.0:
`node --experimental-strip-types --test <file>.test.ts` runs directly, and cross-file imports must
use the explicit `.ts` extension (`import { x } from "./y.ts"`) since there's no bundler resolving
extensionless specifiers. Added `"test": "node --experimental-strip-types --test <path>"` to root
`package.json` (previously had no test script at all). This only covers pure logic, not
Firestore-query behavior (ordering/ownership) — those still need emulator live verification.

**Multi-agent shared-worktree hazard (important, generalizable):** `git status` at the start of this
task showed several files already modified/untracked that this task never touched (`docs/PRD.md`,
`docs/Tasks.md` T12 status + OQ-5/OQ-8 entries, `src/app/(p1)/grade/page.tsx`, `AgeGate.tsx`,
`SpoofImage.tsx`, new `src/lib/age/`, `functions/src/report/computeDefenseGrade.ts`, etc.) — this is
**another implementer instance concurrently working on T13/T14 in the same working directory**, not
stale drift. Mid-task, `Edit` on `docs/Tasks.md` returned a "file had been modified on disk since you
last read it" warning (the other agent saved Tasks.md between my Read and Edit) — the edit still
applied cleanly and post-edit `git diff --stat` confirmed only my intended line changed. A concurrent
`npm run build` from the other agent also caused one build attempt to fail with "Another next build
process is already running" — retried a few seconds later and it succeeded. **Lesson: in this repo,
assume other agents may be editing/building concurrently; re-check `git diff --stat` on any
implementer-owned file (esp. Tasks.md) right after editing to confirm scope, and retry build/lint
once on a "process already running" error rather than treating it as a real failure.**

See also [[project-codegate-context]], [[project-codegate-t9-report-generation]] (reportId==sessionId
convention), [[feedback_emulator_script_sdk_split]] (firebase-admin modular API + verification script
pattern reused here).
