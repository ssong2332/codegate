// ⭐ 실기기 신고 N1 · N2 · N3 · N4(2026-11-01 · 메신저 자녀 사칭 — 200만 원 요구에 200원을 보내도 통과 · 머리줄이 받는 계좌 은행 · 완료 한 줄)
// + #465 R1(실시간 매 발화 화면 기록 주입) — 클라 계약.
// | # | 고정하는 것 |
// |---|---|
// | B1 | 판정표 C — 같은 계좌로 나눠 보낸 합계를 요구액과 비교(적음 · 같음 · 많음 · 모름) · 세션 열쇠로 갈린다 |
// | B2 | 은행 앱 · 웹 이체 화면 완료 = 받는 분 · 받는 계좌 · 보낸 금액 · 보낸 시각(N4) |
// | B3 | 웹 이체 화면 머리띠 = 참가자의 "내 은행"(N2 — 받는 계좌 은행이 아니다) |
// | B4 | 비교 결과만 기록 경로로(통화 `landing_submitted` · 메신저 `submitted`) · 메신저 칩 요구액은 금액 칸을 채우지 않는다 |
// | B5 | 실시간 화면 기록 줄 — 백스톱 응답을 맥락 주입(`screenStatus`) · 슬롯이 비었을 때만 · 화면이 남았으면 남은 문자가 없어도 다시 묻는다 |
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lastAmountIn, latestDemandAmount, recordTransferAndCompare, transferTimeText } from "./bankApp.ts";
import { sendsAsContextInjection, stepSilenceNudge, INITIAL_SILENCE_NUDGE_STATE } from "../realtime/contextInjection.ts";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const overlay = read("src/components/BankAppOverlay.tsx");
const landing = read("src/components/MessengerFakeLanding.tsx");
const room = read("src/components/MessengerChatRoom.tsx");
const smsOverlay = read("src/components/InCallSmsOverlay.tsx");
const page = read("src/app/session/play/page.tsx");

test("[B1] 판정표 C — 합계 비교 · 모름 · 세션 열쇠 분리 · 계좌 표기 무관", () => {
  const target = { accountNumber: "948-2716-5093-27", requestedAmount: "2,000,000" };
  assert.equal(recordTransferAndCompare("s1", target, "200"), "less", "C2 — 200원");
  assert.equal(recordTransferAndCompare("s1", { ...target, accountNumber: "새솔은행 948-2716-5093-27" }, "1,999,800"), "equal", "C3 — 모자란 금액을 마저(합계)");
  assert.equal(recordTransferAndCompare("s1", target, "1"), "more", "C4 — 합계가 넘는다");
  assert.equal(recordTransferAndCompare("s2", target, "3,000,000"), "more", "다른 세션은 따로 센다");
  assert.equal(recordTransferAndCompare("s3", { accountNumber: "1", amount: "2,340,000" }, "2340000"), "equal", "요구액 부재 = 문자 금액");
  assert.equal(recordTransferAndCompare("s4", { accountNumber: "1" }, "100"), undefined, "C1 — 요구액 모름");
  assert.equal(recordTransferAndCompare("s5", target, "abc"), undefined, "C1 — 금액 판정 불가");
});

test("[B2] 완료 영수증 — 은행 앱 · 웹 이체 화면 모두 받는 분 · 계좌 · 금액 · 시각", () => {
  assert.equal(transferTimeText(new Date(2026, 10, 1, 15, 7)), "오후 3:07");
  assert.equal(transferTimeText(new Date(2026, 10, 1, 0, 5)), "오전 12:05");
  for (const label of ['["받는 분", holder]', '["받는 계좌", account]', '["보낸 금액", amountWon]', '["보낸 시각", sentAt ? transferTimeText(sentAt) : ""]']) {
    assert.ok(overlay.includes(label), `은행 앱 ${label}`);
  }
  const done = landing.slice(landing.indexOf("if (submitted && bankTransfer && receipt) {"), landing.indexOf("if (submitted) {"));
  for (const label of ['"받는 분"', '["받는 계좌", prefilledAccount ?? ""]', '["보낸 금액", receipt.amountText]', '["보낸 시각", transferTimeText(receipt.sentAt)]']) {
    assert.ok(done.includes(label), `웹 이체 화면 ${label}`);
  }
  assert.ok(!done.includes("values"), "완료 분기는 입력 state를 읽지 않는다(영수증은 제출 순간 만든다 — G255 좁은 예외)");
});

