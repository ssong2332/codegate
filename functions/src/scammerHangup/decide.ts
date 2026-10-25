// T192 C1 — 사기범 끊기 승인 판정표(Architecture.md §79.2 · AC-103 (a)(b)(f) · G501).
// T192 C3 — S5b 병합 뒤 재판정(§79.19 (2)~(4)): 하한 단위 = 사용자 발화 · 6행 = 지시 대기 ∨ 문자 대기 · 8행 위치 이동.
//
// ⛔ 잎 모듈 — Firestore · 네트워크 · LLM import 0(값 import 0, 타입 import만). 텍스트 폴백(`sendMessage`)과
//    실시간 콜러블(`requestScammerHangup`)이 **이 함수 하나**를 부른다(AC-103 (f) "같은 조건").
// ⛔ 행은 위에서부터 **첫 번째로 맞는 행**이 이긴다. 표에 없는 경우는 행 추가를 묻는다(§79.2 머리).
// ⛔ `kind`(goal/give_up)는 판정 입력이 아니다 — 끊는 판단은 모델이 하고 서버 하한은 *막는* 쪽만 맡는다.
import type { MessengerChannel, ScammerHangupKind, SessionStatus } from "../shared/types";

/**
 * 하한 — **사용자 발화 수**가 이 값보다 작으면 `too_early`(§79.2 #5 · T192 C3 = §79.19 (2) 6).
 * 옛 `SCAMMER_HANGUP_MIN_SCAMMER_TURNS = 4`(사기범 턴)는 폴백 교대 엄격에서 `userTurns ≥ 3`과 동치였고, 실시간에서는
 * 한 발화 늦게 열려 AC-103 (f) *"같은 조건"* 을 어겼다(§79.19 (2) 3). 계수는 S5b 문자 게이트와 **같은** 사용자 발화
 * 수다(새 계수기 0 — §79.19 (0) 1).
 * ⚠️ **판단값**(OQ-A118 — 진행 강제가 요구를 "2~3턴 안"에 내게 하고 그 뒤 대처 기회). 라이브 관측 뒤 User가 확정한다.
 */
export const SCAMMER_HANGUP_MIN_USER_TURNS = 3;

export type ScammerHangupStatus =
  | "not_active"
  | "wrong_channel"
  | "not_last_leg"
  | "mock_turn"
  | "blocked_transfer"
  | "blocked_follow_up"
  | "too_early"
  | "blocked_pending"
  | "limit_reached"
  | "already_accepted"
  | "accepted";

/**
 * 릴레이(통화 중 새 Live 연결 — scenario-review S7) 위치(§79.18 (1) 정본). `legIndex`는 0-기반, `legCount`는 전체 leg 수.
 * ⭐ 클라 주장값이 아니다 — 서버가 세션 문서 · 카탈로그에서 읽는다(해석 단일 지점 `relayContext.ts`의
 * `resolveHangupRelay`). S7 전에는 항상 `undefined`(= 릴레이 없음 = 기존 판정).
 */
export type HangupRelayContext = { legIndex: number; legCount: number };

