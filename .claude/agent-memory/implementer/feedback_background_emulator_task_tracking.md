---
name: feedback-background-emulator-task-tracking
description: Bash tool's run_in_background task tracker reports a `firebase emulators:start ... &` launcher as "completed" instantly even though the real emulator process is still alive — verify/kill by port PID, don't trust TaskStop or the "completed" status.
metadata:
  type: feedback
---

When starting Firebase emulators for verification, running `firebase emulators:start ... &
echo "started"` via the Bash tool with `run_in_background: true` causes the tool's task tracker to
report the task as **"completed" almost immediately** — because the tracked shell command itself
(the `&`-launcher + `echo`) exits right away, even though the actual `firebase`/`java`/`node`
emulator process tree it detached keeps running in the background outside the tracker's view.

**Why this matters:** `TaskStop` on that task id then fails with "not running" even though the
emulators are demonstrably still up (ports 5001/8080/9099/9199 LISTENing). Don't take "completed"
as a signal that cleanup already happened, and don't waste a turn trying `TaskStop` on it.

**How to apply:** After verification is done, find the real PIDs via `netstat -ano | grep
LISTENING` on the emulator ports, then `taskkill //PID <pid> //F //T` (double-slash on Git Bash to
avoid path-conversion mangling the `/F /T` flags) to kill the whole process tree in one shot —
killing the parent PID (the one owning ports 5001/9099/etc., usually the same PID across several
of those ports) cascades to children. Re-check with `netstat -ano | grep LISTENING` afterward to
confirm zero matches before declaring cleanup done. This is the same cleanup pattern
[[project-codegate-t3-onboarding-voice]] and [[project-codegate-t4-voice-clone-pipeline]] used,
now generalized — it's not specific to one task.
