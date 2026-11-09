// 2026-11-09 Edge 라이브 재시험 19(main `31ff8acb` · 기관 사칭(검찰·금융감독원) 고급) — 리포트 '속은 순간' 라벨이 그 직전 사기범 대사에
// 없는 요구로 붙은 결함 2건 고정(`docs/research/edge-scenario-test-2026-11-07.md` 재시험 19 새 관찰 ① · ④).
// ① 금 구매형 fv-g2ld: "현재 거래 중인 은행은 어디입니까?" → "새마을은행에 1,200만 원 있어요." 가 '실물 조사 명목 금 구매 인출 요구'에 응함
//    (금 구매 요구는 아직 없었다 — 금 문자 2:39). 원인: 답 내용 범주(L2)가 잔액 공개를 송금 범주로 보고 목록 첫 송금 라벨을 붙였다.
// ④ 안전계좌 · 대출 fv-c5fj: 대출 신청 화면 재촉 · 신청서 제출 재촉 · 확인 전화 코칭 대사 뒤 "네. 알겠습니다. 진행해 주세요." 가 '신원정보 직접 요구'에
//    응함. 원인: 문구 키 · 요구 어형 표 · 답 범주가 모두 비어 §129.10 최종 폴백(목록 첫 요구 범주 라벨)이 붙었다.
// 판정표 SL(`analyzeConversation.ts`). 대사는 기록에 인용된 문면 그대로(말줄임 뒤는 인용에 없어 최소로 채웠다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeConversation, resolveDemandFallbackTactic, type AnalysisMessage } from "../analyzeConversation";
import { buildTacticPremiseText } from "../tacticPremise";
import { findFlowVariant, multiCallLegTactics, resolveSessionScenarioPrompt } from "../../scenarios/flowVariants";
import { extractTacticLabel } from "../../scenarios/tacticFlavor";

const t0 = 1_000_000;
const SCENARIO = "institutional-impersonation";
const msg = (turnIndex: number, role: "scammer" | "user", textMasked: string, sec: number, legIndex?: number): AnalysisMessage => ({
  role,
  textMasked,
  turnIndex,
  createdAtMs: t0 + sec * 1000,
  ...(legIndex !== undefined ? { legIndex } : {}),
});

function goldTactics(): string[] {
  const resolved = resolveSessionScenarioPrompt(SCENARIO, "fv-g2ld");
  assert.ok(resolved, "fv-g2ld 변형이 카탈로그에 없다");
  return resolved.weakenedTactics;
}

function analyzeGold(messages: AnalysisMessage[]) {
  return analyzeConversation(messages, t0, goldTactics(), [], undefined, buildTacticPremiseText(SCENARIO));
}

/** `generateReportCore`와 같은 인자(다통화 변형 = 변형 전체 수법 · 통화별 목록 · 정당한 제3자 통화). */
function analyzeLoan(messages: AnalysisMessage[]) {
  const variant = findFlowVariant("fv-c5fj");
  assert.ok(variant?.multiCall, "fv-c5fj가 다통화 변형이 아니다");
  return analyzeConversation(
    messages,
    t0,
    [...variant.tactics],
    [],
    multiCallLegTactics(variant),
    buildTacticPremiseText(SCENARIO),
    { legIndexes: variant.legs.flatMap((leg, i) => (leg.genuine ? [i] : [])) },
  );
}

const BANK_QUESTION = "현재 거래 중인 은행은 어디입니까?";
const BANK_BALANCE_REPLY = "새마을은행에 1,200만 원 있어요.";
const APPLY_SCREEN_PUSH = "신청 화면이 아직 완료되지 않았습니다. 링크로 접속하시어 절차를 끝까지 진행해 주십시오.";
const APPLY_SUBMIT_PUSH = "본인 확인과 명의 도용 여부 입증을 위해 신청서가 즉시 제출되어야 합니다.";
const CHECK_CALL_COACH = "곧 확인 전화가 갈 겁니다. 용도는 생활비라고만 말씀하시고, 이 일은 비밀로 하셔야 합니다.";
const GO_AHEAD_REPLY = "네. 알겠습니다. 진행해 주세요.";

