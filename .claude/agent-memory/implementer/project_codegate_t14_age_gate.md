---
name: project-codegate-t14-age-gate
description: Codegate T14 age-gate (UX-011, AC-014) — self-attestation design choice, UX-011 placement reasoning, minimal onboarding-flow wiring, pure/impure split test pattern reused from T15
metadata:
  type: project
---

T14 (age-gate, P1, non-security-gate) implemented self-check-only per DefinitionOfDone.md 하카톤 모드.

**Design choice (self-attestation over birthdate):** UX.md UX-011 allows either "생년월일 입력" or
"확인 플래그". Picked a plain yes/no self-attestation button ("예, 만 14세 이상입니다" / "아니오")
over a birthdate picker — no date parsing/leap-year age math needed, matching the task's explicit
"pick whichever is simpler" instruction and OQ-8's own resolution rationale ("가장 간단한 구현").
MIN_AGE=14 lives in `src/lib/age/resolveAgeGateDecision.ts` as the single source of truth.

**Placement reasoning (UX-011 Entry ambiguity resolved via Exit contract):** UX-011 Entry says
"UX-001 이전 또는 직후" (before or right after consent) — genuinely ambiguous — but its Exit is
pinned to "→ UX-002" (record screen). That Exit only makes literal sense if age-gate sits *after*
UX-001: placing it before consent would imply Exit→UX-001, contradicting the documented Exit. Used
that as the tiebreaker and inserted the new `/onboarding/age-gate` route between consent and
record. This is the kind of reasoning to reuse whenever a UX.md screen spec gives two Entry options
but only one is consistent with its own stated Exit/Navigation target — read Exit as the disambiguator.

**Minimal wiring done (explicitly permitted/expected by the task, not scope creep):** changed
consent page's one `router.push` target, and added a second `hasVerifiedAge` check to record page's
*existing* consent-gate `useEffect` (same redirect-on-missing-prereq pattern already used for
consent) so the new screen can't be bypassed via direct URL. Both edits are small, additive diffs
onto already-`done` T3 files — reused the established "page owns Firestore calls + entry-gate
redirect" convention (see [[project_codegate_t3_onboarding_voice]]) rather than putting Firestore
logic inside `src/components/AgeGate.tsx` itself... actually the write (`verifyAge`) *is* inside the
component this time (self-contained, takes `uid`+`onPass` props) — components/ in this repo has both
styles (presentational-only like EndTrainingButton/SpoofImage, and self-contained-with-side-effects);
picked self-contained here since AgeGate needed no page-specific routing logic, only a pass-through
`onPass` callback, unlike ConsentPage/RecordPage which own multi-step flows.

**Test pattern:** reused the pure/impure split T15 introduced in `src/lib/history/` (frontend has no
test framework, see [[project_codegate_t19_voice_mock]] for the original node:test-can't-do-JSX
gap) — pure decision logic in `resolveAgeGateDecision.ts` (no firebase imports) gets a `node:test`
file run via
`node --experimental-strip-types --test`; the Firestore-touching `verifyAge.ts` (hasVerifiedAge/
verifyAge) has no committed test, verified instead via a throwaway emulator script (deleted after,
not committed) — matches the project's existing convention where `src/lib/consent/index.ts` also has
no unit test for its Firestore wrapper functions.

**Shared-working-tree gotcha discovered:** at the time of this task, `git status` showed unrelated
uncommitted changes from other concurrent implementer sessions already in the working tree (T12
SpoofImage, T13 grade/computeDefenseGrade, T15 history — all already `done` in Tasks.md by the time
I started, before I touched anything). Root `npm run lint` failed on `src/app/(p1)/grade/page.tsx`
(a `react-hooks/set-state-in-effect` error) that had nothing to do with T14 — confirmed via
`git diff --stat` that file was already modified before my session touched anything, then verified
my own changes were lint-clean by scoping `npx eslint <my files>` directly instead of relying on the
whole-repo `npm run lint` run. If a future task's full-repo lint/build fails, check `git status`/
`git diff --stat` first to see whether the failure is in a file you never touched before assuming
you broke something.
