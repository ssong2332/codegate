// 실시간 음성 대화(Realtime Voice) 어댑터 타입 — 2026-07-22 사용자 결정.
//
// 기존 파이프라인(브라우저 STT → 텍스트 LLM → TTS 합성 → <audio> 재생)은 턴마다 3단계를 왕복해
// 지연이 누적되고, 사용자가 말을 끊거나 겹쳐 말하는 실제 통화 동작을 재현하지 못했다. 이를
// **speech-to-speech 실시간 대화**로 교체한다.
//
// 프로바이더 선택 근거(추정 아님 — 각 API 문서 확인):
//   ElevenLabs Agents Platform을 채택했다. OpenAI Realtime·Gemini Live도 저지연 speech-to-speech를
//   제공하지만 **둘 다 고정된 프리셋 음성만 쓸 수 있다**. 이 앱의 1번 차별점은 "참가자 본인 목소리를
//   복제한 딥보이스"(AC-018/019)이므로, 런타임에 임의의 클론 voice_id를 지정할 수 있어야 한다.
//   ElevenLabs는 `tts.voice_id` 오버라이드를 지원하는 유일한 선택지라 이 요구를 만족한다.
//
// (T72 주석 추가) 그 구조의 대가가 §15.3.3의 난이도 갭이다 — 프롬프트가 에이전트 쪽에 있어
// 서버가 난이도 지시를 끼워 넣을 지점이 없다. `difficultyApplied` 필드가 이 사실을 명시한다.
//   한국어는 `agent.language: "ko"`로 지정하며, 음성 모델은 저지연(Flash 계열) 설정을 에이전트
//   쪽에 구성한다.
//
// ⚠️ ADR-0004 준수(중요): 시나리오 페르소나 프롬프트는 **클라이언트로 내려보내지 않는다**.
//   ElevenLabs 오버라이드는 클라이언트가 세션 시작 시 전송하는 값이라, 프롬프트를 오버라이드로
//   넘기면 브라우저에 민감 프롬프트가 노출된다. 따라서 **시나리오별 에이전트를 ElevenLabs 쪽에
//   미리 만들어 두고 프롬프트는 그 에이전트에 저장**하며, 서버는 scenarioId → agentId 매핑과
//   서명 URL만 발급한다. 클라가 보내는 오버라이드는 민감하지 않은 voice_id(본인 클론 id)뿐이다.

import type { DifficultyLevel } from "../shared/difficulty";
import type { MessengerChannel } from "../shared/types";
import type { HangupRelayContext } from "../scammerHangup/decide";
import type { LiveToolNames } from "./liveTools";

export type RealtimeCallInput = {
  sessionId: string;
  scenarioId: string;
  /**
   * 이 통화에 쓸 목소리. clone 시나리오는 참가자 본인의 클론 voiceId, generic 시나리오는
   * 공용 기본 음성 id. 민감 정보가 아니라 클라 오버라이드로 전달해도 무방하다.
   */
  voiceId: string;
  /**
   * T72 추가(§15.3.3 호출부 3곳 중 "Gemini Live 토큰") — 세션에 기록된 난이도. Gemini 경로는
   * 서버가 시스템 프롬프트를 토큰에 고정하므로 그 조립에 그대로 반영된다.
   * ⚠️ **ElevenLabs 경로에는 반영 지점이 없다** — 프롬프트가 에이전트 쪽에 저장돼 있고 클라
   * 오버라이드로 프롬프트를 넘기는 것은 ADR-0004 위반이라 금지돼 있다. 그 경로는 이 값을
   * 무시하며, 그 사실을 `RealtimeCallCredentials.difficultyApplied:false`로 명시한다.
   */
  difficultyLevel?: DifficultyLevel;
  /** 2026-10-18(§81) — 세션 가상 은행명. Gemini 경로는 시스템 프롬프트의 "OO은행"을 이 이름으로 바꾼다(ElevenLabs는 반영 지점 없음). */
  fictionalBankName?: string;
  /**
   * T191 S5 추가(PRD AC-096 (e)) — 세션에 배정된 흐름 변형의 불투명 ID. Gemini 경로는 이 변형을
   * 합성한 시나리오 프롬프트(`resolveSessionScenarioPrompt`)를 토큰에 고정한다. ⚠️ ElevenLabs 경로는
   * 난이도와 마찬가지로 반영 지점이 없어 **무시한다**(변형 미적용 = 현행 — 설계 OQ-A131 기본값).
   * 부재 = 원본 시나리오 프롬프트.
   */
  flowVariantId?: string;
  /**
   * T192 C3(Architecture.md §79.19 (5) 8) — 세션 채널(`session.channel` 그대로 · 부재 = voice). `end_call` 선언 술어
   * `declaresEndCall`의 입력이다. ⭐ 옵셔널이 아니라 **필수 키**(빠뜨리면 컴파일 오류). ElevenLabs · Mock 프로바이더는
   * 받기만 하고 무시한다(`flowVariantId`와 같은 처리).
   */
  channel: MessengerChannel | undefined;
  /**
   * T192 C3(§79.19 (5) 8 · G527) — **이미 해석된** 릴레이 위치(`resolveHangupRelay(session)`의 값 — 호출부가 1회 해석).
   * 프로바이더 안에서 다시 해석하지 않는다. 오늘 항상 `undefined`(S7 전). 필수 키.
   */
  hangupRelay: HangupRelayContext | undefined;
  /**
   * T194-a(docs/Architecture.md §83.4.3 "화자 성별") — **이미 해석된** 세션 단위 화자 성별(`resolveSessionSpeakerGender(session)` —
   * 호출부 `createRealtimeCall`이 1회 해석). Gemini 경로는 프롬프트 [화자] 블록(층 2)과 음성 풀(층 1)에 같은 값을 쓴다.
   * 표(`scenarioVoice.ts`)에 값이 있는 시나리오는 표 값 그대로라 오늘 동작과 같다. 부재면 Gemini 프로바이더가 표 값으로
   * 떨어진다(표에 값이 있는 시나리오는 세션 해석과 같은 값 — 부재가 동작을 바꾸는 시나리오는 표가 값을 내지 않는 parcel 고급뿐이고,
   * 유일한 운영 호출부 `createRealtimeCall`은 항상 넘긴다 — `promptAssembly.test.ts` 소스 스캔). ElevenLabs · Mock은 무시한다.
   */
  speakerGender?: "male" | "female";
};

