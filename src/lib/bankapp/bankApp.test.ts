// ⭐ BA-1 간소화안(2026-11-01 · 사용자 승인 "간소화안으로" · docs/research/in-service-bank-app-design-2026-11-01.md) — 내 은행 송금 화면의 계약.
// | # | 고정하는 것 |
// |---|---|
// | A1 | 플래그 `bankapp=1`만 켠다 · 저장 유지 키에 있다(`debugFlags.ts`) · 플래그가 꺼지면 계좌 누름 · 송금 화면 0(종전 링크 화면 그대로) |
// | A2 | 화면 단계 표 S1~S6(받는 분 확인 → 금액 → 인증 → 완료) · 판정(잔액 · 금액 표기 · 받는 분 이름) |
// | A3 | G138 — 금액은 오버레이 state를 벗어나지 않는다: 완료 콜백 무인자 · 네트워크 · 저장소 · 콜러블 0 |
// | A4 | 입력 칸 0 — 비밀번호 · 인증번호 입력 칸이 없다(입력은 금액 한 칸뿐 · password 타입 0) |
// | A5 | 실존 은행명 0 — 가상 은행 목록 = 서버 `FICTIONAL_BANK_NAMES`(드리프트 0) · 화면 문구 · 컴포넌트에 실존 은행 이름 0 |
// | A6 | 통화 유지(D-35 · G10) — 오버레이는 문자함과 같은 자리의 형제 노드 · 라우팅 0 · 문자함 · 확인 시트와 동시에 열리지 않는다 |
// | A7 | 간소화안 — 클립보드 · 홈 화면 · 탐색 막대 0 · 계좌번호 누름 = '송금' 메뉴 · 그 문자의 링크는 그리지 않는다 · 인증번호 메뉴 0(AC-061) |
// | A8 | 기록 경로 — 통화 송금 완료 = `landing_submitted`(여는 순간 `link_tapped`) · 메신저 송금 칩 = `recordMockScreen(…, "submitted")` + 이체 완료 캡처 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BANK_APP_COPY,
  BANK_APP_FLAG,
  FALLBACK_HOLDER_NAMES,
  FICTIONAL_BANK_NAMES,
  amountFromSmsBody,
  balanceError,
  balanceText,
  fictionalBalanceFor,
  holderFromSmsBody,
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
const messenger = read("src/components/MessengerChatRoom.tsx");
const between = (source: string, start: string, end: string) => {
  const at = source.indexOf(start);
  return source.slice(at, source.indexOf(end, at));
};

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

test("[BA-1 A1] 페이지 — 플래그가 꺼지면 계좌 누름 · 송금 화면 0(종전 링크 그대로)", () => {
  assert.ok(page.includes("{bankAppEnabled && bankAppOpen && bankTransfer && ("), "통화 송금 화면은 플래그 뒤에만");
  assert.ok(page.includes("onSendToAccount={bankAppEnabled ? handleOpenBankApp : undefined}"), "계좌 누름은 플래그 뒤에만");
  assert.ok(
    messenger.includes("fakeLanding && bankAppEnabled && isBankTransferLandingId(fakeLanding.fakeLandingId)"),
    "메신저 송금 칩도 플래그 뒤에만",
  );
  // 문자함은 콜백이 없으면 송금 대상이 없다(종전 화면 그대로 — 링크도 그대로).
  assert.ok(smsOverlay.includes("onSendToAccount !== undefined &&"));
  assert.ok(smsOverlay.includes("{sms.linkDisplayText && !sendable && ("));
});

test("[BA-1 A2] 화면 단계 표 S1~S6", () => {
  const path: [Parameters<typeof nextBankAppStage>[0], Parameters<typeof nextBankAppStage>[1], string][] = [
    ["recipient", "next", "amount"],
    ["amount", "next", "auth"],
    ["auth", "authenticate", "done"],
    ["amount", "back", "recipient"],
    ["auth", "cancel", "amount"],
  ];
  for (const [from, action, to] of path) assert.equal(nextBankAppStage(from, action), to, `${from} + ${action}`);
  // 표에 없는 조합은 머문다(인증을 건너뛰어 완료로 가는 길 0).
  assert.equal(nextBankAppStage("recipient", "authenticate"), "recipient");
  assert.equal(nextBankAppStage("amount", "authenticate"), "amount");
  assert.equal(nextBankAppStage("done", "next"), "done");
});

