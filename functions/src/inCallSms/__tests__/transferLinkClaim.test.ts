// ⭐ 2026-11-09 라이브 재시험 15 E2 · 16 F1(은행 사칭 · 직접 확인 고급 fv-62q8) — 넘겨받은 담당자가 링크를 말한 뒤 1분 · 16초 늦게 문자가 왔다.
// 이 파일은 **서버 쪽 현재 동작**을 고정한다(서버 코드 무변경). 화면 쪽 판정표 T(링크 가리킴 = "보냈다" 주장)와 재현은
// 루트 `src/lib/realtime/transferLinkClaim.test.ts`.
// | 경로 | 넘김(확인 오퍼 전환 완료) 뒤 | 근거 |
// |---|---|---|
// | 자동 백스톱 | 넛지 단계를 건너뛰고(waiting) 강제 발송 = 게이트 열림 + 간격 × 2(fv-62q8 간격 2 → 4발화) | `index.ts` nudge 분기 · `planSmsBackstop` |
// | 주장 백스톱(화면 `smsClaimed`) | 게이트가 열려 있으면 그 질의에서 발송(명시 간격 1) | `planSmsBackstop` claimed |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { BACKSTOP_USER_TURNS, claimTargetsPending, planSmsBackstop, resolveDeclaredSms } from "../smsGate";
import { findFlowVariant } from "../../scenarios/flowVariants";

const SCENARIO = "bank-security-verify-scam";
const declared = resolveDeclaredSms(SCENARIO, "fv-62q8").declared;

test("[T 서버] fv-62q8 선언 — 보호계좌 문자 1통 · 하한 3 · 백스톱 간격 기본(2)", () => {
  assert.equal(findFlowVariant("fv-62q8")?.level, "advanced");
  assert.equal(declared.length, 1);
  assert.equal(declared[0].smsId, "bank-protect-account");
  assert.equal(declared[0].notBeforeUserTurns, 3);
  assert.equal(declared[0].backstopUserTurns, undefined);
  assert.equal(BACKSTOP_USER_TURNS, 2);
});

test("[T 서버] 주장 없으면 열림 3 → 넛지 5(넘김 뒤엔 건너뜀) → 강제 7 · 주장(링크 가리킴)이면 열린 발화에서 바로 발송", () => {
  const plan = (userTurns: number, claimed?: boolean) => planSmsBackstop({ declared, delivered: [], userTurns, claimed, explicitFloor: claimed }).action;
  assert.deepEqual([3, 4, 5, 6, 7].map((u) => plan(u)), ["wait", "wait", "nudge", "wait", "deliver"]);
  // 넘겨받은 담당자가 링크를 말한 발화(예: 4)에 주장이 실리면 — 대상이 비었거나(CL2) 아직 안 온 transfer(CL4)라 주장으로 남는다.
  for (const purposes of [undefined, [], ["transfer"]]) assert.equal(claimTargetsPending(purposes, declared, []), true);
  assert.equal(plan(4, true), "deliver");
  assert.equal(plan(2, true), "wait", "하한은 그대로");
});

test("[T 서버 배선] 넘김(전환 완료) 뒤에는 넛지를 싣지 않는다 — 강제 발송까지 기다린다", () => {
  const source = readFileSync(path.join(__dirname, "../../../src/inCallSms/index.ts"), "utf8").replace(/\r\n/g, "\n");
  const nudge = source.indexOf('if (plan.action === "nudge") {');
  assert.ok(nudge > 0);
  assert.ok(source.slice(nudge, nudge + 900).includes('if (placed) return { status: "waiting" };'));
});
