import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { isVerifyTransferReachable, type VerifyOfferDocState } from "../transferReach";
import { verifySeriesFor } from "../../realtime/liveTools";
import { VERIFY_INTERCEPT } from "../../scenarios/verifyIntercept";

// T192 C6-R · G588 — `isVerifyTransferReachable` 진리표 6행 전수 + 역검증(Architecture.md §79.20 (3) ② · (11) · OQ-A150 (가)).
const SRC = path.resolve(__dirname, "../../../src");
const SERIES_B = Object.keys(VERIFY_INTERCEPT).filter((id) => verifySeriesFor(id) === "B");
const SERIES_A = Object.keys(VERIFY_INTERCEPT).filter((id) => verifySeriesFor(id) === "A");
const NO_CATALOG = "kidnapping-threat";
const DOCS: readonly VerifyOfferDocState[] = ["present", "absent", "unknown"];

test("[G588 전제] 계열 B 6종 · 계열 A 1종(bank) · 카탈로그 없는 대조군", () => {
  assert.equal(SERIES_B.length, 6, `계열 B가 6종이 아니다: ${SERIES_B.join(",")}`);
  assert.deepEqual(SERIES_A, ["bank-security-verify-scam"]);
  assert.equal(verifySeriesFor(NO_CATALOG), undefined);
});

test("[G588] 진리표 6행 전수 — false는 폴백 ∧ 계열 B ∧ 문서 없음(읽기 성공) 하나뿐", () => {
  const rows: Array<readonly [string, "realtime" | "fallback", string, VerifyOfferDocState, boolean]> = [];
  for (const id of [...SERIES_B, ...SERIES_A, NO_CATALOG]) {
    for (const offerDoc of DOCS) rows.push([`1 실시간 ${id}/${offerDoc}`, "realtime", id, offerDoc, true]);
  }
  for (const offerDoc of DOCS) rows.push([`2 폴백 카탈로그 없음/${offerDoc}`, "fallback", NO_CATALOG, offerDoc, true]);
  for (const offerDoc of DOCS) rows.push([`3 폴백 계열 A/${offerDoc}`, "fallback", SERIES_A[0]!, offerDoc, true]);
  for (const id of SERIES_B) {
    rows.push([`4 폴백 B 문서 있음 ${id}`, "fallback", id, "present", true]);
    rows.push([`5 폴백 B 읽기 실패 ${id}`, "fallback", id, "unknown", true]);
    rows.push([`6 폴백 B 문서 없음 ${id}`, "fallback", id, "absent", false]);
  }
  for (const [label, p, scenarioId, offerDoc, expected] of rows) {
    assert.equal(isVerifyTransferReachable({ path: p, scenarioId, offerDoc }), expected, label);
  }
  const falses = rows.filter((r) => !isVerifyTransferReachable({ path: r[1], scenarioId: r[2], offerDoc: r[3] }));
  assert.equal(falses.length, SERIES_B.length, "false 칸이 계열 B 6종 × 문서 없음 밖으로 번졌다");
});

test("[G588 역검증] 6행 입력에서 offerDoc만 present/unknown · path만 realtime · 계열만 A로 바꾼 사본은 각각 true", () => {
  for (const id of SERIES_B) {
    const base = { path: "fallback" as const, scenarioId: id, offerDoc: "absent" as const };
    assert.equal(isVerifyTransferReachable(base), false, id);
    assert.equal(isVerifyTransferReachable({ ...base, offerDoc: "present" }), true, `${id} present`);
    assert.equal(isVerifyTransferReachable({ ...base, offerDoc: "unknown" }), true, `${id} unknown`);
    assert.equal(isVerifyTransferReachable({ ...base, path: "realtime" }), true, `${id} realtime`);
    assert.equal(isVerifyTransferReachable({ ...base, scenarioId: SERIES_A[0]! }), true, `${id} → 계열 A`);
  }
});

test("[G588 배선] 폴백 · 콜러블이 이 함수 하나를 부른다 · 클라 요청에 이 값 0 · decide.ts는 이 파일을 import하지 않는다", () => {
  const roleplay = readFileSync(path.join(SRC, "roleplay/index.ts"), "utf8");
  const commit = readFileSync(path.join(SRC, "scammerHangup/commit.ts"), "utf8");
  const decide = readFileSync(path.join(SRC, "scammerHangup/decide.ts"), "utf8");
  const types = readFileSync(path.join(SRC, "scammerHangup/types.ts"), "utf8");
  assert.match(roleplay, /transferReachable: isVerifyTransferReachable\(\{\s*path: "fallback",\s*scenarioId: session\.scenarioId,\s*offerDoc: verifyOfferDoc,\s*\}\)/);
  assert.match(commit, /transferReachable: isVerifyTransferReachable\(\{ path: "realtime", scenarioId: session\.scenarioId, offerDoc \}\)/);
  assert.equal(roleplay.split("isVerifyTransferReachable(").length - 1, 1, "폴백 판정 지점 1곳");
  assert.equal(/from\s+"\.\/transferReach"/.test(decide), false, "잎 모듈 decide.ts가 transferReach를 import한다(순환)");
  assert.equal(/transferReachable|offerDoc/.test(types), false, "요청 계약에 클라 값으로 이 입력이 들어왔다");
});