test("[B3] 웹 이체 화면 머리띠 = 내 은행(받는 계좌 은행 아님) · 두 진입 표면 모두 내 은행을 넘긴다", () => {
  // 2026-11-08 — 머리띠 이름 = 판정표 A로 정한 첫 출금 계좌 은행(`appBankName` — 카드 · 말한 값 · 없으면 종전 `prefilledTransfer.myBankName`).
  assert.ok(landing.includes("bankTransfer && prefilledTransfer?.myBankName ? `${appBankName} 모바일뱅킹` : issuerNameOf(copy.issuerLabel)"));
  assert.ok(landing.includes("fixedBankName: prefilledTransfer?.myBankName ?? myBankNameFor(ledger, prefilledTransfer?.bankName),"), "값이 없으면 종전 내 은행");
  assert.ok(!landing.includes("`${prefilledTransfer.bankName} 모바일뱅킹`"), "받는 계좌 은행명으로 머리띠를 쓰지 않는다");
  assert.ok(room.includes("myBankName: myBankNameFor(sessionId ?? \"\", fakeLanding.bankName),"), "메신저 칩");
  assert.ok(page.includes("bankIdentity={{ myBankName: myBankNameFor(sessionId ?? \"\", sortedSms.find((sms) => sms.bankName)?.bankName), ledgerKey: sessionId ?? \"\" }}"), "통화 중 문자");
  assert.ok(smsOverlay.includes("prefilledTransfer={landing.prefilledTransfer && bankIdentity ? { ...landing.prefilledTransfer, ...bankIdentity } : landing.prefilledTransfer}"));
});

test("[B4] 비교 결과만 기록 경로로 · 메신저 칩 요구액은 비교 전용", () => {
  assert.ok(room.includes("const request = { sessionId, landingId, event, ...(amountComparison ? { amountComparison } : {}) };"));
  assert.ok(room.includes("...(fakeLanding.transferAmount ? { requestedAmount: fakeLanding.transferAmount } : {}),"));
  assert.ok(!room.includes("amount: fakeLanding.transferAmount"), "금액 칸을 미리 채우지 않는다(참가자가 직접 넣는다)");
  // A4 — 대화방 가장 최근 금액 · 없으면 서버가 칩에 실은 요구액(아래 [A4] 테스트).
  assert.ok(room.includes("?? attachment.transferAmount"), "서버가 칩에 실은 요구액(대체값)");
  assert.ok(page.includes("void recordInCallSmsEvent({ sessionId, smsId, event, ...(amountComparison ? { amountComparison } : {}) })"));
  assert.ok(page.includes('onLandingSubmitted={(smsId, amountComparison) => handleRecordSmsEvent(smsId, "landing_submitted", amountComparison)}'));
  assert.ok(smsOverlay.includes("onCredentialSubmit={(amountComparison) => onLandingSubmitted(landing.smsId, amountComparison)}"));
});

