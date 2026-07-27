// Gemini 텍스트 LLM 구현체 (DECISIONS #11 "Claude|Gemini 교체 가능 어댑터" 실현, 2026-07-24).
//
// realtime/geminiProvider.ts(실시간 음성)와 같은 GEMINI_API_KEY·같은 @google/genai SDK를 쓰지만,
// 이건 별도의 텍스트 전용 경로다 — Gemini Live(음성)는 자격증명(단기 토큰)만 발급하고 실제 대화는
// 브라우저가 Google과 직접 하는 반면, 이 클라이언트는 서버가 직접 텍스트를 생성해 sendMessage/
// generateOpeningLine(메신저 채팅·통화 텍스트 폴백 공통)에 반환한다.
//
// LlmClient 계약(llm/types.ts)이 이미 강제하는 대로 이 클래스는 "이미 조립된 systemPrompt/messages를
// 모델에 전달하는 얇은 transport"만 한다 — 프롬프트 조립(promptAssembly.ts)·사용자입력 구분자
// 감싸기(ADR-0004/AC-013)는 호출부 책임이라 여기서 재구현하지 않는다. MockLlmClient의
// INJECTION_PATTERN 정규식(파일 자체 주석: "실 LLM 단계에서는 guardrailPreamble이 이 역할을
// 대신한다")도 여기선 의도적으로 없다 — systemPrompt에 이미 guardrailPreamble이 포함돼 있고,
// role 분리+구분자 감싸기가 구조적 1차 방어다.
import { GoogleGenAI } from "@google/genai";
import type { Content } from "@google/genai";
import type { LlmClient, LlmCompletionInput, LlmCompletionResult, LlmMessage } from "./types";

/** 텍스트 생성용 Gemini 모델 — 음성 전용 모델(GEMINI_LIVE_MODEL)과 다르다(realtime과 별개 경로).
 *
 * **고정 버전으로 못박는다(2026-07-27, T98 회귀 수정).** 이전 값은 `"gemini-flash-latest"`
 * 부동 별칭이었고, 그게 이번 라이브 장애의 원인이었다:
 *   - `latest` 별칭이 가리키는 실체가 **아무 신호 없이** `gemini-3.6-flash`로 재매핑됐다
 *     (429 응답 로그에 `model: gemini-3.6-flash`로 찍혀 드러났다). 코드는 한 줄도 안 바뀌었는데
 *     대상 모델이 바뀌어, 그 모델이 받지 않는 설정(`thinkingConfig`, 아래 참조)이 400으로
 *     거부됐고 텍스트 LLM 경로가 **100% Mock 강등**됐다.
 *   - 즉 `latest`는 "계정별 구버전 차단을 피한다"는 이득 대신 **재매핑을 조용히 삼키는**
 *     비용을 지운다. 이 저장소가 겪은 다른 "낡은 사본" 사고(T101 스테일 `lib` 등)와 같은 부류이며
 *     방향만 반대다 — 내가 안 바꿨는데 상대가 바뀐다.
 *
 * `gemini-3.6-flash`는 `models?pageSize=200` 조회로 실재와 `generateContent` 지원을 확인했다
 * (2026-07-27). ⚠️ `"gemini-2.5-flash"`로 되돌리지 말 것 — 이 프로젝트 API 키 계정에서는
 * 404("no longer available to new users")로 거부된다(2026-07-24 실측, 2026-07-27 재확인).
 *
 * 모델을 올릴 때는 이 상수를 **의도적으로** 바꾸고 라이브 1회 호출로 확인한다(그게 별칭 대신
 * 고정 버전을 쓰는 목적이다 — 변경 시점을 커밋으로 남기고 검증을 강제한다). */
export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";

