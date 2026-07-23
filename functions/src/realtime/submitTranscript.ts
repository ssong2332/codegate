// 실시간 음성 통화 전사 제출 (2026-07-23, finding #1).
//
// 실시간 speech-to-speech(Gemini/ElevenLabs) 대화는 외부 음성 AI 안에서 일어나 `sendMessage`를
// 타지 않으므로, 예전엔 `sessions/{sid}/messages`에 오프닝 1줄만 남고 실제 대화가 기록되지 않았다.
// 그 결과 리포트(analyzeConversation)가 분석할 사용자/사기범 턴이 없어 **무조건 "속지 않음"**으로
// 나왔다(리포트 핵심 기능 무력화, AC-008/009/026).
//
// 이 콜러블은 클라가 통화 중 모아둔 전사 턴을 통화 종료 직전에 한 번에 제출받아, 기존 sendMessage와
// 동일하게 PII 마스킹 후 messages에 append한다. 그러면 endSession → 리포트 생성 경로가 실제 대화를
// 그대로 분석할 수 있다. 클라가 messages를 직접 write하지 못하게 막은 규칙(ADR-0004)을 우회하지
// 않으면서(서버 admin write + 마스킹 강제) 실시간 경로에 리포트를 붙이는 최소 침습 방식이다.
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { maskPII } from "../guardrails";
import type { MessageDoc, SessionDoc } from "../shared/types";

ensureFirebaseAdminApp();

export type TranscriptTurn = { role: "user" | "scammer"; text: string };
export type SubmitRealtimeTranscriptRequest = { sessionId: string; turns: TranscriptTurn[] };
export type SubmitRealtimeTranscriptResponse = { written: number };

/** 한 번에 제출 가능한 턴 수 상한 — 악의적/폭주 입력 방지(정상 통화는 수십 턴 이내). */
const MAX_TURNS = 200;
const MAX_TEXT_LEN = 2000;

export const submitRealtimeTranscript = onCall<
  SubmitRealtimeTranscriptRequest,
  Promise<SubmitRealtimeTranscriptResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId, turns } = request.data ?? {};
  if (!sessionId || !Array.isArray(turns)) {
    throw new HttpsError("invalid-argument", "sessionId와 turns가 필요합니다.");
  }
  if (turns.length === 0) {
    return { written: 0 };
  }
  if (turns.length > MAX_TURNS) {
    throw new HttpsError("invalid-argument", "제출 가능한 턴 수를 초과했습니다.");
  }

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const messagesRef = sessionRef.collection("messages");

  // 소유권 검증 + 기존 메시지 뒤에 이어 붙일 turnIndex 확보를 한 트랜잭션으로 묶는다
  // (sendMessage의 원자적 턴 확보와 동일 원칙). 마스킹 후 write.
  const written = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists) {
      throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
    }
    const session = snap.data() as SessionDoc;
    if (session.uid !== request.auth!.uid) {
      throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
    }

    const historySnap = await tx.get(messagesRef.orderBy("turnIndex", "asc"));
    let nextIndex = historySnap.size;
    const baseTime = Date.now();
    let count = 0;

    turns.forEach((turn, i) => {
      const role = turn.role === "user" ? "user" : "scammer";
      const raw = typeof turn.text === "string" ? turn.text.slice(0, MAX_TEXT_LEN) : "";
      const masked = maskPII(raw).trim();
      if (!masked) return;
      // 전사에는 정확한 write 시각이 없으므로 제출 시각 기준으로 턴 간격을 근사한다(리포트
      // 타임라인 "N초 시점"용 — 실시간 통화는 정밀 턴 타이밍이 없어 근사가 불가피하다).
      tx.create(messagesRef.doc(), {
        role,
        textMasked: masked,
        turnIndex: nextIndex,
        createdAt: Timestamp.fromMillis(baseTime + i * 1000),
      } satisfies MessageDoc);
      nextIndex += 1;
      count += 1;
    });

    // answeredAt이 없으면(실시간 경로는 sendMessage를 안 타 미설정) 첫 턴 기준으로 채워, 리포트
    // 타임라인 기점과 세션 시간축이 정합하도록 한다.
    if (!session.answeredAt) {
      tx.update(sessionRef, { answeredAt: Timestamp.fromMillis(baseTime) });
    }

    return count;
  });

  return { written };
});