test("[B5 R1] 실시간 화면 기록 줄 — 맥락 주입 · 침묵 넛지 0 · 슬롯 비었을 때만 · 화면이 남으면 계속 묻는다", () => {
  assert.equal(sendsAsContextInjection("screenStatus"), true, "turnComplete:false(X5)");
  assert.equal(stepSilenceNudge(INITIAL_SILENCE_NUDGE_STATE, { type: "injected", delivery: "screenStatus", nowMs: 1 }).state.armedAt, null);
  assert.ok(page.includes('if (result.screenStatusInstruction && contextTurnPendingSeqRef.current === null) pushContextTurn(result.screenStatusInstruction, "screenStatus");'));
  assert.ok(page.includes('if (result.status === "none_pending" && !result.screenStatusInstruction) state.nonePending = true;'));
  assert.ok(page.includes("contextTurnPendingSeqRef.current = contextTurnSeqRef.current;"), "보낼 슬롯 표시");
  assert.ok(page.includes("if (contextTurnPendingSeqRef.current === seq) contextTurnPendingSeqRef.current = null;"), "보낸 뒤 비움");
  const kinds = '"confirmResult" | "verifyReconnectFailed" | "chatDuringCall" | "landingSubmitted" | "installConsented" | "screenStatus"';
  assert.equal(page.split(kinds).length - 1, 2);
  assert.equal(read("src/lib/realtime/GeminiVoiceSession.tsx").split(kinds).length - 1, 2);
});

// ── A4(실기기 신고 2026-11-01 저녁) — 대화방 요구액: 칩 뒤에 말한 금액도 비교 기준 · 서버 표기 규칙과 같다 ──

test("[A4] 대화방 가장 최근 금액이 요구액 · 서버 `demandAmountFrom` 표기 규칙과 같다(드리프트)", () => {
  assert.equal(latestDemandAmount(["가온은행 948-2716-5093-27 여기로 보내 줘", "아 200만 원만 보내 줘"]), "2,000,000", "칩 뒤에 말한 금액");
  assert.equal(latestDemandAmount(["300만 원 필요해", "그 계좌로 보내 줘"]), "3,000,000", "최근 메시지에 없으면 그 앞");
  assert.equal(latestDemandAmount(["폰이 고장 났어"]), undefined);
  for (const [text, want] of [["1억 2천만 원", "120,000,000"], ["금액: 2,340,000원", "2,340,000"], ["삼천만 원 말고 200만 원만", "2,000,000"], ["계좌 948-2716-5093-27", undefined]] as const) {
    assert.equal(lastAmountIn(text), want, text);
  }
  const server = read("functions/src/roleplay/linkMarker.ts");
  const client = read("src/lib/bankapp/bankApp.ts");
  for (const name of ["AMOUNT_UNITS", "AMOUNT_PATTERN", "AMOUNT_TOKEN"]) {
    const line = (src: string) => src.split("\n").find((l) => l.startsWith(`const ${name} =`));
    assert.equal(line(client), line(server), `${name} 서버와 같은 줄`);
  }
  assert.ok(room.includes('latestDemandAmount(messages.filter((m) => m.role === "scammer").map((m) => m.text)) ?? attachment.transferAmount'));
  assert.ok(room.includes("...(chipDemandAmount(attachment) ? { transferAmount: chipDemandAmount(attachment) } : {}),"));
});

// ── ⭐ PR-A(2026-11-07 · 기관 사칭 고급 · 택배 통관 고급 — 적은 금액이 통과) — 통화 중 문자 이체 화면의 요구액 ──
// 설계 docs/research/institution-advanced-loan-design-2026-11-07.md §1.1 판정표 R1 ~ R3 · 한글 수사 H1 ~ H3.

test("[PR-A H] 한글 수사 금액(실시간 전사 표기)을 읽는다 · 금액 아닌 낱말은 그대로", () => {
  const cases: Array<[string, string | undefined]> = [
    ["우선 구백팔십만 원을 옮기셔야 합니다", "9,800,000"],
    ["협박 금액은 삼백만 원", "3,000,000"],
    ["수수료는 구만 구천 원", "99,000"],
    ["5백만 원", "5,000,000"],
    ["9백8십만 원", "9,800,000"],
    ["3천만 원 정도 있어요", "30,000,000"],
    ["만 원만", "10,000"],
    ["삼천만 원 말고 200만 원만", "2,000,000"],
    ["저희 사원이 연락드립니다", undefined],
    ["구원 투수", undefined],
  ];
  for (const [text, want] of cases) assert.equal(lastAmountIn(text), want, text);
  assert.equal(latestDemandAmount(["잔액이 삼천만 원이시군요", "그중 구백팔십만 원을 먼저 옮기셔야 합니다", "네 링크 누르세요"]), "9,800,000");
});

