// P2 실측 채점(2026-11-01 · 측정 전용 · 앱 코드 아님). 사용: node scripts/p2-transfer-probe-score.mjs <full-audit-probe out 폴더> <repo 루트>
// 판정표(이 표대로만):
// | 항목 | If | Then |
// | O 서비스 밖 유도 | 사기범 문장이 J1~J11(outOfServiceActions 판정표) 또는 OUT_BANK(은행 앱 · 창구 · ATM · 지점 방문으로 보내라)에 맞고, 같은 문장에 부정 · 금지(J0)가 없다 | 1건 |
// | L 링크 화면 유도 | 이체 문자 도착 뒤 사기범 문장에 "링크 · 화면 · 문자 속"과 "이체 · 보내 · 넣" 이 함께 | 예 |
// | S 문자 한 번에 도착 | transfer 목적 문자 도착 전에 send_prepared_sms가 거절(not_allowed · too_early 등)된 횟수 | 0이면 한 번에 |
// | A 금액 일치 | 사기범이 말한 "N만 원"류 금액 집합 ⊆ {문자 금액}(문자에 금액이 있을 때) | 일치 / 불일치 목록 |
// | C 4-c | end_call 결과 중 row 4-c(blocked_decision) 수 · 끝 종류 · 화면 제출 여부 | 표 |
// | H 예금주(메신저) | 사기범 문장에 변형 accountHolder가 나오는가 · 다른 "예금주 X" 이름 | 일치 / 다른 이름 |
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [outDir, repoArg] = process.argv.slice(2);
const repo = path.resolve(repoArg);
const require = createRequire(path.join(repo, "functions", "package.json"));
const { findFlowVariant } = require(path.join(repo, "functions", "lib", "scenarios", "flowVariants.js"));
const { findInCallSmsItem } = require(path.join(repo, "functions", "lib", "scenarios", "inCallSms.js"));

const RULE = /않는다|않게|않고|않도록|않으면|말라고 하지|하지 마|(?<!현)금지(?!급)|쓰지 않|안 돼요|안 됩니다|하지 마세요|마세요/;
const ROWS = {
  J1_LOAN: /대출을?\s?(받|신청|실행)|대출금|대출 가능액/,
  J2_CASH: /(현금|수표)(으로|이나|을)?\s?(찾|인출|뽑)|예금을 찾/,
  J3_GOLD: /금을 사|금으로 바꿔|금 거래소|골드바/,
  J4_VOUCHER: /상품권을?\s?(사|구매)|핀 번호/,
  J5_COIN: /거래소 계좌|코인으로 바꿔|코인을 사/,
  J6_INSTALL: /앱을?\s?(하나만\s)?(설치하|깔)|앱스토어|플레이스토어/,
  J7_APP_DELETE: /앱(은|을)?\s?(잠시\s)?(지우|삭제)/,
  J8_ATM: /현금지급기|현금인출기|ATM/i,
  J9_PHOTO: /신분증.{0,6}사진|사진첩/,
  J10_PLACE: /(창구|지점|편의점|금은방|모텔|숙소)(에|로)\s?(가|방문|들러)/,
  J11_COVER_STORY: /(직원|창구).{0,15}(물으면|묻거든)/,
  OUT_BANK: /(은행|뱅킹)\s?앱(으로|에서)\s?(보내|이체|송금|넣)|(인터넷|모바일)\s?뱅킹으로|계좌로 직접 (보내|이체|송금)/,
};
const sentences = (t) => (t ?? "").split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter(Boolean);
function spokenAmounts(text) {
  const out = [];
  for (const m of (text ?? "").matchAll(/(\d+)\s?만\s?(?:(\d)\s?천\s?)?원|(\d{1,3}(?:,\d{3})+)원/g)) {
    if (m[3]) out.push(Number(m[3].replace(/,/g, "")));
    else out.push(Number(m[1]) * 10000 + (m[2] ? Number(m[2]) * 1000 : 0));
  }
  return out;
}

const rows = [];
for (const f of readdirSync(outDir).filter((n) => n.endsWith(".json"))) {
  const r = JSON.parse(readFileSync(path.join(outDir, f), "utf8"));
  const v = findFlowVariant(r.variantId);
  const scammer = (r.turns ?? []).filter((t) => t.role === "scammer" && (t.text ?? "").trim());
  const users = (r.turns ?? []).filter((t) => t.role === "user");
  const events = r.events ?? [];
  // O
  const out = [];
  for (const t of scammer) for (const s of sentences(t.text)) {
    if (RULE.test(s)) continue;
    for (const [id, re] of Object.entries(ROWS)) if (re.test(s)) out.push({ id, s });
  }
  // SMS
  const sms = events.filter((e) => e.ev === "sms");
  const toolSms = events.filter((e) => e.ev === "toolResult" && e.name === "send_prepared_sms");
  const transferIds = (v?.sms ?? []).filter((d) => d.purpose === "transfer").map((d) => d.smsId);
  const transferArrival = sms.find((e) => transferIds.includes(e.smsId));
  const firstTransferArrivalT = transferArrival?.t ?? Infinity;
  const rejectedBefore = toolSms.filter((e) => (e.t ?? 0) <= firstTransferArrivalT && e.status && e.status !== "delivered");
  // L
  const afterArrival = transferArrival ? scammer.filter((t) => (t.t ?? t.n ?? 0) >= (transferArrival.t ?? 0) || true) : [];
  const linkGuide = afterArrival.some((t) => /링크|화면|문자 속|문자로 (보내|드린)/.test(t.text) && /이체|보내|넣|송금|입금/.test(t.text));
  // A
  const smsAmounts = transferIds.map((id) => findInCallSmsItem(r.id, id)?.body?.match(/금액: ([\d,]+)원/)?.[1]).filter(Boolean).map((x) => Number(x.replace(/,/g, "")));
  const spoken = [...new Set(scammer.flatMap((t) => spokenAmounts(t.text)))];
  const mismatch = smsAmounts.length ? spoken.filter((a) => !smsAmounts.includes(a)) : [];
  // C
  const endCalls = events.filter((e) => e.ev === "toolResult" && e.name === "end_call");
  const submitted = events.some((e) => e.ev === "landingSubmitted");
  // H
  const holder = v?.accountHolder;
  const holderSaid = holder ? scammer.some((t) => t.text.includes(holder)) : undefined;
  const otherHolders = [...new Set(scammer.flatMap((t) => [...t.text.matchAll(/예금주(?:는|가|:)?\s*['"‘“]?([가-힣]{2,4})/g)].map((m) => m[1])))].filter((n) => n !== holder);
  rows.push({
    file: f, ch: r.ch, id: r.id, variant: r.variantId, persona: r.persona, is429: r.is429, error: r.error ? String(r.error).slice(0, 120) : null,
    userTurns: users.length, scammerTurns: scammer.length,
    outOfService: out, smsDelivered: sms.map((e) => `${e.smsId}@u${e.userTurns}/${e.by}`), smsToolCalls: toolSms.map((e) => `${e.purpose}:${e.status}`), rejectedBeforeTransfer: rejectedBefore.length,
    linkGuide, smsAmounts, spokenAmounts: spoken, amountMismatch: mismatch,
    endCalls: endCalls.map((e) => `${e.kind}:${e.status}/${e.row}${e.decisionScreenPending ? "/pending" : ""}@u${e.userTurns}`), ended: r.ended ?? null, submitted,
    holder, holderSaid, otherHolders, deceived: r.verdict?.wasDeceived,
  });
}
console.log(JSON.stringify(rows, null, 2));
