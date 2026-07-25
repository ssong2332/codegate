---
name: project-codegate-t52-report-accuracy-fix
description: T52 report "wasDeceived"/tacticsUsed accuracy bug fix — regex root causes, mock/analyze duplication drift, Windows bash+curl UTF-8 gotcha, shared-worktree branch rebasing technique
metadata:
  type: project
---

T52 (2026-07-24, direct user bug report, no planner precursor — same pattern as
[[project-codegate-t42-t43-t44]]-style reactive fixes) closed a real report-accuracy bug: a user
who deliberately complied with a scammer's demand still got "잘 대처함/요구에 응하지 않음". Left at
Status `review` (not `done`) — this touches the core `analyzeConversation.ts` judgment that AC-008/
009/026/037/038 and the defense-grade (T13) all depend on, so per T43's own self-escalation
precedent and T49's reviewer criticism ("safety-relevant self-exemption needs to be asked, not
assumed"), recommended formal reviewer/QA rather than self-declaring done.

**Two independent root causes in `functions/src/report/analyzeConversation.ts`, both confirmed via
live emulator (real `sendMessage`→`endSession`→`generateReport`), not just code-reading:**
1. `RESISTANCE_PATTERN`'s `확인하고\s*(다시)?` had `(다시)?` optional, so the bare filler "확인하고"
   inside a clearly-compliant sentence ("확인하고 바로 송금하겠습니다") triggered resistance-priority
   and threw away an unambiguous compliance signal ("송금"). Fix: require "다시" (drop the `?`).
2. `COMPLIANCE_PATTERN` only had informal-register verb endings + a handful of nouns (계좌/송금/
   이체/카드번호/비밀번호) — formal register ("말씀하신 대로 바로 처리하겠습니다", zero money nouns)
   matched nothing at all, independent of bug #1. Fixed by adding a generic "instruction
   acquiescence" group (말씀하신/시키는/하라는/알려주신 대로) plus 알겠습니다/보내드릴게 formal forms.
   Since regex can't parse negation scope, added defensive resistance keywords (못 하겠/안 하겠/
   하지 않겠/거절) so "말씀하신 대로는 못 하겠습니다" doesn't get swallowed by the new compliance regex.

**A third, unrelated bug found while verifying "시도된 수법" (tacticsUsed) as the user separately
asked**: `functions/src/llm/mockClient.ts` (crafts scammer dialogue) and `analyzeConversation.ts`
(matches dialogue against `weakenedTactics`) each had their OWN `extractTacticFlavor` — mockClient's
was upgraded 2026-07-22 to extract only the quoted `'...'` substrings from a tactic description,
but analyzeConversation's stayed on the old "everything after '—'" approach (quotes included in the
first-8-chars match target). Real scenario content (loanScam.prompt.ts etc.) universally uses the
quoted format, so `findMatchedTactic()` had been failing against EVERY real scenario's Mock output
— `tacticsUsed` was silently `[]` in every live report I generated before the fix. Root cause was
literal code duplication drifting apart. Fix: extracted both `extractTacticLabel`/`extractTacticFlavor`
into a new shared `functions/src/scenarios/tacticFlavor.ts`, both modules now import from there —
eliminates the possibility of future drift rather than just patching the symptom. Existing unit
test fixtures never caught this because they used tactic strings with no quotes (only exercised the
fallback path) — added a new test using the real quoted format plus a `MockLlmClient`-integration
test to close that blind spot.

**"대화 되짚어 보기" (UX-018 replay) verified by code review, not a separate bug**: `src/lib/
replay/buildReplayTimeline.ts` purely merges the (now-fixed) `deceivedMoments`/`tacticsUsed` by
`turnIndex` — no separate analysis, so it inherits the fix automatically. The one known gap
(`reports.resistedMoments?` per-turn "잘 대응한 지점" markers, [[project-codegate-t33-replay]] /
DECISIONS #26) is a pre-existing, explicitly-deferred-to-a-future-task field, NOT something this
bug touches — documented as out-of-scope rather than silently left broken.

**Windows Git-Bash + curl + literal Korean string = silent mojibake, not a terminal-display
artifact.** Embedding literal Hangul directly in a bash command that gets passed to `curl -d
"...한국어..."` produced genuinely corrupted bytes in Firestore (verified via `codePointAt` — actual
U+FFFD replacement characters stored, not just a rendering issue). This made the FIRST live-repro
attempt look like the regex fix didn't work, which cost real debugging time before realizing the
harness itself was broken. Fix/lesson: for any live-emulator script that needs to send non-ASCII
text through an HTTP callable from this sandbox, write a Node script using global `fetch` +
`JSON.stringify` (Node handles the UTF-8 encoding correctly) instead of embedding the literal string
in a bash/curl command line — never trust bash-embedded non-ASCII literals in this environment.

**Shared-worktree branch chaos, and how to recover a clean base**: mid-task, discovered the shared
working directory's checked-out branch had changed out from under me (from
`feat/T30-messenger-voice-escalation` at conversation start to `fix/T51-voice-latency-waveform`,
with an intervening `docs(T50)` commit — two other concurrent sessions' work, neither yet on `main`).
Verified my own edited files (`analyzeConversation.ts`, its test, `mockClient.ts`) were byte-identical
between `main` and the current stray HEAD (`git diff main <HEAD> -- <files>`) before doing
`git checkout -b my-branch main` — this re-bases my branch onto the correct point (`main`) while
Git preserves uncommitted working-tree changes across the branch switch (safe specifically because
there was no conflicting divergence in the files I'd touched). Confirmed via `docs/Tasks.md`/CHANGELOG
that a concurrent T51 implementer had already noticed and correctly ignored my in-progress files —
multi-agent shared-worktree collisions are a recurring hazard in this project (see
[[project-codegate-t15-history]], [[project-codegate-t49-messenger-challenge]] for prior instances)
but this is the first time the *branch itself* moved out from under a session, not just files.

**Task ID selection when Tasks.md-on-main doesn't reflect concurrent in-flight work**: `docs/
Tasks.md` on `main` only went up to T49, but git history (on other local/uncommitted branches)
already showed T50 (planner) and T51 (implementer) claimed by concurrent sessions. Picked T52 to
avoid a near-certain future collision, reasoning from `git log <branch> --oneline` across all
locally visible branches rather than just the file on `main` — Tasks.md-on-disk can lag reality in
a heavily-parallel multi-agent setup.

See also [[project-codegate-t9-report-generation]] (original analyzeConversation design, the
"resistance wins ties" principle this fix preserves), [[project-codegate-t33-replay]] (the
resistedMoments gap this task deliberately left alone), [[feedback-emulator-script-sdk-split]] and
[[project-codegate-t33-replay]] (prior emulator-scripting gotchas — this task adds the UTF-8/bash
one to that list).
