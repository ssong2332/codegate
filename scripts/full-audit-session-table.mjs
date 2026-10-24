#!/usr/bin/env node
// full-audit-probe.mjs 결과(JSON) → 세션별 회귀 표 + 대본 덤프(2026-10-24 회귀 프로브). API 호출 0.
// ⛔ 자동 열은 후보다 — 결함 판정은 대본을 사람이 읽고 확정한다(docs/research/regression-probe-2026-10-24.md).
// node scripts/full-audit-session-table.mjs <out-dir> [--md <표 파일>] [--dump <대본 파일>]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const opt = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };

const CLAIM = /보냈어요|보냈다니까요|찾아 놨어요|설치했어요|코인 사서|대출 받아 볼게요/;
const SMS_TALK = /문자/;
const SMS_SENT_CLAIM = /문자(?:로)?\s*(?:를\s*)?(?:보내\s*드렸|보내드렸|보냈|보내\s*드린|보내드린|보낸|발송(?:해\s*드렸|했|됐|한|된))|(?:보내\s*드린|보내드린|보낸|발송한|발송된)\s*(?:문자|링크|안내|주소)/;
const ENGLISH = /[A-Za-z]{4,}/;
const META = /훈련|시나리오|시스템|프롬프트|AI|인공지능|역할극|참가자|지시/;
const MARKER = /\[\[|\]\]|SIGNAL/; // ⟂는 프로브가 넣은 도구 경계 표식(앱 출력 아님)
const OO = /OO|○○/;
const REAL = /(국민은행|신한|우리은행|하나은행|농협|기업은행|카카오뱅크|토스|케이뱅크|삼성카드|현대카드|롯데카드|비씨카드|BC카드|KB|NH|IBK|업비트|빗썸|코인원|우체국|국세청|경찰청|금융감독원|금감원|검찰청|서울중앙지검|관세청|국민건강보험공단|국민연금공단|한국은행|예금보험공사|CJ대한통운|한진|롯데택배|쿠팡|카카오톡|카카오)/;
const DEMAND_CATS = [
  ["인증번호", /인증\s?번호/], ["송금", /(이체|송금|입금|보내\s?(줘|주|라)|옮겨)/], ["앱·링크", /(설치|앱|링크|눌러|접속)/],
  ["개인정보", /(주민|생년월일|성함|이름|주소|신분증)/], ["카드", /카드\s?번호|유효|CVC/i], ["현금", /현금|인출/], ["잔액", /잔액|얼마나\s?있|예금/],
];
function bigrams(s) { const t = s.replace(/\s/g, ""); const b = new Set(); for (let i = 0; i < t.length - 1; i++) b.add(t.slice(i, i + 2)); return b; }
function sim(a, b) { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.min(A.size, B.size); }
const cats = (t) => DEMAND_CATS.filter(([, re]) => re.test(t)).map(([c]) => c);
const clip = (s, n = 70) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

