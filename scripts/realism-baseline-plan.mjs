#!/usr/bin/env node
// 기준선 실 키 측정 계획 생성기(W0 · 2026-11-27 · docs/research/realism-criteria-2026-11-27.md 5절 묶음 A · B · C). 실 키 0 · 과금 0 — 계획 json만 만든다.
//   A = 문자 · 화면에 금액이 있는 음성 변형 × comply   B = fv-h5sz × allIn · asker   C = 납치 고급 fv-k268 · 검찰 고급 fv-c5fj × allIn
// node scripts/realism-baseline-plan.mjs --out <폴더> [--fn-root <functions 폴더>] [--max-a 28]
// 그 뒤: node scripts/full-audit-probe.mjs --secret <메인 체크아웃 functions/.secret.local> --key-var GEMINI_API_KEY2 --plan <폴더>/plan-A.json --out <폴더>/out --tag base-a
//        node scripts/realism-score.mjs <폴더>/out --md <폴더>/score-baseline.md
// ⚠️ 문서 5절은 A를 28개(A01 스캔: 일치 6 + 지시문 금액 없음 22)로 적었지만, 이 생성기 정의("선언된 문자 본문에 '금액: N원'이 있고 채널에 voice")로는 더 많이 나온다 —
//    승인된 32판을 넘기지 않게 지시문에 금액이 없는 변형부터 `--max-a`(기본 28)까지만 담고, 넘친 목록은 plan-A-overflow.json에 따로 둔다(실행 전 메인 확인).
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const val = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const fnRoot = path.resolve(val("--fn-root", path.join(here, "../functions")));
const outDir = path.resolve(val("--out", ""));
if (!val("--out")) { console.error("사용: node scripts/realism-baseline-plan.mjs --out <폴더> [--fn-root functions] [--max-a 28]"); process.exit(2); }
const require = createRequire(path.join(fnRoot, "package.json"));
const L = (p) => require(path.join(fnRoot, "lib", p));
const { FLOW_VARIANTS, findFlowVariant } = L("scenarios/flowVariants.js");
const { findInCallSmsItem } = L("scenarios/inCallSms.js");
const { resolveDeclaredSms } = L("inCallSms/smsGate.js");

/**
 * 다통화 변형의 레그 사이 행동(프로브 `dials` — 키 = "start"(첫 레그가 직접 거는 통화) 또는 끝난 레그 번호). 레그의 나가는 방식(`exit`)대로 순응 참가자가 한다:
 * dial = 다음 레그의 상대 번호(`dialTarget`)로 건다 · incoming = 사기범 전화를 다시 받는다(callback) · transfer = 프로브 기본값(생략).
 * 이게 없으면 첫 레그 뒤 `stopped_by_plan`으로 끊긴다(기준선 fv-k3dn · fv-r8vb · fv-c5fj).
 */
function dialsFor(variant) {
  const dials = {};
  const legs = variant.legs;
  if (legs[0]?.entry === "dial") dials.start = { action: "dial", numberId: legs[0].dialTarget };
  legs.slice(0, -1).forEach((leg, i) => {
    if (leg.exit === "dial") dials[i] = { action: "dial", numberId: legs[i + 1].dialTarget };
    else if (leg.exit === "incoming") dials[i] = { action: "callback" };
  });
  return dials;
}
const entry = (v, persona) => {
  const multi = findFlowVariant(v.variantId)?.multiCall;
  return { ch: multi ? "multicall" : "voice", id: v.scenarioId, level: v.level, persona, variant: v.variantId, ...(multi ? { dials: dialsFor(v) } : {}) };
};
const amountsOf = (v) => resolveDeclaredSms(v.scenarioId, v.variantId).declared.map((d) => findInCallSmsItem(v.scenarioId, d.smsId)).filter(Boolean)
  .map((i) => /금액:\s*([\d,]+)\s*원/.exec(i.body)?.[1] ?? i.transferAmount).filter(Boolean);
const instructionText = (v) => JSON.stringify([v.stages, v.tactics, v.pressure, v.signal, v.exitBlock, v.legs]);
const hasAmountInInstruction = (v, amts) => amts.some((a) => instructionText(v).includes(a) || instructionText(v).includes(`${Number(a.replace(/,/g, "")) / 10000}만`));

const candidates = FLOW_VARIANTS.filter((v) => JSON.stringify(v.channels ?? []).includes("voice")).map((v) => ({ v, amts: amountsOf(v) })).filter((x) => x.amts.length);
// 지시문에 금액이 없는 변형(M1 위반 후보)이 먼저 — 승인된 판 수 안에서 가장 결함 가능성이 큰 쪽부터 잰다.
const ordered = [...candidates.filter((x) => !hasAmountInInstruction(x.v, x.amts)), ...candidates.filter((x) => hasAmountInInstruction(x.v, x.amts))];
const maxA = Number(val("--max-a", "28"));
const A = ordered.slice(0, maxA).map((x) => entry(x.v, "comply"));
const overflow = ordered.slice(maxA).map((x) => entry(x.v, "comply"));
const byId = (id) => FLOW_VARIANTS.find((v) => v.variantId === id);
const need = (id) => byId(id) ?? (() => { throw new Error(`변형 없음: ${id}`); })();
const B = [entry(need("fv-h5sz"), "allIn"), entry(need("fv-h5sz"), "asker")];
const C = [entry(need("fv-k268"), "allIn"), entry(need("fv-c5fj"), "allIn")];

mkdirSync(outDir, { recursive: true });
for (const [name, plan] of [["A", A], ["B", B], ["C", C], ["A-overflow", overflow]]) writeFileSync(path.join(outDir, `plan-${name}.json`), JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ candidates: candidates.length, instructionLacksAmount: candidates.filter((x) => !hasAmountInInstruction(x.v, x.amts)).length, A: A.length, B: B.length, C: C.length, total: A.length + B.length + C.length, overflow: overflow.length }));
