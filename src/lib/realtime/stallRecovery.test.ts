// PR-A2(2026-10-20 · audit-A "확인 중이니 기다려라" 공회전) — Live 클라 배선의 순수 규칙 + 배선 소스 스캔.
// 순수 규칙은 `stallRecovery.ts`, 배선은 `GeminiVoiceSession.tsx` · `session/play/page.tsx`(렌더 러너가 없어 소스로 못박는다 —
// `clientTurnQueueWiring.test.ts` · `callEndingWiring.test.ts`와 같은 관례).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INITIAL_CONFIRM_RESULT_INJECTION_STATE,
  INITIAL_STALL_NUDGE_STATE,
  STALL_NUDGE_TEXT,
  STALL_SILENCE_SEC,
  VERIFY_RECONNECT_FAILED_TEXT,
  VERIFY_RECONNECT_MAX_ATTEMPTS,
  IDENTITY_ITEM_PATTERNS,
  IDENTITY_REQUEST_FORM,
  LIVE_REPEAT_BREAK_TEXT,
  EXHAUSTED_DECLARATION,
  REPEAT_MIN_CHARS,
  REPEAT_SIMILARITY_THRESHOLD,
  decideLiveRepeatBreak,
  formatLiveRepeatBreakLog,
  formatStallNudgeLog,
  isStallLine,
  judgeStallLine,
  planConfirmResultInjection,
  planVerifyReconnectFailure,
  releaseConfirmResultOnDispatch,
  stepStallNudge,
  type StallNudgeEvent,
  type StallNudgeState,
} from "./stallRecovery.ts";
import { SMS_MENTION_SILENCE_SEC, sendsAsContextInjection, stepSilenceNudge, INITIAL_SILENCE_NUDGE_STATE } from "./contextInjection.ts";
import { shouldAnnounceVerifyOffer } from "../verifyintercept/verifyIntercept.ts";