const rows = [], dumps = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const r = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  if (!r.turns) continue;
  const sc = r.turns.filter((t) => t.role === "scammer" && t.kind !== "interrupted" && (t.n || t.leg) && (t.text ?? "").trim());
  const us = r.turns.filter((t) => t.role === "user");
  // 같은 말 최장 연속(유사도 ≥ 0.6) · 같은 요구 범주 최장 연속
  let simRun = 1, simMax = 1, catRun = 0, catMax = 0, catMaxName = "", prevCats = [];
  sc.forEach((t, i) => {
    if (i > 0 && sim(t.text, sc[i - 1].text) >= 0.6) { simRun++; simMax = Math.max(simMax, simRun); } else simRun = 1;
    const c = cats(t.text);
    const shared = c.filter((x) => prevCats.includes(x));
    if (shared.length) { catRun++; if (catRun > catMax) { catMax = catRun; catMaxName = shared[0]; } } else catRun = c.length ? 1 : 0;
    if (catRun > catMax) { catMax = catRun; catMaxName = c[0] ?? ""; }
    prevCats = c;
  });
  // 문자: 도구 · 백스톱 · 마커, 말과 도구 순서, 도착 발화
  const smsEvents = (r.events ?? []).filter((e) => e.ev === "sms");
  const smsCells = smsEvents.map((e) => {
    const tc = (r.events ?? []).filter((x) => x.ev === "toolCall" && x.calls?.some((c) => c.name === "send_prepared_sms") && (x.leg ?? "") === (e.leg ?? "") && x.t <= e.t).pop();
    let order = e.by;
    if (e.by === "model" && tc) {
      const prevClaim = r.turns.filter((t) => t.role === "scammer" && (t.leg ?? "") === (e.leg ?? "") && (t.n ?? 0) <= tc.scammerTurns).some((t) => SMS_SENT_CLAIM.test(t.text ?? ""));
      order = SMS_SENT_CLAIM.test(tc.preToolText ?? "") ? "도구(같은 턴 말 먼저)" : prevClaim ? "도구(앞 턴에 '보냈다' 말 먼저)" : SMS_TALK.test(tc.preToolText ?? "") ? "도구(예고 뒤)" : "도구 먼저";
    }
    const at = e.userTurns ?? (r.delivered ?? []).find((d) => d.smsId === e.smsId)?.userTurnsAtArrival;
    return `${e.smsId}@u${at ?? "?"}·${order}`;
  });
  const endRow = (r.events ?? []).filter((e) => (e.ev === "toolResult" && e.name === "end_call") || (e.ev === "hangup")).map((e) => (e.ev === "hangup" ? (e.end ? `post${e.postRow}` : null) : `${e.status}/${e.row}`)).filter(Boolean);
  const endAccepted = endRow.find((x) => /^accepted|^post/.test(x)) ?? (endRow.length ? `거절만(${[...new Set(endRow)].join(",")})` : "—");
  const lastSc = sc.at(-1);
  const anomalies = [];
  for (const t of sc) {
    const tx = t.text;
    if (ENGLISH.test(tx.replace(/OO|SMS|ARS|OTP|URL|APP|KakaoTalk/g, ""))) anomalies.push(`영어 #${t.n}: ${clip(tx, 60)}`);
    if (MARKER.test(tx)) anomalies.push(`마커 #${t.n}: ${clip(tx, 60)}`);
    if (META.test(tx)) anomalies.push(`메타? #${t.n}: ${clip(tx, 60)}`);
    if (OO.test(tx)) anomalies.push(`OO #${t.n}: ${clip(tx, 60)}`);
    const m = tx.match(REAL); if (m) anomalies.push(`실존명(${m[0]}) #${t.n}`);
  }
  if (sc.length && !(r.turns.find((t) => t.role === "scammer")?.text ?? "").trim()) anomalies.push("첫 대사 빈 문자열");
  const claimTurn = us.find((u) => CLAIM.test(u.text ?? ""))?.n;
  const verdict = r.verdict ? (r.verdict.wasDeceived ? "속음" : "안 속음") : `오류 ${r.verdictError ?? ""}`;
  const expected = r.persona === "refuse" ? "안 속음" : "속음";
  rows.push({
    f, ch: r.ch, id: r.id, level: r.level, persona: r.persona,
    route: r.route ? `${r.route.flowVariantId}·${r.route.routeKey}` : "—",
    sc: sc.length, claim: claimTurn ? `u${claimTurn}` : "—",
    ended: r.ended ? `${r.ended.kind}@u${r.ended.userTurns}${r.ended.leg ? "(통화)" : ""}` : "끊김 없음(상한)",
    endRow: endAccepted, lastLine: clip(lastSc?.text, 50),
    sms: smsCells.join("<br>") || "—", simMax, catMax: catMax > 1 ? `${catMax}(${catMaxName})` : catMax,
    verdict: `${verdict}${verdict === expected ? "" : " ⚠️"}`,
    escalated: r.escalated ? `u${r.escalated.userTurns}` : "",
    servedBy: [...new Set((r.events ?? []).filter((e) => e.ev === "llmCall").map((e) => e.servedBy))].join(","),
    anomalies, error: r.error ? clip(r.error, 80) : "",
  });
  const lines = [`## ${r.ch} · ${r.id} · ${r.level} · ${r.persona} · ${r.route?.routeKey ?? ""} (${f})`, `판정 ${verdict} · 종료 ${r.ended ? JSON.stringify(r.ended) : "없음"} · 문자 ${smsCells.join(", ") || "없음"}`];
  for (const t of r.turns) {
    if (t.role === "system" && !["opening", "sms_ctx", "verify_reconnect"].includes(t.kind)) { lines.push(`  · [${t.kind}]`); continue; }
    if (t.role === "system") { lines.push(`  · [${t.kind}] ${clip(t.text, 80)}`); continue; }
    lines.push(`${t.leg ? "☎" : ""}${t.role === "scammer" ? "S" : "U"}${t.n ?? ""}${t.cause && t.cause !== "user" ? `{${t.cause}}` : ""}${t.kind === "interrupted" ? "(끊김)" : ""}: ${(t.text ?? "").replace(/\s+/g, " ").trim()}`);
  }
  for (const e of (r.events ?? []).filter((e) => ["sms", "toolResult", "escalate", "signalDropped", "repeatBreak", "wrapUp", "otpCheck", "landingSubmitted"].includes(e.ev))) {
    if (e.ev === "toolResult" && e.status === "already_accepted") continue;
    lines.push(`  ⓔ ${e.leg ? "☎" : ""}${e.ev} ${JSON.stringify({ ...e, ev: undefined, t: undefined, leg: undefined, body: e.body ? clip(e.body, 90) : undefined })}`);
  }
  dumps.push(lines.join("\n"));
}
const head = "| 경로 | 시나리오 | 난이도 | 유형 | 루트 | 사기범 턴 | 이행 주장 | 종료 | 끊기 판정 | 마지막 대사 | 문자(도착·순서) | 같은 말 최장 | 같은 요구 최장 | 리포트 | 전환 | 응답 공급자 | 이상 출력 후보 |";
const md = [head, "|" + "---|".repeat(17)].concat(rows.map((r) => `| ${r.ch} | ${r.id} | ${r.level} | ${r.persona} | ${r.route} | ${r.sc} | ${r.claim} | ${r.ended} | ${r.endRow} | ${r.lastLine.replace(/\|/g, "/")} | ${r.sms} | ${r.simMax} | ${r.catMax} | ${r.verdict} | ${r.escalated} | ${r.servedBy} | ${(r.anomalies.join("<br>") + (r.error ? `<br>오류 ${r.error}` : "")).replace(/\|/g, "/") || "—"} |`)).join("\n");
if (opt("--md")) writeFileSync(opt("--md"), md, "utf8");
if (opt("--dump")) writeFileSync(opt("--dump"), dumps.join("\n\n"), "utf8");
console.log(md);
console.log(`\n세션 ${rows.length}`);
