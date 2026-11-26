// §143 D5 — 복제 목소리 연결 실패 판별. 서버 문구(`functions/src/realtime/index.ts` CLONE_CALL_FAILED_MESSAGE)와 같아야 한다(cloneTts.test.ts가 대조).
export const CLONE_CALL_FAILED_MESSAGE = "복제 목소리 연결에 실패했습니다. 통화를 끝내고 잠시 뒤 다시 시도해 주세요.";

export function isCloneCallFailedError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return Boolean(e && typeof e.message === "string" && e.message.includes(CLONE_CALL_FAILED_MESSAGE) && String(e.code ?? "").includes("failed-precondition"));
}
