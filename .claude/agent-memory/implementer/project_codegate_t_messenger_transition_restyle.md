---
name: project-codegate-messenger-transition-restyle
description: Visual restyle of the messenger scenario-select/voice-select/chat-shell/fake-landing screens (2026-07-24) against the design_handoff mockups — brand-skin carve-out resolution, live shared-worktree file-clobber recovery, cross-file Button-adoption fragmentation judgment call.
metadata:
  type: project
---

Task: restyle exactly 4 files — `src/app/scenarios/messenger/page.tsx` (UX-024),
`src/app/scenarios/messenger/voice-select/page.tsx` (UX-025), `src/app/session/messenger/page.tsx`
(UX-022), `src/components/MessengerFakeLanding.tsx` (UX-023) — against
`design_handoff_voice_phishing_training`'s "메신저 플로우.dc.html"/"전이 플로우.dc.html". Pure visual
pass, zero state/logic changes. Part of the same coordinated multi-screen design-system rollout as
[[project_codegate_design_system_report_screens]] (report/replay) and
[[project_codegate_onboarding_restyle]] (onboarding/login/clone-wait) — all three found
`src/components/ui/{Button,Badge,Banner,SelectableCard,ProgressSteps}` pre-built and adopted them.

**Brand-skin carve-out (OQ-U6) is a real, load-bearing constraint — resolved without touching it.**
This project has a previously-ratified decision that the KakaoTalk/iOS-Messages chat bubble/header
skin (`bubbleClass()` function + its literal hex values in `session/messenger/page.tsx`, and
`src/lib/messenger/detectSkin.ts`) intentionally, accurately replicates real brand UI as an accepted
risk (max training realism) — directly contradicting the *new* mockup README's instruction to
genericize chat-bubble colors to avoid brand mimicry. Confirmed the skin-recreation surface is
narrowly scoped to just `bubbleClass()` and its call site in the message-rendering `<ul>` — there is
no separate brand-colored header chrome in the actual implementation (unlike the mockup's
`chatHeaderCls`), so the "leave alone" zone was smaller than the mockup would suggest. Everything else
(top disclaimer banner, toolbar, escalation button, input bar, fallback screens, transition overlay)
was restyled freely.

**Zero-functional-change discipline required several "restyle but don't restructure" calls:**
- Escalation button ("📞 전화로 확인"): mockup floats it as an absolute-positioned overlay pinned to
  the bottom of the scrollable message area. Real implementation has no internal scroll container (the
  whole page scrolls) — repositioning it there would require new layout engineering (a `relative`
  wrapper + `fixed`/`absolute` re-anchoring), which is presentational-adjacent but risky. Kept it in
  its existing sticky-top-toolbar position (already satisfies "always visible from turn 1", AC-034) and
  only upgraded its color from an outline pill to a solid teal CTA to match the mockup's visual weight.
- `voice-select`'s "지금 30초 녹음" and "기본 남/여 목소리" are direct-action buttons (click = navigate/
  submit immediately), not a genuine two-step select-then-confirm like the mockup's `state.voice`
  model. Did NOT wrap them in `SelectableCard` (which implies persistent selected/unselected toggle
  state) since that would misrepresent the interaction model — used hand-styled cards with the same
  border/radius/badge tokens instead. Only the "저장된 목소리" list (which *does* have a real
  select-then-"이 목소리로 시작" two-step flow) got converted to `SelectableCard`, trading a native
  `<input type=radio>` radiogroup for `aria-pressed` toggle buttons — an accessibility-semantics
  tradeoff, flagged as deliberate (still fully keyboard-operable, just Tab instead of arrow-key
  navigation).
