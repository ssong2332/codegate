// ⭐ 2026-11-08(사용자 결정 *"화면 문구 시험으로 대신"*) — 기관 사칭 고급 앱 안 대출(PR-B #518) 화면을 단계마다 그려 본다.
// 라이브 재시험에서 이 루트가 뽑히지 않아 화면이 한 번도 확인되지 않았다. 실 키 · 브라우저 없이 렌더 하네스(`renderHarness.ts`)로 확인한다.
//
// | # | 고정하는 것 |
// |---|---|
// | S1 | 대출 신청 화면 첫 단계 — 문자 속 가상 캐피탈 이름 머리띠 · 안내 · "본인 확인하고 한도 조회" · 문자함 복귀 버튼 |
// | S2 | 단계 6개(안내 · 본인 확인 · 한도 · 약정 · 전자서명 · 접수)가 모두 그려지고 단계마다 맞는 문면 · 세션 금지어('모의' · '훈련') 0(G437) |
// | S3 | 한도 단계 = 세션 결정적 한도 · 금리(`loanOfferFor`) · 용도 5개 · 입금 계좌 / 약정 단계 = 고른 금액 · 14일 철회 · 누가 시켰다면 신청하지 말라는 줄 · 동의 전 버튼 막힘 |
// | S4 | 문자 맥락이 없으면(은행 정보 없음) 종전 폼으로 그린다 — 화면이 비지 않는다 |
// | S5 | 대출금 보관 이체 화면 — 문자 받는 분 · 은행 · 보관 계좌 미리 채움 · 출금 계좌 줄 · 금지어 0 |
// | S6 | 입금 뒤 보관 이체 화면 — 출금 가능 금액 = 가상 잔액 + 입금된 대출금(탭 메모리 장부 · 같은 렌더 안 모듈) |
//
// ⚠️ 한계(정직 고지): 하네스는 `renderToStaticMarkup` — 누름 · 타이머 전이는 보지 않는다(신규 의존성 0 원칙 · renderGate.test.ts 관례).
//    둘째 단계부터는 **초기 상태 값만 바꾼 메모리 사본**(디스크 쓰기 0 · G142)으로 그 단계를 그린다. 전이 순서 자체는 소스 단언(S2 끝)과
//    서버 에뮬레이터 스모크(`scripts/emulator-loan-route-smoke.mjs`)가 맡는다. "그려졌다"는 "보였다"가 아니다(실기기 확인 몫).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { COMPONENT_PATH, renderLandingScreen } from "../mockscreenrender/renderHarness.ts";
import { LOAN_PURPOSES, loanOfferFor } from "./loanFlow.ts";
import { fictionalBalanceFor, myBankNameFor } from "./bankApp.ts";
import { availableBalance, availableText, disburseLoan, recordLoanApplication, withdrawAccountsFor } from "./withdrawAccounts.ts";

const LEDGER = "loan-screen-session-01";
const LENDER = "가온캐피탈";
const SESSION_WORDS = /모의|훈련/;

const loanProps = (extra: Record<string, unknown> = {}) => ({
  title: "비대면 대출 신청 안내",
  landingId: "loan-apply",
  landingKind: "credential-form",
  entrySurface: "in-call-sms",
  onHide: () => {},
  onClose: () => {},
  loanContext: { ledgerKey: LEDGER, lenderName: LENDER },
  ...extra,
});

