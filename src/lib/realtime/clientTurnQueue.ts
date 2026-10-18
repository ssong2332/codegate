// 클라 → Live 세션 `turnComplete:true` 텍스트 턴 보류 큐(docs/Architecture.md §71.5 · G431 · ADR-0017).
//
// ⭐ 왜 필요한가(2026-10-17 라이브 프로브 실측): `gemini-3.8-live`는 모델 턴이 진행 중일 때
// `turnComplete:true` 클라 콘텐츠를 받으면 **그 자리에서 생성을 끊는다**(77ms 뒤 `interrupted` + `turnComplete`).
// 2.5 native audio는 같은 입력을 **그 턴이 끝날 때까지 보류**했다가 응답했다. 이 앱은 오프닝 트리거 ·
// 타이핑 입력 · 오케스트레이션 지시를 모두 이 형태로 보내므로, 그대로 두면 3.8에서 사기범 말이 중간에
// 잘리고 가짜 턴 경계(`turnComplete`)가 하나 더 생긴다. 2.5의 서버 보류를 클라에서 재현한다.
//
// 순수 함수만 둔다(React · DOM · 타이머 없음) — 호출부(GeminiVoiceSession)가 이벤트를 넣고, 돌려받은
// `send`를 실제로 전송한다. 한 번에 1건만 내보낸다: 보낸 턴의 응답이 끝나야(`turnComplete`) 다음 건이 나간다.
// ⛔ `turnComplete:false` 주입(`personaStateTurn`, A5-α)은 응답을 유발하지 않고 생성을 끊지도 않아 이 큐 밖이다.

// ⭐ §78.4.2(G491) — `turnComplete:true` 종류는 이 넷뿐이다. 문자 · 확인 권유 안내(종전 `instruction`)는
// 맥락 주입(`turnComplete:false`, `contextInjection.ts`)으로 옮겨 이 큐를 타지 않는다(X5 · S1 §3.1).
// `silence` = 침묵 넛지 · `relayGreeting` = 화자 전환 첫 발화(확인 창구 재연결 지시 · S7 릴레이 leg).
export type ClientTurnKind = "opening" | "text" | "silence" | "relayGreeting";

export type ClientTurn = { kind: ClientTurnKind; text: string };

export type ClientTurnQueueState = {
  /** 모델 오디오를 받기 시작한 뒤 아직 `turnComplete`/`interrupted`가 오지 않았다. */
  modelTurnActive: boolean;
  /** 우리가 보낸 턴의 응답을 기다리는 중이면 보낸 시각(ms), 아니면 null. */
  awaitingSince: number | null;
  pending: ClientTurn[];
  /**
   * reviewer M1 / QA F1 — `interrupted` 뒤 아직 모델 오디오가 오지 않았다. 3.8은 끊긴 턴에 `interrupted` 직후
   * 오디오 없는 `turnComplete`를 보낸다(§71.2) — 그것은 참가자 발화에 대한 응답의 끝이 아니므로 보류분을 풀지 않는다.
   */
  afterInterrupt: boolean;
  /**
   * reviewer M2 / QA F2 — BLOCKING 도구 호출(`toolCall`)을 받고 아직 `toolResponse`를 보내지 않았다. 모델은 결과를
   * 기다리며 멈춰 있지만 그 턴은 진행 중이다 — 이때 텍스트 턴을 보내면 도구 흐름 위에 끼어든다. stall로도 풀지 않는다.
   */
  toolPending: boolean;
};

export type ClientTurnEvent =
  | { type: "request"; turn: ClientTurn; nowMs: number }
  | { type: "modelAudio"; nowMs: number }
  | { type: "turnComplete"; nowMs: number }
  | { type: "interrupted"; nowMs: number }
  /** BLOCKING 도구 호출 수신 — 이 턴은 도구 결과 뒤에 이어진다. */
  | { type: "toolCall"; nowMs: number }
  /** 도구 결과 전송(성공 · 실패 무관) — 턴은 계속 진행 중이고 turnComplete에서 끝난다. */
  | { type: "toolResponseSent"; nowMs: number }
  /** 반이중 게이트 타이머가 진행 중 턴을 닫았다(서버가 turnComplete를 안 보냄 — `agentSpeechGate` stall). */
  | { type: "stall"; nowMs: number }
  /** 응답 대기 타임아웃 점검. */
  | { type: "tick"; nowMs: number };

