import { MockVoiceProvider } from "./mockProvider";

// VoiceProvider 인터페이스 — ElevenLabs 클론/TTS 교체점 (T19, Architecture.md §1 "LLM 어댑터"와
// 동일 패턴을 음성에 적용: 인터페이스 뒤에 구현체를 교체). Track A(T4/T5)가 이 계약에 맞춰
// 개발하고, T1(실클론 PoC) 준비가 끝나면 ElevenLabsVoiceProvider로 교체한다(구현체만 교체,
// 인터페이스 불변). API.md `createVoiceClone`/`synthesizeDeepvoice` 계약과 정합.
//
// ⚠️ 목업 식별 표식(PRD Risks "목업 잔존 위험" 대응): 이 인터페이스를 구현하는 모든 결과 타입은
// `isMock: boolean` 필드를 반드시 채운다. MockVoiceProvider는 항상 `isMock: true`를 반환하고,
// 실 ElevenLabs 구현체는 항상 `isMock: false`를 반환해야 한다 — 호출부가 이 값으로 화면 라벨/
// 로그를 분기해 "목업이 실수로 최종 데모까지 남는" 사고를 막는다.

export type VoiceCloneStatus = "ready" | "pending" | "failed";

export type CreateVoiceCloneInput = {
  sessionId: string;
  uid: string;
  // TODO(T4): 실구현체(ElevenLabsVoiceProvider)는 Storage에서 읽은 실제 녹음(버퍼 또는 경로)이
  // 필요하다. Mock은 실제 오디오를 쓰지 않으므로 지금은 sessionId/uid만으로 충분하다.
  voiceInputStoragePath?: string;
};

export type VoiceCloneResult = {
  voiceId: string;
  cloneStatus: VoiceCloneStatus;
  /** true = 목업 산출물(T19). 실 ElevenLabs 클론이면 반드시 false. */
  isMock: boolean;
};

export type SynthesizeInput = {
  sessionId: string;
  voiceId: string;
  text: string;
};

export type VoiceSynthesisResult = {
  /** 재생 가능한 오디오 URL(Mock은 data URI, 실구현은 Storage 서명 URL 등). */
  audioUrl: string;
  /** AC-022 합성 표식 — Mock/실구현 공통으로 항상 true(재생물은 항상 AI 합성물). */
  synthetic: true;
  syntheticLabel: "AI 훈련용 합성";
  /** true = 목업 산출물(T19). 실 ElevenLabs 합성이면 반드시 false. */
  isMock: boolean;
};

export interface VoiceProvider {
  readonly providerName: "mock" | "elevenlabs";
  /** 30초 녹음으로 클론 voice 생성 (API.md createVoiceClone, AC-018). */
  createClone(input: CreateVoiceCloneInput): Promise<VoiceCloneResult>;
  /** 클론 voice로 문장 합성 (API.md synthesizeDeepvoice, AC-019/AC-022). */
  synthesize(input: SynthesizeInput): Promise<VoiceSynthesisResult>;
  /**
   * 클론 voice를 외부 서비스에서 삭제 (AC-021, ADR-0003, T10 폐기 트리거가 호출할 지점).
   * Mock은 외부에 아무 상태도 만들지 않으므로 no-op.
   */
  deleteVoice(voiceId: string): Promise<void>;
}

/**
 * 구현체 선택 지점(교체점, 단일화) — 지금은 항상 MockVoiceProvider를 반환한다.
 *
 * TODO(T1/T4): ElevenLabs API 키(ELEVENLABS_API_KEY, functions/src/shared/config.ts) 확보 후
 * 여기에 `new ElevenLabsVoiceProvider(...)` 분기를 추가한다. 예:
 *   const hasElevenLabsKey = ...; // T1 PoC 완료 후 판단 로직 확정
 *   if (hasElevenLabsKey) return new ElevenLabsVoiceProvider();
 *   return new MockVoiceProvider();
 * ElevenLabsVoiceProvider는 이번 태스크(T19) 범위 밖 — 실제 ElevenLabs API를 호출하는 코드는
 * 아직 만들지 않는다(T1/T4에서 구현).
 */
export function getVoiceProvider(): VoiceProvider {
  return new MockVoiceProvider();
}
