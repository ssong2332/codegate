---
name: project-codegate-t7-roleplay-mock
description: T7 AI 사기범 역할극 엔진 — LLM adapter/Mock design, createSession cross-track deviation, isMock contract drift into src/lib/api
metadata:
  type: project
---

T7 (AI 사기범 역할극 엔진) implemented 2026-07-21, left at Status `review` (not `done`) for two
independent reasons: (1) DefinitionOfDone.md 하카톤 모드 explicitly names T7 a security-gate task
requiring formal reviewer APPROVED + quality-assurance GO — self-check alone can never make it
`done`, unlike most other tasks in this repo; (2) the LLM is a Mock (see below), which is itself a
known-incomplete-verification flag per [[project-codegate-t19-voice-mock]]'s precedent.

**Files:** `functions/src/llm/{types,mockClient,index}.ts` (LlmClient interface + MockLlmClient,
mirrors voice/provider.ts's adapter-behind-factory pattern — `getLlmClient()` is the single
swap point for a future Claude/Gemini client), `functions/src/roleplay/{promptAssembly,
sessionLimits,openingLine,index,types}.ts`, `functions/src/session/{index,types}.ts`
(`createSession` — see cross-track note below), `functions/src/guardrails/index.ts` (added a
minimal `maskPII` passthrough stub — T10/T11 hadn't run yet so it didn't exist; real regex
tokenization is still T11's job), `functions/src/firebaseAdmin.ts` (new — first module in the repo
to need `getFirestore()` outside a standalone script; `ensureFirebaseAdminApp()` guards
`initializeApp()` with `getApps().length` check so multiple modules can call it safely at import
time), `functions/src/shared/types.ts` (added optional `LlmProviderName`/`SessionDoc.llmProvider`,
mirroring T19's `VoiceProviderName`/`voiceProvider` precedent for mock traceability).

**Mock LLM — what is and isn't verified:** `MockLlmClient` is a deterministic rule-based text
generator, not a real language model. It derives dialogue from the scenario's `weakenedTactics`
labels (strips the "라벨 — 설명" prefix) and detects a small regex of injection/abuse keywords
(시스템 프롬프트, 계좌번호, "너는 AI" 등) to return a canned in-character deflection instead of
complying. This proves the **structural** wiring (server-assembled system prompt via
`buildSystemPrompt` = personaPrompt+weakenedTactics+guardrailPreamble per ADR-0004; user input
wrapped in `[훈련참가자입력:...]` delimiters + role separation via `wrapUserInputAsData`/
`toLlmHistory`; turn/time-limit auto-end via pure `isSessionLimitReached()`) but does **not**
verify real persona consistency, real-LLM-level tone adaptation, or that a real model actually
honors the guardrail preamble under adversarial pressure — that only becomes verifiable once
`LLM_API_KEY` is set and a real Claude/Gemini client replaces `MockLlmClient` behind
`getLlmClient()`. `functions/.env` does not exist yet (confirmed by direct check, same as
[[project-codegate-firebase-build-blocker]]'s finding for the client-side Firebase key) —
`functions/.env.example`'s `LLM_API_KEY` is still a placeholder.

**Cross-track deviation (flagged, not silent):** Architecture.md §4/API.md assign `createSession`
to Track B/T8 (`functions/src/session/`), and `src/lib/api/createSession.ts`'s existing comment
said "T8에서 실호출로 교체". The T7 task brief explicitly instructed implementing `createSession`
fully anyway (needed to exercise `generateOpeningLine`/AC-003 end-to-end, and T8 hadn't started —
Tasks.md still `todo` at the time). Implemented it in `functions/src/session/index.ts` with an
inline comment explaining the deviation, so T8 doesn't redo it from scratch — T8 should focus on
`endSession`'s body + AC-006/015/023 (always-visible end control, disclosure message, "this was
training" notice), which `createSession` does not touch.

**Known gap for T8/T9 to resolve:** when `sendMessage` auto-ends a session via `limit_reached` (it
writes `status:"ended"` directly, per API.md's own sendMessage contract), that path never goes
through the `endSession` callable's "실호출 후 서버 내부 generateReport 호출" step described in
Architecture.md §5's data flow — so AC-007's "종료된 모든 세션은 정확히 1개의 리포트를 생성"
invariant is not yet wired for the auto-limit-reached case. `onSessionEnded` (T10, still a stub)
fires either way since it just watches for `status` transitioning to `ended`, but report generation
specifically needs T8/T9 to ensure `generateReport` also fires when `sendMessage` (not `endSession`)
is what flipped the status.

**API contract drift not mirrored to client (explicitly out of scope this task):** Added optional
`isMock?: boolean` to `functions/src/roleplay/types.ts` (`SendMessageResponse`) and
`functions/src/session/types.ts` (`CreateSessionResponse`), matching T19's `isMock` pattern on the
voice side. Per this task's explicit scope restriction, `src/lib/api/types.ts` (the client-side
mirror of these same contracts) was **not** touched — so the client currently has no typed way to
read this flag even though the server now returns it. Recommend an architect/docs Update Request to
mirror `isMock?: boolean` into `src/lib/api/types.ts`'s `SendMessageResponse`/`CreateSessionResponse`
next time that file is touched (same category of gap T19 left for `src/lib/api`'s voice types,
except T19's task scope did permit touching `src/lib/api` where this one didn't).

**AC-004 (LLM latency ≤10s p95) not meaningfully tested:** Mock always resolves near-instantly, so
any latency test against it would trivially pass without proving anything about real-model latency.
Real verification needs the eventual Claude/Gemini client (same "PRD OQ-9 still open, gassumption
value only" status noted in PRD.md).

See also [[project-codegate-context]] (hackathon DoD mode — T7 is one of the 3 security-gate tasks
needing formal reviewer/QA), [[project-codegate-t19-voice-mock]] (the adapter-behind-factory +
isMock pattern this task reused for LLM), [[project-codegate-t6-scenario-content]] (scenarioPrompts/
SCENARIO_PROMPTS this task consumes directly in-process rather than via a Firestore read, per this
task's own explicit instruction — Functions can just import the compiled constant since it's the
same deploy artifact).
