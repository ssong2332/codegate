// §99(사용자 실기 신고 2026-10-21 · 갤럭시 S25 웨일 · 크롬 — *"핸드폰이 꺼지면 마이크를 통해서 웹사이트에 전달하지
// 못하는 거 같은데"*) — 화면 꺼짐 · 다른 앱 전환 · 탭 전환 뒤의 통화 복구 판정. 브라우저 API를 만지지 않는 순수 함수만 둔다
// (`GeminiVoiceSession` · `useRealtimeCall` · 통화 화면이 이 판정을 그대로 쓴다 — `backgroundCall.test.ts`).
//
// 왜 필요한가(근거 = `docs/research/screen-off-call-2026-10.md`):
//   - 화면이 꺼지거나 앱이 뒤로 가면 마이크는 무음(Android 유휴 앱 — 0으로 채운 버퍼) · 음소거(iOS — track.muted)가 되고,
//     오디오 컨텍스트는 suspended/interrupted가 되며, Live 소켓은 끊길 수 있다(브라우저 · OS마다 다르다 — 실기 확인 대상).
//   - 예전에는 소켓이 닫히면 무조건 "상대가 끊음"(`endCall("remote")`)으로 통화가 끝났다 — 화면을 끈 것만으로 훈련이 끝났다.

/** production 로그 접두어(숫자 · 상태값만 — 전사 텍스트 0). 실기 원격 디버깅(chrome://inspect)으로 읽는다. */
export const BACKGROUND_LOG_PREFIX = "[live-bg]";

/** 화면에 돌아온 직후 이 시간 안에 소켓이 닫히면 "가려진 동안 끊긴 것"으로 본다(닫힘 통보가 복귀 뒤에 오는 경우 — 판단값). */
export const RECENT_RETURN_WINDOW_MS = 5000;
/** 한 통화에서 가려짐 때문에 다시 연결하는 최대 횟수(넘으면 텍스트 대화로 이어간다 — 판단값 · 통화 전체 기준). */
export const MAX_BACKGROUND_RECONNECTS = 2;
/** 이보다 짧게 가려졌다 돌아오면(알림창 내리기 등) "말이 전달되지 않았을 수 있어요" 안내를 띄우지 않는다(판단값). */
export const RETURN_NOTICE_MIN_HIDDEN_MS = 3000;

/** 복귀 뒤 마이크 트랙 상태를 다시 보기까지 기다리는 시간 — 브라우저가 스스로 음소거를 푸는 경우를 기다린다(판단값). */
export const MIC_RECHECK_DELAY_MS = 700;

export type SocketCloseDecision = "reconnect" | "end";

/**
 * Live 소켓이 닫혔을 때 통화를 끝낼지(종전) · 다시 연결할지.
 * ⛔ 사용자가 끊었거나(`stopRequested`) 끊기 승인 · 종료 래치가 걸렸으면(`hangupLatched`) 언제나 종전대로 끝낸다.
 */
export function decideSocketClose(input: {
  hiddenNow: boolean;
  lastVisibleAtMs: number | null;
  wasHiddenBefore: boolean;
  nowMs: number;
  stopRequested: boolean;
  hangupLatched: boolean;
}): SocketCloseDecision {
  if (input.stopRequested || input.hangupLatched) return "end";
  if (input.hiddenNow) return "reconnect";
  if (
    input.wasHiddenBefore &&
    input.lastVisibleAtMs !== null &&
    input.nowMs - input.lastVisibleAtMs <= RECENT_RETURN_WINDOW_MS
  ) {
    return "reconnect";
  }
  return "end";
}

/** 다시 연결해도 되는가 — 한도 안이면 다시 연결, 넘으면 텍스트 대화로 이어간다(통화를 끝내지 않는다). */
export function decideReconnectBudget(reconnectsSoFar: number): "reconnect" | "fallback" {
  return reconnectsSoFar < MAX_BACKGROUND_RECONNECTS ? "reconnect" : "fallback";
}

/** 돌아왔을 때 안내를 띄우는가 — 충분히 오래 가려졌거나, 그 사이 연결이 끊겨 다시 잇는 경우. */
export function shouldShowReturnNotice(input: { hiddenMs: number; reconnectPending: boolean }): boolean {
  return input.reconnectPending || input.hiddenMs >= RETURN_NOTICE_MIN_HIDDEN_MS;
}