/** 초기 상태 값만 바꾼 메모리 사본(치환이 실제로 일어났는지 단언한다 — 일어나지 않으면 정상 렌더를 단계 렌더로 착각한다). */
function overridden(replacements: readonly [string, string][]): Map<string, string> {
  const absolutePath = resolvePath(COMPONENT_PATH);
  let source = readFileSync(absolutePath, "utf8");
  for (const [from, to] of replacements) {
    assert.equal(source.split(from).length - 1, 1, `치환 앵커가 한 곳이어야 한다: ${from}`);
    source = source.replace(from, to);
  }
  return new Map([[absolutePath, source]]);
}
const STAGE = (stage: string): [string, string] => ['useState<LoanApplyStage>("intro")', `useState<LoanApplyStage>("${stage}")`];
const AMOUNT: [string, string] = ['const [amount, setAmount] = useState("");', 'const [amount, setAmount] = useState("12000000");'];
const AGREED: [string, string] = ["const [agreed, setAgreed] = useState(false);", "const [agreed, setAgreed] = useState(true);"];
const won = (value: number) => `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;

const renderStage = (replacements: readonly [string, string][]) => renderLandingScreen(loanProps(), overridden(replacements));

test("[S1] 대출 신청 화면 첫 단계 — 가상 캐피탈 머리띠 · 안내 · 한도 조회 버튼", () => {
  const { text } = renderLandingScreen(loanProps());
  assert.ok(text.includes(`${LENDER} 비대면 대출`), "머리띠 = 문자 속 가상 캐피탈 이름");
  assert.ok(text.includes("비대면 신용대출"));
  assert.ok(text.includes("본인 확인 후 대출 한도를 조회하고 바로 신청할 수 있습니다."));
  assert.ok(text.includes("본인 확인하고 한도 조회"));
  assert.ok(!SESSION_WORDS.test(text), text);
});

test("[S2] 단계 6개가 모두 그려지고 단계마다 맞는 문면 · 금지어 0", () => {
  const offer = loanOfferFor(LEDGER);
  const deposit = withdrawAccountsFor({ seed: LEDGER, appBankName: myBankNameFor(LEDGER), primaryBalance: fictionalBalanceFor(LEDGER) })[0]!;
  const stages: [string, readonly [string, string][], readonly string[]][] = [
    ["verify", [STAGE("verify")], [`${LENDER} 본인 확인`, "대출 한도 조회를 위한 본인 확인", "비대면 신용대출"]],
    ["limit", [STAGE("limit")], [`최대 ${won(offer.limit)}까지 받을 수 있어요`, "신청 금액", "대출 용도", "입금 계좌", deposit.bankName]],
    ["terms", [STAGE("terms"), AMOUNT], ["대출 약정 내용을 확인해 주세요", won(12_000_000), `연 ${offer.ratePercent}% (고정)`, "전자서명하고 신청"]],
    ["sign", [STAGE("sign"), AMOUNT, AGREED], [`${LENDER} 전자서명`, `${won(12_000_000)} 대출 신청`]],
    ["done", [STAGE("done"), AMOUNT], ["대출 신청이 접수되었습니다.", `대출 실행 전 본인 확인을 위해 ${LENDER}에서 확인 전화를 드릴 수 있습니다. 실행되면 문자로 알려 드립니다.`, won(12_000_000)]],
  ];
  for (const [stage, replacements, expected] of stages) {
    const { text } = renderStage(replacements);
    for (const line of expected) assert.ok(text.includes(line), `${stage} 단계에 "${line}"\n${text}`);
    assert.ok(text.includes(`${LENDER} 비대면 대출`), `${stage} — 머리띠 유지`);
    assert.ok(!SESSION_WORDS.test(text), `${stage} — 금지어 0\n${text}`);
  }
  // 전이 순서(소스) — 안내 → 본인 확인 → 한도 → 약정 → 전자서명 → 접수. 렌더가 누름을 보지 않으므로 순서는 이 줄들이 고정한다.
  const file = readFileSync(resolvePath(COMPONENT_PATH), "utf8");
  const src = file.slice(file.indexOf("function LoanApplyMockup("), file.indexOf("\nfunction ", file.indexOf("function LoanApplyMockup(") + 1));
  for (const edge of [
    'primary("본인 확인하고 한도 조회", () => setStage("verify"))',
    'onSuccess={() => setStage("limit")}',
    'setStage("terms");',
    'primary("전자서명하고 신청", () => setStage("sign"), !agreed)',
    'setStage("done");',
  ]) {
    assert.ok(src.includes(edge), `전이 ${edge}`);
  }
});

test("[S3] 한도 · 약정 단계 세부 — 용도 5개 · 14일 철회 · 동의 전 버튼 막힘", () => {
  const limit = renderStage([STAGE("limit")]);
  for (const purpose of LOAN_PURPOSES) assert.ok(limit.text.includes(purpose), `용도 ${purpose}`);
  assert.equal(LOAN_PURPOSES.length, 5);
  const terms = renderStage([STAGE("terms"), AMOUNT]);
  assert.ok(terms.text.includes("대출 계약일부터 14일 안에 대출계약 철회를 신청할 수 있습니다. 누군가 대출을 받으라고 시켰다면 신청하지 마세요."));
  assert.ok(terms.text.includes("약정 내용과 대출 상품 설명을 확인했습니다"));
  const signButton = /<button[^>]*disabled=""[^>]*>전자서명하고 신청<\/button>/;
  assert.ok(signButton.test(terms.markup), "동의 전 = 전자서명 버튼 막힘");
  const agreed = renderStage([STAGE("terms"), AMOUNT, AGREED]);
  assert.ok(!signButton.test(agreed.markup) && agreed.markup.includes("전자서명하고 신청"), "동의 뒤 = 버튼 열림");
});

test("[S4] 문자 맥락(은행 정보)이 없으면 종전 폼 — 화면이 비지 않는다", () => {
  const { text } = renderLandingScreen(loanProps({ loanContext: undefined }));
  assert.ok(text.includes("비대면 신용대출 신청") && text.includes("대출 신청 금액") && text.includes("대출 신청하기"), text);
  assert.ok(!SESSION_WORDS.test(text));
});

const keepProps = (ledgerKey: string) => ({
  title: "보관 계좌 이체",
  landingId: "loan-safe-transfer",
  landingKind: "credential-form",
  entrySurface: "in-call-sms",
  onHide: () => {},
  onClose: () => {},
  prefilledAccount: "302-1184-5527-61",
  prefilledTransfer: { bankName: "누리은행", holder: "노은채", myBankName: myBankNameFor(ledgerKey), ledgerKey },
});

test("[S5] 대출금 보관 이체 화면 — 보관 계좌 미리 채움 · 출금 계좌 · 확인 단계 받는 분 · 금지어 0", () => {
  const { text, markup } = renderLandingScreen(keepProps(LEDGER));
  assert.ok(text.includes("대출금 보관 이체가 아직 완료되지 않았습니다"), text);
  assert.ok(text.includes(`${myBankNameFor(LEDGER)} 모바일뱅킹`), "머리띠 = 참가자의 내 은행");
  assert.ok(/value="302-1184-5527-61"/.test(markup), "보관 계좌 번호 미리 채움");
  assert.ok(text.includes("출금 계좌") && text.includes("출금 가능 금액") && text.includes("보관 계좌로 이체하기"), "출금 계좌 줄 · 이체 버튼");
  assert.ok(!SESSION_WORDS.test(text), text);
  // 둘째 단계(이체 정보 확인) — 문자 받는 분 · 보관 계좌가 그대로 실린다(지어낸 이름 0).
  const confirm = renderLandingScreen(
    keepProps(LEDGER),
    overridden([['const [bankStage, setBankStage] = useState<"form" | "confirm" | "auth">("form");', 'const [bankStage, setBankStage] = useState<"form" | "confirm" | "auth">("confirm");']]),
  );
  for (const line of ["받는 분", "노은채", "받는 계좌", "302-1184-5527-61", "보내는 금액"]) assert.ok(confirm.text.includes(line), `확인 단계 "${line}"\n${confirm.text}`);
  assert.ok(!SESSION_WORDS.test(confirm.text), confirm.text);
});

test("[S6] 입금 뒤 보관 이체 화면 — 출금 가능 금액 = 가상 잔액 + 입금된 대출금", () => {
  const key = "loan-screen-session-02";
  // 이 테스트 쪽 장부로 기대값을 계산한다(같은 함수 · 같은 열쇠 — 화면 쪽 장부는 하네스 모듈이라 따로 있다).
  const account = withdrawAccountsFor({ seed: key, appBankName: myBankNameFor(key), primaryBalance: fictionalBalanceFor(key), avoidBankName: "누리은행" })[0]!;
  const before = availableText(key, account);
  recordLoanApplication(key, "12000000");
  disburseLoan(key);
  assert.equal(availableBalance(key, account), fictionalBalanceFor(key) + 12_000_000, "입금 = 첫 계좌");
  const after = availableText(key, account);
  // 화면 쪽 장부(하네스가 변환한 같은 모듈)에 신청 → 입금을 먼저 적는다 — 화면이 하는 순서 그대로(대출 신청 마지막 버튼 → 입금 안내 문자 도착).
  const seeded = overridden([
    [
      'import { LOAN_PURPOSES, loanApplyError, loanOfferFor } from "../lib/bankapp/loanFlow";',
      `import { LOAN_PURPOSES, loanApplyError, loanOfferFor } from "../lib/bankapp/loanFlow";\nimport { disburseLoan as __disburse } from "../lib/bankapp/withdrawAccounts";\nrecordLoanApplication(${JSON.stringify(key)}, "12000000");\n__disburse(${JSON.stringify(key)});`,
    ],
  ]);
  const plain = renderLandingScreen(keepProps(key));
  const paid = renderLandingScreen(keepProps(key), seeded);
  assert.ok(plain.text.includes(`출금 가능 금액 ${before}`), `입금 전 화면\n${plain.text}`);
  assert.ok(paid.text.includes(`출금 가능 금액 ${after}`), `입금 뒤 화면\n${paid.text}`);
  assert.notEqual(before, after);
});