export type ClientTurnStep = { state: ClientTurnQueueState; send: ClientTurn | null };

/**
 * 보낸 턴의 응답(첫 오디오 · turnComplete)을 기다리는 상한. **판단값**이다 — 2026-10-17 프로브에서
 * 가장 늦은 첫 응답은 2.5의 오프닝 7,878ms(thought 단계 포함)였고 3.8은 1.4초 이내였다. 이 시간이
 * 지나도 아무것도 오지 않으면(모델이 응답하지 않기로 함 — proactive audio) 보류분을 막지 않도록 풀어 준다.
 */
export const AWAIT_RESPONSE_TIMEOUT_MS = 8000;

export const INITIAL_CLIENT_TURN_QUEUE_STATE: ClientTurnQueueState = {
  modelTurnActive: false,
  awaitingSince: null,
  pending: [],
  afterInterrupt: false,
  toolPending: false,
};

function isIdle(state: ClientTurnQueueState): boolean {
  return !state.modelTurnActive && state.awaitingSince === null;
}

/** 유휴 상태에서 보류분 앞 1건을 꺼내 보낸다. */
function releaseNext(state: ClientTurnQueueState, nowMs: number): ClientTurnStep {
  if (state.pending.length === 0) return { state, send: null };
  const [next, ...rest] = state.pending;
  return {
    state: { modelTurnActive: false, awaitingSince: nowMs, pending: rest, afterInterrupt: false, toolPending: false },
    send: next,
  };
}

export function stepClientTurnQueue(
  state: ClientTurnQueueState,
  event: ClientTurnEvent,
  awaitTimeoutMs: number = AWAIT_RESPONSE_TIMEOUT_MS,
): ClientTurnStep {
  switch (event.type) {
    case "request":
      if (isIdle(state) && state.pending.length === 0) {
        return { state: { ...state, awaitingSince: event.nowMs }, send: event.turn };
      }
      return { state: { ...state, pending: [...state.pending, event.turn] }, send: null };
    case "modelAudio":
      return { state: { ...state, modelTurnActive: true, awaitingSince: null, afterInterrupt: false }, send: null };
    case "toolCall":
      return { state: { ...state, modelTurnActive: true, awaitingSince: null, toolPending: true }, send: null };
    case "toolResponseSent":
      return { state: { ...state, toolPending: false }, send: null };
    case "turnComplete":
      if (state.afterInterrupt) {
        // 끊긴 턴의 빈 마감 — 참가자 발화에 대한 응답을 계속 기다린다(tick 타임아웃은 그대로 산다).
        return {
          state: { ...state, modelTurnActive: false, awaitingSince: event.nowMs, afterInterrupt: false, toolPending: false },
          send: null,
        };
      }
      return releaseNext({ ...state, modelTurnActive: false, awaitingSince: null, toolPending: false }, event.nowMs);
    case "stall":
      // 도구 결과를 기다리는 침묵은 stall이 아니다(콜러블 왕복 · 콜드스타트가 4초를 넘을 수 있다).
      if (state.toolPending) return { state, send: null };
      return releaseNext({ ...state, modelTurnActive: false, awaitingSince: null }, event.nowMs);
    case "interrupted":
      // 참가자가 말을 시작해 모델이 멈췄다 — 지금 보내면 참가자 발화 위에 지시가 겹친다. 그 발화에 대한
      // 응답을 기다리는 것으로 보고(awaitingSince), 그 응답의 turnComplete(또는 tick 타임아웃)에서 내보낸다.
      return {
        state: { ...state, modelTurnActive: false, awaitingSince: event.nowMs, afterInterrupt: true, toolPending: false },
        send: null,
      };
    case "tick":
      if (
        !state.modelTurnActive &&
        state.awaitingSince !== null &&
        event.nowMs - state.awaitingSince >= awaitTimeoutMs
      ) {
        return releaseNext({ ...state, awaitingSince: null }, event.nowMs);
      }
      if (isIdle(state)) return releaseNext(state, event.nowMs);
      return { state, send: null };
  }
}