export type MicTrackView = { readyState: string; muted: boolean } | null;

/**
 * 화면에 돌아온 뒤(기다림 `MIC_RECHECK_DELAY_MS` 뒤) 마이크를 다시 열어야 하는가.
 * ⭐ §105 완화 (a)(메인 승인 2026-10-22) — **끝난 트랙(ended)만** 다시 연다. muted는 Android에서 OS가 스스로 푸는 일시 상태라
 * 그대로 둔다(예전: muted도 다시 열어 옛 트랙을 닫았다 — 웨일 실기 "말해도 묵묵부답"의 후보 경로, 추정). iOS의 풀리지 않는 muted는
 * 화면의 "계속하기" 탭(소리 · 마이크 재개 제스처)이 맡는다. 트랙이 없으면(아직 연결 전) 그대로.
 */
export function decideMicRecovery(track: MicTrackView): "keep" | "reacquire" {
  if (!track) return "keep";
  if (track.readyState === "ended") return "reacquire";
  return "keep";
}

/**
 * ⭐ §105 완화 (b) — 새로 연 트랙으로 갈아 끼워도 되는가. **살아 있고(live) 음소거가 아닐 때만** 갈아 끼우고 옛 트랙을 닫는다.
 * 아니면 새 트랙을 닫고 옛 트랙을 그대로 둔다(쓸 수 있는 입력을 쓸 수 없는 입력으로 바꾸지 않는다).
 */
export function isReplacementTrackUsable(track: MicTrackView): boolean {
  return track !== null && track.readyState === "live" && !track.muted;
}

// ── 다시 연결할 때 넣는 맥락(새 Live 세션은 시스템 프롬프트만 안다 — 지금까지의 대화를 텍스트 턴으로 알려 준다) ──

/** 맥락에 싣는 최근 턴 수 · 한 턴 글자 수 · 대화 줄 전체 글자 수 상한(판단값 — 길면 첫 응답이 늦어진다 · 머리 지시문 제외). */
export const RESUME_MAX_TURNS = 12;
export const RESUME_MAX_TURN_CHARS = 160;
export const RESUME_MAX_TOTAL_CHARS = 1600;

export type ResumeTurn = { role: "user" | "scammer"; text: string };

/**
 * 재연결 첫 턴 문구. 지금까지 전사가 없으면 `null`(호출부는 종전 오프닝 트리거를 쓴다).
 * 이 문구는 오프닝 트리거와 같은 **오케스트레이션 신호**다 — 전사에 기록하지 않는다(G105와 같은 이유).
 */
export function buildResumeTurn(turns: readonly ResumeTurn[]): string | null {
  const usable = turns
    .map((t) => ({ role: t.role, text: t.text.replace(/\s+/g, " ").trim() }))
    .filter((t) => t.text.length > 0);
  if (usable.length === 0) return null;
  const lines: string[] = [];
  let total = 0;
  // 최근 턴부터 거꾸로 담고(상한에서 자른다) 마지막에 시간 순으로 되돌린다.
  for (let i = usable.length - 1; i >= 0 && lines.length < RESUME_MAX_TURNS; i -= 1) {
    const t = usable[i];
    const text = t.text.length > RESUME_MAX_TURN_CHARS ? `${t.text.slice(0, RESUME_MAX_TURN_CHARS)}…` : t.text;
    const line = `${t.role === "scammer" ? "나" : "상대"}: ${text}`;
    if (total + line.length > RESUME_MAX_TOTAL_CHARS && lines.length > 0) break;
    lines.push(line);
    total += line.length;
  }
  lines.reverse();
  return [
    "(통화가 잠시 끊겼다가 방금 다시 연결됐다. 아래는 끊기기 전까지 이 통화에서 오간 대화다. 같은 인물 · 같은 목적을 그대로 이어가라.",
    "처음부터 다시 소개하지 말고, '여보세요, 다시 연결됐네요. 잘 들리세요?'처럼 짧게 확인한 뒤 끊기기 직전 이야기를 이어가라.",
    "대화:",
    ...lines,
    ")",
  ].join("\n");
}

// ── 전사 백업(탭이 백그라운드에서 정리돼 새로고침되면 메모리의 전사가 사라진다 — 탭 sessionStorage에 같이 적어 둔다) ──

export const TRANSCRIPT_BACKUP_KEY = "session.liveTranscriptBackup";
/** 서버 제출 상한(`submitRealtimeTranscript` MAX_TURNS = 200)과 같다. */
export const TRANSCRIPT_BACKUP_MAX_TURNS = 200;