- Fake-landing "확인" button deliberately kept `bg-[#41525E]` (neutral avatar-gray) instead of the
  app's brand teal — this was the mockup's own intentional choice (a phishing decoy screen shouldn't
  look like the app's real branded CTA) and is worth preserving as a training-fidelity signal, not
  "inconsistent" styling to fix.
- Escalation overlay: fixed a non-token color (`#18232B`, not in the design tokens table) to the
  documented "통화 셸 배경" token `#22303A` (at 95% opacity, since the chat DOM stays mounted behind
  the `fixed inset-0` overlay — the alpha lets it show through faintly, matching the mockup's
  fade-in-over-chat intent) for a seamless handoff to `/session/play`'s identical dark shell. Did NOT
  add a new CSS opacity-transition/fade-in state (would require a new `useState`/`useEffect` — this
  exact file's escalation logic just passed a T31 reviewer/QA gate for an end-race bug, so avoided
  adding new state near it). Swapped emoji 📞→🔔 (mockup uses a bell) since that's a static content-only
  change with zero logic risk.

**Cross-file Button-adoption consistency tradeoff (worth knowing before the next screen in this
rollout):** [[project_codegate_design_system_report_screens]] explicitly chose NOT to convert the
`min-h-[48px] rounded-xl border border-[#C9C2B6] ...` hand-rolled fallback-button pattern in
`report/page.tsx`/`report/replay/page.tsx`, reasoning that the identical pattern was replicated
byte-for-byte across 6 files app-wide (including these messenger files) and converting only 2 of 6
would fragment rather than fix consistency. This task's explicit brief named `Button` as a component
to use for exactly these screens, so converted the pattern here anyway — post-hoc grep for the literal
class string now shows only `report/page.tsx`/`report/replay/page.tsx` still have it, meaning the
rollout is converting screen-by-screen as each gets its turn (not fragmenting arbitrarily). If you're
the next screen in this rollout and find the old pattern still present elsewhere, this is expected
mid-rollout state, not a bug to silently "fix" outside your assigned files.

**Live shared-worktree file-clobber, not just concurrent-different-file editing.** Unlike prior
instances of the "shared worktree hazard" (other agents editing *different* files while I work — see
[[project_codegate_t29_messenger_chat]], [[project_codegate_onboarding_restyle]]), this session hit a
genuine same-file race: after successfully editing `MessengerFakeLanding.tsx`, a system reminder
reported the file had been reverted to its pre-edit original by an external write. Re-read the file to
confirm (byte-for-byte back to original), then reapplied the edit — the import-line edit landed cleanly
but the large JSX-block edit's `old_string` no longer matched (because, per the resulting file content,
*another* process had apparently already applied the near-identical target edit concurrently — the file
ended up with the full intended JSX plus a duplicated import line). Resolution: read the file fresh
after each suspicious result rather than trusting tool-call success/failure alone, fix the visible
artifact (deduped the import), then re-ran `eslint`/`tsc --noEmit` and `git diff --stat` on all 4 scoped
files as a final integrity check before reporting done. Lesson: when a system reminder reports a file
was externally modified mid-task, don't just blindly retry the same edit — re-read first, because the
external writer may have landed content that's already equivalent-or-conflicting with yours, and a
naive retry can silently duplicate content instead of restoring it.

**Verification:** `npx eslint <4 files>` clean. `npx tsc --noEmit` repo-wide shows only the
pre-existing `TS5097` `.test.ts`-extension-import errors (6 files, none of them mine, none modified in
`git status` — confirmed pre-existing per the same pattern as
[[project_codegate_onboarding_restyle]]). `git diff --stat` scoped to exactly the 4 assigned files, no
bleed into the ~15+ other files concurrently modified by other sessions in this shared worktree at the
same time.

See also [[project_codegate_t29_messenger_chat]] / [[project_codegate_t30_channel_escalation]] (the
functional implementation this restyle sits on top of), [[project_codegate_design_system_report_screens]]
and [[project_codegate_onboarding_restyle]] (sibling restyle tasks in the same rollout, same
`src/components/ui` discovery, same pre-existing-tsc-noise pattern).
