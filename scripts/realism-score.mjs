#!/usr/bin/env node
// 체험 품질 채점기(W0 · 2026-11-27 · docs/research/realism-criteria-2026-11-27.md 4절 채점표 Q1~Q10).
// ⛔ 실 키 0 · 과금 0 — `full-audit-probe.mjs`가 남긴 out 폴더(turns · events)만 읽는다. 제품 코드 수정 0.
// ⛔ 기존 판정은 새로 베끼지 않는다: 요구액 `demandAmountFrom` · 반복 `repeatBreak` · 메타 `replyUsability`/`thoughtLeak`는 빌드된 functions/lib에서 import하고,
//    서비스 밖 유도 판정표(J-표)는 `outOfServiceActions.test.ts`의 `JUDGEMENT_TABLE` 소스를 읽어 그대로 쓴다. 수정 전 lib(--fn-root)로도 돈다.
// 자동 채점 = Q1 · Q2 · Q3 · Q4 · Q6 · Q8 · Q10(14점). Q5 · Q7 · Q9는 수동 칸(--manual <json>으로 채우면 합산).
//
// node scripts/realism-score.mjs <프로브 out 폴더> [--md <파일>] [--fn-root <functions 폴더>] [--manual <json>]
//   --manual json = { "<결과 파일명>": { "Q5": 0|1|2, "Q7": 0|2, "Q9": 0|1|2 } }
//
// 합격선(사용자 결정 4): ★(Q2 · Q3 · Q8 · Q10) 0점 없음 ∧ 합계 16/20 이상. 수동 칸이 비면 자동 점수를 14점 만점으로 비례(16/20 → 12/14) — 수동 입력 뒤 정식 판정.
// 답답함(Q3 + Q4 + Q5 ≤ 4): Q5가 없으면 Q5를 만점(2)으로 가정해도 ≤ 4인 경우(Q3 + Q4 ≤ 2)만 '후보' 표시(합격 판정에는 영향 없음).
import { createRequire } from "node:module";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

export const STAR = ["Q2", "Q3", "Q8", "Q10"];
export const AUTO = ["Q1", "Q2", "Q3", "Q4", "Q6", "Q8", "Q10"];
export const MANUAL = ["Q5", "Q7", "Q9"];
export const PASS_TOTAL = 16; // /20
/** 판정표 '따르는 참가자'(끝까지 가야 하는 유형). 거절 · 적대 · 사실형은 Q3 해당 없음. */
export const FOLLOWING = ["comply", "allIn", "asker", "suspicious", "truthful", "verbal", "verbalInstall", "verbalTransfer"];

// ── lib 로드(기존 판정 재사용) ───────────────────────────────────────────────────────────────────
export function loadLib(fnRoot = path.join(repoRoot, "functions")) {
  const require = createRequire(path.join(fnRoot, "package.json"));
  const L = (p) => require(path.join(fnRoot, "lib", p));
  const { demandAmountFrom } = L("roleplay/linkMarker.js");
  const repeat = L("roleplay/repeatBreak.js");
  const usability = L("llm/replyUsability.js");
  const { hasThoughtMarker } = L("realtime/thoughtLeak.js");
  return { demandAmountFrom, repeat, usability, hasThoughtMarker, outOfService: loadOutOfServiceRows(fnRoot) };
}

/** 서비스 밖 유도 장부의 판정표(J-표)를 소스 그대로 읽는다(시험 파일이라 import하면 시험이 돈다). 패턴 있는 행만. */
export function loadOutOfServiceRows(fnRoot) {
  const src = readFileSync(path.join(fnRoot, "src/roleplay/__tests__/outOfServiceActions.test.ts"), "utf8");
  const start = src.indexOf("export const JUDGEMENT_TABLE");
  const open = src.indexOf("= [", start) + 2;
  const close = src.indexOf("\n];", open);
  if (start < 0 || open < 2 || close < 0) throw new Error("JUDGEMENT_TABLE를 소스에서 못 찾음 — 장부 파일 구조가 바뀌었다");
  const rows = new Function(`return ${src.slice(open, close + 2)}`)();
  return {
    rule: rows.find((r) => r.id === "J0_RULE").pattern,
    label: rows.find((r) => r.id === "J0_LABEL").pattern,
    counted: rows.filter((r) => r.pattern && !/^J0_/.test(r.id)),
  };
}

