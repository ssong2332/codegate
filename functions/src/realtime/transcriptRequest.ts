// SEC-07 · 전사 재전송(외부 보안 점검 2차 · 2026-11-02) — `submitRealtimeTranscript` 요청 판독 · 저장 전 정규화 · 중복 키
// (잎 모듈 — Firestore · onCall 0, 테스트가 직접 부른다).
//
// 판독표(어긋나면 요청 전체를 invalid-argument로 거절 — 세션 read 0 · 저장 0):
// | 필드 | 허용 |
// |---|---|
// | sessionId | 문서 ID(`requestValidation.ts`) |
// | turns | 배열 · 0~200개 · 각 항목 = 객체 · role ∈ {user, scammer} · text 문자열 · atMs 부재 또는 유한 숫자 |
// | openingNotSpoken | 부재 또는 불리언 |
// | answeredAtMs | 부재 또는 유한 숫자 |
// | batchId | 부재 또는 `[A-Za-z0-9_-]` 8~64자 |
//
// ⭐ 전에는 `role`이 user가 아니면 전부 scammer로 저장했고(잘못된 역할 저장), `null` 항목은 `turn.role`에서 예외가 났다.
//
// 중복 키(같은 전사를 다시 보내면 두 번째는 저장 0):
// | 요청 | 키 |
// |---|---|
// | batchId 있음(새 화면 — 제출 1회마다 새 값) | `b_<batchId>` |
// | batchId 없음(옛 화면 캐시) | `h_<정규화된 전사 sha256>` — 역할 · 가린 본문 · atMs |
// ⛔ 종료된 세션을 막지 않는다 — 통화 종료 직후 제출이 정상 흐름이다(그 경로는 키로만 거른다).
import { createHash } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { maskPII } from "../guardrails";
import { readDocId, readOptionalBoolean, readOptionalFiniteNumber } from "../shared/requestValidation";
import { stripLeakedThought } from "./thoughtLeak";

/** 한 번에 제출 가능한 턴 수 상한 — 악의적/폭주 입력 방지(정상 통화는 수십 턴 이내). */
export const TRANSCRIPT_MAX_TURNS = 200;
export const TRANSCRIPT_MAX_TEXT_LEN = 2000;
const BATCH_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export type TranscriptRole = "user" | "scammer";
export type ReadTranscriptTurn = { role: TranscriptRole; text: string; atMs?: number };
export type ReadTranscriptRequest = {
  sessionId: string;
  turns: ReadTranscriptTurn[];
  openingNotSpoken?: boolean;
  answeredAtMs?: number;
  batchId?: string;
};
/** 저장할 한 줄 — `index`는 제출 배열 안 원래 위치(시각 합성 `resolveTurnCreatedAtMs`가 쓴다). */
export type PreparedTranscriptTurn = { index: number; role: TranscriptRole; textMasked: string; atMs?: number };

export function readTranscriptRequest(data: unknown): ReadTranscriptRequest {
  const raw = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const sessionId = readDocId(raw.sessionId, "sessionId");
  if (!Array.isArray(raw.turns)) {
    throw new HttpsError("invalid-argument", "sessionId와 turns가 필요합니다.");
  }
  if (raw.turns.length > TRANSCRIPT_MAX_TURNS) {
    throw new HttpsError("invalid-argument", "제출 가능한 턴 수를 초과했습니다.");
  }
  const turns = raw.turns.map((item, i): ReadTranscriptTurn => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new HttpsError("invalid-argument", `turns[${i}]가 올바르지 않습니다.`);
    }
    const turn = item as Record<string, unknown>;
    if (turn.role !== "user" && turn.role !== "scammer") {
      throw new HttpsError("invalid-argument", `turns[${i}].role이 올바르지 않습니다.`);
    }
    if (typeof turn.text !== "string") {
      throw new HttpsError("invalid-argument", `turns[${i}].text가 올바르지 않습니다.`);
    }
    const atMs = readOptionalFiniteNumber(turn.atMs, `turns[${i}].atMs`);
    return atMs === undefined ? { role: turn.role, text: turn.text } : { role: turn.role, text: turn.text, atMs };
  });
  const openingNotSpoken = readOptionalBoolean(raw.openingNotSpoken, "openingNotSpoken");
  const answeredAtMs = readOptionalFiniteNumber(raw.answeredAtMs, "answeredAtMs");
  let batchId: string | undefined;
  if (raw.batchId !== undefined && raw.batchId !== null) {
    if (typeof raw.batchId !== "string" || !BATCH_ID_PATTERN.test(raw.batchId)) {
      throw new HttpsError("invalid-argument", "batchId가 올바르지 않습니다.");
    }
    batchId = raw.batchId;
  }
  return {
    sessionId,
    turns,
    ...(openingNotSpoken !== undefined ? { openingNotSpoken } : {}),
    ...(answeredAtMs !== undefined ? { answeredAtMs } : {}),
    ...(batchId ? { batchId } : {}),
  };
}

/** 저장 전 정규화 — 길이 자르기 · §116 사기범 사고 문장 제거 · PII 가림 · 빈 줄 제외(종전 저장 규칙 그대로). */
export function prepareTranscriptTurns(turns: readonly ReadTranscriptTurn[]): PreparedTranscriptTurn[] {
  const out: PreparedTranscriptTurn[] = [];
  turns.forEach((turn, index) => {
    const submitted = turn.text.slice(0, TRANSCRIPT_MAX_TEXT_LEN);
    const raw = turn.role === "scammer" ? stripLeakedThought(submitted) : submitted;
    const textMasked = maskPII(raw).trim();
    if (!textMasked) return;
    out.push(turn.atMs === undefined ? { index, role: turn.role, textMasked } : { index, role: turn.role, textMasked, atMs: turn.atMs });
  });
  return out;
}

/** 중복 표시 문서 키(`sessions/{sid}/transcriptBatches/{key}`). */
export function transcriptBatchKey(batchId: string | undefined, prepared: readonly PreparedTranscriptTurn[]): string {
  if (batchId) return `b_${batchId}`;
  const digest = createHash("sha256")
    .update(JSON.stringify(prepared.map((t) => [t.role, t.textMasked, t.atMs ?? null])))
    .digest("hex");
  return `h_${digest}`;
}
