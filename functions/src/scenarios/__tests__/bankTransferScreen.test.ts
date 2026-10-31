// ⭐ P2(2026-10-31 · docs/research/in-service-experience-plan-2026-10-31.md §2.1 K1 `bank-transfer` · §5 P2 · X6) — 훈련용 이체 화면.
// 사용자 원칙: 훈련은 서비스 밖 실제 행동(실제 뱅킹 앱 이체)으로 번지지 않는다. 계좌만 적힌 문자 5종이 이 화면을 여는 링크 문자가 됐다.
//
// 판정표(이 파일이 고정한다):
// | # | If | Then |
// |---|---|---|
// | B1 | 계좌 문자(`kind: "account"`) | 이체 화면 링크(`fakeLandingId`)가 있다 — 계좌만 있는 문자 0건 |
// | B2 | 이체 화면을 여는 계좌 문자의 문서 | `accountHolder`(예금주 줄 · 세션 이름 치환 뒤) · `transferAmount`(금액 줄 숫자 · 있을 때만)를 싣는다 |
// | B3 | 그 밖의 문자 문서 | 두 필드를 싣지 않는다(종전 문서 모양) |
// | B4 | 이체 화면 제출 | 리포트 "속은 순간" 승격 원천(`momentTactic` · `correctAction`)이 카탈로그에 있다 · 끊기 4-c 결정 화면이 그 화면이다 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { IN_CALL_SMS, findInCallSmsItem } from "../inCallSms";
import { BANK_TRANSFER_LANDINGS, findMockScreenItem, isBankTransferLanding } from "../mockScreens";
import { buildInCallSmsDoc } from "../../inCallSms/buildDoc";
import { extractAccountHolder, extractTransferAmount } from "../../shared/fictionalBank";
import { finalDecisionScreenSms } from "../../scammerHangup/goalAction";
import { resolveDeclaredSms } from "../../inCallSms/smsGate";
import { sessionReachableLandingIds } from "../reachability";
import { extractLinkMarker, withBankTransferPrefill } from "../../roleplay/linkMarker";

const CONVERTED: readonly [string, string, string][] = [
  ["loan-refinance-scam", "loan-account", "loan-repay-transfer"],
  ["asset-protection-notice-call", "asset-deposit-account", "asset-deposit-transfer"],
  ["reputation-blackmail-scam", "blackmail-hush-account", "blackmail-hush-transfer"],
  ["courier-customs-scam", "courier-customs-fee", "courier-fee-transfer"],
  ["courier-customs-scam", "courier-safe-account", "courier-safe-transfer"],
];

test("[P2 B1] 계좌 문자는 전부 이체 화면 링크를 갖는다 · 바뀐 5종은 각자 훈련용 이체 화면을 연다", () => {
  const accountOnly = Object.values(IN_CALL_SMS)
    .flat()
    .filter((item) => item.kind === "account" && !item.fakeLandingId)
    .map((item) => item.smsId);
  assert.deepEqual(accountOnly, []);
  for (const [scenarioId, smsId, landingId] of CONVERTED) {
    const item = findInCallSmsItem(scenarioId, smsId);
    assert.equal(item?.fakeLandingId, landingId, smsId);
    assert.ok(isBankTransferLanding(landingId), landingId);
    const screen = findMockScreenItem(scenarioId, landingId);
    assert.ok(screen, `${scenarioId}::${landingId} 카탈로그 소속`);
    assert.equal(screen.kind, "credential-form", "새 kind 0 — 안전 계약 그대로");
    assert.equal(screen.entrySurface, "in-call-sms");
    assert.ok(item?.linkAddress?.startsWith(`${screen.mockHost}/`), "말풍선 주소 = 그 화면 호스트");
    // 본문 계좌 줄 형식(§81.6 — 세션 계좌 추출)은 그대로다.
    assert.match(item!.body, /OO은행 \d{3}-\d{4}-\d{4}-\d{2}/);
  }
  // P2-c — 메신저 링크 칩 2종(문자가 아니라 칩이 연다)도 같은 목록에 든다.
  assert.deepEqual([...BANK_TRANSFER_LANDINGS].sort(), [...CONVERTED.map(([, , l]) => l), "child-bank-transfer", "friend-bank-transfer"].sort());
});

test("[P2 B2 · B3] 문자 문서 — 이체 화면 문자만 받는 분 · 금액을 싣고, 이름은 세션 가상 이름으로 바뀐 뒤 값이다", () => {
  const at = Timestamp.fromMillis(0);
  const loan = buildInCallSmsDoc(findInCallSmsItem("loan-refinance-scam", "loan-account")!, at, 3, "loan-refinance-scam", "한결은행");
  assert.equal(loan.bankName, "한결은행");
  assert.equal(loan.accountNumber, "352-0812-4471-63");
  assert.equal(loan.transferAmount, "1850000");
  assert.ok(loan.accountHolder && !loan.accountHolder.includes("○○"), `자리표시자가 남지 않는다: ${loan.accountHolder}`);
  const hush = buildInCallSmsDoc(findInCallSmsItem("reputation-blackmail-scam", "blackmail-hush-account")!, at, 3, "reputation-blackmail-scam", "다온은행");
  assert.equal(hush.accountHolder, "김민재");
  assert.equal(hush.transferAmount, "3000000");
  // 금액 줄이 없는 문자(금액은 통화에서 정한다) — 금액 필드 없음.
  const deposit = buildInCallSmsDoc(findInCallSmsItem("asset-protection-notice-call", "asset-deposit-account")!, at, 5, "asset-protection-notice-call", "새솔은행");
  assert.equal(deposit.accountHolder, "자산보호공탁관리");
  assert.equal("transferAmount" in deposit, false);
  // B3 — 기존 이체 화면(안전계좌)은 종전 모양 그대로(두 필드 없음).
  const safe = buildInCallSmsDoc(findInCallSmsItem("institutional-impersonation", "institution-safe-account")!, at, 6, "institutional-impersonation", "한결은행");
  assert.equal("accountHolder" in safe, false);
  assert.equal("transferAmount" in safe, false);
});

