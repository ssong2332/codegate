// §110.4(실기 신고 13) — 통화를 끊고 대화방으로 돌아온 직후 사기범의 복귀 메시지 1건을 저장한다(`requestReverseEscalation` `followUp`).
//
// | # | if | then |
// |---|---|---|
// | 1 | 세션이 active가 아니다 · 채널이 messenger가 아니다(전이 실패) | 저장 0 — `undefined` |
// | 2 | 생성 결과 없음(LLM 실패 · Mock 강등 · 빈 대사) | 저장 0 — `undefined`(`roleplay/callReturnLine.ts` 판정표) |
// | 3 | 생성 중에 참가자 메시지가 먼저 저장됐다(이력 길이가 바뀌었다) | 저장 0 — 그 메시지의 답장은 sendMessage가 한다(같은 turnIndex 경합 0) |
// | 4 | 그 밖 | 사기범 메시지 1건(채널 messenger) 저장 · turnIndex 반환 |
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { generateCallReturnLine, type CallReturnBy } from "../roleplay/callReturnLine";
import type { MessageDoc, ScammerHangupMarker, SessionDoc } from "../shared/types";

/**
 * §112(사용자 결정 2026-10-23 *"ai가 먼저 끊는 경우도 메신저로 넘어가도록"*) — 메신저에서 넘어온 통화가 끝나 대화방으로 돌아갈 때 무엇을 하는가.
 * 입력 = 세션의 사기범 끊기 표식(`scammerHangup` — 통화 중 끊기 승인 때 서버가 남긴다 · 실시간 `requestScammerHangup` · 폴백 `sendMessage`).
 *
 * | 표식 | 뜻 | 대화방에서 |
 * |---|---|---|
 * | 없음 | 참가자가 끊었다 · 거절했다(§110.4) | 사기범이 통화 내용을 반영해 먼저 메시지 1건(`follow_up_user`) |
 * | `kind: "goal"` | 사기범이 원하던 것을 얻고 끊었다(송금 · 정보 확보) — 더 진행할 것이 없다 | **"상대방이 채팅방을 나갔습니다"** — 세션 종료(`scammer_ended` · 표식 유지 · 리포트 트리거). 복귀 메시지 0 |
 * | `kind: "give_up"` | 거절 · 의심이 되풀이돼 통화로는 더 진행할 수 없어 끊었다 | 통화가 막힌 것을 톡으로 한 번 더 붙잡는 메시지 1건(`follow_up_scammer`) · 표식은 지운다 — 다음 종료는 메신저 단계 판정(§104.9)이 맡는다 |
 * | `kind: "unspecified"` | 이유 미기재(모델 인자 누락) | `give_up`과 같다(끝낼 근거가 없다 — 이어간다) |
 * ⚠️ give_up을 바로 끝내지 않는 이유: 메신저발 통화는 채널을 바꿔 다시 붙잡는 것이 실제 수법이다(신고 원문 예 *"전화 끊겨서 톡으로 할게"*).
 *    채팅에서도 거절이 이어지면 §104.9 판정표가 메신저 단계 하한 · 거절 횟수로 끝낸다(그때 "나갔습니다").
 * ⚠️ give_up 표식을 지우는 이유: 남아 있으면 끊기 판정 9행(`already_accepted`)이 메신저 단계 종료를 영원히 막는다.
 */
export type CallReturnAction = "follow_up_user" | "follow_up_scammer" | "scammer_left";

export function decideCallReturn(hangup: Pick<ScammerHangupMarker, "kind"> | undefined): CallReturnAction {
  if (!hangup) return "follow_up_user";
  return hangup.kind === "goal" ? "scammer_left" : "follow_up_scammer";
}

export async function recordCallReturnLine(db: Firestore, sessionId: string, by: CallReturnBy = "user"): Promise<number | undefined> {
  const sessionRef = db.collection("sessions").doc(sessionId);
  const messagesRef = sessionRef.collection("messages");
  const [sessionSnap, historySnap] = await Promise.all([sessionRef.get(), messagesRef.orderBy("turnIndex", "asc").get()]);
  const session = sessionSnap.data() as SessionDoc | undefined;
  if (!session || session.status !== "active" || session.channel !== "messenger") return undefined;
  const history = historySnap.docs.map((doc) => doc.data() as MessageDoc);
  const { message } = await generateCallReturnLine({ ...session, sessionId }, history, by);
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

/**
 * §112 — 판정표 `scammer_left` · `follow_up_scammer`의 세션 쓰기(트랜잭션 · 이미 끝난 세션은 건드리지 않는다).
 * - `scammer_left`: status ended · endReason `scammer_ended`(표식 유지 — `resolveRecordedEndReason`의 서버측 근거) · endedAt. 끝냈으면 `true`.
 * - `follow_up_scammer`: 표식만 지운다(메신저 단계 끊기 판정 9행 `already_accepted` 방지). `false`.
 */
export async function applyCallReturnSessionUpdate(
  db: Firestore,
  sessionId: string,
  action: Exclude<CallReturnAction, "follow_up_user">,
): Promise<boolean> {
  const sessionRef = db.collection("sessions").doc(sessionId);
  return db.runTransaction(async (tx) => {
    const fresh = (await tx.get(sessionRef)).data() as SessionDoc | undefined;
    if (!fresh || fresh.status !== "active") return false;
    if (action === "scammer_left") {
      tx.update(sessionRef, { status: "ended", endReason: "scammer_ended", endedAt: Timestamp.now() });
      return true;
    }
    tx.update(sessionRef, { scammerHangup: FieldValue.delete() });
    return false;
  });
}
