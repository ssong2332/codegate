// ⭐ BA-1(docs/research/in-service-bank-app-design-2026-11-01.md §5 BA-1 완료 기준) — 훈련용 홈 · 내 은행 앱의 계약.
// | # | 고정하는 것 |
// |---|---|
// | A1 | 플래그 `bankapp=1`만 켠다 · 저장 유지 키에 있다(`debugFlags.ts`) · 페이지는 플래그가 꺼지면 홈 막대 · 오버레이 · 복사 메뉴를 그리지 않는다 |
// | A2 | 화면 단계 표 S1~S10(홈 → 잠금 → 계좌 → 받는 계좌 → 금액 → 확인 → 인증 → 완료) |
// | A3 | G138 — 입력값(계좌 · 금액)은 오버레이 state를 벗어나지 않는다: 콜백 인자 0 · 네트워크 · 저장소 · 콜러블 0 |
// | A4 | 입력 칸 0 — 비밀번호 · 인증번호 입력 칸이 없다(입력은 받는 계좌 · 금액 두 칸뿐 · password 타입 0) |
// | A5 | 실존 은행명 0 — 가상 은행 목록 = 서버 `FICTIONAL_BANK_NAMES`(드리프트 0) · 화면 문구 · 컴포넌트에 실존 은행 이름 0 |
// | A6 | 통화 유지(D-35 · G10) — 오버레이는 문자함과 같은 자리의 형제 노드 · 라우팅 0 · 문자함 · 확인 시트와 동시에 열리지 않는다 |
// | A7 | 계좌 복사 = 앱 안 state(기기 복사 API 0) · 인증번호 복사 메뉴 0(AC-061) |
// | A8 | 2026-11-01 실기 신고 보강 — One UI형 홈 = 3버튼 탐색 막대(누를 수 있는 것은 홈 하나) · 문자 속 계좌번호를 누르면 같은 복사 메뉴 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BANK_APP_COPY,
  BANK_APP_FLAG,
  FALLBACK_HOLDER_NAMES,
  FICTIONAL_BANK_NAMES,
  accountNumberError,
  balanceError,
  balanceText,
  fictionalBalanceFor,
  isBankAppEnabled,
  myBankNameFor,
  nextBankAppStage,
  recipientHolderFor,
  wonText,
} from "./bankApp.ts";
import { PERSISTED_DEBUG_FLAGS, resolveDebugFlags } from "../realtime/debugFlags.ts";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const overlay = read("src/components/BankAppOverlay.tsx");
const overlayCode = stripComments(overlay);
const page = read("src/app/session/play/page.tsx");
const smsOverlay = read("src/components/InCallSmsOverlay.tsx");
const lib = read("src/lib/bankapp/bankApp.ts");

test("[BA-1 A1] 플래그 — bankapp=1만 켜고, 저장 유지 키라 통화 화면까지 남는다", () => {
  assert.equal(BANK_APP_FLAG, "bankapp");
  assert.equal(isBankAppEnabled("?bankapp=1"), true);
  assert.equal(isBankAppEnabled("?bankapp=0"), false);
  assert.equal(isBankAppEnabled(""), false);
  assert.equal(isBankAppEnabled("?audiodebug=1"), false);
  assert.ok((PERSISTED_DEBUG_FLAGS as readonly string[]).includes("bankapp"));
  // 한 번 붙인 뒤 다른 페이지(쿼리 없음)에서도 저장 값으로 켜진다(§134 F4).
  const first = resolveDebugFlags("?bankapp=1", null);
  const later = resolveDebugFlags("", JSON.stringify(first.stored));
  assert.equal(isBankAppEnabled(later.effectiveSearch), true);
  assert.equal(isBankAppEnabled(resolveDebugFlags("?bankapp=off", JSON.stringify(first.stored)).effectiveSearch), false);
});

test("[BA-1 A1] 페이지 — 플래그가 꺼지면 홈 막대 · 오버레이 · 복사 메뉴 0", () => {
  assert.ok(page.includes("{bankAppEnabled && !localHangup && !endLatched && ("), "홈 막대는 플래그 · 통화 중 조건 뒤에만");
  assert.ok(page.includes("{bankAppEnabled && bankAppOpen && ("), "오버레이는 플래그 뒤에만");
  assert.ok(page.includes("onCopyAccount={bankAppEnabled ? setCopiedAccount : undefined}"), "복사 메뉴는 플래그 뒤에만");
  // 문자함은 콜백이 없으면 복사 대상이 없다(종전 화면 그대로).
  assert.ok(smsOverlay.includes("const copyable = onCopyAccount !== undefined && Boolean(sms.bankName && sms.accountNumber);"));
});

