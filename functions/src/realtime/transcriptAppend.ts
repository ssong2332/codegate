// 실시간 전사 델타의 마스킹 append — **코어 1개**(T191 릴레이 설계 "startRelayLeg" 트랜잭션 행).
//
// `submitRealtimeTranscript`(통화 종료 시)와 `startRelayLeg`(교대 시점, 통화 중)가 **같은 함수**로 쓴다 —
// 두 콜러블이 마스킹 · 인덱스 · 시각 규칙을 따로 가지면 한쪽만 고쳐지는 드리프트가 생긴다. 이 함수는
// `submitTranscript.ts`에 있던 트랜잭션 본문을 **동작 무변경으로** 옮긴 것이다(옮긴 뒤 달라진 것은
// 교대 뒤 사기범 줄의 `speakerLabel` 1필드뿐이며, 교대가 없는 세션은 쓰는 문서가 바이트 단위로 같다).
//
// ⛔ 원문(`turn.text`)은 **저장하지 않는다** — `maskPII`를 거친 값만 `textMasked`로 쓴다(ADR-0004 · AC-024).
// ⛔ **G350** — 이어 붙일 인덱스는 `historyDocs.length`(문서 수) 그대로다. `notSpoken` 마크는 이 값에 반영하지 않는다.
import { Timestamp } from "firebase-admin/firestore";
import { maskPII } from "../guardrails";
import { findOpeningToMarkNotSpoken } from "./openingMark";
import { resolveTurnCreatedAtMs } from "./transcriptTiming";
import type { MessageDoc, SessionDoc } from "../shared/types";

/**
 * §57.2 (6) 처방 D1 — `atMs`: 참가자 시계 기준 상대 ms(`answeredAtMs` 대비). 부재 = 현행 합성
 * 로직 그대로(무백필 · 과거 클라이언트 무영향). 계산·클램프 규칙은 `transcriptTiming.ts` 참고.
 */
export type TranscriptTurn = { role: "user" | "scammer"; text: string; atMs?: number };

/** 한 번에 제출 가능한 턴 수 상한 — 악의적/폭주 입력 방지(정상 통화는 수십 턴 이내). */
export const MAX_TRANSCRIPT_TURNS = 200;
export const MAX_TRANSCRIPT_TEXT_LEN = 2000;

type TxLike = {
  create(ref: FirebaseFirestore.DocumentReference, data: MessageDoc): unknown;
  update(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>): unknown;
};

export type AppendMaskedTranscriptInput = {
  sessionRef: FirebaseFirestore.DocumentReference;
  messagesRef: FirebaseFirestore.CollectionReference;
  /** 같은 트랜잭션에서 `turnIndex asc`로 읽은 기존 메시지 문서. */
  historyDocs: readonly { ref: FirebaseFirestore.DocumentReference; data(): unknown }[];
  session: SessionDoc;
  turns: readonly TranscriptTurn[];
  openingNotSpoken?: boolean;
  answeredAtMs?: number;
  /** 교대 뒤 leg의 화자 표기(UX 계약 C-8) — 사기범 줄에만 붙는다. 부재 = 붙이지 않는다(종전과 동일). */
  scammerSpeakerLabel?: string;
  nowMs: number;
};

export type AppendMaskedTranscriptResult = {
  /** 실제로 쓴 문서 수(마스킹 후 빈 턴 제외). */
  count: number;
  /** 다음 append가 쓸 turnIndex(= 기존 문서 수 + count). */
  nextIndex: number;
  /** 이번에 쓴 문서(같은 트랜잭션 안의 후속 판단 — 인계 블록 · 교대 하한 — 이 다시 읽지 않고 쓴다). */
  written: MessageDoc[];
};

/** 마스킹 후 비어 있지 않은 참가자 턴 수(교대 하한 판정 — 저장 결과와 같은 기준). */
export function countMaskedUserTurns(turns: readonly TranscriptTurn[]): number {
  return turns.filter((turn) => turn.role === "user" && maskTurnText(turn) !== "").length;
}

function maskTurnText(turn: TranscriptTurn): string {
  const raw = typeof turn.text === "string" ? turn.text.slice(0, MAX_TRANSCRIPT_TEXT_LEN) : "";
  return maskPII(raw).trim();
}

export function appendMaskedTranscriptTurns(
  tx: TxLike,
  input: AppendMaskedTranscriptInput,
): AppendMaskedTranscriptResult {
  const { session, turns, answeredAtMs } = input;
  let nextIndex = input.historyDocs.length;

  // §55 D3 — 클라가 "오프닝이 낭독되지 않았다"고 알려준 세션에서만, 이미 읽어 둔 이력 안의 오프닝
  // 문서에 마크를 붙인다(**추가 read 0회**, 같은 트랜잭션, 멱등).
  // ⛔ `turnIndex`·`createdAt`·기존 필드는 한 줄도 고치지 않는다(문서를 지우거나 옮기지도 않는다).
  const openingPos = findOpeningToMarkNotSpoken(
    input.historyDocs.map((doc) => doc.data() as MessageDoc),
    input.openingNotSpoken,
  );
  if (openingPos >= 0) {
    tx.update(input.historyDocs[openingPos].ref, { notSpoken: true });
  }
  const baseTime = input.nowMs;
  // §57.2 (6) 처방 D1 — 클램프 하한이자 `answeredAtMs` 부재 시 기준점 폴백.
  const sessionCreatedAtMs = session.createdAt.toMillis();
  const written: MessageDoc[] = [];

  turns.forEach((turn, i) => {
    const role = turn.role === "user" ? "user" : "scammer";
    const masked = maskTurnText(turn);
    if (!masked) return;
    // 전사에는 정확한 write 시각이 없으므로 제출 시각 기준으로 턴 간격을 근사한다(리포트 타임라인
    // "N초 시점"용). D1 — 클라가 `answeredAtMs`·`turn.atMs`를 실어 보낸 경우 그 값을 우선한다.
    const doc: MessageDoc = {
      role,
      textMasked: masked,
      turnIndex: nextIndex,
      createdAt: Timestamp.fromMillis(
        resolveTurnCreatedAtMs({
          index: i,
          atMs: typeof turn.atMs === "number" ? turn.atMs : undefined,
          answeredAtMs: typeof answeredAtMs === "number" ? answeredAtMs : undefined,
          sessionCreatedAtMs,
          baseTimeMs: baseTime,
          nowMs: baseTime,
        }),
      ),
      // T30 추가(§13.1) — 교차채널 타임라인(AC-037)용 채널 표기. 실시간 통화 전사는 항상
      // channel="voice" 단계에서 발생한다(에스컬레이션 세션이든 순수 보이스 세션이든 동일).
      channel: "voice",
      // T191 S7(C-8) — 교대 뒤 사기범 줄만. 라벨은 서버가 세션의 leg로 정한다(클라 값 미수신).
      ...(role === "scammer" && input.scammerSpeakerLabel ? { speakerLabel: input.scammerSpeakerLabel } : {}),
    };
    tx.create(input.messagesRef.doc(), doc);
    written.push(doc);
    nextIndex += 1;
  });

  // answeredAt이 없으면(실시간 경로는 sendMessage를 안 타 미설정) 첫 턴 기준으로 채워, 리포트
  // 타임라인 기점과 세션 시간축이 정합하도록 한다.
  if (!session.answeredAt) {
    tx.update(input.sessionRef, { answeredAt: Timestamp.fromMillis(baseTime) });
  }

  return { count: written.length, nextIndex, written };
}