// 오프닝 대사(messages:[])에는 실제 사용자 입력이 없어 Gemini에 보낼 "첫 turn"이 없다 — systemPrompt
// 만으로는 생성이 시작되지 않는 모델도 있어(빈 contents), 화면에 노출되지 않는 내부 트리거 turn을
// 하나 합성해 넣는다(캐릭터 지시가 아니라 "지금 시작하라"는 오케스트레이션 신호일 뿐이라 role
// 분리 원칙과 충돌하지 않는다 — systemPrompt가 인격/수법/가드레일을 이미 전부 고정한 뒤이므로).
const OPENING_TRIGGER_TURN = "(통화/대화가 막 연결됐다. 방금 정의된 캐릭터로서 첫 마디를 자연스럽게 시작하라.)";

function toGeminiContent(message: LlmMessage): Content {
  return {
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  };
}

/**
 * **왜 `thinkingConfig`(추론 비활성)와 그 재시도 안전장치가 여기 없는가 — 삭제 근거(2026-07-27).**
 *
 * T98이 넣었던 `thinkingConfig: { thinkingBudget: 0 }`과, 그게 거부되면 추론 설정 없이 한 번
 * 재시도하던 `isThinkingConfigRejected()` 게이트를 **둘 다 제거**했다. 라이브 실측 근거:
 *
 * 1. **설정 자체가 거부된다.** 재매핑된 현재 모델(`gemini-3.6-flash`)은 최소 요청
 *    (`contents:[{parts:[{text:"안녕"}]}]`)에도 `thinkingBudget:0`이 실리면
 *    `HTTP 400 / INVALID_ARGUMENT`를 낸다.
 * 2. **안전장치가 그 400을 못 알아봤다.** 실제 에러 메시지는 `"Request contains an invalid
 *    argument."` 로, `/thinking/i` 정규식에 걸리는 문자열이 **없다**. 그래서 게이트는 false를
 *    반환했고 재시도는 한 번도 발동하지 않은 채 에러가 그대로 전파돼, `completeWithFallback`이
 *    **매 호출 Mock으로 강등**했다(로그: `"LLM 1차 클라이언트 실패 — Mock으로 강등"`).
 *    T98이 우려한 "66%가 100%로 악화"가 그대로 현실이 됐고, 안전장치는 **작동한다는 착각만**
 *    제공했다. 이 저장소는 T86에서 같은 종류(실제 케이스를 못 잡는 죽은 게이트)에 데인 적이 있다 —
 *    그래서 남겨두는 대신 지웠다. 이력은 이 주석과 git(T98 커밋)에 남는다.
 * 3. **T98의 전제가 현재 모델에서 성립하지 않는다.** 추론을 켠 상태로 같은 시스템 프롬프트
 *    (5,903자)를 A/B한 결과 **2,959ms**(출력 48토큰 / 추론 269토큰)로 `LLM_TIMEOUT_MS`(10초,
 *    AC-004 컷오프) 안에 넉넉히 들었다. 즉 "추론 때문에 10초를 넘긴다"는 T98의 근거는 이전
 *    모델의 특성이었고, 지금은 추론 기본값이 지연 문제를 만들지 않는다.
 *
 * 재도입 조건: 지연이 다시 AC-004를 위협한다는 **재측정 수치**가 있고, 그때의 고정 모델이
 * `thinkingConfig`를 수용함을 라이브 1회 호출로 확인한 경우에만. 판정을 에러 **메시지 문자열**로
 * 하지 말 것(위 2가 그 방식의 실패 사례다).
 */
export class GeminiLlmClient implements LlmClient {
  readonly providerName = "gemini" as const;

  constructor(private readonly apiKey: string) {}

  async complete(input: LlmCompletionInput): Promise<LlmCompletionResult> {
    const client = new GoogleGenAI({ apiKey: this.apiKey });
    const contents: Content[] =
      input.messages.length > 0
        ? input.messages.map(toGeminiContent)
        : [{ role: "user", parts: [{ text: OPENING_TRIGGER_TURN }] }];

    const response = await client.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents,
      config: { systemInstruction: input.systemPrompt },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini 텍스트 응답이 비어 있습니다(candidates/safety 차단 가능성).");
    }
    return { text, isMock: false };
  }
}
