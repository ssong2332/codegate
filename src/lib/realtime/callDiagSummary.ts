// 2026-11-06(메인 요청 2 — "말 인식 0회" 원인을 사용자 캡처 없이 확정) — 통화가 끝날 때(레그 끝 · 세션 끝) 클라 진단값 요약을 서버 로그로 보낸다.
// `?audiodebug=1` 없이도 보낸다. ⛔ 숫자 · 상태값만(음성 · 대사 · 개인 정보 0). 서버 판독 = `functions/src/realtime/callDiag.ts`(같은 키 · 같은 허용값).
//
// | 원인 후보 | 요약에서 보이는 모양 |
// |---|---|
// | 마이크 프레임이 아예 안 나감(트랙 정지 · 입력 컨텍스트 멈춤) | `micSent` ≈ 0 · `track`≠live 또는 `inState`≠running |
// | 반이중 게이트가 안 열림(출력 시계 정지 등) | `micDropEcho` ≫ `micSent` · `outState`≠running |
// | 음소거 | `micDropMute` ≫ 0 |
// | 프레임은 갔는데 서버가 못 들음(무음 · 너무 작음) | `micSent` ≫ 0 · `asr` = 0 · `micPeakDb` 매우 낮음 |
// | 마이크 거부 → 폴백 | `rt` = permission-denied · `mode` = fallback |
import type { AudioDiagSnapshot } from "./audioDiagnostics";

export const CALL_DIAG_CTX_STATES = ["running", "suspended", "closed", "interrupted", "none"] as const;
export const CALL_DIAG_TRACK_STATES = ["live", "ended", "none"] as const;
export const CALL_DIAG_RT_STATES = [
  "idle",
  "connecting",
  "active",
  "reconnecting",
  "ended",
  "fallback",
  "unsupported",
  "permission-denied",
  "error",
  "unknown",
] as const;
export const CALL_DIAG_MODES = ["undecided", "realtime", "fallback"] as const;

export type CallDiagSummary = {
  micSent: number;
  micDropEcho: number;
  micDropMute: number;
  /** 보낸 프레임 최대 진폭(dBFS · 정수) · 보낸 프레임 0이면 null. */
  micPeakDb: number | null;
  asr: number;
  rx: number;
  unheard: number;
  interrupts: number;
  liveResumes: number;
  outState: (typeof CALL_DIAG_CTX_STATES)[number];
  inState: (typeof CALL_DIAG_CTX_STATES)[number];
  track: (typeof CALL_DIAG_TRACK_STATES)[number];
  trackMuted: boolean;
  trackEnabled: boolean;
  rt: (typeof CALL_DIAG_RT_STATES)[number];
  mode: (typeof CALL_DIAG_MODES)[number];
};

const pick = <T extends string>(allowed: readonly T[], value: string | null | undefined, fallback: T): T =>
  value !== null && value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
const count = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 10_000_000) : 0);

export function buildCallDiagSummary(
  snapshot: Pick<
    AudioDiagSnapshot,
    | "micFramesSent"
    | "micFramesDroppedEcho"
    | "micFramesDroppedMute"
    | "micPeakMax"
    | "asrChunks"
    | "chunksReceived"
    | "unheardReplyFired"
    | "interrupts"
    | "liveResumes"
    | "output"
    | "input"
    | "mic"
  >,
  context: { realtimeStatus: string; callMode: string },
): CallDiagSummary {
  const peak = snapshot.micPeakMax;
  return {
    micSent: count(snapshot.micFramesSent),
    micDropEcho: count(snapshot.micFramesDroppedEcho),
    micDropMute: count(snapshot.micFramesDroppedMute),
    micPeakDb: peak === null || !(peak > 0) ? null : Math.max(-200, Math.min(0, Math.round(20 * Math.log10(peak)))),
    asr: count(snapshot.asrChunks),
    rx: count(snapshot.chunksReceived),
    unheard: count(snapshot.unheardReplyFired),
    interrupts: count(snapshot.interrupts),
    liveResumes: count(snapshot.liveResumes),
    outState: pick(CALL_DIAG_CTX_STATES, snapshot.output?.state ?? "none", "none"),
    inState: pick(CALL_DIAG_CTX_STATES, snapshot.input?.state ?? "none", "none"),
    track: pick(CALL_DIAG_TRACK_STATES, snapshot.mic?.readyState ?? "none", "none"),
    trackMuted: snapshot.mic?.muted === true,
    trackEnabled: snapshot.mic?.enabled === true,
    rt: pick(CALL_DIAG_RT_STATES, context.realtimeStatus, "unknown"),
    mode: pick(CALL_DIAG_MODES, context.callMode, "undecided"),
  };
}

// ── 세션 끝 요약 넘기기(통화 화면 → 종료 화면 · `endSession`에 싣는다) ─────────────────────────────
// 종료 화면은 통화 정리 뒤에 열린다 — 그때 오디오 상태를 읽으면 전부 닫힌 값이라, 통화 화면이 끝내는 순간의 요약을 이 키로 넘긴다
// (사유 힌트 `setPendingEndReason`과 같은 방식 · 세션 id가 다르면 버린다). 저장소 오류 = 요약 없음(종료는 그대로).
const PENDING_CALL_DIAG_KEY = "codegate.pendingCallDiag";

export function setPendingCallDiag(sessionId: string, diag: CallDiagSummary): void {
  try {
    window.sessionStorage.setItem(PENDING_CALL_DIAG_KEY, JSON.stringify({ sessionId, diag }));
  } catch {
    // 요약 유실 = 서버 로그 1줄 없음(종료 무영향).
  }
}

/** 읽기만 한다. 없음 · 다른 세션 · 깨진 값 = undefined(모양 검증은 서버 `readCallDiag`가 한다). */
export function peekPendingCallDiag(sessionId: string): CallDiagSummary | undefined {
  try {
    const raw = window.sessionStorage.getItem(PENDING_CALL_DIAG_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { sessionId?: unknown; diag?: unknown };
    return parsed.sessionId === sessionId && typeof parsed.diag === "object" && parsed.diag !== null
      ? (parsed.diag as CallDiagSummary)
      : undefined;
  } catch {
    return undefined;
  }
}

export function clearPendingCallDiag(): void {
  try {
    window.sessionStorage.removeItem(PENDING_CALL_DIAG_KEY);
  } catch {
    // 지우기 실패 = 다음 세션에서 세션 id 불일치로 버려진다.
  }
}
