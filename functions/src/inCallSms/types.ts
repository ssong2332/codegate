// deliverInCallSms / recordInCallSmsEvent 콜러블 계약 — src/lib/api/types.ts(클라 계약)와 1:1
// (API.md 관례, ADR-0001 "계약 원천 2곳").
//
// ⚠️ 응답에 본문·인증번호가 없다는 점이 설계다 — 화면은 `sessions/{sid}/inCallSms` 구독(onSnapshot)
// 하나로만 그린다(실시간·폴백 단일 렌더 소스, DECISIONS #12 계승). 응답은 "도착시켰다 + 캐릭터가
// 알리게 할 1줄 지시"만 돌려준다.

// ⭐ T191 문자 도달 조건(PRD AC-099 · 설계 "문자 도달 조건") — 요청이 "어느 문자(smsId)"에서 "어떤 목적(purpose)"으로
// 바뀌었다. 클라는 더 이상 smsId를 고르지 않는다 — 서버가 세션의 흐름 변형 선언에서 목적으로 찾는다.
// 판정 입력은 **사용자 발화 수**(`userTurns`)이고, `scammerTranscriptTurns`는 앵커(리포트 타임라인 위치)에만 쓴다.
// ⚠️ 두 카운터는 클라 주장값이다(실시간 경로에서 서버가 참가자 발화를 통화 중에 보지 못한다) — 서버는 범위만 검사한다
// (0 이상 · 200 이하 정수). 위조의 최대 효과는 "자기 훈련용 모의 문자를 조금 일찍 받는 것"이다(G12와 같은 위상).
export type DeliverInCallSmsTrigger = "backstop" | "model_tool";
export type DeliverInCallSmsRequest = {
  sessionId: string;
  /** `trigger:"model_tool"`에서 필수 — 모델이 도구 인자로 고른 목적(`identity|transfer|link`). 백스톱은 보내지 않는다. */
  purpose?: string;
  /** 비어 있지 않은 사용자 전사 flush 수(음성 · 타이핑 공통). **부재 = 이 계약 이전 클라**(아래 `legacy` 처리). */
  userTurns?: number;
  /** 비어 있지 않은 사기범 전사 flush 수 — 앵커 = 1 + 이 값. */
  scammerTranscriptTurns?: number;
  trigger?: DeliverInCallSmsTrigger;
  /** §104 — 백스톱에서만: 사기범이 이미 "문자를 보냈다"고 말했다(클라 주장 · 불리언 1개). 게이트가 열린 순간 바로 보낸다. 부재 = 종전. */
  smsClaimed?: boolean;
  /**
   * @deprecated 이 계약 이전 클라(캐시된 화면)가 보내는 값. 서버는 **읽지 않는다** — `userTurns`가 없는 요청은
   * 문자를 보내지 않고 `not_allowed`로 응답한다(옛 화면은 그 응답에 오류를 띄우지 않는다).
   */
  smsId?: string;
  /** @deprecated 위와 같다(옛 `scammerTurns`). */
  scammerTurns?: number;
};
/**
 * - `delivered` — 이번 호출로 도착(문서 생성). `announceInstruction`(전환 뒤면 생략)이 실린다.
 * - `already_delivered` · `too_early` · `too_soon` · `not_allowed` — 거부(문서 0). `declineInstruction`이 실린다.
 * - `nudge` — 백스톱 1단계: 모델에게 맥락 주입할 `nudgeInstruction`이 실린다(문서 0).
 * - `waiting` — 백스톱: 아직 할 일 없음. `none_pending` — 백스톱: 남은 필수 문자 없음(클라는 더 묻지 않는다).
 */
export type DeliverInCallSmsStatus =
  | "delivered"
  | "already_delivered"
  | "too_early"
  | "too_soon"
  | "not_allowed"
  | "nudge"
  | "waiting"
  | "none_pending"
  // §115 — 백스톱: 남은 필수 문자는 없지만 후속 단계(대출 실행 유도 등)가 남았다 — 클라는 다음 발화에 다시 묻는다.
  | "goal_pending";
