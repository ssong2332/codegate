// ⭐ 2026-11-07 실기기 신고(카드사 고급 R1 — 980만 원 안전계좌 이체) — "생체인식 화면에서도 별 모션 없이 그냥 넘어간다" ·
// "출금 계좌도 내가 은행을 선택할 수 있게 · 계좌를 선택할 수 있게".
// | # | 고정하는 것 |
// |---|---|
// | T1 | 출금 계좌 3개 · 가상 은행 3곳(이 앱 은행 + 다른 은행 2) · 받는 계좌 은행 제외 · 첫 계좌 = 세션 잔액 · 번호 가운데 가림 · 결정적 |
// | T2 | 판정표 W — 고른 계좌 출금 가능 금액 초과 · 1일 5,000만 원 초과를 막는다 · 보낸 만큼 잔액이 준다 · 세션끼리 장부가 섞이지 않는다 |
// | T3 | 판정표 B — 지문: 누름 → 스캔 → 성공 · 일찍 뗌 → 실패 · 3번 실패 → 잠김 · 얼굴: iOS형 · 움직임 줄이기면 대기 시간이 준다 |
// | T4 | 두 이체 화면이 같은 시트 컴포넌트를 쓴다 · 기존 기록 경로(비교 결과 · 영수증) 그대로 · 시트에 입력 칸 · 저장소 · 네트워크 0 |
// | T5 | 모션은 CSS 키프레임만 · reduced-motion이면 bank-* 전부 정지 · 프레임 루프 0 · 시트는 상대 경로 import(렌더 하네스) |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DAILY_TRANSFER_LIMIT,
  accountLabel,
  availableBalance,
  recordWithdrawal,
  remainingDailyLimit,
  withdrawAccountsFor,
  withdrawError,
} from "./withdrawAccounts.ts";
import {
  BANK_AUTH_COPY,
  INITIAL_AUTH_STATE,
  MAX_BIOMETRIC_FAILS,
  authMethodForSkin,
  authTimings,
  nextAuthState,
  type AuthEvent,
  type AuthState,
} from "./bankAuth.ts";
import { FICTIONAL_BANK_NAMES, fictionalBalanceFor, hash } from "./bankApp.ts";
import { TRANSFER_LIMIT_PER_DAY } from "../landing/amountInput.ts";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const authSheet = stripComments(read("src/components/BankAuthSheet.tsx"));
const accountSheet = stripComments(read("src/components/WithdrawAccountSheet.tsx"));
const overlay = stripComments(read("src/components/BankAppOverlay.tsx"));
const landing = stripComments(read("src/components/MessengerFakeLanding.tsx"));
const accountsLib = read("src/lib/bankapp/withdrawAccounts.ts");

test("[T1] 출금 계좌 — 3개 · 가상 은행 3곳 · 받는 계좌 은행 제외 · 첫 계좌 = 세션 잔액 · 가운데 가림 · 결정적", () => {
  for (const seed of ["s-1", "s-2", "session-abc", ""]) {
    const balance = fictionalBalanceFor(seed);
    const accounts = withdrawAccountsFor({ seed, appBankName: "새솔은행", primaryBalance: balance, avoidBankName: "한결은행" });
    assert.equal(accounts.length, 3);
    assert.deepEqual(
      accounts.map((a) => a.id),
      ["main", "other-1", "other-2"],
    );
    assert.equal(accounts[0]!.bankName, "새솔은행");
    assert.equal(accounts[0]!.balance, balance, "첫 계좌 잔액 = 종전 화면과 같은 세션 잔액");
    assert.ok(accounts[0]!.own && !accounts[1]!.own && !accounts[2]!.own);
    const banks = accounts.map((a) => a.bankName);
    assert.equal(new Set(banks).size, 3, "은행 3곳");
    assert.ok(!banks.includes("한결은행"), "받는 계좌 은행은 내 계좌 목록에 없다");
    for (const a of accounts) {
      assert.ok(FICTIONAL_BANK_NAMES.includes(a.bankName), `가상 은행만: ${a.bankName}`);
      assert.match(a.maskedNumber, /^\d{3}-\*{4}-\d{4}$/);
      assert.ok(a.balance > 0);
    }
    // 다른 은행 계좌는 첫 계좌보다 적다(요구액을 다 못 채울 수 있다 — 고르면 막힌다).
    assert.ok(accounts[1]!.balance < accounts[0]!.balance && accounts[2]!.balance < accounts[0]!.balance);
    assert.deepEqual(accounts, withdrawAccountsFor({ seed, appBankName: "새솔은행", primaryBalance: balance, avoidBankName: "한결은행" }), "결정적");
  }
  assert.equal(accountLabel({ bankName: "새솔은행", maskedNumber: "352-****-7781" }), "새솔은행 352-****-7781");
});

