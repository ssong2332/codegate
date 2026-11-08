// ⭐ 2026-11-08(docs/research/in-service-experience-plan-2026-10-31.md §15.5 관찰 ① · ③ · ④ — 사용자 결정 "관찰 3건은 별도 수정") — 실 키 실측에서 본 사기범 문면 결함 3건의 고정 단언.
// | # | 고정하는 것 |
// |---|---|
// | O1 | 금 · 출금 예약 보류 직후 지시 — 그 대답에서는 끊지 않고 상대 대답을 기다린다(H1) · 포기는 그 요구를 들은 상대가 다시 거절할 때 그다음 대답에서(H2) |
// | O3 | 화면 제출 맥락 — 돈을 옮기는 화면(이체 화면 · 자산 검수 사이트 · 보관 지갑) = 종전 이체 문면 · 그 밖 입력 화면 = 입력 제출 문면(이체 · 입금 말 0) · 서버 배선이 화면 id를 넘긴다 |
// | O4 | 기관 고급 fv-q7cn 단계 · 수법에 "금융감독원에 예탁" 0("저희 쪽에 예탁") · 자산 보호 고급 fv-k9ra 단계는 종전 문면("저희가 보관해 두어야") 그대로 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findFlowVariant, type FlowVariant } from "../flowVariants";
import {
  ASSET_CHECK_SEND_LANDINGS,
  BANK_TRANSFER_LANDINGS,
  CASH_HELD_INSTRUCTION,
  GOLD_HELD_INSTRUCTION,
  isCashLanding,
  isGoldLanding,
  isMoneyMoveLanding,
  isVoucherLanding,
  MOCK_SCREENS,
} from "../mockScreens";
import {
  LANDING_FORM_SUBMITTED_INSTRUCTION,
  LANDING_SUBMITTED_INSTRUCTION,
  LANDING_SUBMITTED_SHORT_INSTRUCTION,
  LOAN_APPLY_LANDING_ID,
  LOAN_APPLY_SUBMITTED_INSTRUCTION,
  landingSubmittedInstructionFor,
} from "../../inCallSms/confirmResult";

const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
const variant = (id: string) => findFlowVariant(id) as FlowVariant;

