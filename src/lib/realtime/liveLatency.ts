// Gemini Live 통화 지연 계측(docs/Architecture.md §71.6 · §50.10 P-0 · G432).
//
// 사용자 지적(2026-10-17, "말하고 나서 인식하고 AI가 음성을 내는 딜레이") — §50.8.4는 *"어느 구간이 실제로
// 몇 ms인지 아무도 잰 적이 없다"* 고 적었다. 그 공백을 메우는 계측이다. `GeminiVoiceSession`이 이벤트를
// 넣고, 턴이 끝날 때마다 숫자만 담긴 레코드 1개를 받아 production에서도 `console.info`로 한 줄 남긴다.
//
// ⛔ G432 — 레코드에는 **숫자 · 종류 · 모델명만** 싣는다. 전사 텍스트 · sessionId · 지시 문면은 0이다
// (`liveLatency.test.ts`가 문자열 필드 집합을 고정한다).
//
// 턴 지연의 앵커(무엇으로부터 첫 오디오까지인가):
//   - 우리가 보낸 텍스트 턴(opening/text/instruction) → 보낸 시각
//   - 참가자 음성 → 로컬 마이크 RMS가 마지막으로 문턱을 넘은 시각(`userSpeechLevel.ts`의 `lastLoudAt`).
//     AI 발화 중엔 이 값이 억제되므로(반이중) 응답 직전 값이 곧 "참가자가 말을 마친 시각"이다.
//   - 둘 다 이 턴 직전에 있으면 **늦은 쪽**이 이 턴을 일으킨 것으로 본다. 둘 다 없으면 `none`.
// ⚠️ 클라 시각이다 — 서버 VAD 판정 시각이 아니고, 첫 청크 **도착** 시각이지 스피커 가청 시각이 아니다
// (출력 지연은 setup 레코드의 `outputLatencyMs`로 따로 남긴다).

// §82.4.2 — `silence`·`relayGreeting`은 `ClientTurnKind`의 새 종류. `instruction`은 S3 이전 기록과의 비교용 라벨로 남긴다.
export type SentTurnKind = "opening" | "text" | "instruction" | "silence" | "relayGreeting";
export type LatencyAnchor = SentTurnKind | "voice" | "none";
export type TurnEndReason = "turnComplete" | "interrupted" | "stall";

export type LiveLatencyTurnRecord = {
  type: "turn";
  /** 이 통화에서 몇 번째 모델 턴인가(1부터). */
  seq: number;
  anchor: LatencyAnchor;
  /** 앵커 → 첫 오디오 청크 도착(ms). 오디오가 없었거나 앵커가 없으면 null. 도구 대기가 들어 있다. */
  firstAudioMs: number | null;
  toolCalls: number;
  /** toolCall 수신 → toolResponse 전송의 합(ms) — 콜러블 왕복(콜드스타트 포함). */
  toolWaitMs: number;
  /** 이 턴에 받은 오디오 길이 합(ms). */
  audioMs: number;
  endedBy: TurnEndReason;
};

type OpenTurn = {
  anchor: LatencyAnchor;
  anchorAt: number | null;
  firstAudioAt: number | null;
  audioMs: number;
  toolCalls: number;
  toolWaitMs: number;
  toolCallAt: number | null;
};

export type LiveLatencyState = {
  seq: number;
  lastTurnEndAt: number | null;
  lastSend: { kind: SentTurnKind; at: number } | null;
  turn: OpenTurn | null;
};

export const INITIAL_LIVE_LATENCY_STATE: LiveLatencyState = {
  seq: 0,
  lastTurnEndAt: null,
  lastSend: null,
  turn: null,
};

export function noteSentTurn(state: LiveLatencyState, kind: SentTurnKind, nowMs: number): LiveLatencyState {
  return { ...state, lastSend: { kind, at: nowMs } };
}

function pickAnchor(
  state: LiveLatencyState,
  lastLoudAt: number | null,
  nowMs: number,
): { anchor: LatencyAnchor; anchorAt: number | null } {
  const since = state.lastTurnEndAt;
  const send = state.lastSend && (since === null || state.lastSend.at >= since) ? state.lastSend : null;
  const voiceAt =
    lastLoudAt !== null && lastLoudAt <= nowMs && (since === null || lastLoudAt > since) ? lastLoudAt : null;
  if (send && (voiceAt === null || send.at >= voiceAt)) return { anchor: send.kind, anchorAt: send.at };
  if (voiceAt !== null) return { anchor: "voice", anchorAt: voiceAt };
  return { anchor: "none", anchorAt: null };
}