test("[T1 드리프트] 잎 모듈 사본 — 은행 목록 · 해시 · 1일 한도가 원본과 같다", () => {
  const listStart = accountsLib.indexOf("const BANKS: readonly string[] = [");
  const names = [...accountsLib.slice(listStart, accountsLib.indexOf("];", listStart)).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, [...FICTIONAL_BANK_NAMES]);
  assert.ok(accountsLib.includes(hash.toString().replace(/\r\n/g, "\n").split("\n").slice(1, 6).join("\n")), "해시 식이 bankApp.ts와 같다");
  assert.equal(DAILY_TRANSFER_LIMIT, TRANSFER_LIMIT_PER_DAY);
});

test("[T2] 판정표 W — 출금 가능 금액 · 1일 한도 · 보낸 만큼 잔액 감소 · 세션 장부 분리", () => {
  const ledger = `w-test-${Date.now()}`;
  const [main, other] = withdrawAccountsFor({ seed: ledger, appBankName: "새솔은행", primaryBalance: 30_000_000, avoidBankName: "한결은행" });
  // W3 — 다른 은행 계좌(잔액 900만 이하)로 980만 원은 막힌다.
  assert.equal(withdrawError(ledger, other!, "9,800,000"), "출금 가능 금액보다 많습니다.");
  assert.equal(withdrawError(ledger, main!, "9,800,000"), undefined, "첫 계좌(3,000만)는 통과");
  // 판정 불가 금액은 여기서 막지 않는다(W1 · W2는 화면이 먼저).
  assert.equal(withdrawError(ledger, main!, ""), undefined);
  assert.equal(withdrawError(ledger, main!, "abc"), undefined);
  // 보낸 만큼 출금 가능 금액이 준다.
  recordWithdrawal(ledger, "main", "9,800,000");
  assert.equal(availableBalance(ledger, main!), 30_000_000 - 9_800_000);
  assert.equal(withdrawError(ledger, main!, "20,200,001"), "출금 가능 금액보다 많습니다.");
  // W4 — 1일 한도(5,000만)는 계좌와 무관하게 합친다.
  const big = { id: "main" as const, balance: 100_000_000 };
  const ledger2 = `${ledger}-daily`;
  for (let i = 0; i < 4; i += 1) recordWithdrawal(ledger2, "main", "10,000,000");
  assert.equal(remainingDailyLimit(ledger2), 10_000_000);
  assert.equal(withdrawError(ledger2, big, "10,000,000"), undefined, "한도와 같으면 통과");
  recordWithdrawal(ledger2, "other-1", "5,000,000");
  assert.equal(withdrawError(ledger2, big, "6,000,000"), "1일 이체 한도(5,000만 원)를 넘었습니다. 오늘 더 보낼 수 있는 금액은 5,000,000원입니다.");
  // 세션끼리 섞이지 않는다.
  assert.equal(remainingDailyLimit(`${ledger}-other`), DAILY_TRANSFER_LIMIT);
  assert.equal(availableBalance(`${ledger}-other`, main!), 30_000_000);
});

test("[T3] 판정표 B — 지문 누름 → 스캔 → 성공 · 일찍 뗌 → 실패 · 3번 → 잠김 · 표에 없는 조합은 그대로", () => {
  const run = (events: AuthEvent[], from: AuthState = INITIAL_AUTH_STATE) => events.reduce(nextAuthState, from);
  assert.deepEqual(run(["touch-start"]), { phase: "scanning", fails: 0 }, "B1");
  assert.deepEqual(run(["touch-start", "scan-complete"]), { phase: "success", fails: 0 }, "B3");
  assert.deepEqual(run(["touch-start", "touch-end"]), { phase: "failed", fails: 1 }, "B2");
  assert.deepEqual(run(["touch-start", "touch-end", "touch-start", "scan-complete"]), { phase: "success", fails: 1 }, "실패 뒤 다시 대면 성공");
  const locked = run(Array.from({ length: MAX_BIOMETRIC_FAILS }, () => ["touch-start", "touch-end"] as AuthEvent[]).flat());
  assert.deepEqual(locked, { phase: "locked", fails: MAX_BIOMETRIC_FAILS }, "B2 → locked");
  assert.deepEqual(run(["touch-start", "scan-complete"], locked), locked, "B4 잠기면 그대로");
  const success = run(["touch-start", "scan-complete"]);
  assert.deepEqual(run(["touch-start", "touch-end"], success), success, "B5 성공 뒤 그대로");
  assert.deepEqual(run(["scan-complete", "touch-end"]), INITIAL_AUTH_STATE, "표에 없는 조합");
  assert.equal(authMethodForSkin("ios"), "face");
  assert.equal(authMethodForSkin("samsung"), "fingerprint");
  assert.equal(authMethodForSkin("default"), "fingerprint");
  const normal = authTimings(false);
  const reduced = authTimings(true);
  for (const key of ["fingerprintHoldMs", "faceScanMs", "successHoldMs"] as const) {
    assert.ok(reduced[key] < normal[key] && reduced[key] > 0, `움직임 줄이기 — ${key}만 줄고 단계는 같다`);
  }
  for (const text of Object.values(BANK_AUTH_COPY)) assert.ok(!/모의|훈련용|비밀번호|인증번호/.test(text), text);
});

