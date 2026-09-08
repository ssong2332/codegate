// §59.10 커밋 A — Live 도구 응답 매핑(순수 함수). `docs/Architecture.md` §59.4/§59.10 · G383 ·
// G386 · G390.
//
// ⭐ reviewer Critical #1 수정(§59 커밋 C 리뷰 REJECT 대응) — 이 파일은 이제 §59.6 ②~⑥이 설계한
// 실제 라우팅의 **판정 부분**(어느 콜러블인가 · 어느 smsId를 고를 것인가)도 진다. `deliverInCallSms`/
// `deliverVerifyOffer`를 **호출하는 것**(비동기·부수효과)은 여전히 이 파일의 일이 아니다 — 그건
// `GeminiVoiceSession.tsx`의 `onmessage` 안에서만 할 수 있다(소켓·세션 상태를 쥔 유일한 곳,
// §59.4). 이 파일은 그 호출에 **무엇을 넘길지**와 **응답을 어떻게 되돌릴지**만 순수 함수로 결정해
// 테스트 가능하게 분리한다.
//
// ⭐ 왜 처음에 이렇게 배선했는가(G383, 커밋 A 그대로 유지): Live 도구는 기본이 `Behavior.BLOCKING`
// 이다(`@google/genai` `genai.d.ts:1206-1209` — "the system will wait to receive the function
// response before continuing"). 응답이 없으면 모델이 그 자리에서 멈춘다 — 회귀가 아니라 통화
// 정지다. 도구 선언보다 **먼저** 이 배선이 존재해야, 나중에 도구가 선언되는 순간부터 안전하게
// 동작한다.
//
// ⭐ 오늘(§59 커밋 C 이후, §61 확대 반영) 이 파일의 실제 실행 여부: 도구가 실제로 선언되는
// 시나리오(SMS 카탈로그 보유 시나리오 대부분 · 확인 무력화 카탈로그 보유 6종의 advanced)에서는
// 이제 **도달 가능**하다 — `GeminiVoiceSession.tsx:409-414`의 옛 "오늘 도달 불가" 주석은 이 커밋으로
// **더 이상 참이 아니다**(그 파일의 갱신된 주석 참고).

// ⚠️ 타입만 상대 경로로 가져온다(`@/` 별칭 아님) — `import type`은 strip 단계에서 통째로
// 지워지므로 값 자체는 필요 없지만, 이 파일이 `node --experimental-strip-types`로 직접 실행되는
// 단위 테스트(`liveToolResponse.test.ts`)의 의존 대상이라 값 import에 tsconfig의 `@/*` 매핑을 쓸
// 수 없다(webpack 전용 별칭 — 메모리 관례). 아래 `pickModelToolSmsId`는 `@/lib/incallsms`의
// `pickDueInCallSms`를 재사용하지 않고 **직접 구현**한다 — 그 함수를 값으로 import하면 프로덕션
// 파일 간에는 전례 없는 `.ts` 확장자 상대 import가 필요해지고(디렉터리 import는 Node ESM에서
// `ERR_UNSUPPORTED_DIR_IMPORT`), 로직 자체도 4줄 남짓이라 분리 비용이 재사용 이득보다 크다.
import type { InCallSmsTrigger, LiveTools } from "../api/types";

export type LiveToolFunctionCall = { id?: string; name?: string };

export type LiveToolFunctionResponse = {
  id?: string;
  name: string;
  response: { status: string; guidance?: string };
};

/**
 * 들어온 `functionCalls` 전건을 `{status:"unsupported"}` 응답으로 매핑한다.
 *
 * ⛔ **한국어 문자열 0건(G386)** — 이름이 `credentials.liveTools`의 어느 값과도 일치하지 않는
 * 호출(도구 미선언 세션 · 알 수 없는 이름)에는 돌려줄 서버 콘텐츠 자체가 없다. 실제 성공/거절/실패
 * 3종 문자열은 서버가 소유하며(§59.6), 이 함수는 그 문자열을 저작하지 않는다.
 *
 * ⚠️ `name` 부재도 `"unknown"`으로 떨어뜨려 **응답을 절대 생략하지 않는다**(G390 — `sendToolResponse`는
 * 어떤 경로에서도 생략하지 않는다. 응답이 없으면 `BLOCKING` 도구가 통화를 멈춘다).
 */
export function buildUnsupportedToolResponses(
  functionCalls: LiveToolFunctionCall[] | undefined,
): LiveToolFunctionResponse[] {
  if (!functionCalls || functionCalls.length === 0) return [];
  return functionCalls.map((call) => ({
    id: call.id,
    name: call.name ?? "unknown",
    response: { status: "unsupported" },
  }));
}

/**
 * §59 reviewer APPROVED Major #1 — `dispatch`(=`GeminiVoiceSession.tsx`의 `dispatchToolCall`)가
 * 오늘 모든 분기에서 값을 반환하는 것은 우연이지 구조적 보장이 아니었다. 이 함수가 그 구조적
 * 보장이다: `dispatch`가(또는 `Promise.all` 자체가) 어떤 이유로든 reject해도 **절대 throw하지
 * 않고** `buildUnsupportedToolResponses(calls)` 폴백을 돌려준다 — 호출부(`sendToolResponse`)가
 * 반드시 도달할 수 있게 한다(G390). `dispatch` 내부의 개별 try/catch(콜러블별 실패 처리)와
 * 겹치는 **바깥쪽** 이중 방어다 — 하나가 언젠가 빠지거나 새 분기가 추가돼도 이 함수가 남는다.
 */