function openTurn(state: LiveLatencyState, lastLoudAt: number | null, nowMs: number): OpenTurn {
  return {
    ...pickAnchor(state, lastLoudAt, nowMs),
    firstAudioAt: null,
    audioMs: 0,
    toolCalls: 0,
    toolWaitMs: 0,
    toolCallAt: null,
  };
}

export function noteModelAudio(
  state: LiveLatencyState,
  input: { nowMs: number; audioMs: number; lastLoudAt: number | null },
): LiveLatencyState {
  const turn = state.turn ?? openTurn(state, input.lastLoudAt, input.nowMs);
  return {
    ...state,
    turn: {
      ...turn,
      firstAudioAt: turn.firstAudioAt ?? input.nowMs,
      audioMs: turn.audioMs + input.audioMs,
    },
  };
}

export function noteToolCall(
  state: LiveLatencyState,
  input: { nowMs: number; lastLoudAt: number | null },
): LiveLatencyState {
  const turn = state.turn ?? openTurn(state, input.lastLoudAt, input.nowMs);
  return { ...state, turn: { ...turn, toolCalls: turn.toolCalls + 1, toolCallAt: input.nowMs } };
}

export function noteToolResponseSent(state: LiveLatencyState, nowMs: number): LiveLatencyState {
  const turn = state.turn;
  if (!turn || turn.toolCallAt === null) return state;
  return {
    ...state,
    turn: { ...turn, toolWaitMs: turn.toolWaitMs + Math.max(0, nowMs - turn.toolCallAt), toolCallAt: null },
  };
}

/** 턴을 닫는다. 오디오도 도구도 없던 턴(예: 끊긴 직후의 빈 turnComplete)은 레코드를 내지 않는다. */
export function noteTurnEnd(
  state: LiveLatencyState,
  input: { nowMs: number; endedBy: TurnEndReason },
): { state: LiveLatencyState; record: LiveLatencyTurnRecord | null } {
  const turn = state.turn;
  const closed: LiveLatencyState = { ...state, turn: null, lastSend: null, lastTurnEndAt: input.nowMs };
  if (!turn || (turn.firstAudioAt === null && turn.toolCalls === 0)) {
    return { state: closed, record: null };
  }
  const seq = state.seq + 1;
  return {
    state: { ...closed, seq },
    record: {
      type: "turn",
      seq,
      anchor: turn.anchor,
      firstAudioMs:
        turn.firstAudioAt !== null && turn.anchorAt !== null ? Math.round(turn.firstAudioAt - turn.anchorAt) : null,
      toolCalls: turn.toolCalls,
      toolWaitMs: Math.round(turn.toolWaitMs),
      audioMs: Math.round(turn.audioMs),
      endedBy: input.endedBy,
    },
  };
}

export type LatencySummary = {
  type: "summary";
  turns: number;
  byAnchor: Partial<Record<LatencyAnchor, { n: number; medianMs: number; maxMs: number }>>;
};

export function summarizeLatency(records: readonly LiveLatencyTurnRecord[]): LatencySummary {
  const groups = new Map<LatencyAnchor, number[]>();
  for (const r of records) {
    if (r.firstAudioMs === null) continue;
    const list = groups.get(r.anchor) ?? [];
    list.push(r.firstAudioMs);
    groups.set(r.anchor, list);
  }
  const byAnchor: LatencySummary["byAnchor"] = {};
  for (const [anchor, values] of groups) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    byAnchor[anchor] = { n: sorted.length, medianMs: median, maxMs: sorted[sorted.length - 1] };
  }
  return { type: "summary", turns: records.length, byAnchor };
}

// ── 통화 준비 구간(§50.10 P-0) ───────────────────────────────────────────────────────────────
// 받기(`useRealtimeCall.start`)와 자격증명 준비는 `GeminiVoiceSession`이 마운트되기 전에 일어나므로, 두
// 컴포넌트가 같은 시계(`performance.now()`)로 찍은 값을 이 모듈에 모은다. 통화 1건 = 받기 1회라 받기 때
// 초기화한다.

