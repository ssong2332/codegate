---
name: project-codegate-design-system-report-screens
description: Applying the design_handoff visual design system to report/page.tsx and report/replay/page.tsx (2026-07-24) — token-consistency fixes, chat-bubble restructure, shared Button/Badge component adoption, scope-discipline calls.
metadata:
  type: project
---

Task: restyle `src/app/report/page.tsx` and `src/app/report/replay/page.tsx` only, to match
`design_handoff_voice_phishing_training` (외부 경로, repo 밖) — pure visual pass, no logic/data
changes. Part of a larger concurrent multi-screen design-system rollout: found `src/components/ui/`
(Button/Badge/Banner/SelectableCard/ProgressSteps, untracked) and ~15 *other* app files already
modified in the shared working tree by other concurrent sessions before I started — confirms the
recurring [[feedback_background_emulator_task_tracking]]-adjacent "shared-worktree hazard" pattern
(see T15/T29/T33/T36/T40 in MEMORY.md). Only ever touched my 2 assigned files — verified via
`git diff --stat -- <my 2 files>` and a `git stash`/`tsc --noEmit`/`git stash pop` round-trip to
confirm pre-existing tsc errors (TS5097 on `.test.ts` imports) predate my changes.

## Judgment calls made (would make the same calls again)
- **`#C6392F` (빨강) is reserved for 종료/에러 only per the token table given in the task brief.**
  Found `report/page.tsx`'s "속은 시점" timeline list using red (`#EFC7C3`/`#FDF1F0`/`#C6392F`)
  while the summary card 20 lines above it used orange caution tokens for the *same concept* —
  a genuine internal inconsistency, not just a mockup mismatch. Fixed both files to caution-orange
  (`#FBF3E8`/`#B96A1B`) for "you were deceived here" states, keeping red strictly for `role="alert"`
  error states.
- **`#4A5560` is not a design token anywhere in the token table**, but was used pervasively across
  the two files (and likely elsewhere in `src/app`, didn't check outside scope) as ad-hoc secondary/
  description-text color. Replaced with the token `#6B655C` (보조 텍스트) throughout both files —
  matches the mockup's own usage for description text under bold headings.
- **Restructured replay's message list from a uniform "card per message" layout into real left/right
  chat bubbles** (디자인 시스템.dc.html §8: 상대=좌측+아바타+흰 rounded-bl 버블, 나=우측+teal
  rounded-br 버블) — this was a real structural mismatch, not just color, but stayed within
  "restyle only": preserved the exact `ref`/`tabIndex`/`key`/`aria-live`/`role="note"` scaffolding,
  only changed the JSX container shape per `item.role`. Per-message timestamps are NOT in the mockup
  reproduction (data model has no per-message wall-clock time, only `deceivedMoments[].timeLabel` —
  fabricating one would violate the same "don't invent untracked data" principle as the Empty-state
  gap in [[project_codegate_t33_replay]]).
- **Added the mockup's persistent bottom banner** ("한 번의 훈련으로 끝이 아니에요 — 이번에 놓쳤을
  수 있는 부분은...") which was completely absent from the existing code, even though the file's own
  comments already referenced the "면역됐다" framing risk. Static, non-data-dependent, explicitly
  named in the task brief — judged in-scope despite being a genuine addition, not a restyle. Did NOT
  wrap it in the shared `Banner` component: `Banner` only supports `caution`/`success` variants, but
  this message's mockup background (`#F2EFE9`) is the *neutral* badge token, semantically distinct
  from both — forcing it into `Banner` would misrepresent severity. Left it as a plain hand-styled
  div instead.
- **Did NOT swap the no-session/loading/error-state buttons to the shared `Button` component**,
  despite `Button` being available and a plausible fit. Found the exact same hand-rolled pattern
  (`min-h-[48px] rounded-xl border border-[#C9C2B6] px-6 py-3 text-lg font-bold ...`) replicated
  byte-for-byte across 6 *other* untouched files app-wide (`onboarding/record`, `session/play`,
  `challenge/join`, `challenge/create`, `session/messenger`, `scenarios/messenger/voice-select`).
  Converting only my 2 files would have *fragmented* consistency rather than improved it, since
  `Button` forces `w-full` (a real width/layout change) while the established pattern here is
  content-hugging. Left these 4 button instances untouched; only fixed the button-pair layouts that
  are unique to these 2 files (bottom CTAs, T37 share/decline pair, replay entry link) where adopting
  `Button` didn't collide with any established cross-file pattern.
- **Kept the pre-existing "요약 우선 접이식" (summary-card + 3-accordion) structure in
  `report/page.tsx`** instead of reverting to the mockup's flat hero-card + timeline layout — this was
  a previously-documented, explicit prior user decision (code comment cites "claude.ai/design 옵션
  탐색 1g", user-requested). Only did token/typography/component-swap fixes within that existing
  structure (Badge for tactic pills instead of plain text/bullets, caution-token color fixes, chevron
  color, H1/eyebrow sizing to match the 24px/13px tokens).
- Followed the task brief's explicit instruction to map "대화 되짚어보기(리플레이 해설)" →
  `<Button variant="secondary">` even though it drops the button's prior teal accent color — this was
  a direct instruction in the brief (not my own inference), so I didn't second-guess it, but noted it
  as directed-not-judged in my report to the orchestrator.

## Reusable technique
When told "swap hand-rolled equivalents for a shared component," **grep the target hex/class pattern
across the whole `src/app` tree first**, not just the files in scope — it tells you whether the
pattern is unique to your files (safe to swap) or an established cross-file convention (swapping only
your files would fragment, not fix, consistency). Also worth a `git stash` / rerun / `git stash pop`
round-trip whenever a repo-wide check (tsc, lint) shows pre-existing-looking errors unrelated to your
diff — confirms them as pre-existing rather than assuming.
