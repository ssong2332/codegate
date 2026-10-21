import { httpsCallable } from "firebase/functions";
import { functionsClient } from "@/lib/firebase";
// ⚠️ 배럴(`@/lib/authinvalidation`) 대신 리프 모듈을 직접 가리킨다 — 배럴에는 React 훅이 들어
// 있어, API 계층이 React·next/navigation을 끌어오게 되기 때문이다.
import { isUnauthenticatedCallableError } from "@/lib/authinvalidation/authInvalidation";
import {
  areCallablesBlocked,
  notifyUnauthenticatedCallable,
} from "@/lib/authinvalidation/unauthenticatedSignal";

/**
 * 콜러블 호출 **단일 지점** (T128, Architecture.md §34.3 ③ · G155).
 *
 * 이 파일이 생기기 전에는 `src/lib/api/`의 래퍼 24개가 각자 `httpsCallable`을 직접 불렀다. T128이
 * 인증 무효화 감지를 붙여야 하는데, 그 분기를 24곳에 흩는 것이 **G155가 금지한 것**이라 호출 한 줄을
 * 감싸는 헬퍼로 모았다. **각 래퍼의 시그니처는 하나도 바뀌지 않았고**(교체는 기계적), 이 함수가
 * 하는 일은 원래 4줄(`httpsCallable` → `await` → `data` 반환)에 아래 두 가지를 더한 것뿐이다.
 *
 * 1. **감지(③)** — 실패 코드가 **정확히 `functions/unauthenticated`일 때만** 배너에 알린다(G156).
 *    ⭐ 이 지점이 주 감지 지점인 이유: 토큰이 조용히 죽는 경로(`auth/invalid-refresh-token`)에서는
 *    SDK가 signOut도 하지 않고 어떤 구독도 발화하지 않지만, `@firebase/functions`가 토큰 획득 실패를
 *    삼키고 **무토큰으로 요청을 보내기 때문에**(§34.2 (아)) 서버가 반드시 이 코드로 거절한다.
 *    T128 프로브 P-2가 라이브로 확인했다(refreshToken 훼손 → `functions/unauthenticated`).
 *    ⛔ 에러는 **삼키지 않고 그대로 다시 던진다** — 호출부의 기존 실패 처리를 바꾸지 않는다.
 * 2. **U1 잠금** — 배너가 떠 있는 동안에는 새 콜러블을 시작하지 않는다(§34.4 U1, AC-007 불변식 보호).
 *    이 상태에서 요청을 보내봐야 서버가 어차피 전부 거절하므로 잃는 기능은 없다.
 */
export async function callCallable<Req, Res>(name: string, request: Req): Promise<Res> {
  if (areCallablesBlocked()) {
    throw new AuthInvalidationBlockedError(name);
  }

  const callable = httpsCallable<Req, Res>(functionsClient, name);
  try {
    const { data } = await callable(request);
    return data;
  } catch (err) {
    rethrowAfterSignal(err);
  }
}

/** 감지(③)의 **유일한 발화 지점**(G156) — `callCallable` · `callCallableStream`이 함께 쓴다. 에러는 그대로 다시 던진다. */
function rethrowAfterSignal(err: unknown): never {
  if (isUnauthenticatedCallableError(err)) {
    notifyUnauthenticatedCallable();
  }
  throw err;
}

/**
 * §99(UX D-142) — 스트리밍 콜러블. 서버가 `response.sendChunk`로 보내는 조각을 `onChunk`로 넘기고, 최종 응답을 돌려준다.
 * `callCallable`과 같은 두 가지(U1 잠금 · `functions/unauthenticated` 감지)를 그대로 한다 — 에러는 삼키지 않고 다시 던진다.
 * ⭐ 조각을 보내지 않는 서버(옛 배포)에서도 최종 응답은 똑같이 온다(조각 0개) — 배포 순서와 무관하다.
 * 일반 호출의 기본 제한 시간(70초 — `HttpsCallableOptions.timeout`)을 스트림에도 똑같이 건다(스트림에는 기본 제한이 없다).
 */
export const STREAM_CALLABLE_TIMEOUT_MS = 70_000;

export async function callCallableStream<Req, Res, Chunk>(
  name: string,
  request: Req,
  onChunk: (chunk: Chunk) => void,
): Promise<Res> {
  if (areCallablesBlocked()) {
    throw new AuthInvalidationBlockedError(name);
  }

  const callable = httpsCallable<Req, Res, Chunk>(functionsClient, name);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), STREAM_CALLABLE_TIMEOUT_MS);
  try {
    const { stream, data } = await callable.stream(request, { signal: abort.signal });
    try {
      for await (const chunk of stream) {
        try {
          onChunk(chunk);
        } catch {
          // 화면 표시 오류가 호출 결과를 바꾸지 않는다.
        }
      }
    } catch {
      // 스트림이 끊기면 `data`가 같은 오류로 거절된다 — 실패 처리는 아래 한 곳에서 한다.
    }
    return await data;
  } catch (err) {
    rethrowAfterSignal(err);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * U1 잠금에 막혔을 때 던지는 오류. **조용한 실패 금지** — 호출부가 로그로 구분할 수 있게 별도 타입으로
 * 둔다. 코드 문자열은 서버의 `functions/unauthenticated`와 일부러 다르게 해, 이 오류가 다시 감지
 * 신호로 되먹임되어 루프를 만들지 않게 한다.
 */
export class AuthInvalidationBlockedError extends Error {
  readonly code = "auth-invalidation/blocked";
  constructor(callableName: string) {
    super(`인증이 만료되어 ${callableName} 호출을 시작하지 않았습니다.`);
    this.name = "AuthInvalidationBlockedError";
  }
}
