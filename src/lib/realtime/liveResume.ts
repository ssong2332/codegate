// ⭐ §140(2026-10-28 실 키 실측 · 메인 세션) — Gemini Live 연결은 약 10분(601초)에 서버가 닫는다(close 1011 "The service is currently
// unavailable." · goAway 0건). 예전에는 화면이 켜진 채 닫히면 통화가 그대로 끝났다(`decideSocketClose` → "end").
// 이제 **같은 토큰**으로 조용히 다시 연결한다. ⭐ 2026-10-29 실측(메인 · 사용자 청취 판정) — 이어받기 핸들로 되살린 연결은 여성
// 목소리가 남성으로 들리는 턴이 생겼다(speechConfig를 다시 넣어도 — #439). 그래서 핸들을 쓰지 않고 첫 연결과 같은 config로
// 새 세션을 열고(목소리는 토큰에 고정), 지금까지의 전사를 맥락으로 다시 넣는다(판정표 4). 핸들은 C3 신호로만 남는다.
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
// | C5 | 첫 연결 뒤 `LIVE_RESUME_WINDOW_MS`(22분)가 지났다(토큰 새 세션 창 밖) | `end` | 종전 |
// | C6 | 그 밖 | `resume` | 같은 토큰으로 핸들 없이 새 연결 + 전사 맥락 재주입 |
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
// | 실시간 통화 상한 | 20분 | 사용자 결정(2026-10-28) — 통화 화면 자동 종료 `MAX_REALTIME_CALL_MS`. 2026-10-29부터 음성 폴백 통화도 같은 20분(`callAutoEndLimitMs`). 전역 `maxSessionMs` 60분은 메신저용으로 서버에 그대로 |
// | 사용 횟수 `uses` | 3 | 핸들 없는 새 연결은 1회를 쓴다(SDK 2.13 `CreateAuthTokenConfig.uses` 주석 — 이어받기만 횟수를 쓰지 않는다) — 첫 연결 + 다시 연결 1회 + 재시도 1회(dev 이중 mount면 재시도 몫 없음) |
// | 새 세션 시작 창 | 25분 | ⛔ **이어받기에도 걸린다**(2026-10-28 재실측 — 창 2분 토큰의 602초 뒤 이어받기 2/2가 close 1011 "new_session_expire_time deadline exceeded"). 발급 → 받기 최대 1.5분 + 통화 20분 + 여유 3.5분 |
// | 메시지 수명 `expireTime` | 30분 | 새 세션 창 이상 — 새 토큰 발급 경로가 필요 없다 |
// | 브라우저 이어받기 창 | 첫 연결 뒤 22분 | 첫 연결은 발급 뒤 1.5분 안(프리페치 신선도) — 새 세션 창 25분 − 1.5분 = 23.5분 안쪽 · 통화 상한 20분 바깥 |

export type LiveCloseDecision = "resume" | "background" | "end";
export type GoAwayDecision = "now" | "later" | "ignore";

/** 실시간 통화 상한(사용자 결정 2026-10-28) — 서버 `REALTIME_CALL_MAX_MINUTES`와 같다(`liveResume.test.ts`가 고정). */
export const MAX_REALTIME_CALL_MS = 20 * 60 * 1000;

/**
 * 통화 화면 자동 종료 한도(ms). 실시간이든 Live 실패 뒤 음성 폴백(텍스트 + TTS)이든 **통화**는 20분 상한과 세션 문서
 * `maxSessionMs` 중 짧은 쪽에서 끝낸다(사용자 결정 2026-10-29 — 폴백 통화도 20분). 연결 판정 전(`undecided`) · 세션 문서를
 * 아직 못 읽었으면 `null`(판정 보류). 메신저 대화방은 이 화면 밖이라 서버 `MAX_SESSION_MS`(60분)를 그대로 쓴다.
 */
export function callAutoEndLimitMs(
  callMode: "undecided" | "realtime" | "fallback",
  maxSessionMs: number | null,
): number | null {
  if (callMode === "undecided" || maxSessionMs === null) return null;
  return Math.min(maxSessionMs, MAX_REALTIME_CALL_MS);
}

