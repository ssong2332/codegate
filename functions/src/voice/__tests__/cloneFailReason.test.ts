// §146 판정표 CF — 클론 준비 실패 중 '대본 줄 인식 부족'만 구분되는 오류 코드로(라이브 2026-11-26: 쉼 없이 이어 읽은 54초 WAV →
// /prepare {ok:false} → 화면은 "다시 시도해 주세요"뿐).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GSV_SCRIPT_UNREADABLE, GsvVoiceProvider, type GsvDeps } from "../gsvProvider";
import { CLONE_SCRIPT_UNREADABLE_REASON } from "../provider";

const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="; // 시험 전용(gsvProvider.test.ts와 같은 값)
const REPO = join(__dirname, "..", "..", "..", "..");

function provider(prepare: () => Promise<unknown>) {
  const deps: GsvDeps = {
    endpoint: "https://x.modal.run",
    key: KEY,
    nowMs: () => 1_000_000,
    signedReadUrl: async (p) => `https://signed/${p}`,
    writeFile: async () => undefined,
    listFiles: async () => [],
    deleteFile: async () => undefined,
    fetchJson: () => prepare(),
  };
  return new GsvVoiceProvider(deps);
}
const run = (res: unknown) => provider(async () => res).createClone({ sessionId: "s", uid: "u", voiceInputStoragePath: "p" });

test("[CF] prepare 실패 사유 판정표", async () => {
  const rows: [unknown, string | undefined][] = [
    [{ ok: false, reason: "too_little_speech" }, "script_unreadable"], // CF1 쉼 없이 이어 읽음(라이브 readLines 1)
    [{ ok: false, reason: "no_main_ref" }, "script_unreadable"], // CF1
    [{ ok: false, reason: "gpu_oom" }, undefined], // CF2 그 밖
    [{ ok: false }, undefined],
    [null, undefined],
    [{ ok: true, clips: [] }, undefined],
  ];
  for (const [res, want] of rows) {
    const r = await run(res);
    assert.equal(r.cloneStatus, "failed", JSON.stringify(res));
    assert.equal(r.failureReason, want, JSON.stringify(res));
  }
});

test("[CF3] 네트워크 · 시간 초과(fetch 예외) = 예외 그대로(콜러블 internal · 종전 문구)", async () => {
  await assert.rejects(
    provider(async () => {
      throw new Error("timeout");
    }).createClone({ sessionId: "s", uid: "u", voiceInputStoragePath: "p" }),
  );
});

test("[대조] 구분 사유 = services/gsv/refpick.py pick()의 실패 사유 전부", () => {
  const py = readFileSync(join(REPO, "services", "gsv", "refpick.py"), "utf8");
  const reasons = [...py.matchAll(/"ok": False, "reason": "([a-z_]+)"/g)].map((m) => m[1]).sort();
  assert.ok(reasons.length > 0);
  assert.deepEqual([...GSV_SCRIPT_UNREADABLE].sort(), reasons);
});

test("[배선] createVoiceClone — script_unreadable = failed-precondition + details.reason · 그 밖 = internal", () => {
  const src = readFileSync(join(REPO, "functions", "src", "voice", "index.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(CLONE_SCRIPT_UNREADABLE_REASON, "clone_script_unreadable");
  const at = src.indexOf('if (result.failureReason === "script_unreadable")');
  assert.ok(at > 0);
  const tail = src.slice(at);
  assert.match(tail, /^[^]*?throw new HttpsError\("failed-precondition", [^]*?reason: CLONE_SCRIPT_UNREADABLE_REASON/);
  assert.ok(tail.indexOf('throw new HttpsError("internal", "음성 클론 생성에 실패했습니다.")') > 0, "그 밖 실패는 종전 그대로");
});
