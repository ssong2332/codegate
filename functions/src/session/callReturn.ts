// §110.4(실기 신고 13) — 통화를 끊고 대화방으로 돌아온 직후 사기범의 복귀 메시지 1건을 저장한다(`requestReverseEscalation` `followUp`).
//
// | # | if | then |
// |---|---|---|
// | 1 | 세션이 active가 아니다 · 채널이 messenger가 아니다(전이 실패) | 저장 0 — `undefined` |
// | 2 | 생성 결과 없음(LLM 실패 · Mock 강등 · 빈 대사) | 저장 0 — `undefined`(`roleplay/callReturnLine.ts` 판정표) |
// | 3 | 생성 중에 참가자 메시지가 먼저 저장됐다(이력 길이가 바뀌었다) | 저장 0 — 그 메시지의 답장은 sendMessage가 한다(같은 turnIndex 경합 0) |
// | 4 | 그 밖 | 사기범 메시지 1건(채널 messenger) 저장 · turnIndex 반환 |
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { generateCallReturnLine } from "../roleplay/callReturnLine";
import type { MessageDoc, SessionDoc } from "../shared/types";

export async function recordCallReturnLine(db: Firestore, sessionId: string): Promise<number | undefined> {
  const sessionRef = db.collection("sessions").doc(sessionId);
  const messagesRef = sessionRef.collection("messages");
  const [sessionSnap, historySnap] = await Promise.all([sessionRef.get(), messagesRef.orderBy("turnIndex", "asc").get()]);
  const session = sessionSnap.data() as SessionDoc | undefined;
  if (!session || session.status !== "active" || session.channel !== "messenger") return undefined;
  const history = historySnap.docs.map((doc) => doc.data() as MessageDoc);
  const { message } = await generateCallReturnLine({ ...session, sessionId }, history);
  if (!message) return undefined;
  return db.runTransaction(async (tx) => {
    const freshSnap = await tx.get(sessionRef);
    const fresh = freshSnap.data() as SessionDoc | undefined;
    if (!fresh || fresh.status !== "active" || fresh.channel !== "messenger") return undefined;
    const freshHistory = await tx.get(messagesRef.orderBy("turnIndex", "asc"));
    if (freshHistory.size !== history.length) return undefined;
    tx.create(messagesRef.doc(), {
      role: "scammer",
      textMasked: message.text,
      turnIndex: history.length,
      createdAt: Timestamp.now(),
      ...(message.attachments ? { attachments: message.attachments } : {}),
      channel: "messenger",
    } satisfies MessageDoc);
    return history.length;
  });
}
