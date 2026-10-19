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
  { row: "2", status: "wrong_channel", hangup: false, when: (i) => i.channel === "messenger" },
  { row: "2-b", status: "not_last_leg", hangup: false, when: (i) => isNonLastRelayLeg(i.relay) },
  { row: "8", status: "already_accepted", hangup: true, when: (i) => i.alreadyAccepted },
  { row: "3", status: "mock_turn", hangup: false, when: (i) => i.isMockTurn },
  {
    row: "4",
    status: "blocked_transfer",
    hangup: false,
    // T192 C6-R — 전환이 이 경로에서 가능한데 아직 안 됐을 때만 막는다(열릴 길이 0인 칸은 다음 행으로).
    when: (i) => i.verifyEnabled && !i.transferPlaced && i.transferReachable,
  },
  {
    row: "5",
    status: "too_early",
    hangup: false,
    // `!(x >= 하한)` — 정본 `x < 하한`과 유한값에서 같고, 비유한값(NaN)은 막는 쪽으로 떨어진다(fail-closed).
    when: (i) => !(i.userTurns >= SCAMMER_HANGUP_MIN_USER_TURNS),
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