test("[BA-1 A2] 판정 — 잔액 초과 · 금액 표기 · 받는 분 이름", () => {
  assert.equal(balanceError("5,000,000", 10_000_000), undefined);
  assert.equal(balanceError("20000000", 10_000_000), "출금 가능 금액보다 많습니다.");
  assert.equal(balanceError("abc", 10_000_000), undefined, "형식 오류는 amountError가 먼저 막는다");
  assert.equal(wonText("500000"), "500,000원");
  assert.equal(wonText("2,340,000"), "2,340,000원");
  assert.equal(balanceText(12_340_000), "12,340,000원");
  // 서버가 실은 예금주 그대로 · 없으면 가상 개인 이름(결정적 · 하이픈 무관).
  assert.equal(recipientHolderFor({ accountNumber: "948-2716-5093-27", holder: "김도현" }), "김도현");
  const fallback = recipientHolderFor({ accountNumber: "1234567890" });
  assert.ok(FALLBACK_HOLDER_NAMES.includes(fallback));
  assert.equal(recipientHolderFor({ accountNumber: "123-456-7890" }), fallback);
});

test("[BA-1 A2] 옛 계좌 문자 보정 — 문자에 보이는 예금주 · 금액 줄(서버 문구 그대로)", () => {
  const body = "[승인취소 지원] 피해금 이관 전용 계좌 안내\n예금주: 오현수\nOO은행 417-0625-3082-19\n금액: 2,340,000원\n아래에서 피해금 이관을 진행해 주세요.";
  assert.equal(holderFromSmsBody(body), "오현수");
  assert.equal(amountFromSmsBody(body), "2,340,000");
  // 줄이 없으면 부재(가상 이름 · 빈 금액 칸으로 간다).
  assert.equal(holderFromSmsBody("[자산보호절차] 임시 안전계좌 안내\nOO은행 210-3391-5540-08"), undefined);
  assert.equal(amountFromSmsBody("예금주: 강태윤\nOO은행 210-3391-5540-08"), undefined);
  // 메뉴는 구조화 필드를 먼저 쓰고, 없을 때만 본문 줄로 맞춘다.
  assert.ok(smsOverlay.includes("const holder = sms.accountHolder ?? holderFromSmsBody(sms.body);"));
  assert.ok(smsOverlay.includes("const amount = sms.transferAmount ?? amountFromSmsBody(sms.body);"));
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

test("[BA-1 A3] G138 — 금액이 오버레이 밖으로 나가지 않는다(콜백 인자 · 네트워크 · 저장소 · 콜러블 0)", () => {
  for (const forbidden of ["fetch(", "XMLHttpRequest", "sendBeacon", "localStorage", "sessionStorage", "indexedDB", "callCallable", "@/lib/api", "firebase"]) {
    assert.ok(!overlayCode.includes(forbidden), `오버레이에 있으면 안 되는 것: ${forbidden}`);
  }
  // 위로 올리는 콜백은 둘뿐이다(닫기 무인자 · 송금 완료). N1(2026-11-01) — 송금 완료는 요구액 대비 비교 결과 하나만 싣는다(세 값 enum · 금액 값 0).
  assert.ok(overlayCode.includes("onClose: () => void;"));
  assert.ok(overlayCode.includes("onSubmitted: (amountComparison: AmountComparison | undefined) => void;"));
  assert.ok(!/onClose\([^)]/.test(overlayCode), "닫기 콜백에 값을 싣지 않는다");
  assert.deepEqual(overlayCode.match(/onSubmitted\([^)]*\)?/g), ["onSubmitted(recordTransferAndCompare(ledgerKey ?? \"\", target, amount)"], "송금 완료 = 비교 결과 호출 한 곳");
  for (const forbidden of ["fetch(", "localStorage", "sessionStorage", "callCallable"]) {
    assert.ok(!stripComments(lib).includes(forbidden), `순수 모듈에 있으면 안 되는 것: ${forbidden}`);
  }
});

test("[BA-1 A4] 입력 칸 0 — 비밀번호 · 인증번호 칸이 없고 입력은 금액 한 칸뿐", () => {
  assert.equal(overlayCode.split("<input").length - 1, 1, "입력 칸은 금액 하나");
  assert.equal(overlayCode.split("<select").length - 1, 0, "선택 칸 0(받는 계좌는 문자 · 칩에서 채워진다)");
  for (const forbidden of ['type="password"', "비밀번호를 입력", "인증번호를 입력", "OTP", "보안카드", "<textarea"]) {
    assert.ok(!overlayCode.includes(forbidden), `있으면 안 되는 것: ${forbidden}`);
  }
  assert.ok(BANK_APP_COPY.authButton.includes("지문") && BANK_APP_COPY.authButton.includes("인증"));
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
  const bankAt = page.indexOf("{bankAppEnabled && bankAppOpen && bankTransfer && (");
  const verifyAt = page.indexOf("{verifyOverlayOpen && verifyOffer && (");
  assert.ok(smsAt > 0 && bankAt > smsAt && verifyAt > bankAt, "문자함 · 은행 앱 · 확인 시트가 같은 자리에 차례로 있다");
  const open = between(page, "const handleOpenBankApp = (", "};");
  assert.ok(open.includes("setSmsOverlayOpen(false)") && open.includes("setVerifyOverlayOpen(false)") && open.includes("setBankAppOpen(true)"));
  assert.ok(open.includes("isEndLatched(callEndingRef.current)"), "종료 래치 뒤에는 열지 않는다");
  assert.ok(!open.includes("router."), "송금 화면 열기는 라우팅하지 않는다");
  assert.ok(!overlayCode.includes("useRouter") && !overlayCode.includes("router."), "오버레이는 라우팅하지 않는다");
  // 문자함 · 확인 시트를 열면 은행 앱이 닫힌다 · 종료 래치(E2 · 끊기 승인)에서도 닫힌다.
  assert.ok(page.split("setBankAppOpen(false);").length - 1 >= 4);
  assert.ok(page.includes("inert={chatOpen || smsOverlayOpen || bankAppOpen ? true : undefined}"));
  // 통화 띠(탭 = 통화 복귀)가 오버레이에 있다(통화 중일 때만 — 메신저는 부재).
  assert.ok(overlayCode.includes("aria-label={COPY.callPill}") && BANK_APP_COPY.callPill === "눌러서 통화로 돌아가기");
  assert.ok(page.includes("call={{ callerLabel, elapsedLabel: formatCallElapsed(elapsedSec) }}"));
});

test("[BA-1 A7] 간소화안 — 클립보드 · 홈 · 탐색 막대 0 · 계좌번호 누름 = '송금' 메뉴 · 링크 대체 · 인증번호 메뉴 0", () => {
  for (const source of [overlay, smsOverlay, page, lib, messenger]) {
    assert.ok(!source.includes("navigator.clipboard") && !source.includes("execCommand"), "기기 복사 API 0");
  }
  for (const gone of ["HomeBar", "copiedAccount", "onCopyAccount", "CopiedAccount", "longPress"]) {
    assert.ok(![overlayCode, smsOverlay, page, lib].some((source) => source.includes(gone)), `빠져야 할 것: ${gone}`);
  }
  // 계좌번호 버튼은 '송금' 메뉴를 여는 것뿐이고, 메뉴는 문자 문서의 구조화 필드만 싣는다(인증번호 0).
  const split = between(smsOverlay, "accountSplit ? (", "accountSplit.after}");
  assert.ok(split.includes("onClick={() => setSendMenuSmsId(sms.smsId)}") && !split.includes("onSendToAccount"));
  const menu = between(smsOverlay, 'role="menu"', "</div>");
  assert.ok(menu.includes("onSendToAccount?.(sms.smsId,") && menu.includes("sms.accountNumber") && !menu.includes("otpCode"));
  assert.equal(BANK_APP_COPY.sendToAccount, "송금");
  // 이체 랜딩이 있는 계좌 문자만(기록 경로가 그 랜딩 제출이라서).
  assert.ok(smsOverlay.includes('sms.landingKind !== "app-install"; // 부재 = credential-form'));
});

test("[BA-1 A8] 기록 경로 — 통화 = landing_submitted(여는 순간 link_tapped) · 메신저 칩 = submitted + 이체 완료 캡처", () => {
  const open = between(page, "const handleOpenBankApp = (", "};");
  assert.ok(open.includes('handleRecordSmsEvent(smsId, "link_tapped")'));
  // N1 — 비교 결과를 같은 기록 경로로 함께 보낸다.
  assert.ok(page.includes('onSubmitted={(amountComparison) => handleRecordSmsEvent(bankTransfer.smsId, "landing_submitted", amountComparison)}'));
  const chip = between(messenger, "<BankAppOverlay", ") : fakeLanding && (");
  assert.ok(chip.includes('recordMockScreen(fakeLanding.fakeLandingId, "submitted", amountComparison)') && chip.includes("setTransferReceipt("));
  // 완료 기록은 인증 버튼 한 번뿐이다(완료 화면의 확인은 닫기).
  const auth = between(overlayCode, "const authenticate = () => {", "};");
  assert.ok(auth.includes("onSubmitted(recordTransferAndCompare(") && auth.includes('go("authenticate")'));
  assert.equal(overlayCode.split("onSubmitted(").length - 1, 1);
});
