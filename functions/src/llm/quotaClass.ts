// Gemini 429 분류기 (T132, Architecture.md §37.2 — 그 표가 **유일한 정본**이다).
//
// 왜 문자열을 파싱하는가: @google/genai의 ApiError가 보존하는 필드는 `status`와 `message`
// **둘뿐**이고, `message`는 응답 본문 전체를 `JSON.stringify(errorBody)`로 뭉갠 값이다
// (node_modules/@google/genai/dist/node/index.cjs 의 ApiError 생성 지점). `details[]`·
// `quotaId`·`retryDelay`는 그 문자열 **안에만** 있다 ⇒ JSON.parse가 필수다.
//
// ⚠️ geminiClient.ts:74가 "판정을 에러 **메시지 문자열**로 하지 말 것(T98의 실패 사례)"이라고
// 못박는데 이 파일이 그것을 위반하지 않는 이유: T98이 매칭한 것은 **모델이 쓴 산문**
// ("Request contains an invalid argument.")이고, 여기서 파싱하는 것은 **SDK가 JSON.stringify로
// 직렬화한 구조화 문서**다. 문자열은 전송 형식일 뿐이고 판정 대상은 필드다.
//
// ⛔ `retryDelay`를 분류에 쓰지 말 것(G169) — 실측된 **일일** 429 응답에 `retryDelay: 49s`가
// 함께 실려 왔다. 두 종류 모두에 존재하므로 판별력이 0이다. 이 값은 **로그 기록 전용**이다.
// ⛔ 파싱 실패를 조용히 삼키지 말 것(G173) — `unknown`으로 분류하되 그 사실이 로그에 남아야 한다.

/** §37.2의 출력 4값. */
export type QuotaClass = "daily" | "minute" | "unknown" | "not-quota";

export interface QuotaClassification {
  readonly quotaClass: QuotaClass;
  /** 관측된 quotaId 원문(§37.2 3행 — 새 쿼터 축이 생기면 이것만이 조기 경보다). */
  readonly quotaId?: string;
  /** 기록 전용(§37.2 (b)). ⛔ 분류에 쓰지 않는다. */
  readonly retryDelay?: string;
  /** JSON.parse 실패 또는 details[] 부재로 2차 규칙(5·6행)까지 내려왔는가. */
  readonly usedFallbackRule: boolean;
  /** §37.2 6행 — status와 message 앞 200자(삼키지 않는다는 증거). */
  readonly messageHead?: string;
}

const MESSAGE_HEAD_LIMIT = 200;
const QUOTA_FAILURE_TYPE_SUFFIX = "QuotaFailure";
const RETRY_INFO_TYPE_SUFFIX = "RetryInfo";

interface ErrorDetail {
  "@type"?: unknown;
  violations?: unknown;
  retryDelay?: unknown;
}

function readStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

function readMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "";
}

function readDetails(message: string): ErrorDetail[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return undefined; // §37.2 4행 → 2차 규칙. ⛔ 여기서 끝내지 않는다(G173).
  }
  const details = (parsed as { error?: { details?: unknown } } | null)?.error?.details;
  return Array.isArray(details) ? (details as ErrorDetail[]) : undefined;
}

function typeEndsWith(detail: ErrorDetail, suffix: string): boolean {
  const type = detail["@type"];
  return typeof type === "string" && type.endsWith(suffix);
}

function collectQuotaIds(details: ErrorDetail[]): string[] {
  const ids: string[] = [];
  for (const detail of details) {
    if (!typeEndsWith(detail, QUOTA_FAILURE_TYPE_SUFFIX) || !Array.isArray(detail.violations)) continue;
    for (const violation of detail.violations) {
      const quotaId = (violation as { quotaId?: unknown } | null)?.quotaId;
      if (typeof quotaId === "string" && quotaId) ids.push(quotaId);
    }
  }
  return ids;
}

function collectRetryDelay(details: ErrorDetail[]): string | undefined {
  for (const detail of details) {
    if (typeEndsWith(detail, RETRY_INFO_TYPE_SUFFIX) && typeof detail.retryDelay === "string") {
      return detail.retryDelay;
    }
  }
  return undefined;
}

/**
 * §37.2 표대로만 판정한다. ⛔ 표 밖 케이스는 `unknown`이며 임의 확장 금지.
 *
 * `unknown`의 기본 행동이 "키를 바꾸지 않는다"인 이유(§37.2 (a)) — 두 오분류의 대가가
 * 비대칭이기 때문이다. 일일을 `unknown`으로 놓치면 그 턴이 Mock으로 강등될 뿐이라 **오늘의
 * 동작 그대로**(회귀가 아니다)지만, 분당을 `daily`로 오인해 넘기면 **다음 키의 하루치가 실제로
 * 소모된다**(캡이 20뿐이라 직접적 손실).
 */
export function classifyQuotaError(error: unknown): QuotaClassification {
  // 0행 — 429가 아니거나 status 부재. 쿼터와 무관한 실패는 다음 키에서도 똑같이 실패한다.
  if (readStatus(error) !== 429) {
    return { quotaClass: "not-quota", usedFallbackRule: false };
  }

  const message = readMessage(error);
  const details = readDetails(message);
  const quotaIds = details ? collectQuotaIds(details) : [];
  const retryDelay = details ? collectRetryDelay(details) : undefined;

  if (quotaIds.length > 0) {
    // 1행 — PerDay가 먼저다(PerDay와 PerMinute가 함께 오면 일일 소진이 우선).
    const daily = quotaIds.find((id) => id.includes("PerDay"));
    if (daily) return { quotaClass: "daily", quotaId: daily, retryDelay, usedFallbackRule: false };

    // 2행 — ⚠️ `PerMinute`라는 문자열 형태는 실측되지 않은 유추다(§37.2 2행). 이 행이 아무것도
    // 잡지 못하고 3행 `unknown`으로 떨어져도 회귀가 아니다 — 두 행의 **행동이 같기 때문**이다.
    const minute = quotaIds.find((id) => id.includes("PerMinute"));
    if (minute) return { quotaClass: "minute", quotaId: minute, retryDelay, usedFallbackRule: false };

    // 3행 — 새 쿼터 축이 생긴 것이다. 조용히 추측하지 않고 원문을 남긴다.
    return { quotaClass: "unknown", quotaId: quotaIds[0], retryDelay, usedFallbackRule: false };
  }

  // 4행 — 파싱 실패 또는 details[] 부재 ⇒ 2차 규칙.
  // 5행 — 파싱이 깨져도 일일 소진을 놓치지 않기 위한 안전망(1차 규칙의 *대체*가 아니라 *하위*).
  if (message.includes("PerDay")) {
    return { quotaClass: "daily", retryDelay, usedFallbackRule: true };
  }

  // 6행 — 그것도 없으면 `unknown`. ⛔ 삼키지 않는다(G173): status와 message 앞 200자를 남긴다.
  return {
    quotaClass: "unknown",
    retryDelay,
    usedFallbackRule: true,
    messageHead: message.slice(0, MESSAGE_HEAD_LIMIT),
  };
}
