// U02(2026-11-26 실기 신고) — "녹음하고 가상 음성이 준비됐어요 페이지에서 여전히 다음으로 안 넘어간다".
// 원인: clone/wait Effect 2가 `!voiceId`면 아무것도 안 했다. 보내기 저장(saveVoiceProfile)은 서버에서 사전 세션 voiceId를
// 지운다 → 그 뒤 화면이 다시 뜨면(모바일 탭 재로드 · 뒤로 가기) 스냅샷 = ready ∧ voiceId 없음 → 제목만 "준비됐어요", 버튼 0.
// 또 저장 실패 뒤 "다시 시도"는 profileSaveStartedRef 가드에 막혀 아무 일도 안 했다. 판정표 CR = cloneReadyRoute.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloneWaitHeading, resolveCloneReadyAction, resolveCloneReadyRoute } from "./cloneReadyRoute.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PAGE = fs.readFileSync(path.join(ROOT, "src/app/clone/wait/page.tsx"), "utf8").replace(/\r\n/g, "\n");
const HREF = "/challenge/create?scenarioId=family-accident-deepvoice";
const SEND = resolveCloneReadyRoute({ messengerVoiceSelectReturn: false, experienceMode: "send", scenarioId: "family-accident-deepvoice" });
const SELF = resolveCloneReadyRoute({ messengerVoiceSelectReturn: false, experienceMode: "self", scenarioId: "x" });
const MSG = resolveCloneReadyRoute({ messengerVoiceSelectReturn: true, experienceMode: null, scenarioId: "x" });

test("[재현 CR3] 보내기 저장 뒤 다시 뜬 화면(ready · voiceId 없음 · 저장 값 남음) → 만들기 화면으로 이동", () => {
  assert.deepEqual(resolveCloneReadyAction(SEND, null, true), { kind: "go", href: HREF, clearPending: true });
});

test("[판정표 CR] 경로 · voiceId · 저장 값 → 할 일(멈춤 0)", () => {
  assert.deepEqual(resolveCloneReadyAction(MSG, null, false), { kind: "go", href: "/scenarios/messenger/voice-select", clearPending: false });
  assert.deepEqual(resolveCloneReadyAction(MSG, "v1", true), { kind: "go", href: "/scenarios/messenger/voice-select", clearPending: false });
  assert.deepEqual(resolveCloneReadyAction(SEND, null, false), { kind: "go", href: HREF, clearPending: false });
  assert.deepEqual(resolveCloneReadyAction(SEND, "v1", false), { kind: "go", href: HREF, clearPending: false });
  assert.deepEqual(resolveCloneReadyAction(SEND, "v1", true), { kind: "save", href: HREF });
  assert.deepEqual(resolveCloneReadyAction(SELF, null, false), { kind: "need-record" });
  assert.deepEqual(resolveCloneReadyAction(SELF, "v1", false), { kind: "start", voiceId: "v1" });
});

test("[제목] 넘어갈 수 없는 상태는 '준비됐어요'가 아니다", () => {
  for (const s of ["start-error", "save-error", "no-scenario", "no-voice"] as const) {
    assert.notEqual(cloneWaitHeading("ready", s), "가상 음성이 준비됐어요", s);
  }
  for (const s of ["idle", "starting", "saving"] as const) assert.equal(cloneWaitHeading("ready", s), "가상 음성이 준비됐어요", s);
  assert.equal(cloneWaitHeading("pending", "idle"), "가상 음성을 만들고 있어요");
  assert.equal(cloneWaitHeading("checking", "idle"), "가상 음성을 만들고 있어요");
  for (const c of ["failed", "read-error", "no-session"] as const) assert.notEqual(cloneWaitHeading(c, "idle"), "가상 음성을 만들고 있어요", c);
});

test("[배선] Effect 2는 voiceId 없다고 멈추지 않는다 · 저장 중엔 판정을 건너뛴다 · 다시 시도는 저장을 다시 연다", () => {
  const effect = PAGE.slice(PAGE.indexOf("// Effect 2"), PAGE.indexOf("const handleRetryStart"));
  assert.match(effect, /if \(cloneState !== "ready" \|\| !sessionId\) return;/);
  assert.doesNotMatch(effect, /!voiceId\) return;/, "예전 가드(voiceId 없으면 아무것도 안 함)가 남아 있다");
  const guardAt = effect.indexOf("if (profileSaveStartedRef.current) return;");
  const actionAt = effect.indexOf("resolveCloneReadyAction(");
  assert.ok(guardAt > 0 && actionAt > guardAt, "저장이 시작된 뒤엔 CR3(이동)로 저장을 앞지르지 않는다");
  assert.match(effect, /if \(action\.clearPending\) clearPendingVoiceProfileSave\(\);/);
  assert.match(effect, /setStartState\("no-voice"\)/);
  assert.match(PAGE, /const handleRetryStart = \(\) => \{\s*profileSaveStartedRef\.current = false;/);
  assert.match(PAGE, /cloneWaitHeading\(cloneState, startState\)/);
  const noVoice = PAGE.slice(PAGE.indexOf('startState === "no-voice" && ('));
  assert.match(noVoice.slice(0, 800), /onClick=\{handleRetryRecord\}/, "no-voice 안내에 재녹음 버튼");
});