test("전제 — 기대 라벨이 각 목록에 있다(없으면 이 시험이 아무것도 보지 않는다)", () => {
  assert.ok(goldTactics().map(extractTacticLabel).includes("거래 은행·자산 정보 수집"));
  const leg0 = multiCallLegTactics(findFlowVariant("fv-c5fj"))![0]!.map(extractTacticLabel);
  assert.ok(leg0.includes("대출 신청 링크 유도") && leg0.includes("확인 전화 얼버무리기 코칭"), JSON.stringify(leg0));
});

test("[재현 ①] SL1 — 거래 은행을 물은 대사 뒤 은행 · 잔액 답은 '거래 은행·자산 정보 수집'에 응함(금 구매 요구 아님)", () => {
  const result = analyzeGold([msg(0, "scammer", BANK_QUESTION, 80), msg(1, "user", BANK_BALANCE_REPLY, 90)]);
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
  assert.ok(moment, `잔액 공개는 속은 순간이다(H2): ${JSON.stringify(result.deceivedMoments)}`);
  assert.equal(moment.tactic, "거래 은행·자산 정보 수집");
});

test("SL2 — 금 구매를 실제로 요구한 대사(문구 키) 뒤 잔액 답은 종전대로 금 구매 라벨", () => {
  const result = analyzeGold([
    msg(0, "scammer", "자산 실물 전수 조사라서 예금으로 지정 거래소에서 금을 사 두셔야 합니다.", 150),
    msg(1, "user", "네, 1,200만 원 있어요.", 160),
  ]);
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.equal(moment.tactic, "실물 조사 명목 금 구매 인출 요구");
});

test("SL3 — 목록에 자산 · 잔액 · 거래 은행 라벨이 없으면 종전대로(답 범주 = 송금 범주 첫 라벨 · 새 라벨 0)", () => {
  const withoutAssetLabel = goldTactics().filter((t) => extractTacticLabel(t) !== "거래 은행·자산 정보 수집");
  const result = analyzeConversation(
    [msg(0, "scammer", BANK_QUESTION, 80), msg(1, "user", BANK_BALANCE_REPLY, 90)],
    t0,
    withoutAssetLabel,
    [],
    undefined,
    buildTacticPremiseText(SCENARIO),
  );
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.equal(moment.tactic, "실물 조사 명목 금 구매 인출 요구");
});

test("[재현 ④] SL4 · SL5 — 대출 신청 화면 · 신청서 제출 재촉 뒤 응함 = '대출 신청 링크 유도'(신원정보 요구 아님)", () => {
  const result = analyzeLoan([
    msg(0, "scammer", APPLY_SCREEN_PUSH, 250, 0),
    msg(1, "user", GO_AHEAD_REPLY, 257, 0),
    msg(2, "scammer", APPLY_SUBMIT_PUSH, 280, 0),
    msg(3, "user", GO_AHEAD_REPLY, 288, 0),
  ]);
  const byTurn = Object.fromEntries(result.deceivedMoments.map((m) => [m.turnIndex, m.tactic]));
  assert.deepEqual(byTurn, { 1: "대출 신청 링크 유도", 3: "대출 신청 링크 유도" });
  assert.ok(result.tacticsUsed.includes("대출 신청 링크 유도"), JSON.stringify(result.tacticsUsed));
});

test("[재현 ④] SL6 — 확인 전화 코칭('용도는 생활비라고만 … 비밀로') 뒤 응함 = '확인 전화 얼버무리기 코칭'", () => {
  const result = analyzeLoan([msg(0, "scammer", CHECK_CALL_COACH, 390, 0), msg(1, "user", GO_AHEAD_REPLY, 396, 0)]);
  const moment = result.deceivedMoments.find((m) => m.turnIndex === 1);
  assert.ok(moment, JSON.stringify(result.deceivedMoments));
  assert.equal(moment.tactic, "확인 전화 얼버무리기 코칭");
  assert.ok(result.tacticsUsed.includes("확인 전화 얼버무리기 코칭"), JSON.stringify(result.tacticsUsed));
});

