---
name: project-codegate-t10-purge-guardrail
description: T10 immediate-artifact-purge guardrail (AC-021, security gate) — onSessionEnded trigger design, why Storage prefix-listing beat the artifacts manifest, DI test pattern, left at review not done
metadata:
  type: project
---

T10 (가드레일2·생성물 즉시 폐기) implemented 2026-07-21, left at Status **`review`** (not `done`) —
this is one of the 3 hackathon security-gate tasks (T7/T10/T11) per DefinitionOfDone.md, so formal
reviewer APPROVED + quality-assurance GO are required before `done`. Files: `functions/src/guardrails/
purge.ts` (new — pure aggregation logic), `functions/src/guardrails/index.ts` (extended — added
`purgeSession()` orchestration + the real `onSessionEnded` trigger, kept existing `maskPII` intact),
`functions/src/guardrails/__tests__/purge.test.ts` (new, 11 tests), `functions/src/index.ts` (removed
the inline `onSessionEnded` stub, now `export { onSessionEnded } from "./guardrails"`).

**Moved the trigger definition out of `functions/src/index.ts` into `functions/src/guardrails/
index.ts`:** Architecture.md §2's folder table literally assigns "폐기 트리거" (the purge trigger
itself, not just PII masking) to `functions/src/guardrails/` as Track C/T10 territory. The T2-era
stub had defined `onSessionEnded` directly in `index.ts`. Moved it to match the established
per-track-module pattern every other function already follows (`createSession`/`endSession` live in
`session/index.ts`, `generateReport` in `report/index.ts`, both just re-exported from `index.ts`) —
`index.ts` is now purely a re-export barrel again, no inline logic.

**Key design decision — Storage prefix-listing instead of the `artifacts` manifest (flagged,
justified in the Tasks.md T10 row):** API.md/Architecture.md describe walking `sessions/{sid}/
artifacts` as the deletion manifest. Did **not** do that as the primary source; instead used
`bucket.getFiles({prefix: "users/{uid}/sessions/{sid}/"})` to enumerate real Storage objects. Two
reasons, both confirmed by reading code before deciding: (1) Database.md's `artifacts` subcollection
schema only covers synthesized outputs (audio/image) — it structurally cannot reference the raw
`voice_input.webm` recording, so relying on it alone would never delete the recording; (2)
[[project-codegate-t5-deepvoice-playback]] already documented that T5 deliberately never wrote to
`sessions/{sid}/artifacts` (`synthesizeDeepvoice` still only returns a Mock data URI, no Storage
write) — so that subcollection is **always empty** in the current codebase state. Prefix-listing is
the only approach that actually satisfies Architecture.md §6.2's literal text ("Storage
`users/{uid}/sessions/{sid}/**` 삭제") given real repo state. `sessions/{sid}/artifacts` Firestore
docs themselves are left untouched (AC-021 is about the Storage *files*, not the metadata docs) —
noted as an explicit scope boundary in the Tasks.md row.

**Partial-failure design (ADR-0003 requirement):** `purgeSessionArtifacts()` in `purge.ts` is pure
and injected via a `PurgeDeps` interface (`listStorageFiles`/`deleteStorageFile`/`deleteVoice`) so
target-level success/partial/failed aggregation (`computeOverallResult`) is unit-testable without an
emulator — same "pure logic separated from side effects" principle
[[project-codegate-t9-report-generation]] established with `analyzeConversation.ts`. Each Storage
file and the ElevenLabs voice each get their own try/catch → own `DeletionTarget`; one failure never
blocks the others. `session.voiceId` is always cleared via `FieldValue.delete()` after the purge
attempt completes, **regardless of whether the ElevenLabs delete succeeded** — deliberate: a future
retry job can still recover the voiceId from `deletionLogs.targets[].ref` (ADR-0003 explicitly wants
retry-ability), so there's no need to keep it on the session doc, and the ADR text just says "폐기
후 session.voiceId도 클리어" without conditioning on success.

