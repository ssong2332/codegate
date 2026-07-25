---
name: project-codegate-t19-voice-mock
description: T19 VoiceProvider interface + Mock implementation design/state — what T4/T5 inherit, docs drift introduced, and the no-test-framework workaround used
metadata:
  type: project
---

T19 (음성 프로바이더 인터페이스 + 목업) completed 2026-07-21. Files: `functions/src/voice/provider.ts`
(interface `VoiceProvider` + factory `getVoiceProvider()`, always returns Mock today),
`functions/src/voice/mockProvider.ts` (`MockVoiceProvider`), `functions/src/voice/mockAudio.ts`
(generates a short sine-wave beep WAV as a `data:audio/wav;base64,...` URI — no external asset
files needed, no new npm dependency). All mock outputs carry `isMock: true` + `mock-` prefixed
ids (`MOCK_VOICE_ID_PREFIX`, `MOCK_ARTIFACT_ID_PREFIX`) so they can never be mistaken for real
ElevenLabs output — this is the "육안 식별 가능한 표식" the task required.

**What T19 already did that T4/T5 might assume still needs doing:** `functions/src/voice/index.ts`
(`createVoiceClone`/`synthesizeDeepvoice` callables) no longer throw "unimplemented" — they now
call `getVoiceProvider()` and return real (mock) responses end-to-end. What's still genuinely
TODO for T4: Storage read of the actual uploaded recording, and writing `sessions/{sid}.voiceId`/
`cloneStatus` to Firestore. For T5: resolving `lineId` to real scenario dialogue text, uploading
the synthesized audio to Storage, and writing the `artifacts/{artifactId}` Firestore doc. These
TODOs are marked inline in `voice/index.ts` with `TODO(T4)`/`TODO(T5)` comments.

**Docs drift introduced (needs architect/docs follow-up):** Added optional fields
`SessionDoc.voiceProvider` and `ArtifactDoc.voiceProvider` (type `"mock"|"elevenlabs"`) to
`functions/src/shared/types.ts` for Firestore-level mock/real traceability. **docs/Database.md
does not yet document these fields** — recommend a docs/UpdateRequests.md row naming architect,
or architect adding them directly, next time Database.md is touched. Not blocking since fields
are optional (backward-compatible per Database.md Migration Policy).

**No test framework existed anywhere in the repo (frontend or functions) as of T19.** Root
`package.json` and `functions/package.json` have no jest/vitest/etc. Adding one would count as a
"new dependency" requiring a docs/DECISIONS.md entry under CodingRules.md — which implementer
can't write (architect-owned). Resolution used: wrote functions-side tests with Node's **built-in**
`node:test` + `node:assert/strict` (zero new deps), compiled via existing `tsc`, and added
`"test": "tsc && node --test lib/**/__tests__/*.test.js"` to `functions/package.json`. Passing a
bare directory to `node --test <dir>` does NOT work reliably on this Windows/Node 22 setup (it
gets treated as a single module and fails to resolve) — you must pass an explicit file glob
(`lib/**/__tests__/*.test.js`) or explicit file list. The Next.js frontend (`src/`) still has no
test runner at all — if a future task needs frontend unit tests, this gap will need a real
decision (vitest/jest + DECISIONS.md entry), it can't be dodged with node:test since JSX/browser
APIs are involved.

See also [[project-codegate-context]] for the broader hackathon DoD-mode and doc-drift context.