export type BackupTurn = { role: "user" | "scammer"; text: string; atMs?: number };

// 리뷰 Major — 기기에 남기는 백업은 **서버 저장과 같은 규칙으로 먼저 가린다**(`functions/src/guardrails/index.ts` `maskPII`의
// 정규식 4종 · 같은 순서 사본 — `backgroundCall.test.ts`가 두 파일의 정규식이 같은지 고정한다). 서버는 제출받은 값을 다시
// 가린다(가린 토큰에는 숫자가 없어 재매칭 0 — 멱등).
const BACKUP_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BACKUP_RRN = /\b\d{6}-\d{7}\b/g;
const BACKUP_PHONE = /\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g;
const BACKUP_ACCOUNT = /\b\d[\d -]{6,}\d\b/g;
export function maskBackupText(text: string): string {
  return text
    .replace(BACKUP_EMAIL, "[이메일]")
    .replace(BACKUP_RRN, "[주민번호]")
    .replace(BACKUP_PHONE, "[전화]")
    .replace(BACKUP_ACCOUNT, (match) => (match.replace(/[- ]/g, "").length >= 8 ? "[계좌]" : match));
}

export function serializeTranscriptBackup(sessionId: string, turns: readonly BackupTurn[]): string {
  return JSON.stringify({
    sessionId,
    turns: turns.slice(-TRANSCRIPT_BACKUP_MAX_TURNS).map((t) => ({ ...t, text: maskBackupText(t.text) })),
  });
}

/** 다른 세션 · 깨진 값 · 모양이 다른 값은 빈 배열(복원하지 않는다). */
export function parseTranscriptBackup(raw: string | null, sessionId: string): BackupTurn[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const record = parsed as { sessionId?: unknown; turns?: unknown };
  if (record.sessionId !== sessionId || !Array.isArray(record.turns)) return [];
  const out: BackupTurn[] = [];
  for (const item of record.turns.slice(-TRANSCRIPT_BACKUP_MAX_TURNS)) {
    if (!item || typeof item !== "object") continue;
    const t = item as { role?: unknown; text?: unknown; atMs?: unknown };
    if ((t.role !== "user" && t.role !== "scammer") || typeof t.text !== "string" || !t.text.trim()) continue;
    out.push(typeof t.atMs === "number" && Number.isFinite(t.atMs) ? { role: t.role, text: t.text, atMs: t.atMs } : { role: t.role, text: t.text });
  }
  return out;
}

// ── 통화 화면 안내(문구는 이 파일이 소유한다 — 어르신이 읽기 쉬운 짧은 문장) ──

export const SCREEN_OFF_COPY = {
  /** 통화 벨 직전 고지(세션 전 화면)의 한 줄. */
  // §130(UX D-161 (13) · 메인 결정 2026-10-24) — 스피커 기본값은 꺼짐(D-98)이라 "스피커로 들어 주세요"와 어긋났다. 켜는 것은 선택으로 안내한다.
  preCallHint: "통화하는 동안에는 화면을 켜 두세요. 필요하면 스피커를 켜 주세요.",
  /** 다시 연결하는 중(자동). */
  reconnecting: "통화를 다시 연결하고 있어요…",
  /**
   * 화면에 돌아왔을 때(가려졌던 통화). 버튼 탭은 iOS에서 **소리(오디오 컨텍스트)를 다시 켜는** 사용자 동작이 된다(화면의 탭 안전망).
   * 마이크 재확인 · 다시 열기는 탭과 무관하게 복귀 0.7초 뒤 자동으로 1회 한다(QA D3 — 문서 정정).
   */
  returned: "화면이 꺼져 있던 동안에는 말이 전달되지 않았을 수 있어요. 지금부터 다시 말씀해 주세요.",
  returnedAction: "계속하기",
  /** 화면 켜짐 유지를 쓸 수 없는 브라우저(지원 없음 · 거부). */
  keepAwakeUnavailable: "통화 중 화면이 꺼지면 말이 전달되지 않아요. 화면이 어두워지면 빈 곳을 한 번 눌러 주세요.",
  /** 다시 연결하지 못해 글로 이어갈 때. */
  reconnectFailed: "통화를 다시 연결하지 못해 글로 이어서 진행해요.",
} as const;
