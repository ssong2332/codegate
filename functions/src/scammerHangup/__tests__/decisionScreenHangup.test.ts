// ⭐ P1 M1 · M2(2026-10-31) — 운영 세션 b94b9eec(검찰 고급 `fv-h3vn` · 2026-10-31 09:35~09:39 UTC) 재현과 4-c행 · 문자 목적 보정 P-2a 고정.
// 로그(`docs/research/prosecution-call-reality-check-2026-10-31.md` §0):
//   발화 3  — 모델 `identity`(선언 밖) → 서버가 `link`(사건 조회)로 보정 · 도착
//   발화 7  — 모델 `link`(이미 도착) → 서버가 `transfer`(자산 검수 사이트)로 보정 · 도착   ← M2
//   발화 11 — `end_call(goal)` 승인(9행) · 사이트 이체 제출 여부 미확인                      ← M1
// 현실 기준(같은 문서 §1): R11 · R12 — 송금을 받기 전에는 끊지 않고 단계마다 확인한다 · R13 — 링크는 그 단계의 말과 함께 온다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { decideScammerHangup, type ScammerHangupInput } from "../decide";
import { decideFallbackHangup, resolveFallbackHangupEffect, fallbackHangupMode, type FallbackHangupFacts } from "../fallback";
import { VERBAL_DECISION_VARIANTS, finalDecisionScreenSms, isDecisionScreenPending, goalFollowUpFor, type DecisionScreenInput } from "../goalAction";
import { SCAMMER_HANGUP_DECISION_PENDING_GUIDANCE, scammerHangupGuidance } from "../guidance";
import {
  buildSmsAlreadyDeliveredInstruction,
  correctModelSmsPurpose,
  planSmsBackstop,
  resolveDeclaredSms,
  resolveSmsGate,
  type DeliveredSmsRecord,
} from "../../inCallSms/smsGate";
import { FLOW_VARIANTS } from "../../scenarios/flowVariants";
import { hasVerifyIntercept } from "../../scenarios/verifyIntercept";

