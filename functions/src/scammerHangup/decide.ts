// T192 C1 — 사기범 끊기 승인 판정표(Architecture.md §79.2 · AC-103 (a)(b)(f) · G501).
//
// ⛔ 잎 모듈 — Firestore · 네트워크 · LLM import 0(값 import 0, 타입 import만). 텍스트 폴백(`sendMessage` —
//    배선은 C3)과 실시간 콜러블(`requestScammerHangup`)이 **이 함수 하나**를 부른다(AC-103 (f) "같은 조건").
// ⛔ 행은 위에서부터 **첫 번째로 맞는 행**이 이긴다. 표에 없는 경우는 행 추가를 묻는다(§79.2 머리).
// ⛔ `kind`(goal/give_up)는 판정 입력이 아니다 — 끊는 판단은 모델이 하고 서버 하한은 *막는* 쪽만 맡는다.
import type { MessengerChannel, ScammerHangupKind, SessionStatus } from "../shared/types";

/**
 * 하한 — 사기범 턴 수가 이 값보다 작으면 `too_early`(§79.2 #5).
 * ⚠️ **판단값**(OQ-A118 — 진행 강제가 요구를 "2~3턴 안"에 내게 하고 그 뒤 1턴 대처 기회). 라이브 관측 뒤
 * User가 확정한다.
 */
export const SCAMMER_HANGUP_MIN_SCAMMER_TURNS = 4;

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
  /** 사기범 턴 수. 실시간은 **클라 주장값**(OQ-A120). */
  scammerTurns: number;
  /** 문자 대기 — 폴백 = 이 턴에 문자 도착 · 실시간 = 클라 주장(보류 지시 · 도구 대기). */
  pendingInstruction: boolean;
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
  /** §79.2 행 번호(`2-b` = 릴레이 행 — §79.18 (1) 최종형의 순서 3). */
  row: string;
  status: ScammerHangupStatus;
  /** 끊기 허용 여부(`accepted` · `already_accepted`만 참). */
  hangup: boolean;
  when: (input: ScammerHangupInput) => boolean;
};

/** §79.2 판정표(§79.18 (1) 최종형 10행) — 배열 순서 = 표의 순서. ⛔ 순서를 바꾸지 말 것(G501이 순서까지 고정한다). */
export const SCAMMER_HANGUP_RULES: readonly ScammerHangupRule[] = [
  { row: "1", status: "not_active", hangup: false, when: (i) => i.status !== "active" },
  { row: "2", status: "wrong_channel", hangup: false, when: (i) => i.channel === "messenger" },
  {
    row: "2-b",
    status: "not_last_leg",
    hangup: false,
    // §79.18 (1) 정본 조건 그대로 — 범위 밖 `legIndex ≥ legCount`는 마지막으로 본다(보정하지 않는다, §79.2 끝).
    when: (i) => i.relay !== undefined && i.relay.legIndex < i.relay.legCount - 1,
  },
  { row: "3", status: "mock_turn", hangup: false, when: (i) => i.isMockTurn },
  {
    row: "4",
    status: "blocked_transfer",
    hangup: false,
    when: (i) => i.verifyEnabled && !i.transferPlaced,
  },
  {
    row: "5",
    status: "too_early",
    hangup: false,
    // `!(x >= 하한)` — 정본 `x < 하한`과 유한값에서 같고, 비유한값(NaN)은 막는 쪽으로 떨어진다(fail-closed).
    when: (i) => !(i.scammerTurns >= SCAMMER_HANGUP_MIN_SCAMMER_TURNS),
  },
  { row: "6", status: "blocked_pending", hangup: false, when: (i) => i.pendingInstruction },
  { row: "7", status: "limit_reached", hangup: false, when: (i) => i.limitReached },
  { row: "8", status: "already_accepted", hangup: true, when: (i) => i.alreadyAccepted },
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
