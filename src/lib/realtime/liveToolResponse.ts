// §59.10 커밋 A — Live 도구 응답 매핑(순수 함수). `docs/Architecture.md` §59.4/§59.10 · G383 ·
// G386 · G390.
//
// ⛔ 이 파일이 하지 않는 것: 도구 이름 → `deliverInCallSms`/`deliverVerifyOffer` 라우팅(§59.6 ②~⑥).
// `docs/Architecture.md` §59.10 커밋 A 행이 적은 범위는 "`credentials.liveTools` 부재면 즉시
// `{ status:"unsupported" }` 로 답하고 끝"뿐이고, 실제 라우팅은 도구가 실제로 선언되는 이후 커밋
// (§59 커밋 C+)의 몫이다 — 지금은 서버가 도구를 하나도 선언하지 않아(`geminiProvider.ts`의
// `tools: []`, 이 패스가 0줄 건드리지 않는다) `credentials.liveTools` 자체가 존재할 수 없다.
//
// ⭐ 왜 지금 배선하는가(G383): Live 도구는 기본이 `Behavior.BLOCKING`이다(`@google/genai`
// `genai.d.ts:1206-1209` — "the system will wait to receive the function response before
// continuing"). 응답이 없으면 모델이 그 자리에서 멈춘다 — 회귀가 아니라 통화 정지다. 도구 선언보다
// **먼저** 이 배선이 존재해야, 나중에 도구가 선언되는 순간부터 안전하게 동작한다.
//
// ⭐ 오늘 이 함수의 실제 실행 여부: 도구가 하나도 선언되지 않았으므로 Gemini Live는 `toolCall`
// 메시지 자체를 보내지 않는다 — `GeminiVoiceSession.tsx`의 새 분기는 오늘 **도달 불가**다(회귀 0).

export type LiveToolFunctionCall = { id?: string; name?: string };

export type LiveToolFunctionResponse = {
  id?: string;
  name: string;
  response: { status: "unsupported" };
};

/**
 * 들어온 `functionCalls` 전건을 `{status:"unsupported"}` 응답으로 매핑한다.
 *
 * ⛔ **한국어 문자열 0건(G386)** — 도구가 아직 선언되지 않아 모델에게 돌려줄 콘텐츠 자체가 없다.
 * 실제 성공/거절/실패 3종 문자열은 서버가 소유하며(§59.6), 이 파일은 그 문자열을 저작하지 않는다.
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