/**
 * 어느 실시간 프로바이더로 붙을지 클라가 알아야 세션 구현을 고른다.
 * - `elevenlabs`: 서명 URL로 접속. **본인 목소리 클론(voiceId) 사용 가능** — 유료.
 * - `gemini`: 단기 토큰으로 접속. 무료 티어 가능하지만 **고정 프리셋 음성만** 쓸 수 있어
 *   clone 시나리오의 "본인 목소리" 요건은 만족하지 못한다(generic 시나리오 전용).
 * - `none`: 실시간 불가 → 클라는 기존 텍스트 폴백으로 진행한다.
 */
export type RealtimeProviderName = "elevenlabs" | "gemini" | "none";

export type RealtimeCallCredentials = {
  /** 어떤 프로바이더로 접속할지. `none`이면 실시간 통화 불가(텍스트 폴백). */
  provider: RealtimeProviderName;
  /**
   * ElevenLabs 서명 URL(WebSocket). 짧은 유효기간을 가지며 API 키를 클라에 노출하지 않는다.
   * gemini/none일 때는 빈 문자열.
   */
  signedUrl: string;
  /**
   * Gemini 단기 토큰(ephemeral token) 이름. 클라가 API 키 자리에 그대로 넣어 접속한다.
   * 모델·시스템 프롬프트는 발급 시점에 서버가 토큰에 고정해 두므로(liveConnectConstraints)
   * 이 토큰만으로는 프롬프트를 바꾸거나 읽을 수 없다. elevenlabs/none일 때는 빈 문자열.
   */
  geminiToken: string;
  /** Gemini 접속 시 사용할 모델명(토큰에 고정된 값과 동일해야 한다). */
  geminiModel: string;
  /** 이 통화에 쓸 목소리(ElevenLabs 전용 — 본인 클론 id 또는 공용 기본 음성). */
  voiceId: string;
  language: "ko";
  /** true = 실제 실시간 대화가 아니라 목업(키 미설정). 클라는 기존 텍스트 폴백으로 진행한다. */
  isMock: boolean;
  /**
   * T72 추가(§15.3.3/§15.6 G6, AC-064 "근거 없는 표기 금지") — 이 통화 경로에 사용자가 고른 난이도가
   * **실제로 반영됐는가**. ElevenLabs 경로는 프롬프트가 에이전트 쪽에 저장돼 있어 주입 지점 자체가
   * 없으므로 false다. 클라는 false면 난이도 배지를 표시하지 않는다(적용되지 않은 값을 표기하면
   * 근거 없는 표기가 된다) — 동시에 "조용한 미적용"도 금지라 미적용 사실 자체는 화면에 알린다.
   */
  difficultyApplied: boolean;
  /**
   * ⭐ §59.6/§59.10 커밋 C(G385/G386) — Live 도구 이름의 하향 전달(`docs/API.md` 부록 C
   * `createRealtimeCall` 증분). Gemini 프로바이더가 도구를 하나라도 선언할 때만 존재한다
   * (`realtime/liveTools.ts`의 `buildLiveToolNames`와 같은 판정). elevenlabs/none이거나 도구가
   * 하나도 선언되지 않으면 필드 자체가 없다.
   * ⚠️ T192 C3 — `end_call`이 메신저 · 중간 leg가 아닌 모든 Gemini 통화 세션에 선언되므로, 문자 · 확인 도구가 없는
   * 세션에도 이제 이 필드가 있다(`endCall` ⇔ `endCallFailureInstruction` 쌍). "도구 0 = 필드 없음"은 메신저 · 중간 leg뿐이다.
   */
  liveTools?: LiveToolNames;
};

export interface RealtimeVoiceProvider {
  readonly providerName: "mock" | "elevenlabs" | "gemini";
  /** 통화 1건에 필요한 접속 자격증명을 발급한다. */
  createCallCredentials(input: RealtimeCallInput): Promise<RealtimeCallCredentials>;
}
