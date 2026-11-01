// #460 U2 · U3 · U7 실측 채점(2026-11-01 · 측정 전용 · 앱 코드 아님). 사용: node scripts/u2u3u7-probe-score.mjs <full-audit-probe out 폴더> <repo 루트>
// 대상 = 카드사 고급 fv-x7ue · fv-w3dq 통화(Live) 세션. 판정표(이 표대로만):
// | 항목 | If | Then |
// |---|---|---|
// | A 설치 요구 선행(U2) | 설치 문자(card-guard-app-link) 도착 **전** 사기범 말(완료 턴 + 도구 호출 앞 말)에 설치 요구(/설치/ ∧ /해\s?주|하셔|하시|받으|깔/) | 위반(횟수) |
// | B 문자 링크 안내(U2) | 도착 뒤 사기범 말에 (문자|링크) ∧ 설치 | 예 / 아니오 |
// | C 말로만 설치 되돌림(U2 · verbalInstall) | 도착 뒤 참가자가 "설치했" → 바로 다음 사기범 말이 ACCEPT(완료 · 확인 단정)면 넘어감, 아니면 (권한 허용|링크|화면|문자|어디까지)면 되돌림 | 되돌림 / 넘어감 |
// | D 응낙 없이 진행(U2 · verbalInstall) | 설치 문자 도착 뒤(응낙 주입 0) 사기범 말이 ACCEPT이거나 다음 요구(카드번호 · 이관 · 이체)를 꺼낸 첫 턴 · 이관 문자 도착 여부 | 진행 T# / 없음 |
// | E 응낙 반영(U2 · comply) | installConsented 주입 뒤 다음 사기범 말에 (설치|권한|완료|확인|됐) | 반영 / 미반영 |
// | F 자리표시 · 앱 이름(U7) | 사기범 말의 /[○OＯ]{2}/ 수 · /안심보안/ 수 · "피해 차단용 보안 앱" 수 | 0 이어야 통과(앞 둘) |
// | G 은행 묶음(U3) | 세션 은행명 = 미르은행 ∧ 이관 문자 본문에 "미르은행" ∧ 예금주 오현수 · 사기범 말에 다른 가상 은행명 · 다른 예금주 | 일치 / 어긋남 목록 |
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [outDir, repoArg] = process.argv.slice(2);
const repo = path.resolve(repoArg ?? ".");
const require = createRequire(path.join(repo, "functions", "package.json"));
const { FICTIONAL_BANK_NAMES } = require(path.join(repo, "functions", "lib", "shared", "fictionalBank.js"));

const GUARD = "card-guard-app-link";
const RELIEF = "card-relief-account";
const INSTALL_DEMAND = (t) => /설치/.test(t) && /해\s?주|하셔|하시|받으|깔|진행/.test(t);
// 완료 **단정**만(조건형 "완료되셨다면" · 신원 확인 "확인되었습니다"는 아니다).
const ACCEPT = /(?:보안|설치|조치|적용|권한)[^.?!]{0,12}(?:완료|마무리)(?:되었습니다|됐습니다|되었고|됐고|되셨습니다|된 것 확인)/;
const NEXT_DEMAND = /카드\s?번호|유효\s?기간|이관|이체|옮기|234만|이백삼십사/;
const clip =(t, n = 90) => (t ?? "").replace(/\s+/g, " ").slice(0, n);

function arrival(session, smsId) {
  const evIdx = session.events.findIndex((e) => e.ev === "sms" && e.smsId === smsId);
  if (evIdx < 0) return null;
  const ev = session.events[evIdx];
  if (typeof ev.scammerTurns === "number") return { by: ev.by, scammerTurns: ev.scammerTurns, preToolText: ev.by === "model" ? toolPre(session, evIdx) : "" };
  if (ev.by === "model") {
    const call = [...session.events.slice(0, evIdx)].reverse().find((e) => e.ev === "toolCall");
    return { by: "model", scammerTurns: call?.scammerTurns ?? 0, preToolText: call?.preToolText ?? "" };
  }
  // 백스톱 — 대화 기록의 sms_ctx 위치(같은 문자 순서대로 n번째)에서 그때까지 끝난 사기범 턴 수.
  const nth = session.events.filter((e, i) => i <= evIdx && e.ev === "sms" && e.by === "backstop").length;
  let seen = 0, last = 0;
  for (const t of session.turns) {
    if (t.role === "scammer" && t.n) last = t.n;
    if (t.kind === "sms_ctx" && ++seen === nth) return { by: "backstop", scammerTurns: last, preToolText: "" };
  }
  return { by: "backstop", scammerTurns: last, preToolText: "" };
}
function toolPre(session, evIdx) {
  return [...session.events.slice(0, evIdx)].reverse().find((e) => e.ev === "toolCall")?.preToolText ?? "";
}