/** 한 통화에서 조용히 다시 연결하는 최대 횟수 — 22분 ÷ 약 10분 = 2회 + 여유 2회(판단값). */
export const MAX_LIVE_RESUMES = 4;
/** 연결이 한 번 끊겼을 때 다시 연결을 시도하는 횟수(판단값). */
export const RESUME_ATTEMPTS_PER_DROP = 2;
/** 실패한 시도 뒤 다음 시도까지 기다리는 시간(판단값). */
export const RESUME_RETRY_DELAY_MS = 600;
/**
 * 다시 연결 1회의 상한. SDK `live.connect()`는 서버가 설정을 거부하고 닫으면 끝나지 않고 멈춰 있으므로(2.13 `Live.connect` —
 * `setupComplete`만 기다린다) 이 시간과 "준비 전 닫힘"으로 실패를 판정한다(판단값).
 */
export const RESUME_CONNECT_TIMEOUT_MS = 8000;
/** 첫 연결 뒤 이 시간까지만 같은 토큰으로 이어받는다 — 통화 상한(20분)보다 길고, 서버 새 세션 창(25분) − 발급→받기 최대(1.5분)보다 짧다. */
export const LIVE_RESUME_WINDOW_MS = 22 * 60 * 1000;

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

// ── 판정표 4: 조용히 다시 연결한 뒤 넣는 대화 맥락(`buildSilentResumeContext`) ──
// ⭐ 2026-10-29 — 다시 연결이 핸들 없는 새 세션이 되어 앱은 `covered`를 빈 범위로 넘긴다(전사 전부 · 상한 안). 아래 핸들 범위 설명은 옛 경로 기록이다.
// ⭐ 2026-10-28 2차 실 키 재검증(메인 · head `5a88d5b`) — 같은 토큰 + 마지막 핸들로 1회 만에 다시 연결됐지만 **맥락 0**이었다
// (0초 · 540초에 알려 준 암호 둘 다 "기억나지 않는다"). `sessionResumptionUpdate`는 연결 직후 1건(3초)만 오고 10분간 0건이었다 —
// 핸들이 대화 시작 전 상태에 멈춰 있었다(텍스트 턴만 쓴 프로브라 그랬을 가능성은 미확인). 그래서 핸들 재연결(시스템 프롬프트 · 음성 ·
// 도구 유지 · 약 1초)은 그대로 두고, 그 위에 지금까지의 전사를 `turnComplete: false` 맥락으로 다시 넣는다(응답을 일으키지 않는다).
//
// | # | 조건 | 결과 |
// |---|---|---|
// | S1 | 넣을 전사가 0턴(빈 통화 · 전부 핸들 범위) | 맥락 없음 · 이어 말하기 없음 |
// | S2 | 핸들을 받은 뒤 쌓인 전사가 있다 | 핸들 범위(`covered`)를 빼고 나머지를 최근 것부터 상한까지 담아 시간 순으로 — `turnComplete: false` |
// | S3 | S2 + 끊길 때 사기범이 말하던 중(`droppedMidTurn`) | S2 맥락 + 이어 말하기 트리거 1회(보류 큐 `silence` 턴 — 끊긴 말을 한 문장으로 마무리) |
// | S4 | S2 + 유휴 · 참가자 차례 | S2 맥락만 — 참가자의 다음 말을 기다린다 |
// 중복 방지 기준: 핸들을 받은 시점까지 **이 연결이** 내보낸 전사는 서버 상태에 있다고 본다(추정 — 실측은 핸들이 대화 전에 멈춘 경우뿐).
// 그 범위에서 끝의 `RESUME_CONTEXT_OVERLAP_TURNS`턴은 다시 넣는다(핸들 직전 턴이 상태에 덜 들어갔을 때 잃는 것보다 겹치는 편이 낫다).
// 이 연결 전에 쌓인 전사(§99 재연결 · §136 새로고침 이전)는 핸들 상태에 없으므로 언제나 넣는다.

