// 채널 전이 엔진 (T30, Architecture.md §13.0/§13.1, AC-034/035/037/039).
//
// 방향 무관(direction-agnostic) 시그니처로 정의하되, 이 구현체는 MVP 계약대로
// `from==="messenger" && to==="voice"` 한 방향만 실제로 허용한다. 그 외 조합(예: voice→messenger,
// T40 fast-follow)은 조용히 무시하지 않고 `unimplemented`로 명시 거부한다(AC-039 "조용한 실패 금지").
// 세션 문서(sessions/{sessionId})의 `channel`을 갱신하고 `channelHistory`에 이력을 append하는 것만
// 책임진다 — "통화 진입 준비"(§13.1 ③)는 별도 새 로직이 필요 없다: `channel`이 "voice"로 바뀐 뒤
// createRealtimeCall(functions/src/realtime/index.ts)이 세션을 다시 읽어 그 시점의 voiceId/
// voiceSelectionSource로 자격증명을 발급하므로(§13.6), 이 함수는 필드만 정확히 갱신하면 된다.
//
// 호출부: functions/src/roleplay/index.ts(sendMessage — structured_signal/maxturn_fallback),
// functions/src/session/index.ts(requestEscalation — manual_button).
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { ChannelTransitionTrigger, MessengerChannel } from "../shared/types";

export async function transitionChannel(
  sessionId: string,
  from: MessengerChannel,
  to: MessengerChannel,
  trigger: ChannelTransitionTrigger,
): Promise<void> {
  if (!(from === "messenger" && to === "voice")) {
    // voice→messenger 등 역방향은 T40 fast-follow 소관(AC-039) — 지금은 명시적으로 거부한다.
    throw new HttpsError(
      "unimplemented",
      `지원하지 않는 채널 전이입니다: ${from} → ${to} (voice→messenger는 T40 fast-follow 예정)`,
    );
  }

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const entry = { from, to, at: Timestamp.now(), trigger };

  // T31 QA 잔여 관찰 반영(2026-07-24): sendMessage는 이 함수를 부르기 직전에 이미 트랜잭션으로
  // status==="active"를 재확인하지만(finalize.stillActive), 그 확인과 이 update 사이에도 여전히
  // 아주 짧은 틈이 남는다(requestEscalation도 자기 나름의 사전 확인만 하고 부른다) — 그 틈에 다른
  // 요청(endSession)이 먼저 세션을 끝냈다면, 이미 끝난 세션에 channelHistory만 덧붙는 모순이 생길
  // 수 있다. 이 함수 자체를 트랜잭션으로 감싸 마지막 순간에 다시 확인하는 것으로 호출부와 무관하게
  // 이 클래스의 레이스를 원천 차단한다. 이미 종료된 세션이면 무시한다 — endSession의 멱등 처리
  // 주석과 동일한 이유(다른 경로로 이미 정상 종료된 세션의 최종 상태를 덮어쓰지 않는다)로,
  // 이건 "지원하지 않는 방향"(위 unimplemented 거부, AC-039)과는 다른 종류의 케이스다.
  await db.runTransaction(async (tx) => {
    const freshSnap = await tx.get(sessionRef);
    const fresh = freshSnap.data();
    if (fresh?.status !== "active") {
      return;
    }
    // FieldValue.arrayUnion(...)의 반환 타입은 SessionDoc.channelHistory(배열)와 구조적으로 다르므로
    // (Firestore admin SDK sentinel) 이 update 페이로드에는 Partial<SessionDoc>를 강제하지 않는다 —
    // 다른 필드(channel)는 여전히 SessionDoc 타입 그대로다.
    tx.update(sessionRef, {
      channel: to,
      channelHistory: FieldValue.arrayUnion(entry),
    });
  });
}
