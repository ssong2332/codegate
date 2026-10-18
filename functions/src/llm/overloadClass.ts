// Gemini 과부하(503 UNAVAILABLE) 판정 (2026-10-18, implementer 명세 4 판정표가 정본).
//
// | 오류                                                                         | 재시도 |
// |------------------------------------------------------------------------------|--------|
// | `status === 503` 이거나 메시지 JSON의 `error.status === "UNAVAILABLE"` / `error.code === 503` | 예 |
// | 429·400·401·403·404·500 등 그 밖의 HTTP 오류, `deadline-exceeded`, 빈 응답 에러, `fetch failed` | 아니요 |
//
// 문자열 파싱이 geminiClient.ts:74의 금지(T98 — 모델 산문 매칭)와 충돌하지 않는 이유는
// quotaClass.ts 머리 주석과 같다 — 읽는 것은 SDK가 `JSON.stringify(errorBody)`로 직렬화한
// **구조화 문서의 필드**이지 산문이 아니다. "high demand" 같은 문구는 매칭하지 않는다.
// ⛔ 표 밖 케이스는 전부 "아니요"다(임의 확장 금지).

const OVERLOAD_HTTP_STATUS = 503;
const OVERLOAD_RPC_STATUS = "UNAVAILABLE";

function readStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

function readMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "";
}

function readErrorBody(message: string): { status?: unknown; code?: unknown } | undefined {
  try {
    const parsed: unknown = JSON.parse(message);
    const body = (parsed as { error?: unknown } | null)?.error;
    return typeof body === "object" && body !== null ? (body as { status?: unknown; code?: unknown }) : undefined;
  } catch {
    return undefined; // JSON이 아니면 2·3행 판정 대상이 아니다(1행 status만 본다).
  }
}

/**
 * 판정표 1행이면 true. 그 밖은 전부 false(429·deadline-exceeded·fetch failed 등).
 *
 * 숫자 `status`가 **있으면 그것만으로** 판정한다 — 메시지 JSON은 status가 없는 형태(명세 ⑧)에서만
 * 본다. 그래서 `status: 429`인 에러는 본문이 무엇이든 재시도 대상이 아니다(키 순환 무간섭, 명세 ⛔).
 */
export function isOverloadError(error: unknown): boolean {
  const status = readStatus(error);
  if (status !== undefined) return status === OVERLOAD_HTTP_STATUS;
  const body = readErrorBody(readMessage(error));
  if (!body) return false;
  return body.status === OVERLOAD_RPC_STATUS || body.code === OVERLOAD_HTTP_STATUS;
}
