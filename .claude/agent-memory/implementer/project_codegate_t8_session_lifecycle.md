---
name: project-codegate-t8-session-lifecycle
description: T8 session lifecycle + always-on end + disclosure — endSession idempotency design, single report-trigger point, discovered client-stub gaps, UX-007 wording deviation
metadata:
  type: project
---

T8 (세션 라이프사이클 + 상시 안전 종료 + 디스컬레이션 + "훈련이었습니다" 고지) implemented
2026-07-21, left at Status `done` (self-check — T8 is not one of the 3 hackathon security-gate
tasks per DefinitionOfDone.md). Files: `functions/src/session/index.ts` (`endSession` body),
`functions/src/report/index.ts` (new `triggerReportGeneration(sessionId)`), `functions/src/roleplay/
index.ts` (one added call site in the `limitReached` branch, no other roleplay logic touched),
`src/lib/api/{createSession,endSession}.ts` (real `httpsCallable` wiring), `src/app/session/end/
page.tsx` (UX-007, full implementation), `functions/src/report/__tests__/triggerReportGeneration.test.ts`
(new).

**Single report-trigger point design:** `triggerReportGeneration(sessionId)` in
`functions/src/report/index.ts` is called from exactly two places — `endSession` (after writing
`status:"ended"`) and `sendMessage`'s `limitReached` branch (the AC-007 auto-end gap [[project-codegate-t7-roleplay-mock]]
flagged) — never both for the same transition, because `endSession` is idempotent: if
`session.status` is already `"ended"` it returns immediately without rewriting fields or
re-triggering. Verified live via emulator that the trigger's log line fires **exactly twice** for
two genuine end-transitions and **zero times** on two subsequent idempotent re-calls (including
calling `endSession` on a session that was already auto-ended by `limitReached`) — this is the
concrete evidence AC-007's "정확히 1개 리포트" invariant holds at the trigger-wiring level. The
function itself still has no real body (T9's job) — it only logs and swallows errors so a failing/
missing report generator never blocks the session-end response itself.

**Discovered cross-track gap (fixed, in scope): `src/lib/api/createSession.ts` and
`src/lib/api/endSession.ts` were still T2 dummy stubs (`void request; return {...fake data}`)
despite the real server-side implementations existing** in `functions/src/session/index.ts` since
T7/this task. Each stub file's own comment explicitly said "T8에서 실호출로 교체" — confirming
this was T8's responsibility, not scope creep. Fixed both to real `httpsCallable`, mirroring
`createVoiceClone.ts`'s existing pattern. This was a **blocking prerequisite**: without it, calling
`scenarios/page.tsx` → `createSession` never reached the server at all, so nothing downstream
(including this task's own `endSession` work) could be verified through the real client wrapper —
only through direct emulator-script httpsCallable calls, which is what T4/T5's verify scripts
actually exercised (their "실호출 확인" claims were true for the *server* function, not through
this now-fixed client stub).

**Same-pattern gap NOT fixed (correctly out of scope, flagged for owners):**
`src/lib/api/sendMessage.ts` (comment: "T7에서 실호출로 교체"), `synthesizeDeepvoice.ts` ("T5에서
실호출로 교체"), `generateReport.ts` ("T9에서 실호출로 교체") are **still** T2 dummy stubs as of
this task — confirmed by direct read, not assumption. This means `session/play/page.tsx`'s
`synthesizeDeepvoice({sessionId, lineId})` call (T5, claimed "실호출" in its own Tasks.md row) is
actually calling the fake stub returning a hardcoded `/mock-audio/mock-deepvoice-stub.mp3` —
**T5's emulator verification exercised the server function directly, not through this client path**.
Recommend a bugfix task or T9 (when touching `generateReport.ts` anyway) sweep all three.

**UX-007 wording deviation (deliberate, flagged not silent):** UX.md's Success state literally says
show "폐기 완료" 표기, but `onSessionEnded` (T10) is still a no-op stub — nothing is actually
deleted yet. Displaying "폐기 완료" (purge *complete*) would be an unfounded claim. Used "폐기
절차가 시작되었습니다" (purge process *has started*) instead — true given the trigger-write did
fire — and left this substitution explicit in both the Tasks.md T8 row and inline code comment.
Recommend ux-design/docs confirm final copy once T10 actually deletes something.

**Emulator verification:** reused the established pattern ([[project-codegate-t4-voice-clone-pipeline]]/
[[project-codegate-t5-deepvoice-playback]] precedent) — a throwaway `verify-t8.mjs`, copied
temporarily into the repo root (not `/tmp`) so `node_modules` resolution works, run against
`firebase emulators:start --only auth,firestore,storage,functions --project demo-test`, then
deleted (never committed). 16/16 assertions: createSession real-wiring adoption, endSession
ownership/invalid-argument/failed-precondition/idempotency, sendMessage's 10-turn `limit_reached`
auto-end (regression-free), and the report-trigger log-count evidence described above. Cleanup
followed [[feedback-background-emulator-task-tracking]] exactly (PIDs via `netstat`, `taskkill
//PID <pid> //F //T`, `firestore-debug.log` removed).

**What is NOT verified:** real browser clicking (same class of gap as every prior UI task in this
repo — no browser-automation tool available).

See also [[project-codegate-context]] (hackathon self-check mode), [[project-codegate-t7-roleplay-mock]]
(the AC-007 auto-end gap this task closes), [[project-codegate-t4-voice-clone-pipeline]] /
[[project-codegate-t5-deepvoice-playback]] (the emulator-script verification precedent this task
reused), [[feedback-background-emulator-task-tracking]] (emulator process cleanup gotcha).
