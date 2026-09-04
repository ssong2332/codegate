// D2/F1(docs/Architecture.md §54.2 (1)·(2) · §54.9 (4) 1·2, G342) — **폴백으로 내려갈 때 자격증명을
// 버리지 않는다.**
//
// 무엇이 결함이었나: `useRealtimeCall.start()`의 `setCredentials`는 **성공 경로에만** 있었다. 그래서
// 폴백 입구 E1(마이크 권한 거부)·E2(마이크 API 미지원)·E3(isMock·자격증명 미가용)로 내려간 세션은
// `realtime.credentials`가 **영원히 null**이었고, 확인 시도 무력화(AC-071)의 게이트 입력인
// `credentials.verifyOffer`가 `undefined`라 `shouldOfferVerify`가 **사기범 턴 수를 보지도 않고**
// false를 냈다(`verifyintercept/verifyIntercept.ts` — trigger 부재는 99턴에서도 false, G341).
// ⇒ 라이브에서 관측된 *"6턴 내내 확인 데스크 전환 0회"* 는 턴 부족이 아니라 **구조적 부재**였다.
// ⚠️ 서버는 이미 폴백을 위해 그 값을 내려보내고 있었다 — `TURN_INSTRUCTION_CAPABLE_PROVIDERS`에
// `"none"`(텍스트 폴백)이 명시돼 있고 `withVerifyOffer`가 그 경로에도 필드를 붙인다. 버리는 쪽이
// 클라였다(§54.0 3).
//
// ⛔ **그런데 발급 응답을 *그대로* 보관하면 안 된다.** 통화 화면은 `credentials.provider` 값만 보고
// 실시간 세션 컴포넌트를 마운트한다(`session/play/page.tsx` — `provider === "elevenlabs"` →
// RealtimeVoiceSession, `=== "gemini"` → GeminiVoiceSession). E1·E2는 **마이크가 없거나 거부된**
// 상태이므로 실 자격증명(gemini/elevenlabs)을 그대로 담으면 **마이크 없이 Live 세션이 마운트된다**
// — §54는 이 부작용을 E3(응답의 provider가 항상 "none")에 대해서만 검토했다(§54.14 6이 남긴
// 실측 숙제). 그래서 보관 전에 **서버 자신의 폴백 계약과 같은 모양**으로 낮춘다:
// `createRealtimeCall`의 발급 실패 분기가 돌려주는 값이 정확히 `provider:"none"` + 빈 자격증명 +
// `difficultyApplied:true`이며(`functions/src/realtime/index.ts`), 그 이유("이 폴백은 클라를 텍스트
// 경로로 보내고, 그 경로는 매 턴 서버가 프롬프트를 조립하므로 난이도가 정상 반영된다")가 여기에
// 그대로 적용된다.
//
// ⭐ 낮춰도 **트리거는 남는다** — `verifyOffer`·`inCallSmsTriggers`·`isMock`은 손대지 않는다.
// 그것이 이 함수의 목적 전부다.
import type { CreateRealtimeCallResponse } from "../api/types";

/**
 * 실시간이 불가능하다고 판정된 뒤 **폴백에서 계속 쓸 값만 남겨** 보관용으로 낮춘다.
 *
 * - `provider`/`signedUrl`/`geminiToken`/`geminiModel`: 실시간 세션을 마운트하지 못하도록 비운다.
 * - `difficultyApplied`: 텍스트 폴백은 서버가 매 턴 난이도를 반영하므로 true다(서버 폴백 계약 동일).
 * - 그 밖의 필드(`verifyOffer`·`inCallSmsTriggers`·`isMock`·`voiceId`·`language`)는 **무변경**.
 *
 * ⭐ 이미 `provider:"none"`인 응답(E3 = isMock/미가용 경로)에는 **아무 효과가 없다** — 그 경우
 * 반환값은 입력과 동등하며, 그래서 §54.9 (4) 1이 지정한 *"E3에서 `issued`를 그대로 보관"* 과
 * 결과가 같다(아래 테스트가 이 동등성을 단언한다).
 */
export function toFallbackCredentials(
  issued: CreateRealtimeCallResponse,
): CreateRealtimeCallResponse {
  return {
    ...issued,
    provider: "none",
    signedUrl: "",
    geminiToken: "",
    geminiModel: "",
    difficultyApplied: true,
  };
}
