"use client";

// Gemini Live 실시간 speech-to-speech 세션 본체 (UX-014 live phase, 2026-07-22 무료 경로).
//
// ⚠️ RealtimeVoiceSession(ElevenLabs)과 마찬가지로 **지연 로딩 전용**이다 — 서버가 자격증명을
// 준 경우에만 마운트한다. 화면 요소는 없고(렌더링 null) 세션 생명주기만 관리한다.
//
// ElevenLabs SDK는 마이크/스피커를 대신 다뤄줬지만 Live API는 오디오를 직접 흘려보내야 한다:
//   보내기: 마이크 Float32 → 16kHz PCM16 → base64 → sendRealtimeInput
//   받기:   base64 PCM16(24kHz) → Float32 → AudioBuffer 큐로 순차 재생
//
// 보안 메모: 여기서 넘기는 건 서버가 발급한 단기 토큰뿐이다. 모델·시스템 프롬프트·도구는 토큰
// 발급 시점에 서버가 고정했으므로(liveConnectConstraints) 이 파일이 프롬프트를 알 필요도, 알 수도
// 없다(ADR-0004).
//
// ⚠️ 반드시 지킬 것(2026-07-23 "연결하는 중" 고착 디버깅에서 확인):
//   - **단기 토큰은 v1alpha에서만 유효**하다 — GoogleGenAI 생성 시 httpOptions.apiVersion="v1alpha"를
//     빠뜨리면 안 된다(빠뜨리면 SDK가 경고를 내고 접속이 불안정해진다).
//   - **AudioContext는 사용자 제스처 밖(비동기 effect)에서 만들어지면 suspended로 시작**한다 —
//     resume()을 명시적으로 호출하지 않으면 소리가 안 난다.
//   - 개발 중에는 각 단계 로그(console.info "[gemini] ...")를 남겨, 접속이 어디서 멈추는지
//     F12 콘솔로 바로 진단할 수 있게 한다.
import { useEffect, useRef } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import type { CreateRealtimeCallResponse } from "@/lib/api";
import { deliverInCallSms, deliverVerifyOffer, requestScammerHangup } from "@/lib/api";
import {
  GEMINI_INPUT_SAMPLE_RATE,
  GEMINI_OUTPUT_SAMPLE_RATE,
  base64ToFloat32,
  floatToPcm16,
  pcm16ToBase64,
} from "./pcm";
import {
  INITIAL_USER_SPEECH_DEBOUNCE_STATE,
  computeRmsFromByteTimeDomain,
  nextUserSpeechDebounceState,
} from "./userSpeechLevel";
import { computeGateCloseDelayMs, resolveTurnInProgress } from "./agentSpeechGate";
import {
  buildAlreadyAnnouncedToolResponse,
  buildUnsupportedToolResponses,
  collectToolResponses,
  endCallBatchHasOtherCalls,
  readEndCallReasonArg,
  readSmsPurposeArg,
  resolveToolCallKind,
  type LiveToolFunctionCall,
} from "./liveToolResponse";
import { HANGUP_DRAIN_CAP_MS, HANGUP_FINAL_TURN_CAP_MS, hangupDrainDelayMs } from "@/lib/session/callEnding";
import {
  GEMINI_OUTPUT_GAIN,
  LIMITER_INPUT_RANGE,
  SPEAKER_COMPRESSOR,
  applySpeakerDynamics,
  buildLimiterCurve,
  callStreamTrimFor,
  liveStageFor,
  trimGainFor,
} from "./outputGain";
import { INITIAL_LOUDNESS_STATE, normalizeChunk, type LoudnessState } from "./loudnessNormalizer";
import { createEarlyMessageGate } from "./earlyMessageGate";
import { INITIAL_UNHEARD_REPLY_STATE, UNHEARD_REPLY_TEXT, stepUnheardReply } from "./unheardReply";
import { appendScammerChunk, shouldMarkToolBoundary } from "./toolTurnTranscript";
import { INITIAL_THOUGHT_LEAK_GATE_STATE, pickLiveAudioData, stepThoughtLeakGate, stripLeakedThought, type LiveContentPart } from "./thoughtLeak";
import {
  AWAIT_RESPONSE_TIMEOUT_MS,
  INITIAL_CLIENT_TURN_QUEUE_STATE,
  stepClientTurnQueue,
  type ClientTurn,
  type ClientTurnEvent,
} from "./clientTurnQueue";
import {
  INITIAL_SILENCE_NUDGE_STATE,
  LIVE_TURN_LOG_PREFIX,
  SILENCE_NUDGE_RECHECK_MS,
  SILENCE_NUDGE_TEXT,
  SMS_MENTION_SILENCE_SEC,
  formatSilenceNudgeLog,
  isEmptyTurnComplete,
  localSpeechStarted,
  sendsAsContextInjection,
  stepSilenceNudge,
  type InstructionDelivery,
} from "./contextInjection";
import {
  INITIAL_STALL_NUDGE_STATE,
  LIVE_REPEAT_BREAK_TEXT,
  STALL_NUDGE_TEXT,
  STALL_SILENCE_SEC,
  decideLiveRepeatBreak,
  formatLiveRepeatBreakLog,
  formatStallNudgeLog,
  isStallLine,
  stepStallNudge,
} from "./stallRecovery";
import {
  INITIAL_LIVE_LATENCY_STATE,
  LIVE_LATENCY_LOG_PREFIX,
  buildCallSetupRecord,
  formatLatencyLine,
  markCallSetup,
  noteModelAudio,
  noteSentTurn,
  noteToolCall,
  noteToolResponseSent,
  noteTurnEnd,
  readCallSetupMarks,
  summarizeLatency,
  type LiveLatencyTurnRecord,
  type TurnEndReason,
} from "./liveLatency";
import { LIVE_MIC_CONSTRAINTS, liveMicHandoff, stopStream } from "./micHandoff";
import { scammerClaimsSmsSent } from "./toolWindow";
import {
  FRESH_OUTPUT_RESUME_TIMEOUT_MS,
  connectOutputElementSink,
  createHiddenOutputElement,
  isUsableContext,
  pickCallOutputPath,
  readOutputAfterMicFlag,
  readOutputElementFlag,
  readVoiceTrimFlag,
  resumeSuspendedContexts,
  type PrimedCallAudio,
} from "./callAudio";
import { readDebugFlagSearch } from "./debugFlags";
import {
  BACKGROUND_LOG_PREFIX,
  MIC_RECHECK_DELAY_MS,
  decideMicRecovery,
  decideSocketClose,
  isReplacementTrackUsable,
} from "./backgroundCall";
import {
  LIVE_RESUME_LOG_PREFIX,
  RESUME_ATTEMPTS_PER_DROP,
  RESUME_CONNECT_TIMEOUT_MS,
  buildSilentResumeContext,
  type SilentResumeTurn,
  RESUME_RETRY_DELAY_MS,
  closeCodeOf,
  decideGoAway,
  decideLiveClose,
  formatResumeReason,
  nextResumeHandle,
  type LiveCloseInput,
} from "./liveResume";
import type { LiveTurnPhase } from "@/lib/verifyintercept";
import {
  formatMicLine,
  noteAsrChunk,
  noteAudioError,
  noteLiveResume,
  noteChunkReceived,
  noteNormalizerGain,
  noteFreshResume,
  noteOutputPath,
  noteOutputSink,
  noteStreamTrim,
  noteMicFrame,
  noteContextWhileSpeaking,
  noteInterrupt,
  notePlayGap,
  noteThoughtCut,
  playGapMs,
  noteUnheardReplyFired,
  peakOf,
  registerMicTrack,
  noteChunkScheduled,
  registerCallAudio,
  registerOutputGain,
} from "./audioDiagnostics";

export type GeminiVoiceSessionProps = {
  credentials: CreateRealtimeCallResponse;
  /**
   * ⭐ §59.6 ③(reviewer Critical #1) — 이 통화의 세션 id. Live 도구가 실제로 부르는
   * `deliverInCallSms`/`deliverVerifyOffer`는 소유권 재검증에 이 값이 필요하다(G12/G24). 이
   * 컴포넌트는 `realtime.credentials?.provider === "gemini"`일 때만 마운트되며, 그 시점에는
   * 호출부(`session/play/page.tsx`)가 이미 이 값으로 `createRealtimeCall`을 발급받은 뒤다.
   */
  sessionId: string;
  onActive: () => void;
  onEnded: () => void;
  onError: () => void;
  onSpeakingChange: (speaking: boolean) => void;
  /** 사용자 신고(2026-07-24, "내 말을 잘 듣고 있는지 보고 싶다") — 로컬 마이크 입력이 실제로
   * 잡히고 있는지를 사용자 파형 인디케이터로 보여주기 위한 신호. 서버 VAD 판정을 기다리지 않고
   * 로컬에서 즉시 계산하므로, "서버가 내 말을 인식했다"가 아니라 "마이크가 지금 소리를 잡고
   * 있다"는 진단/피드백 신호다(active/agentSpeaking과 동일한 boolean 계약, CallWaveform 재사용). */
  onUserSpeakingChange: (speaking: boolean) => void;
  /** 완성된 발화 1턴을 부모로 올린다(리포트 기록용, finding #1). role은 user/scammer. */
  onTranscriptTurn: (role: "user" | "scammer", text: string) => void;
  /**
   * ⭐ §140 판정표 4 — 지금까지의 통화 전사 전체(부모 `transcriptRef` — 이 연결 이전 · §99 · §136 복원분 포함). 조용히 다시 연결한 뒤
   * 맥락으로 다시 넣는다. 부재 = 이 연결이 내보낸 전사만 쓴다.
   */
  readTranscript?: () => readonly SilentResumeTurn[];
  stopSignal: number;
  muted: boolean;
  /**
   * ⭐ T190-3(docs/Architecture.md §74.3 표 S · §74.6 (4) · G455) — 스피커 버튼의 음량 모드 값(통화 0.6 / 스피커 1.0,
   * `gainFor(audioRoute)`). 연결 중·통화 중 언제 바뀌어도 아래 게인 노드에 곧바로 반영된다(ref 경유). 부재 =
   * 기본 음량(`GEMINI_OUTPUT_GAIN`). 웹은 Android에서 수화부↔스피커 실제 전환을 할 수 없어 음량으로 대체한다.
   */
  outputVolume?: number;
  /** 사용자 신고(2026-07-25) — "키패드가 실제로 작동하지 않는다 + 타이핑으로도 통화할 수 있게 해서
   * 스스로 검증할 수 있게 해봐". 실시간 통화 중 타이핑한 문장을 **같은 Live 세션 안으로** 넣는다
   * (`sendClientContent`). 예전엔 실시간 모드에서 텍스트 입력 자체를 숨겼는데, 그 이유는 텍스트를
   * `sendMessage`(별도 텍스트 LLM+TTS)로 보내면 실시간 음성 위에 다른 목소리가 겹치기 때문이었다
   * — 같은 세션에 넣으면 그 문제가 원천적으로 없고, 응답도 평소처럼 이 통화의 목소리로 나온다.
   * `stopSignal`과 동일한 카운터 패턴을 쓴다(값이 바뀔 때 1회 전송). */
  textMessage: { text: string; seq: number } | null;
  /**
   * T68(UX-027/UF-008, §15.1.2) — 사기범 발화 1턴이 끝날 때마다(=`turnComplete`) 부모에게 알린다.
   * 부모는 이 카운트만으로 "몇 번째 사기범 턴인가"를 세어 통화 중 문자 도착 트리거를 판단한다.
   * ⚠️ 이 카운팅은 §13.5 스킨과 같은 **프레젠테이션 층위**다 — 안전 판정을 게이팅하지 않고, 서버가
   * `smsId`의 시나리오 소속을 재검증한다(G12). 부모가 안 넘기면 아무 일도 일어나지 않는다.
   */
  onScammerTurnComplete?: () => void;
  /**
   * T68 — 문자 도착 순간 서버가 준 `announceInstruction`을 **같은 Live 세션에 텍스트 턴으로** 주입한다.
   * `textMessage`와 전송 경로는 같지만(`sendClientContent`) **전사에 기록하지 않는다** — 이건 사용자
   * 발화가 아니라 오케스트레이션 지시라, 기록하면 리포트가 "사용자가 이런 말을 했다"고 오판한다.
   * 선례: 같은 파일의 `OPENING_TRIGGER_TURN`(연결 직후 발화 시작 신호, 역시 미기록).
   * ⭐ §82.4(T1 · G542) — `delivery`가 전송 형태를 정한다: 문자 · 확인 권유 안내는 **맥락 주입**
   * (`turnComplete:false` — 응답을 유발하지 않고 참가자의 다음 발화에 대한 응답에 실린다, S1 §3.2),
   * 화자 전환 첫 발화(`speakerSwitch`)만 `relayGreeting` 텍스트 턴(§71.5 큐 경유)이다. 부재 = 맥락 주입.
   */
  instructionTurn?: { text: string; seq: number; delivery?: InstructionDelivery } | null;
  /**
   * PR-A2(audit-A R1 · R8) — G31 큐 **밖**의 맥락 주입 슬롯(`turnComplete:false` · 응답 유발 0 · 턴 슬롯 소비 0 — 전환 상태 단언
   * `personaStateTurn`과 같은 이유로 별도 슬롯). 확인 결과 신호(`confirmResult`)와 자동 호 전환 실패(`verifyReconnectFailed`)만
   * 싣는다. 판정은 부모가 순수 함수(`stallRecovery.ts`)로 한다. ⚠️ 전사에 기록하지 않는다(G105).
   */
  contextTurn?: { text: string; seq: number; delivery: "confirmResult" | "verifyReconnectFailed" | "chatDuringCall" | "landingSubmitted" | "installConsented" | "screenStatus" } | null;
  /**
   * PR-A2(audit-A R1) — 모델 도구 `send_prepared_sms`가 도착시킨 문자의 서버 결과 신호(`confirmResultInstruction`). 도구 응답을
   * **보낸 뒤에** 부른다(도착 안내보다 먼저 가지 않게). 세션당 1회 판정은 부모(`planConfirmResultInjection`)가 한다.
   */
  onConfirmResultInstruction?: (text: string) => void;
  /** PR-A2 리뷰 Minor 1 — `contextTurn`을 실제로 세션에 보냈다(부모가 그 슬롯을 비워 재마운트 중복을 막는다). */
  onContextTurnDelivered?: (seq: number) => void;
  // ⭐ T191(문자 도달 조건) — 예전 `onModelToolSmsDelivered`·`onModelToolSmsFailed`(모델 도구 성공 · 실패를 부모의
  // 고정 턴 백스톱에 알리던 콜백)는 폐기했다. 문자 백스톱은 이제 서버가 도착 기록으로 판정하므로(`planSmsBackstop`)
  // 부모가 모델 경로의 결과를 따로 알 필요가 없다.
  /**
   * §59.10 커밋 D — 모델이 `offer_verification_desk`(announce 단계)를 실제로 성공시켰을 때 알린다.
   * 부모는 자신의 `verifyOfferPhaseRef`를 `"announced"`로 전진시켜야 한다 — 그래야 commit 단계
   * (문서 실제 생성, §38.4 후보 E)가 이어질 수 있다. 이 파일은 announce만 다루고 commit은 여전히
   * 부모의 기존 턴 경계 관측 이펙트가 진다(§59.6 리뷰 수정 주석 참고 — 무변경).
   */
  onModelToolVerifyAnnounced?: () => void;
  /** §59.10 커밋 D(G390) — `offer_verification_desk` 콜러블 경로 실패 신호(위 SMS와 동형). */
  onModelToolVerifyFailed?: () => void;
  /**
   * ⭐ §59 Critical 수정(reviewer REJECTED, `verifyAnnounceGuard.ts` 근거) — announce 요청을
   * **보내기 직전(동기)**에 부모가 소유한 상호배제 슬롯을 클레임한다. `false`면 백스톱 경로가
   * 이미 같은 요청을 보내는 중이라는 뜻이므로, 이 컴포넌트는 `deliverVerifyOffer`를 호출하지
   * 않고 안전한 응답을 즉시 돌려준다(선택적 콜백이 아니다 — 이 가드 없이 마운트되면 이중 발동
   * 방지가 통째로 무력화된다).
   */
  claimVerifyAnnounceSlot: () => boolean;
  /** 위 클레임에 대응하는 해제(성공·실패 무관, `dispatchToolCall`의 finally에서 부른다). */
  releaseVerifyAnnounceSlot: () => void;
  /**
   * ⭐ **T118 / 층 A5-α(§25.3)** — 호 전환 이후 사기범 턴 경계마다 다시 넣는 **전환 상태 단언 1줄**.
   *
   * `instructionTurn`과 **다른 슬롯**인 이유(설계 확정, 임의로 합치지 말 것):
   *   - **턴 슬롯을 소비하지 않는다.** `turnComplete: false`로 보내 모델 응답을 유발하지 않으므로
   *     문자 announce·확인 지시의 큐(§16.6 G31)와 경합하지 않는다. 같은 슬롯에 합치면 이 값이 매
   *     사용자 턴마다 큐를 차지해 다른 지시를 밀어낸다.
   *   - **P-1 프로브 실측이 근거다**(§25.3 (4)): 전환 후 `turnComplete:false`로 1회 보내고 30초
   *     무발화를 유지했을 때 소켓 오류 0건·close 0건·신규 사기범 발화 0건이었다 ⇒ A5-α 채택.
   * ⚠️ `instructionTurn`과 마찬가지로 **전사에 기록하지 않는다**(**G105**) — 기록하면 리포트가
   * "사용자가 이런 말을 했다"고 오판해 속았는지 판정이 오염된다.
   */
  personaStateTurn?: { text: string; seq: number } | null;
  /**
   * ⭐ 수정안 A(2026-10-18, 라이브 d13e718 무음 신고) — 통화 화면이 **받기 탭 안에서 동기로** 만들고 `resume()`한 출력·입력
   * 컨텍스트(`callAudio.ts` `primeCallAudio`). 살아 있으면 새로 만들지 않고 이것을 쓴다. ⛔ **빌려 쓰기만 한다** — 이
   * 컴포넌트는 넘겨받은 컨텍스트를 닫지 않는다(소유권 = 통화 화면). 없거나 닫혔으면 종전대로 여기서 만들고 여기서 닫는다.
   */
  primedAudio?: PrimedCallAudio | null;
  /**
   * ⭐ T191 S3 리뷰 M2 — 이 컴포넌트가 현재 턴 위상(모델 응답 중 · 사용자 전사 버퍼)을 써 넣는 화면 소유 ref.
   * 화면의 G31 드레인이 확인 권유 예고 기록 시점을 정할 때 읽는다(`deferredAnnouncePendingOnDispatch`). 부재 = 미보고.
   */
  turnPhaseRef?: { current: LiveTurnPhase };
  // ── ⭐ T192 C5(Architecture.md §79.18 (2) 동결 인터페이스 · §79.8 R1~R5 · G528) — 세션 단위 상태는 부모가 소유한다
  // (leg 재마운트에도 살아남게). 이 컴포넌트는 getter로 읽고 콜백으로 알린다 — 지역 `hangupPending` 0(G528 ⓑ).
  /** 세션 누적 사용자 발화 수(부모 `turnCountersRef.current.userTurns`). `end_call` · `send_prepared_sms`가 같은 값을 쓴다. */
  getSessionUserTurns: () => number;
  /** 부모 클라 항 — 지시 큐 비어 있지 않음 ∨ 이번 턴 지시 처리 중 ∨ 교대 대기(`isRelaySwitchPending` — S7 전 `false`). */
  getPendingInstruction: () => boolean;
  /** 승인 · 종료 래치(`isEndLatched(callEndingRef.current)`) — 마이크 · 클라 텍스트 턴 · 침묵 넛지 차단의 판정(G510). */
  isHangupLatched: () => boolean;
  /** R2 — 승인 응답을 `sendToolResponse`로 보내기 **전에** 부른다(부모: `latchHangupAccepted`). */
  onScammerHangupAccepted: () => void;
  /** R5 — 응답 뒤 첫 `turnComplete`(또는 끼어들기 · close · 상한) + 잔여 재생 + 꼬리가 지난 뒤 1회(부모: `endCall("scammer")`). */
  onScammerHangupReady: () => void;
  /**
   * ⭐ §99(화면 꺼짐 신고) — 다시 연결된 세션의 첫 턴. 있으면 오프닝 트리거 대신 이것을 보낸다(지금까지의 대화 맥락 ·
   * `buildResumeTurn`). 부재 = 종전 오프닝. 전사에 기록하지 않는다(오프닝과 같은 오케스트레이션 신호).
   */
  resumeTurn?: string | null;
  /**
   * ⭐ §99 — 화면이 가려진 동안(또는 돌아온 직후) 소켓이 닫혔을 때 `onEnded` 대신 부른다(부모가 다시 연결한다 — 판정
   * `decideSocketClose`). 부재 = 종전대로 `onEnded`. 사용자가 끊었거나 끊기 래치 뒤에는 부르지 않는다.
   */
  onConnectionLost?: () => void;
  /**
   * ⭐ §126(2026-10-24 실기 신고 *"문자가 바로 오지는 않아"*) — 사기범이 **말하는 도중** 출력 전사에 "문자를 보냈다"가 처음 보인 순간 1회(턴당).
   * 인자 = 그 시점 사용자 발화 수(`claimedUserTurns` — 도구 경로와 같은 값). 부모가 즉시 주장 백스톱을 묻는다(종전: 턴 끝 flush에서만).
   */
  onScammerSmsClaim?: (userTurns: number) => void;
  /**
   * H1(2026-11-01 U1) — 화자 전환 첫 발화(`relayGreeting`)를 Live에 **실제로 보낸** 순간 1회. 부모는 이때 발신자 라벨을
   * 확인 창구로 바꾼다(보류 큐가 앞 화자의 발화가 끝나기를 기다리는 동안 라벨이 먼저 바뀌지 않게). 부재 = 아무 일 없음.
   */
  onRelayGreetingSent?: () => void;
};