// ── 입력 정리 ───────────────────────────────────────────────────────────────────────────────────
const digits = (s) => String(s ?? "").replace(/\D/g, "");
const clean = (s) => String(s ?? "").replace(/⟂/g, " ").replace(/\s+/g, " ").trim();
const scammerTurns = (r) => (r.turns ?? []).filter((t) => t.role === "scammer" && t.kind !== "interrupted" && clean(t.text)).map((t) => ({ ...t, text: clean(t.text), _i: (r.turns ?? []).indexOf(t) }));
const sentences = (text) => text.split(/(?<=[.?!…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const amountOfSms = (e) => {
  const raw = e.transferAmount ?? /금액:\s*([\d,]+)\s*원/.exec(e.body ?? "")?.[1];
  const d = digits(raw);
  return d ? String(Number(d)) : undefined;
};
const turnIndexOf = (e, r) => (typeof e.turnIdx === "number" ? e.turnIdx : (r.turns ?? []).length); // 부재 = 끝(앞 문장만 못 가른다)

/** Q10 — 하지 말라는 쪽 말("창구 방문 없이" · "가실 필요는 없으세요" · "안 가셔도"). 같은 문장에 이 어형이 있으면 유도로 세지 않는다(표기만 봄 — 한 문장에 유도와 부정이 같이 있으면 놓친다). */
export const NEGATED_FORM = /없이|필요\s?(?:는|도)?\s?없|안\s?(?:가|하|해)(?:도|셔도)|(?:가|하|해)시지\s?않/;
const NUMBER_EXPLAIN = /(?:다른|별도|따로|새|바꾼|지정)\s*(?:전화\s*)?번호|번호(?:가|로)\s*(?:다르|바뀌)|번호로\s*(?:문자|메시지|보내\s*드|보냈|발송)/;

// ── 규칙(Q별 · 시험이 이 객체를 일부러 깨 본다) ──────────────────────────────────────────────────
export const RULES = {
  /** Q1 번호 일관 — 통화 번호 = 문자 발신 번호, 또는 다르고 설명 대사 있음. 문자 없음 · 번호 미기록 = 해당 없음(2). */
  Q1(r) {
    const smses = (r.events ?? []).filter((e) => e.ev === "sms");
    if (smses.length === 0) return { score: 2, note: "문자 없음(해당 없음)" };
    if (!r.callNumber) return { score: 2, note: "통화 번호 미기록(해당 없음 — 프로브 구판)" };
    const call = digits(r.callNumber);
    const sc = scammerTurns(r);
    for (const e of smses) {
      const sender = e.senderNumber ?? String(e.senderLabel ?? "").split(" (")[0];
      if (!sender) continue;
      if (call.length >= 7 && call === digits(sender)) continue;
      const after = sc.filter((t) => typeof e.turnIdx !== "number" || t._i >= e.turnIdx - 1);
      if (after.some((t) => NUMBER_EXPLAIN.test(t.text))) continue;
      return { score: 0, note: `통화 ${r.callNumber} ≠ 문자 ${sender}(${e.smsId}) · 설명 대사 없음` };
    }
    return { score: 2, note: "일치 또는 설명 있음" };
  },

  /**
   * Q2 ★ 금액 일치 — 사기범이 말한 요구액(`demandAmountFrom`)이 문자 · 화면 금액과 모두 같다.
   * 판정 이유(경계): 참가자가 말한 큰 금액("삼천만 원 있어요")을 사기범이 요구액으로 받아 "전부 이체"라 해도 문자 금액과 다르면 불일치(0점)다 — 요구액은 한 번 정해지면 바뀌지 않아야 한다(판정표 T6 · M2).
   */
  Q2(r, lib) {
    const smsAmounts = new Set((r.events ?? []).filter((e) => e.ev === "sms").map(amountOfSms).filter(Boolean));
    const screenDemands = new Set((r.events ?? []).filter((e) => e.ev === "landingSubmitted" && e.demand).map((e) => String(Number(digits(e.demand)))));
    if (smsAmounts.size === 0) return { score: 2, note: "금액 든 문자 없음(해당 없음)" };
    const spoken = new Set(scammerTurns(r).map((t) => lib.demandAmountFrom(t.text, [])).filter(Boolean).map((a) => String(Number(digits(a)))));
    const wrong = [...spoken].filter((a) => !smsAmounts.has(a));
    const wrongScreen = [...screenDemands].filter((a) => !smsAmounts.has(a));
    if (wrong.length || wrongScreen.length) return { score: 0, note: `말한 ${[...spoken].join("/") || "-"} · 화면 ${[...screenDemands].join("/") || "-"} ≠ 문자 ${[...smsAmounts].join("/")}` };
    return { score: 2, note: spoken.size ? `말한 금액 = 문자 금액(${[...smsAmounts].join("/")})` : `말한 금액 없음 · 문자 ${[...smsAmounts].join("/")}` };
  },

  /** Q3 ★ 막다른 길 없음 — 따르는 참가자가 끝(goal)까지 간다 · 모자라게 보낸(또는 막힌) 뒤 재촉 횟수. */
  Q3(r, lib) {
    if (!FOLLOWING.includes(r.persona)) return { score: 2, note: `${r.persona} — 따르는 참가자 아님(해당 없음)` };
    const events = r.events ?? [];
    const endedGoal = events.some((e) => e.ev === "ended_by_end_call" && e.kind === "goal") || r.ended?.kind === "goal" || r.liveLeg?.ended?.kind === "goal";
    const short = events.find((e) => (e.ev === "landingSubmitted" && e.comparison === "less") || e.ev === "submitBlocked");
    const sc = scammerTurns(r);
    const after = short ? sc.filter((t) => t._i >= turnIndexOf(short, r)) : [];
    const nudges = after.filter((t) => lib.repeat.isTransferDemand(t.text) || /마저|모자|나머지|적게\s*(?:들어|보내)/.test(t.text)).length;
    const note = `goal ${endedGoal ? "도달" : "미도달"} · 부족 뒤 재촉 ${nudges}회${short ? "" : "(부족 제출 없음)"}`;
    if (!endedGoal) return { score: 0, note };
    return { score: nudges <= 1 ? 2 : nudges === 2 ? 1 : 0, note };
  },

  /** Q4 반복 없음 — 같은 요구 범주(송금 · 신원 · 링크 · 설치 · 인증번호 · 비슷한 문장)의 최장 연속 대답 수. */
  Q4(r, lib) {
    const sc = scammerTurns(r).map((t) => t.text);
    const cats = (text) => {
      const out = new Set();
      if (lib.repeat.isTransferDemand(text)) out.add("transfer");
      for (const item of lib.repeat.requestedIdentityItems(text)) out.add(`id:${item}`);
      // T4 넓힘(링크 · 설치 · 인증번호) — 기존 2-c에 없는 범주라 이 채점기에서만 본다.
      if (/(?:링크|주소).{0,12}(?:눌러|접속|들어가|클릭)/.test(text)) out.add("link");
      if (/(?:설치|다운로드)\s*(?:해|하|를|부터)/.test(text)) out.add("install");
      if (/인증\s?번호.{0,14}(?:불러|말씀|알려|읽어)/.test(text)) out.add("otp");
      return out;
    };
    let best = sc.length ? 1 : 0;
    let run = 1;
    let runCats = sc.length ? cats(sc[0]) : new Set();
    for (let i = 1; i < sc.length; i += 1) {
      const c = cats(sc[i]);
      const shared = [...c].filter((x) => runCats.has(x));
      const similar = lib.repeat.bigramSimilarity(sc[i - 1], sc[i]) >= lib.repeat.REPEAT_SIMILARITY_THRESHOLD;
      if (shared.length || similar) {
        run += 1;
        runCats = shared.length ? new Set(shared) : c;
      } else {
        run = 1;
        runCats = c;
      }
      best = Math.max(best, run);
    }
    return { score: best <= 2 ? 2 : best === 3 ? 1 : 0, note: `같은 범주 최장 연속 ${best}대답` };
  },

  /** Q6 말투 유지 — 사기범 대사의 존댓말 · 반말이 한 턴 안에서 섞이거나 통화 다수 말투와 다른 턴 수(어미 정규식 · 대략). */
  Q6(r) {
    const FORMAL = /(?:요|니다|니까|습니까|세요|죠|까요)[\s.?!…~]*$/;
    const INFORMAL = /(?:야|어|아|지|다|해|래|냐|니|자|라|거든|잖아|네)[\s.?!…~]*$/;
    const toneOf = (s) => (s.length < 4 ? undefined : FORMAL.test(s) ? "formal" : INFORMAL.test(s) ? "informal" : undefined);
    const perTurn = scammerTurns(r).map((t) => sentences(t.text).map(toneOf).filter(Boolean));
    const all = perTurn.flat();
    if (all.length === 0) return { score: 2, note: "말투 판정 문장 없음" };
    const main = all.filter((x) => x === "formal").length >= all.length / 2 ? "formal" : "informal";
    const bad = perTurn.filter((tones) => tones.length && (new Set(tones).size > 1 || tones[0] !== main)).length;
    return { score: bad === 0 ? 2 : bad === 1 ? 1 : 0, note: `다수 말투 ${main === "formal" ? "존댓말" : "반말"} · 이탈 ${bad}턴(대략)` };
  },

  /** Q8 ★ 메타 노출 없음 — 훈련 · 모델 · 지시문 · 사고 문장 노출. 기존 가드 정규식 그대로. */
  Q8(r, lib) {
    const pats = [...lib.usability.TRAINING_META_PATTERNS, ...lib.usability.KOREAN_AI_REFUSAL_PATTERNS, /\[\[|\]\]|turnInstruction|시스템\s?프롬프트/];
    const hits = scammerTurns(r).filter((t) => lib.hasThoughtMarker(t.text) || pats.some((p) => p.test(t.text)));
    return hits.length ? { score: 0, note: `${hits.length}턴 노출: ${hits[0].text.slice(0, 50)}` } : { score: 2, note: "노출 0" };
  },

  /** Q10 ★ 서비스 밖 유도 없음 — 장부 J-표를 사기범 문장에 적용(앱 안 대출 · 금 · 출금 예약 화면이 열린 세션은 그 행 제외). */
  Q10(r, lib) {
    const landings = (r.events ?? []).map((e) => String(e.landingId ?? "")).join(" ");
    // 앱 안 설치 화면(`*install*` 랜딩)이 열린 세션의 '앱 설치' 언급은 서비스 안 안내다(J6 제외).
    const skip = new Set([/loan/.test(landings) && "J1_LOAN", /gold/.test(landings) && "J3_GOLD", /cash/.test(landings) && "J2_CASH", /install/.test(landings) && "J6_INSTALL"].filter(Boolean));
    const o = lib.outOfService;
    const hits = [];
    for (const t of scammerTurns(r)) {
      for (const s of sentences(t.text)) {
        if (o.rule.test(s) || o.label.test(s) || NEGATED_FORM.test(s)) continue; // 부정 어형("방문 없이" · "가실 필요는 없으세요")은 유도가 아니다
        const row = o.counted.find((x) => !skip.has(x.id) && x.pattern.test(s));
        if (row) hits.push({ row: row.id, s });
      }
    }
    return hits.length ? { score: 0, note: `${hits.length}건 ${hits[0].row}: ${hits[0].s.slice(0, 40)}` } : { score: 2, note: "0건" };
  },
};

// ── 한 판 · 폴더 채점 ───────────────────────────────────────────────────────────────────────────
export function scoreSession(r, lib, manual = {}, rules = RULES) {
  const q = {};
  for (const id of AUTO) q[id] = rules[id](r, lib);
  for (const id of MANUAL) q[id] = manual[id] === undefined ? { score: null, note: "수동" } : { score: manual[id], note: "수동 입력" };
  const auto = AUTO.reduce((s, id) => s + q[id].score, 0);
  const manualDone = MANUAL.every((id) => q[id].score !== null);
  const total = manualDone ? auto + MANUAL.reduce((s, id) => s + q[id].score, 0) : null;
  const starZero = STAR.filter((id) => q[id].score === 0);
  const passTotal = manualDone ? total >= PASS_TOTAL : auto >= Math.ceil((PASS_TOTAL / 20) * 14);
  const q5 = q.Q5.score;
  const frustration = q5 === null ? q.Q3.score + q.Q4.score + 2 <= 4 : q.Q3.score + q.Q4.score + q5 <= 4;
  return { q, auto, total, manualDone, starZero, pass: starZero.length === 0 && passTotal, frustration, frustrationNote: q5 === null ? "후보(Q5 미채점)" : "확정" };
}

export function scoreDir(dir, lib, manual = {}, rules = RULES) {
  const rows = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("summary")).sort()) {
    const r = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    if (!r.turns) continue;
    rows.push({ file: f, ch: r.ch, id: r.id, level: r.level, persona: r.persona, variantId: r.variantId ?? "-", error: r.error, ...scoreSession(r, lib, manual[f] ?? {}, rules) });
  }
  const byVariant = new Map();
  for (const row of rows) {
    const key = `${row.id}/${row.variantId}`;
    const v = byVariant.get(key) ?? { key, sessions: 0, passed: 0 };
    v.sessions += 1;
    v.passed += row.pass ? 1 : 0;
    byVariant.set(key, v);
  }
  return { rows, variants: [...byVariant.values()].map((v) => ({ ...v, pass: v.passed === v.sessions })) };
}

export function renderMarkdown(result, dir) {
  const cell = (x) => (x.score === null ? "수동" : String(x.score));
  const lines = [`# 체험 품질 채점 — ${path.basename(dir)}`, "", `판 ${result.rows.length}개 · 합격선 = ★(${STAR.join("·")}) 0점 없음 + ${PASS_TOTAL}/20. 수동 칸(Q5·Q7·Q9)이 비면 자동 14점을 12점(=16/20 비례)으로 판정한다.`, ""];
  lines.push("## 판별 점수표", "", "| 판 | 참가자 | " + [...AUTO, ...MANUAL].map((x) => (STAR.includes(x) ? `${x}★` : x)).join(" | ") + " | 자동 | 합계 | 판정 | 답답함 |", "|" + "---|".repeat(AUTO.length + MANUAL.length + 6));
  for (const r of result.rows) {
    lines.push(`| ${r.file.replace(/\.json$/, "").slice(0, 60)} | ${r.persona} | ${[...AUTO, ...MANUAL].map((x) => cell(r.q[x])).join(" | ")} | ${r.auto}/14 | ${r.total ?? "-"} | ${r.pass ? "합격" : `불합격${r.starZero.length ? `(★ ${r.starZero.join("·")} 0)` : ""}`} | ${r.frustration ? `⚠ ${r.frustrationNote}` : ""} |`);
  }
  lines.push("", "## 변형별 합격(채점한 판이 모두 합격이어야 합격)", "", "| 시나리오/변형 | 판 수 | 합격 | 변형 판정 |", "|---|---|---|---|");
  for (const v of result.variants) lines.push(`| ${v.key} | ${v.sessions} | ${v.passed} | ${v.pass ? "합격" : "수정 대상"} |`);
  lines.push("", "## 항목별 근거(0점 · 1점만)", "");
  for (const r of result.rows) for (const id of AUTO) if (r.q[id].score !== 2) lines.push(`- ${r.file.replace(/\.json$/, "").slice(0, 60)} · ${id}=${r.q[id].score}: ${r.q[id].note}`);
  const frus = result.rows.filter((r) => r.frustration);
  lines.push("", `## 답답함 표시 ${frus.length}판`, "", ...(frus.length ? frus.map((r) => `- ${r.file.replace(/\.json$/, "").slice(0, 60)} (${r.frustrationNote}) — 원문 검토`) : ["- 없음"]));
  lines.push("", "⚠️ 한계: 표기를 본다(의미 아님) — Q4 범주 · Q6 어미는 대략, Q10은 앱 안 대출 · 금 · 출금 화면이 열린 세션의 그 행을 뺀다. Q2는 사기범이 말한 요구액 전부를 문자 금액과 대조하므로 한 통화에 금액이 둘 이상이면 오탐 가능 — 0점 판은 원문을 읽고 확정한다.");
  return lines.join("\n");
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const dir = args.find((a, i) => !a.startsWith("--") && !["--md", "--fn-root", "--manual"].includes(args[i - 1]));
  if (!dir) { console.error("사용: node scripts/realism-score.mjs <프로브 out 폴더> [--md 파일] [--fn-root functions] [--manual json]"); process.exit(2); }
  const lib = loadLib(val("--fn-root") ? path.resolve(val("--fn-root")) : undefined);
  const manual = val("--manual") ? JSON.parse(readFileSync(val("--manual"), "utf8")) : {};
  const result = scoreDir(path.resolve(dir), lib, manual);
  const md = renderMarkdown(result, dir);
  if (val("--md")) writeFileSync(val("--md"), md, "utf8");
  else console.log(md);
  console.error(`판 ${result.rows.length} · 합격 ${result.rows.filter((r) => r.pass).length} · 답답함 ${result.rows.filter((r) => r.frustration).length}`);
}