test("[BA-1 A2] 화면 단계 표 S1~S10", () => {
  const path: [Parameters<typeof nextBankAppStage>[0], Parameters<typeof nextBankAppStage>[1], string][] = [
    ["home", "open", "lock"],
    ["lock", "unlock", "account"],
    ["account", "transfer", "recipient"],
    ["recipient", "next", "amount"],
    ["amount", "next", "confirm"],
    ["confirm", "send", "auth"],
    ["auth", "authenticate", "done"],
    ["confirm", "cancel", "amount"],
    ["auth", "cancel", "amount"],
    ["done", "finish", "account"],
    ["recipient", "back", "account"],
    ["amount", "back", "recipient"],
  ];
  for (const [from, action, to] of path) assert.equal(nextBankAppStage(from, action), to, `${from} + ${action}`);
  // 표에 없는 조합은 머문다(인증을 건너뛰어 완료로 가는 길 0).
  assert.equal(nextBankAppStage("confirm", "authenticate"), "confirm");
  assert.equal(nextBankAppStage("lock", "transfer"), "lock");
});

test("[BA-1 A2] 판정 — 계좌 자리 수 · 잔액 초과 · 금액 표기 · 받는 분 이름", () => {
  assert.equal(accountNumberError(""), "받는 분 계좌번호를 입력해 주세요.");
  assert.equal(accountNumberError("123-45"), "계좌번호를 다시 확인해 주세요.");
  assert.equal(accountNumberError("948-2716-5093-27"), undefined);
  assert.equal(balanceError("5,000,000", 10_000_000), undefined);
  assert.equal(balanceError("20000000", 10_000_000), "출금 가능 금액보다 많습니다.");
  assert.equal(balanceError("abc", 10_000_000), undefined, "형식 오류는 amountError가 먼저 막는다");
  assert.equal(wonText("500000"), "500,000원");
  assert.equal(balanceText(12_340_000), "12,340,000원");
  // 문자에서 복사한 계좌 = 서버가 실은 예금주 · 직접 입력 = 가상 개인 이름(결정적).
  const copied = { bankName: "미르은행", accountNumber: "948-2716-5093-27", holder: "김도현" };
  assert.equal(recipientHolderFor("948-2716-5093-27", copied), "김도현");
  const typed = recipientHolderFor("1234567890", copied);
  assert.ok(FALLBACK_HOLDER_NAMES.includes(typed));
  assert.equal(recipientHolderFor("1234567890", null), typed);
});

test("[BA-1 A2] 내 은행 · 잔액 — 결정적 · 사기범 계좌 은행과 다르다 · 1,000만~3,000만 원", () => {
  for (const seed of ["s1", "s2", "abc", ""]) {
    const balance = fictionalBalanceFor(seed);
    assert.equal(balance, fictionalBalanceFor(seed));
    assert.ok(balance >= 10_000_000 && balance <= 30_000_000 && balance % 10_000 === 0, `${seed}: ${balance}`);
    for (const avoid of FICTIONAL_BANK_NAMES) assert.notEqual(myBankNameFor(seed, avoid), avoid);
    assert.ok(FICTIONAL_BANK_NAMES.includes(myBankNameFor(seed)));
  }
});

test("[BA-1 A3] G138 — 입력값이 오버레이 밖으로 나가지 않는다(콜백 인자 · 네트워크 · 저장소 · 콜러블 0)", () => {
  for (const forbidden of ["fetch(", "XMLHttpRequest", "sendBeacon", "localStorage", "sessionStorage", "indexedDB", "callCallable", "@/lib/api", "firebase"]) {
    assert.ok(!overlayCode.includes(forbidden), `오버레이에 있으면 안 되는 것: ${forbidden}`);
  }
  // 위로 올리는 콜백은 무인자 두 개뿐이다(통화 복귀 · 문자함).
  assert.ok(overlayCode.includes("onClose: () => void;"));
  assert.ok(overlayCode.includes("onOpenMessages: () => void;"));
  assert.ok(!/onClose\([^)]/.test(overlayCode) && !/onOpenMessages\([^)]/.test(overlayCode), "콜백에 값을 싣지 않는다");
  for (const forbidden of ["fetch(", "localStorage", "sessionStorage", "callCallable"]) {
    assert.ok(!stripComments(lib).includes(forbidden), `순수 모듈에 있으면 안 되는 것: ${forbidden}`);
  }
});

test("[BA-1 A4] 입력 칸 0 — 비밀번호 · 인증번호 칸이 없고 입력은 받는 계좌 · 금액 두 칸뿐", () => {
  assert.equal(overlayCode.split("<input").length - 1, 2, "입력 칸은 받는 계좌 · 금액 두 개");
  assert.equal(overlayCode.split("<select").length - 1, 1, "선택은 받는 분 은행 하나");
  for (const forbidden of ['type="password"', "비밀번호를 입력", "인증번호를 입력", "OTP", "보안카드", "<textarea"]) {
    assert.ok(!overlayCode.includes(forbidden), `있으면 안 되는 것: ${forbidden}`);
  }
  assert.ok(BANK_APP_COPY.lockButton.includes("지문") && BANK_APP_COPY.authButton.includes("인증"));
  // 주소창 0 — 앱에는 주소창이 없다(가짜 호스트 · `.invalid` 0).
  assert.ok(!overlayCode.includes(".invalid") && !overlayCode.includes("mockHost"));
});

