// ElevenLabs Agents Platform 실시간 음성 대화 구현체 (2026-07-22).
//
// API: GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=...
//      헤더 `xi-api-key`, 응답 `{ "signed_url": "wss://..." }`
// 서명 URL은 짧은 유효기간을 가지며, 이 방식 덕분에 **API 키가 브라우저로 내려가지 않는다**.
//
// 페르소나 프롬프트는 여기서 넘기지 않는다 — agentMap.ts 주석 참고(ADR-0004).
import { RealtimeVoiceProvider, RealtimeCallCredentials, RealtimeCallInput } from "./types";

const SIGNED_URL_ENDPOINT = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";

/** 서명 URL 발급이 매달리면 통화 시작 자체가 멈추므로 짧게 끊는다(핵심 루프 비차단, P-4). */
const REQUEST_TIMEOUT_MS = 8000;

export class ElevenLabsRealtimeProvider implements RealtimeVoiceProvider {
  readonly providerName = "elevenlabs" as const;

  constructor(
    private readonly apiKey: string,
    /** scenarioId → agentId. 호출 전에 해당 시나리오 키가 있음을 보장하고 넘긴다. */
    private readonly agentIdByScenario: Record<string, string>,
  ) {}

  async createCallCredentials(input: RealtimeCallInput): Promise<RealtimeCallCredentials> {
    const agentId = this.agentIdByScenario[input.scenarioId];
    if (!agentId) {
      // 호출부(getRealtimeProvider)가 이미 걸러야 하는 상황 — 방어적으로 명시 실패시킨다.
      throw new Error(`시나리오에 대응하는 ElevenLabs agentId가 없습니다: ${input.scenarioId}`);
    }

    const url = `${SIGNED_URL_ENDPOINT}?agent_id=${encodeURIComponent(agentId)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "xi-api-key": this.apiKey },
        signal: controller.signal,
      });
      if (!response.ok) {
        // 본문에 키가 섞여 나올 이유는 없지만, 외부 응답을 그대로 로그/에러에 싣지 않는다.
        throw new Error(`ElevenLabs 서명 URL 발급 실패 (status ${response.status})`);
      }
      const body = (await response.json()) as { signed_url?: string };
      if (!body.signed_url) {
        throw new Error("ElevenLabs 응답에 signed_url이 없습니다.");
      }
      return {
        signedUrl: body.signed_url,
        voiceId: input.voiceId,
        language: "ko",
        isMock: false,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
