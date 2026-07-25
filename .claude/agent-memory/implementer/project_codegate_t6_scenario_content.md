---
name: project-codegate-t6-scenario-content
description: T6 scenario content (family-accident deepvoice) file layout, src/functions split rationale, and the seed script's untested-in-CI dependency on a real Firebase project
metadata:
  type: project
---

T6 (시나리오 콘텐츠 — 가족 납치/사고 1종) completed 2026-07-21. Files:
`src/content/scenarios/familyAccidentDeepvoice.ts` + `index.ts` (public `ScenarioDoc` — title/
fraudType/estimatedDuration/difficulty/deepvoiceLines, matches `functions/src/shared/types.ts`
field-for-field but not imported directly, see below), `functions/src/scenarios/
familyAccidentDeepvoice.prompt.ts` (sensitive `ScenarioPromptDoc` — personaPrompt/weakenedTactics/
guardrailPreamble), `functions/src/scenarios/{index,publicMeta,seed}.ts`,
`functions/src/scenarios/__tests__/scenarios.test.ts` (node:test, 7 tests, all pass — see
[[project-codegate-t19-voice-mock]] for why node:test not jest/vitest in this repo).

**Deliberate deviation from Database.md's literal Migration Policy wording:** Database.md says
"scenarios/scenarioPrompts seed는 src/content/scenarios(T6)에서 배포 스크립트로 주입" (implying
both collections' seed source lives under `src/content/scenarios`). The T6 task instructions
explicitly said to split sensitive `scenarioPrompts` content into `functions/src/` instead — never
under `src/` (Next.js client root) — citing Architecture.md §3's client layer boundary ("Client는
시스템 프롬프트/페르소나 보유 금지"). Resolved this as: Architecture.md outranks Database.md in
AGENTS.md's Document Priority list, and the explicit task instruction is more specific than
Database.md's one-line Migration Policy note, so the split was implemented rather than escalated as
a blocking conflict. Recommend architect update Database.md's Migration Policy line to reflect the
actual split next time Database.md is touched (not something implementer can edit directly).

**Cross-package duplication tradeoff:** `src/` (Next.js) and `functions/` (Cloud Functions) are
separate TypeScript build roots (`functions/tsconfig.json` has `include: ["src/**/*.ts"]` scoped to
its own `src/`, so it cannot import files from the repo-root `src/` — TS6059 rootDir error). Since
the seed script (`functions/src/scenarios/seed.ts`, uses firebase-admin which only exists in
functions/node_modules) needs the public scenario metadata too, the non-sensitive public metadata
is **mirrored** in `functions/src/scenarios/publicMeta.ts` with an explicit "keep in sync" comment.
A test (`scenarios.test.ts`, last test case) guards drift by reading the raw source text of
`src/content/scenarios/familyAccidentDeepvoice.ts` via a relative `path.resolve(__dirname,
"../../../../src/content/scenarios/...")` from the **compiled** test location
(`functions/lib/scenarios/__tests__/`) and asserting the mirrored strings appear in it. If the
functions build output directory structure changes, this relative path depth (4 `../`) needs
re-verification — it was confirmed working via `npm test` (7/7 T6 tests pass) at time of writing.

**firebase-admin v14 uses the modular API, not the namespace import:** `import * as admin from
"firebase-admin"; admin.firestore()` does NOT work (no `.firestore` property on the root export) —
must use `import { initializeApp } from "firebase-admin/app"` + `import { getFirestore } from
"firebase-admin/firestore"`. Hit this as a real tsc build error before fixing.

**Seeding was NOT actually performed against a real Firestore project** — `.firebaserc` still has
the placeholder `YOUR_FIREBASE_PROJECT_ID` (no `firebase use --add` run yet). Ran `npm run
seed:scenarios` anyway to prove the script itself works up to the Firestore call; it fails with
"Unable to detect a Project Id in the current environment" at the `batch.commit()` step, which is
the expected/correct failure mode given project ADR/README ("Firebase 프로젝트 연결" is a manual
one-time step the user hasn't done yet). Once the user runs `firebase login && firebase use --add`,
re-running `cd functions && npm run build && npm run seed:scenarios` should work as-is — no code
change needed for that.

See also [[project-codegate-context]] (hackathon DoD mode, pre-existing doc drift) and
[[project-codegate-t19-voice-mock]] (VoiceProvider mock, node:test setup this task reused).
