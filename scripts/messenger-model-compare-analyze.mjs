#!/usr/bin/env node
// messenger-model-compare-probe.mjs 결과 집계 — 지연 p50/p95 · 오류 · 거절 · 인물 혼동 · 반복 · 실제 비용.
// node scripts/messenger-model-compare-analyze.mjs <out 폴더> [--dump <trickster 대화 md 경로>]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const dumpIdx = process.argv.indexOf("--dump");
const dumpPath = dumpIdx > 0 ? process.argv[dumpIdx + 1] : null;
const files = readdirSync(dir).filter((f) => /^[A-F]-.*\.json$/.test(f));
const runs = files.map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")));

const BUDGET_MS = 7000; // 운영 Gemini 단계 예산(llm/index.ts LLM_TIMEOUT_MS 10초 − GROQ_RESERVE_MS 3초)
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const bigrams = (s) => { const t = s.replace(/\s+/g, ""); const out = new Set(); for (let i = 0; i < t.length - 1; i += 1) out.add(t.slice(i, i + 2)); return out; };
const jaccard = (a, b) => { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n += 1; return n / (A.size + B.size - n); };

const rows = {};
for (const r of runs) {
  const row = (rows[r.letter] ??= { model: r.model, sessions: 0, sessionErrors: 0, calls: [], callErrors: 0, overloads: 0, scammerTurns: 0, unusable: 0, refusalStop: 0, joke: 0, tricksterSessions: 0, repeatPairs: 0, pairs: 0, chars: 0, usd: 0, ended: 0 });
  row.sessions += 1;
  if (r.error) row.sessionErrors += 1;
  if (r.ended) row.ended += 1;
  for (const e of r.events ?? []) {
    if (e.ev === "llmCall") { row.calls.push(e.ms); row.usd += e.usd; }
    if (e.ev === "callError") row.callErrors += 1;
    if (e.ev === "overload") row.overloads += 1;
  }
  const sc = (r.turns ?? []).filter((t) => t.role === "scammer");
  row.scammerTurns += sc.length;
  row.unusable += sc.filter((t) => t.unusable).length;
  row.refusalStop += sc.filter((t) => t.stopReason === "refusal").length;
  row.chars += sc.reduce((n, t) => n + (t.text?.length ?? 0), 0);
  for (let i = 1; i < sc.length; i += 1) { row.pairs += 1; if (jaccard(sc[i - 1].text ?? "", sc[i].text ?? "") > 0.5) row.repeatPairs += 1; }
  if (r.persona === "trickster" && sc.length > 0) {
    row.tricksterSessions += 1;
    // 사용자 3번째 발화("거의 김성섭이야") 뒤 사기범이 "성섭"을 부르거나 받아들이면 혼동으로 센다(자동 판정 — 수동 검토로 보강).
    const turns = r.turns;
    const jokeAt = turns.findIndex((t) => t.role === "user" && /김성섭/.test(t.text));
    if (jokeAt >= 0 && turns.slice(jokeAt + 1).some((t) => t.role === "scammer" && /성섭/.test(t.text ?? ""))) row.joke += 1;
  }
}

const table = Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
  id: k, model: v.model,
  sessions: `${v.sessions - v.sessionErrors}/${v.sessions}`,
  calls: v.calls.length,
  p50: pct(v.calls, 50), p95: pct(v.calls, 95), max: v.calls.length ? Math.max(...v.calls) : null,
  over7s: v.calls.filter((ms) => ms > BUDGET_MS).length,
  overload503: v.overloads, callErrors: v.callErrors,
  unusable: `${v.unusable}/${v.scammerTurns}`, refusalStop: v.refusalStop,
  joke: `${v.joke}/${v.tricksterSessions}`,
  repeat: v.pairs ? `${v.repeatPairs}/${v.pairs}` : "0/0",
  avgChars: v.scammerTurns ? Math.round(v.chars / v.scammerTurns) : null,
  ended: v.ended,
  usd: Number(v.usd.toFixed(4)),
}));
console.table(table);
console.log(JSON.stringify({ totalUsd: Number(table.reduce((n, r) => n + r.usd, 0).toFixed(4)) }));

if (dumpPath) {
  const lines = [];
  for (const r of runs.filter((x) => x.persona === "trickster").sort((a, b) => `${a.id}${a.rep}${a.letter}`.localeCompare(`${b.id}${b.rep}${b.letter}`))) {
    lines.push(`\n## ${r.letter} · ${r.id} · r${r.rep}${r.error ? ` · 오류: ${r.error}` : ""}`);
    for (const t of r.turns ?? []) lines.push(`- ${t.role === "user" ? "👤" : "🕵"} ${t.role === "scammer" ? `(${t.ms}ms${t.unusable ? ` ⚠${t.unusable}` : ""}) ` : ""}${(t.text ?? "").replace(/\n+/g, " / ")}`);
  }
  writeFileSync(dumpPath, lines.join("\n"), "utf8");
}
