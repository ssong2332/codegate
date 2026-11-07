import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { CARD_REBUILD_REPORT_LESSONS, findFlowVariant, resolveSessionScenarioPrompt, type FlowVariant } from "../../scenarios/flowVariants";
import { findDialEntry, PROSECUTOR_OFFICIAL_NUMBER_ID } from "../../scenarios/dialDirectory";
import { findInCallSmsItem } from "../../scenarios/inCallSms";
import { CARD_REBUILD_TACTICS } from "../../scenarios/cardRebuildLegs.prompt";
import { extractTacticLabel } from "../../scenarios/tacticFlavor";
import { isLegDialSmsPending } from "../legHandoff";
import {
  buildPriorLegContext,
  PRIOR_LEG_MAX_LINES,
  PRIOR_LEG_RECENT_LINES,
  planLegStart,
  type PriorLegMessage,
  type RelayState,
} from "../legPlan";

// 2026-11-07 카드사 고급 실기기 시험(서버 `[call-diag]` 세션 1d84811b) 신고 — ① 앞 대화 반영 부족(같은 말 반복 포함) ② 넘김 과다. 사용자 승인 수정 1 · 2.

const SCENARIO = "card-company-impersonation";
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../../../src", rel), "utf8").replace(/\r\n/g, "\n");
const R1 = () => findFlowVariant("fv-k3dn") as FlowVariant;
const R2 = () => findFlowVariant("fv-r8vb") as FlowVariant;
const ended = (legIndex: number, starts: number[]): RelayState => ({ legIndex, legStartUserTurns: starts, connected: false, legEnded: legIndex });

/** 레그 4개 × 참가자 발화 10개(레그 0의 사실은 첫 줄들에만 있다). */
function longHistory(): PriorLegMessage[] {
  const out: PriorLegMessage[] = [];
  for (let leg = 0; leg < 4; leg += 1) {
    for (let i = 0; i < 10; i += 1) {
      out.push({ role: "scammer", text: `레그${leg} 상대 질문 ${i}`, legIndex: leg });
      out.push({ role: "user", text: leg === 0 && i === 0 ? "저 카드 두 장 시켰어요, 지금 밖이라 못 받아요" : `레그${leg} 참가자 답 ${i}`, legIndex: leg });
    }
  }
  return out;
}

test("[수정 1] 인계 블록 — 첫 통화의 참가자 말이 4번째 통화까지 남는다(종전 = 마지막 16줄만)", () => {
  const block = buildPriorLegContext(longHistory())!;
  assert.ok(block.includes("참가자: 저 카드 두 장 시켰어요, 지금 밖이라 못 받아요"), "첫 통화 첫 답");
  // 참가자 말 40줄 전부 · 그 답의 바로 앞 질문은 줄 상한 안에서만.
  const userLines = block.split("\n").filter((l) => l.startsWith("참가자: "));
  assert.equal(userLines.length, 40);
  const spoken = block.split("\n").filter((l) => l.startsWith("참가자: ") || l.startsWith("앞 통화 상대: "));
  assert.ok(spoken.length <= PRIOR_LEG_MAX_LINES, `줄 상한 ${spoken.length}`);
  // 직전 통화 끝부분(마지막 8줄)은 상대 줄도 남는다.
  assert.ok(block.includes("앞 통화 상대: 레그3 상대 질문 9"));
  assert.ok(block.includes("앞 통화 상대: 레그3 상대 질문 6"));
  // 통화마다 머리줄 · 빠진 자리 표시.
  for (const n of [1, 2, 3, 4]) assert.ok(block.includes(`— ${n}번째 통화 —`), `머리줄 ${n}`);
  assert.ok(block.includes("(…)"));
  assert.ok(block.includes("이미 답한 것을 처음 듣는 것처럼 다시 묻지 않는다"));
});

test("[수정 1] 인계 블록 — 짧은 기록은 모두 · 참가자 답 앞 질문을 함께 · 도달하지 않은 줄(notSpoken) · 빈 줄은 뺀다", () => {
  const block = buildPriorLegContext([
    { role: "scammer", text: "오프닝(도달 안 함)", notSpoken: true },
    { role: "scammer", text: "카드 신청하셨어요?" },
    { role: "user", text: "네" },
    { role: "scammer", text: "   " },
    { role: "system", text: "시스템" },
  ])!;
  const lines = block.split("\n").slice(3);
  assert.deepEqual(lines, ["앞 통화 상대: 카드 신청하셨어요?", "참가자: 네"]);
  assert.equal(buildPriorLegContext([{ role: "scammer", text: "x", notSpoken: true }]), undefined);
  // legIndex가 없는 입력(확인 실측 프로브 · 옛 문서)은 머리줄 0.
  assert.ok(!block.includes("번째 통화"));
});