export async function collectToolResponses(
  calls: LiveToolFunctionCall[],
  dispatch: (call: LiveToolFunctionCall) => Promise<LiveToolFunctionResponse>,
): Promise<LiveToolFunctionResponse[]> {
  try {
    return await Promise.all(calls.map((call) => dispatch(call)));
  } catch {
    return buildUnsupportedToolResponses(calls);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// §59.6 ②~⑥ — 실제 라우팅(판정만, 부수효과 0)

export type ResolvedToolCallKind = "send_prepared_sms" | "offer_verification_desk" | "unsupported";

/**
 * §59.6 ②(G385) — `toolCall`이 부른 함수 이름을 **하드코딩된 문자열이 아니라
 * `credentials.liveTools`가 내려준 실제 값**과 비교해 어느 콜러블로 라우팅할지 정한다. 서버가
 * 그 세션에 실제로 선언한 이름만 여기 실리므로(§59.5/§59.6, `liveTools.ts`와 1:1), 값이 없거나
 * 일치하지 않으면(도구 미선언·오타·미래 확장) **항상 안전하게 `"unsupported"`로 떨어진다.**
 */
export function resolveToolCallKind(
  name: string | undefined,
  liveTools: LiveTools | undefined,
): ResolvedToolCallKind {
  if (!liveTools || !name) return "unsupported";
  if (name === liveTools.sendPreparedSms) return "send_prepared_sms";
  if (name === liveTools.offerVerificationDesk) return "offer_verification_desk";
  return "unsupported";
}

/**
 * §59.6 ③ — "다음 미도착 항목"을 고른다. 모델이 이르게 부를 수도 있으므로(§59.6 `status` 표의
 * `too_early`) **턴 게이트(`afterScammerTurns`)로 후보를 좁히지 않는다** — 그 재검증은 서버
 * (`deliverInCallSms`의 `trigger:"model_tool"` 경로, §59.7)가 진다. 클라의 일은 오직 "아직 안
 * 보낸 것 중 카탈로그 순서상 가장 이른 것"을 고르는 것뿐이다.
 *
 * ⚠️ **미도착 항목이 0건(전부 이미 도착)이면 `null`이 아니라 카탈로그에서 가장 이른 항목의
 * smsId를 돌려준다(구현 판단 — architect 원문에 이 경우의 명문 처리가 없다).** 서버는 그 smsId가
 * 이미 도착했음을 재확인해 `status:"already_delivered"`로 응답하고(§59.6 status 표, 멱등), 그
 * 텍스트는 표가 `"none_pending"`과 **동일하게** 규정한 declineInstruction이다. 이렇게 하면
 * 클라가 "미도착 0건" 전용 문자열을 새로 저작하지 않고도(G386 — 모델 대면 한국어는 서버 소유)
 * 표가 요구하는 문면을 그대로 낼 수 있다. `triggers`가 완전히 비어 있을 때만(도구가 선언됐는데
 * 카탈로그가 빈 경우 — 선언 조건상 오늘 도달 불가) `null`을 돌려주고, 호출부는 이를 unsupported로
 * 안전하게 처리한다.
 */
export function pickModelToolSmsId(
  triggers: readonly InCallSmsTrigger[],
  deliveredSmsIds: readonly string[],
): string | null {
  if (triggers.length === 0) return null;
  const delivered = new Set(deliveredSmsIds);
  const sorted = [...triggers].sort((a, b) => a.afterScammerTurns - b.afterScammerTurns);
  const nextUndelivered = sorted.find((t) => !delivered.has(t.smsId));
  return (nextUndelivered ?? sorted[0]).smsId;
}

/**
 * §59.6 갱신 2(G394) — `offer_verification_desk` 클레임 실패(백스톱 경로가 같은 announce를 요청
 * 중) 조기 응답 조립. 서버를 부르지 않으므로(왕복 계약 ⑥-예외) `guidance`를 이 함수가 직접
 * 채운다 — 상태값만 돌려주면 `BLOCKING` 도구가 억제 근거 없이 모델 턴을 재개시킨다.
 *
 * ⛔ **`liveTools.failureInstruction`을 재사용하지 않는다** — 그 문면은 "지금은 문자를 보낼 수
 * 없다"는 문자 경로 전용이라 verify 상태에서 거짓이다(§59.6 갱신 2 후보 C 기각).
 * ⛔ **한국어 리터럴을 여기서 저작하지 않는다(G386)** — 값은 `liveTools.verifyAlreadyAnnouncedInstruction`
 * (서버 `VERIFY_DECLINE_ALREADY`의 사본)을 그대로 옮길 뿐이다.
 *
 * 필드가 없으면(구조적으로 도달 불가 — `offerVerificationDesk`와 같은 술어로 함께 붙으므로 정상
 * 서버 응답에서는 항상 존재한다) 방어적으로 `buildUnsupportedToolResponses([call])[0]`로 떨어진다.
 */
export function buildAlreadyAnnouncedToolResponse(
  call: LiveToolFunctionCall,
  liveTools: LiveTools | undefined,
): LiveToolFunctionResponse {
  const guidance = liveTools?.verifyAlreadyAnnouncedInstruction;
  if (guidance === undefined) return buildUnsupportedToolResponses([call])[0];
  return {
    id: call.id,
    name: call.name ?? "unknown",
    response: { status: "already_announced", guidance },
  };
}
