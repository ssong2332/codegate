// 채널 전이 엔진 (T30, Architecture.md §13.0/§13.1, AC-034/035/037/039).
//
// 방향 무관(direction-agnostic) 시그니처로 정의한다. T30(MVP)은 `messenger→voice`만 허용했고,
// T40(fast-follow)에서 `voice→messenger`(역방향)도 허용하도록 확장했다(AC-039 "설계는 양방향,
// 구현은 순차" — Architecture.md §13.0 확정1). 그 외 조합(동일 채널 등)은 여전히 조용히 무시하지
// 않고 `unimplemented`로 명시 거부한다(AC-039 "조용한 실패 금지") — SUPPORTED_TRANSITIONS 화이트
// 리스트 밖은 전부 방어적으로 거부되므로, MessengerChannel에 세 번째 값이 추가돼도 안전하다.
// 세션 문서(sessions/{sessionId})의 `channel`을 갱신하고 `channelHistory`에 이력을 append하는 것만
// 책임진다 — "통화 진입 준비"(§13.1 ③)는 `to==="voice"`일 때만 필요한데 별도 새 로직이 필요 없다:
// `channel`이 "voice"로 바뀐 뒤 createRealtimeCall(functions/src/realtime/index.ts)이 세션을 다시
// 읽어 그 시점의 voiceId/voiceSelectionSource로 자격증명을 발급하므로(§13.6), 이 함수는 필드만
// 정확히 갱신하면 된다. `to==="messenger"`(T40 역방향)는 §13.1이 이 단계에 별도 준비를 요구하지
// 않는다 — session/messenger/page.tsx는 이미 세션의 `channel` 필드만 보고 렌더링한다.
//
// 호출부: functions/src/roleplay/index.ts(sendMessage — structured_signal/maxturn_fallback,
// messenger→voice 정방향 전용), functions/src/session/index.ts(requestEscalation — manual_button,
// messenger→voice / requestReverseEscalation — manual_button, voice→messenger, T40).
//
// reviewer 리뷰 Major #2 수정(2026-07-24) — `to==="messenger"`로 전이할 때는 그 시점의 turnCount를
// `turnCountAtTransition`으로 함께 기록한다. sendMessage의 max-turn 폴백이 세션 누적 turnCount가
// 아니라 "이번 메신저 재진입 이후 턴 수"를 봐야, T40 역방향 복귀 직후 다음 메시지 한 번에 즉시
// 재-에스컬레이션되는 핑퐁을 피할 수 있다(functions/src/roleplay/index.ts 참고).
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { ChannelTransitionTrigger, MessengerChannel } from "../shared/types";

// 허용 방향 화이트리스트 — analyzeConversation.ts/purge.ts류와 동일한 관례로 순수 판정 함수를
// 분리해 firebase-admin 초기화 없이 단위 테스트할 수 있게 한다(channelTransition.test.ts 참고).
const SUPPORTED_TRANSITIONS: ReadonlyArray<readonly [MessengerChannel, MessengerChannel]> = [
  ["messenger", "voice"], // T30 MVP
  ["voice", "messenger"], // T40 fast-follow
];

export function isSupportedChannelTransition(from: MessengerChannel, to: MessengerChannel): boolean {
  return SUPPORTED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export async function transitionChannel(
  sessionId: string,
  from: MessengerChannel,
  to: MessengerChannel,
  trigger: ChannelTransitionTrigger,
  /** `to==="messenger"`일 때만 의미 있음 — 전이 시점의 세션 turnCount(위 헤더 주석 참고). */
  turnCountAtTransition?: number,
): Promise<void> {
  if (!isSupportedChannelTransition(from, to)) {
    throw new HttpsError("unimplemented", `지원하지 않는 채널 전이입니다: ${from} → ${to}`);
  }

  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const entry = {
    from,
    to,
    at: Timestamp.now(),
    trigger,
    // Firestore admin SDK가 undefined 필드를 기본 거부하므로, 값이 있을 때만 키를 만든다(기존
    // 관례, functions/src/session/index.ts의 옵셔널 스프레드 패턴과 동일).
    ...(turnCountAtTransition !== undefined ? { turnCountAtTransition } : {}),
  };

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