**Trigger loop safety (verified live, not just reasoned about):** the guard is `before.status ===
after.status → return`. Since `purgeSession()`'s own writes (deletionLogs add, voiceId
`FieldValue.delete()`) never touch `status`, the trigger does not re-fire itself — confirmed via
emulator that exactly 1 `deletionLogs` doc gets created per real end-transition, not more.

**VoiceProvider.deleteVoice() call is unconditional on the interface, but only invoked when
`voiceId` exists** (sessions ended before clone completion skip the `elevenlabs_voice` target
entirely) — matches [[project-codegate-t19-voice-mock]]'s `deleteVoice(voiceId): Promise<void>`
contract (Mock is no-op but the call site itself doesn't change once ElevenLabsVoiceProvider
replaces Mock, per T19's stated design goal).

**Unit tests:** `purge.test.ts`, 11 tests — `computeOverallResult` (empty/all-success/partial/
all-failed) + `purgeSessionArtifacts` with fake deps (happy path 2 storage + 1 elevenlabs all
success, no-voiceId session skips the elevenlabs target, one Storage delete failing → partial while
the other still gets deleted, ElevenLabs delete failing → partial, empty session → success not
failure, `listStorageFiles` itself throwing → the prefix is recorded as a single failed target).
functions `npm test`: 54/54 (43 pre-existing + 11 new), no regressions. Root/functions lint and build
both clean.

**Emulator verification (established pattern, [[project-codegate-t9-report-generation]] precedent,
seeded scenarios first via `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-test npm run
seed:scenarios` — the seed script needs those two env vars set explicitly against the emulator, plain
`npm run seed:scenarios` fails with "Unable to detect a Project Id" otherwise):** throwaway
`verify-t10.mjs` (functions/, deleted after use, never committed), 21/21 assertions across 3
scenarios: (1) real recording + synth-audio Storage objects uploaded → createVoiceClone →
createSession → endSession → both actually deleted from Storage (existence-checked before/after,
not just deletionLogs content), `MockVoiceProvider.deleteVoice` actually invoked,
`deletionLogs` doc actually written with correct sessionId/uid/targets(2 storage + 1
elevenlabs_voice)/overallResult=success, `sessions.voiceId` field actually removed while `status`
stays `ended`; (2) a session with no `voiceId` (ended before clone) still purges safely with no
`elevenlabs_voice` target and `overallResult: success`; (3) exactly one `deletionLogs` doc exists per
session after the trigger settles, confirming no re-fire loop. Cleanup followed
[[feedback-background-emulator-task-tracking]] exactly.

**Known gaps flagged (not fixed, out of this task's scope):** (1) UX-007's "폐기 절차가
시작되었습니다" wording ([[project-codegate-t8-session-lifecycle]]'s deliberate T8-era hedge, since
T10 was a no-op then) could arguably now say something closer to "완료" since deletion is real — left
as a ux-design/docs follow-up recommendation, not changed here (out of implementer's UX-copy
authority without a UX task). (2) `sendMessage`'s `limit_reached` auto-end path also writes
`status: "ended"` and will trigger the exact same `onSessionEnded` logic — reasoned as
identical/covered by the trigger's field-based guard, but not separately exercised live in this
task's verification script (only the `endSession` callable path was).

See also [[project-codegate-t19-voice-mock]] (the `VoiceProvider.deleteVoice()` contract this task
calls), [[project-codegate-t9-report-generation]] (the pure-logic/side-effect separation + emulator
seeding precedent reused here), [[project-codegate-t8-session-lifecycle]] (the UX-007 wording hedge
this task's real deletion now makes revisitable), [[feedback-emulator-script-sdk-split]] (REST-based
verification script pattern), [[feedback-background-emulator-task-tracking]] (emulator cleanup
gotcha), [[project-codegate-context]] (T7/T10/T11 security-gate DoD mode — this task must stay at
`review` until reviewer+QA sign off, not implementer self-check like T4-T9).
