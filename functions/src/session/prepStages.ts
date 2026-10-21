// §99(UX D-142 · DECISIONS #212) — createSession 준비 단계 신호. 준비 화면(src/components/TrainingPrepScreen.tsx)은
// **서버가 실제로 끝낸 단계만** 체크한다(D-134 "가짜 진행률 금지" 유지). 신호는 스트리밍 콜러블 조각(`response.sendChunk`)이다 —
// Firestore 쓰기 · 세션 문서 필드 · 구독 0. 스트리밍을 받지 않는 호출(옛 클라 · 다른 화면)에는 SDK가 아무것도 보내지 않는다.
//
// ⛔ 조각 전송 실패는 세션 생성을 막지 않는다(P-4 비차단) — 연결이 끊겼으면 응답도 못 받으므로 그대로 진행한다.
// ⛔ 조각에는 단계 이름만 싣는다(시나리오 · 변형 · 수법 정보 0 — 세션 전 화면에 변형 정보 0, X1 · C-4).

/** 서버가 끝내는 순서 그대로. `src/lib/design/e2Prep.ts` PREP_STAGE_ORDER와 같아야 한다(G700). */
export const CREATE_SESSION_PREP_STAGES = ["scenario", "opening", "saved"] as const;
export type CreateSessionPrepStage = (typeof CREATE_SESSION_PREP_STAGES)[number];

export type CreateSessionPrepChunk = { stage: CreateSessionPrepStage };

/** `onCall` 둘째 인자의 필요한 부분만(단위 테스트가 가짜를 넘긴다). */
export type PrepChunkSink = { sendChunk: (chunk: CreateSessionPrepChunk) => Promise<boolean> } | undefined;

export async function emitPrepStage(sink: PrepChunkSink, stage: CreateSessionPrepStage): Promise<void> {
  if (!sink) return;
  try {
    await sink.sendChunk({ stage });
  } catch {
    // 비차단 — 위 머리말.
  }
}
