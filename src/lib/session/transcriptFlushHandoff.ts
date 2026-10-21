// 2026-10-21(실기 신고 "통화 종료 버튼 반응이 느리다") — 통화 화면 → 종료 화면 전사 제출 인계.
//
// 예전 순서: 종료 탭 → 정지 → `await flushTranscript()`(전사 제출 콜러블 왕복) → 이동. 왕복 동안 화면이 그대로라
// 버튼이 먹지 않은 것처럼 보였다. 이제 통화 화면은 제출을 **시작만** 하고 곧바로 이동하며, 종료 화면이 `endSession`
// 전에 이 약속을 기다린다 — "리포트는 실제 대화를 분석한다"(§79.9 E5 — 제출이 `endSession`보다 먼저)는 그대로다.
//
// ⛔ 순수 모듈 — React · Firebase · 브라우저 API import 0(루트 테스트 러너에서 그대로 돈다).
// ⛔ 같은 탭 SPA 이동 안에서만 유효하다(모듈 상태). 새로고침 · 새 탭으로 종료 화면에 오면 기다릴 것이 없다 — 그때
//    제출은 이미 떠난 페이지와 함께 끝났거나 사라졌다(예전 순서에서도 같은 경우 제출은 보장되지 않았다).

/**
 * 종료 화면이 제출을 기다리는 상한. `httpsCallable` 기본 타임아웃(70초)과 같은 값 — 제출 약속은 그 안에 반드시
 * 끝나므로 이 상한은 "약속이 영영 안 끝나는" 비정상만 끊는다(예전 순서에서는 그 경우 통화 화면에 갇혔다).
 */
export const TRANSCRIPT_FLUSH_WAIT_CAP_MS = 70_000;

let pending: { sessionId: string; done: Promise<void> } | null = null;

/** 통화 화면 — 시작한 제출을 넘긴다(같은 세션의 이전 인계는 덮어쓴다). 제출 실패는 삼킨다(종료는 항상 성공 — AC-006). */
export function handOffTranscriptFlush(sessionId: string, flush: Promise<unknown>): void {
  const entry = { sessionId, done: flush.then(() => undefined, () => undefined) };
  pending = entry;
  void entry.done.then(() => {
    if (pending === entry) pending = null;
  });
}

/** 종료 화면 — 같은 세션의 진행 중인 제출이 끝날 때까지(상한 `capMs`) 기다린다. 없으면 즉시. 절대 던지지 않는다. */
export function awaitTranscriptFlush(sessionId: string, capMs: number = TRANSCRIPT_FLUSH_WAIT_CAP_MS): Promise<void> {
  const entry = pending;
  if (!entry || entry.sessionId !== sessionId) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, capMs);
    void entry.done.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** 테스트 전용 — 모듈 상태 초기화. */
export function resetTranscriptFlushHandoffForTest(): void {
  pending = null;
}