export type SilentResumeTurn = { role: "user" | "scammer"; text: string };

/** 맥락에 싣는 최근 턴 수 · 한 턴 글자 수 · 대화 줄 전체 글자 수 상한(판단값 — 20분 통화 전사가 커질 수 있다). */
export const RESUME_CONTEXT_MAX_TURNS = 40;
export const RESUME_CONTEXT_MAX_TURN_CHARS = 200;
export const RESUME_CONTEXT_MAX_TOTAL_CHARS = 6000;
/** 핸들 범위 끝에서 다시 넣는 턴 수(판단값). */
export const RESUME_CONTEXT_OVERLAP_TURNS = 2;

/** 이어 말하기 트리거(S3) — 보류 큐 `silence` 턴. 오케스트레이션 신호라 전사에 기록하지 않는다. */
export const RESUME_CONTINUE_TRIGGER =
  "(연결이 잠깐 끊겼다가 다시 이어졌다. 끊기기 직전에 하던 말을 한 문장으로 짧게 마무리하고 상대 대답을 기다려라. 다시 소개하거나 '다시 연결됐다'고 말하지 마라.)";

/**
 * 핸들이 이미 담고 있다고 보는 전사 범위 `[start, end)`.
 * - `instanceBaseline`: 이 연결(세션 컴포넌트)이 시작될 때 이미 있던 전사 수(그 앞은 핸들 상태에 없다).
 * - `instanceTurnsAtHandle`: 마지막 핸들을 받았을 때까지 이 연결이 내보낸 전사 수.
 */
export function handleCoveredRange(instanceBaseline: number, instanceTurnsAtHandle: number): { start: number; end: number } {
  const start = Math.max(0, instanceBaseline);
  return { start, end: start + Math.max(0, instanceTurnsAtHandle - RESUME_CONTEXT_OVERLAP_TURNS) };
}

export function buildSilentResumeContext(input: {
  turns: readonly SilentResumeTurn[];
  covered: { start: number; end: number };
  droppedMidTurn: boolean;
}): { context: string | null; continueTrigger: string | null } {
  const picked = input.turns
    .map((t, i) => ({ i, role: t.role, text: t.text.replace(/\s+/g, " ").trim() }))
    .filter((t) => t.text.length > 0 && !(t.i >= input.covered.start && t.i < input.covered.end));
  if (picked.length === 0) return { context: null, continueTrigger: null }; // S1
  const lines: string[] = [];
  let total = 0;
  for (let k = picked.length - 1; k >= 0 && lines.length < RESUME_CONTEXT_MAX_TURNS; k -= 1) {
    const t = picked[k];
    const text = t.text.length > RESUME_CONTEXT_MAX_TURN_CHARS ? `${t.text.slice(0, RESUME_CONTEXT_MAX_TURN_CHARS)}…` : t.text;
    const line = `${t.role === "scammer" ? "나" : "상대"}: ${text}`;
    if (total + line.length > RESUME_CONTEXT_MAX_TOTAL_CHARS && lines.length > 0) break;
    lines.push(line);
    total += line.length;
  }
  lines.reverse();
  const omitted = picked.length > lines.length;
  const context = [
    "(통화 연결이 잠깐 끊겼다가 방금 다시 이어졌다. 상대에게는 거의 티가 나지 않았다. 아래는 이 통화에서 지금까지 오간 대화다(오래된 것부터).",
    "같은 인물 · 같은 목적 그대로, 이미 한 말과 상대가 알려 준 정보(이름 · 번호 · 금액 · 답변 등)를 모두 기억하고 이어가라. 이미 기억하는 부분과 겹치면 한 번만 반영하라.",
    "다시 소개하거나 처음부터 시작하지 말고, 이 안내 자체에는 대답하지 마라.",
    ...(omitted ? ["(더 앞선 대화는 길어서 생략했다.)"] : []),
    "대화:",
    ...lines,
    ")",
  ].join("\n");
  return { context, continueTrigger: input.droppedMidTurn ? RESUME_CONTINUE_TRIGGER : null }; // S3 · S4
}