test("[T4] 두 이체 화면이 같은 시트를 쓰고 기존 기록 경로는 그대로", () => {
  for (const [name, code] of [
    ["BankAppOverlay", overlay],
    ["MessengerFakeLanding", landing],
  ] as const) {
    assert.ok(code.includes("<BankAuthSheet"), `${name} — 생체 인증 시트`);
    assert.ok(code.includes("<WithdrawAccountSheet") && code.includes("<WithdrawAccountRow"), `${name} — 계좌 선택 시트 · 줄`);
    assert.ok(code.includes("withdrawAccountsFor(") && code.includes("withdrawError(") && code.includes("recordWithdrawal("), `${name} — 판정표 W`);
    assert.ok(code.includes("authMethodForSkin("), `${name} — 스킨별 인증 수단`);
    assert.ok(code.includes("recordTransferAndCompare("), `${name} — N1 비교 결과 기록 그대로`);
  }
  // 송금 완료 기록은 인증 성공 한 곳(내 은행 송금 — `authenticate` · 훈련용 이체 — `finishSubmit`).
  assert.ok(overlay.includes("onSuccess={authenticate}"));
  assert.ok(landing.includes("onSuccess={finishSubmit}"), "성공 시각은 시트가 타이머 안에서 잰다(렌더 중 performance.now 0)");
  // 영수증 · 확인 화면에 고른 출금 계좌.
  assert.ok(overlay.includes('["출금 계좌", accountLabel(fromAccount)]'));
  assert.equal(landing.split('["출금 계좌", accountLabel(account)]').length - 1, 2, "확인 · 완료 영수증");
  // 시트에는 입력 칸 · 저장소 · 네트워크 · 라우팅 0(BA3 · G138).
  for (const [name, code] of [
    ["BankAuthSheet", authSheet],
    ["WithdrawAccountSheet", accountSheet],
  ] as const) {
    for (const forbidden of ["<input", "<textarea", "<select", 'type="password"', "fetch(", "localStorage", "sessionStorage", "indexedDB", "sendBeacon", "router.", "@/lib/api"]) {
      assert.ok(!code.includes(forbidden), `${name}에 있으면 안 되는 것: ${forbidden}`);
    }
    assert.ok(!/모의|훈련용/.test(code), `${name} — 세션 중 표식 낱말 0(G437)`);
  }
  // 시트가 열리면 뒤 화면은 inert(초점이 시트 안에 머문다).
  assert.ok(overlay.includes("inert={sheet ? true : undefined}"));
  assert.ok(landing.includes('inert={bankStage === "auth" ? true : undefined}'));
});

test("[T5] 모션 — CSS 키프레임 · reduced-motion 정지 · 프레임 루프 0 · 상대 경로 import", () => {
  const css = read("src/app/globals.css");
  const classes = ["bank-sheet-up", "bank-sheet-dim", "bank-hud-in", "bank-fp-ring", "bank-fp-ripple", "bank-fp-press", "bank-shake", "bank-check-draw", "bank-pop", "bank-face-scan"];
  const reducedBlock = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce) {"));
  for (const cls of classes) {
    assert.ok(css.includes(`.${cls} {\n  `) || css.includes(`.${cls} {`), `클래스 정의: ${cls}`);
    assert.ok(reducedBlock.includes(`.${cls}`), `reduced-motion 정지: ${cls}`);
    assert.ok(authSheet.includes(cls) || accountSheet.includes(cls), `시트가 쓴다: ${cls}`);
  }
  for (const code of [authSheet, accountSheet]) {
    assert.ok(!code.includes("requestAnimationFrame") && !code.includes("setInterval"), "프레임 루프 0(§23.6 A1)");
    assert.ok(!code.includes('from "@/'), "렌더 하네스 — 상대 경로만");
  }
  assert.ok(
    authSheet.includes('const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";') && authSheet.includes("useSyncExternalStore("),
    "움직임 줄이기 설정을 읽는다",
  );
  // 지문은 길게 누르기(떼면 실패) · 얼굴은 열리면 바로 스캔(처음 상태가 스캔 중).
  assert.ok(authSheet.includes("onPointerDown=") && authSheet.includes("onPointerUp={endHold}") && authSheet.includes("onPointerCancel={endHold}"));
  assert.ok(authSheet.includes('method === "face" ? nextAuthState(INITIAL_AUTH_STATE, "touch-start") : INITIAL_AUTH_STATE'), "얼굴은 처음부터 스캔");
});