test("[BA-1 A5] 실존 은행명 0 — 가상 목록 = 서버 목록 · 화면 · 문구에 실존 은행 이름 0", () => {
  const server = read("functions/src/shared/fictionalBank.ts");
  const start = server.indexOf("FICTIONAL_BANK_NAMES: readonly string[] = [");
  const names = [...server.slice(start, server.indexOf("];", start)).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...FICTIONAL_BANK_NAMES], names);
  const REAL_BANKS = ["국민", "신한", "우리", "하나", "농협", "기업", "카카오뱅크", "토스", "케이뱅크", "SC제일", "씨티", "새마을", "우체국", "수협", "부산", "대구", "광주", "전북", "경남", "제주", "iM뱅크", "KB", "NH", "IBK"];
  const surfaces = [overlayCode, stripComments(lib), JSON.stringify(BANK_APP_COPY)];
  for (const surface of surfaces) {
    for (const real of REAL_BANKS) {
      assert.ok(!surface.includes(`${real}은행`) && !surface.includes(`"${real}`), `실존 은행 이름: ${real}`);
    }
  }
  for (const name of FICTIONAL_BANK_NAMES) assert.ok(!REAL_BANKS.some((real) => name.startsWith(real)), name);
});

test("[BA-1 A6] 통화 유지 — 형제 노드 · 라우팅 0 · 동시 열림 0 · 종료 래치에서 닫힘", () => {
  const smsAt = page.indexOf("{smsOverlayOpen && (");
  const bankAt = page.indexOf("{bankAppEnabled && bankAppOpen && (");
  const verifyAt = page.indexOf("{verifyOverlayOpen && verifyOffer && (");
  assert.ok(smsAt > 0 && bankAt > smsAt && verifyAt > bankAt, "문자함 · 은행 앱 · 확인 시트가 같은 자리에 차례로 있다");
  const openHome = page.slice(page.indexOf("const handleOpenHome = () => {"), page.indexOf("};", page.indexOf("const handleOpenHome = () => {")));
  assert.ok(openHome.includes("setSmsOverlayOpen(false)") && openHome.includes("setVerifyOverlayOpen(false)") && openHome.includes("setBankAppOpen(true)"));
  assert.ok(!openHome.includes("router."), "홈 열기는 라우팅하지 않는다");
  assert.ok(!overlayCode.includes("useRouter") && !overlayCode.includes("router."), "오버레이는 라우팅하지 않는다");
  // 문자함 · 확인 시트를 열면 은행 앱이 닫힌다 · 종료 래치(E2 · 끊기 승인)에서도 닫힌다.
  assert.ok(page.split("setBankAppOpen(false);").length - 1 >= 4);
  assert.ok(page.includes("inert={chatOpen || smsOverlayOpen || bankAppOpen ? true : undefined}"));
  // 통화 필(탭 = 통화 복귀)이 오버레이에 있다.
  assert.ok(overlayCode.includes("aria-label={COPY.callPill}") && BANK_APP_COPY.callPill === "눌러서 통화로 돌아가기");
});

test("[BA-1 A7] 계좌 복사 = 앱 안 state · 기기 복사 API 0 · 인증번호 복사 메뉴 0", () => {
  for (const source of [overlay, smsOverlay, page, lib]) {
    assert.ok(!source.includes("navigator.clipboard") && !source.includes("execCommand"), "기기 복사 API 0");
  }
  // 복사 대상은 계좌 줄 구조화 필드(은행명 · 계좌번호)가 있는 문자뿐 — 인증번호(otpCode)는 메뉴에 실리지 않는다.
  const menu = smsOverlay.slice(smsOverlay.indexOf('role="menu"'), smsOverlay.indexOf("</div>", smsOverlay.indexOf('role="menu"')));
  assert.ok(menu.includes("sms.accountNumber") && !menu.includes("otpCode"));
});

test("[BA-1 A8] 실기 신고 보강 — One UI형 3버튼 탐색 막대(홈만 누름) · 계좌번호 누름 = 복사 메뉴", () => {
  const homeBar = overlayCode.slice(overlayCode.indexOf("export function HomeBar"));
  const oneUi = homeBar.slice(homeBar.indexOf("grid-cols-3"));
  assert.equal((oneUi.match(/<button/g) ?? []).length, 1, "One UI형 막대에서 누를 수 있는 것은 홈 하나");
  assert.equal((oneUi.match(/aria-hidden="true"/g) ?? []).length, 3, "최근 앱 · 홈 그림 · 뒤로는 스크린리더 대상 밖");
  // 계좌번호 버튼은 복사 메뉴를 여는 것뿐 — 복사 콜백 · 기기 API를 직접 부르지 않는다.
  const split = smsOverlay.slice(smsOverlay.indexOf("accountSplit ? ("), smsOverlay.indexOf("accountSplit.after}"));
  assert.ok(split.includes("onClick={() => setCopyMenuSmsId(sms.smsId)}") && !split.includes("onCopyAccount"));
  assert.ok(smsOverlay.includes("const accountAt = copyable &&"), "플래그 꺼짐(copyable 거짓)이면 계좌 버튼 0");
});
