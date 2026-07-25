// 반이중(half-duplex) 게이트의 "언제 마이크를 다시 열 것인가" 판단 — 순수 함수.
//
// **왜 별도 파일인가**: GeminiVoiceSession.tsx의 이 로직은 AudioContext·setTimeout·WebSocket에
// 얽혀 있어 그대로는 단위 테스트가 안 된다. userSpeechLevel.ts와 같은 관례로 **판단만** 떼어내
// 테스트로 고정한다 — 아래 두 회귀는 실제로 두 번 발생했고, 두 번 다 "코드는 그럴듯한데 실제
// 대화가 끊긴다"는 사용자 신고로만 발견됐다. 그래서 근거를 테스트에 박아 둔다.
//
// ## 고정하는 회귀 2건 (2026-07-25 사용자 신고 "말을 하다가 마는 현상")
//
// **(1) 문장 중간 생성 정지에 마이크가 열리는 문제** — 모델은 문장 중간에 잠깐 생성을 멈출 수 있다
// (한국어에서 "혹시…", "저희가…" 같은 연결어 뒤가 특히 그렇다). 이때 예약된 오디오가 다 소모되는데,
// 예전 코드는 **재생이 비면 곧바로**(잔여 재생 + 250ms) 게이트를 열었다. 그 순간 방 소음·숨소리가
// 마이크로 들어가 Gemini VAD에 사용자 발화로 잡히고 → `interrupted` → 모델이 **생성 자체를 중단**해
// 말이 문장 중간에서 잘렸다. 전사(transcript)까지 같이 잘린 것이 "오디오만 끊긴 게 아니라 모델이
// 멈췄다"는 증거였다.
//   → 턴이 아직 진행 중이면(turnComplete 미수신) **stallGraceMs**만큼 넉넉히 기다린다.
//
// **(2) turnComplete에 꼬리 재생이 남았는데 마이크가 열리는 문제** — Gemini는 오디오를 실시간보다
// 빠르게 보내므로 `turnComplete`(생성 완료) 시점에도 **아직 재생되지 않은 오디오가 수 초 남아 있을
// 수 있다.** 예전 코드는 turnComplete에서 게이트를 즉시 열어, 스피커로 나가던 꼬리 소리가 마이크로
// 되돌아가 다음 턴을 오염시켰다.
//   → turnComplete 뒤에도 **잔여 재생이 끝날 때까지** 기다린 뒤 tailGraceMs를 더해 연다.
//
// ⚠️ **왜 "턴이 끝날 때까지 무조건 닫아 두기"가 아닌가**: 서버가 turnComplete를 끝내 보내지 않으면
// 마이크가 영원히 닫혀 사용자가 말을 못 하게 된다 — 원래 증상보다 나쁜 고장이다. 그래서 진행 중
// 턴에도 **반드시 상한(stallGraceMs)을 둔다.** 이건 정상 경로가 아니라 정지(stall) 대비 안전장치다.
//
// ⚠️ 이 게이트는 **사용자의 끼어들기(barge-in)를 막는다.** 그건 이 설계의 의도다(반이중) — 스피커
// 에코가 VAD를 오작동시키는 문제가 헤드셋 없이는 해결되지 않기 때문이다. 이 파일의 변경으로
// 끼어들기 가능 여부가 바뀌지는 않는다(원래도 agentSpeaking 동안 마이크를 막고 있었다).

/** 잔여 재생이 끝난 뒤 마이크를 열기까지의 여유 — 스피커 꼬리 소리가 빠져나갈 시간. */
export const TAIL_GRACE_MS = 250;

/**
 * 턴이 아직 진행 중일 때(turnComplete 미수신) 재생이 비어도 기다려 주는 시간.
 *
 * 모델의 문장 중간 생성 정지를 넘길 만큼 길어야 하고(회귀 1), 서버가 turnComplete를 영영 안 보낼 때
 * 사용자가 갇히지 않을 만큼 짧아야 한다. 4초는 그 사이의 실용값이다 — **측정으로 최적화한 값이
 * 아니라 판단으로 고른 값이며**, 조정하려면 이 상수만 바꾸면 된다(테스트는 상수를 주입받는다).
 */
export const STALL_GRACE_MS = 4000;

export type GateCloseInput = {
  /** 예약된 오디오가 전부 재생되기까지 남은 시간(ms). 재생이 비어 있으면 0. */
  remainingPlaybackMs: number;
  /** 이 턴의 turnComplete를 아직 못 받았으면 true. */
  turnInProgress: boolean;
  tailGraceMs?: number;
  stallGraceMs?: number;
};

/**
 * 마이크를 다시 열기까지 기다릴 시간(ms)을 계산한다.
 *
 * - 턴 진행 중: 잔여 재생 + stallGrace — 문장 중간 정지를 넘긴다.
 * - 턴 종료(turnComplete 수신): 잔여 재생 + tailGrace — 꼬리 재생이 끝난 뒤에 연다.
 */
export function computeGateCloseDelayMs({
  remainingPlaybackMs,
  turnInProgress,
  tailGraceMs = TAIL_GRACE_MS,
  stallGraceMs = STALL_GRACE_MS,
}: GateCloseInput): number {
  const remaining = Math.max(0, remainingPlaybackMs);
  return remaining + (turnInProgress ? stallGraceMs : tailGraceMs);
}