test("SL7 — 신청 · 코칭 행은 목록에 그 라벨이 있을 때만(금 구매형 · 다른 시나리오에서는 다른 라벨을 끌어오지 않는다)", () => {
  for (const line of [APPLY_SCREEN_PUSH, APPLY_SUBMIT_PUSH, CHECK_CALL_COACH]) {
    const label = resolveDemandFallbackTactic(line, goldTactics());
    assert.ok(label === undefined || !/신청|코칭|얼버무/.test(label), `${line} → ${label}`);
  }
  // 앱 설치 · 링크 라벨만 있는 목록: 신청서 제출 재촉이 '앱 설치' 라벨로 가지 않는다.
  const installOnly = ["보안 앱 설치 요구 — '보안 앱을 깔아 주세요' 처럼 설치를 요구한다.", "불이익 암시 — '협조하지 않으면 불이익' 처럼 암시한다."];
  assert.equal(resolveDemandFallbackTactic(APPLY_SUBMIT_PUSH, installOnly), undefined);
  assert.equal(resolveDemandFallbackTactic(CHECK_CALL_COACH, installOnly), undefined);
});

test("SL8 — 신청 · 코칭 단어가 있어도 요구 어형이 아니면 행이 열리지 않는다(확인 · 안내 대사)", () => {
  const leg0 = multiCallLegTactics(findFlowVariant("fv-c5fj"))![0]!;
  for (const line of [
    "신청서 제출이 완료된 것 확인했습니다.",
    "신청 화면이 아직 완료되지 않았습니다.",
    "확인 전화가 오면 제가 다시 연락드리겠습니다.",
  ]) {
    assert.equal(resolveDemandFallbackTactic(line, leg0), undefined, line);
  }
});

// ── 2026-11-09 Edge 라이브 재시험 20 J3(main `f520f82e` · fv-c5fj) — #571 뒤에도 ④가 일부 남았다(리플레이 원문).
// (a) 3:47 "…링크에서 비대면 대출을 신청해 주시고, …" → 응함이 '신원정보 직접 요구'. 원인: 10행이 '신청' 뒤 접속 · 완료 류 낱말을 요구했다(SL10).
// (b) 4:16 "문자 속 링크 접속하셔서 본인 인증 후 대출 신청을 마저 완료해 주십시오." → 같은 라벨. 이 문장 한 줄로는 이미 '대출 신청 링크 유도'다(아래 SL9 전제) —
//     저장 전사가 조각으로 나뉘어 마지막 조각만 짝 대사가 되면 재현된다(SL9 · 추정 원인).
const LOAN_APPLY_DIRECT = "안내해 드린 대로 문자 속 링크에서 비대면 대출을 신청해 주시고, 대출 용도는 생활비로 선택해 주십시오.";
const LOAN_APPLY_FINISH = "문자 속 링크 접속하셔서 본인 인증 후 대출 신청을 마저 완료해 주십시오.";

test("[재현 J3 (a)] SL10 — '대출을 신청해 주시고' 뒤 응함 = '대출 신청 링크 유도'", () => {
  const result = analyzeLoan([msg(0, "scammer", LOAN_APPLY_DIRECT, 227, 0), msg(1, "user", GO_AHEAD_REPLY, 235, 0)]);
  assert.deepEqual(result.deceivedMoments.map((m) => m.tactic), ["대출 신청 링크 유도"]);
});

test("SL10 — 신청을 직접 시키는 어형 표(주세요 · 주시고 · 하세요 · 하셔야 = 열림 / 링크 · 대출 없음 · 요구 아님 = 안 열림)", () => {
  const leg0 = multiCallLegTactics(findFlowVariant("fv-c5fj"))![0]!;
  for (const line of [
    "링크에서 대출을 신청해 주세요.",
    "비대면 대출을 바로 신청하세요.",
    "그 링크에서 오늘 안에 대출 신청하셔야 합니다.",
  ]) {
    assert.equal(resolveDemandFallbackTactic(line, leg0), "대출 신청 링크 유도", line);
  }
  for (const line of ["대출을 신청해 주셔서 감사합니다.", "카드 재발급을 신청해 주세요.", "대출 신청이 접수됐습니다."]) {
    assert.notEqual(resolveDemandFallbackTactic(line, leg0), "대출 신청 링크 유도", line);
  }
});