export type CallSetupMark =
  | "accept"
  | "credentialsReady"
  | "mount"
  | "micReady"
  | "connectResolved"
  | "openingSent"
  | "firstAudio";

/** 받기 시점 자격증명의 출처(reviewer m3) — 완료된 미리 받기 · 진행 중 미리 받기를 기다림 · 받기 뒤 새 발급. */
export type CredentialSourceTag = "settled" | "inflight" | "mint";

export type CallSetupMarks = Partial<Record<CallSetupMark, number>> & {
  credentialsPrefetched?: boolean;
  credentialSource?: CredentialSourceTag;
};

let callSetupMarks: CallSetupMarks = {};

export function resetCallSetupMarks(): void {
  callSetupMarks = {};
}

export function markCallSetup(name: CallSetupMark, nowMs: number): void {
  if (callSetupMarks[name] === undefined) callSetupMarks = { ...callSetupMarks, [name]: nowMs };
}

export function markCredentialsPrefetched(prefetched: boolean, source?: CredentialSourceTag): void {
  callSetupMarks =
    source === undefined
      ? { ...callSetupMarks, credentialsPrefetched: prefetched }
      : { ...callSetupMarks, credentialsPrefetched: prefetched, credentialSource: source };
}

export function readCallSetupMarks(): CallSetupMarks {
  return callSetupMarks;
}

export type CallSetupRecord = {
  type: "setup";
  credentialsPrefetched: boolean | null;
  /** 자격증명 출처(종류 문자열 — 식별자 아님). `credentialsPrefetched`는 `settled`·`inflight`일 때 true다. */
  credentialSource: CredentialSourceTag | null;
  /**
   * 받기 → 자격증명 준비(마이크 권한 확인 + 자격증명 확보).
   * - `settled`: 마이크 확인만 — 발급 대기 0.
   * - `inflight`: 마이크 확인 + **진행 중 미리 받기의 남은 시간**(0이 아닐 수 있다 — 2026-10-18 경합 수정 이후).
   * - `mint`: 마이크 확인 + 발급 왕복 전체(콜드 스타트면 수 초).
   */
  acceptToCredentialsMs: number | null;
  credentialsToMountMs: number | null;
  /** 마운트 → getUserMedia · AudioContext 준비. */
  mountToMicMs: number | null;
  micToConnectMs: number | null;
  connectToOpeningSentMs: number | null;
  openingSentToFirstAudioMs: number | null;
  /** 받기 → 첫 오디오(받기가 없으면 마운트부터). */
  totalMs: number | null;
  outputBaseLatencyMs: number | null;
  outputLatencyMs: number | null;
};

function diff(a: number | undefined, b: number | undefined): number | null {
  return a === undefined || b === undefined ? null : Math.round(b - a);
}

export function buildCallSetupRecord(
  marks: CallSetupMarks,
  audio: { baseLatencySec?: number; outputLatencySec?: number },
): CallSetupRecord {
  const toMs = (sec: number | undefined) =>
    typeof sec === "number" && Number.isFinite(sec) ? Math.round(sec * 1000) : null;
  return {
    type: "setup",
    credentialsPrefetched: marks.credentialsPrefetched ?? null,
    credentialSource: marks.credentialSource ?? null,
    acceptToCredentialsMs: diff(marks.accept, marks.credentialsReady),
    credentialsToMountMs: diff(marks.credentialsReady, marks.mount),
    mountToMicMs: diff(marks.mount, marks.micReady),
    micToConnectMs: diff(marks.micReady, marks.connectResolved),
    connectToOpeningSentMs: diff(marks.connectResolved, marks.openingSent),
    openingSentToFirstAudioMs: diff(marks.openingSent, marks.firstAudio),
    totalMs: diff(marks.accept ?? marks.mount, marks.firstAudio),
    outputBaseLatencyMs: toMs(audio.baseLatencySec),
    outputLatencyMs: toMs(audio.outputLatencySec),
  };
}

/** 로그 1줄 본문. 호출부는 `console.info(LIVE_LATENCY_LOG_PREFIX, formatLatencyLine(...))`로 남긴다. */
export const LIVE_LATENCY_LOG_PREFIX = "[gemini-latency]";

export function formatLatencyLine(
  model: string,
  record: LiveLatencyTurnRecord | LatencySummary | CallSetupRecord,
): string {
  return JSON.stringify({ v: 1, model, ...record });
}
