// ⭐ 2026-11-07(Edge 재시험 2 S7 · 사용자 결정 D-G2 E1) — 내 은행 앱 현금 · 수표 출금 예약 + 문진표 순수 로직 고정 단언.
// | # | 고정하는 것 |
// |---|---|
// | CW1 | 금액 · 형태 판정(형태 필수 · 1만 원 단위 · 최소 · 1회 한도) |
// | CW2 | 문진표 — 목적 + 문항 모두 답해야 진행 · 하나라도 "예" = 보류 |
// | CW3 | 예약 번호 결정적 · 세션 · 예약마다 다름 · 마지막 예약 다시 보기 · 다른 세션 0 |
// | CW4 | 저장 · 전송 0 — `cashWithdraw.ts`에 네트워크 · 저장소 호출 0 |
// | CW5 | 화면 문구 — 연습 표시 낱말 0(G437) · 지점명 · 주소 · 시각 0(AC-102 (d)) · 보류 화면 112 · 1332 |
// | CW6 | 화면 컴포넌트 `CashWithdrawMockup` — 네트워크 · 저장소 0 · 예약 · 보류 콜백 무인자 · 보류 = `landing_held` 한 값 · 클라 목록 = 서버 목록 · 머리띠 = 내 은행 모바일뱅킹 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CASH_COPY,
  CASH_FORMS,
  CASH_PURPOSES,
  CASH_QUESTIONS,
  CASH_RESERVE_LIMIT,
  CASH_RESERVE_MIN,
  cashAmountValue,
  cashCheckResult,
  cashReservationNumberFor,
  cashReserveError,
  cashWon,
  lastCashReservation,
  recordCashReservation,
} from "./cashWithdraw.ts";

