// ⭐ §140(2026-10-28 실 키 실측 · 메인 세션) — Gemini Live 연결은 약 10분(601초)에 서버가 닫는다(close 1011 "The service is currently
// unavailable." · goAway 0건). 예전에는 화면이 켜진 채 닫히면 통화가 그대로 끝났다(`decideSocketClose` → "end").
// 이제 서버가 보낸 이어받기 핸들(`sessionResumptionUpdate.newHandle`)과 **같은 토큰**으로 조용히 다시 연결한다.
// 대화 맥락은 서버가 핸들로 되살린다 — 다시 연결한 뒤 맥락 텍스트 턴을 보내지 않는다(§99 재연결과 다른 점).
//
// 브라우저 API를 만지지 않는 순수 판정만 둔다(`GeminiVoiceSession`이 그대로 쓴다 — `liveResume.test.ts`). 잎 모듈이다(import 0).
//
// ── 판정표 1: 연결이 닫혔을 때(`decideLiveClose`) — 위에서부터 첫 일치 ──
// | # | 조건 | 판정 | 결과 |
// |---|---|---|---|
// | C1 | 사용자 끊기(`stopRequested`) 또는 끊기 래치(T192) | `end` | 종전 — `onEnded` |
// | C2 | 화면이 가려졌거나 돌아온 직후(§99 `decideSocketClose` = reconnect) | `background` | 종전 — 부모가 새 토큰으로 다시 연결 |
// | C3 | 이어받기 핸들이 없다(첫 연결 실패 · 서버가 아직 안 보냄) | `end` | 종전 |
// | C4 | 이 통화의 조용한 재연결이 `MAX_LIVE_RESUMES`회에 닿았다 | `end` | 종전 |
// | C5 | 첫 연결 뒤 `LIVE_RESUME_WINDOW_MS`(60분)가 지났다(토큰 만료 안전 창 밖) | `end` | 종전 |
// | C6 | 그 밖 | `resume` | 같은 토큰 + 핸들로 다시 연결 |
// 다시 연결이 `RESUME_ATTEMPTS_PER_DROP`번 모두 실패하면 C2 → 종전 종료 순으로 떨어진다(소켓 오류가 먼저 났으면 종전 `onError`).
//
// ── 판정표 2: goAway를 받았을 때(`decideGoAway`) — 실측에서는 오지 않았다(닫힘 경로가 필수 · 이것은 보조) ──
// | # | 조건 | 판정 |
// |---|---|---|
// | G1 | 판정표 1이 `resume`이 아니다 | `ignore` — 닫힘 경로에 맡긴다 |
// | G2 | 모델이 말하는 중 · 응답 대기 · 도구 대기 | `later` — 다음 턴 끝(turnComplete)에서 다시 본다 |
// | G3 | 그 밖(유휴) | `now` — 미리 다시 연결한다 |
//
// ── 판정표 3: 토큰(서버 `geminiProvider.ts`) ──
// | 항목 | 값 | 근거 |
// |---|---|---|
// | 사용 횟수 `uses` | 2(종전) | 이어받기는 횟수를 쓰지 않는다(SDK 2.13 `CreateAuthTokenConfig.uses` 주석) |
// | 메시지 수명 `expireTime` | 65분 | 통화 최대 60분 + 새 세션 시작 창 2분 + 여유 3분 — 새 토큰 발급 경로가 필요 없다 |
// | 새 세션 시작 창 | 2분(종전) | 이어받기는 새 세션이 아니다(문서 — "같은 토큰으로 재연결" · 실측 확인 전) |
// | 브라우저 이어받기 창 | 첫 연결 뒤 60분 | 토큰은 발급 뒤 2분 안에 연결돼야 하므로 첫 연결 뒤 최소 63분 유효하다 |

export type LiveCloseDecision = "resume" | "background" | "end";
export type GoAwayDecision = "now" | "later" | "ignore";

