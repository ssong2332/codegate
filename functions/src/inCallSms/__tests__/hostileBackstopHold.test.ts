// 2026-11-24 브라우저 A 라이브 A2(검찰 고급 fv-a6lq · 적대 참가자) — 이름 · 생년월일 · 계좌 · 잔액을 모두 거부한 참가자에게 대출 안내 문자가
// 발화 수만 차서(자동 백스톱 openAt + 간격 × 2) 도착했다. 판정표 HB(`smsGate.ts` `planSmsBackstop`).
//
// | # | 고정하는 것 |
// |---|---|
// | HH1 | 재현 HB1 — 사건 조회 문자 도착 뒤 하한을 지난 발화 · 적대 연속 → wait(넛지 · 발송 0) / 같은 입력에 적대 아님 → 대출 안내 발송(종전) |
// | HH2 | HB2 — 사기범 "보냈다" 주장 백스톱은 적대여도 종전 |
// | HH3 | 배선 — 서버가 요청의 `participantHostile === true`만 백스톱 판정에 넘긴다 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { planSmsBackstop, resolveDeclaredSms } from "../smsGate";

const CASE = "prosecution-case-link";
const GUIDE = "prosecution-loan-guide";
const declared = () => resolveDeclaredSms("prosecution-cooperation-call", "fv-a6lq").declared;
const delivered = [{ smsId: CASE, userTurnsAtArrival: 2 }];

test("[HH1 재현] 적대 연속이면 자동 백스톱이 대출 안내를 보내지 않는다 · 적대가 아니면 종전대로 보낸다", () => {
  for (let userTurns = 6; userTurns <= 12; userTurns += 1) {
    const held = planSmsBackstop({ declared: declared(), delivered, userTurns, participantHostile: true });
    assert.equal(held.action, "wait", `발화 ${userTurns}`);
  }
  const normal = planSmsBackstop({ declared: declared(), delivered, userTurns: 8 });
  assert.equal(normal.action, "deliver");
  assert.equal(normal.action === "deliver" ? normal.item.smsId : undefined, GUIDE);
  // HB3 — 적대가 끊기면(값 false) 하한이 이미 지났으니 그 발화에 보낸다.
  assert.equal(planSmsBackstop({ declared: declared(), delivered, userTurns: 9, participantHostile: false }).action, "deliver");
});

test("[HH2] HB2 — '보냈다' 주장 백스톱은 적대여도 종전(게이트가 열렸으면 보낸다)", () => {
  const plan = planSmsBackstop({ declared: declared(), delivered, userTurns: 8, claimed: true, explicitFloor: true, participantHostile: true });
  assert.equal(plan.action, "deliver");
});

test("[HH3] 배선 — deliverInCallSms 백스톱 판정에 participantHostile === true만 넘긴다", () => {
  const src = readFileSync(path.resolve(__dirname, "../../../src/inCallSms/index.ts"), "utf8");
  assert.match(src, /participantHostile: request\.data\?\.participantHostile === true,/);
});