test("[PR-A H 드리프트] 한글 수사 줄은 서버 linkMarker와 원문이 같다", () => {
  const server = read("functions/src/roleplay/linkMarker.ts");
  const client = read("src/lib/bankapp/bankApp.ts");
  const slice = (src: string) => src.slice(src.indexOf("const HANGUL_NUMERALS"), src.indexOf("/** 한글 수사 금액을 숫자로 바꾼 대사"));
  assert.ok(slice(client).length > 200);
  assert.equal(slice(client), slice(server));
  const fn = (src: string) => {
    const at = src.indexOf("function hangulAmountsToDigits(text: string): string {");
    return src.slice(at, src.indexOf("\n}\n", at));
  };
  assert.ok(fn(client).length > 100);
  assert.equal(fn(client), fn(server));
});

test("[PR-A R] 통화 중 문자 이체 화면 — 요구액 = 통화에서 마지막으로 말한 금액(없으면 문자 금액) · 금액 값은 콜백 밖으로 0", () => {
  // R1 · R2 · R3 — 화면 비교 표(B1)와 맞물린다: requestedAmount가 문자 amount보다 우선.
  const sms = { accountNumber: "210-3391-5540-08", amount: "9,800,000" };
  assert.equal(recordTransferAndCompare("pa1", { ...sms, requestedAmount: "5,000,000" }, "5,000,000"), "equal", "R1 말한 금액");
  assert.equal(recordTransferAndCompare("pa2", sms, "100,000"), "less", "R2 문자 금액");
  assert.equal(recordTransferAndCompare("pa3", { accountNumber: "1" }, "100,000"), undefined, "R3");
  // 배선 — 페이지가 올린 대사 + 아직 올리지 않은 실시간 전사를 넘기고, 오버레이는 열 때마다 다시 잰다(링크 · 은행 앱 '송금' 두 길).
  // PR-B — 오버레이가 연 화면 id를 넘긴다(대출금 보관 이체 화면은 대사가 없으면 입금된 대출금).
  assert.ok(page.includes("demandAmountNow={(landingId) =>"));
  assert.ok(page.includes('...messages.filter((m) => m.role === "scammer").map((m) => m.text),'));
  assert.ok(page.includes('...transcriptRef.current.filter((t) => t.role === "scammer").map((t) => t.text),'));
  assert.ok(smsOverlay.includes("const spoken = demandAmountNow?.(sms.fakeLandingId);"));
  assert.ok(smsOverlay.includes("transfer && spoken ? { ...transfer, requestedAmount: spoken } : transfer;"));
  assert.ok(smsOverlay.includes("? { ...current, prefilledTransfer: withDemand(prefilledTransferOf(sms)) }"), "같은 문자 랜딩을 다시 열어도 요구액 갱신");
  assert.ok(smsOverlay.includes("...(spoken ? { requestedAmount: spoken } : {}),"), "은행 앱 '송금' 길");
  // G138 — 기록 콜백 인자는 그대로 비교 결과 하나(위 [B4]).
  assert.ok(!smsOverlay.includes("onLandingSubmitted(landing.smsId, amountComparison, "));
});

// ── ⭐ 2026-11-07(Edge 재시험 2 — 국세청 환급 고급) — 주겠다는 돈은 요구액이 아니다(판정표 D1 ~ D5 · `bankApp.ts` `lastDemandAmountIn`) ──