/** 주석 줄 제거(설명 주석이 스캔을 때리지 않게 — 자기 주석 함정). */
function codeOnly(source: string): string {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("{/*");
    })
    .join("\n");
}
function slice(code: string, startToken: string, endToken: string): string {
  const start = code.indexOf(startToken);
  assert.ok(start >= 0, `시작 앵커 없음: ${startToken}`);
  const end = code.indexOf(endToken, start + startToken.length);
  assert.ok(end > start, `끝 앵커 없음: ${endToken}`);
  return code.slice(start, end);
}
const sessionCode = codeOnly(readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8"));
const pageCode = codeOnly(readFileSync("src/app/session/play/page.tsx", "utf8"));
const recoveryCode = codeOnly(readFileSync("src/lib/realtime/stallRecovery.ts", "utf8"));

// ══ 1. 확인 결과 주입(audit-A R1) ════════════════════════════════════════════════════════════════

const CONFIRM = "(상대가 이 문자 안내대로 마쳤다고 말하면 …)";
const ANNOUNCE = "(방금 계좌 안내 문자가 도착했다 …)";

test("[PR-A2 결과 주입 판정표] 1 래치 · 2 신호 없음 · 3 이미 정함 → 0 / 4 안내가 큐에 있음 → 대기 / 5 그 외 → 즉시", () => {
  const S0 = INITIAL_CONFIRM_RESULT_INJECTION_STATE;
  // 1행
  assert.deepEqual(planConfirmResultInjection(S0, { instruction: CONFIRM, announceQueuedText: undefined, latched: true }), {
    state: S0,
    injectNow: null,
  });
  // 2행 — 선택 문자 · 인증번호 · 전환 뒤에는 서버가 싣지 않는다(빈 문자열 포함).
  for (const instruction of [undefined, "", "  "]) {
    assert.deepEqual(planConfirmResultInjection(S0, { instruction, announceQueuedText: ANNOUNCE, latched: false }), {
      state: S0,
      injectNow: null,
    });
  }
  // 5행 — 모델 도구 경로(안내는 이미 도구 응답으로 나갔다).
  const now = planConfirmResultInjection(S0, { instruction: CONFIRM, announceQueuedText: undefined, latched: false });
  assert.equal(now.injectNow, CONFIRM);
  assert.deepEqual(now.state, { claimed: true, pending: null });
  // 3행 — 세션당 1회(두 번째 문자 · 두 경로 겹침).
  assert.equal(planConfirmResultInjection(now.state, { instruction: CONFIRM, announceQueuedText: undefined, latched: false }).injectNow, null);
  assert.equal(planConfirmResultInjection(now.state, { instruction: CONFIRM, announceQueuedText: ANNOUNCE, latched: false }).injectNow, null);
  // 4행 — 백스톱 경로(안내가 큐에 있다) → 그 안내가 떠날 때만 풀린다.
  const queued = planConfirmResultInjection(S0, { instruction: CONFIRM, announceQueuedText: ANNOUNCE, latched: false });
  assert.equal(queued.injectNow, null);
  assert.deepEqual(queued.state, { claimed: true, pending: { afterText: ANNOUNCE, text: CONFIRM } });
  const other = releaseConfirmResultOnDispatch(queued.state, "(확인 권유 지시)");
  assert.equal(other.injectNow, null, "다른 지시가 먼저 떠나면 계속 기다린다");
  assert.deepEqual(other.state, queued.state);
  const released = releaseConfirmResultOnDispatch(other.state, ANNOUNCE);
  assert.equal(released.injectNow, CONFIRM);
  assert.deepEqual(released.state, { claimed: true, pending: null });
  assert.equal(releaseConfirmResultOnDispatch(released.state, ANNOUNCE).injectNow, null, "두 번 풀리지 않는다");
});

test("[PR-A2 결과 주입 전달 방식] confirmResult · verifyReconnectFailed는 맥락 주입(turnComplete:false)이고 문자 안내 침묵 넛지를 걸지 않는다", () => {
  for (const delivery of ["confirmResult", "verifyReconnectFailed"] as const) {
    assert.equal(sendsAsContextInjection(delivery), true, `${delivery}: turnComplete:true로 나간다(X5 위반)`);
    const step = stepSilenceNudge(INITIAL_SILENCE_NUDGE_STATE, { type: "injected", delivery, nowMs: 1000 });
    assert.equal(step.state.armedAt, null, `${delivery}: "방금 보낸 문자" 넛지가 걸린다`);
  }
});

// ══ 2. 대기 뒤 침묵 넛지(audit-A R6 · F6) ════════════════════════════════════════════════════════

// audit-A 원문(scratchpad/audit/stall-out — Live 3 · 폴백 3 기록에서 턴 원문 그대로).
const AUDIT_STALL_TURNS: Array<[string, string]> = [
  ["Live 초급 C9", "네, 입금 확인되는 대로 신규 대출 승인 절차를 빠르게 진행 도와드리겠습니다. 잠시만 기다려 주세요."],
  ["Live 초급 C11", "거의 다 되었습니다, 고객님. 전산 처리 과정에서 조금 지연되고 있는데, 확인되는 대로 바로 안내해 드릴게요."],
  ["Live 초급 C13", "확인이 거의 다 완료되어 가고 있으니 조금만 더 기다려 주시면 바로 안내해 드리겠습니다."],
  ["Live 고급 C14", "확인되는 대로 바로 다음 단계 안내드릴 테니 잠시만 그대로 기다려 주세요, 고객님."],
  ["폴백 초급 C11", "시스템에서 일시적으로 전송 지연이 발생하는 것 같네요. 잠시만 기다려 주시면 다시 한번 발송해 드리겠습니다."],
  // 폴백 고급 C10 축약본(대기 문장 부분 — 대기 문장 뒤에 설명이 붙은 꼴 · 재QA F-1).
  ["폴백 고급 C10 축약", "아직 입금이 확인되지 않아서 대기 중입니다, 고객님. 지금 전산상에 300만 원 입금 내역이 들어와야…"],
];
/** 폴백 고급 C10 원문 전체 — 입금 진행을 묻는 질문으로 끝난다(참가자 차례 · 2행). */
const AUDIT_C10_FULL =
  "아직 입금이 확인되지 않아서 대기 중입니다, 고객님. 지금 전산상에 300만 원 입금 내역이 들어와야 보증보험 등록이 완료되거든요. \n\n시간이 얼마 없습니다. 제가 안내해 드린 OO은행 계좌로 지금 바로 송금해 주셔야 저희도 심사 부서에 완료 보고를 올릴 수 있어요. 혹시 금액이 조금 부담되시는 건가요? 그러시면 절반인 150만 원이라도 먼저 입금해 주시면, 나머지 금액은 대출 실행일에 잔금에서 빼드릴 수 있게 조정해 드릴게요. 바로 입금 진행하시겠어요?";

/** 리뷰 Major 2 오탐 표본(M2-1~M2-5) — 전부 비대기. */
const M2_NOT_STALL: Array<[string, string]> = [
  ["M2-1", "잠시만요 선생님, 이 계좌로 지금 바로 이체해 주세요."], // 요구로 끝남(3행)
  ["M2-2", "입금 확인되면 말씀해 주세요."], // 참가자 행동을 기다리는 정당한 대기(3행)
  ["M2-3", "입금 확인되면 말씀해주세요"],
  ["M2-4", "확인 중입니다. 지금 바로 앱을 설치해 주세요."], // 대기 뒤 요구로 끝남(3행)
  ["M2-5", "잠시만요, 조회해 보겠습니다. 고객님 한도는 천만 원까지 승인됐습니다."], // 대기 뒤 결과로 끝남(4행)
];

test("[PR-A2 F6 판정표 · C안] audit-A 원문 대기 6 = 대기 · C10 원문 전체 = 비대기(질문 끝) · 질문 · 일반 턴 · 한 어절 질문 꼬리 = 비대기", () => {
  for (const [name, line] of AUDIT_STALL_TURNS) assert.equal(isStallLine(line), true, `놓침(${name}): ${line}`);
  assert.equal(isStallLine(AUDIT_C10_FULL), false, "C10 원문 전체는 질문으로 끝난다 — 참가자 차례(2행)");
  for (const line of [
    "",
    "   ",
    // Live 중급 C10 — 마지막 문장이 참가자에게 묻는다.
    "네, 입금 확인 절차 진행 중입니다. 혹시 이체하신 금액이 정확히 얼마인지 다시 한번 말씀해 주시겠어요?",
    "대출 몇 건이세요?",
    "대기자 명단에 올려 두었습니다. 지금 바로 이체를 진행해 주셔야 합니다.",
    "고객님 명의로 대출 신청이 접수돼 있습니다.",
    // 재리뷰 Minor — 맨 끝이 한 어절 질문이어도 참가자 차례다.
    "지금 확인 중입니다. 맞죠?",
    "잠시만 기다려 주세요. 네?",
  ]) {
    assert.equal(isStallLine(line), false, `오탐: ${line}`);
  }
});

test("[PR-A2 리뷰 Major 2 · C안] M2-1~M2-5 비대기 유지 · 대기를 청하는 끝맺음 · 호칭 꼬리는 대기 · 1차 판정(전체 텍스트 · 요청형 행 없음)은 M2를 오탐했다(역검증)", () => {
  /** 1차 판정 그대로(전체 텍스트 어휘 · 맨 끝 질문만 제외) — 역검증 전용 사본. */
  const firstVersion = (text: string): boolean => {
    const t = text.trim();
    if (!t) return false;
    const ss = t.match(/[^.?!\n]+[.?!]?/g) ?? [];
    if ((ss[ss.length - 1] ?? "").trim().endsWith("?")) return false;
    return /확인\s*(?:하는\s*)?중|확인하고\s*있|확인\s*절차|처리\s*(?:하는\s*)?중|처리하고\s*있|조회\s*중|확인되는\s*대로|처리되는\s*대로|확인되면|기다려|기다리|대기\s*중|지연|잠시만/.test(t);
  };
  for (const [name, line] of M2_NOT_STALL) {
    assert.equal(isStallLine(line), false, `오탐(${name}): ${line}`);
    assert.equal(firstVersion(line), true, `역검증 전제 — 1차 판정이 ${name}를 대기로 잡아야 한다`);
  }
  for (const line of [
    "잠시만 기다려 주세요. 고객님.",
    "알겠습니다. 확인되는 대로 바로 다음 단계 안내드릴 테니 잠시만 그대로 기다려 주세요, 고객님.",
    "조금만 더 기다려 주시면 바로 안내해 드리겠습니다.",
    "잠시만 대기해 주세요.",
  ]) {
    assert.equal(isStallLine(line), true, `놓침: ${line}`);
  }
});

test("[PR-A2 C안 ③④ 역검증] 결과 진술 행(③) · 부정 단서 행(④)을 뺀 사본에서 해당 표본이 뒤집힌다 — 같은 실행 출력", () => {
  const ALL = { resultStatement: true, negatedResult: true };
  const NO_RESULT_ROW = { resultStatement: false, negatedResult: false }; // ③ 제거(④는 ③의 단서라 함께 빠진다)
  const NO_NEGATION_ROW = { resultStatement: true, negatedResult: false }; // ④ 제거
  // ③ — 대기 말 뒤에 결과를 낸 턴은 비대기. 행을 빼면 대기로 뒤집힌다.
  const resultSamples = [
    "잠시만요, 조회해 보겠습니다. 고객님 한도는 천만 원까지 승인됐습니다.", // M2-5
    "확인 중입니다. 네 고객님, 입금 확인되었습니다.",
    "잠시만 기다려 주세요. 등록 처리가 완료되었습니다.",
  ];
  // ④ — 부정형 결과 진술은 결과가 아니다(대기 쪽). 행을 빼면 비대기로 뒤집힌다.
  const negatedSamples = [
    "잠시만요, 조회 중입니다. 입금이 확인되지 않았습니다.", // 마지막 문장 = 부정형 결과 · 앞에 대기 어휘
    "확인 중입니다. 아직 처리가 안 됐습니다.",
  ];
  const flipped: string[] = [];
  for (const s of resultSamples) {
    assert.equal(judgeStallLine(s, ALL), false, `③ 결과 진술 놓침: ${s}`);
    if (judgeStallLine(s, NO_RESULT_ROW) === true) flipped.push(`③ ${s}`);
  }
  for (const s of negatedSamples) {
    assert.equal(judgeStallLine(s, ALL), true, `④ 부정형 결과를 결과로 봤다: ${s}`);
    if (judgeStallLine(s, NO_NEGATION_ROW) === false) flipped.push(`④ ${s}`);
  }
  console.log(`[C안 역검증] 행을 뺀 사본에서 뒤집힌 표본 ${flipped.length}/${resultSamples.length + negatedSamples.length}`);
  assert.equal(flipped.length, resultSamples.length + negatedSamples.length, "뒤집히지 않는 표본은 그 행의 증거가 아니다");
  // 지시 표본 — 부정형 결과 + 대기 요청으로 끝나는 턴은 대기(③④와 무관하게 5행).
  assert.equal(isStallLine("아직 입금이 확인되지 않았습니다. 잠시만 기다려 주세요."), true);
  // 판정 본체를 전부 켠 것이 제품 판정이다.
  for (const [, line] of [...AUDIT_STALL_TURNS, ...M2_NOT_STALL]) assert.equal(isStallLine(line), judgeStallLine(line, ALL));
});

const turn = (nowMs: number, stallLike: boolean, participantHasSpoken = true): StallNudgeEvent => ({
  type: "scammerTurn",
  nowMs,
  stallLike,
  participantHasSpoken,
});
const tick = (nowMs: number, over: Partial<Extract<StallNudgeEvent, { type: "tick" }>> = {}): StallNudgeEvent => ({
  type: "tick",
  nowMs,
  modelIdle: true,
  userSpeakingLocally: false,
  otherNudgeArmed: false,
  ...over,
});
function run(events: StallNudgeEvent[]): { fires: number[]; state: StallNudgeState } {
  let state = INITIAL_STALL_NUDGE_STATE;
  const fires: number[] = [];
  for (const e of events) {
    const step = stepStallNudge(state, e);
    state = step.state;
    if (step.fire) fires.push(e.nowMs);
  }
  return { fires, state };
}

test("[PR-A2 F6 전이] 대기 턴 뒤 8초 침묵 · 모델 유휴면 1회 — 7.999초에는 없다 · 설계값은 문자 넛지와 같은 8초", () => {
  assert.equal(STALL_SILENCE_SEC, 8);
  assert.equal(STALL_SILENCE_SEC, SMS_MENTION_SILENCE_SEC);
  assert.deepEqual(run([turn(1000, true), tick(8999)]).fires, []);
  assert.deepEqual(run([turn(1000, true), tick(9000)]).fires, [9000]);
});

test("[PR-A2 F6 전이] 참가자가 다시 말할 때까지 재발동 0 — 넛지 응답이 또 대기로 끝나도 자기 구동 루프가 없다", () => {
  const r = run([turn(0, true), tick(8000), turn(12000, true), tick(30000), tick(60000)]);
  assert.deepEqual(r.fires, [8000]);
  // 참가자가 말하면 이력이 풀리고 다음 대기 뒤 침묵에 다시 1회.
  const r2 = run([turn(0, true), tick(8000), { type: "userSpeech", nowMs: 9000 }, turn(10000, true), tick(18000)]);
  assert.deepEqual(r2.fires, [8000, 18000]);
});

test("[PR-A2 F6 전이] 보류 · 해제 — 참가자 발화 · 대기가 아닌 다음 턴 · 오프닝 구간 · 모델 발화 중 · 로컬 발화 중 · 문자 넛지 대기 중", () => {
  assert.deepEqual(run([turn(0, true), { type: "userSpeech", nowMs: 3000 }, tick(9000)]).fires, [], "참가자 발화가 취소한다");
  assert.deepEqual(run([turn(0, true), turn(2000, false), tick(11000)]).fires, [], "마지막 턴이 대기가 아니면 해제");
  assert.deepEqual(run([turn(0, true, false), tick(9000)]).fires, [], "참가자가 아직 한 번도 말하지 않았다(오프닝)");
  assert.deepEqual(run([turn(0, true), tick(9000, { modelIdle: false }), tick(10000)]).fires, [10000], "모델 발화 중 보류 → 유휴 첫 점검에서 1회");
  assert.deepEqual(run([turn(0, true), tick(9000, { userSpeakingLocally: true })]).fires, []);
  assert.deepEqual(run([turn(0, true), tick(9000, { otherNudgeArmed: true }), tick(9500)]).fires, [9500], "문자 넛지가 먼저");
});

test("[PR-A2 F6 문면] 넛지 · 전환 실패 문면 — 숫자 · 횟수 표현 · 번호/인증번호 · 따옴표 · 끊기 어휘 · 재촉 0 / 결과 제시 · 다음 단계 · 대기 금지 포함", () => {
  for (const text of [STALL_NUDGE_TEXT, VERIFY_RECONNECT_FAILED_TEXT]) {
    assert.equal(/[0-9０-９]/.test(text), false, `숫자: ${text}`);
    assert.equal(/한\s*번|두\s*번|세\s*번|몇|횟수|차례|번째|다시|또|반복|되풀이|[일이삼사오]\s*회/.test(text), false, `횟수 표현: ${text}`);
    assert.equal(/번호|인증/.test(text), false, `번호/인증번호: ${text}`);
    assert.equal(/["“”'‘’]/.test(text), false, `따옴표 대사: ${text}`);
    assert.equal(/끊|마무리|종료|통화를\s*(?:마|끝)|끝내/.test(text), false, `끊기 어휘: ${text}`);
    assert.equal(/재촉|다급/.test(text), false, `재촉·다급: ${text}`);
    assert.ok(text.startsWith("(") && text.endsWith(")"), "지시는 괄호 한 덩어리(다른 오케스트레이션 신호와 같은 꼴)");
  }
  assert.ok(STALL_NUDGE_TEXT.includes("결과를 그럴듯하게 정해 지금 알려 주고"));
  assert.ok(STALL_NUDGE_TEXT.includes("다음 요구로 넘어가라"));
  assert.ok(STALL_NUDGE_TEXT.includes("기다려 달라는 말은 하지 마라"));
  assert.ok(VERIFY_RECONNECT_FAILED_TEXT.includes("연결이 안 됐다고 말하지 말고"));
  assert.ok(VERIFY_RECONNECT_FAILED_TEXT.includes("지금 하던 이야기를 그대로 이어가라"));
  assert.equal(formatStallNudgeLog({ sinceScammerTurnMs: 8123.6 }), 'cause:"silence" trigger:"stall" sinceScammerTurnMs=8124');
});

// ══ 3. 자동 호 전환 실패(audit-A R8 · F8) ═════════════════════════════════════════════════════════

test("[PR-A2 F8 판정표] 1 래치 → none / 2 첫 실패 → retry / 3 폴백 최종 실패 → none / 4 실시간 최종 실패 → inject", () => {
  assert.equal(VERIFY_RECONNECT_MAX_ATTEMPTS, 2, "첫 시도 + 재시도 1회");
  assert.deepEqual(planVerifyReconnectFailure({ attemptsMade: 1, latched: true, callMode: "realtime" }), { action: "none" });
  assert.deepEqual(planVerifyReconnectFailure({ attemptsMade: 1, latched: false, callMode: "realtime" }), { action: "retry" });
  assert.deepEqual(planVerifyReconnectFailure({ attemptsMade: 1, latched: false, callMode: "fallback" }), { action: "retry" });
  assert.deepEqual(planVerifyReconnectFailure({ attemptsMade: 2, latched: false, callMode: "fallback" }), { action: "none" });
  assert.deepEqual(planVerifyReconnectFailure({ attemptsMade: 2, latched: false, callMode: "realtime" }), {
    action: "inject",
    text: VERIFY_RECONNECT_FAILED_TEXT,
  });
  assert.deepEqual(planVerifyReconnectFailure({ attemptsMade: 2, latched: true, callMode: "realtime" }), { action: "none" });
});

// ══ 4. 체크리스트 — 폴백 계열 B에서 deliverVerifyOffer 신규 호출 0(C6-R · R4 전제) ═════════════════

test("[PR-A2 체크리스트] deliverVerifyOffer 호출부는 종전 그대로(화면 1 · 세션 컴포넌트 1) · 새 재시도 경로는 재연결 콜러블만 부른다 · 계열 B는 오퍼 개시 게이트가 닫혀 있다", () => {
  assert.equal(pageCode.split("deliverVerifyOffer(").length - 1, 1, "화면에 오퍼 개시 호출이 늘었다");
  assert.equal(sessionCode.split("deliverVerifyOffer(").length - 1, 1, "세션 컴포넌트(실시간 전용)에 오퍼 개시 호출이 늘었다");
  const place = slice(pageCode, "const handlePlaceVerifyCall = async () => {", "useEffect(() => {");
  assert.equal(place.includes("deliverVerifyOffer"), false, "재시도 경로가 오퍼 개시를 부른다");
  assert.ok(place.includes("deliverVerifyReconnect({"), "재시도는 재연결 콜러블이어야 한다");
  assert.ok(place.includes("if (!sessionId || !verifyOffer || verifyDialing) return;"), "오퍼 문서가 없으면(계열 B 폴백) 진입 0");
  // 계열 B — 참가자 의사 operand는 상수 false(§49 V5)이고, 그 값으로는 게이트가 닫힌다(폴백 계열 B = 오퍼 문서 0).
  assert.ok(pageCode.includes("const [verifyIntentExpressed] = useState(false);"));
  assert.equal(shouldAnnounceVerifyOffer({ series: "B", gateReached: true, intentExpressed: false }), false);
  assert.equal(shouldAnnounceVerifyOffer({ series: "A", gateReached: true, intentExpressed: false }), true, "대조군");
  // 새 맥락 주입 · 넛지 코드는 오퍼 개시 · 확인 권유 백스톱과 무관하다.
  for (const forbidden of ["deliverVerifyOffer", "claimVerifyAnnounceSlot", "verifyOfferPhaseRef"]) {
    assert.equal(recoveryCode.includes(forbidden), false, `순수 규칙이 ${forbidden}를 안다`);
  }
});

// ══ 5. 체크리스트 — END_CALL_LIVE_AVAILABLE=false여도 공회전이 끝난다 ═══════════════════════════════

/** 서버 운영값을 소스에서 읽는다(⛔ liveTools.ts는 이 PR이 고치지 않는다 — 값이 무엇이든 아래 판정이 같아야 한다). */
function readEndCallLiveAvailable(): boolean {
  const src = readFileSync("functions/src/realtime/liveTools.ts", "utf8");
  const m = /export const END_CALL_LIVE_AVAILABLE = (true|false);/.exec(src);
  assert.ok(m, "END_CALL_LIVE_AVAILABLE 선언을 찾지 못했다");
  return m[1] === "true";
}

/**
 * audit-A 대본 A의 Live 구간(참가자 "보냈어요" → 사기범 대기 턴 → 참가자 침묵 15초)을 클라 규칙으로 돌린다. `endCallLive`는
 * 서버 스위치 값이다 — 클라 규칙은 이 값을 **입력으로 받지 않으므로** 결과가 같아야 한다(끊기 경로에 기대지 않는다).
 */
function simulateStallAfterTransfer(endCallLive: boolean): { nudges: number; confirmInjected: boolean; liveTools: { endCall?: string } } {
  const liveTools = endCallLive ? { endCall: "end_call" } : {};
  // 결과 신호: 백스톱 경로로 필수 계좌 문자 도착 → 안내가 큐를 떠나며 결과 신호가 뒤따른다.
  let confirm = planConfirmResultInjection(INITIAL_CONFIRM_RESULT_INJECTION_STATE, {
    instruction: CONFIRM,
    announceQueuedText: ANNOUNCE,
    latched: false,
  });
  confirm = releaseConfirmResultOnDispatch(confirm.state, ANNOUNCE);
  // 넛지: 참가자 "알겠어요, 보냈어요" → 사기범 "잠시만 기다려 주세요" → 15초 침묵(1초 점검).
  const events: StallNudgeEvent[] = [
    { type: "userSpeech", nowMs: 0 },
    turn(1000, isStallLine("네, 입금 확인되는 대로 신규 대출 승인 절차를 빠르게 진행 도와드리겠습니다. 잠시만 기다려 주세요.")),
  ];
  for (let t = 2000; t <= 16000; t += 1000) events.push(tick(t));
  return { nudges: run(events).fires.length, confirmInjected: confirm.injectNow === CONFIRM, liveTools };
}

test("[PR-A2 체크리스트 · end_call 끔] 서버 스위치가 false(주입)여도 결과 신호 주입 1 · 대기 뒤 넛지 1 — 운영값으로 돌려도 같다", () => {
  const off = simulateStallAfterTransfer(false);
  assert.equal(off.liveTools.endCall, undefined, "전제 — 끔이면 클라 credentials에 end_call이 없다");
  assert.equal(off.confirmInjected, true, "끔에서 결과 신호가 주입되지 않는다");
  assert.equal(off.nudges, 1, "끔에서 대기 뒤 침묵 넛지가 나가지 않는다(R6 공회전 그대로)");
  const operational = readEndCallLiveAvailable();
  const op = simulateStallAfterTransfer(operational);
  console.log(`[PR-A2 end_call] 운영값 END_CALL_LIVE_AVAILABLE=${operational} · 끔 넛지 ${off.nudges} · 운영값 넛지 ${op.nudges}`);
  assert.deepEqual({ nudges: op.nudges, confirmInjected: op.confirmInjected }, { nudges: off.nudges, confirmInjected: off.confirmInjected });
});

test("[PR-A2 체크리스트 · end_call 끔] 새 코드는 끊기 경로를 참조하지 않는다 — 순수 규칙 · 넛지 블록 · 맥락 주입 effect · 결과 주입 · 재시도 경로", () => {
  const blocks: Array<[string, string]> = [
    ["stallRecovery.ts", recoveryCode],
    ["넛지 블록", slice(sessionCode, "let stallNudgeState = INITIAL_STALL_NUDGE_STATE;", "let turnInProgress = false;")],
    ["맥락 주입 effect", slice(sessionCode, "if (!contextTurn || !contextTurn.text.trim()) return;", "}, [contextTurn?.seq]);")],
    ["결과 주입(화면)", slice(pageCode, "const offerConfirmResult = useCallback(", "const handleConfirmResultInstruction = ")],
    ["재시도(화면)", slice(pageCode, "const handlePlaceVerifyCall = async () => {", "useEffect(() => {")],
  ];
  for (const [name, code] of blocks) {
    assert.equal(/endCall|end_call|END_CALL|requestScammerHangup|onScammerHangup/.test(code), false, `${name}가 끊기 경로를 참조한다`);
  }
});

// ══ 6. 배선(G510 래치 · 순서 · G105 · X5) ══════════════════════════════════════════════════════════

test("[PR-A2 배선 · 세션 컴포넌트] 넛지는 래치 뒤 0 · silence 큐 턴 · 비어 있지 않은 경계에서만 판정 · 참가자 발화가 취소 · 언마운트 정리", () => {
  const check = slice(sessionCode, "const runStallNudgeCheck = () => {", "const noteScammerTurnForStallNudge = ");
  assert.ok(
    check.indexOf("if (handlersRef.current.isHangupLatched()) return;") >= 0 &&
      check.indexOf("if (handlersRef.current.isHangupLatched()) return;") < check.indexOf("dispatchClientTurn("),
    "넛지가 래치 뒤에도 나간다(G510)",
  );
  assert.ok(check.includes('dispatchClientTurn({ type: "request", turn: { kind: "silence", text: STALL_NUDGE_TEXT }, nowMs });'));
  assert.ok(check.includes("otherNudgeArmed: silenceNudgeState.armedAt !== null,"));
  const tc = slice(sessionCode, "if (hasTurnComplete) {", "onerror:");
  assert.ok(tc.indexOf("const scammerTurnText = scammerBuffer;") < tc.indexOf("flushTranscript();"), "flush가 비운 뒤에 읽는다");
  assert.ok(tc.includes("if (!emptyTurn) noteScammerTurnForStallNudge(scammerTurnText);"), "빈 마감에서도 판정한다");
  const note = slice(sessionCode, "const noteUserSpeechForNudge = () => {", "let clientTurnTick");
  assert.ok(note.includes('stallNudgeState = stepStallNudge(stallNudgeState, { type: "userSpeech", nowMs: performance.now() }).state;'));
  assert.ok(slice(sessionCode, "const cleanup = () => {", "cleanupRef.current = cleanup;").includes("clearStallNudgeTimer();"));
  assert.ok(sessionCode.includes("}, STALL_SILENCE_SEC * 1000);"), "대기는 설계값 상수로만 건다");
});

test("[PR-A2 배선 · 세션 컴포넌트] 맥락 주입 슬롯 — instructionTurn 뒤 · personaStateTurn 앞 effect · 래치 가드 · 맥락 주입 함수 경유(turnComplete:false) · 전사 기록 0 · 결과 신호는 도구 응답 전송 뒤", () => {
  const effect = slice(sessionCode, "if (!contextTurn || !contextTurn.text.trim()) return;", "}, [contextTurn?.seq]);");
  assert.ok(effect.includes("if (handlersRef.current.isHangupLatched()) return;"));
  assert.ok(effect.includes("if (injectContextRef.current?.(contextTurn.text, contextTurn.delivery)) {"));
  assert.equal(/onTranscriptTurn|turnComplete: true|requestClientTurnRef/.test(effect), false);
  const iInstr = sessionCode.indexOf("}, [instructionTurn?.seq]);");
  const iCtx = sessionCode.indexOf("}, [contextTurn?.seq]);");
  const iPersona = sessionCode.indexOf("}, [personaStateTurn?.seq]);");
  assert.ok(iInstr < iCtx && iCtx < iPersona, "같은 렌더에서 도착 안내가 결과 신호보다 먼저 나가야 한다");
  const toolBlock = slice(sessionCode, "const responses = await collectToolResponses(", 'dispatchClientTurn({ type: "toolResponseSent"');
  assert.ok(
    toolBlock.indexOf("session.sendToolResponse(") < toolBlock.indexOf("handlersRef.current.onConfirmResultInstruction?.(confirmText)"),
    "결과 신호가 도착 안내(도구 응답)보다 먼저 간다",
  );
  assert.ok(sessionCode.includes('if (result.status === "delivered" && result.confirmResultInstruction) {'));
});

test("[PR-A2 배선 · 화면] 백스톱은 안내를 큐에 넣기 전에 판정 · 드레인이 대기분을 푼다 · 재시도는 순수 판정 · 슬롯을 세션 컴포넌트에 넘긴다", () => {
  const backstop = slice(pageCode, 'if (result.status === "none_pending") state.nonePending = true;', 'if (result.status === "nudge"');
  const iOffer = backstop.indexOf("offerConfirmResult(result.confirmResultInstruction, result.announceInstruction);");
  const iEnqueue = backstop.indexOf('enqueueTurnInstruction(result.announceInstruction, "sms");');
  assert.ok(iOffer >= 0 && iOffer < iEnqueue, "안내가 즉시 드레인되면 대기분이 영영 안 풀린다");
  const drain = slice(pageCode, "const drainInstructionQueue = useCallback(() => {", "const enqueueTurnInstruction = useCallback(");
  assert.ok(
    drain.indexOf("setInstructionTurn((prev)") < drain.indexOf("releaseConfirmResultOnDispatch(confirmResultInjectionRef.current, item.text);"),
  );
  const offer = slice(pageCode, "const offerConfirmResult = useCallback(", "const handleConfirmResultInstruction = ");
  assert.ok(offer.includes("latched: isEndLatched(callEndingRef.current),"));
  const place = slice(pageCode, "const handlePlaceVerifyCall = async () => {", "useEffect(() => {");
  assert.ok(place.includes("const plan = planVerifyReconnectFailure({"));
  assert.ok(place.includes("for (let attempt = 1; attempt <= VERIFY_RECONNECT_MAX_ATTEMPTS && result === null; attempt += 1) {"));
  assert.ok(place.includes("latched: isEndLatched(callEndingRef.current),"), "래치 뒤 재시도 · 주입 0(G510)");
  assert.ok(place.includes('pushContextTurn(text, "verifyReconnectFailed");'));
  assert.ok(pageCode.includes("contextTurn={contextTurn}"));
  assert.ok(pageCode.includes("onConfirmResultInstruction={handleConfirmResultInstruction}"));
  // 자동 전환 래치(오퍼당 1회)는 그대로다.
  assert.ok(pageCode.includes("autoReconnectOfferIdRef.current = verifyOffer.offerId"));
});

test("[PR-A2 리뷰 Minor 1] 맥락 주입 슬롯은 실제로 보냈을 때만 비운다 — 연결 전 · 재마운트 공백분은 쥐었다가 연결 직후 1회(유실 0) · 보낸 뒤 비워 재주입 0(중복 0)", () => {
  // 세션 컴포넌트 — 못 보내면 쥐고, 보내면 부모에 알린다.
  const effect = slice(sessionCode, "if (!contextTurn || !contextTurn.text.trim()) return;", "}, [contextTurn?.seq]);");
  assert.ok(effect.includes("handlersRef.current.onContextTurnDelivered?.(contextTurn.seq);"));
  assert.ok(effect.includes("pendingContextTurnRef.current = contextTurn;"), "세션이 없을 때 버린다(결과 신호 영구 소실)");
  // 맥락 주입 함수는 보냈는지를 돌려준다(세션 없음 · 전송 예외 = false).
  const inject = slice(sessionCode, "const injectContext = (text: string, delivery: InstructionDelivery): boolean => {", "let stallNudgeState = ");
  assert.ok(inject.includes("if (!activeSession) return false;"));
  assert.ok(inject.includes("return true;"));
  // 연결 직후(주입 함수를 노출한 바로 그 자리) 쥔 것을 보낸다 · 래치 뒤 0.
  const connect = slice(sessionCode, "injectContextRef.current = injectContext;", "OPENING_TRIGGER_TURN");
  assert.ok(connect.includes("const pendingContext = pendingContextTurnRef.current;"));
  assert.ok(connect.includes("!handlersRef.current.isHangupLatched() && injectContext(pendingContext.text, pendingContext.delivery)"));
  assert.ok(connect.includes("handlersRef.current.onContextTurnDelivered?.(pendingContext.seq);"));
  // 화면 — 전달 확인이 온 seq만 비운다 · seq는 단조 증가(비운 뒤에도 재사용 0).
  assert.ok(pageCode.includes("setContextTurn((prev) => (prev && prev.seq === seq ? null : prev));"));
  assert.ok(pageCode.includes("onContextTurnDelivered={handleContextTurnDelivered}"));
  const push = slice(pageCode, "const pushContextTurn = useCallback(", "const handleContextTurnDelivered = ");
  assert.ok(push.includes("contextTurnSeqRef.current += 1;"));
  assert.equal(/prev\?\.seq \?\? 0\) \+ 1, delivery: "(?:confirmResult|verifyReconnectFailed)"/.test(pageCode), false, "prev 기반 seq가 남았다(비운 뒤 1로 되돌아간다)");
  assert.equal((pageCode.match(/setContextTurn\(/g) ?? []).length, 2, "슬롯 쓰기는 pushContextTurn · 전달 확인 두 곳뿐");
});

// ── §104 — 반복 · 대기 정체 차단(전수 검수 2차 F4 · F11 · DECISIONS #219) ─────────────────────────────────
/** 대본을 한 턴씩 진행하며, 각 사기범 턴이 끝난 경계에서 주입 종류를 기록한다(참가자는 매 턴 말했다고 본다). */
function repeatBreakMarks(turns: readonly string[]): (string | null)[] {
  return turns.map((turn, i) =>
    decideLiveRepeatBreak({ previousScammerTurn: turns[i - 1], scammerTurn: turn, latched: false, participantHasSpoken: true }),
  );
}

// F11(실 키 Live · 따름형) — 요구를 다 쓴 뒤 참가자 발화 사이사이 대기 말 6턴.
const F11_WAIT_SCRIPT = [
  "확인됐습니다. 안전계좌로 이관 처리가 끝났습니다.",
  "대기해 주십시오.",
  "잠시만요, 대기해 주십시오.",
  "추가 안내가 있을 때까지 계속 대기해 주십시오.",
  "잠시만 기다려 주세요.",
  "대기해 주십시오.",
  "잠시만요.",
];
// F4(실 키 Live · 거절형) — 성함·생년월일 요구 3연속.
const F4_IDENTITY_SCRIPT = [
  "금융감독원입니다. 고객님 명의 계좌가 범죄에 연루돼 연락드렸습니다.",
  "본인 확인이 먼저입니다. 성함과 생년월일 불러주십시오.",
  "절차상 필요합니다. 성함과 생년월일 말씀해 주시겠습니까?",
  "공범으로 분류될 수 있습니다. 성함과 생년월일 불러주셔야 합니다.",
];

test("[§104 F11 대본] 대기 말이 두 턴 이어지면 그 경계에서 주입 — 이전(주입 0) 6연속 → 이후 주입 없이 허용되는 대기 말 최대 2턴", () => {
  const marks = repeatBreakMarks(F11_WAIT_SCRIPT);
  assert.deepEqual(marks, [null, null, "stall", "stall", "stall", "stall", "stall"]);
  const firstInjection = marks.indexOf("stall");
  assert.equal(firstInjection, 2, "둘째 대기 말이 끝난 경계 = 셋째 대기 말 전에 주입");
  // "대기해 주십시오"는 2절 넛지 판정(`isStallLine`)에서는 대기가 아니다 — 이 절이 따로 잡는다(2절 표 무변경).
  assert.equal(isStallLine("대기해 주십시오."), false);
  assert.ok(LIVE_REPEAT_BREAK_TEXT.stall.includes("새 요구를 꺼내라"));
});

test("[§104 F4 대본] 같은 인적사항 요구가 두 턴 이어지면 주입 · 순순히 따르는 흐름은 0", () => {
  assert.deepEqual(repeatBreakMarks(F4_IDENTITY_SCRIPT), [null, null, "identity", "identity"]);
  const comply = [
    "본인 확인부터 하겠습니다. 성함과 생년월일 불러주십시오.",
    "홍길동님 맞으시죠? 주민번호 뒤 7자리도 불러주셔야 조회가 됩니다.",
    "확인됐습니다. 최근에 통장 개설하신 적 있으세요?",
    "그 계좌가 범죄에 쓰였습니다. 문자로 보낸 안전계좌로 잔액을 옮기셔야 합니다.",
  ];
  assert.deepEqual(repeatBreakMarks(comply), [null, null, null, null]);
  assert.equal(
    decideLiveRepeatBreak({ previousScammerTurn: "네, 알겠습니다. 직접 확인해 보시지요.", scammerTurn: "네, 알겠습니다. 직접 확인해 보시지요.", latched: false, participantHasSpoken: true }),
    "similar",
  );
});

test("[§104 판정표 1~3행] 래치 · 오프닝 구간 · 직전 턴 없음 = 주입 0", () => {
  const base = { previousScammerTurn: "대기해 주십시오.", scammerTurn: "대기해 주십시오." };
  assert.equal(decideLiveRepeatBreak({ ...base, latched: true, participantHasSpoken: true }), null);
  assert.equal(decideLiveRepeatBreak({ ...base, latched: false, participantHasSpoken: false }), null);
  assert.equal(decideLiveRepeatBreak({ previousScammerTurn: undefined, scammerTurn: "대기해 주십시오.", latched: false, participantHasSpoken: true }), null);
  assert.equal(decideLiveRepeatBreak({ ...base, latched: false, participantHasSpoken: true }), "stall");
});

test("[§104 문면] 주입 3종 — 괄호 한 덩어리 · 숫자 · 횟수 표현 · 따옴표 · 끊기 어휘 0", () => {
  for (const text of Object.values(LIVE_REPEAT_BREAK_TEXT)) {
    assert.ok(text.startsWith("(") && text.endsWith(")"), text);
    assert.equal(/[0-9０-９]/.test(text), false, `숫자: ${text}`);
    assert.equal(/한\s*번|두\s*번|세\s*번|몇|횟수|번째|[일이삼사오]\s*회/.test(text), false, `횟수 표현: ${text}`);
    assert.equal(/["“”'‘’]/.test(text), false, `따옴표 대사: ${text}`);
    // §104 — 끊을지는 [진행 강제] 끊기 항목에 맡기는 위임 구절만 허용한다(직접 끊으라는 말 · 작별 어휘 0).
    const withoutDelegate = text.replace("[진행 강제]의 통화 끝내기 항목이 정한 대로 하라", "");
    assert.equal(/끊|마무리|종료|통화를\s*(?:마|끝)|끝내/.test(withoutDelegate), false, `끊기 어휘: ${text}`);
  }
  assert.equal(formatLiveRepeatBreakLog("identity"), 'cause:"repeat" kind:"identity"');
});

test("[§104 짝] 클라 판정표 5 · 6행 = 서버 `repeatBreak.ts` 2 · 3행(정규식 · 임계값 · 지시 문면 글자 단위)", () => {
  const server = readFileSync("functions/src/roleplay/repeatBreak.ts", "utf8");
  assert.ok(server.includes(`export const REPEAT_SIMILARITY_THRESHOLD = ${REPEAT_SIMILARITY_THRESHOLD};`));
  assert.ok(server.includes(`export const REPEAT_MIN_CHARS = ${REPEAT_MIN_CHARS};`));
  assert.ok(server.includes(`export const IDENTITY_REQUEST_FORM = ${IDENTITY_REQUEST_FORM.toString()};`));
  for (const [key, re] of Object.entries(IDENTITY_ITEM_PATTERNS)) {
    assert.ok(server.includes(`${key}: ${re.toString()},`), `항목 ${key}`);
  }
  assert.ok(server.includes(JSON.stringify(LIVE_REPEAT_BREAK_TEXT.identity)), "identity 문면");
  assert.ok(server.includes(JSON.stringify(LIVE_REPEAT_BREAK_TEXT.similar)), "similar 문면");
});

test("[§104 배선] 사기범 턴 경계(빈 마감 제외)마다 판정 → 맥락 주입(`repeatBreak`) · 침묵 넛지 대상 아님", () => {
  const src = codeOnly(readFileSync("src/lib/realtime/GeminiVoiceSession.tsx", "utf8"));
  const iStall = src.indexOf("if (!emptyTurn) noteScammerTurnForStallNudge(scammerTurnText);");
  const iRepeat = src.indexOf("if (!emptyTurn) noteScammerTurnForRepeatBreak(scammerTurnText, participantTurnText);");
  assert.ok(iStall > 0 && iRepeat > iStall, "같은 경계 · 넛지 판정 뒤");
  assert.ok(src.includes('if (kind && injectContext(LIVE_REPEAT_BREAK_TEXT[kind], "repeatBreak")) {'));
  assert.ok(src.includes("latched: handlersRef.current.isHangupLatched(),"));
  assert.equal(sendsAsContextInjection("repeatBreak"), true, "turnComplete:false(응답 유발 0)");
  const step = stepSilenceNudge(INITIAL_SILENCE_NUDGE_STATE, { type: "injected", delivery: "repeatBreak", nowMs: 1000 });
  assert.equal(step.state.armedAt, null, "반복 차단 주입은 침묵 넛지를 걸지 않는다");
});

test("[§104 프로브 미러] `scripts/full-audit-probe.mjs`의 Live 주입 미러 = 클라 §4(대기 어휘 · 대기 요청 · stall 문면 글자 단위)", () => {
  const probe = readFileSync("scripts/full-audit-probe.mjs", "utf8").replace(/\r\n/g, "\n");
  const client = readFileSync("src/lib/realtime/stallRecovery.ts", "utf8").replace(/\r\n/g, "\n");
  const stallVocab = client.match(/const STALL_VOCABULARY =\n {2}(\/.+\/);/)?.[1];
  const waitLine = client.match(/const WAIT_REQUEST_LINE = (\/.+\/);/)?.[1];
  assert.ok(stallVocab && waitLine, "클라 정규식 리터럴을 찾지 못했다");
  assert.ok(probe.includes(`const PROBE_STALL_VOCABULARY =\n  ${stallVocab};`), "대기 어휘");
  assert.ok(probe.includes(`const PROBE_WAIT_REQUEST_LINE = ${waitLine};`), "대기 요청");
  assert.ok(probe.includes(JSON.stringify(LIVE_REPEAT_BREAK_TEXT.stall)), "stall 문면");
});

test("[§104 자금 소진 · 대본] 이 턴이 답한 참가자 발화가 '돈 없어'면 직전 턴과 무관하게 exhausted · 끊기 항목 위임 · 서버와 같은 정규식 · 문면", () => {
  const base = { previousScammerTurn: undefined, scammerTurn: "남은 적금과 대출 가능액도 같은 흐름에 걸려 있습니다.", latched: false, participantHasSpoken: true };
  assert.equal(decideLiveRepeatBreak({ ...base, lastParticipantText: "15만 원까지 했어. 이제 탈탈 털렸어. 나도 이제 없어. 돈 없어." }), "exhausted");
  assert.equal(decideLiveRepeatBreak({ ...base, lastParticipantText: "네, 보냈어요." }), null);
  assert.equal(decideLiveRepeatBreak({ ...base, latched: true, lastParticipantText: "돈 없어요" }), null, "래치 뒤 0");
  assert.ok(LIVE_REPEAT_BREAK_TEXT.exhausted.includes("[진행 강제]의 통화 끝내기 항목이 정한 대로 하라"));
  assert.ok(LIVE_REPEAT_BREAK_TEXT.stall.includes("[진행 강제]의 통화 끝내기 항목이 정한 대로 하라"));
  const server = readFileSync("functions/src/roleplay/repeatBreak.ts", "utf8");
  assert.ok(server.includes(`export const EXHAUSTED_DECLARATION =\n  ${EXHAUSTED_DECLARATION.toString()};`.replace(/\n/, server.includes("\r\n") ? "\r\n" : "\n")), "정규식 짝");
  assert.ok(server.includes(JSON.stringify(LIVE_REPEAT_BREAK_TEXT.exhausted)), "exhausted 문면 짝");
});

test("[§104 실측 ①] Live — 인적사항 항목은 요구 형태가 있는 같은 문장에서만(감사 인사 속 낱말 오탐 0)", () => {
  assert.equal(
    decideLiveRepeatBreak({
      previousScammerTurn: "정확한 한도 조회를 위해 생년월일 여섯 자리도 말씀해 주시겠어요?",
      scammerTurn: "네, 생년월일 확인 감사합니다. 혹시 현재 이용 중이신 기존 대출이 몇 건이나 되시는지 확인 부탁드립니다.",
      latched: false,
      participantHasSpoken: true,
    }),
    null,
  );
});