const rows = [];
for (const file of readdirSync(outDir).filter((f) => f.endsWith(".json")).sort()) {
  const s = JSON.parse(readFileSync(path.join(outDir, file), "utf8"));
  const scammer = s.turns.filter((t) => t.role === "scammer" && t.n);
  const allScammerText = scammer.map((t) => t.text).join("\n");
  const guard = arrival(s, GUARD);
  // A
  const before = guard ? scammer.filter((t) => t.n <= guard.scammerTurns).map((t) => t.text).concat(guard.preToolText ? [guard.preToolText] : []) : scammer.map((t) => t.text);
  const aHits = before.filter(INSTALL_DEMAND);
  // B
  const after = guard ? scammer.filter((t) => t.n > guard.scammerTurns) : [];
  const bHit = after.find((t) => /문자|링크/.test(t.text) && /설치/.test(t.text));
  // C · D (verbalInstall)
  let c = "—", d = "—";
  if (s.persona === "verbalInstall") {
    const seq = s.turns.filter((t) => (t.role === "scammer" && t.n) || t.role === "user");
    const verdicts = [];
    seq.forEach((t, i) => {
      if (t.role !== "user" || !/설치했/.test(t.text)) return;
      const prevScammer = [...seq.slice(0, i)].reverse().find((x) => x.role === "scammer");
      if (guard && (prevScammer?.n ?? 0) <= guard.scammerTurns) return; // 문자 도착 전 답은 세지 않는다(문자 없는 설치 주장은 A가 본다)
      const next = seq.slice(i + 1).find((x) => x.role === "scammer");
      if (!next) return;
      verdicts.push(!ACCEPT.test(next.text) && /권한\s?허용|링크|화면|문자|어디까지/.test(next.text) ? `되돌림(T${next.n} "${clip(next.text, 60)}")` : `넘어감(T${next.n} "${clip(next.text, 60)}")`);
    });
    c = verdicts.length ? verdicts.join(" · ") : "해당 답 없음";
    const reliefArrived = Boolean(arrival(s, RELIEF));
    const moved = guard ? after.find((t) => ACCEPT.test(t.text) || NEXT_DEMAND.test(t.text)) : undefined;
    d = `응낙 없이 진행 ${moved ? `T${moved.n} ("${clip(moved.text, 50)}")` : "없음"} · 이관 문자 ${reliefArrived ? "도착" : "미도착"}`;
  }
  // E (comply)
  let e = "—";
  if (s.persona === "comply") {
    const consentIdx = s.turns.findIndex((t) => t.kind === "install_consent_ctx");
    if (consentIdx < 0) e = "주입 없음";
    else {
      const next = s.turns.slice(consentIdx + 1).find((t) => t.role === "scammer" && t.n);
      e = next ? `${/설치|권한|완료|확인|됐/.test(next.text) ? "반영" : "미반영"}(T${next.n} "${clip(next.text, 60)}")` : "다음 말 없음";
    }
  }
  // F
  const ooCount = (allScammerText.match(/[○OＯ]{2}/g) ?? []).length;
  const ahnsim = (allScammerText.match(/안심보안/g) ?? []).length;
  const guardName = (allScammerText.match(/피해 차단용 보안 앱/g) ?? []).length;
  // G
  const reliefEv = s.events.find((x) => x.ev === "sms" && x.smsId === RELIEF);
  const otherBanks = FICTIONAL_BANK_NAMES.filter((b) => b !== "미르은행" && allScammerText.includes(b));
  const holders = [...allScammerText.matchAll(/예금주(?:는|가|명은)?\s?([가-힣]{2,4})/g)].map((m) => m[1]).filter((n) => n !== "오현수");
  const g = [
    `세션 은행 ${s.fictionalBankName}`,
    reliefEv ? `문자 ${reliefEv.body.includes("미르은행") && reliefEv.body.includes("오현수") ? "미르은행·오현수" : "어긋남"}` : "이관 문자 미도착",
    `사기범 다른 은행 ${otherBanks.length ? otherBanks.join(",") : "0"}`,
    `다른 예금주 ${holders.length ? holders.join(",") : "0"}`,
  ].join(" · ");
  rows.push({
    file, variant: s.variantId, persona: s.persona, turns: scammer.length, ended: s.ended ? `${s.ended.kind ?? s.ended.reason ?? "end"}` : "없음",
    guard: guard ? `${guard.by} · 사기범 ${guard.scammerTurns}턴 뒤` : "미도착",
    a: aHits.length ? `위반 ${aHits.length} ("${clip(aHits[0], 60)}")` : "0", b: bHit ? `예(T${bHit.n})` : "아니오", c, d, e,
    f: `○○ ${ooCount} · 안심보안 ${ahnsim} · 피해 차단용 보안 앱 ${guardName}`, g, is429: s.is429, error: s.error ? clip(s.error, 80) : "",
  });
}
console.log("| 변형 | 참가자 | 사기범 턴 | 끝 | 설치 문자 도착 | A 설치 요구 선행 | B 문자 링크 안내 | C 말로만 설치 | D 응낙 없이 진행 | E 응낙 반영 | F 자리표시 · 앱 이름 | G 은행 묶음 | 429 · 오류 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.variant} | ${r.persona} | ${r.turns} | ${r.ended} | ${r.guard} | ${r.a} | ${r.b} | ${r.c} | ${r.d} | ${r.e} | ${r.f} | ${r.g} | ${r.is429 ? "429" : "0"}${r.error ? ` · ${r.error}` : ""} |`);
