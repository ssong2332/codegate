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
  // FieldValue.arrayUnion(...)의 반환 타입은 SessionDoc.channelHistory(배열)와 구조적으로 다르므로
  // (Firestore admin SDK sentinel) 이 update 페이로드에는 Partial<SessionDoc>를 강제하지 않는다 —
  // 다른 필드(channel)는 여전히 SessionDoc 타입 그대로다.
  await sessionRef.update({
    channel: to,
    channelHistory: FieldValue.arrayUnion(entry),
  });
}
