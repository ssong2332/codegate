// 2026-11-06(메인 요청 2 — "말 인식 0회" 원인 자동 기록) — 클라가 통화 끝(레그 끝 전사 제출 · 세션 종료)에 실어 보내는 진단 요약의 판독 · 로그.
// 클라 짝 = `src/lib/realtime/callDiagSummary.ts`(같은 키 · 같은 허용값).
//
// | 규칙 | 내용 |
// |---|---|
// | 입력 검증(SEC-07 방식) | 허용 키만 · 숫자 = 0 ~ 10,000,000 정수 · dB = -200 ~ 0 정수 또는 null · 상태 = 허용 목록 · 불리언 |
// | 실패 처리 | 하나라도 어긋나면 요약 전체를 버린다(undefined) — ⛔ 전사 제출 · 세션 종료는 막지 않는다(진단은 부가 기능) |
// | 비용 | 외부 호출 0 · Firestore 읽기 · 쓰기 0 · 로그 1줄. 실을 수 있는 곳 = 이미 횟수가 정해진 두 호출(전사 제출 · 세션 종료)뿐 |
// | 개인 정보 | 숫자 · 상태값만(음성 · 대사 · 기기 식별자 0) |
// 로그 찾기(Cloud Logging): `jsonPayload.message="[call-diag] 통화 진단 요약"` (세션 하나 = `AND jsonPayload.sessionId="<id>"`).
import { logger } from "firebase-functions/v2";

const CTX_STATES = ["running", "suspended", "closed", "interrupted", "none"] as const;
const TRACK_STATES = ["live", "ended", "none"] as const;
const RT_STATES = ["idle", "connecting", "active", "reconnecting", "ended", "fallback", "unsupported", "permission-denied", "error", "unknown"] as const;
const MODES = ["undecided", "realtime", "fallback"] as const;

const COUNT_KEYS = ["micSent", "micDropEcho", "micDropMute", "asr", "rx", "unheard", "interrupts", "liveResumes"] as const;
const ENUM_KEYS = {
  outState: CTX_STATES,
  inState: CTX_STATES,
  track: TRACK_STATES,
  rt: RT_STATES,
  mode: MODES,
} as const;
const BOOL_KEYS = ["trackMuted", "trackEnabled"] as const;
const COUNT_MAX = 10_000_000;

export const CALL_DIAG_LOG_MESSAGE = "[call-diag] 통화 진단 요약";

export type CallDiag = { [K in (typeof COUNT_KEYS)[number]]: number } & {
  [K in keyof typeof ENUM_KEYS]: (typeof ENUM_KEYS)[K][number];
} & { [K in (typeof BOOL_KEYS)[number]]: boolean } & { micPeakDb: number | null };

const ALLOWED_KEYS = new Set<string>([...COUNT_KEYS, ...Object.keys(ENUM_KEYS), ...BOOL_KEYS, "micPeakDb"]);

/** 판독 — 허용 모양이 아니면 undefined(던지지 않는다). 부재 = undefined. */
export function readCallDiag(raw: unknown): CallDiag | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const input = raw as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!ALLOWED_KEYS.has(key)) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of COUNT_KEYS) {
    const v = input[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > COUNT_MAX) return undefined;
    out[key] = v;
  }
  for (const [key, allowed] of Object.entries(ENUM_KEYS)) {
    const v = input[key];
    if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) return undefined;
    out[key] = v;
  }
  for (const key of BOOL_KEYS) {
    if (typeof input[key] !== "boolean") return undefined;
    out[key] = input[key];
  }
  const db = input.micPeakDb;
  if (!(db === null || (typeof db === "number" && Number.isInteger(db) && db >= -200 && db <= 0))) return undefined;
  out.micPeakDb = db;
  return out as CallDiag;
}

/** 로그 1줄(숫자 · 상태값만). `at` = 어느 끝에서 보냈는가. */
export function logCallDiag(sessionId: string, at: "leg" | "end", diag: CallDiag, legIndex?: number): void {
  logger.info(CALL_DIAG_LOG_MESSAGE, { sessionId, at, ...(legIndex !== undefined ? { legIndex } : {}), ...diag });
}