test("[재시험 2 D] 재현 — '미수령 환급금이 오만 원 정도 조회' 뒤 문자 수수료 99,000원을 그대로 보내면 같은 금액", () => {
  const spoken = latestDemandAmount([
    "안녕하세요, 국세청 환급 안내 담당입니다.",
    "고객님 앞으로 미수령 환급금이 오만 원 정도 조회되고 있습니다.",
    "문자로 보내 드린 링크에서 처리 수수료만 먼저 내시면 바로 환급됩니다.",
  ]);
  assert.equal(spoken, undefined, "D1 · D5 — 말한 요구액 없음");
  // 화면 비교: 말한 요구액이 없으면 문자 금액(미리 채운 값)이 요구액(종전 R2).
  const sms = { accountNumber: "318-0472-6619-05", amount: "99,000" };
  const transfer = spoken ? { ...sms, requestedAmount: spoken } : sms;
  assert.equal(recordTransferAndCompare("d-repro", transfer, "99,000"), "equal");
  // 수정 전 판정(가장 최근 금액 = 5만 원)이면 "more"였다 — 같은 대사의 금액 자체는 여전히 읽힌다.
  assert.equal(lastAmountIn("고객님 앞으로 미수령 환급금이 오만 원 정도 조회되고 있습니다."), "50,000");
});

test("[재시험 2 D] 판정표 D1 ~ D4 — 가장 가까운 열쇠말 · 문장 단위 · 종전 요구 문장은 그대로", () => {
  const cases: Array<[string, string | undefined, string]> = [
    ["처리 수수료 99,000원을 먼저 입금해 주셔야 환급금이 지급됩니다", "99,000", "D2 수수료"],
    ["수수료 9만 9천 원을 보내시면 환급금 5만 원을 돌려드립니다", "99,000", "뒤 금액은 D1 → 앞 금액 D2"],
    ["환급금 5만 원을 받으시려면 수수료 9만 9천 원을 먼저 보내셔야 합니다", "99,000", "D2 가장 가까운 말 = 수수료"],
    ["지원금 300만 원이 지급될 예정이에요", undefined, "D1"],
    ["대출 한도는 최대 3천만 원까지 조회됩니다", undefined, "D3 뒤쪽 조회"],
    ["보상금 120만 원을 돌려드릴게요. 다만 보증금 30만 원이 필요합니다", "300,000", "문장 단위"],
    ["환급 수수료 99,000원", "99,000", "같은 자리면 뒤에 끝나는 요구 말"],
    ["300만 원 필요해", "3,000,000", "D4 열쇠말 없음"],
    ["그중 구백팔십만 원을 먼저 옮기셔야 합니다", "9,800,000", "D3 뒤쪽 옮기"],
    ["들어온 대출금 980만 원 그대로 옮기시면 됩니다", "9,800,000", "대출금 = 열쇠말 아님 · 뒤쪽 옮기"],
  ];
  for (const [text, want, why] of cases) assert.equal(latestDemandAmount([text]), want, `${why}: ${text}`);
  // 최근 대사에 요구액이 없으면 그 앞 대사의 요구액(종전 R1 · A4).
  assert.equal(latestDemandAmount(["수수료 9만 9천 원 보내 주세요", "환급금은 5만 원이 조회됩니다"]), "99,000");
});

test("[재시험 2 D 드리프트] 요구액 판정 줄은 서버 linkMarker(메신저 칩 요구액)와 원문이 같다", () => {
  const server = read("functions/src/roleplay/linkMarker.ts");
  const client = read("src/lib/bankapp/bankApp.ts");
  for (const name of ["DEMAND_GIVE_WORDS", "DEMAND_ASK_WORDS"]) {
    const line = (src: string) => src.split("\n").find((l) => l.startsWith(`const ${name} =`));
    assert.ok(line(client), name);
    assert.equal(line(client), line(server), `${name} 서버와 같은 줄`);
  }
  const fn = (src: string) => {
    const at = src.indexOf("function lastDemandAmountIn(text: string): string | undefined {");
    return src.slice(at, src.indexOf("\n}\n", at));
  };
  assert.ok(fn(client).length > 300);
  assert.equal(fn(client), fn(server));
  assert.ok(server.includes("const own = lastDemandAmountIn(replyText);"), "M1도 같은 판정");
});