test("[수정 1] 인계 블록 — 줄 상한을 넘으면 오래된 상대 줄부터 빼고 참가자 줄은 끝까지 남긴다 · 긴 줄은 자른다", () => {
  const many: PriorLegMessage[] = [];
  for (let i = 0; i < 30; i += 1) {
    many.push({ role: "scammer", text: `질문 ${i} ${"가".repeat(300)}` });
    many.push({ role: "user", text: `답 ${i}` });
  }
  const block = buildPriorLegContext(many)!;
  const lines = block.split("\n");
  assert.equal(lines.filter((l) => l.startsWith("참가자: ")).length, 30);
  assert.ok(lines.filter((l) => l.startsWith("참가자: ") || l.startsWith("앞 통화 상대: ")).length <= PRIOR_LEG_MAX_LINES);
  assert.ok(!lines.some((l) => l.startsWith("앞 통화 상대: 질문 0 ")), "가장 오래된 상대 줄이 먼저 빠진다");
  assert.ok(lines.filter((l) => l.startsWith("앞 통화 상대: ")).every((l) => l.length <= 180), "상대 줄 길이 상한");
  assert.ok(PRIOR_LEG_RECENT_LINES > 0);
});

test("[수정 1 배선] Live 레그 인계 — 메시지 문서의 `textMasked`를 읽는다(종전 `text` = 늘 빈 값 → 인계 0줄)", () => {
  const src = read("realtime/index.ts");
  const call = src.slice(src.indexOf("priorChatContext = buildPriorLegContext("), src.indexOf("} else if (isEscalatedVoiceCall("));
  assert.ok(call.includes("text: m.textMasked"), "textMasked → text");
  assert.ok(call.includes("legIndex: m.legIndex"), "통화 번호");
  assert.ok(!src.includes("as { role: string; text?: string }"), "종전 잘못된 필드 읽기 0");
  const fallback = read("roleplay/index.ts");
  assert.ok(/buildPriorLegContext\(legHistory\.prior\.map\(\(m\) => \(\{ role: m\.role, text: m\.textMasked, legIndex: m\.legIndex/.test(fallback), "폴백도 통화 번호");
});

test("[수정 1] 같은 말 반복 — '신청했다' 갈래(R1 배송원 · R2 첫 상담원)에 반박 대응 · 되풀이 금지 지시", () => {
  for (const [variant, leg] of [["fv-k3dn", 0], ["fv-r8vb", 0]] as const) {
    const prompt = resolveSessionScenarioPrompt(SCENARIO, variant, leg)!.personaPrompt;
    assert.ok(prompt.includes("같은 말로 되풀이하지 않는다"), `${variant} 레그 ${leg}`);
    assert.ok(prompt.includes("두 장 신청했다"), `${variant} 레그 ${leg} 반박 예시`);
  }
  assert.ok(resolveSessionScenarioPrompt(SCENARIO, "fv-k3dn", 0)!.personaPrompt.includes("이 말은 한 번만 한다"), "배송원 페르소나");
});

test("[수정 2] 레그 수 축소 — R1 5→4통 · R2 4→3통 · 통화 중 넘김(transfer) 0 · 마지막은 검사", () => {
  assert.equal(R1().legs.length, 4);
  assert.equal(R2().legs.length, 3);
  for (const v of [R1(), R2()]) {
    assert.ok(v.legs.every((leg) => leg.entry !== "transfer" && leg.exit !== "transfer"), `${v.variantId}: transfer 0`);
    const sup = v.legs[v.legs.length - 2];
    const last = v.legs[v.legs.length - 1];
    assert.equal(sup.speakerId, "supervisor");
    assert.equal(sup.exit, "dial");
    assert.equal(last.speakerId, "prosecutor");
    assert.equal(last.entry, "dial");
    assert.equal(last.exit, undefined);
    assert.equal(last.dialTarget, PROSECUTOR_OFFICIAL_NUMBER_ID);
    assert.equal(last.callerLabel, findDialEntry(SCENARIO, PROSECUTOR_OFFICIAL_NUMBER_ID)!.contactLabel);
    // 감독기관은 한 번만 나온다.
    assert.equal(v.legs.filter((leg) => leg.speakerId === "supervisor").length, 1);
  }
});

test("[수정 2] 감독기관 → 검사 = 참가자 발신 — 앱 응낙 뒤 검찰청 대표번호로 걸면 검사 레그(가로채기) · 넘김(transfer)은 거부 · 걸지 않으면 검사가 다시 건다(callback)", () => {
  const number = findDialEntry(SCENARIO, PROSECUTOR_OFFICIAL_NUMBER_ID)!.number;
  const dial = planLegStart({ variant: R1(), relay: ended(2, [0, 4, 9]), action: "dial", dialed: number, installConsented: true, userTurns: 12 });
  assert.equal(dial.status, "connected");
  if (dial.status === "connected") assert.deepEqual([dial.legIndex, dial.entry], [3, "dial"]);
  const transfer = planLegStart({ variant: R1(), relay: ended(2, [0, 4, 9]), action: "transfer", installConsented: true, userTurns: 12 });
  assert.deepEqual(transfer, { status: "not_ready", reason: "wrong_action" });
  const callback = planLegStart({ variant: R2(), relay: ended(1, [0, 6]), action: "callback", installConsented: true, userTurns: 9 });
  assert.equal(callback.status, "connected");
  if (callback.status === "connected") assert.deepEqual([callback.legIndex, callback.entry], [2, "incoming"]);
  // 검사 레그 뒤에는 다음 레그가 없다.
  const after = planLegStart({ variant: R1(), relay: ended(3, [0, 4, 9, 12]), action: "dial", dialed: number, installConsented: true, userTurns: 18 });
  assert.deepEqual(after, { status: "not_ready", reason: "no_next_leg" });
});

test("[수정 2] 검찰청 대표번호 = 연락처 · 공식 번호 가로채기(감독기관 번호와 같은 장치) · 앱 응낙 전 = 진짜 안내 · 문자는 그대로 3통 · 2통", () => {
  const entry = findDialEntry(SCENARIO, PROSECUTOR_OFFICIAL_NUMBER_ID)!;
  assert.equal(entry.contactLabel, "한빛지방검찰청 대표번호");
  assert.ok((entry.genuineNotice ?? []).some((line) => line.includes("요구하지 않습니다")));
  const before = planLegStart({ variant: R1(), relay: ended(2, [0, 4, 9]), action: "dial", dialed: entry.number, installConsented: false, userTurns: 12 });
  assert.equal(before.status, "genuine");
  for (const v of [R1(), R2()]) {
    assert.equal(v.legs[v.legs.length - 1].interceptRequires, "install");
    // 감독기관 레그는 문자 선언 0 — 다음 번호는 연락처에 있다(번호 문자 대기 0 · F2).
    const supLeg = v.legs.length - 2;
    assert.equal(v.sms.filter((s) => s.leg === supLeg).length, 0, v.variantId);
    const relay: RelayState = { legIndex: supLeg, legStartUserTurns: Array(supLeg + 1).fill(0), connected: true };
    assert.equal(isLegDialSmsPending(v, relay, []), false, v.variantId);
    // 안전계좌 문자는 검사(마지막) 레그 · 하한 3.
    const safe = v.sms.find((s) => s.smsId === "card-safe-account");
    assert.deepEqual([safe?.leg, safe?.notBeforeUserTurns], [v.legs.length - 1, 3], v.variantId);
  }
  assert.deepEqual([R1().sms.length, R2().sms.length], [3, 2], "고급 문자 범위(AC-096 (b) 0~3) 안");
  assert.equal(findInCallSmsItem(SCENARIO, "card-safe-account")!.senderLabel.includes("한빛지방검찰청"), true, "안전계좌 문자 발신 = 검사 쪽");
});

test("[수정 2] 레그 프롬프트 — 감독기관은 돈 · 넘김 0 · 검사가 안전계좌 · 은행 답변 코칭까지 · 마지막 통화 규칙", () => {
  for (const v of [R1(), R2()]) {
    const supIndex = v.legs.length - 2;
    const sup = resolveSessionScenarioPrompt(SCENARIO, v.variantId, supIndex)!;
    assert.ok(!sup.personaPrompt.includes("980만"), `${v.variantId} 감독기관 금액 0`);
    assert.ok(sup.personaPrompt.includes("한빛지방검찰청 대표번호로 **직접** 전화"), `${v.variantId} 감독기관 — 검찰청에 직접 걸게 함`);
    assert.ok(!/통화를 넘긴다|연결해 드리겠습니다/.test(sup.personaPrompt), `${v.variantId} 감독기관 넘김 문구 0`);
    const pro = resolveSessionScenarioPrompt(SCENARIO, v.variantId, supIndex + 1)!;
    assert.ok(pro.personaPrompt.includes("980만 원"), `${v.variantId} 검사 금액`);
    assert.ok(pro.personaPrompt.includes("가족 사업 자금"), `${v.variantId} 검사 은행 답변 코칭`);
    assert.ok(pro.personaPrompt.includes("이번 흐름의 마지막 통화"), `${v.variantId} 마지막 통화 규칙`);
    const labels = pro.weakenedTactics.map((t) => extractTacticLabel(t));
    for (const t of [CARD_REBUILD_TACTICS.safeAccount, CARD_REBUILD_TACTICS.bankCoaching, CARD_REBUILD_TACTICS.arrestThreat, CARD_REBUILD_TACTICS.secrecy]) {
      assert.ok(labels.includes(extractTacticLabel(t)), `${v.variantId} 검사 수법 ${extractTacticLabel(t)}`);
    }
  }
});

test("[수정 2] 리포트 교육점 · 수법 — 교육점 4개 그대로 · 변형 수법은 레그들이 쓰는 라벨만", () => {
  assert.equal(CARD_REBUILD_REPORT_LESSONS.length, 4);
  for (const v of [R1(), R2()]) {
    const legLabels = new Set(v.legs.flatMap((leg) => leg.tacticLabels ?? []));
    const variantLabels = new Set(v.tactics.map((t) => extractTacticLabel(t)));
    assert.deepEqual([...variantLabels].sort(), [...legLabels].sort(), v.variantId);
  }
});
