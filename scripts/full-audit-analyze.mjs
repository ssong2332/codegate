#!/usr/bin/env node
// full-audit-probe.mjs 결과(JSON) → 결함 후보 표(판정표 docs/research/full-scenario-live-audit-2026-10.md §1.1의 "자동 후보 탐지" 열).
// ⛔ 후보일 뿐이다 — 보고서의 결함 판정은 발췌를 사람이 읽고 확정한다. API 호출 0.
// node scripts/full-audit-analyze.mjs <out-dir> [--md <파일>]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const mdIdx = process.argv.indexOf("--md");
const mdOut = mdIdx > 0 ? process.argv[mdIdx + 1] : undefined;

const DEMAND = /(이체|송금|입금|보내|넣어|옮겨|인출|현금|코인|가상\s?자산|인증\s?번호|비밀\s?번호|카드\s?번호|계좌|설치|링크|눌러|주민(등록)?\s?번호|생년월일|앱)/;
const NOT_CONFIRMED = /(확인이\s?안|안\s?들어|들어오지\s?않|확인되지\s?않|아직\s?입금|입금이\s?안|입금\s?확인이\s?안|조회가\s?안|확인이\s?되지)/;
const CLAIM = /보냈어요|보냈다니까요|찾아 놨어요|설치했어요|코인 사서/;
const INTERNAL = /\[\[|\]\]|\[훈련|훈련\s?종료\]|SIGNAL|시스템\s?프롬프트|turnInstruction|^\s*\(상대가|\(앱이|weakenedTactics|persona/i;
const FOREIGN = /[A-Za-z]{4,}|[぀-ヿ]|[一-鿿]|�/;
const PLACEHOLDER = /국민\s?안전\s?지원\s?센터|\{\{|XXX|○○○|OO기관|\bOO\b(?!은행|카드|캐피탈)/;
const GOODBYE = /(통화\s?종료|끊겠습니다|끊을게요|여기까지\s?하겠|그럼\s?이만|안녕히\s?계세요)/;
const REAL_NAMES = /(국민은행|신한|우리은행|하나은행|농협|기업은행|카카오뱅크|토스|케이뱅크|삼성카드|현대카드|롯데카드|비씨카드|BC카드|KB|NH|IBK|업비트|빗썸|코인원|우체국|국세청|경찰청|금융감독원|금감원|검찰청|서울중앙지검|관세청|국민건강보험공단|국민연금공단|한국은행|예금보험공사)/;
// 시나리오가 사칭하는 실존 기관(사칭 자체는 설계상 허용 — ⑨ 판정에서 뺀다)
const IMPERSONATED = {
  "institutional-impersonation": /경찰청|검찰청|서울중앙지검|금융감독원|금감원/,
  "tax-refund-scam": /국세청/,
  "courier-customs-scam": /관세청|우체국/,
  "asset-protection-notice-call": /금융감독원|금감원/,
  "prosecution-cooperation-call": /검찰청|서울중앙지검|검찰/,
};

function bigrams(s) { const t = s.replace(/\s/g, ""); const b = new Set(); for (let i = 0; i < t.length - 1; i++) b.add(t.slice(i, i + 2)); return b; }
function sim(a, b) { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.min(A.size, B.size); }

const rows = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("summary"))) {
  const r = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  if (!r.turns) continue;
  const sc = r.turns.filter((t) => t.role === "scammer" && t.n);
  const us = r.turns.filter((t) => t.role === "user");
  const flags = [];
  const ex = (t) => `#${t.n}: ${(t.text ?? "").replace(/\s+/g, " ").slice(0, 110)}`;
  if (r.error) flags.push({ d: "①", s: "상", x: `오류: ${String(r.error).slice(0, 100)}` });
  const closes = (r.events ?? []).filter((e) => e.ev === "close" && e.code && e.code !== 1000);
  if (closes.length) flags.push({ d: "①", s: "상", x: `연결 끊김 code=${closes[0].code} ${closes[0].reason ?? ""}` });
  if (r.persona === "comply" && !sc.slice(1).some((t) => DEMAND.test(t.text ?? ""))) flags.push({ d: "①", s: "상", x: "요구 미등장" });
  // ② 연속 유사
  let run = 1;
  for (let i = 1; i < sc.length; i++) {
    if (sim(sc[i].text ?? "", sc[i - 1].text ?? "") >= 0.6) { run++; if (run === 3) flags.push({ d: "②", s: "상", x: `연속 유사 3턴 ${ex(sc[i])}` }); } else run = 1;
  }
  // ③ 완료 주장 뒤 미확인 대사
  const claimIdx = r.turns.findIndex((t) => t.role === "user" && CLAIM.test(t.text ?? ""));
  if (claimIdx >= 0) {
    const after = r.turns.slice(claimIdx + 1).filter((t) => t.role === "scammer" && t.n);
    const nc = after.filter((t) => NOT_CONFIRMED.test(t.text ?? ""));
    if (nc.length) flags.push({ d: "③", s: nc.length >= 2 ? "상" : "중", x: `완료 주장 뒤 미확인 ${nc.length}턴 ${ex(nc[0])}` });
    const again = us.filter((u) => /방금 보냈다니까요/.test(u.text ?? "")).length;
    if (again >= 2) flags.push({ d: "②", s: "상", x: `이미 응한 이체 재요구 ${again}회` });
    else if (again === 1) flags.push({ d: "②", s: "중", x: "이미 응한 이체 재요구 1회" });
  }
  for (const t of sc) {
    const tx = t.text ?? "";
    if (INTERNAL.test(tx)) flags.push({ d: "⑥", s: "상", x: ex(t) });
    if (FOREIGN.test(tx.replace(/OO|SMS|ARS|OTP|URL|APP/g, ""))) flags.push({ d: "⑩", s: "중", x: ex(t) });
    if (PLACEHOLDER.test(tx)) flags.push({ d: "④", s: "중", x: ex(t) });
    const real = tx.match(REAL_NAMES);
    if (real && !(IMPERSONATED[r.id]?.test(real[0]))) flags.push({ d: "⑨", s: "중", x: `${real[0]} — ${ex(t)}` });
  }
  for (const e of (r.events ?? []).filter((e) => e.ev === "sms" && e.body)) if (PLACEHOLDER.test(e.body)) flags.push({ d: "④", s: "중", x: `문자 본문: ${e.body.replace(/\n/g, " / ").slice(0, 100)}` });
  // ⑤ 종료
  if (r.ended) {
    const endT = r.ended.userTurns;
    const reachedDemand = us.some((u) => CLAIM.test(u.text ?? "") && (u.n ?? 0) <= endT);
    if (r.persona === "comply" && !reachedDemand) flags.push({ d: "⑤", s: "상", x: `요구 완수 전 종료(사용자 ${endT}턴, ${r.ended.kind})` });
  }
  const bye = sc.filter((t) => GOODBYE.test(t.text ?? ""));
  if (bye.length && !r.ended) flags.push({ d: "⑤", s: "중", x: `도구 없이 작별/종료 말 ${ex(bye[0])}` });
  rows.push({ file: f, ch: r.ch, id: r.id, level: r.level, persona: r.persona, turns: sc.length, ended: r.ended ? `${r.ended.kind}@u${r.ended.userTurns}` : "", sms: (r.delivered ?? []).map((d) => d.smsId).join(","), flags });
}
rows.sort((a, b) => (a.ch + a.id + a.level + a.persona).localeCompare(b.ch + b.id + b.level + b.persona));
const lines = ["| 경로 | 시나리오 | 난이도 | 유형 | 사기범 턴 | 종료 | 문자 | 후보 |", "|---|---|---|---|---|---|---|---|"];
for (const r of rows) lines.push(`| ${r.ch} | ${r.id} | ${r.level} | ${r.persona} | ${r.turns} | ${r.ended} | ${r.sms} | ${r.flags.map((f) => `${f.d}${f.s} ${f.x.replace(/\|/g, "/")}`).join("<br>") || "—"} |`);
const md = lines.join("\n");
if (mdOut) writeFileSync(mdOut, md, "utf8");
console.log(md);
console.log(`\n세션 ${rows.length} · 후보 있는 세션 ${rows.filter((r) => r.flags.length).length}`);