export type ScammerHangupInput = {
  /** 세션 문서 `status`(서버 값). */
  status: SessionStatus;
  /** 세션 문서 `channel`(서버 값). 부재 = `"voice"`(하위호환). */
  channel: MessengerChannel | undefined;
  /** 이 턴이 Mock 강등인가 — 폴백만 참이 될 수 있다(실시간은 항상 `false`). */
  isMockTurn: boolean;
  /** 확인 무력화 세션인가(`hasVerifyIntercept && advanced` — `roleplay/index.ts`의 `verifyEnabled`와 같은 정의). */
  verifyEnabled: boolean;
  /** `verifyIntercept` 문서에 `placedAt`이 있는가(호 전환 완료). */
  transferPlaced: boolean;
  /**
   * ⭐ T192 C6-R(§79.20 (3) · OQ-A152 (가)) — 전환이 **이 경로에서** 일어날 수 있는가(`transferReach.ts`
   * `isVerifyTransferReachable` — 서버 값만). `false`인 칸은 폴백 ∧ 계열 B ∧ 오퍼 문서 없음 하나뿐이다.
   * ⭐ 옵셔널이 아니라 필수 키(빠뜨리면 컴파일 오류).
   */
  transferReachable: boolean;
  /**
   * ⭐ §108(2026-10-22 사용자 결정 원문 *"이체할 거 다 하고, 했는데, 할 게 없어도 전화를 안 끊는 모습이 보여"* → 메인 세션 A안 · DECISIONS #223 ·
   * OQ-A117 · OQ-A154 해소) — 참가자가 사기범이 노린 **화면 행동을 이미 마쳤는가**(서버 기록만 — `goalAction.ts` `hasCompletedGoalAction`).
   * 참이면 4행(호 전환 전 금지)이 비켜선다 — 이체를 끝낸 참가자에게 확인 무력화를 보여 줄 수 없고, 막으면 통화가 끝나지 않는다.
   * 그 아래 하한(5 · 6 · 7행)은 그대로다. ⭐ 옵셔널이 아니라 필수 키(빠뜨리면 컴파일 오류).
   */
  goalActionDone: boolean;
  /**
   * ⭐ §132.13(DECISIONS #248 ⑮ · 사용자 결정 2026-10-25 "끊기 판정으로 막기") — 변형에 후속 단계(`goalFollowUpUserTurns`)가 있는데 C-5(필수 문자 전부
   * 도착 + 그 뒤 발화 몫)가 아직 거짓인가(`goalAction.ts` `hasCompletedGoalAction` — 호출부가 확인 무력화 여부와 무관하게 계산). 참이면 4-b행이 막는다 —
   * 4행이 꺼진 경로(폴백 · 전환 도달 불가)에서도 실시간과 같게 결말 단계 전 끊기를 막는다. ⭐ 옵셔널이 아니라 필수 키.
   */
  followUpPending: boolean;
  /**
   * 사용자 발화 수(이번에 답하려는 발화 포함). 폴백 = 서버 `userTurnsNow` · 실시간 = **클라 주장값**(OQ-A120 —
   * S5b `deliverInCallSms`와 같은 등급 · 같은 판독 규칙 `readScammerHangupRequest`).
   */
  userTurns: number;
  /**
   * 지시 대기(클라 항) — 실시간 = 클라 주장(지시 큐 ∨ busy ∨ 교대 대기 ∨ 같은 배치의 다른 도구 · ⛔ 컴포넌트
   * `toolPending` 제외 — §79.19 (3)) · 폴백 = 항상 `false`(클라 큐가 없다).
   */
  pendingInstruction: boolean;
  /**
   * 문자 대기(서버 항) — 문자가 참가자에게 보인 뒤 참가자가 아직 말하지 않았다(`isSmsAwaitingUser` — 서버 도착 기록).
   * ⭐ 옵셔널이 아니라 필수 키(빠뜨리면 컴파일 오류 — §79.19 (4)).
   */
  smsAwaitingUser: boolean;
  /** 같은 턴 한도 도달 — 폴백만 참이 될 수 있다. */
  limitReached: boolean;
  /** 세션에 `scammerHangup` 표식이 이미 있는가. */
  alreadyAccepted: boolean;
  /**
   * 릴레이 위치(User 결정 · DECISIONS #146 — 마지막 화자만 먼저 끊는다). `undefined` = 릴레이 없음 = 행 2-b 통과.
   * ⭐ 옵셔널(`?:`)이 아니라 **필수 키**다 — 호출부가 빠뜨리면 컴파일 오류(§79.18 (1) · S7 뒤 "말없이 릴레이 없음" 방지).
   */
  relay: HangupRelayContext | undefined;
  /**
   * ⭐ §104.9(2026-10-22 사용자 결정 *"끝내게 하기"* — 대안 A · DECISIONS #219) — 메신저 단계에서도 끝낼 수 있는 경로인가. 참이면 2행이
   * 메신저를 막지 않는다(그 아래 하한 3 · 5 · 6 · 7행은 그대로 — 너무 이른 종료 방지). **폴백(`sendMessage`)만 참**이다 — 실시간 콜러블은
   * 메신저 단계가 없어 넘기지 않는다. 부재 = 거짓 = 종전 판정(2행이 메신저를 막는다).
   */
  messengerStageAllowed?: boolean;
  /**
   * ⭐ §131(14)(메인 세션 라이브 확인 2026-10-24 — 자녀 사칭 카톡 · 사기범이 건 통화에서 참가자 첫 텍스트 턴에 끊었다) — 메신저에서 넘어온 통화의
   * **통화 진입 뒤** 참가자 발화 수. `userTurns`는 세션 전체 발화라 메신저 단계 턴이 쌓여 5행 하한이 통화 첫 턴부터 넘어가 있었다. 값이 있으면
   * 5행은 두 값 모두 하한 이상이어야 통과한다. 부재 = 종전(`userTurns`만 — 처음부터 통화인 세션 · 실시간 콜러블).
   */
  turnsSinceCallEntry?: number;
};

export type ScammerHangupRule = {
  /** §79.2 행 번호(`2-b` = 릴레이 행). ⚠️ 번호와 배열 위치는 다르다 — 8행이 4번째다(§79.19 (3)). */
  row: string;
  status: ScammerHangupStatus;
  /** 끊기 허용 여부(`accepted` · `already_accepted`만 참). */
  hangup: boolean;
  when: (input: ScammerHangupInput) => boolean;
};

