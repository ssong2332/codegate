// Edge 재시험 19 ②(2026-11-09 · 기관 사칭 고급 `fv-c5fj` 3통화) — 리플레이가 통화 2(가상 캐피탈 대출 실행 확인 상담원 · 02-0719-3300 · 사기범 아님)의
// 대사를 "02-6478-2718 (사칭)"으로 보였다. 판정표 R(`replayCaller.ts`) · 화면 배선을 고정한다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readReplayCallLegs, replayCallerFor } from "./replayCaller.ts";

const SCENARIO_LABEL = "02-6478-2718";
// 서버 리포트 스냅샷(`functions/src/report/replayCallLegs.ts`)이 fv-c5fj에 쓰는 값(서버 시험 `replayCallLegs.test.ts`가 같은 값을 고정한다).
const C5FJ_REPORT = [{ callerLabel: "02-6478-2718" }, { callerLabel: "02-0719-3300", genuine: true }, { callerLabel: "02-6478-2718" }];

test("[재시험 19 ② 재현] 통화 2 상담원 대사 = 그 통화 번호 · '(사칭)' 없음, 통화 1 · 3 = 사칭 번호", () => {
  const legs = readReplayCallLegs(C5FJ_REPORT);
  assert.deepEqual(replayCallerFor(1, legs, SCENARIO_LABEL), { label: "02-0719-3300", impersonation: false });
  assert.deepEqual(replayCallerFor(0, legs, SCENARIO_LABEL), { label: "02-6478-2718", impersonation: true });
  assert.deepEqual(replayCallerFor(2, legs, SCENARIO_LABEL), { label: "02-6478-2718", impersonation: true });
});

test("[판정표 R] R1 · R4 = 종전 표시 · 형식 밖 스냅샷은 통째로 무시", () => {
  // R1 — 다통화 아님 · 옛 리포트
  assert.equal(readReplayCallLegs(undefined), null);
  assert.equal(readReplayCallLegs([]), null);
  assert.deepEqual(replayCallerFor(1, null, SCENARIO_LABEL), { label: SCENARIO_LABEL, impersonation: true });
  assert.deepEqual(replayCallerFor(undefined, null, SCENARIO_LABEL), { label: SCENARIO_LABEL, impersonation: true });
  // 형식 밖 한 줄이라도 있으면 null(종전)
  assert.equal(readReplayCallLegs([{ callerLabel: "02-1" }, { callerLabel: 3 }]), null);
  assert.equal(readReplayCallLegs([{ callerLabel: " " }]), null);
  assert.equal(readReplayCallLegs("x"), null);
  // genuine은 true만 인정
  assert.deepEqual(readReplayCallLegs([{ callerLabel: "02-1", genuine: "yes" }]), [{ callerLabel: "02-1" }]);
  // R2 — legIndex 부재 = 0(서버 관례)
  const legs = readReplayCallLegs(C5FJ_REPORT);
  assert.deepEqual(replayCallerFor(undefined, legs, "x"), { label: "02-6478-2718", impersonation: true });
  // R4 — 범위 밖 · 정수 아님
  assert.deepEqual(replayCallerFor(3, legs, SCENARIO_LABEL), { label: SCENARIO_LABEL, impersonation: true });
  assert.deepEqual(replayCallerFor(1.5, legs, SCENARIO_LABEL), { label: SCENARIO_LABEL, impersonation: true });
  assert.deepEqual(replayCallerFor(-1, legs, SCENARIO_LABEL), { label: SCENARIO_LABEL, impersonation: true });
});

test("[재시험 19 ② 배선] 리플레이 화면이 메시지 legIndex · 리포트 callLegs로 고른다(고정 '(사칭)' 0)", () => {
  const page = readFileSync(fileURLToPath(new URL("../../app/report/replay/page.tsx", import.meta.url)), "utf8");
  assert.ok(page.includes("replayCallerFor(item.legIndex, callLegs, callerLabel)"));
  assert.ok(page.includes("readReplayCallLegs(reportData.callLegs)"));
  assert.ok(/typeof data\.legIndex === "number"/.test(page), "메시지 문서의 legIndex를 읽는다");
  assert.equal(/\{callerLabel\}\s*<span[^>]*>\(사칭\)/.test(page), false, "번호 하나 + 고정 '(사칭)'(재시험 19 ② 원인)이 남아 있지 않다");
  assert.ok(/caller\.impersonation && <span[^>]*>\(사칭\)<\/span>/.test(page));
});