/** 한 통화에서 조용히 다시 연결하는 최대 횟수 — 60분 ÷ 약 10분 = 6회 + 여유 2회(판단값). */
export const MAX_LIVE_RESUMES = 8;
/** 연결이 한 번 끊겼을 때 다시 연결을 시도하는 횟수(판단값). */
export const RESUME_ATTEMPTS_PER_DROP = 2;
/** 실패한 시도 뒤 다음 시도까지 기다리는 시간(판단값). */
export const RESUME_RETRY_DELAY_MS = 600;
/**
 * 다시 연결 1회의 상한. SDK `live.connect()`는 서버가 설정을 거부하고 닫으면 끝나지 않고 멈춰 있으므로(2.13 `Live.connect` —
 * `setupComplete`만 기다린다) 이 시간과 "준비 전 닫힘"으로 실패를 판정한다(판단값).
 */
export const RESUME_CONNECT_TIMEOUT_MS = 8000;
/** 첫 연결 뒤 이 시간까지만 같은 토큰으로 이어받는다 — 서버 토큰 수명(65분) − 새 세션 시작 창(2분) − 여유(3분). */
export const LIVE_RESUME_WINDOW_MS = 60 * 60 * 1000;

export type LiveCloseInput = {
  stopRequested: boolean;
  hangupLatched: boolean;
  /** §99 `decideSocketClose`의 결과(가려짐 · 복귀 직후면 "reconnect"). */
  backgroundDecision: "reconnect" | "end";
  /** 서버가 보낸 마지막 이어받기 핸들(빈 문자열 = 없음). */
  handle: string | null;
  resumesSoFar: number;
  /** 첫 연결이 열린 시각(`performance.now()` 기준) — 아직 안 열렸으면 null. */
  firstOpenAtMs: number | null;
  nowMs: number;
};

export function decideLiveClose(input: LiveCloseInput): LiveCloseDecision {
  if (input.stopRequested || input.hangupLatched) return "end"; // C1
  if (input.backgroundDecision === "reconnect") return "background"; // C2
  if (!input.handle) return "end"; // C3
  if (input.resumesSoFar >= MAX_LIVE_RESUMES) return "end"; // C4
  if (input.firstOpenAtMs === null || input.nowMs - input.firstOpenAtMs >= LIVE_RESUME_WINDOW_MS) return "end"; // C5
  return "resume"; // C6
}

export function decideGoAway(input: LiveCloseInput & { modelBusy: boolean }): GoAwayDecision {
  if (decideLiveClose(input) !== "resume") return "ignore"; // G1
  if (input.modelBusy) return "later"; // G2
  return "now"; // G3
}

/**
 * 서버의 `sessionResumptionUpdate`를 반영한 다음 핸들. 이어받을 수 없는 순간(`resumable: false` · 빈 핸들 — 모델이 말하거나
 * 도구를 실행하는 중)에는 앞서 받은 핸들을 그대로 쓴다(그 시점까지는 되살릴 수 있다).
 */
export function nextResumeHandle(current: string | null, update: { newHandle?: string; resumable?: boolean } | undefined): string | null {
  if (!update) return current;
  if (update.resumable === false) return current;
  return update.newHandle ? update.newHandle : current;
}

/** 진단 패널 · 로그에 남기는 재연결 사유(숫자 · 고정 낱말만 — 핸들 · 토큰 · 이유 문장은 싣지 않는다). */
export function formatResumeReason(kind: "close" | "goaway" | "fail", code?: number | null): string {
  if (kind === "goaway") return "goaway";
  const c = typeof code === "number" && Number.isFinite(code) ? String(code) : "-";
  return `${kind}:${c}`;
}

/** close 이벤트(브라우저 `CloseEvent` 모양)에서 코드만 꺼낸다. */
export function closeCodeOf(e: unknown): number | null {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code?: unknown }).code;
    return typeof code === "number" ? code : null;
  }
  return null;
}

/** production 로그 접두어(숫자 · 상태값만). */
export const LIVE_RESUME_LOG_PREFIX = "[live-resume]";
