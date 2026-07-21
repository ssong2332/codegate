// MockVoiceProvider (T19) — ElevenLabs API 키 없이 VoiceProvider 계약을 채우는 임시 구현체.
// ⚠️ 개발 편의용 임시 대체물이다. 최종 데모에는 절대 쓰지 않는다 — 반드시 T1 실클론 PoC 이후
// ElevenLabsVoiceProvider로 교체한다(PRD Risks "목업 잔존 위험", provider.ts의 getVoiceProvider
// TODO 참조). 이 파일이 만드는 모든 산출물은 `isMock: true` + `mock-` 접두사로 육안 식별된다.
import { randomUUID } from "node:crypto";
import { SYNTHETIC_LABEL } from "../shared/constants";
import { buildMockBeepWavDataUri } from "./mockAudio";
import type {
  CreateVoiceCloneInput,
  SynthesizeInput,
  VoiceCloneResult,
  VoiceProvider,
  VoiceSynthesisResult,
} from "./provider";

/** 목업 산출물 식별 접두사 — Firestore/로그에서 실 ElevenLabs voiceId와 절대 혼동되지 않게 한다. */
export const MOCK_VOICE_ID_PREFIX = "mock-voice-";
export const MOCK_ARTIFACT_ID_PREFIX = "mock-artifact-";
/** 사람이 읽는 안내 문구 — 응답을 로그/화면에 그대로 노출해도 목업임이 드러나게 한다. */
export const MOCK_NOTICE = "임시 목업 음성입니다(실제 ElevenLabs 클론 아님, T19 참고).";

export class MockVoiceProvider implements VoiceProvider {
  readonly providerName = "mock" as const;

  async createClone(input: CreateVoiceCloneInput): Promise<VoiceCloneResult> {
    void input; // Mock은 실제 녹음을 읽지 않는다(실 클론 파이프라인은 T4에서 ElevenLabs로 구현).
    return {
      voiceId: `${MOCK_VOICE_ID_PREFIX}${randomUUID()}`,
      cloneStatus: "ready",
      isMock: true,
    };
  }

  async synthesize(input: SynthesizeInput): Promise<VoiceSynthesisResult> {
    void input; // Mock은 실제 텍스트를 음성으로 합성하지 않고 고정 경고음(beep)을 반환한다.
    return {
      audioUrl: buildMockBeepWavDataUri(),
      synthetic: true,
      syntheticLabel: SYNTHETIC_LABEL,
      isMock: true,
    };
  }

  async deleteVoice(voiceId: string): Promise<void> {
    void voiceId; // Mock voiceId는 외부 서비스에 실체가 없으므로 삭제할 것이 없다(no-op).
  }
}