const SOURCE = readFileSync(new URL("./cashWithdraw.ts", import.meta.url), "utf8");
const LANDING_SOURCE = readFileSync(new URL("../../components/MessengerFakeLanding.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const SERVER_CATALOG = readFileSync(new URL("../../../functions/src/scenarios/mockScreens.ts", import.meta.url), "utf8");

function cashComponentSource(): string {
  const start = LANDING_SOURCE.indexOf("function CashWithdrawMockup(");
  assert.ok(start > 0, "CashWithdrawMockup이 있어야 한다");
  const end = LANDING_SOURCE.indexOf("\nfunction ", start + 10);
  assert.ok(end > start);
  return LANDING_SOURCE.slice(start, end);
}

test("[CW1] 금액 · 형태 판정", () => {
  assert.deepEqual(CASH_FORMS.map((f) => f.label), ["현금", "자기앞수표"]);
  assert.equal(cashReserveError("3,000,000", undefined), "받으실 형태를 골라 주세요.");
  assert.equal(cashReserveError("", "cash"), "출금할 금액을 입력해 주세요.");
  assert.equal(cashReserveError("abc", "cash"), "출금할 금액을 입력해 주세요.");
  assert.match(cashReserveError("3,005,500", "cash") ?? "", /1만 원 단위/);
  assert.match(cashReserveError("500,000", "check") ?? "", /부터/);
  assert.equal(cashReserveError(String(CASH_RESERVE_MIN), "check"), undefined);
  assert.equal(cashReserveError("30,000,000", "cash"), undefined);
  assert.match(cashReserveError(String(CASH_RESERVE_LIMIT + 10_000), "cash") ?? "", /1회 예약 한도/);
  assert.equal(cashAmountValue("12,340,000"), 12_340_000);
  assert.equal(cashWon(12_340_000), "12,340,000원");
});

test("[CW2] 문진표 — 모두 답해야 진행 · 하나라도 '예' = 보류", () => {
  const no = CASH_QUESTIONS.map(() => false);
  assert.equal(cashCheckResult(undefined, no), "incomplete");
  assert.equal(cashCheckResult("모름", no), "incomplete", "목록 밖 목적");
  assert.equal(cashCheckResult("생활비", [false, false]), "incomplete", "문항 수 부족");
  assert.equal(cashCheckResult("생활비", [false, undefined, false]), "incomplete");
  assert.equal(cashCheckResult("생활비", no), "proceed");
  for (let i = 0; i < CASH_QUESTIONS.length; i += 1) {
    const answers = CASH_QUESTIONS.map((_, j) => j === i);
    assert.equal(cashCheckResult("가족 송금", answers), "held", `문항 ${i + 1} "예"`);
  }
  assert.ok(CASH_PURPOSES.includes("생활비"));
  assert.match(CASH_QUESTIONS[0]!, /수사기관|금융감독원/);
  assert.match(CASH_QUESTIONS[1]!, /통화/);
  assert.match(CASH_QUESTIONS[2]!, /앱/);
});

test("[CW3] 예약 번호 결정적 · 마지막 예약 다시 보기 · 다른 세션 0", () => {
  assert.match(cashReservationNumberFor("s1", 0), /^\d{4}-\d{4}$/);
  assert.equal(cashReservationNumberFor("s1", 0), cashReservationNumberFor("s1", 0));
  assert.notEqual(cashReservationNumberFor("s1", 0), cashReservationNumberFor("s1", 1));
  assert.notEqual(cashReservationNumberFor("s1", 0), cashReservationNumberFor("s2", 0));
  const first = recordCashReservation("cw-ledger", "cash-withdraw", "check", 30_000_000, new Date(0));
  const second = recordCashReservation("cw-ledger", "cash-withdraw", "cash", 5_000_000, new Date(0));
  assert.notEqual(first.number, second.number);
  assert.deepEqual(lastCashReservation("cw-ledger", "cash-withdraw"), second);
  assert.equal(lastCashReservation("cw-ledger", "other-screen"), undefined, "다른 화면");
  assert.equal(lastCashReservation("other", "cash-withdraw"), undefined, "다른 세션");
});

test("[CW4] 저장 · 전송 0", () => {
  const forbidden = /\b(fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|httpsCallable|firebase|setDoc|addDoc|updateDoc)\b/;
  assert.doesNotMatch(SOURCE.replace(/^\s*\/\/.*$/gm, ""), forbidden);
  assert.doesNotMatch(SOURCE, /^import /m, "잎 모듈 — import 0");
});

test("[CW5] 화면 문구 — G437 · AC-102 (d) · 보류 안내", () => {
  const copy = [...Object.values(CASH_COPY).flat(), ...CASH_QUESTIONS, ...CASH_PURPOSES, ...CASH_FORMS.map((f) => f.label)].join("\n");
  assert.doesNotMatch(copy, /모의|훈련|가상|연습|시뮬/, "G437");
  // "영업점"(일반명)은 허용 — 특정 지점 이름(○○지점 · ○○본점 · 출장소) · 주소 · 시각은 0.
  assert.doesNotMatch(copy, /\d+\s?시|[가-힣]+지점|[가-힣]+본점|출장소|주소|[가-힣]+(로|길)\s?\d+/, "AC-102 (d) 지점명 · 주소 · 시각 0");
  assert.match(CASH_COPY.heldLines.join(" "), /112/);
  assert.match(CASH_COPY.heldLines.join(" "), /1332/);
});

test("[CW6] 화면 컴포넌트 — 저장 · 전송 0 · 콜백 무인자 · 보류 = landing_held · 클라 목록 = 서버 목록 · 머리띠", () => {
  const forbidden = /(fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|httpsCallable|firebase|setDoc|addDoc|updateDoc)/;
  const component = cashComponentSource();
  assert.doesNotMatch(component.replace(/^\s*\/\/.*$/gm, ""), forbidden, "CashWithdrawMockup");
  assert.match(component, /onCredentialSubmit: \(\) => void;/);
  assert.match(component, /onHeld: \(\) => void;/);
  for (const call of component.match(/(onCredentialSubmit|onHeld)\([^)]*\)/g) ?? []) {
    assert.ok(call === "onCredentialSubmit()" || call === "onHeld()", `콜백에 값을 실어 보내면 안 된다: ${call}`);
  }
  assert.equal((LANDING_SOURCE.match(/onHeld=\{\(\) => onLandingStep\?\.\("landing_held"\)\}/g) ?? []).length, 2, "금 · 출금 예약 보류 = 고정 값 한 개씩");
  assert.ok(SERVER_CATALOG.includes('export const CASH_LANDINGS: readonly string[] = ["cash-withdraw", "asset-cash-withdraw"];'));
  assert.ok(LANDING_SOURCE.includes('const CASH_LANDINGS: readonly string[] = ["cash-withdraw", "asset-cash-withdraw"];'), "클라 목록 = 서버 목록");
  assert.ok(component.includes("bankIdentity?.myBankName ? `${bankIdentity.myBankName} 모바일뱅킹` : issuerNameOf(copy.issuerLabel)"), "머리띠 = 이체 화면과 같은 규칙");
  assert.ok(component.includes("<BankAuthSheet"), "생체 인증 시트(이체 화면과 같은 컴포넌트)");
});
