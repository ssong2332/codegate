// 실기 신고 4(2026-10-21) — 카톡형 대화방 프로필 시트의 "보이스톡"을 통화로 이어지지 않는 세션에서도 보인다.
// 그런 세션에서 누르면 실제 지인 사칭범처럼 **전화를 받지 않고** 채팅으로 돌린다: 클라가 신호음 → "응답 없음"을 보여 주고,
// 서버(`requestEscalation`의 `via: "voice_talk"` 분기)가 사기범 메시지 1건을 대화에 남긴다.
//
// | # | if | then |
// |---|---|---|
// | 1 | 세션이 통화로 이어진다(`resolveSessionEscalation` 참) | 이 모듈을 쓰지 않는다 — 종전 통화 전이 |
// | 2 | 통화로 이어지지 않는 **카톡형** 세션 · `via: "voice_talk"` | 응답 없음 메시지 1건 + 세션 `voiceTalkUnansweredCount` +1 |
// | 3 | 문자형 · `via` 없음 | 종전대로 거부(`failed-precondition` — AC-039 조용한 실패 금지) |
// | 4 | 마지막 메시지가 참가자 메시지(답장 생성 중) | 거부 — 답장과 같은 turnIndex를 쓰지 않게 한다 |
//
// ⛔ LLM 호출 0(고정 문면) — 다음 턴부터 모델은 이 메시지를 대화 이력으로 본다(페르소나가 같은 핑계 반복을 막는다).
// ⛔ 리포트 판정에는 아직 쓰지 않는다 — 카운터는 기록만 한다(리포트 반영은 별도 결정).
import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { MessageDoc, SessionDoc } from "../shared/types";

/** 반말 지인 말투(카톡형 비전이 시나리오 = 지인 사칭 1종). 시도 횟수 순서로 돌려 쓴다(같은 문장 연속 0). */
export const VOICE_TALK_UNANSWERED_REPLIES = [
  "아 미안 지금 통화는 못 받아ㅠ 톡으로 하자",
  "지금 전화 받기 곤란한 데라 그래ㅠ 톡으로 얘기해 줘",
  "통화는 진짜 안 되는 상황이야… 톡으로 부탁할게",
] as const;

export function pickVoiceTalkUnansweredReply(previousCount: number): string {
  const n = Number.isInteger(previousCount) && previousCount > 0 ? previousCount : 0;
  return VOICE_TALK_UNANSWERED_REPLIES[n % VOICE_TALK_UNANSWERED_REPLIES.length];
}

/**
 * 응답 없음 기록(트랜잭션 — sendMessage 턴 확보와 같은 방식으로 turnIndex를 정한다). 쓴 메시지의 turnIndex를 돌려준다 —
 * 클라는 다음 전송의 답장 기준점을 이 값 이상으로 잡아, 구독이 늦게 와도 이 메시지를 답장으로 오인하지 않는다.
 */
export async function recordVoiceTalkUnanswered(db: Firestore, sessionId: string): Promise<number> {
  const sessionRef = db.collection("sessions").doc(sessionId);
  const messagesRef = sessionRef.collection("messages");
  return db.runTransaction(async (tx) => {
    const freshSnap = await tx.get(sessionRef);
    const fresh = freshSnap.data() as SessionDoc | undefined;
    if (!fresh || fresh.status !== "active") {
      throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
    }
    const historySnap = await tx.get(messagesRef.orderBy("turnIndex", "asc"));
    const history = historySnap.docs.map((doc) => doc.data() as MessageDoc);
    if (history.length > 0 && history[history.length - 1].role === "user") {
      throw new HttpsError("failed-precondition", "답장을 기다리는 중에는 보이스톡을 걸 수 없습니다.");
    }
    const previous = fresh.voiceTalkUnansweredCount ?? 0;
    const text = pickVoiceTalkUnansweredReply(previous);
    tx.create(messagesRef.doc(), {
      role: "scammer",
      textMasked: text,
      turnIndex: history.length,
      createdAt: Timestamp.now(),
      ...(fresh.channel ? { channel: fresh.channel } : {}),
    } satisfies MessageDoc);
    tx.update(sessionRef, { voiceTalkUnansweredCount: previous + 1 });
    return history.length;
  });
}
