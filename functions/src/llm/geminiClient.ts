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
 * "gemini-2.5-flash" 고정 버전은 이 프로젝트 API 키 계정에서 실측 시 404("no longer available to
 * new users")로 거부됐다(2026-07-24) — 계정/키 발급 시점에 따라 구버전 고정 모델 접근이 막힌
 * 것으로 보인다. "-latest" 별칭은 Google이 시점마다 현재 권장 flash 모델로 자동 매핑해 이런
 * 계정별 구버전 차단에 흔들리지 않는다(실측 확인: 아래 이 파일이 통과하는 라이브 스모크 테스트). */
export const GEMINI_TEXT_MODEL = "gemini-flash-latest";

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
      config: {
        systemInstruction: input.systemPrompt,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini 텍스트 응답이 비어 있습니다(candidates/safety 차단 가능성).");
    }
    return { text, isMock: false };
  }
}