test("[O1] 보류 직후 지시 — 그 대답에서는 끊지 않고 기다린다 · 포기는 그다음 대답에서", () => {
  for (const [name, instruction] of [["금", GOLD_HELD_INSTRUCTION], ["출금 예약", CASH_HELD_INSTRUCTION]] as const) {
    const wait = instruction.indexOf("이번 대답에서는 통화를 끝내지 말고 상대의 대답을 기다려라.");
    const giveUp = instruction.indexOf("그 요구를 들은 상대가 그래도 거절하거나 망설이면 그다음 대답에서 더 조르지 말고");
    assert.ok(wait > 0, `${name} — 기다림 문장(H1)`);
    assert.ok(giveUp > wait, `${name} — 포기는 기다림 뒤 · 그다음 대답에서(H2)`);
    assert.ok(instruction.indexOf("한 번 요구하라.") < wait, `${name} — 재요구 다음에 기다림`);
    assert.ok(instruction.includes("한 번만 압박") && instruction.includes("포기 신호"), `${name} — 종전 압박 1회 · 포기 신호 유지`);
    assert.ok(!/["'“”‘’]/.test(instruction), `${name} — 따옴표 대사 예시 0`);
    assert.ok(!/\d/.test(instruction), `${name} — 횟수 · 턴 번호 숫자 0(G130)`);
    // 역검증 — 종전 문면(재요구 바로 뒤 "상대가 그래도 거절하거나 망설이면 더 조르지 말고")은 이 단언에 걸린다.
    const before = instruction.replace(" 이번 대답에서는 통화를 끝내지 말고 상대의 대답을 기다려라. 그 요구를 들은 상대가 그래도 거절하거나 망설이면 그다음 대답에서 더 조르지 말고", " 상대가 그래도 거절하거나 망설이면 더 조르지 말고");
    assert.notEqual(before, instruction, `${name} — 역검증 치환이 실제로 일어났다`);
    assert.equal(before.indexOf("이번 대답에서는 통화를 끝내지 말고"), -1, `${name} — 종전 문면에는 기다림 문장이 없다`);
  }
});

test("[O3] 화면 제출 맥락 — 돈을 옮기는 화면 = 이체 문면 · 그 밖 입력 화면 = 입력 제출 문면", () => {
  const inCallForms: string[] = [];
  for (const items of Object.values(MOCK_SCREENS)) {
    for (const item of items) {
      if (item.kind !== "credential-form" || item.entrySurface !== "in-call-sms") continue;
      if (item.landingId === LOAN_APPLY_LANDING_ID || isVoucherLanding(item.landingId) || isGoldLanding(item.landingId) || isCashLanding(item.landingId)) continue;
      if (!inCallForms.includes(item.landingId)) inCallForms.push(item.landingId);
    }
  }
  const lines: string[] = [];
  for (const landingId of inCallForms) {
    const moves = BANK_TRANSFER_LANDINGS.includes(landingId) || ASSET_CHECK_SEND_LANDINGS.includes(landingId);
    assert.equal(isMoneyMoveLanding(landingId), moves, landingId);
    const instruction = landingSubmittedInstructionFor(undefined, false, landingId);
    assert.equal(instruction, moves ? LANDING_SUBMITTED_INSTRUCTION : LANDING_FORM_SUBMITTED_INSTRUCTION, landingId);
    lines.push(`${landingId}=${moves ? "이체" : "입력"}`);
  }
  // 관찰 ③ 재현 화면(자산 보호 고급 fv-k9ra 보관 신청서) · 다른 입력 화면 · 돈을 옮기는 화면이 모두 목록에 있다(빈 목록 통과 방지).
  for (const id of ["asset-custody-apply", "case-record-view", "tax-refund-claim"]) assert.ok(lines.includes(`${id}=입력`), `${id} 입력 화면`);
  for (const id of ["safe-account-transfer", "asset-check-wallet", "asset-check-site", "card-safe-transfer"]) assert.ok(lines.includes(`${id}=이체`), `${id} 돈 이동 화면`);
  assert.ok(!LANDING_FORM_SUBMITTED_INSTRUCTION.includes("이체하기를 눌러") && !LANDING_FORM_SUBMITTED_INSTRUCTION.includes("입금 확인이 끝났다"), "입력 제출 문면에 이체 완료 · 입금 확인 0");
  assert.ok(LANDING_FORM_SUBMITTED_INSTRUCTION.includes("이체나 입금이 끝났다는 말은 하지 마라"));
  assert.ok(LANDING_FORM_SUBMITTED_INSTRUCTION.includes("[진행 강제]의 통화 끝내기 항목이 정한 대로 하라"), "마무리 분기는 종전 문면과 같은 구절");
  assert.ok(!/["'“”‘’\d]/.test(LANDING_FORM_SUBMITTED_INSTRUCTION), "따옴표 · 숫자 0");
  // 종전 판정표는 그대로 — 화면 id 부재 = L3 · 적음 = L1 · 대출 신청 = L0.
  assert.equal(landingSubmittedInstructionFor(undefined, false), LANDING_SUBMITTED_INSTRUCTION);
  assert.equal(landingSubmittedInstructionFor("less", false, "safe-account-transfer"), LANDING_SUBMITTED_SHORT_INSTRUCTION);
  assert.equal(landingSubmittedInstructionFor(undefined, false, LOAN_APPLY_LANDING_ID), LOAN_APPLY_SUBMITTED_INSTRUCTION);
  // 배선 — 서버가 처음 제출 기록에 화면 id를 넘긴다(넘기지 않으면 L3로 떨어져 관찰 ③이 되살아난다).
  assert.ok(read("inCallSms/index.ts").includes('landingSubmittedInstructionFor(amountComparison, false, snap.get("fakeLandingId") as string | undefined)'));
});

test("[O4] fv-q7cn 예탁 문면 = '저희 쪽에' · fv-k9ra 단계는 종전 문면 그대로", () => {
  const q7cn = variant("fv-q7cn");
  const texts = [...q7cn.stages.map((s) => s.summary), ...q7cn.tactics];
  assert.ok(texts.every((t) => !t.includes("금융감독원에 예탁")), "fv-q7cn 단계 · 수법에 '금융감독원에 예탁' 0");
  assert.ok(q7cn.stages.at(-1)!.summary.includes("수사가 끝날 때까지 저희 쪽에 예탁해 두셔야"), "단계(E1)");
  assert.ok(q7cn.tactics.some((t: string) => t.startsWith("예탁 명목 인출 요구 — '수사가 끝날 때까지 저희 쪽에 예탁해 두셔야 합니다,")), "수법(E1) · 라벨 그대로");
  const k9ra = variant("fv-k9ra").stages.at(-1)!.summary;
  assert.ok(k9ra.includes("수사가 끝날 때까지 저희가 보관해 두어야 안전하게"), "fv-k9ra replace가 새 원본에서도 걸린다(E2)");
  assert.ok(!k9ra.includes("저희 쪽에") && !k9ra.includes("예탁해 두셔야"), "fv-k9ra에 새 문구가 새지 않는다");
});