// §105 — `[live-mic]` 진단 줄 주기(숫자만 · 판단값).
const MIC_LOG_INTERVAL_MS = 20_000;

// 마이크 캡처 버퍼 크기 — 작을수록 지연이 낮지만 콜백이 잦다. 사용자 신고(2026-07-25, "내가 말하고
// ai가 말하는 데 걸리는 시간이 길다") 대응으로 4096→2048로 낮춘다. 48kHz 기준 한 콜백이 모으는
// 시간이 약 85ms→43ms로 줄어, 발화 끝부분이 서버에 도달하는 시점이 그만큼 앞당겨진다.
// ⚠️ 이 값이 줄이는 것은 **클라이언트 버퍼링 구간뿐**이다 — 체감 지연의 지배적 요소는 Gemini
// 서버측 모델 추론·음성 생성 시간이라 앱에서 제거할 수 없다(수십 ms 개선, 실측 아님).
const CAPTURE_BUFFER_SIZE = 2048;

// 사용자 신고(2026-07-24) — 연결 직후 사용자가 먼저 말해야 대화가 시작되던 문제. Gemini Live는
// ElevenLabs의 firstMessage 같은 "이 문장을 그대로 말하라" 오버라이드가 없다(sendClientContent로
// 보낸 turns는 모델이 응답을 생성할 입력일 뿐, 그대로 낭독하지 않는다) — 대신 llm/geminiClient.ts의
// OPENING_TRIGGER_TURN과 동일한 발상으로, "지금 막 연결됐으니 캐릭터로서 먼저 말을 걸라"는
// 오케스트레이션 신호만 보낸다. 시스템 프롬프트(페르소나·수법·가드레일)는 이미 토큰 발급 시점에
// liveConnectConstraints로 고정돼 있어(ADR-0004) 이 트리거가 캐릭터를 바꾸거나 새 지시를 주입하지
// 않는다 — 단지 "지금 발화를 시작하라"는 신호일 뿐이다. 텍스트가 아니라 오디오 모달리티로만
// 응답하도록 config에 이미 고정돼 있어(responseModalities:[AUDIO], geminiProvider.ts) 이 트리거
// 자체가 사용자에게 텍스트로 노출될 일도 없다.
// 사용자 신고(2026-07-25) — 오프닝이 다짜고짜 요구·압박부터 들어가 시나리오 배경이 없다는 피드백.
// generateOpeningLine(functions/src/roleplay/openingLine.ts)의 OPENING_TURN_INSTRUCTION과 동일한
// 취지를 트리거 문구에도 반영 — 신분·연락 이유를 먼저 밝히게 한다.
// ⭐ 2026-10-21(라이브 실측 첫 턴 12.3초 · 기준 한 턴 6초 이하 P-H H2) — "설명한 뒤에 이어가라"가 첫 턴을 길게 늘였다.
// 첫 마디는 짧게 하고 **멈춰서 상대 대답을 기다리게** 한다(설명은 다음 턴). 받은 사람이 첫마디를 놓쳐도 곧 되물을 수 있다.
const OPENING_TRIGGER_TURN =
  "(전화가 방금 연결됐다. 지금 막 전화를 받은 상대에게 캐릭터로서 자연스럽게 첫 마디를 건네라. 첫 마디는 짧게 — 신분(사칭 기관·관계)과 전화를 건 이유를 짧은 한두 문장(5초 안팎)으로만 밝히고, 멈춰서 상대의 대답을 기다려라. 다짜고짜 요구나 압박부터 하지 말고, 자세한 설명은 상대가 반응한 뒤 다음 턴에 이어가라.)";

// 이름 있는 타입으로 분리한 이유 — `let session: T | null` 선언부에서 `T`를 인라인으로 쓰면
// `session = (...) as unknown as typeof session`처럼 자기참조 캐스트를 할 때, 같은 표현식 안의
// 콜백 클로저(onclose 등)가 session을 참조하는 것과 얽혀 TS가 타입을 `never`로 좁혀버리는 문제가
// 있었다(실측). 이름 있는 타입으로 자기참조를 없애 해결한다.
type GeminiLiveSession = {
  sendRealtimeInput: (i: unknown) => void;
  sendClientContent: (i: { turns?: unknown; turnComplete?: boolean }) => void;
  /**
   * §59.10 커밋 A(G383) — `BLOCKING` 도구 호출에 반드시 응답을 돌려주기 위한 배선.
   * SDK 시그니처: `session.sendToolResponse(params: LiveSendToolResponseParameters)`,
   * `functionResponses: FunctionResponse[] | FunctionResponse`(`genai.d.ts:12177`·`:9201-9204`).
   */
  sendToolResponse: (params: {
    functionResponses: { id?: string; name?: string; response?: Record<string, unknown> }[];
  }) => void;
  close: () => void;
};

const log = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.info("[gemini]", ...args);
};

// §71.6(G432) — 지연 계측 1줄. 위 `log()`와 달리 **production에서도 남긴다**(실기기 원격 디버깅으로 읽는다).
// 숫자 · 종류 · 모델명만 싣는다 — 전사 텍스트 · 식별자는 이 줄에 들어가지 않는다(`liveLatency.test.ts`).
const logLatency = (line: string) => {
  console.info(LIVE_LATENCY_LOG_PREFIX, line);
};