const SRC_ROOT = path.resolve(__dirname, "../../../src");
const read = (rel: string) => readFileSync(path.join(SRC_ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const H3VN = "fv-h3vn";
const PROSECUTION = "prosecution-cooperation-call";
const { declared: H3VN_DECLARED, reason: H3VN_REASON } = resolveDeclaredSms(PROSECUTION, H3VN);

/** b94b9eec의 도착 기록(발화 3 사건 조회 · 발화 7 자산 검수 사이트). `submitted` = 어느 화면을 제출했는가. */
function h3vnDelivered(submitted: { caseRecord?: boolean; assetSite?: boolean } = {}): DeliveredSmsRecord[] {
  return [
    { smsId: "prosecution-case-link", userTurnsAtArrival: 3, ...(submitted.caseRecord ? { landingSubmitted: true as const } : {}) },
    { smsId: "prosecution-asset-site-link", userTurnsAtArrival: 7, ...(submitted.assetSite ? { landingSubmitted: true as const } : {}) },
  ];
}

function h3vnScreenInput(delivered: readonly DeliveredSmsRecord[]): DecisionScreenInput {
  return {
    scenarioId: PROSECUTION,
    flowVariantId: H3VN,
    delivered,
    mockScreens: [],
    declared: H3VN_DECLARED,
    declaredKnown: H3VN_REASON === undefined,
    verifyEnabled: false,
    followUpUserTurns: goalFollowUpFor(PROSECUTION, H3VN),
  };
}

/** 실시간 콜러블 입력(발화 11 · 하한 · 문자 대기 · 지시 대기 모두 통과 — 로그상 9행 승인 칸). */
function realtimeInput(decisionScreenPending: boolean, hangupKind: ScammerHangupInput["hangupKind"]): ScammerHangupInput {
  return {
    status: "active",
    channel: "voice",
    isMockTurn: false,
    verifyEnabled: false,
    transferPlaced: false,
    transferReachable: true,
    goalActionDone: false,
    followUpPending: false,
    decisionScreenPending,
    hangupKind,
    userTurns: 11,
    pendingInstruction: false,
    smsAwaitingUser: false,
    limitReached: false,
    alreadyAccepted: false,
    relay: undefined,
  };
}

test("[P1 M1 · b94b9eec] fv-h3vn은 4행 · 4-b행 가드가 없다 — 그래서 종전에는 발화 11 goal이 9행으로 승인됐다", () => {
  assert.equal(H3VN_REASON, undefined);
  assert.equal(hasVerifyIntercept(PROSECUTION), false, "확인 무력화 없음(4행 꺼짐)");
  assert.equal(goalFollowUpFor(PROSECUTION, H3VN), undefined, "후속 단계 없음(4-b행 꺼짐)");
  // 종전 판정(4-c 입력 거짓) = 로그 그대로 9행 승인.
  assert.deepEqual(decideScammerHangup(realtimeInput(false, "goal")), { status: "accepted", hangup: true, row: "9" });
});

test("[P1 M1 · b94b9eec] 결정 화면 = 선언 순서상 마지막 화면(자산 검수 사이트) — 사건 조회 본인 확인만으로는 풀리지 않는다", () => {
  assert.equal(finalDecisionScreenSms(PROSECUTION, H3VN_DECLARED)?.smsId, "prosecution-asset-site-link");
  assert.equal(isDecisionScreenPending(h3vnScreenInput([])), true, "문자 도착 전");
  assert.equal(isDecisionScreenPending(h3vnScreenInput(h3vnDelivered())), true, "두 문자 도착 · 제출 0(이번 통화 발화 11 — 제출 여부 미확인 칸)");
  assert.equal(isDecisionScreenPending(h3vnScreenInput(h3vnDelivered({ caseRecord: true }))), true, "앞 단계 화면만 제출");
  assert.equal(isDecisionScreenPending(h3vnScreenInput(h3vnDelivered({ assetSite: true }))), false, "사이트 이체 제출 = 결정 순간 지남");
});

test("[P1 M1 · b94b9eec] 4-c행 — 사이트 제출 전 goal · 사유 누락은 막고 give_up은 통과 · 제출 뒤 goal은 승인", () => {
  assert.deepEqual(decideScammerHangup(realtimeInput(true, "goal")), { status: "blocked_decision", hangup: false, row: "4-c" });
  assert.equal(decideScammerHangup(realtimeInput(true, "unspecified")).row, "4-c", "사유 누락 · 오기입 = 막는 쪽(fail-closed)");
  assert.deepEqual(decideScammerHangup(realtimeInput(true, "give_up")), { status: "accepted", hangup: true, row: "9" }, "거절 끊기는 막지 않는다");
  assert.equal(decideScammerHangup(realtimeInput(false, "goal")).status, "accepted", "제출 뒤");
  // 4-c행은 끊기를 막을 뿐 — 그 아래 하한(5 · 6행)은 그대로다.
  assert.equal(decideScammerHangup({ ...realtimeInput(false, "goal"), userTurns: 2 }).status, "too_early");
  assert.equal(decideScammerHangup({ ...realtimeInput(true, "give_up"), smsAwaitingUser: true }).status, "blocked_pending");
});

test("[P1 M1] 4-c 막힘 문면 — 같은 안내 되풀이 금지 · 어디까지 했는지 한 번 묻기 · 끝내 거절이면 give_up · 횟수 · 턴 번호 0", () => {
  assert.equal(scammerHangupGuidance("blocked_decision"), SCAMMER_HANGUP_DECISION_PENDING_GUIDANCE);
  assert.ok(SCAMMER_HANGUP_DECISION_PENDING_GUIDANCE.includes("같은 말로 되풀이하지 마라"));
  assert.ok(SCAMMER_HANGUP_DECISION_PENDING_GUIDANCE.includes("give_up"));
  assert.equal(/[0-9]/.test(SCAMMER_HANGUP_DECISION_PENDING_GUIDANCE), false, "G130 — 숫자 0");
});

test("[P1 M1] 폴백 — 사전 판정은 사유를 모르므로 4-c 통과(SIGNAL 턴) · 사후 판정이 goal 신호를 막고 give_up 신호는 끝낸다", () => {
  const facts: FallbackHangupFacts = {
    status: "active",
    channel: "voice",
    verifyEnabled: false,
    transferPlaced: false,
    transferReachable: true,
    goalActionDone: false,
    followUpPending: false,
    decisionScreenPending: true,
    userTurns: 11,
    limitReached: false,
    alreadyAccepted: false,
    relay: undefined,
    smsDeclared: true,
    smsDeliveredLoaded: true,
  };
  const delivered = h3vnDelivered();
  const pre = decideFallbackHangup(facts, delivered, false);
  assert.equal(pre.status, "accepted", "사전 판정 = SIGNAL 턴(give_up 길을 열어 둔다)");
  const mode = fallbackHangupMode(pre);
  const goalPost = decideFallbackHangup(facts, delivered, false, "goal");
  assert.equal(goalPost.row, "4-c");
  assert.deepEqual(resolveFallbackHangupEffect({ endCall: "goal", hangupMode: mode, pre, post: goalPost }), {
    end: false,
    ignored: { row: "4-c", status: "blocked_decision" },
  });
  const giveUpPost = decideFallbackHangup(facts, delivered, false, "give_up");
  assert.deepEqual(resolveFallbackHangupEffect({ endCall: "give_up", hangupMode: mode, pre, post: giveUpPost }), { end: true, kind: "give_up" });
});

test("[P1 M1] 대상 장부 — 4-c행이 켜지는 현행 변형(4행 · 4-b행 루트 제외 · 결정 화면을 선언한 루트)", () => {
  const guarded = FLOW_VARIANTS.filter((v) => v.retired !== true)
    .filter((v) => {
      const { declared, reason } = resolveDeclaredSms(v.scenarioId, v.variantId);
      return isDecisionScreenPending({
        scenarioId: v.scenarioId,
        flowVariantId: v.variantId,
        delivered: [],
        mockScreens: [],
        declared,
        declaredKnown: reason === undefined,
        verifyEnabled: hasVerifyIntercept(v.scenarioId) && v.level === "advanced",
        followUpUserTurns: goalFollowUpFor(v.scenarioId, v.variantId),
      });
    })
    .map((v) => v.variantId)
    .sort();
  assert.deepEqual(guarded, [...EXPECTED_GUARDED].sort());
});

/** 4-c 대상(정적 산출 — 바뀌면 계획 문서 §4.1 표와 다시 대조한다 · 메인 세션 결정 2026-10-31 B안 = 결정 순간이 화면인 8루트 · P2에서 +8 = 16루트). */
const EXPECTED_GUARDED = [
  "fv-5cn4", // 기관 초급 — 안전계좌 이체 화면
  "fv-hktx", // 기관 중급
  "fv-35f2", // 카드사 중급 — 피해 구제 이체 화면
  "fv-vtq7", // 환급 초급 — 환급 신청 화면
  "fv-aqx2", // 환급 중급
  "fv-xuvu", // 은행 초급 — 보호 계좌 이체 화면
  "fv-mhnv", // 은행 중급
  "fv-h3vn", // 검찰 고급 — 자산 검수 사이트(b94b9eec)
  // ⭐ P2(2026-10-31 · X6) — 계좌 문자가 훈련용 이체 화면 링크를 병기하면서 결정 순간이 화면이 된 8루트(계획 문서 §4.1 "이체 화면 · 계좌 문자 있음" 행과 같다).
  "fv-bqr9", // 대출 초급 — 상환금 이체 화면(loan-repay-transfer)
  "fv-avap", // 대출 중급
  "fv-uaee", // 통관 초급 — 통관수수료 이체 화면(courier-fee-transfer)
  "fv-62ak", // 통관 중급
  "fv-9nx7", // 유포 협박 초급 — 입금 화면(blackmail-hush-transfer)
  "fv-kwph", // 유포 협박 중급
  "fv-egum", // 유포 협박 고급
  "fv-p3jx", // 자산 보호 고급 — 공탁금 이체 화면(asset-deposit-transfer)
  // ⭐ D-a(P2 실 키 실측 2026-11-01 · 대출 고급 fv-m3hd가 설치 화면 뒤 이체 문자 없이 goal 끊김) — 확인 무력화 세션도 4-c 대상(4행을 지난 뒤 goal 끊기는 마지막 화면까지 막힘).
  "fv-m3hd", // 대출 고급 — 점검 앱 설치 → 상환금 이체 화면
  "fv-d8pw", // 대출 고급
  "fv-6s5p", // 대출 고급(챌린지) — 신청서 → 상환금 이체 화면
  "fv-x7ue", // 카드사 고급 — 보안 앱 설치 → 피해금 이관 화면
  "fv-w3dq", // 카드사 고급(카드 배송 흐름)
  "fv-tvnj", // 카드 배송 고급(옛 세션) — 보안 점검 앱 설치
  "fv-u9fz", // 카드 배송 고급
  "fv-y3ks", // 통관 고급 — 국가 안전계좌 이체 화면
  "fv-xpvu", // 통관 고급 — 통관 확인 → 수수료 이체 화면
  "fv-uk7m", // 환급 고급 — 신청 화면 → 수수료 이체 화면
  "fv-62q8", // 은행 사칭 고급 — 보호계좌 이체 화면
  // §142 — 카드사 고급 재구성(다통화 · 배정 대기). 결정 화면 = 마지막 레그 안전계좌 이체 화면(card-safe-transfer).
  "fv-k3dn", // 카드사 고급 — 배송 전화 진입
  "fv-r8vb", // 카드사 고급 — 발급 문자 진입
];

test("[P1 M1 · D-2b] 결정 순간이 말인 4변형은 화면을 선언했어도 4-c 대상이 아니다 — P4 · P5에서 화면으로 바뀌면 옮긴다", () => {
  assert.deepEqual([...VERBAL_DECISION_VARIANTS].sort(), ["fv-a6lq", "fv-k9ra", "fv-t8ga", "fv-v2mk"]);
  for (const variantId of VERBAL_DECISION_VARIANTS) {
    const v = FLOW_VARIANTS.find((x) => x.variantId === variantId);
    assert.ok(v && v.retired !== true, `${variantId}: 현행 변형이어야 한다`);
    const { declared, reason } = resolveDeclaredSms(v.scenarioId, v.variantId);
    const base: DecisionScreenInput = {
      scenarioId: v.scenarioId,
      flowVariantId: v.variantId,
      delivered: [],
      mockScreens: [],
      declared,
      declaredKnown: reason === undefined,
      verifyEnabled: hasVerifyIntercept(v.scenarioId) && v.level === "advanced",
      followUpUserTurns: goalFollowUpFor(v.scenarioId, v.variantId),
    };
    // 목록이 실제로 막고 있다 — 변형 id만 지우면 화면 선언 때문에 대기로 바뀐다(목록이 공허하지 않다).
    assert.ok(finalDecisionScreenSms(v.scenarioId, declared) !== undefined, `${variantId}: 화면 선언이 없어졌다 — 목록에서 뺀다`);
    assert.equal(isDecisionScreenPending(base), false, variantId);
    assert.equal(isDecisionScreenPending({ ...base, flowVariantId: undefined }), true, `${variantId}: 역검증`);
    assert.ok(typeof v.decisionMoment === "string" && v.decisionMoment.length > 0, `${variantId}: 결정 순간 선언이 있어야 한다`);
  }
});

test("[P1 M1] 결정 화면 = 선언 순서상 마지막 — 전 변형에서 선언 순서가 단계 순서(notBeforeUserTurns 오름차순)와 같다", () => {
  for (const v of FLOW_VARIANTS) {
    const screens = v.sms.filter((s) => s.required && (s.purpose === "transfer" || s.purpose === "link"));
    for (let i = 1; i < screens.length; i += 1) {
      // §142 — 다통화 변형의 하한은 레그 시작 뒤 발화 수라 레그가 먼저다(레그 오름차순 · 같은 레그 안에서 하한 오름차순).
      const [prev, cur] = [screens[i - 1]!, screens[i]!];
      if (v.multiCall) {
        assert.ok((cur.leg ?? 0) > (prev.leg ?? 0) || ((cur.leg ?? 0) === (prev.leg ?? 0) && cur.notBeforeUserTurns >= prev.notBeforeUserTurns), `${v.variantId}: 선언 순서와 레그 · 하한 순서가 다르다`);
        continue;
      }
      assert.ok(cur.notBeforeUserTurns >= prev.notBeforeUserTurns, `${v.variantId}: 선언 순서와 하한 순서가 다르다`);
    }
  }
});

test("[P1 M1 배선] 실시간 · 폴백이 같은 함수로 4-c 입력을 계산하고 판정에 넘긴다 · 사후 판정은 끊기 신호 사유를 넘긴다", () => {
  const realtime = read("scammerHangup/index.ts");
  assert.ok(realtime.includes("decisionScreenPending = isDecisionScreenPending({ ...decisionScreenInput, mockScreens });"));
  assert.ok(realtime.includes("      decisionScreenPending,\n    ),\n  );"));
  assert.ok(read("scammerHangup/commit.ts").includes("hangupKind: claims.kind,"));
  const fallback = read("roleplay/index.ts");
  assert.ok(fallback.includes("decisionScreenPending = isDecisionScreenPending({ ...decisionScreenInput, mockScreens });"));
  assert.ok(fallback.includes("      completion.isMock,\n      // P1 M1 — 사후 판정은 응답의 끊기 신호 사유로 4-c행을 본다(신호 없음 = undefined = 종전).\n      endCallSignal,\n    );"));
  assert.ok(read("roleplay/chatDuringCall.ts").includes("decideFallbackHangup(hangupFacts, delivered, completion.isMock, endCall)"));
});

// ── M2 ───────────────────────────────────────────────────────────────────────────────────────────

test("[P1 M2 · b94b9eec 발화 3] 선언 밖 목적(identity)은 종전대로 보정한다 — 사건 조회 문자(link)로", () => {
  const r = correctModelSmsPurpose({ purpose: "identity", declared: H3VN_DECLARED, delivered: [], userTurns: 3 });
  assert.deepEqual(r, { purpose: "link", correctedFrom: "identity" });
});

test("[P1 M2 · b94b9eec 발화 7] 이미 도착한 사건 조회(link)를 다시 부르면 자산 검수 사이트(transfer)로 바꾸지 않는다 · 그 문자를 다시 가리키라는 지시", () => {
  const delivered: DeliveredSmsRecord[] = [{ smsId: "prosecution-case-link", userTurnsAtArrival: 3 }];
  const r = correctModelSmsPurpose({ purpose: "link", declared: H3VN_DECLARED, delivered, userTurns: 7 });
  assert.equal(r.purpose, "link", "종전: transfer로 바꿔 보냈다(로그 purposeCorrectedFrom: link)");
  assert.equal(r.correctedFrom, undefined);
  assert.equal(r.alreadyDeliveredInstruction, buildSmsAlreadyDeliveredInstruction("link"));
  // 발송 통로는 같은 목적으로 다시 판정 → 거절(쓰기 0).
  assert.equal(resolveSmsGate({ purpose: r.purpose, declared: H3VN_DECLARED, delivered, userTurns: 7, explicit: true }).status, "already_delivered");
  // 모델이 그 단계에 이르러 transfer를 부르면 그때 간다(하한 5 · 간격 1 통과).
  assert.equal(resolveSmsGate({ purpose: "transfer", declared: H3VN_DECLARED, delivered, userTurns: 7, explicit: true }).status, "allowed");
});

test("[P1 M2 · b94b9eec] 뒤 문자는 백스톱에만 맡긴다 — fv-h3vn 백스톱 간격 1: 발화 6 넛지 · 7 발송(⚠️ 이 세션에서는 도착 시점이 종전과 같다)", () => {
  const delivered: DeliveredSmsRecord[] = [{ smsId: "prosecution-case-link", userTurnsAtArrival: 3 }];
  const plan = (userTurns: number) => planSmsBackstop({ declared: H3VN_DECLARED, delivered, userTurns }).action;
  assert.equal(plan(5), "wait");
  assert.equal(plan(6), "nudge");
  assert.equal(plan(7), "deliver");
});

test("[P1 M2] 새 지시 문면 — 새로 보냈다는 주장 0 · 숫자 0 · 인용 대사 0 · 서비스 밖 행동 낱말 0", () => {
  for (const purpose of ["identity", "transfer", "link"] as const) {
    const text = buildSmsAlreadyDeliveredInstruction(purpose);
    assert.ok(text.includes("새로 보냈다고 말하지 말고"));
    assert.ok(text.includes("지금 하던 단계를 이어가라"));
    assert.equal(/[0-9]|["“”'‘’]/.test(text), false, text);
  }
  // P0 판정표(outOfServiceActions.test.ts J1~J11)의 표기 — 두 새 문면에 하나도 없어야 한다.
  const OUT_OF_SERVICE = /대출|현금|수표|금을 사|금으로 바꿔|골드바|상품권|핀 번호|거래소|코인|앱을?\s?(설치|깔)|앱스토어|플레이스토어|지우|삭제|현금지급기|현금인출기|ATM|신분증|사진첩|창구|지점|편의점|금은방|모텔|숙소|물으면|묻거든/;
  for (const text of [buildSmsAlreadyDeliveredInstruction("link"), SCAMMER_HANGUP_DECISION_PENDING_GUIDANCE]) {
    assert.equal(OUT_OF_SERVICE.test(text), false, text);
  }
});

test("[P1 M2 배선] deliverInCallSms — 이미 도착(P-2a)이면 거절 문면 대신 새 지시 · 되풀이 금지 꼬리는 그대로 앞에 · 로그 표시", () => {
  const src = read("inCallSms/index.ts");
  assert.ok(src.includes("alreadyDeliveredInstruction = corrected.alreadyDeliveredInstruction;"));
  assert.ok(src.includes('result.status === "already_delivered" && alreadyDeliveredInstruction !== undefined'));
  assert.ok(src.includes("declineInstruction: withModelToolNoRepeat(decline, trigger)"));
  assert.ok(src.includes("...(alreadyDeliveredInstruction ? { alreadyDeliveredResumed: true } : {}),"));
});