export type DeliverInCallSmsResponse = {
  /** `status==="delivered"`일 때만(도착한 문서 id = 화면 구독 키). 거부 · 백스톱 대기에는 없다(도착 전 문자 id 0). */
  smsId?: string;
  /**
   * 클라가 **같은 Live 세션에 맥락 주입**해 캐릭터가 문자 발송을 알리게 하는 1줄.
   *
   * ⭐ **§53.6 (3)(T118/R-1과 동형, Architecture.md §53)** — 이 문자가 연 확인 시도 무력화
   * 오퍼에 이미 `placedAt`이 있으면(=호 전환이 끝난 뒤면) **생략된다.** 전환 이후에는 원
   * 사기범이 아니라 확인 데스크 화자만 남아 있고, 그 화자가 "내가 방금 이 문자를 보냈다"고
   * 말하면 참가자가 겪은 사실과 모순된다. 값이 없으면 클라는 **주입하지 않는다** — 문서
   * 자체(계좌·링크)는 전환 여부와 무관하게 그대로 도착한다.
   *
   * ⭐ `status==="delivered"`일 때만 실린다(위 §53.6 (3) 생략 규칙과 **AND**로 곱해진다).
   */
  announceInstruction?: string;
  status: DeliverInCallSmsStatus;
  /** 거부 4종에서만 실리는 서버 소유 지시(G386). */
  declineInstruction?: string;
  /** `status==="nudge"`에서만 — 서버 소유 넛지 1줄(맥락 주입 · 전환 뒤에는 `waiting`으로 대신한다). */
  nudgeInstruction?: string;
  /**
   * §132.9 — 백스톱 · `smsClaimed`(사기범이 이미 "문자를 보냈다"고 말함)인데 게이트 하한 전이라 `waiting`일 때만: "아직 안 갔다" 정정 1줄
   * (서버 소유 · 맥락 주입). 클라는 주장 1건당 1회만 넣는다. 하한은 그대로다(문자는 게이트가 열리면 주장 간격으로 바로 간다).
   */
  claimNotYetInstruction?: string;
  /** §115 — `status==="none_pending"`이고 후속 단계까지 할 일을 마쳤을 때만(`planGoalWrapUp` = wrap_up). 마무리 지시 1줄(맥락 주입 · 1회). */
  wrapUpInstruction?: string;
  /**
   * A-1 ⑦(2026-10-19) — `status==="delivered"`이고 그 문자가 **필수 계좌·링크 문자**일 때만(`announceInstruction`과 같은
   * 전환 뒤 생략 규칙). 참가자가 문자대로 마쳤다고 말하면 사기범이 결과(입금 확인·처리 완료)를 알리고 다음 단계로 넘어가게
   * 하는 **조건형** 1줄(`inCallSms/confirmResult.ts`). ⚠️ 이 필드를 Live 세션에 주입하는 클라 배선은 아직 없다(A-2).
   */
  confirmResultInstruction?: string;
};

// T123/AC-080 — `landing_submitted`는 **"그 문자가 연 가짜 랜딩의 폼을 제출했다"**는 사실 하나다.
// ⛔ 참가자가 입력한 값은 이 요청에 실리지 않는다 — 담을 필드가 타입에 **존재하지 않는다**(AC-045).
// ⛔ `link_tapped`(링크를 눌렀다)와 의미가 다르다: 탭은 속은 순간으로 승격되지 않고 제출만 된다
//    (AC-080 (b) — 의심해서 열어보고 닫은 참가자를 실패로 낙인찍지 않기 위해서다).
// ⭐ §101 — 여러 화면 사이트(검찰 고급 자산 검수 사이트)의 **이체 전 단계 버튼**을 누른 사실 3종(본인 확인 · 코인 전환 · 금액 입력 뒤 다음).
// 마지막 이체 확인은 종전 `landing_submitted`. 셋 다 고정 값이고 입력값을 담을 자리가 없다(AC-045 무변경).
export type InCallSmsEvent =
  | "opened"
  | "link_tapped"
  | "landing_submitted"
  | "landing_identity"
  | "landing_converted"
  | "landing_amount";
export type RecordInCallSmsEventRequest = {
  sessionId: string;
  smsId: string;
  event: InCallSmsEvent;
};
export type RecordInCallSmsEventResponse = {
  recorded: true;
  /**
   * §132.7 — `landing_submitted`를 **처음** 기록했을 때만: 실시간 사기범에게 넣을 맥락 1줄(서버 소유 문면 · 클라 저작 0).
   * 부재 = 넣을 것 없음(다른 이벤트 · 이미 기록됨). 폴백 경로는 쓰지 않는다.
   */
  contextInstruction?: string;
};