test("[재현 J3 (b)] SL9 — 한 줄이면 이미 '대출 신청 링크 유도'(전제) · 조각으로 나뉘어도 같은 라벨", () => {
  const whole = analyzeLoan([msg(0, "scammer", LOAN_APPLY_FINISH, 250, 0), msg(1, "user", GO_AHEAD_REPLY, 256, 0)]);
  assert.deepEqual(whole.deceivedMoments.map((m) => m.tactic), ["대출 신청 링크 유도"]);
  const split = analyzeLoan([
    msg(0, "scammer", "문자 속 링크 접속하셔서 본인 인증 후 대출 신청을", 250, 0),
    msg(1, "scammer", "마저 완료해 주십시오.", 253, 0),
    msg(2, "user", GO_AHEAD_REPLY, 256, 0),
  ]);
  assert.deepEqual(split.deceivedMoments.map((m) => m.tactic), ["대출 신청 링크 유도"]);
});

test("SL9b — 앞 조각이 다른 통화 · 참가자 줄 뒤면 이어 붙이지 않는다(종전 최종 폴백)", () => {
  const otherLeg = analyzeLoan([
    msg(0, "scammer", "문자 속 링크 접속하셔서 본인 인증 후 대출 신청을", 250, 2),
    msg(1, "scammer", "마저 완료해 주십시오.", 253, 0),
    msg(2, "user", GO_AHEAD_REPLY, 256, 0),
  ]);
  assert.notDeepEqual(otherLeg.deceivedMoments.map((m) => m.tactic), ["대출 신청 링크 유도"]);
  const afterUser = analyzeLoan([
    msg(0, "scammer", "문자 속 링크 접속하셔서 본인 인증 후 대출 신청을", 250, 0),
    msg(1, "user", "네.", 251, 0),
    msg(2, "scammer", "마저 완료해 주십시오.", 253, 0),
    msg(3, "user", GO_AHEAD_REPLY, 256, 0),
  ]);
  assert.ok(!afterUser.deceivedMoments.some((m) => m.turnIndex === 3 && m.tactic === "대출 신청 링크 유도"));
});

test("J3 유지 — 같은 판 확인 전화 코칭 · 통화 3 대출금 이체 라벨은 그대로", () => {
  const result = analyzeLoan([
    msg(0, "scammer", LOAN_APPLY_DIRECT, 227, 0),
    msg(1, "user", GO_AHEAD_REPLY, 235, 0),
    msg(2, "scammer", LOAN_APPLY_FINISH, 250, 0),
    msg(3, "user", GO_AHEAD_REPLY, 256, 0),
    msg(4, "scammer", CHECK_CALL_COACH, 312, 0),
    msg(5, "user", GO_AHEAD_REPLY, 318, 0),
  ]);
  assert.deepEqual(
    result.deceivedMoments.map((m) => m.tactic),
    ["대출 신청 링크 유도", "대출 신청 링크 유도", "확인 전화 얼버무리기 코칭"],
  );
  const leg2 = multiCallLegTactics(findFlowVariant("fv-c5fj"))![2]!;
  assert.equal(
    resolveDemandFallbackTactic("들어온 대출금 2,000만 원을 문자로 보낸 안전계좌로 바로 이체해 주십시오.", leg2),
    "대출금 이체 요구",
  );
});

// ── 2026-11-09 Edge 라이브 재시험 22 L3(main `7ede70a9` · fv-c5fj) 새 관찰 ⑩ — 사기범 대사에 다른 범주 수법의 **예시 문구 앞머리**가 섞여 문구 키가 그쪽 라벨을 붙였다.
// (a) 2:28 "본인 확인이 완료되었습니다. … 안전 계좌로 이관하셔야 합니다." → '신원정보 직접 요구'(키 "본인확인이" — 신원정보 예시 '본인 확인이 안 되면 …'의 앞머리).
//     같은 대사의 '안전계좌 이체 요구' 키("지금계좌에")도 맞았지만 목록 순서상 신원정보가 앞이다. '이관하셔야'는 요구 어형 표 송금 행에 없었다(SL14).
// (b) 5:05 "… 문자로 보낸 안내 화면에서 대출을 신청해 주십시오. …" → '이체 화면 유도'(키 "문자로보낸" — 이체 화면 예시 '문자로 보낸 안내의 링크 …'의 앞머리).
//     이 대사에 이체 요구는 없고 요구 어형 표는 '대출 신청 링크 유도'를 고른다(SL13).
const SAFE_ACCOUNT_AFTER_ID = "본인 확인이 완료되었습니다. 자산을 보호하기 위해서는, 지금 계좌에 있는 금액 중 일부를 안전 계좌로 이관하셔야 합니다.";
const LOAN_APPLY_VIA_SMS_SCREEN =
  "받으신 대출금으로 명의 도용 여부를 확인해야 합니다. 문자로 보낸 안내 화면에서 대출을 신청해 주십시오. 용도는 생활비로 선택하시면 됩니다.";