/**
 * 릴레이 중간 leg인가(§79.18 (1) 정본 조건 그대로). 행 2-b와 선언 층 `declaresEndCall`(`realtime/liveTools.ts` — 이중
 * 방어)이 이 함수 하나를 쓴다. 범위 밖 `legIndex ≥ legCount`는 마지막으로 본다(보정하지 않는다, §79.2 끝).
 */
export function isNonLastRelayLeg(relay: HangupRelayContext | undefined): boolean {
  return relay !== undefined && relay.legIndex < relay.legCount - 1;
}

/**
 * §79.2 판정표(10행) — 배열 순서 = 판정 순서. ⛔ 순서를 바꾸지 말 것(G501 · G553이 순서까지 고정한다).
 * ⭐ T192 C3(§79.19 (3) · C1 Minor-1) — 8행을 2-b 바로 뒤로: `1 · 2 · 2-b · 8 · 3 · 4 · 5 · 6 · 7 · 9`. 표식이 생긴 뒤
 * 3~7행 입력은 바뀔 수 없거나(단조) 바뀌어도 무의미하다(이미 끊는 중) ⇒ 승인 뒤 재호출이 판정을 뒤집지 않는다.
 * 1 · 2 · 2-b가 앞에 남는 이유: 세션이 끝났거나 · 메신저 단계거나 · 다른 leg면 승인 유지가 틀린 답이다.
 */
export const SCAMMER_HANGUP_RULES: readonly ScammerHangupRule[] = [
  { row: "1", status: "not_active", hangup: false, when: (i) => i.status !== "active" },
  // §104.9 — 메신저 단계는 폴백 경로가 허용할 때(`messengerStageAllowed`)만 통과한다.
  { row: "2", status: "wrong_channel", hangup: false, when: (i) => i.channel === "messenger" && i.messengerStageAllowed !== true },
  { row: "2-b", status: "not_last_leg", hangup: false, when: (i) => isNonLastRelayLeg(i.relay) },
  { row: "8", status: "already_accepted", hangup: true, when: (i) => i.alreadyAccepted },
  { row: "3", status: "mock_turn", hangup: false, when: (i) => i.isMockTurn },
  {
    row: "4",
    status: "blocked_transfer",
    hangup: false,
    // T192 C6-R — 전환이 이 경로에서 가능한데 아직 안 됐을 때만 막는다(열릴 길이 0인 칸은 다음 행으로).
    // §108 — 참가자가 목표 화면 행동(이체 화면 제출 · 앱 설치 응낙)을 마쳤으면 막지 않는다(DECISIONS #223).
    when: (i) => i.verifyEnabled && !i.transferPlaced && i.transferReachable && !i.goalActionDone,
  },
  // §132.13 — 후속 단계 변형의 결말 단계가 남았으면 막는다(경로 무관 · 거절 끊기 포함 — 사용자 결정 2026-10-25 · 실시간은 종전에도 4행이 같은 칸을 막았다).
  { row: "4-b", status: "blocked_follow_up", hangup: false, when: (i) => i.followUpPending },
  {
    row: "5",
    status: "too_early",
    hangup: false,
    // `!(x >= 하한)` — 정본 `x < 하한`과 유한값에서 같고, 비유한값(NaN)은 막는 쪽으로 떨어진다(fail-closed).
    when: (i) =>
      !(i.userTurns >= SCAMMER_HANGUP_MIN_USER_TURNS) ||
      (i.turnsSinceCallEntry !== undefined && !(i.turnsSinceCallEntry >= SCAMMER_HANGUP_MIN_USER_TURNS)),
  },
  {
    row: "6",
    status: "blocked_pending",
    hangup: false,
    // §79.19 (4) — 클라 항(지시 대기) ∨ 서버 항(문자 대기). 같은 status · 같은 로그 row.
    when: (i) => i.pendingInstruction || i.smsAwaitingUser,
  },
  { row: "7", status: "limit_reached", hangup: false, when: (i) => i.limitReached },
  { row: "9", status: "accepted", hangup: true, when: () => true },
];

export type ScammerHangupDecision = { status: ScammerHangupStatus; hangup: boolean; row: string };

export function decideScammerHangup(input: ScammerHangupInput): ScammerHangupDecision {
  for (const rule of SCAMMER_HANGUP_RULES) {
    if (rule.when(input)) return { status: rule.status, hangup: rule.hangup, row: rule.row };
  }
  // 9행이 항상 맞으므로 도달하지 않는다 — 도달하면 표가 깨진 것이다.
  throw new Error("decideScammerHangup: 판정표에 맞는 행이 없다");
}

/**
 * 모델이 보낸 사유 인자 판독. 누락 · 오기입은 `unspecified`(⛔ 거절하지 않는다 — 이미 작별을 준비한
 * 모델을 거절하면 신고 ⑪이 재발할 수 있다, §79.2).
 */
export function normalizeScammerHangupKind(raw: unknown): ScammerHangupKind {
  if (raw === "goal" || raw === "give_up") return raw;
  return "unspecified";
}
