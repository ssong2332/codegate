// #463 화면 행동만 인정 — 실 키 확인 실측 채점(2026-11-01 · 측정 전용 · 앱 코드 아님). 사용: node scripts/screen-action-probe-score.mjs <full-audit-probe out 폴더> <repo 루트>
// 대상 참가자 = verbalInstall(설치를 말로만) · verbalTransfer(이체 · 송금을 말로만). 판정표(이 표대로만):
// | 항목 | If | Then |
// |---|---|---|
// | 화면 제시 | 통화 = 그 종류 화면을 여는 문자 도착 · 메신저 = 그 종류 칩이 붙은 사기범 메시지 | 이 시점 뒤 참가자 말만 센다 |
// | 주장 | 참가자 말이 그 종류 완료 주장(앱 \`isScreenClaim\` — 같은 함수) | 1차 · 2차 … |
// | 되돌림 / 넘어감 | 주장 바로 다음 사기범 말이 ACCEPT(그 종류 완료 단정)면 넘어감, 아니면 (권한|링크|화면|문자|송금하기|이체하기|다시|확인이 안|확인되지|어디까지)면 되돌림, 둘 다 아니면 기타 | 표 |
// | 결국 넘김 | 화면 제시 뒤 사기범 말 중 ACCEPT 또는 다음 단계 요구(NEXT)의 첫 턴 · 통화 끊기 goal 수락 | T# / 없음 |
// | 응낙 없는 이관 문자 | verbalInstall에서 card-relief-account 도착(어느 경로 · 발화 수) · 보류 이벤트(installHold) | 표 |
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [outDir, repoArg] = process.argv.slice(2);
const repo = path.resolve(repoArg ?? ".");
const require = createRequire(path.join(repo, "functions", "package.json"));
const lib = (p) => require(path.join(repo, "functions", "lib", p));
const { isScreenClaim, screenKindOf } = lib("roleplay/screenAction.js");
const { findInCallSmsItem } = lib("scenarios/inCallSms.js");

// 완료 · 확인 **단정**만 — 조건형("완료되셨다면") · 부정("완료되지 않았" · "확인되지")은 아니다(첫 채점 정정 2026-11-01).
const ACCEPT = {
  install: /(?:보안|설치|조치|적용|권한)[^.?!]{0,12}(?:(?:완료|마무리)(?:되었습니다|됐습니다|되었고|됐고|되셨습니다|된 것 확인|되셨네요|됐네요)|확인(?:되었습니다|됐습니다|되었고|됐고))/,
  transfer: /(?:입금|이체|이관|송금|돈)[^.?!]{0,12}(?:확인(?:되었|됐|했)|완료(?:됐|되었|했))|잘\s*(?:받았|들어왔)|들어왔(?:어|네|습)/,
};
const NEXT = { install: /카드\s?번호|유효\s?기간|이관|이체|옮기|234만|이백삼십사/, transfer: /추가로|하나\s?더|또\s?(?:보내|필요)|수수료|신분증|남은\s?(?:잔액|돈)/ };
const REDIRECT = /권한|링크|화면|문자|송금하기|이체하기|다시|확인이 안|확인되지|확인이 되지|어디까지|안 들어|안 왔/;
const KIND = { verbalInstall: "install", verbalTransfer: "transfer" };
const clip = (t, n = 70) => (t ?? "").replace(/\s+/g, " ").slice(0, n);

function offeredAt(s, kind) {
  // 통화: 그 종류 화면 문자 도착 시점의 사기범 완료 턴 수 · 메신저: 그 종류 칩이 처음 붙은 사기범 턴 번호.
  if (s.ch === "voice") {
    for (const e of s.events) {
      if (e.ev !== "sms") continue;
      const landing = findInCallSmsItem(s.id, e.smsId)?.fakeLandingId;
      if (landing && screenKindOf(s.id, landing) === kind) {
        if (typeof e.scammerTurns === "number") return e.scammerTurns;
        const call = [...s.events.slice(0, s.events.indexOf(e))].reverse().find((x) => x.ev === "toolCall");
        return call?.scammerTurns ?? 0;
      }
    }
    return null;
  }
  const t = s.turns.find((x) => x.role === "scammer" && (x.attachments ?? []).some((a) => screenKindOf(s.id, a.fakeLandingId) === kind));
  return t ? t.n - 1 : null;
}

const rows = [];
for (const file of readdirSync(outDir).filter((f) => f.endsWith(".json")).sort()) {
  const s = JSON.parse(readFileSync(path.join(outDir, file), "utf8"));
  const kind = KIND[s.persona];
  if (!kind) continue;
  const seq = s.turns.filter((t) => (t.role === "scammer" && t.n && t.kind !== "interrupted") || t.role === "user");
  const offered = offeredAt(s, kind);
  const claims = [];
  seq.forEach((t, i) => {
    if (t.role !== "user" || offered === null || !isScreenClaim(kind, t.text)) return;
    const prev = [...seq.slice(0, i)].reverse().find((x) => x.role === "scammer");
    if ((prev?.n ?? 0) < offered) return;
    const next = seq.slice(i + 1).find((x) => x.role === "scammer");
    if (!next) return;
    const verdict = ACCEPT[kind].test(next.text) ? "넘어감" : REDIRECT.test(next.text) ? "되돌림" : "기타";
    claims.push(`${verdict}(T${next.n} "${clip(next.text)}")`);
  });
  const after = offered === null ? [] : seq.filter((t) => t.role === "scammer" && t.n > offered);
  const moved = after.find((t) => ACCEPT[kind].test(t.text) || NEXT[kind].test(t.text));
  const goal = s.events.find((e) => e.ev === "toolResult" && e.name === "end_call");
  const ended = s.ended ? `${s.ended.kind ?? s.ended.reason ?? "end"}${s.ended.row ? `(${s.ended.row})` : ""}` : "없음";
  const relief = s.events.find((e) => e.ev === "sms" && e.smsId === "card-relief-account");
  const holds = s.events.filter((e) => e.ev === "installHold");
  rows.push({
    s: `${s.ch} ${s.variantId} ${s.persona}`,
    offered: offered === null ? "제시 없음" : `사기범 ${offered}턴 뒤`,
    first: claims[0] ?? "—",
    second: claims[1] ?? "—",
    rest: claims.length > 2 ? `${claims.length - 2}건 더: ${claims.slice(2).map((c) => c.split("(")[0]).join(",")}` : "",
    moved: moved ? `T${moved.n} "${clip(moved.text, 60)}"` : "없음",
    ended: `${ended}${goal ? ` · end_call ${goal.status}${goal.row ? `/${goal.row}` : ""}` : ""}`,
    relief: s.persona === "verbalInstall" ? (relief ? `도착(${relief.by})` : "미도착") + ` · 보류 이벤트 ${holds.length}(wait ${holds.filter((h) => h.action === "wait").length})` : "—",
    screenNotDone: s.events.filter((e) => e.ev === "screenNotDone").length,
    is429: s.is429, error: s.error ? clip(s.error, 80) : "",
  });
}
console.log("| 세션 | 화면 제시 | 1차 주장 → | 2차 주장 → | 그 뒤 | 결국 넘김(첫 턴) | 끝 | 응낙 없는 이관 문자 | 미완료 지시(메신저) | 429 · 오류 |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.s} | ${r.offered} | ${r.first} | ${r.second} | ${r.rest} | ${r.moved} | ${r.ended} | ${r.relief} | ${r.screenNotDone} | ${r.is429 ? "429" : "0"}${r.error ? ` · ${r.error}` : ""} |`);
