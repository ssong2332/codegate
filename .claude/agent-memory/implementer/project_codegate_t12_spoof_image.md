---
name: project-codegate-t12-spoof-image
description: T12 spoof image (UX-009/AC-025) implementation choices — CSS-card asset decision, chat page still a stub so no real integration, no artifacts Firestore write
metadata:
  type: project
---

T12 (P1, self-check task — not a security gate) completed `src/components/SpoofImage.tsx`
(fake "송금완료" bank-app screen) and left `src/app/session/chat/page.tsx` untouched except a
documentation comment.

**Static asset decision:** No image-generation tool was bound in that session's tool list (despite
MCP server instructions text mentioning Higgsfield generate_image — it wasn't actually available as
a callable function), so per CLAUDE.md's "don't guess/assume a tool exists" rule, went with the
task's explicitly-permitted fallback: an HTML/CSS-drawn fake bank transfer-complete card instead of
a real PNG/SVG. Component still accepts an optional `src` prop so a real asset can be dropped in
later without changing the contract (Architecture.md §12 marks UX-009 as "정적 에셋"). If `src` is
given and the `<img>` fails to load, the whole component returns null (UX-009's documented "로드
실패 시 생략" behavior) — the no-`src` CSS-card path can't hit this failure mode since there's no
network load.

**Chat screen (UX-006) still a stub:** `src/app/session/chat/page.tsx` was, at T12 time, still the
original T2/T7/T8 stub (no real chat UI, only backend `createSession`/`sendMessage` exist). Per the
task's explicit instruction, did NOT build the chat screen to wire in SpoofImage — that's out of
scope for T12. Instead added a short TODO comment at the top of that stub documenting exactly how a
future chat-UI implementer should overlay `SpoofImage` (component itself is complete and reusable).
See [[project_codegate_t7_roleplay_mock]] and [[project_codegate_t8_session_lifecycle]] for why that
screen is still unbuilt as of this date.

**No `sessions/{sid}/artifacts` Firestore write added:** Architecture.md §12 marks that write as
"(P1)" for UX-009, and since no screen actually calls SpoofImage with real data yet, there was
nothing meaningful to persist — deliberately left out per "no unnecessary work" scope discipline.
Flag for whoever eventually wires SpoofImage into the real chat screen: consider whether an
ArtifactDoc write is warranted at that point.

**No component test added:** confirmed (again) no frontend test framework exists in this repo
(package.json has no jest/vitest/testing-library, `npm run lint` is the only script besides
build/dev/start) — same gap as [[project_codegate_t3_onboarding_voice]] and siblings. Unlike those
tasks, SpoofImage has zero Firestore/Storage/Functions calls, so there's also no emulator-based
verification substitute available; evidence was limited to lint+build clean plus manual code-review
of the three render branches (src+success / src+failure / no-src).