const GO_AHEAD_COMMA = "네, 알겠습니다. 진행해 주세요.";

test("[재현 ⑩ (a)] SL13 · SL14 — 본인 확인 완료 + 안전 계좌 이관 요구 뒤 응함 = '안전계좌 이체 요구'", () => {
  const result = analyzeLoan([msg(0, "scammer", SAFE_ACCOUNT_AFTER_ID, 140, 0), msg(1, "user", GO_AHEAD_COMMA, 148, 0)]);
  assert.deepEqual(result.deceivedMoments.map((m) => m.tactic), ["안전계좌 이체 요구"]);
});

test("[재현 ⑩ (b)] SL13 — 문자 안내 화면에서 대출 신청 요구 뒤 응함 = '대출 신청 링크 유도'(이체 화면 유도 아님)", () => {
  const result = analyzeLoan([msg(0, "scammer", LOAN_APPLY_VIA_SMS_SCREEN, 238, 0), msg(1, "user", GO_AHEAD_COMMA, 305, 0)]);
  assert.deepEqual(result.deceivedMoments.map((m) => m.tactic), ["대출 신청 링크 유도"]);
});

test("SL14 — '이관하셔야 · 이관해 주십시오'는 돈 · 계좌 문맥이 같은 문장에 있을 때만 송금 요구 행", () => {
  const leg0 = multiCallLegTactics(findFlowVariant("fv-c5fj"))![0]!;
  for (const line of ["지금 계좌에 있는 돈을 안전 계좌로 이관하셔야 합니다.", "잔액 980만 원을 국가 안전계좌로 이관해 주십시오."]) {
    assert.equal(resolveDemandFallbackTactic(line, leg0), "안전계좌 이체 요구", line);
  }
  for (const line of ["사건이 상급 부서로 이관되었습니다.", "이관 절차가 곧 진행됩니다."]) {
    assert.equal(resolveDemandFallbackTactic(line, leg0), undefined, line);
  }
});

test("SL13b — 키 라벨 범주의 요구가 대사에 실제로 있으면 종전 키 라벨 그대로", () => {
  // 신원정보 키 + 신원정보 요구(주민번호) — 종전 '신원정보 직접 요구'.
  const id = analyzeLoan([
    msg(0, "scammer", "본인 확인이 안 되면 공범으로 분류됩니다, 주민번호 뒤 7자리 불러주세요.", 100, 0),
    msg(1, "user", GO_AHEAD_COMMA, 108, 0),
  ]);
  assert.deepEqual(id.deceivedMoments.map((m) => m.tactic), ["신원정보 직접 요구"]);
  // 이체 화면 키 + 금액 · 이체 요구 — 종전 '이체 화면 유도'.
  const transfer = analyzeLoan([
    msg(0, "scammer", "문자로 보낸 안내의 링크를 눌러 보시면 안전계좌는 이미 들어가 있습니다, 980만 원만 넣고 이체해 주십시오.", 500, 0),
    msg(1, "user", GO_AHEAD_COMMA, 508, 0),
  ]);
  assert.deepEqual(transfer.deceivedMoments.map((m) => m.tactic), ["이체 화면 유도"]);
  // 키 범주 요구가 없어도 요구 어형 표가 비면 종전 키 라벨(새 라벨 0).
  const statement = analyzeLoan([msg(0, "scammer", "본인 확인이 완료되었습니다.", 130, 0), msg(1, "user", GO_AHEAD_COMMA, 135, 0)]);
  assert.deepEqual(statement.deceivedMoments.map((m) => m.tactic), ["신원정보 직접 요구"]);
});
