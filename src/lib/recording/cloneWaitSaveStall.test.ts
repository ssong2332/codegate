// §145.1 실기 결함(2026-11-26 04:53Z) — 보내기 녹음 뒤 clone/wait가 "잠시만 기다려 주세요"에 멈춤.
// 원인: saveVoiceProfile이 서버에서 purgeSession(사전 세션 voiceId 삭제)을 끝낸 뒤 응답 → 스냅샷이 voiceId null →
// Effect 2 재실행 · cleanup 취소 → 저장이 끝나도 이동 · 오류 표시를 건너뜀. 판정표 SR(cloneReadyRoute.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveProfileThenReturn } from "./cloneReadyRoute.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const HREF = "/challenge/create?scenarioId=family-accident-deepvoice";

/** 실기 순서 흉내: 저장 응답 직전에 세션 문서 voiceId가 지워지는 이벤트가 온다. */
function harness(opts: { fail?: boolean; unmountDuringSave?: boolean }) {
  const log: string[] = [];
  let mounted = true;
  let cleared = false;
  const deps = {
    save: async () => {
      log.push("voiceId-cleared"); // 서버 purgeSession → 스냅샷 voiceId null (화면이 다시 그려짐)
      if (opts.unmountDuringSave) mounted = false;
      if (opts.fail) throw { message: "이미 3개를 저장했습니다." };
      return { profileId: "p1" };
    },
    clearPending: () => {
      cleared = true;
    },
    isMounted: () => mounted,
    go: (href: string) => log.push(`go ${href}`),
    onError: (err: unknown) => log.push(`error ${(err as { message: string }).message}`),
    challengeHref: HREF,
  };
  return { deps, log, wasCleared: () => cleared };
}

test("[재현 SR1] 저장 중 voiceId가 null로 바뀌어도 그 프로필이 골라진 만들기 화면으로 간다", async () => {
  const h = harness({});
  await saveProfileThenReturn(h.deps);
  assert.deepEqual(h.log, ["voiceId-cleared", `go ${HREF}&voiceProfileId=p1`]);
  assert.equal(h.wasCleared(), true);
});

test("[SR2] 저장 실패 = 오류 표시(멈추지 않는다) · 저장 힌트는 남긴다", async () => {
  const h = harness({ fail: true });
  await saveProfileThenReturn(h.deps);
  assert.deepEqual(h.log, ["voiceId-cleared", "error 이미 3개를 저장했습니다."]);
  assert.equal(h.wasCleared(), false);
});

test("[SR3] 화면이 떠나면 이동 · 오류 표시 없음", async () => {
  const ok = harness({ unmountDuringSave: true });
  await saveProfileThenReturn(ok.deps);
  assert.deepEqual(ok.log, ["voiceId-cleared"]);
  assert.equal(ok.wasCleared(), true, "저장은 됐으니 힌트는 지운다");
  const bad = harness({ fail: true, unmountDuringSave: true });
  await saveProfileThenReturn(bad.deps);
  assert.deepEqual(bad.log, ["voiceId-cleared"]);
});

test("[배선] clone/wait 보내기 분기 — 저장은 effect cleanup으로 취소되지 않고 한 번만 시작한다", () => {
  const page = read("src/app/clone/wait/page.tsx");
  const branch = page.slice(page.indexOf('if (action.kind === "save" && pending) {'), page.indexOf("let cancelled = false;"));
  assert.ok(branch.length > 0, "보내기 분기가 일반 경로의 cancelled 선언보다 앞");
  assert.match(branch, /saveProfileThenReturn\(\{/);
  assert.match(branch, /isMounted: \(\) => mountedRef\.current/);
  assert.match(branch, /profileSaveStartedRef\.current = true;/);
  // U02 — 한 번만 = Effect 2 머리의 가드(판정 전에 건너뛴다 · 저장 중 CR3 이동 금지).
  assert.match(page, /if \(cloneState !== "ready" \|\| !sessionId\) return;[\s\S]{0,200}if \(profileSaveStartedRef\.current\) return;/);
  assert.doesNotMatch(branch, /cancelled/, "보내기 분기에 effect 취소 플래그가 남아 있다");
  assert.doesNotMatch(branch, /return \(\) =>/, "보내기 분기가 cleanup을 돌려준다");
  assert.match(page, /mountedRef\.current = true;\s*return \(\) => \{\s*mountedRef\.current = false;/);
});