test("[P2] 추출 함수 — 줄이 없으면 undefined · 쉼표 제거", () => {
  assert.equal(extractAccountHolder("예금주: 국제통관지원센터\nOO은행 604-2270-1183-91"), "국제통관지원센터");
  assert.equal(extractAccountHolder("OO은행 604-2270-1183-91"), undefined);
  assert.equal(extractTransferAmount("금액: 78,000원\n"), "78000");
  assert.equal(extractTransferAmount("수사 종료 후 전액 반환됩니다."), undefined);
});

test("[P2 B4] 이체 화면 제출 = 리포트 속은 순간 원천 · 그 화면이 끊기 4-c의 결정 화면이다", () => {
  for (const [scenarioId, smsId, landingId] of CONVERTED) {
    const screen = findMockScreenItem(scenarioId, landingId)!;
    assert.ok(screen.momentTactic.length > 0 && screen.correctAction.includes("112"), landingId);
    assert.ok(/이체|입금/.test(screen.momentTactic), `${landingId}: 속은 순간 문면이 이체 행동을 가리킨다`);
    void smsId;
  }
  // 대표 변형 — 마지막 결정 화면 문자가 그 계좌 문자다(입력 화면 제출 = landingSubmittedAt → 4-c 해제).
  for (const [scenarioId, variantId, smsId] of [
    ["loan-refinance-scam", "fv-bqr9", "loan-account"],
    ["courier-customs-scam", "fv-62ak", "courier-customs-fee"],
    ["reputation-blackmail-scam", "fv-egum", "blackmail-hush-account"],
    ["asset-protection-notice-call", "fv-p3jx", "asset-deposit-account"],
  ] as const) {
    const { declared } = resolveDeclaredSms(scenarioId, variantId);
    assert.equal(finalDecisionScreenSms(scenarioId, declared)?.smsId, smsId, `${scenarioId}#${variantId}`);
  }
});

// ── ⭐ P2-c(X6) — 메신저 자녀 · 지인 사칭 6루트의 이체 화면 칩 ─────────────────────────────────────────
test("[P2-c] 메신저 자녀 · 지인 사칭 전 변형이 이체 화면 칩에 닿고, 칩 라벨 · 카탈로그가 있다", () => {
  for (const [scenarioId, landingId, variants] of [
    ["messenger-child-impersonation-kakao", "child-bank-transfer", ["fv-34v5", "fv-tpr3", "fv-tdgg"]],
    ["messenger-friend-loan-kakao", "friend-bank-transfer", ["fv-42wd", "fv-fvsc", "fv-bxvp"]],
  ] as const) {
    const screen = findMockScreenItem(scenarioId, landingId);
    assert.equal(screen?.entrySurface, "messenger-link", landingId);
    assert.equal(screen?.kind, "credential-form");
    for (const variantId of variants) {
      assert.ok(sessionReachableLandingIds(scenarioId, variantId).includes(landingId), `${scenarioId}#${variantId}`);
    }
    const { attachments } = extractLinkMarker(`계좌 보낼게 [[LINK:${landingId}]]`, scenarioId, { level: "intermediate", challenge: false, flowVariantId: variants[1] } as never);
    assert.equal(attachments?.[0]?.fakeLandingId, landingId);
    assert.notEqual(attachments?.[0]?.displayText, "확인하기", "기본 라벨이 아니라 등재 라벨");
  }
});

test("[P2-c] 칩 미리 채움 — 이체 화면 칩에만 세션 은행명 · 계좌를 싣는다(그 밖 칩 · 부재는 그대로)", () => {
  const transfer = { kind: "link" as const, displayText: "이체하기", fakeLandingId: "child-bank-transfer", harmless: true as const };
  const install = { kind: "link" as const, displayText: "보험 접수 앱 설치하기", fakeLandingId: "child-insurance-install", harmless: true as const, landingKind: "app-install" as const };
  const out = withBankTransferPrefill([transfer, install], "한결은행", "948-2716-5093-27");
  assert.deepEqual(out?.[0], { ...transfer, bankName: "한결은행", accountNumber: "948-2716-5093-27" });
  assert.deepEqual(out?.[1], install, "설치 칩은 무변경");
  assert.equal(withBankTransferPrefill(undefined, "한결은행", "1"), undefined);
});