export default function GeminiVoiceSession({
  credentials,
  sessionId,
  onActive,
  onEnded,
  onError,
  onSpeakingChange,
  onUserSpeakingChange,
  onTranscriptTurn,
  readTranscript,
  stopSignal,
  muted,
  outputVolume,
  textMessage,
  onScammerTurnComplete,
  onModelToolVerifyAnnounced,
  onModelToolVerifyFailed,
  onConfirmResultInstruction,
  onContextTurnDelivered,
  claimVerifyAnnounceSlot,
  releaseVerifyAnnounceSlot,
  instructionTurn,
  contextTurn,
  personaStateTurn,
  primedAudio,
  turnPhaseRef,
  getSessionUserTurns,
  getPendingInstruction,
  isHangupLatched,
  onScammerHangupAccepted,
  onScammerHangupReady,
  resumeTurn,
  onConnectionLost,
  onScammerSmsClaim,
  onRelayGreetingSent,
}: GeminiVoiceSessionProps) {
  // §99 — 마운트 시점 값만 쓴다(첫 턴은 연결 직후 1회).
  const resumeTurnRef = useRef(resumeTurn ?? null);
  // §99 — 부모의 종료 요청(`stopSignal`)으로 닫는 것인가. 이때의 close는 언제나 종전대로 `onEnded`다.
  const stopRequestedRef = useRef(false);
  const handlersRef = useRef({
    onActive,
    onEnded,
    onError,
    onSpeakingChange,
    onUserSpeakingChange,
    onTranscriptTurn,
    readTranscript,
    onScammerTurnComplete,
    onModelToolVerifyAnnounced,
    onModelToolVerifyFailed,
    onConfirmResultInstruction,
    onContextTurnDelivered,
    claimVerifyAnnounceSlot,
    releaseVerifyAnnounceSlot,
    getSessionUserTurns,
    getPendingInstruction,
    isHangupLatched,
    onScammerHangupAccepted,
    onScammerHangupReady,
    onConnectionLost,
    onScammerSmsClaim,
    onRelayGreetingSent,
  });
  const mutedRef = useRef(muted);
  // 정리 대상들 — 언마운트 시 전부 닫지 않으면 마이크가 계속 열려 있다.
  const cleanupRef = useRef<(() => void) | null>(null);
  // 전환 상태 단언(`personaStateTurn`, turnComplete:false)을 같은 Live 세션에 넣기 위한 참조. 메인
  // effect의 지역 변수 `session`은 밖에서 볼 수 없으므로 연결 직후 여기에 같이 담아 둔다.
  const liveSessionRef = useRef<GeminiLiveSession | null>(null);
  // ⭐ §71.5(G431) — `turnComplete:true` 텍스트 턴(타이핑 · 지시)을 메인 effect의 보류 큐에 넣는 브리지.
  // 3.8은 모델 턴 진행 중에 이 형태를 받으면 생성을 끊으므로, 아래 effect들은 세션에 직접 보내지 않는다.
  // §57.4 D3(G369)의 "타이핑 전사를 음성과 같은 flush 큐(`userBuffer`)에 넣는다"는 이제 큐가 실제로 보낼 때
  // (`sendClientTurn`) 지킨다 — 예전 `appendUserTranscriptRef` 브리지는 그래서 없앴다.
  const requestClientTurnRef = useRef<((turn: ClientTurn) => void) | null>(null);
  // ⭐ §82.4(T1) — 문자 · 확인 권유 안내를 맥락 주입(`turnComplete:false`)으로 넣는 브리지. 응답 대기 큐(§71.5)를
  // 점유하지 않으며, 문자 안내면 침묵 넛지(§82.4.2 · G543) 대기를 건다.
  const injectContextRef = useRef<((text: string, delivery: InstructionDelivery) => boolean) | null>(null);
  // PR-A2 리뷰 Minor 1 — 세션이 없어 아직 못 보낸 맥락 주입 슬롯(연결 직후 1회 보낸다).
  const pendingContextTurnRef = useRef<{
    text: string;
    seq: number;
    delivery: "confirmResult" | "verifyReconnectFailed" | "chatDuringCall" | "landingSubmitted" | "installConsented" | "screenStatus";
  } | null>(null);

  useEffect(() => {
    handlersRef.current = {
      onActive,
      onEnded,
      onError,
      onSpeakingChange,
      onUserSpeakingChange,
      onTranscriptTurn,
      readTranscript,
      onScammerTurnComplete,
      onModelToolVerifyAnnounced,
      onModelToolVerifyFailed,
      onConfirmResultInstruction,
      onContextTurnDelivered,
      claimVerifyAnnounceSlot,
      releaseVerifyAnnounceSlot,
      getSessionUserTurns,
      getPendingInstruction,
      isHangupLatched,
      onScammerHangupAccepted,
      onScammerHangupReady,
      onConnectionLost,
      onScammerSmsClaim,
      onRelayGreetingSent,
    };
  }, [
    onActive,
    onEnded,
    onError,
    onSpeakingChange,
    onUserSpeakingChange,
    onTranscriptTurn,
    readTranscript,
    onScammerTurnComplete,
    onModelToolVerifyAnnounced,
    onModelToolVerifyFailed,
    onConfirmResultInstruction,
    onContextTurnDelivered,
    claimVerifyAnnounceSlot,
    releaseVerifyAnnounceSlot,
    getSessionUserTurns,
    getPendingInstruction,
    isHangupLatched,
    onScammerHangupAccepted,
    onScammerHangupReady,
    onConnectionLost,
    onScammerSmsClaim,
    onRelayGreetingSent,
  ]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // ⭐ T190-3(G455) — 음량 모드 브리지. 메인 effect의 지역 게인 노드를 밖에서 볼 수 있게 ref로 올려 두고(연결 직후
  // 담는다), prop이 바뀌면 그 노드의 게인을 바꾼다. 초기화 줄(`outputGain.gain.value = GEMINI_OUTPUT_GAIN;` — G433)은
  // 그대로 두고, 연결 시점에 이미 다른 모드가 골라져 있으면 그 직후 이 ref 값으로 맞춘다.
  // §105 · §108 — 스피커 모드면 압축 + 보정 게인으로 키운다(`liveStageFor` — 아래 리미터가 클리핑을 막는다).
  const outputVolumeRef = useRef(liveStageFor(outputVolume ?? GEMINI_OUTPUT_GAIN));
  const outputGainNodeRef = useRef<GainNode | null>(null);
  const speakerDynamicsRef = useRef<{ compressor: DynamicsCompressorNode; makeup: GainNode } | null>(null);
  // §126 — '통화' 스트림 감쇠 노드와 이번 통화의 감쇠값(`callStreamTrimFor`). 통화 모드에서만 깎는다(`trimGainFor`).
  const streamTrimNodeRef = useRef<GainNode | null>(null);
  const streamTrimRef = useRef(1);
  // §135 진단 — 사기범이 말하는 중인가(반이중 게이트 값의 사본). effect 밖의 상태 단언 전송이 `cut.ctx`를 세는 데만 읽는다.
  const agentSpeakingRef = useRef(false);
  useEffect(() => {
    outputVolumeRef.current = liveStageFor(outputVolume ?? GEMINI_OUTPUT_GAIN);
    const node = outputGainNodeRef.current;
    if (node) node.gain.setTargetAtTime(outputVolumeRef.current.gain, node.context.currentTime, 0.03);
    const dynamics = speakerDynamicsRef.current;
    if (dynamics) applySpeakerDynamics(dynamics, outputVolumeRef.current);
    const trimNode = streamTrimNodeRef.current;
    if (trimNode) {
      trimNode.gain.setTargetAtTime(trimGainFor(outputVolumeRef.current, streamTrimRef.current), trimNode.context.currentTime, 0.03);
    }
  }, [outputVolume]);

  // startedRef로 재실행을 막지 않는다(2026-07-23) — React Strict Mode(dev)는 mount→cleanup→mount를
  // 하는데, startedRef가 있으면 재mount 때 연결을 건너뛰어 "연결하는 중"에 갇힌다. 대신 각 실행이
  // 자기 cancelled 플래그로 정리하므로, 버려지는 첫 실행은 connect 전에 취소되고(토큰 소모 없음)
  // 진짜 실행이 새로 연결한다.
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    // 받기 때 연 마이크 요청(연결과 병렬) — 연결이 실패하거나 취소돼 아직 `stream`에 담기 전이어도 cleanup이 닫는다.
    let pendingMic: Promise<MediaStream | null> | null = null;
    let inputContext: AudioContext | null = null;
    let outputContext: AudioContext | null = null;
    // §71.7(G433) — AI 음성은 이 게인 노드를 거쳐 스피커로 나간다(예전엔 destination 직결 = 최대 음량).
    let outputGain: GainNode | null = null;
    // §114 — 사기범 음성 라우드니스 정규화 상태(이 통화의 말소리 누적 측정 · 직전 게인). 출력 게인 · 스피커 증폭보다 **앞**이다.
    let loudness: LoudnessState = INITIAL_LOUDNESS_STATE;
    let limiterNodes: AudioNode[] = [];
    // §137 · §141 — `?outelement=1`일 때만 최종 노드를 숨긴 `<audio>`로 내보낸다(`callAudio.ts` 표 E1~E4). 기본은 null(`ctx.destination` — 목소리 변조 0).
    let outputSink: { release: () => void } | null = null;
    let processor: ScriptProcessorNode | null = null;
    // 수정안 A — 통화 화면에서 빌린 컨텍스트인가(빌린 것은 닫지 않고 우리가 붙인 노드만 뗀다).
    let outputBorrowed = false;
    let inputBorrowed = false;
    let micSourceNode: MediaStreamAudioSourceNode | null = null;
    let silenceNode: GainNode | null = null;
    let session: GeminiLiveSession | null = null;
    // ⭐ §140 — 조용한 재연결(같은 토큰으로 핸들 없이 새 연결 · 판정표 `liveResume.ts`). 연결 세대(`liveGeneration`)가 바뀌면 옛 연결의
    // 콜백은 아무것도 하지 않는다. 다시 연결하는 동안(`resumeInFlight`)에는 `session`이 null이다 — 그 사이 나가려던 텍스트 턴은
    // `turnsAwaitingResume`에 쥐었다가 새 연결로 보내고, 도구 응답은 `resumeInFlight`를 기다렸다가 보낸다.
    let liveGeneration = 0;
    let resumeHandle: string | null = null;
    let liveResumeCount = 0;
    let firstOpenAtMs: number | null = null;
    let resumeInFlight: Promise<boolean> | null = null;
    let goAwayPending = false;
    const turnsAwaitingResume: ClientTurn[] = [];
    // §140 판정표 4 — 이 연결이 내보낸 전사(부모 전사가 없을 때 쓴다).
    const instanceTurns: SilentResumeTurn[] = [];
    const noteEmittedTurn = (role: "user" | "scammer", text: string) => {
      instanceTurns.push({ role, text });
    };
    // 정리(끊기 · 언마운트 · 연결 실패)가 돌았다 — 그 뒤 끝난 재연결 시도는 새 연결을 닫고 버린다.
    let torndown = false;
    // goAway 재판정(아래 IIFE가 채운다 — turnComplete에서 부른다).
    let recheckGoAway: () => void = () => {};
    // 받은 오디오를 이어붙일 다음 재생 시작 시각(출력 컨텍스트 시간축 기준).
    let nextPlayTime = 0;
    // 현재 예약/재생 중인 오디오 소스들 — interrupted 시 이걸 전부 멈추지 않으면 이전 응답의
    // 남은 소리 위에 새 응답이 겹쳐 나와 "다른 AI가 말하는" 것처럼 들린다(2026-07-23 겹침 버그).
    const scheduledSources = new Set<AudioBufferSourceNode>();
    const stopAllPlayback = () => {
      scheduledSources.forEach((s) => {
        try {
          s.stop();
        } catch {
          // 이미 끝난 소스는 무시.
        }
      });
      scheduledSources.clear();
      nextPlayTime = 0;
    };
    // §137 E2 ~ E4 — 최종 노드 → 스트림 목적지 → 숨긴 `<audio>`. 재생 실패 · 상한 초과면 함수 안에서 즉시 `ctx.destination`으로 되돌린다.
    // 이미 정리된 실행(취소)이면 요소를 만들지 않는다(정리 뒤에 붙은 요소가 문서에 남지 않게).
    const connectFinalToElement = (ctx: AudioContext, finalNode: AudioNode): { release: () => void } | null => {
      if (cancelled) {
        finalNode.connect(ctx.destination);
        return null;
      }
      return connectOutputElementSink({
        source: finalNode,
        context: ctx,
        createElement: createHiddenOutputElement,
        onSink: (sink) => {
          noteOutputSink(sink);
          log("output sink:", sink);
        },
      });
    };
    let speakingTimer: ReturnType<typeof setTimeout> | null = null;
    // 반이중(half-duplex): AI가 말하는 동안엔 마이크 프레임을 보내지 않는다. 스피커→마이크 에코가
    // 민감한 VAD에 사용자 발화로 오인돼 AI가 자기 말을 끊는 것을 막는 핵심 장치(에코 제거만으론
    // 노트북 스피커에서 부족). AI 발화가 끝나면(turnComplete/침묵) 다시 열린다.
    let agentSpeaking = false;
    agentSpeakingRef.current = false;
    // 사용자 발화 파형 인디케이터(2026-07-24, 사용자 신고 — "일단 잘 파악하는지 보고 싶다") 상태.
    // cleanup()이 async IIFE 밖에서 정의되므로, raf 핸들을 여기 바깥 스코프에 미리 선언해 둔다
    // (session/processor와 동일한 패턴 — 안에서 값만 대입). RMS 계산·문턱값·off-디바운스 자체는
    // 순수 함수(userSpeechLevel.ts, Major #6 — 브라우저 전용 API가 아니라 별도로 단위 테스트됨)로
    // 분리했고, 여기서는 매 프레임 그 함수에 넘길 상태만 들고 있는다.
    let userSpeechDebounceState = INITIAL_USER_SPEECH_DEBOUNCE_STATE;
    let userLevelRafId: number | null = null;
    // 전사(transcript)는 조각으로 스트리밍되므로 턴이 끝날 때(turnComplete)까지 모았다가 flush한다.
    let userBuffer = "";
    let scammerBuffer = "";
    // ⭐ §117 — 같은 턴 안 도구 호출 앞뒤 두 발화를 문단으로 가른다(판정 = `toolTurnTranscript.ts`). flush마다 초기화.
    let scammerToolBoundary = false;
    // §126 — 이번 사기범 턴에서 "문자를 보냈다" 주장을 이미 알렸는가(턴 경계에서 초기화 · 턴당 1회).
    let smsClaimRaisedThisTurn = false;
    // §116 — 출력 전사에 모델의 영어 사고 문장이 섞이면 그 구간의 재생을 막는다(판정표 `thoughtLeak.ts` G1~G5 · 턴 경계에서 초기화).
    let thoughtGate = INITIAL_THOUGHT_LEAK_GATE_STATE;

    // ⭐ §59.6(reviewer Critical #1) — Live 도구 라우팅이 쓰는 상태.
    // `modelToolScammerTurns`는 부모(session/play/page.tsx)의 `scammerTurnsRef`와 **같은 경계**
    // (turnComplete)에서 증가하는 이 컴포넌트 자체의 사본이다 — `toolCall`은 이 effect의 onmessage
    // 클로저 안에서 **동기적으로** 처리해야 하는데, 부모의 최신 `scammerTurns` state는 prop으로
    // 내려오지 않는다(리렌더 지연). (T191 — 예전 `deliveredSmsIds` Set은 화면이 smsId를 고를 때만 필요했다. 폐기.)
    let modelToolScammerTurns = 0;
    // ⭐ T192 C5(§79.18 (3) ↳ ② · §79.19 (7) · G552 ⓒ) — 예전 지역 사용자 발화 사본은 없앴다. 모델 도구 경로가
    // 서버에 넘기는 사용자 발화 수는 이제 부모 누적값(`getSessionUserTurns` — 같은 flush에서 오른다 · leg 재마운트에도 유지)
    // + 응답 중 발화 1이다. `send_prepared_sms` · `end_call` 두 분기가 **이 함수 하나**를 쓴다(오늘 동작 변화 0 — §79.18 끝).
    const claimedUserTurns = () => handlersRef.current.getSessionUserTurns() + (userBuffer.trim() ? 1 : 0);
    // ⭐ T192 C5(§79.8 R4 · R5 · G510) — 승인 뒤 마지막 대사 대기. 래치가 아니라 **대기 진행 상태**다(래치는 부모 소유).
    //   "idle" → 승인 응답 전송 → "awaitingTurnEnd"(첫 turnComplete · 끼어들기 · close · 상한 8초) → "draining"(잔여 재생 + 꼬리)
    //   → 준비 신호 1회 → "done". 전체 상한 15초(`HANGUP_DRAIN_CAP_MS`)가 어느 단계에서든 준비 신호를 낸다.
    let hangupDrain: "idle" | "awaitingTurnEnd" | "draining" | "done" = "idle";
    let hangupFinalTurnTimer: ReturnType<typeof setTimeout> | null = null;
    let hangupDrainTimer: ReturnType<typeof setTimeout> | null = null;
    let hangupCapTimer: ReturnType<typeof setTimeout> | null = null;
    const clearHangupTimers = () => {
      if (hangupFinalTurnTimer) clearTimeout(hangupFinalTurnTimer);
      if (hangupDrainTimer) clearTimeout(hangupDrainTimer);
      if (hangupCapTimer) clearTimeout(hangupCapTimer);
      hangupFinalTurnTimer = null;
      hangupDrainTimer = null;
      hangupCapTimer = null;
    };
    const signalHangupReady = () => {
      if (hangupDrain === "done") return;
      hangupDrain = "done";
      clearHangupTimers();
      if (!cancelled) handlersRef.current.onScammerHangupReady();
    };
    // R4 → R5 — 잔여 재생 `max(0, nextPlayTime − currentTime)` + 꼬리 뒤 준비 신호(재생 도중 절단 0 — AC-103 (c)).
    const beginHangupDrain = () => {
      if (hangupDrain !== "awaitingTurnEnd") return;
      hangupDrain = "draining";
      if (hangupFinalTurnTimer) clearTimeout(hangupFinalTurnTimer);
      hangupFinalTurnTimer = null;
      const remainingMs = outputContext ? (nextPlayTime - outputContext.currentTime) * 1000 : 0;
      hangupDrainTimer = setTimeout(signalHangupReady, hangupDrainDelayMs(remainingMs));
    };
    // R2 이후 · 응답 전송 직후에 건다(`toolCall` 처리부).
    // 이번 배치에서 끊기가 승인됐는가 — 응답 전송 직후 R4를 걸지 정하는 1회용 표시(래치 아님 · 래치는 부모 소유).
    let armDrainAfterSend = false;
    // PR-A2(audit-A R1) — 이번 배치의 `send_prepared_sms`가 받은 서버 결과 신호. 도구 응답 전송 뒤 1회 부모에 넘기고 비운다.
    let confirmResultAfterToolResponse: string | null = null;
    const armHangupDrain = () => {
      if (hangupDrain !== "idle") return;
      hangupDrain = "awaitingTurnEnd";
      hangupFinalTurnTimer = setTimeout(beginHangupDrain, HANGUP_FINAL_TURN_CAP_MS);
      hangupCapTimer = setTimeout(signalHangupReady, HANGUP_DRAIN_CAP_MS);
    };
    // ⭐ §82.3.4 N1(G539) — 직전 사기범 턴 경계 이후 모델 오디오 · 사기범 전사가 있었는가. 둘 다 없는
    // `turnComplete`(끼어들기 직후의 빈 마감 — S1 3/3)는 경계가 아니다. 끼어들기에서는 지우지 않는다 —
    // 끊긴 턴의 내용은 그 뒤 마감에 귀속된다.
    let audioSinceBoundary = false;
    let scammerTextSinceBoundary = false;

    /**
     * §59.6 ②~⑥ — 도구 이름을 실제 콜러블로 라우팅하고, 호출 결과(또는 실패)를 모델에게 돌려줄
     * `{status, guidance}` 응답으로 변환한다. **`sendToolResponse`가 생략되는 경로는 없다**(G390)
     * — 모든 분기가 반드시 응답 객체를 반환한다(unsupported·성공·거절·실패 전부).
     */
    const dispatchToolCall = async (
      call: { id?: string; name?: string; args?: unknown },
      // T192 C5(G555) — 같은 `toolCall` 배치 전체(`end_call` 판정의 배치 항). 다른 분기는 읽지 않는다.
      batch: readonly LiveToolFunctionCall[],
    ): Promise<{ id?: string; name: string; response: { status: string; guidance?: string } }> => {
      const liveTools = credentials.liveTools;
      const kind = resolveToolCallKind(call.name, liveTools);
      if (kind === "unsupported" || !liveTools) {
        return buildUnsupportedToolResponses([call])[0];
      }
      // §59.6 "실패(콜러블이 아예 닿지 않음)" 행 — 서버가 내려준 문면 1종을 그대로 쓴다(G386,
      // 클라가 한국어 문자열을 새로 저작하지 않는다). `liveTools.failureInstruction`은 `LiveTools`
      // 타입상 필수 필드라 여기서는 항상 존재한다(위 `if (!liveTools)`로 이미 걸러졌다).
      const failureResponse = () => ({
        id: call.id,
        name: call.name ?? "unknown",
        response: { status: "unavailable", guidance: liveTools.failureInstruction },
      });

      // ⭐ T192 C5(§79.8 R1 · R2 · R3 · G504 · G555) — 사기범 끊기. 판정은 서버(`requestScammerHangup` — 폴백과 같은 판정표)이고
      // 화면은 판정 입력 2개(사용자 발화 수 · 클라 지시 대기)와 모델 인자만 넘긴다. 문면은 전부 서버 소유(G386 · G516).
      if (kind === "end_call") {
        // 클라 항 = 부모 지시 대기 ∨ 같은 배치의 다른 호출. ⛔ 큐의 `toolPending`은 읽지 않는다(자기 자신이 도구 대기 — G555 ⓐ).
        const pendingInstruction =
          handlersRef.current.getPendingInstruction() || endCallBatchHasOtherCalls(batch, liveTools);
        try {
          const result = await requestScammerHangup({
            sessionId,
            userTurns: claimedUserTurns(),
            pendingInstruction,
            kind: readEndCallReasonArg(call.args),
          });
          if (result.status === "accepted" || result.status === "already_accepted") {
            // R2 — 응답 전송 **전에** 부모 래치를 건다(마이크 · 클라 텍스트 턴 · 침묵 넛지가 즉시 멈춘다 — G510).
            handlersRef.current.onScammerHangupAccepted();
            armDrainAfterSend = true;
          }
          return {
            id: call.id,
            name: call.name ?? "unknown",
            response: { status: result.status, guidance: result.guidance },
          };
        } catch {
          // G504 — 콜러블이 닿지 않아도 응답을 생략하지 않는다. 끊기 전용 실패 문면(서버 소유 · 쌍으로 내려온다).
          return {
            id: call.id,
            name: call.name ?? "unknown",
            response: {
              status: "unavailable",
              guidance: liveTools.endCallFailureInstruction ?? liveTools.failureInstruction,
            },
          };
        }
      }

      if (kind === "send_prepared_sms") {
        // ⭐ T191(문자 도달 조건 · AC-099 (b)) — 모델이 고른 목적을 그대로 넘기고 판정은 서버가 한다(선언 · 간격 ·
        // 이미 보냄 — `resolveSmsGate`). 화면은 smsId를 고르지 않는다(예전 `pickModelToolSmsId` 폐기).
        try {
          const result = await deliverInCallSms({
            sessionId,
            purpose: readSmsPurposeArg(call.args),
            // ⭐ 리뷰 ⑥ — 도구 호출은 모델이 **사용자 발화 N에 답하는 도중**에 온다. 그 발화의 전사는 아직 `userBuffer`에
            // 있고 flush(`turnComplete`)되지 않았으므로 flush 수만 보내면 폴백(이번 발화 포함)보다 1 작다. §82.3.4는
            // 카운터를 "flush 수"로 정의했지만 시점을 정하지 않았다 — 3경로 동일(AC-099 (f))을 위해 응답 중인 발화를 더한다.
            userTurns: claimedUserTurns(),
            scammerTranscriptTurns: modelToolScammerTurns,
            trigger: "model_tool",
          });
          // PR-A2(audit-A R1) — 서버 결과 신호는 도구 응답에 섞지 않고, 응답을 **보낸 뒤** 부모에 넘긴다(아래 `toolCall` 처리부).
          if (result.status === "delivered" && result.confirmResultInstruction) {
            confirmResultAfterToolResponse = result.confirmResultInstruction;
          }
          return {
            id: call.id,
            name: call.name ?? "unknown",
            response: {
              status: result.status,
              guidance:
                result.status === "delivered" ? result.announceInstruction : result.declineInstruction,
            },
          };
        } catch {
          // ⚠️ **G390(콜러블이 던지든 네트워크가 끊기든 반드시 응답을 보낸다)** — 서버가 이미 저작해 둔
          // `failureInstruction`을 그대로 돌려준다(통화를 막지 않는다 — P-4). 문자 백스톱은 서버 도착 기록으로
          // 판정하므로 이 실패를 부모에게 따로 알리지 않는다(T191).
          return failureResponse();
        }
      }

      // kind === "offer_verification_desk" — §59.6은 announce 단계만 이 경로로 태운다. commit
      // 단계(문서 실제 생성, §38.4 후보 E)는 여전히 부모(session/play/page.tsx)의 기존 이펙트가
      // 사기범 턴 경계를 관측해 진다 — 그 배선은 이번 수정으로 0줄도 건드리지 않는다(범위 밖,
      // §59.10 커밋 D의 몫).
      // ⚠️ **정정(§59 Critical 수정, reviewer REJECTED)** — 예전 주석은 "announce는 문서를 쓰지
      // 않는 멱등 단계라 두 경로가 동시에 존재해도 경합이 생기지 않는다"고 적었는데 **틀렸다**:
      // `persist:false`는 맞지만 `placed===false`인 한 몇 번을 불러도 서버는 **무조건**
      // `includeInstruction:true`를 돌려준다(멱등 = 같은 결과를 반복해도 안전, 이 경우는 결과가
      // "말하라"는 지시라서 반복하면 실제로 중복 서술이 난다). 그래서 서버 응답이 아니라 요청을
      // **보내기 전에** 클라가 부모와 공유하는 슬롯(`verifyAnnounceGuard.ts`)으로 막는다.
      if (!handlersRef.current.claimVerifyAnnounceSlot()) {
        // 백스톱 경로(부모)가 이미 같은 announce를 요청 중이다 — 서버를 다시 부르지 않는다.
        // `already_announced`는 서버가 실제로 쓰는 상태값(`DeliverVerifyOfferStatus`)을 그대로
        // 재사용한 것 — 모델 입장에서도 "이미 처리 중/처리됨"이라는 뜻이 정확히 같다.
        // ⭐ §59.6 갱신 2(G394) — 상태값만 돌려주면 BLOCKING 도구가 억제 근거 없이 모델 턴을
        // 재개시킨다. `guidance`(=liveTools.verifyAlreadyAnnouncedInstruction, 서버
        // VERIFY_DECLINE_ALREADY의 사본)를 순수 함수로 함께 실어 돌려준다.
        return buildAlreadyAnnouncedToolResponse(call, liveTools);
      }
      try {
        const result = await deliverVerifyOffer({
          sessionId,
          callMode: "realtime",
          scammerTurns: modelToolScammerTurns,
          stage: "announce",
          trigger: "model_tool",
        });
        if (result.status === "announced") {
          // §59.10 커밋 D — 부모의 `verifyOfferPhaseRef`를 전진시켜야 commit 단계(문서 실제 생성)가
          // 이어진다. 이 announce 성공은 이 컴포넌트의 클로저 밖(부모 state machine)이라 콜백으로
          // 알리는 수밖에 없다 — announce는 문서를 쓰지 않아(§38.4 후보 E) Firestore 구독으로는
          // 관측되지 않는다(§59.10 커밋 C 리뷰 수정 주석이 이 배선을 "커밋 D의 몫"으로 인계한 지점).
          handlersRef.current.onModelToolVerifyAnnounced?.();
        }
        return {
          id: call.id,
          name: call.name ?? "unknown",
          response: {
            status: result.status,
            guidance:
              result.status === "announced" ? result.announceInstruction : result.declineInstruction,
          },
        };
      } catch {
        // §59.10 커밋 D(G390) — 백스톱이 즉시 닫히도록 부모에게 실패를 알린다(SMS와 동형).
        handlersRef.current.onModelToolVerifyFailed?.();
        return failureResponse();
      } finally {
        // ⭐ §59 Critical 수정 — 위에서 클레임에 성공했을 때만 이 finally에 도달한다(클레임
        // 실패는 그 자리에서 이미 return했다) — 성공·실패 무관하게 슬롯을 되돌려 백스톱 경로의
        // 다음 시도를 막지 않는다.
        handlersRef.current.releaseVerifyAnnounceSlot();
      }
    };

    // §57.4 D3 — 음성 입력(`inputTranscription`)과 타이핑 입력(§71.5 보류 큐의 `sendClientTurn`이
    // 실제로 보낼 때)이 **같은 자리**에 적립되도록 모은 함수. 기존 `userBuffer +=`
    // 자리도 이 함수를 거치게 해 적립 규칙을 한 곳에 둔다.
    const appendUserBuffer = (text: string) => {
      userBuffer += text;
      reportTurnPhase();
    };

    const flushTranscript = () => {
      const u = userBuffer.trim();
      // §116 — 사기범 전사만 사고 문장을 지운다(판정표 행 1~4 · 참가자 발화는 원문).
      const s = stripLeakedThought(scammerBuffer).trim();
      if (u) {
        handlersRef.current.onTranscriptTurn("user", u);
        noteEmittedTurn("user", u);
      }
      if (s) {
        // ⭐ §82.3.4(G539) — 부모의 `scammerTurnsRef`(비어 있지 않은 사기범 전사 flush 수)와 **같은 지점**.
        modelToolScammerTurns += 1;
        handlersRef.current.onTranscriptTurn("scammer", s);
        noteEmittedTurn("scammer", s);
      }
      userBuffer = "";
      scammerBuffer = "";
      scammerToolBoundary = false;
      smsClaimRaisedThisTurn = false;
      reportTurnPhase();
    };

    // 끼어들기(interrupted)로 모델이 문장 중간에 멈췄을 때 **사기범 조각만** 내보낸다.
    //
    // 왜 flushTranscript()가 아닌가(2026-07-25 수정): interrupted 처리에 early return이 있어
    // scammerBuffer가 flush도 clear도 되지 않고 남았고, 그 조각이 **다음 사기범 말풍선 앞에 그대로
    // 붙었다.** 리포트 분석은 `scammer(i)` ↔ `user(i+1)` 짝짓기에 의존하므로(analyzeConversation),
    // 턴 경계가 밀리면 "속은 순간"이 엉뚱한 턴을 가리킨다.
    //
    // 그렇다고 flushTranscript()로 둘 다 내보내면 안 된다 — interrupted 시점은 **사용자가 막 말을
    // 시작한 순간**이라 userBuffer는 아직 채워지는 중이다. 둘 다 내보내면 emit 순서상 사용자 턴이
    // 사기범의 잘린 턴보다 **앞에** 기록돼 시간 순서가 뒤집힌다. 사용자 조각은 그대로 두고 다음
    // turnComplete에서 정상적으로 flush되게 한다.
    const flushScammerTurn = () => {
      const s = stripLeakedThought(scammerBuffer).trim();
      if (s) {
        // §82.3.4 — 끊긴 조각 flush도 사기범 전사 턴이다(`messages`에 문서 1개로 남는다).
        modelToolScammerTurns += 1;
        handlersRef.current.onTranscriptTurn("scammer", s);
        noteEmittedTurn("scammer", s);
      }
      scammerBuffer = "";
      scammerToolBoundary = false;
      smsClaimRaisedThisTurn = false;
    };

    // ⭐ §71.6 — 지연 계측 상태(순수 함수 `liveLatency.ts`가 전이를 소유한다). 모델 턴이 닫힐 때마다
    // 레코드 1개를 받아 한 줄 남기고, 통화가 끝나면 요약 1줄을 남긴다.
    let latencyState = INITIAL_LIVE_LATENCY_STATE;
    const latencyRecords: LiveLatencyTurnRecord[] = [];
    let latencySummaryLogged = false;
    const closeLatencyTurn = (endedBy: TurnEndReason) => {
      const out = noteTurnEnd(latencyState, { nowMs: performance.now(), endedBy });
      latencyState = out.state;
      if (out.record) {
        latencyRecords.push(out.record);
        logLatency(formatLatencyLine(credentials.geminiModel, out.record));
      }
    };
    // 이 통화의 첫 오디오 청크에서 한 번만 true — 그때 준비 구간(setup) 레코드를 남긴다(§50.10 P-0).
    let firstAudioMarked = false;
    const markOpeningFirstAudio = (nowMs: number): boolean => {
      if (firstAudioMarked) return false;
      firstAudioMarked = true;
      markCallSetup("firstAudio", nowMs);
      return true;
    };
    const logLatencySummary = () => {
      if (latencySummaryLogged || latencyRecords.length === 0) return;
      latencySummaryLogged = true;
      logLatency(formatLatencyLine(credentials.geminiModel, summarizeLatency(latencyRecords)));
    };

    // ⭐⭐ §71.5(G431) — `turnComplete:true` 텍스트 턴 보류 큐. 3.8은 모델 턴 진행 중 이 형태를 받으면
    // 생성을 끊는다(2026-10-17 프로브: 77ms 뒤 interrupted). 2.5가 서버에서 하던 "턴 끝까지 보류"를 여기서
    // 재현한다. ⛔ 이 파일에서 `turnComplete: true` 전송은 아래 `sendClientTurn` **한 곳뿐**이어야 한다
    // (`clientTurnQueueWiring.test.ts`가 소스로 고정한다).
    let clientTurnState = INITIAL_CLIENT_TURN_QUEUE_STATE;
    // ⭐ §105.2.6 — "말했는데 서버가 못 들음" 화면 쪽 보완 상태(판정 = `unheardReply.ts` 판정표).
    let unheardReplyState = INITIAL_UNHEARD_REPLY_STATE;
    // ⭐ 리뷰 M2 — 화면 소유 ref에 현재 턴 위상을 써 넣는다(큐 상태 · 사용자 버퍼가 바뀔 때마다).
    const reportTurnPhase = () => {
      if (!turnPhaseRef) return;
      turnPhaseRef.current = {
        modelResponding: clientTurnState.modelTurnActive || clientTurnState.awaitingSince !== null,
        userSpeechBuffered: userBuffer.trim().length > 0,
      };
    };
    // §82.4.2(G543) — 참가자 발화(음성 전사 조각 · 타이핑 전송) = 침묵 넛지 취소. 아래 넛지 상태를 쓴다(호출은 연결 뒤).
    const noteUserSpeechForNudge = () => {
      silenceNudgeState = stepSilenceNudge(silenceNudgeState, { type: "userSpeech", nowMs: performance.now() }).state;
      if (silenceNudgeState.armedAt === null) clearSilenceNudgeTimer();
      // PR-A2(F6) — 대기 뒤 침묵 넛지도 취소하고 넛지 이력을 초기화한다(참가자가 말했으니 다음 침묵에 다시 1회 가능).
      stallNudgeState = stepStallNudge(stallNudgeState, { type: "userSpeech", nowMs: performance.now() }).state;
      clearStallNudgeTimer();
    };
    let clientTurnTick: ReturnType<typeof setTimeout> | null = null;
    const sendClientTurn = (turn: ClientTurn) => {
      const activeSession = session;
      if (!activeSession) {
        // §140 — 조용한 재연결 중이면 버리지 않고 새 연결로 보낸다(타이핑이 그 1초 사이에 사라지지 않게).
        if (resumeInFlight) turnsAwaitingResume.push(turn);
        return;
      }
      // ⭐ T192 C5(§79.8 R2 ② · G510) — 승인 · 종료 래치 뒤에는 클라 텍스트 턴(타이핑 · 지시 · 침묵 넛지)을 보내지 않는다.
      // 이 함수가 `turnComplete: true` 전송의 유일한 지점이라(G431) 여기 한 곳에서 막으면 보류분까지 전부 막힌다.
      if (handlersRef.current.isHangupLatched()) return;
      try {
        activeSession.sendClientContent({ turns: turn.text, turnComplete: true });
        const nowMs = performance.now();
        latencyState = noteSentTurn(latencyState, turn.kind, nowMs);
        if (turn.kind === "opening") markCallSetup("openingSent", nowMs);
        // H1(2026-11-01 U1) — 넘김 지시가 실제로 나갔다(라벨 전환 시점).
        if (turn.kind === "relayGreeting") handlersRef.current.onRelayGreetingSent?.();
        // §57.4 D3 — 타이핑 전사는 **실제로 보낸 시점에** 적립한다. 보류 중에 적립하면 그 턴의 flush에서
        // 사용자 문장이 아직 말하던 사기범 문장보다 먼저 기록된다(§71.5).
        if (turn.kind === "text") appendUserBuffer(turn.text.trim());
        // §82.4.2(G543) — 타이핑 전송도 참가자 발화다(침묵 넛지 취소).
        if (turn.kind === "text") noteUserSpeechForNudge();
      } catch {
        // 전송 실패는 무시 — 통화는 계속된다(P-4 비차단). 오프닝이면 사용자가 먼저 말하면 이어진다.
      }
    };
    const dispatchClientTurn = (event: ClientTurnEvent) => {
      const step = stepClientTurnQueue(clientTurnState, event);
      clientTurnState = step.state;
      reportTurnPhase();
      if (step.send) sendClientTurn(step.send);
      // 응답 대기 중이면 타임아웃 점검을 한 번 예약한다(모델이 응답하지 않기로 해도 보류분이 갇히지 않게).
      if (clientTurnTick) clearTimeout(clientTurnTick);
      clientTurnTick = null;
      if (clientTurnState.awaitingSince !== null && clientTurnState.pending.length > 0) {
        clientTurnTick = setTimeout(() => {
          if (!cancelled) dispatchClientTurn({ type: "tick", nowMs: performance.now() });
        }, AWAIT_RESPONSE_TIMEOUT_MS);
      }
    };

    // ⭐⭐ §82.4(T1) — 맥락 주입 + 침묵 넛지. 문자 · 확인 권유 안내는 `turnComplete:false`로 **즉시** 넣는다
    // (§82.4.1 A안 — 응답 유발 0/2 · 다음 응답 반영 2/2, S1 §3.2). 응답을 유발하지 않으므로 §71.5 응답 대기 큐에
    // 넣지 않는다(넣으면 다음 보류분이 오지 않을 응답을 기다린다). ⛔ X5 — 이 두 안내를 `turnComplete:true`로 보내지 않는다.
    // 침묵 넛지: 문자 안내 뒤 8초 동안 참가자 발화가 없고 모델이 유휴면 `silence` 텍스트 턴 1회(판정 = 순수 함수).
    let silenceNudgeState = INITIAL_SILENCE_NUDGE_STATE;
    let silenceNudgeTimer: ReturnType<typeof setTimeout> | null = null;
    const clearSilenceNudgeTimer = () => {
      if (silenceNudgeTimer) clearTimeout(silenceNudgeTimer);
      silenceNudgeTimer = null;
    };
    const runSilenceNudgeCheck = () => {
      silenceNudgeTimer = null;
      // T192 C5(G510) — 승인 뒤 침묵 넛지 0(대기 자체를 끝낸다).
      if (handlersRef.current.isHangupLatched()) return;
      // §99 — 화면이 가려진 동안의 침묵은 참가자의 침묵이 아니다(마이크가 무음) — 넛지를 미루고 다시 본다.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        silenceNudgeTimer = setTimeout(() => {
          if (!cancelled) runSilenceNudgeCheck();
        }, SILENCE_NUDGE_RECHECK_MS);
        return;
      }
      const nowMs = performance.now();
      const armedAt = silenceNudgeState.armedAt;
      const step = stepSilenceNudge(silenceNudgeState, {
        type: "tick",
        nowMs,
        modelIdle:
          !clientTurnState.modelTurnActive &&
          clientTurnState.awaitingSince === null &&
          !clientTurnState.toolPending,
        // 리뷰 M3 — 참가자가 말하는 중(로컬 입력 레벨 임계 초과)이면 보류한다. 반이중 게이트와 같은 신호다.
        userSpeakingLocally: userSpeechDebounceState.speaking,
      });
      silenceNudgeState = step.state;
      if (step.fire) {
        console.info(LIVE_TURN_LOG_PREFIX, formatSilenceNudgeLog({ sinceInjectionMs: nowMs - (armedAt ?? nowMs) }));
        dispatchClientTurn({ type: "request", turn: { kind: "silence", text: SILENCE_NUDGE_TEXT }, nowMs });
        return;
      }
      if (silenceNudgeState.armedAt !== null) {
        silenceNudgeTimer = setTimeout(() => {
          if (!cancelled) runSilenceNudgeCheck();
        }, SILENCE_NUDGE_RECHECK_MS);
      }
    };
    // PR-A2 리뷰 Minor 1 — 실제로 보냈는지 돌려준다(맥락 주입 슬롯이 미전달분을 연결 뒤 다시 보내는 판단에 쓴다).
    const injectContext = (text: string, delivery: InstructionDelivery): boolean => {
      const activeSession = session;
      if (!activeSession) return false;
      try {
        if (agentSpeaking) noteContextWhileSpeaking(); // §135 진단
        activeSession.sendClientContent({ turns: text, turnComplete: false });
      } catch {
        // 무시 — 통화는 계속된다(P-4 비차단). 문자 자체는 이미 화면에 도착해 있다(D-109).
        return false;
      }
      log("contextInjection", delivery, text.slice(0, 12));
      silenceNudgeState = stepSilenceNudge(silenceNudgeState, {
        type: "injected",
        delivery,
        nowMs: performance.now(),
      }).state;
      if (silenceNudgeState.armedAt !== null) {
        clearSilenceNudgeTimer();
        silenceNudgeTimer = setTimeout(() => {
          if (!cancelled) runSilenceNudgeCheck();
        }, SMS_MENTION_SILENCE_SEC * 1000);
      }
      return true;
    };

    // ⭐ PR-A2(F6 · audit-A R6) — 대기 · 확인 중 뒤 침묵 넛지. 사기범 턴이 "확인 중 · 기다려 주세요"로 끝났는데 참가자가
    // 침묵하면 Live 모델은 아무 말도 하지 않는다(재현 3/3). 그 대기 턴 뒤 8초 침묵 · 모델 유휴면 "결과를 제시하고 다음 단계로"
    // `silence` 텍스트 턴 1회(참가자가 다시 말할 때까지 재발동 0). 판정은 순수 함수(`stallRecovery.ts`). 끊기 경로와 무관하다.
    let stallNudgeState = INITIAL_STALL_NUDGE_STATE;
    let stallNudgeTimer: ReturnType<typeof setTimeout> | null = null;
    const clearStallNudgeTimer = () => {
      if (stallNudgeTimer) clearTimeout(stallNudgeTimer);
      stallNudgeTimer = null;
    };
    const runStallNudgeCheck = () => {
      stallNudgeTimer = null;
      // G510 — 승인 · 종료 래치 뒤 넛지 0.
      if (handlersRef.current.isHangupLatched()) return;
      // §99 — 가려진 동안에는 미룬다(위 침묵 넛지와 같은 이유).
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        stallNudgeTimer = setTimeout(() => {
          if (!cancelled) runStallNudgeCheck();
        }, SILENCE_NUDGE_RECHECK_MS);
        return;
      }
      const nowMs = performance.now();
      const armedAt = stallNudgeState.armedAt;
      const step = stepStallNudge(stallNudgeState, {
        type: "tick",
        nowMs,
        modelIdle:
          !clientTurnState.modelTurnActive &&
          clientTurnState.awaitingSince === null &&
          !clientTurnState.toolPending,
        userSpeakingLocally: userSpeechDebounceState.speaking,
        otherNudgeArmed: silenceNudgeState.armedAt !== null,
      });
      stallNudgeState = step.state;
      if (step.fire) {
        console.info(LIVE_TURN_LOG_PREFIX, formatStallNudgeLog({ sinceScammerTurnMs: nowMs - (armedAt ?? nowMs) }));
        dispatchClientTurn({ type: "request", turn: { kind: "silence", text: STALL_NUDGE_TEXT }, nowMs });
        return;
      }
      if (stallNudgeState.armedAt !== null) {
        stallNudgeTimer = setTimeout(() => {
          if (!cancelled) runStallNudgeCheck();
        }, SILENCE_NUDGE_RECHECK_MS);
      }
    };
    // ⭐ §104(전수 검수 2차 F4 · F11) — 직전 두 사기범 턴이 대기 말 · 같은 인적사항 요구 · 거의 같은 말이면 맥락 1줄(`turnComplete:false`).
    // 위 넛지는 참가자가 침묵할 때만 나가므로, 참가자가 말하는 사이사이 반복되는 "대기해 주십시오"는 이 판정이 맡는다(판정표 `stallRecovery.ts` §4).
    let previousScammerTurnText: string | undefined;
    const noteScammerTurnForRepeatBreak = (scammerText: string, participantText: string) => {
      const kind = decideLiveRepeatBreak({
        previousScammerTurn: previousScammerTurnText,
        scammerTurn: scammerText,
        // §104 — 이 턴이 답한 참가자 발화(자금 소진 선언 2-b행). 비었으면 판정하지 않는다.
        ...(participantText.trim() ? { lastParticipantText: participantText } : {}),
        latched: handlersRef.current.isHangupLatched(),
        participantHasSpoken: handlersRef.current.getSessionUserTurns() > 0,
      });
      previousScammerTurnText = scammerText;
      if (kind && injectContext(LIVE_REPEAT_BREAK_TEXT[kind], "repeatBreak")) {
        console.info(LIVE_TURN_LOG_PREFIX, formatLiveRepeatBreakLog(kind));
      }
    };
    /** 비어 있지 않은 사기범 턴 경계마다 1회(`turnComplete` 처리부) — 그 턴의 전사로 대기 여부를 정한다. */
    const noteScammerTurnForStallNudge = (scammerText: string) => {
      stallNudgeState = stepStallNudge(stallNudgeState, {
        type: "scammerTurn",
        nowMs: performance.now(),
        stallLike: isStallLine(scammerText),
        participantHasSpoken: handlersRef.current.getSessionUserTurns() > 0,
      }).state;
      clearStallNudgeTimer();
      if (stallNudgeState.armedAt !== null) {
        stallNudgeTimer = setTimeout(() => {
          if (!cancelled) runStallNudgeCheck();
        }, STALL_SILENCE_SEC * 1000);
      }
    };

    // 자기 말 끊김 버그 수정(2026-07-25, 사용자 신고 "대화가 자연스럽지 않다") — 예전엔 이 타이머가
    // **청크 도착** 시점 기준 고정 600ms였다. Gemini는 오디오를 실시간보다 빠르게 스트리밍하므로
    // (4초짜리 발화의 청크가 1초 만에 다 도착할 수 있다) agentSpeaking이 **재생이 끝나기 한참 전에**
    // false로 떨어졌고, 그 순간 반이중 게이트(`if (agentSpeaking) return`)가 풀려 마이크가 다시
    // 열렸다 — 스피커로 나가던 AI 목소리가 마이크로 되돌아가 Gemini VAD가 이를 사용자 발화로 오인해
    // 자기 말을 스스로 끊는(interrupted) 일이 생길 수 있는 구조였다. 이제 **예약된 재생이 실제로
    // 끝나는 시각**(nextPlayTime) 기준으로 타이머를 잡는다.
    // **2차 수정(2026-07-25, 사용자 신고 "말을 하다가 마는 현상")**: 위 1차 수정으로도 부족했다.
    // 기준을 "청크 도착"에서 "재생 종료"로 옮겼지만, 옳은 기준은 한 칸 더 가서 **"턴 종료"**였다.
    // 모델이 문장 중간에 잠깐 생성을 멈추면(한국어 "혹시…", "저희가…" 같은 연결어 뒤) 예약 재생이
    // 비고, 그 순간 게이트가 열려 방 소음이 VAD에 사용자 발화로 잡혀 모델이 **생성 자체를 중단**했다.
    // 이제 대기 시간 계산을 agentSpeechGate.ts(순수 함수·테스트로 고정)에 위임한다 — 턴 진행 중이면
    // 넉넉히, turnComplete 뒤면 꼬리 재생이 끝날 때까지. 판단 근거와 상수 선택 이유는 그쪽 주석 참고.
    // ⚠️ turnInProgress는 **여기서 직접 뒤집지 않는다.** 이번 메시지의 신호 3개(오디오·turnComplete·
    // interrupted)를 함께 보고 resolveTurnInProgress가 정한다 — turnComplete가 마지막 오디오 청크와
    // 같은 메시지로 오기 때문에(reviewer Critical, agentSpeechGate.ts 주석 참고) 어느 한쪽만 보고
    // 뒤집으면 서로를 덮어쓴다.
    let turnInProgress = false;
    const markSpeaking = () => {
      agentSpeaking = true;
      agentSpeakingRef.current = true;
      handlersRef.current.onSpeakingChange(true);
    };

    // 게이트를 닫을(=마이크를 다시 열) 시각을 다시 잡는다. 청크가 새로 올 때마다, 그리고
    // turnComplete를 받을 때마다 호출된다.
    // ⭐ 사용자 라이브 신고 ④(Architecture.md §50.8.5) — `overrides`는 stopSpeaking()이 창③
    // (interrupted 직후)에서 쓴다. 재생이 이미 멈춘 시점이라 `nextPlayTime`을 그대로 읽으면
    // stopAllPlayback()이 방금 0으로 되돌린 값이 잡히지만, 명시적으로 넘겨 그 의도를 코드에도
    // 남긴다(§50.8.1 창③ — "예약 재생은 멈췄어도 이미 출력 버퍼로 나간 소리는 stop()으로 취소되지
    // 않는다"의 방어).
    const scheduleGateClose = (overrides?: {
      remainingPlaybackMs: number;
      turnInProgress: boolean;
    }) => {
      if (speakingTimer) clearTimeout(speakingTimer);
      const remainingPlaybackMs =
        overrides?.remainingPlaybackMs ??
        (outputContext ? (nextPlayTime - outputContext.currentTime) * 1000 : 0);
      const turnInProgressForDelay = overrides?.turnInProgress ?? turnInProgress;
      const delay = computeGateCloseDelayMs({
        remainingPlaybackMs,
        turnInProgress: turnInProgressForDelay,
      });
      speakingTimer = setTimeout(() => {
        // §71.5 — 턴이 아직 진행 중인데 게이트가 닫혔다 = 서버가 turnComplete 없이 멈췄다(stall). 보류
        // 큐와 지연 계측도 이 턴을 끝난 것으로 본다(안 그러면 보류분이 다음 turnComplete까지 갇힌다).
        const stalled = turnInProgress;
        agentSpeaking = false;
        agentSpeakingRef.current = false;
        turnInProgress = false;
        handlersRef.current.onSpeakingChange(false);
        if (stalled && !cancelled) {
          closeLatencyTurn("stall");
          dispatchClientTurn({ type: "stall", nowMs: performance.now() });
        }
      }, delay);
    };

    // ⭐ 사용자 라이브 신고 ④(Architecture.md §50.8.1 창③, §50.8.5) — **즉시 게이트를 열지
    // 않는다.** 예전에는 interrupted 직후 곧바로 마이크를 열었는데, 예약 재생(scheduledSources)은
    // stop()으로 멈춰도 **이미 출력 버퍼로 나가 스피커에서 물리적으로 재생 중인 소리**는 취소되지
    // 않는다 — 그 잔향이 곧바로 열린 마이크로 되돌아가 새 `interrupted`를 연쇄시킬 수 있었다.
    // `scheduleGateClose`(turnComplete 경로와 같은 함수)를 재사용해 TAIL_GRACE_MS(250ms) 뒤에
    // 연다 — `remainingPlaybackMs: 0`이므로 지연은 정확히 tailGraceMs다.
    // ⛔ `stopAllPlayback()`(호출부에서 이 함수보다 먼저 실행됨)은 그대로 즉시 호출된다 — 겹침
    // 방지는 유지한다.
    const stopSpeaking = () => {
      turnInProgress = false;
      scheduleGateClose({ remainingPlaybackMs: 0, turnInProgress: false });
    };

    // ⭐ §99(화면 꺼짐 신고) — 화면이 가려졌다 돌아오면 오디오 컨텍스트를 다시 깨우고, 마이크 트랙이 끝났거나 음소거로 남았으면
    // 다시 연다. 소켓이 그 사이 닫혔으면 아래 onclose가 `decideSocketClose`로 "다시 연결"을 고른다. 판정은 `backgroundCall.ts`.
    // 숫자 · 상태값만 production 로그에 남긴다(실기 원격 디버깅 — 전사 텍스트 0).
    let wasHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    let hiddenAtMs: number | null = wasHidden ? performance.now() : null;
    let lastVisibleAtMs: number | null = null;
    let connectionLostReported = false;
    let micRecheckTimer: ReturnType<typeof setTimeout> | null = null;
    // 파이프라인이 붙은 뒤에 채워진다(아래 IIFE) — 마이크를 새 스트림으로 갈아 끼운다.
    let replaceMicStream: ((next: MediaStream) => void) | null = null;
    const isHiddenNow = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    const recheckMic = () => {
      micRecheckTimer = null;
      // 리뷰 Minor — 소켓이 이미 끊겨 부모가 다시 잇는 중이면 새 세션이 마이크를 연다(여기서 또 열지 않는다).
      if (cancelled || !replaceMicStream || connectionLostReported) return;
      const track = stream?.getAudioTracks()[0] ?? null;
      const view = track ? { readyState: track.readyState, muted: track.muted } : null;
      const decision = decideMicRecovery(view);
      console.info(BACKGROUND_LOG_PREFIX, `mic=${view ? `${view.readyState}${view.muted ? "/muted" : ""}` : "none"} → ${decision}`);
      if (decision !== "reacquire") return;
      void navigator.mediaDevices
        .getUserMedia(LIVE_MIC_CONSTRAINTS)
        .then((next) => {
          if (cancelled || !replaceMicStream) {
            stopStream(next);
            return;
          }
          // §105 완화 (b) — 새 트랙이 live · unmuted일 때만 갈아 끼운다(옛 트랙 stop은 그 뒤 `replaceMicStream` 안에서만).
          const nextTrack = next.getAudioTracks()[0] ?? null;
          const nextView = nextTrack ? { readyState: nextTrack.readyState, muted: nextTrack.muted } : null;
          if (!isReplacementTrackUsable(nextView)) {
            stopStream(next);
            console.info(
              BACKGROUND_LOG_PREFIX,
              `mic reacquire unusable ${nextView ? `${nextView.readyState}${nextView.muted ? "/muted" : ""}` : "none"} → keep old`,
            );
            return;
          }
          try {
            replaceMicStream(next);
          } catch (e) {
            // 리뷰 Minor — 갈아 끼우기 실패(컨텍스트가 닫힘 등)면 새 트랙을 닫는다(표시등 · 누수 0).
            stopStream(next);
            throw e;
          }
          console.info(BACKGROUND_LOG_PREFIX, "mic reacquired");
        })
        .catch((e: unknown) => {
          noteAudioError(e instanceof Error ? e.name : "unknown");
          console.info(BACKGROUND_LOG_PREFIX, `mic reacquire failed ${e instanceof Error ? e.name : "unknown"}`);
        });
    };
    const handleVisibility = () => {
      if (cancelled) return;
      const nowMs = performance.now();
      if (isHiddenNow()) {
        wasHidden = true;
        hiddenAtMs = nowMs;
        // 돌아온 직후 다시 가려지면 예약된 마이크 재확인을 취소한다(가려진 문서에서 마이크를 열지 않는다).
        if (micRecheckTimer) clearTimeout(micRecheckTimer);
        micRecheckTimer = null;
        console.info(BACKGROUND_LOG_PREFIX, `hidden socket=${session ? "open" : "none"}`);
        return;
      }
      lastVisibleAtMs = nowMs;
      const hiddenMs = hiddenAtMs !== null ? Math.round(nowMs - hiddenAtMs) : 0;
      hiddenAtMs = null;
      console.info(
        BACKGROUND_LOG_PREFIX,
        `visible hiddenMs=${hiddenMs} out=${outputContext?.state ?? "-"} in=${inputContext?.state ?? "-"} socket=${session ? "open" : "none"}`,
      );
      // 리뷰 Minor — 가려진 동안 미뤄 둔 침묵 · 대기 넛지는 돌아온 시점부터 다시 센다(복귀 직후 사기범이 바로 재촉하지 않게).
      if (silenceNudgeState.armedAt !== null) silenceNudgeState = { ...silenceNudgeState, armedAt: nowMs };
      if (stallNudgeState.armedAt !== null) stallNudgeState = { ...stallNudgeState, armedAt: nowMs };
      // 컨텍스트가 suspended/interrupted면 다시 깨운다(iOS는 탭이 필요할 수 있다 — 화면의 탭 안전망이 이어받는다).
      resumeSuspendedContexts([outputContext, inputContext], noteAudioError);
      if (micRecheckTimer) clearTimeout(micRecheckTimer);
      micRecheckTimer = setTimeout(recheckMic, MIC_RECHECK_DELAY_MS);
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibility);
    /** onclose · onerror 공통 — 다시 연결을 골랐으면 부모에 1회 알리고 `true`. */
    const reportConnectionLostIfBackground = (): boolean => {
      if (connectionLostReported) return true;
      if (!handlersRef.current.onConnectionLost) return false;
      const decision = decideSocketClose({
        hiddenNow: isHiddenNow(),
        lastVisibleAtMs,
        wasHiddenBefore: wasHidden,
        nowMs: performance.now(),
        stopRequested: stopRequestedRef.current,
        hangupLatched: handlersRef.current.isHangupLatched(),
      });
      console.info(BACKGROUND_LOG_PREFIX, `socket closed → ${decision}`);
      if (decision !== "reconnect") return false;
      connectionLostReported = true;
      handlersRef.current.onConnectionLost();
      return true;
    };

    let micLogTimer: ReturnType<typeof setInterval> | null = null;
    const cleanup = () => {
      torndown = true;
      turnsAwaitingResume.length = 0;
      if (micLogTimer) clearInterval(micLogTimer);
      micLogTimer = null;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibility);
      if (micRecheckTimer) clearTimeout(micRecheckTimer);
      micRecheckTimer = null;
      replaceMicStream = null;
      clearHangupTimers();
      if (speakingTimer) clearTimeout(speakingTimer);
      if (clientTurnTick) clearTimeout(clientTurnTick);
      clearStallNudgeTimer();
      clearSilenceNudgeTimer();
      logLatencySummary();
      if (userLevelRafId !== null) cancelAnimationFrame(userLevelRafId);
      processor?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      void pendingMic?.then(stopStream, () => {}); // 트랙 stop은 멱등 — 위와 같은 스트림이어도 무해하다
      // §105 — 리미터 노드도 뗀다(빌린 컨텍스트는 통화 화면이 닫는다 · 자기 것은 아래에서 닫힌다).
      for (const node of limiterNodes) node.disconnect();
      limiterNodes = [];
      outputSink?.release(); // §137 — 요소 정지 · srcObject 해제 · 제거(멱등)
      outputSink = null;
      speakerDynamicsRef.current = null;
      streamTrimNodeRef.current = null;
      // 수정안 A — 빌린 컨텍스트는 닫지 않는다(통화 화면이 닫는다). 대신 이 실행이 붙인 노드와 예약 재생을 뗀다.
      if (outputBorrowed) {
        stopAllPlayback();
        outputGain?.disconnect();
      } else {
        void outputContext?.close().catch(() => {});
      }
      if (inputBorrowed) {
        micSourceNode?.disconnect();
        silenceNode?.disconnect();
      } else {
        void inputContext?.close().catch(() => {});
      }
      try {
        session?.close();
      } catch {
        // 이미 닫혔으면 무시 — 종료는 항상 성공해야 한다(AC-006).
      }
      session = null;
      liveSessionRef.current = null;
      requestClientTurnRef.current = null;
      injectContextRef.current = null;
      if (turnPhaseRef) turnPhaseRef.current = { modelResponding: false, userSpeechBuffered: false };
      outputGainNodeRef.current = null;
    };
    cleanupRef.current = cleanup;

    (async () => {
      // 아래 출력 준비(마이크 → 통화 출력 컨텍스트) — Live 연결과 병렬. 연결 실패 시 catch가 이것이 끝난 뒤에 정리한다.
      let outputReady: Promise<void> | null = null;
      try {
        // §71.6 P-0 — 준비 구간 표시(받기 · 자격증명 준비는 `useRealtimeCall`이 이미 찍었다).
        markCallSetup("mount", performance.now());
        // ⭐ 2026-10-21(받기→첫소리 10.2초) — 마이크는 받기 때 이미 열기 시작했다(`useRealtimeCall.start` → `micHandoff.ts`).
        // 그 요청을 넘겨받아 **기다리지 않고** 오디오 컨텍스트 · Live 연결을 먼저 진행한다(예전: 여기서 마이크를 한 번 더
        // 열고 기다린 뒤에야 연결했다). 넘겨받은 것이 없으면(재마운트 등) 같은 제약으로 직접 연다 — 실패는 종전처럼 아래 catch.
        // 제약(에코 제거/잡음 억제/자동 게인)의 근거는 `LIVE_MIC_CONSTRAINTS` 주석.
        const handedMic = liveMicHandoff.claim();
        const micRequest: Promise<MediaStream | null> =
          handedMic ?? navigator.mediaDevices.getUserMedia(LIVE_MIC_CONSTRAINTS);
        // 연결 중 거부돼도 처리되지 않은 rejection이 남지 않게 한다(실제 처리는 아래 await).
        micRequest.catch(() => {});
        pendingMic = micRequest;

        // 서버 메시지 1건의 모양(아래 `handleLiveMessage` · 연결 콜백이 함께 쓴다).
        type LiveServerMessageLike = {
        data?: string;
        serverContent?: {
          interrupted?: boolean;
          turnComplete?: boolean;
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
          // §116 — 재생할 오디오를 직접 고른다(사고 파트 제외 · SDK `data` 게터는 `thought`를 보지 않는다).
          modelTurn?: { parts?: LiveContentPart[] };
        };
        // §59.2 ②(genai.d.ts:9262) — `toolCall?: LiveServerToolCall`.
        toolCall?: { functionCalls?: { id?: string; name?: string; args?: unknown }[] };
        // §59.2 ②(genai.d.ts:9264) — `toolCallCancellation?: LiveServerToolCallCancellation`.
        toolCallCancellation?: { ids?: string[] };
        // §140 — SDK `LiveServerSessionResumptionUpdate` · `LiveServerGoAway`.
        sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
        goAway?: { timeLeft?: string };
        };
        // ⭐ 2026-10-27(실기 신고 — 첫 발화까지 17초) — §122.2.2가 통화 출력 컨텍스트를 마이크 **뒤에** 만들면서, 이 자리에서 마이크를
        // 기다린 다음에야 Live 연결을 시작했다(2026-10-21 받기→첫소리 병렬화가 다시 직렬이 됨). 이제 출력 준비(마이크 대기 → 새 출력
        // 컨텍스트 → 노드 사슬)만 `setupCallOutput`으로 따로 돌리고, Live 연결은 그것을 기다리지 않는다. 볼륨 키 의도(§122.2.2)는 그대로다 —
        // 출력 컨텍스트는 여전히 마이크가 열린 뒤에 만든다. 출력 준비 전에 온 서버 메시지는 버리지 않고 받은 순서대로 쌓았다가,
        // 준비가 끝나는 같은 동기 구간에서 그대로 처리한다(그 뒤 메시지는 바로 처리 — 순서가 뒤바뀌지 않는다). 오프닝은 아래에서 출력 준비 ·
        // 마이크를 모두 기다린 뒤에 나가므로 첫 오디오가 출력보다 먼저 오는 일은 대개 없지만, 맥락 주입 등 예외 경로도 이 큐가 받는다.
        const handleLiveMessage = (message: LiveServerMessageLike): void => {
        if (cancelled) return;

        // ⭐ §59.10 커밋 A + reviewer Critical #1 수정(G383/G385/G386/G390) — 도구가 실제로
        // 선언되는 세션(SMS 카탈로그 보유 시나리오 대부분 · 확인 무력화 카탈로그 보유 6종의
        // advanced, §61)에서는 이제 이 분기가 **도달 가능**하다(`credentials.liveTools`, §59.6 ②).
        // `dispatchToolCall`(위, 이 effect 스코프)이 이름을 실제 콜러블로 라우팅하고 결과를
        // `{status, guidance}`로 돌려준다 — 미선언 세션·알 수 없는 이름은 여전히
        // `buildUnsupportedToolResponses`(unsupported)로 안전하게 떨어진다. `BLOCKING` 도구는
        // 응답이 없으면 통화가 멈추므로(§59.0 1) **어떤 경로에서도 응답을 생략하지 않는다**
        // (G390 — `dispatchToolCall`의 모든 분기가 값을 반환하고, 콜러블이 던져도
        // `failureResponse()`로 대체한다).
        // ⭐ reviewer APPROVED Major #1 수정 — `dispatchToolCall`이 값을 반환하는 것은 "오늘
        // 이 파일의 모든 분기가 우연히 안 던진다"는 사실에 기댄 것이지, 구조적 보장이 아니었다.
        // `collectToolResponses`(`liveToolResponse.ts`, 순수 함수·테스트로 고정)가 그 구조적
        // 보장이다: `dispatchToolCall`이 무엇을 던지든(내부 헬퍼가 나중에 수정되며 throw
        // 경로가 생기는 경우 포함) 절대 throw하지 않고 `buildUnsupportedToolResponses(calls)`
        // 폴백을 돌려줘 아래 `sendToolResponse` 호출까지 반드시 도달한다 — "무엇이 잘못되든
        // 이 함수가 끝나기 전에 sendToolResponse가 최소 한 번은 불린다"가 이제 코드 구조
        // 자체에서 나온다(안쪽 try/catch — 콜러블별 실패 처리 — 와 겹치는 이중 방어).
        if (message.toolCall) {
          const calls = message.toolCall.functionCalls ?? [];
          const activeSession = session;
          if (calls.length > 0 && activeSession) {
            // §117 — 도구 앞에서 이미 말한 것이 있으면 도구 뒤 첫 전사 조각 앞에서 문단을 가른다.
            if (shouldMarkToolBoundary(scammerBuffer)) scammerToolBoundary = true;
            // §71.6 — 도구 대기(콜러블 왕복)를 턴 지연과 따로 잰다.
            latencyState = noteToolCall(latencyState, {
              nowMs: performance.now(),
              lastLoudAt: userSpeechDebounceState.lastLoudAt,
            });
            // reviewer M2 — 도구 결과를 기다리는 동안 보류 큐가 텍스트 턴을 내보내지 않게 한다.
            dispatchClientTurn({ type: "toolCall", nowMs: performance.now() });
            // §140 — 이 호출을 받은 연결 세대. 응답을 기다리는 사이 조용히 다시 연결됐으면 새 연결에 옛 호출 id를 보내지 않는다
            // (서버는 도구 실행 중 이어받기 핸들을 주지 않는다 — 되살아난 대화에는 이 호출이 없다 · SDK `resumable` 주석).
            const callGeneration = liveGeneration;
            void (async () => {
              const responses = await collectToolResponses(calls, (call) => dispatchToolCall(call, calls));
              // §140 — 다시 연결하는 중이면 끝날 때까지 기다린다(뒤의 래치 · 결과 신호 · 큐 풀기를 건너뛰지 않게).
              if (!cancelled && !session && resumeInFlight) await resumeInFlight;
              // 대기 중 언마운트되거나 세션이 교체됐으면 죽은 소켓에 쓰지 않는다.
              if (cancelled || !session) return;
              if (callGeneration === liveGeneration) {
                try {
                  session.sendToolResponse({ functionResponses: responses });
                  latencyState = noteToolResponseSent(latencyState, performance.now());
                } catch {
                  // G390 — 전송 실패도 통화를 막지 않는다(P-4 비차단). 무응답만은 피하는 것이
                  // 이 배선의 목적이지만, 소켓 자체가 끊긴 경우까지 되살릴 수는 없다.
                }
              } else {
                console.info(LIVE_RESUME_LOG_PREFIX, "stale tool response dropped");
              }
              // ⭐ T192 C5(§79.8 R4) — 승인 응답을 보낸 **뒤** 첫 turnComplete를 기다리기 시작한다(래치는 R2에서 이미 걸렸다).
              // 전송이 실패해도 건다 — 상한이 준비 신호를 낸다(끊기 승인 뒤 통화가 끝나지 않는 상태 0).
              if (armDrainAfterSend) {
                armDrainAfterSend = false;
                armHangupDrain();
              }
              // PR-A2(audit-A R1) — 도착 안내(도구 응답)가 나간 **뒤** 결과 신호를 부모에 넘긴다(세션당 1회 판정 · 래치는 부모).
              const confirmText = confirmResultAfterToolResponse;
              confirmResultAfterToolResponse = null;
              if (confirmText) handlersRef.current.onConfirmResultInstruction?.(confirmText);
              // 성공 · 실패 무관 — 큐의 도구 대기를 푼다(턴 자체는 turnComplete에서 끝난다).
              dispatchClientTurn({ type: "toolResponseSent", nowMs: performance.now() });
            })();
          }
          return;
        }
        // §59.13 (5) — 취소 통보 처리 규약은 미실측(도구를 아직 부르지 않아 되돌릴 것이
        // 없다). 오늘은 안전하게 무시한다.
        if (message.toolCallCancellation) return;

        if (!outputContext) return;
        const sc = message.serverContent;

        // 전사 조각 누적(리포트 기록용). input=사용자 발화, output=사기범(모델) 발화.
        if (sc?.inputTranscription?.text) {
          // §105 — 서버가 사용자 말을 들었다는 증거(내용은 적지 않는다 · 개수만).
          noteAsrChunk();
          // §105.2.6 — 서버가 들었다 → 화면 쪽 보완 후보를 버린다(판정표 4행).
          if (sc.inputTranscription.text.trim()) {
            unheardReplyState = stepUnheardReply(unheardReplyState, { type: "asr" }).state;
          }
          appendUserBuffer(sc.inputTranscription.text);
          // §82.4.2(G543) — 참가자가 말하기 시작했다 = 침묵 넛지 취소.
          if (sc.inputTranscription.text.trim()) noteUserSpeechForNudge();
        }
        if (sc?.outputTranscription?.text) {
          ({ buffer: scammerBuffer, boundaryPending: scammerToolBoundary } = appendScammerChunk(
            scammerBuffer,
            sc.outputTranscription.text,
            scammerToolBoundary,
          ));
          if (sc.outputTranscription.text.trim()) scammerTextSinceBoundary = true;
          // §126 — 말하는 도중 "문자를 보냈다"가 보이면 턴 끝을 기다리지 않고 부모에 알린다(문자가 말과 함께 도착).
          if (!smsClaimRaisedThisTurn && scammerClaimsSmsSent(stripLeakedThought(scammerBuffer))) {
            smsClaimRaisedThisTurn = true;
            handlersRef.current.onScammerSmsClaim?.(claimedUserTurns());
          }
          // §116 — 사고 문장이 보이면 이미 예약된 재생을 끊고, 한국어 대사가 다시 올 때까지 오디오를 예약하지 않는다.
          const gate = stepThoughtLeakGate(thoughtGate, { type: "transcript", text: sc.outputTranscription.text });
          thoughtGate = gate.state;
          if (gate.startSuppress) {
            noteThoughtCut(); // §135 진단 — 앱이 지운 끊김
            stopAllPlayback();
            console.info("[gemini-thought-leak]", JSON.stringify({ suppressed: true }));
          }
        }

        // 사용자가 말을 끊으면 예약된 재생을 전부 멈춰 새 응답과 겹치지 않게 한다.
        if (sc?.interrupted) {
          // §135 진단 — 예약 재생이 남아 있었으면 말이 잘린 끼어들기다(stopAllPlayback이 nextPlayTime을 0으로 되돌리기 전에 잰다).
          noteInterrupt(outputContext ? nextPlayTime - outputContext.currentTime > 0 : false);
          thoughtGate = stepThoughtLeakGate(thoughtGate, { type: "boundary" }).state;
          stopAllPlayback();
          stopSpeaking();
          // 잘린 사기범 발화를 여기서 내보낸다 — 안 하면 다음 말풍선 앞에 붙어 턴 경계가
          // 밀리고 리포트의 속은-순간 판정이 어긋난다(flushScammerTurn 주석 참고).
          flushScammerTurn();
          closeLatencyTurn("interrupted");
          dispatchClientTurn({ type: "interrupted", nowMs: performance.now() });
          // T192 C5(§79.8 R4) — 끼어들기도 마지막 응답의 끝으로 본다.
          beginHangupDrain();
          return;
        }
        // **오디오를 먼저 예약한다**(reviewer Critical 수정). 두 가지 이유:
        // (1) nextPlayTime이 갱신된 뒤에 게이트 대기 시간을 계산해야 잔여 재생이 정확히 반영된다.
        // (2) 예전엔 turnComplete를 먼저 처리하고 그 뒤 markSpeaking()이 turnInProgress를
        //     되살려, 마지막 청크와 turnComplete가 같은 메시지로 오는 정상 케이스에서 4초
        //     대기가 걸렸다. 이제 순서와 무관하게 resolveTurnInProgress가 규칙으로 정한다.
        // §116 — 사고 파트(`thought: true`)는 재생하지 않는다. 게이트가 막는 동안 온 오디오도 예약하지 않는다
        // (`hasAudio`는 그대로 둔다 — 턴 진행 판정 · 게이트 계산은 서버가 말하는 중이라는 사실을 따라야 한다).
        const audioData = pickLiveAudioData(sc?.modelTurn?.parts);
        const samples = audioData ? base64ToFloat32(audioData) : null;
        const hasAudio = samples !== null && samples.length > 0;
        if (hasAudio && samples && !thoughtGate.suppressing) {
          audioSinceBoundary = true;
          noteChunkReceived(samples); // 진단 — 원본 PCM 최대 진폭(`pcm.peakDb`)
          // §114 — 시나리오 · 세션마다 다른 원본 크기를 목표 말소리 RMS(기관 사칭 기준)로 맞춘 뒤 게인 노드로 보낸다.
          const normalized = normalizeChunk(samples, loudness);
          loudness = normalized.state;
          noteNormalizerGain(loudness.gain); // §122(8) 진단 — 정규화 게인(`norm.gainDb`)
          const buffer = outputContext.createBuffer(
            1,
            samples.length,
            GEMINI_OUTPUT_SAMPLE_RATE,
          );
          buffer.copyToChannel(normalized.out, 0);
          const source = outputContext.createBufferSource();
          source.buffer = buffer;
          source.connect(outputGain ?? outputContext.destination);
          // §135 진단 — 턴 진행 중인데 앞 청크가 이미 다 재생됐으면 그 사이 소리가 비었다(`play.gaps`).
          notePlayGap(playGapMs({ turnInProgress, nextPlayTime, currentTime: outputContext.currentTime }));
          // 이전 청크가 끝나는 시점에 이어붙인다(겹침·끊김 방지).
          const startAt = Math.max(outputContext.currentTime, nextPlayTime);
          source.start(startAt);
          noteChunkScheduled(performance.now());
          nextPlayTime = startAt + buffer.duration;
          scheduledSources.add(source);
          source.onended = () => scheduledSources.delete(source);
          markSpeaking();
          // §71.6 — 첫 청크 도착 시각(앵커 → 첫 오디오). 반이중 억제 때문에 이 시점의 `lastLoudAt`은
          // 응답 직전 참가자 발화 끝이다.
          const nowMs = performance.now();
          if (markOpeningFirstAudio(nowMs)) {
            logLatency(
              formatLatencyLine(
                credentials.geminiModel,
                buildCallSetupRecord(readCallSetupMarks(), {
                  baseLatencySec: outputContext.baseLatency,
                  outputLatencySec: (outputContext as AudioContext & { outputLatency?: number }).outputLatency,
                }),
              ),
            );
          }
          latencyState = noteModelAudio(latencyState, {
            nowMs,
            audioMs: buffer.duration * 1000,
            lastLoudAt: userSpeechDebounceState.lastLoudAt,
          });
          dispatchClientTurn({ type: "modelAudio", nowMs });
        }

        const hasTurnComplete = Boolean(sc?.turnComplete);
        turnInProgress = resolveTurnInProgress({
          current: turnInProgress,
          hasAudio,
          hasTurnComplete,
          hasInterrupted: false, // interrupted는 위에서 이미 return했다.
        });

        // 게이트를 **즉시 닫지 않는다** — turnComplete 시점에도 재생될 오디오가 남아 있을 수
        // 있다. 실제 개방 시각은 항상 잔여 재생 기준으로 다시 잡는다.
        if (hasAudio || hasTurnComplete) scheduleGateClose();
        if (hasTurnComplete) {
          // ⭐ §82.3.4 N1(G539) — 판정은 flush **전에** 경계 이후 신호로 한다. 빈 마감이면 경계 콜백을 부르지 않는다.
          const emptyTurn = isEmptyTurnComplete({ audioSinceBoundary, scammerTextSinceBoundary });
          audioSinceBoundary = false;
          scammerTextSinceBoundary = false;
          // PR-A2(F6) — 이 턴의 사기범 전사(flush가 비우기 전에 읽는다). 대기 뒤 침묵 넛지 판정의 입력이다.
          const scammerTurnText = stripLeakedThought(scammerBuffer);
          // §104 — 이 턴이 답한 참가자 발화(flush가 비우기 전에 읽는다). 자금 소진 선언 판정의 입력이다.
          const participantTurnText = userBuffer;
          flushTranscript();
          thoughtGate = stepThoughtLeakGate(thoughtGate, { type: "boundary" }).state;
          // ⭐ §59.6 ③ → §82.3.4 — `modelToolScammerTurns`는 이제 위 `flushTranscript`/`flushScammerTurn`이
          // 비어 있지 않은 사기범 전사를 내보낼 때 오른다(부모 `scammerTurnsRef`와 같은 지점 · 같은 정의).
          // T68 — 사기범 발화 1턴 완료. 부모가 이 경계만 세어 통화 중 문자 도착을 판단한다
          // (§15.1.2 "앱 오케스트레이션"). 세션 자체에는 아무 영향이 없다.
          // ⚠️ 병합 정합(T90+T68, 2026-07-26): T90이 핸들러를 "오디오 먼저 → 게이트 계산
          // 나중"으로 재정렬하면서 turnComplete 처리 위치가 바뀌었다. 이 콜백은 **전사 flush
          // 직후**라는 원래 순서를 그대로 유지한다 — 문자 도착 판단이 전사보다 앞서면
          // 앵커 턴 계산(§15.1.5 G21)이 한 턴 어긋난다.
          if (!emptyTurn) handlersRef.current.onScammerTurnComplete?.();
          // PR-A2(F6) — 빈 마감은 사기범 턴 경계가 아니다(위와 같은 조건).
          if (!emptyTurn) noteScammerTurnForStallNudge(scammerTurnText);
          // §104 — 같은 경계(빈 마감 제외)에서 반복 · 대기 정체 판정.
          if (!emptyTurn) noteScammerTurnForRepeatBreak(scammerTurnText, participantTurnText);
          // §71.6 — 이 모델 턴의 지연 레코드를 닫는다. §71.5 — 턴이 끝났으니 보류분 1건을 보낸다
          // (2.5가 서버에서 하던 순서와 같다). 전사 flush · 부모 경계 콜백 **뒤**에 둔다 — 보류됐던
          // 타이핑은 여기서야 userBuffer에 적립돼 다음 턴의 사용자 발화로 기록된다.
          closeLatencyTurn("turnComplete");
          dispatchClientTurn({ type: "turnComplete", nowMs: performance.now() });
          // T192 C5(§79.8 R4) — 승인 응답 뒤 첫 turnComplete = 마지막 대사가 다 왔다 → 잔여 재생을 기다린다(R5).
          // 오디오를 먼저 예약했으므로(위) `nextPlayTime`에 이 턴의 마지막 청크까지 들어 있다.
          beginHangupDrain();
          // §140 판정표 2 G2 — 말하는 중에 받은 goAway는 턴이 끝난 여기서 다시 본다.
          recheckGoAway();
        }
        };
        // 표 G1~G4는 `earlyMessageGate.ts`.
        const liveMessageGate = createEarlyMessageGate(handleLiveMessage);
        // 토큰을 API 키 자리에 그대로 넣는다(문서 지침). 단기 토큰은 v1alpha에서만 유효하다.
        const ai = new GoogleGenAI({
          apiKey: credentials.geminiToken,
          httpOptions: { apiVersion: "v1alpha" },
        });
        // ⭐ §140 — 연결 1개를 연다. 첫 연결(세대 0)은 종전과 같다. 다시 연결(세대 ≥ 1)은 같은 config로 새 세션을 열고, 준비 전 닫힘 ·
        // 시간 초과를 실패로 돌려준다(SDK `connect()`는 서버가 거부하면 끝나지 않는다). 옛 세대의 콜백은 아무것도 하지 않는다.
        let socketErrored = false;
        let pendingAttempt: { generation: number; fail: (code: number | null) => void } | null = null;
        const closeInput = (): LiveCloseInput => ({
          stopRequested: stopRequestedRef.current,
          hangupLatched: handlersRef.current.isHangupLatched(),
          backgroundDecision:
            connectionLostReported ||
            (handlersRef.current.onConnectionLost &&
              decideSocketClose({
                hiddenNow: isHiddenNow(),
                lastVisibleAtMs,
                wasHiddenBefore: wasHidden,
                nowMs: performance.now(),
                stopRequested: stopRequestedRef.current,
                hangupLatched: handlersRef.current.isHangupLatched(),
              }) === "reconnect")
              ? "reconnect"
              : "end",
          handle: resumeHandle,
          resumesSoFar: liveResumeCount,
          firstOpenAtMs,
          nowMs: performance.now(),
        });
        // 다시 연결하지 않을 때(또는 실패했을 때) — 종전 onerror · onclose 순서 그대로.
        const fallBackAfterClose = (errored: boolean) => {
          // §99 — 가려진 동안(또는 돌아온 직후) 닫혔으면 통화를 끝내지 않고 부모가 다시 연결한다(`decideSocketClose`).
          // 사용자 종료(`stopSignal`) · 끊기 래치 뒤의 close는 언제나 종전대로 `onEnded`다.
          if (reportConnectionLostIfBackground()) return;
          if (errored) handlersRef.current.onError();
          handlersRef.current.onEnded();
          // T192 C5(§79.8 R4 · §79.11 3행) — 끊기 대기 중 서버 close는 R4를 즉시 푼다(사유는 먼저 래치된 scammer).
          beginHangupDrain();
        };
        let resumeLive: (reason: string, errored: boolean, droppedMidTurn: boolean) => Promise<boolean> = async () => false;
        const handleGoAway = () => {
          const decision = decideGoAway({
            ...closeInput(),
            modelBusy:
              agentSpeaking ||
              clientTurnState.modelTurnActive ||
              clientTurnState.toolPending ||
              clientTurnState.awaitingSince !== null,
          });
          console.info(LIVE_RESUME_LOG_PREFIX, `goAway → ${decision}`);
          goAwayPending = decision === "later";
          if (decision === "now") {
            flushTranscript();
            void resumeLive(formatResumeReason("goaway"), false, false);
          }
        };
        recheckGoAway = () => {
          if (goAwayPending && !cancelled) handleGoAway();
        };
        const openLive = (generation: number): Promise<GeminiLiveSession> => {
          const connecting = ai.live.connect({
            model: credentials.geminiModel,
            // 모델·프롬프트·목소리·도구·전사설정은 토큰에 고정돼 있어 여기서 다시 보내지 않는다.
            // §140 후속(2026-10-29 실측) — 이어받기 핸들로 되살린 연결은 목소리를 바꿨다(speechConfig를 다시 넣어도 · 판정표 4) —
            // 다시 연결도 핸들 없이 첫 연결과 같은 config로 새 세션을 연다(맥락은 전사 재주입).
            config: { responseModalities: [Modality.AUDIO] },
            callbacks: {
              onopen: () => {
                log("onopen ✓", generation);
                if (cancelled || generation !== liveGeneration) return;
                if (generation === 0) {
                  firstOpenAtMs = performance.now();
                  handlersRef.current.onActive();
                }
              },
              onmessage: (message: LiveServerMessageLike) => {
                if (cancelled || generation !== liveGeneration) return;
                // §140 — 이어받기 핸들(값은 로그 · 진단에 싣지 않는다 · 판정표 1 C3의 '서버가 이어받기를 허용함' 신호로만 쓴다)과
                // goAway는 출력 준비와 무관하게 바로 본다.
                if (message.sessionResumptionUpdate) {
                  resumeHandle = nextResumeHandle(resumeHandle, message.sessionResumptionUpdate);
                }
                if (message.goAway) handleGoAway();
                // 출력 준비(마이크 → 통화 출력 컨텍스트) 전이면 받은 순서대로 쌓는다 — 위 `setupCallOutput` 끝(`open()`)에서 처리한다.
                liveMessageGate.push(message);
              },
              onerror: (e: unknown) => {
                log("onerror", e);
                if (cancelled || generation !== liveGeneration) return;
                if (pendingAttempt?.generation === generation) {
                  pendingAttempt.fail(null);
                  return;
                }
                // §140 — 다시 연결할 수 있으면 오류를 기억만 하고 뒤따르는 onclose에서 다시 연결한다(실패하면 종전처럼 onError).
                if (decideLiveClose(closeInput()) === "resume") {
                  socketErrored = true;
                  return;
                }
                // §99 — 화면이 가려진 동안의 소켓 오류는 텍스트 강등이 아니라 다시 연결로 보낸다(아래 onclose와 같은 판정 · 1회).
                if (!reportConnectionLostIfBackground()) handlersRef.current.onError();
              },
              onclose: (e: unknown) => {
                log("onclose", e);
                if (cancelled || generation !== liveGeneration) return;
                const code = closeCodeOf(e);
                if (pendingAttempt?.generation === generation) {
                  pendingAttempt.fail(code);
                  return;
                }
                // 판정표 4 S3 — 끊길 때 사기범이 말하던 중이었는가(flush 전에 읽는다).
                const droppedMidTurn = turnInProgress;
                flushTranscript();
                logLatencySummary();
                console.info(formatMicLine());
                const errored = socketErrored;
                socketErrored = false;
                const decision = decideLiveClose(closeInput());
                console.info(LIVE_RESUME_LOG_PREFIX, `socket closed code=${code ?? "-"} → ${decision} n=${liveResumeCount}`);
                if (decision === "resume") {
                  void resumeLive(formatResumeReason("close", code), errored, droppedMidTurn);
                  return;
                }
                fallBackAfterClose(errored);
              },
            },
          }) as unknown as Promise<GeminiLiveSession>;
          if (generation === 0) return connecting;
          return new Promise<GeminiLiveSession>((resolve, reject) => {
            let settled = false;
            const settle = (error: unknown, value?: GeminiLiveSession) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              if (pendingAttempt?.generation === generation) pendingAttempt = null;
              if (value) resolve(value);
              else reject(error);
            };
            const timer = setTimeout(() => settle(new Error("resume-timeout")), RESUME_CONNECT_TIMEOUT_MS);
            pendingAttempt = { generation, fail: (code) => settle(new Error(`resume-closed:${code ?? "-"}`)) };
            connecting.then(
              (next) => {
                // 시간 초과 · 준비 전 닫힘으로 이미 포기한 뒤 늦게 열렸으면 닫는다(새는 소켓 0).
                if (settled) {
                  try {
                    next.close();
                  } catch {
                    // 무시
                  }
                  return;
                }
                settle(null, next);
              },
              (err: unknown) => settle(err),
            );
          });
        };
        resumeLive = (reason: string, errored: boolean, droppedMidTurn: boolean): Promise<boolean> => {
          if (resumeInFlight) return resumeInFlight;
          const previous = session;
          session = null;
          liveSessionRef.current = null;
          goAwayPending = false;
          // 옛 연결의 콜백을 끊는다(아래 close가 부르는 onclose도 무시된다).
          liveGeneration += 1;
          try {
            previous?.close();
          } catch {
            // 이미 닫혔으면 무시
          }
          let lastFailure = "-";
          const run = (async (): Promise<boolean> => {
            for (let attempt = 1; attempt <= RESUME_ATTEMPTS_PER_DROP; attempt += 1) {
              if (cancelled || torndown || stopRequestedRef.current || handlersRef.current.isHangupLatched()) return false;
              const generation = liveGeneration;
              try {
                const next = await openLive(generation);
                if (cancelled || torndown || generation !== liveGeneration) {
                  liveGeneration += 1;
                  try {
                    next.close();
                  } catch {
                    // 무시
                  }
                  return false;
                }
                session = next;
                liveSessionRef.current = next;
                liveResumeCount += 1;
                noteLiveResume(reason, true);
                console.info(LIVE_RESUME_LOG_PREFIX, `resumed ${reason} n=${liveResumeCount} attempt=${attempt}`);
                return true;
              } catch (err) {
                lastFailure = err instanceof Error ? err.message.replace(/^resume-/, "") : "error";
                console.info(LIVE_RESUME_LOG_PREFIX, `attempt ${attempt} failed ${lastFailure}`);
                // 이 시도의 늦은 콜백을 끊는다.
                liveGeneration += 1;
                if (attempt < RESUME_ATTEMPTS_PER_DROP) {
                  await new Promise<void>((resolve) => setTimeout(resolve, RESUME_RETRY_DELAY_MS));
                }
              }
            }
            noteLiveResume(`fail:${lastFailure}`, false);
            return false;
          })();
          resumeInFlight = run;
          void run.then((ok) => {
            resumeInFlight = null;
            if (cancelled) return;
            if (torndown) {
              // 다시 연결하는 사이 사용자가 끊었다 — 종전에는 정리의 close가 onclose → onEnded를 불렀다(같은 신호를 1회 낸다).
              if (stopRequestedRef.current) handlersRef.current.onEnded();
              return;
            }
            if (!ok) {
              turnsAwaitingResume.length = 0;
              fallBackAfterClose(errored);
              return;
            }
            // 끊길 때 모델이 말하던 턴은 turnComplete가 오지 않는다 — 게이트 타이머가 stall로 정리한다(예약이 없을 수 있어 다시 잡는다).
            if (turnInProgress || agentSpeaking) scheduleGateClose();
            // ⭐ 판정표 4 — 새 세션은 대화를 모른다 — 지금까지의 전사 전부를 `turnComplete: false`로 다시 넣는다.
            const resumeTurns = handlersRef.current.readTranscript?.() ?? instanceTurns;
            const silentResume = buildSilentResumeContext({
              turns: resumeTurns,
              covered: { start: 0, end: 0 },
              droppedMidTurn,
            });
            if (silentResume.context && session && !handlersRef.current.isHangupLatched()) {
              try {
                session.sendClientContent({ turns: silentResume.context, turnComplete: false });
                console.info(LIVE_RESUME_LOG_PREFIX, `context turns=${resumeTurns.length} chars=${silentResume.context.length}`);
              } catch {
                // 무시 — 통화는 계속된다(P-4 비차단).
              }
            }
            // 그 사이 나가려던 텍스트 턴 · 못 보낸 맥락 주입을 새 연결로 보낸다.
            const heldTurns = turnsAwaitingResume.splice(0);
            for (const turn of heldTurns) sendClientTurn(turn);
            // S3 — 말하던 중에 끊겼으면 끊긴 말을 마무리하게 한 번 넘긴다(보류 큐 — 끊긴 턴은 게이트 stall이 먼저 정리한다).
            if (silentResume.continueTrigger && heldTurns.length === 0) {
              dispatchClientTurn({ type: "request", turn: { kind: "silence", text: silentResume.continueTrigger }, nowMs: performance.now() });
            }
            const resumeContext = pendingContextTurnRef.current;
            if (resumeContext && !handlersRef.current.isHangupLatched() && injectContext(resumeContext.text, resumeContext.delivery)) {
              pendingContextTurnRef.current = null;
              handlersRef.current.onContextTurnDelivered?.(resumeContext.seq);
            }
          });
          return run;
        };
        const setupCallOutput = async (): Promise<void> => {
          // 수정안 A — 받기 탭 안에서 미리 깨운 컨텍스트가 살아 있으면 그것을 쓴다(없거나 닫혔으면 종전대로 만든다).
          const primedOutput = primedAudio?.output ?? null;
          const primedInput = primedAudio?.input ?? null;
          // ⭐ §122.2.2 — 볼륨 키가 '통화' 음량으로 소리를 조절하게, 마이크가 열린 **뒤** 출력 컨텍스트를 새로 만든다(`callAudio.ts` 표 O1~O4 ·
          // Chromium은 출력 스트림 용도를 만들 때 정한다). 마이크는 받기 때 이미 열기 시작했다 — 대개 여기서는 이미 끝나 있다.
          // 거부 · 실패는 아래 종전 자리(`await micRequest`)가 그대로 처리한다.
          const outputAfterMicFlag = readOutputAfterMicFlag(readDebugFlagSearch());
          // §137 — 출력 싱크 A/B(기본 = 끔 · 꺼져 있으면 아래 연결은 종전 `ctx.destination` 그대로 — 표 E1).
          const outputElementFlag = readOutputElementFlag(readDebugFlagSearch());
          const micOpened = outputAfterMicFlag ? (await micRequest.catch(() => null)) !== null : false;
          let freshOutput: AudioContext | null = null;
          if (outputAfterMicFlag && micOpened && !cancelled) {
            try {
              freshOutput = new AudioContext({ sampleRate: GEMINI_OUTPUT_SAMPLE_RATE });
              const freshStartedAt = performance.now();
              await Promise.race([
                freshOutput.resume().catch(() => {}),
                new Promise<void>((resolve) => setTimeout(resolve, FRESH_OUTPUT_RESUME_TIMEOUT_MS)),
              ]);
              // §126 — `fallback-primed`(볼륨 키가 안 먹는 경로)로 빠진 원인이 시간 초과인지 진단에 남긴다.
              noteFreshResume(
                freshOutput.state === "running" ? String(Math.round(performance.now() - freshStartedAt)) : "timeout",
              );
            } catch (e) {
              noteAudioError(e instanceof Error ? e.name : "unknown");
              freshOutput = null;
            }
          }
          const outputPath = pickCallOutputPath({
            flagOn: outputAfterMicFlag,
            micOpened,
            freshRunning: freshOutput?.state === "running",
            primedUsable: isUsableContext(primedOutput),
          });
          if (outputPath === "fallback-primed" || cancelled) {
            void freshOutput?.close().catch(() => {});
            freshOutput = null;
          }
          // 병렬 연결 중에 정리가 이미 돌았으면(끊기 · 언마운트) 컨텍스트를 새로 만들지 않는다 — 만들면 닫을 주체가 없다.
          if (cancelled) return;
          noteOutputPath(outputPath);
          // §126 — '통화' 스트림이면 통화 모드 기준 레벨을 낮춘다(`outputGain.ts` 표 · `?voicetrim=0`이면 끔).
          streamTrimRef.current = callStreamTrimFor(outputPath, readVoiceTrimFlag(readDebugFlagSearch()));
          noteStreamTrim(streamTrimRef.current);
          outputBorrowed = freshOutput === null && isUsableContext(primedOutput);
          inputBorrowed = isUsableContext(primedInput);
          outputContext =
            freshOutput ??
            (outputBorrowed && primedOutput ? primedOutput : new AudioContext({ sampleRate: GEMINI_OUTPUT_SAMPLE_RATE }));
          inputContext = inputBorrowed && primedInput ? primedInput : new AudioContext();
          registerCallAudio({
            output: outputContext,
            input: inputContext,
            origin: outputBorrowed ? "primed" : "session",
            createdAtMs: outputBorrowed && primedAudio ? primedAudio.createdAtMs : performance.now(),
          });
          // 비동기 effect에서 만든 컨텍스트는 suspended로 시작할 수 있다 — 명시적으로 깨운다(빌린 것도 한 번 더 요청한다).
          await outputContext.resume().catch((e: unknown) => noteAudioError(e instanceof Error ? e.name : "unknown"));
          await inputContext.resume().catch((e: unknown) => noteAudioError(e instanceof Error ? e.name : "unknown"));
          // §71.7(G433) — 기본 음량은 `GEMINI_OUTPUT_GAIN`(판단값 · OQ-A89). 받은 오디오 소스는 전부 이
          // 노드에 연결한다(아래 onmessage).
          outputGain = outputContext.createGain();
          outputGain.gain.value = GEMINI_OUTPUT_GAIN;
          // ⭐ §105 — 스피커 모드 증폭(게인 > 1.0)이 깨지지 않게 리미터를 거친다: 게인 → 1/범위 축소 → 곡선(`buildLimiterCurve`) → 출력.
          // 곡선은 진폭 0.7까지 그대로 통과시켜 통화 모드(0.6) 소리는 바뀌지 않는다. 만들 수 없으면(구형 브라우저) 종전대로 직결한다.
          try {
            // §108 — 게인과 리미터 사이에 컴프레서 → 보정 게인. 통화 모드는 비율 1 · 보정 1(소리 무변경 · `liveStageFor`).
            const compressor = outputContext.createDynamicsCompressor();
            compressor.threshold.value = SPEAKER_COMPRESSOR.threshold;
            compressor.knee.value = SPEAKER_COMPRESSOR.knee;
            compressor.attack.value = SPEAKER_COMPRESSOR.attack;
            compressor.release.value = SPEAKER_COMPRESSOR.release;
            const makeup = outputContext.createGain();
            // §126 — 컴프레서 뒤 · 보정 게인 앞의 '통화' 스트림 감쇠(통화 모드에서만 1 미만).
            const streamTrim = outputContext.createGain();
            streamTrim.gain.value = trimGainFor(outputVolumeRef.current, streamTrimRef.current);
            const limiterScale = outputContext.createGain();
            limiterScale.gain.value = 1 / LIMITER_INPUT_RANGE;
            const limiter = outputContext.createWaveShaper();
            limiter.curve = buildLimiterCurve();
            limiter.oversample = "2x";
            outputGain.connect(compressor);
            compressor.connect(streamTrim);
            streamTrim.connect(makeup);
            makeup.connect(limiterScale);
            limiterScale.connect(limiter);
            if (outputElementFlag) outputSink = connectFinalToElement(outputContext, limiter);
            else limiter.connect(outputContext.destination);
            limiterNodes = [compressor, streamTrim, makeup, limiterScale, limiter];
            streamTrimNodeRef.current = streamTrim;
            speakerDynamicsRef.current = { compressor, makeup };
            applySpeakerDynamics(speakerDynamicsRef.current, outputVolumeRef.current, true);
          } catch (e) {
            noteAudioError(e instanceof Error ? e.name : "unknown");
            outputSink?.release();
            outputSink = null;
            if (outputElementFlag) outputSink = connectFinalToElement(outputContext, outputGain);
            else outputGain.connect(outputContext.destination);
          }
          if (!outputElementFlag) noteOutputSink("context"); // §137 E1
          // T190-3(G455) — 스피커 버튼 음량 모드 반영(위 초기값 = 통화 모드 = 같은 값. 연결 전에 바뀌었으면 여기서 맞춘다).
          if (outputVolumeRef.current.gain !== GEMINI_OUTPUT_GAIN) outputGain.gain.value = outputVolumeRef.current.gain;
          outputGainNodeRef.current = outputGain;
          registerOutputGain(outputGain);
          // `micReady` = 오디오 컨텍스트 준비(마이크 권한은 받기 때 병렬로 받는다 — `acceptToMicMs`).
          // 2026-10-27부터 Live 연결과 병렬이라 `micToConnectMs`(이 표시 → 연결 완료)는 음수일 수 있다(= 연결이 먼저 끝났다).
          markCallSetup("micReady", performance.now());
          log("audio contexts ready (Live connect runs in parallel)");
          // 정리가 이미 돌았으면(끊기 · 언마운트) 쌓인 메시지를 처리하지 않는다.
          if (cancelled) return;
          liveMessageGate.open();
        };
        outputReady = setupCallOutput();
        // 연결이 먼저 실패해도 처리되지 않은 rejection이 남지 않게 한다(실제 처리는 아래 `await outputReady`).
        outputReady.catch(() => {});

        session = await openLive(0);
        const connectResolvedAt = performance.now();
        // 연결은 출력 준비를 기다리지 않았다 — 맥락 주입 · 오프닝 전에 출력 준비(마이크 대기 포함)를 마저 기다린다.
        await outputReady;

        if (cancelled) {
          cleanup();
          return;
        }
        log("connect() resolved");
        // 입력 · 출력 컨텍스트는 병렬 출력 준비(`setupCallOutput`)가 만들었다 — 정리로 빠진 경우는 바로 위 `cancelled`에서 끝났다.
        const readyInput = inputContext as AudioContext | null;
        if (!readyInput || !outputContext) throw new Error("call-audio-not-ready");
        // 같은 값을 다시 담는 것은 타입 좁히기용이다(값은 그대로 — 클로저 안 대입은 TS가 이 흐름에서 보지 못한다).
        inputContext = readyInput;
        markCallSetup("connectResolved", connectResolvedAt);
        // 타이핑 입력(textMessage effect)이 이 세션에 닿을 수 있도록 노출한다.
        liveSessionRef.current = session;
        // §71.5(G431) — 타이핑 · 지시 effect는 이 함수로만 텍스트 턴을 넣는다(보류 큐 경유).
        requestClientTurnRef.current = (turn: ClientTurn) =>
          dispatchClientTurn({ type: "request", turn, nowMs: performance.now() });
        // §82.4(T1) — 문자 · 확인 권유 안내는 이 함수로만 넣는다(맥락 주입 · 큐 밖).
        injectContextRef.current = injectContext;
        // PR-A2 리뷰 Minor 1 — 연결 전(또는 재마운트 공백)에 도착해 못 보낸 맥락 주입 슬롯을 지금 보낸다(전달되면 부모에 알려 비운다).
        const pendingContext = pendingContextTurnRef.current;
        if (pendingContext && !handlersRef.current.isHangupLatched() && injectContext(pendingContext.text, pendingContext.delivery)) {
          pendingContextTurnRef.current = null;
          handlersRef.current.onContextTurnDelivered?.(pendingContext.seq);
        }

        // 마이크가 준비된 뒤에만 오프닝을 보낸다 — 첫 사용자는 권한 창을 보는 중일 수 있다(그동안 사기범이 먼저 말하지
        // 않게). 거부면(`null`) 받기 경로가 이 세션을 내리고 폴백으로 간다 — 여기서는 아무것도 보내지 않는다.
        // 권한이 이미 있으면 마이크가 연결보다 먼저 끝나 기다림 0이다(`connectToOpeningSentMs`로 관찰).
        const micStream = await micRequest;
        if (cancelled || !micStream) {
          stopStream(micStream);
          return;
        }
        stream = micStream;
        registerMicTrack(micStream.getAudioTracks()[0] ?? null);
        // §105 — 마이크 진단 한 줄을 20초마다 남긴다(응답 0턴이면 `[gemini-latency]` 요약이 없어 "말이 갔는가"를 가릴 수 없었다).
        micLogTimer = setInterval(() => {
          if (!cancelled) console.info(formatMicLine());
        }, MIC_LOG_INTERVAL_MS);

        // 사용자 신고(2026-07-24) — 연결 직후 캐릭터가 먼저 말을 걸도록 트리거를 보낸다. onopen
        // 콜백(위)이 아니라 connect()가 실제로 resolve된 직후에 보내는 이유: onopen은 소켓 이벤트라
        // connect()의 반환 Promise가 아직 resolve되기 전에 먼저 발화할 수 있어(session 변수가 아직
        // 할당되기 전), 여기서 보내는 것이 session이 확실히 non-null임을 보장하는 가장 이른 지점이다.
        // §71.5 — 오프닝도 보류 큐로 보낸다(이 시점엔 큐가 비어 즉시 나간다). 그래야 첫 응답이 오기 전에
        // 들어온 타이핑이 오프닝을 끊지 않는다. 전송 실패는 `sendClientTurn`이 삼킨다(P-4 — 사용자가 먼저
        // 말을 걸면 대화는 정상적으로 이어진다).
        // §99 — 다시 연결된 세션이면 오프닝 대신 지금까지의 대화 맥락을 첫 턴으로 보낸다(같은 보류 큐 · 같은 종류 — 미기록).
        const resumeText = resumeTurnRef.current;
        dispatchClientTurn(
          resumeText
            ? { type: "request", turn: { kind: "opening", text: resumeText }, nowMs: performance.now() }
            : { type: "request", turn: { kind: "opening", text: OPENING_TRIGGER_TURN }, nowMs: performance.now() },
        );

        // 마이크 → PCM16 16kHz → 전송. ScriptProcessor는 구식이지만 AudioWorklet과 달리 별도
        // 워커 파일 없이 동작해, 정적 export 구성(next.config.ts)에서 추가 배포 산출물이 없다.
        const micSource = inputContext.createMediaStreamSource(micStream);
        micSourceNode = micSource;

        // 사용자 발화 파형 인디케이터용 병렬 탭(2026-07-24, 사용자 신고 — "일단 잘 파악하는지
        // 보고 싶다"는 진단 목적 + 실제 UX). micSource를 기존 processor 체인과 완전히 별개로
        // AnalyserNode에도 연결한다 — 아래 무음 게인 노드(스피커 반향 차단용 병렬 연결)와 정확히
        // 동일한 "같은 소스를 추가 노드에 병렬로 붙인다" 기법이라, 서버로 보내는 기존 캡처·전송
        // 경로(PCM16 변환·sendRealtimeInput)는 전혀 건드리지 않는다.
        const userLevelAnalyser = inputContext.createAnalyser();
        userLevelAnalyser.fftSize = 256;
        micSource.connect(userLevelAnalyser);
        const userLevelData = new Uint8Array(userLevelAnalyser.frequencyBinCount);
        // 무음 대비 RMS 편차 문턱값(128 기준) — 조용한 방 배경잡음보다는 크고 정상 발화보다는
        // 작게 잡은 경험적 초기값이다. 실측 튜닝값이 아니다 — 마이크 하드웨어가 없는 환경이라
        // 이 값 자체는 실제 브라우저 사용자 테스트로 재검증이 필요하다(사용자 안내 사항).
        const USER_SPEECH_AMPLITUDE_THRESHOLD = 10;
        // 단어 사이 짧은 순간적 침묵에 파형이 깜빡이지 않도록 AI 발화 인디케이터(markSpeaking)와
        // 동일한 off-디바운스 방식을 쓴다.
        const USER_SPEECH_OFF_DELAY_MS = 400;
        const sampleUserLevel = () => {
          if (cancelled) return;
          userLevelAnalyser.getByteTimeDomainData(userLevelData);
          const rms = computeRmsFromByteTimeDomain(userLevelData);
          // AI가 말하는 동안엔(agentSpeaking) 스피커 반향이 마이크로 섞여 들어올 수 있어(에코
          // 캔슬이 100%는 아님, 위 반이중 주석 참고) 사용자 파형을 억제한다 — onaudioprocess의
          // 반이중 판단과 동일한 근거. 음소거 중에도 억제한다.
          const suppressed = agentSpeaking || mutedRef.current;
          const nextState = nextUserSpeechDebounceState(userSpeechDebounceState, {
            rms,
            threshold: USER_SPEECH_AMPLITUDE_THRESHOLD,
            suppressed,
            nowMs: performance.now(),
            offDelayMs: USER_SPEECH_OFF_DELAY_MS,
          });
          if (nextState.speaking !== userSpeechDebounceState.speaking) {
            handlersRef.current.onUserSpeakingChange(nextState.speaking);
          }
          // 리뷰 M3 — 발화 시작(레벨 꺼짐→켜짐)도 사용자 발화로 본다(침묵 넛지 취소 — 전사는 발화 뒤에 온다).
          if (localSpeechStarted(userSpeechDebounceState.speaking, nextState.speaking)) noteUserSpeechForNudge();
          userSpeechDebounceState = nextState;
          // ⭐ §105.2.6 — 이 기기 레벨로는 말했는데 서버 인식 0 · 모델 무응답이면 "잘 안 들렸다" 한 줄(판정표 `unheardReply.ts`).
          // 막힘(1행) = 사기범이 말하는 중(반이중 게이트) · 모델 응답 대기/진행 · 도구 대기 · 음소거 · 끊기 래치 · 화면 가려짐.
          const nowFrameMs = performance.now();
          const unheard = stepUnheardReply(unheardReplyState, {
            type: "frame",
            nowMs: nowFrameMs,
            level: rms,
            blocked:
              agentSpeaking ||
              mutedRef.current ||
              handlersRef.current.isHangupLatched() ||
              clientTurnState.modelTurnActive ||
              clientTurnState.awaitingSince !== null ||
              clientTurnState.toolPending ||
              (typeof document !== "undefined" && document.visibilityState === "hidden"),
          });
          unheardReplyState = unheard.state;
          if (unheard.fire) {
            noteUnheardReplyFired();
            console.info(LIVE_TURN_LOG_PREFIX, `unheard-reply fired n=${unheardReplyState.fired}`);
            dispatchClientTurn({ type: "request", turn: { kind: "silence", text: UNHEARD_REPLY_TEXT }, nowMs: nowFrameMs });
          }
          userLevelRafId = requestAnimationFrame(sampleUserLevel);
        };
        userLevelRafId = requestAnimationFrame(sampleUserLevel);

        processor = inputContext.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
        const inputRate = inputContext.sampleRate;
        processor.onaudioprocess = (event) => {
          if (cancelled || !session) return;
          // §105 — 보내지 않은 이유를 센다(진단 패널 `mic.*` · `[live-mic]`).
          if (mutedRef.current) {
            noteMicFrame("mute");
            return;
          }
          // ⭐ T192 C5(§79.8 R2 ① · G510) — 승인 · 종료 래치 뒤에는 마이크 프레임을 보내지 않는다(마지막 대사가 끊기지 않게).
          if (handlersRef.current.isHangupLatched()) return;
          // 반이중: AI가 말하는 동안엔 마이크를 보내지 않아 에코가 AI를 끊지 못하게 한다.
          if (agentSpeaking) {
            noteMicFrame("echo");
            return;
          }
          const frame = event.inputBuffer.getChannelData(0);
          noteMicFrame("sent", peakOf(frame));
          const pcm = floatToPcm16(
            frame,
            inputRate,
            GEMINI_INPUT_SAMPLE_RATE,
          );
          try {
            session.sendRealtimeInput({
              audio: {
                data: pcm16ToBase64(pcm),
                mimeType: `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`,
              },
            });
          } catch {
            // 전송 실패는 무시하고 다음 프레임을 보낸다 — 한 프레임 때문에 통화를 끊지 않는다.
          }
        };
        micSource.connect(processor);
        // ScriptProcessor는 destination에 연결돼야 콜백이 돈다. 무음 게인으로 스피커 반향을 막는다.
        const silence = inputContext.createGain();
        silence.gain.value = 0;
        processor.connect(silence);
        silence.connect(inputContext.destination);
        silenceNode = silence;
        // §99 — 복귀 뒤 마이크를 다시 열었을 때 같은 분석 · 전송 노드에 새 소스를 붙인다(옛 트랙은 닫는다). 컨텍스트 · 노드는 그대로다.
        const activeInput = inputContext;
        const activeProcessor = processor;
        replaceMicStream = (next: MediaStream) => {
          const previous = stream;
          micSourceNode?.disconnect();
          const nextSource = activeInput.createMediaStreamSource(next);
          nextSource.connect(userLevelAnalyser);
          nextSource.connect(activeProcessor);
          micSourceNode = nextSource;
          stream = next;
          registerMicTrack(next.getAudioTracks()[0] ?? null);
          if (previous && previous !== next) stopStream(previous);
        };
        log("mic pipeline attached");
      } catch (err) {
        log("connect threw", err);
        noteAudioError(err instanceof Error ? err.name : "unknown");
        // 병렬로 돌던 출력 준비가 끝난 뒤 정리한다(먼저 정리하면 뒤늦게 만든 출력 컨텍스트가 닫히지 않고 남는다).
        await outputReady?.catch(() => {});
        if (!cancelled) {
          cleanup();
          handlersRef.current.onError();
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 부모의 종료 요청(통화 종료 버튼) — 세션과 마이크를 즉시 닫는다.
  useEffect(() => {
    if (stopSignal <= 0) return;
    // §99 — 이 close는 사용자 종료다(가려짐 재연결 판정에 걸리지 않게 먼저 표시한다).
    stopRequestedRef.current = true;
    cleanupRef.current?.();
  }, [stopSignal]);

  // 타이핑 입력(사용자 신고 2026-07-25) — 같은 Live 세션에 텍스트 턴으로 넣는다. 음성 응답은
  // 평소 경로(onmessage → 오디오 재생)로 그대로 돌아오므로 목소리가 겹치지 않는다.
  //
  // ⚠️ 전사 기록을 여기서 올린다 — 타이핑한 문장은 마이크를 타지 않아 서버의 inputTranscription에
  // 잡히지 않는다. 이걸 빠뜨리면 리포트가 "사용자가 아무 말도 안 했다"고 보게 되어(속았는지 판정
  // 불가) 타이핑으로 한 훈련은 리포트에서 통째로 사라진다.
  //
  // ⭐⭐ §57.4 D3(G369) — **즉시 `onTranscriptTurn`을 부르지 않는다.** 과거엔 여기서 바로 불렀는데,
  // 음성 입력·모델 발화는 `turnComplete`에서만 flush되는 반면 타이핑은 입력 즉시 기록돼 **기록
  // 시계가 둘**이었다(§57.4 (1)). 모델 턴이 진행 중일 때 타이핑하면 그 텍스트가 아직 flush되지
  // 않은 사기범 발화보다 먼저 기록되어 `scammer(i)↔user(i+1)` 짝짓기(analyzeConversation)가 깨졌다.
  // 이제 음성 입력과 같은 자리(`userBuffer`)에 넣어 다음 `flushTranscript()`(turnComplete 또는 onclose)에서
  // 함께 내보낸다 — 유실 없음.
  //
  // ⭐ §71.5(G431) — 이제 세션에 직접 보내지 않고 보류 큐에 넣는다. 사기범이 말하는 중이면 그 턴이 끝난
  // 뒤에 나간다(3.8은 즉시 보내면 사기범 말을 끊는다). 전사 적립도 큐가 **실제로 보낼 때** 한다.
  useEffect(() => {
    if (!textMessage || !textMessage.text.trim()) return;
    requestClientTurnRef.current?.({ kind: "text", text: textMessage.text });
    // seq가 바뀔 때만 1회 전송한다(stopSignal과 동일한 카운터 패턴).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textMessage?.seq]);

  // T68 — 문자 도착 announce 지시 주입(UX-027/UF-008). textMessage와 같은 경로지만 **전사에
  // 기록하지 않는다**(사용자 발화가 아니라 오케스트레이션 신호 — OPENING_TRIGGER_TURN과 동일 취지).
  // 실패해도 문자는 이미 도착해 있으므로 학습 가치는 보존된다(배너·문자함은 대사와 무관, P-4).
  // ⭐ §82.4(T1 · G542) — 문자 · 확인 권유 안내는 맥락 주입(`turnComplete:false`)으로 **즉시** 넣는다. 화자 전환
  // 첫 발화(확인 창구 재연결 지시)만 `relayGreeting` 텍스트 턴으로 보류 큐(§71.5)를 탄다.
  useEffect(() => {
    if (!instructionTurn || !instructionTurn.text.trim()) return;
    if (sendsAsContextInjection(instructionTurn.delivery)) {
      injectContextRef.current?.(instructionTurn.text, instructionTurn.delivery ?? "verifyAnnounce");
    } else {
      requestClientTurnRef.current?.({ kind: "relayGreeting", text: instructionTurn.text });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructionTurn?.seq]);

  // PR-A2(audit-A R1 · R8) — G31 큐 밖 맥락 주입(확인 결과 신호 · 자동 호 전환 실패). **위 instructionTurn effect보다 뒤에
  // 선언한다** — 같은 렌더에서 도착 안내와 결과 신호가 함께 바뀌면 안내가 먼저 나가야 한다(결과 신호는 "이 문자"를 가리킨다).
  // `turnComplete:false`(맥락 주입 함수 경유 — X5)이고 전사에 기록하지 않는다(G105). 래치 뒤에는 넣지 않는다(G510).
  useEffect(() => {
    if (!contextTurn || !contextTurn.text.trim()) return;
    if (handlersRef.current.isHangupLatched()) return;
    // PR-A2 리뷰 Minor 1 — 세션이 아직 없으면(연결 전 · 재마운트 공백) 버리지 않고 쥐었다가 연결 직후 보낸다. 전달되면 부모가 슬롯을
    // 비운다(`onContextTurnDelivered`) — 다음 재마운트가 같은 지시를 다시 넣지 않는다(중복 0).
    if (injectContextRef.current?.(contextTurn.text, contextTurn.delivery)) {
      pendingContextTurnRef.current = null;
      handlersRef.current.onContextTurnDelivered?.(contextTurn.seq);
    } else {
      pendingContextTurnRef.current = contextTurn;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextTurn?.seq]);

  // T118 / A5-α — 전환 상태 단언 재주입(§25.3). **위 instructionTurn effect보다 뒤에 선언한다**:
  // 같은 렌더에서 둘이 함께 바뀌면 지시가 먼저 나가야 한다(§25.4 A5-α 결정론 계약). α는 응답을
  // 유발하지 않아 실질 순서는 무관하지만, 순서가 정해져 있지 않으면 재현 불가능한 관찰이 생긴다.
  //
  // ⚠️ `turnComplete: false`가 핵심이다 — 이 턴은 컨텍스트에 상태를 얹을 뿐 **모델 차례를 넘기지
  // 않는다.** true로 바꾸면 주입이 곧 발화를 유발해 사기범이 한 턴에 두 번 말한다(§25.3 (4)).
  // ⚠️ 전사에 기록하지 않는다(G105) — 사용자 발화가 아니라 오케스트레이션 신호다.
  useEffect(() => {
    if (!personaStateTurn || !personaStateTurn.text.trim()) return;
    const session = liveSessionRef.current;
    if (!session) return;
    try {
      if (agentSpeakingRef.current) noteContextWhileSpeaking(); // §135 진단
      session.sendClientContent({ turns: personaStateTurn.text, turnComplete: false });
      log("personaStateTurn", personaStateTurn.seq, personaStateTurn.text.slice(0, 12));
    } catch {
      // 무시 — 통화는 계속된다(P-4 비차단). 다음 사용자 턴 경계에서 다시 due가 된다.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaStateTurn?.seq]);

  return null;
}
