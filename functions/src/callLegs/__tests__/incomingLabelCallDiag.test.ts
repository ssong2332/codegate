import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findFlowVariant } from "../../scenarios/flowVariants";
import { startCallerLabelFor } from "../legPlan";
import { CALL_DIAG_LOG_MESSAGE, readCallDiag } from "../../realtime/callDiag";

// 2026-11-06 메인 내장 브라우저 시험 — 결함 ①(수신 화면 번호 ≠ 받은 뒤 통화 번호) · 요청 2(통화 진단 요약 서버 로그).

const SCENARIO = "card-company-impersonation";
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");

test("[결함 ① 판정표] 수신으로 시작하는 다통화 = 첫 레그 라벨 · R2(참가자 발신 시작) · 다통화 아님 · 다른 시나리오 = undefined", () => {
  const r1 = findFlowVariant("fv-k3dn")!;
  assert.equal(startCallerLabelFor(r1, SCENARIO), r1.legs[0].callerLabel);
  assert.equal(startCallerLabelFor(r1, SCENARIO), "010-0794-2261");
  assert.equal(startCallerLabelFor(findFlowVariant("fv-r8vb"), SCENARIO), undefined);
  assert.equal(startCallerLabelFor(findFlowVariant("fv-akj5"), SCENARIO), undefined);
  assert.equal(startCallerLabelFor(r1, "institutional-impersonation"), undefined);
  assert.equal(startCallerLabelFor(undefined, SCENARIO), undefined);
});

test("[결함 ① 배선] createSession이 세션 문서에 startCallerLabel을 쓴다(서버만 · 판정 함수 하나)", () => {
  const src = read("session/index.ts");
  assert.ok(src.includes("const startCallerLabel = startCallerLabelFor(openerVariant, scenarioId);"));
  assert.ok(src.includes("await sessionRef.set({ startCallerLabel }, { merge: true });"));
});

const VALID = {
  micSent: 120,
  micDropEcho: 300,
  micDropMute: 0,
  micPeakDb: -24,
  asr: 0,
  rx: 40,
  unheard: 1,
  interrupts: 0,
  liveResumes: 0,
  outState: "running",
  inState: "suspended",
  track: "live",
  trackMuted: false,
  trackEnabled: true,
  rt: "active",
  mode: "realtime",
};

test("[요청 2 판독] 허용 모양만 통과 · 하나라도 어긋나면 요약 전체를 버린다(던지지 않는다)", () => {
  assert.deepEqual(readCallDiag(VALID), VALID);
  assert.deepEqual(readCallDiag({ ...VALID, micPeakDb: null }), { ...VALID, micPeakDb: null });
  for (const bad of [
    undefined,
    null,
    "x",
    [VALID],
    { ...VALID, text: "대사" }, // 허용 밖 키(내용 유입 차단)
    { ...VALID, micSent: -1 },
    { ...VALID, micSent: 1.5 },
    { ...VALID, micSent: 10_000_001 },
    { ...VALID, asr: "3" },
    { ...VALID, outState: "weird" },
    { ...VALID, rt: "permission-denied ; drop" },
    { ...VALID, trackMuted: "false" },
    { ...VALID, micPeakDb: 3 },
    { ...VALID, micPeakDb: -201 },
    (({ micSent: _drop, ...rest }) => rest)(VALID), // 필수 키 누락
  ]) {
    assert.equal(readCallDiag(bad), undefined, JSON.stringify(bad));
  }
});

test("[요청 2 배선] 로그는 소유권 검사 뒤 · 전사 제출(레그 끝) · 세션 종료(끝) 두 곳 · 외부 호출 · Firestore 쓰기 0", () => {
  const submit = read("realtime/submitTranscript.ts");
  assert.ok(submit.includes("const diag = readCallDiag((request.data as { diag?: unknown } | null | undefined)?.diag);"));
  assert.ok(submit.indexOf('if (diag) logCallDiag(sessionId, "leg", diag, diagLegIndex);') > submit.indexOf("await db.runTransaction("));
  const end = read("session/index.ts");
  const at = end.indexOf('if (callDiag) logCallDiag(sessionId, "end", callDiag);');
  assert.ok(at > 0);
  assert.ok(at > end.indexOf("assertAnonymousChallengeScope(request.auth, session);"), "소유권 · 익명 범위 검사 뒤");
  const diag = read("realtime/callDiag.ts");
  assert.ok(!/firestore|fetch\(|getFirestore/.test(diag.replace(/\/\/.*$/gm, "")), "판독 · 로그 모듈은 외부 호출 · 저장 0");
  assert.equal(CALL_DIAG_LOG_MESSAGE, "[call-diag] 통화 진단 요약");
});
