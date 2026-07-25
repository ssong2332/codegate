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

export type GeminiVoiceSessionProps = {
  credentials: CreateRealtimeCallResponse;
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
  stopSignal: number;
  muted: boolean;
};

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
const OPENING_TRIGGER_TURN =
  "(전화가 방금 연결됐다. 지금 막 전화를 받은 상대에게 캐릭터로서 자연스럽게 첫 마디를 건네라. 다짜고짜 요구나 압박부터 하지 말고, 먼저 신분(사칭 기관·관계)과 전화를 건 이유를 1~2문장으로 밝히며 상황을 설명한 뒤에 이어가라.)";

// 이름 있는 타입으로 분리한 이유 — `let session: T | null` 선언부에서 `T`를 인라인으로 쓰면
// `session = (...) as unknown as typeof session`처럼 자기참조 캐스트를 할 때, 같은 표현식 안의
// 콜백 클로저(onclose 등)가 session을 참조하는 것과 얽혀 TS가 타입을 `never`로 좁혀버리는 문제가
// 있었다(실측). 이름 있는 타입으로 자기참조를 없애 해결한다.
type GeminiLiveSession = {
  sendRealtimeInput: (i: unknown) => void;
  sendClientContent: (i: { turns?: unknown; turnComplete?: boolean }) => void;
  close: () => void;
};

const log = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.info("[gemini]", ...args);
};

export default function GeminiVoiceSession({
  credentials,
  onActive,
  onEnded,
  onError,
  onSpeakingChange,
  onUserSpeakingChange,
  onTranscriptTurn,
  stopSignal,
  muted,
}: GeminiVoiceSessionProps) {
  const handlersRef = useRef({
    onActive,
    onEnded,
    onError,
    onSpeakingChange,
    onUserSpeakingChange,
    onTranscriptTurn,
  });
  const mutedRef = useRef(muted);
  // 정리 대상들 — 언마운트 시 전부 닫지 않으면 마이크가 계속 열려 있다.
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    handlersRef.current = {
      onActive,
      onEnded,
      onError,
      onSpeakingChange,
      onUserSpeakingChange,
      onTranscriptTurn,
    };
  }, [onActive, onEnded, onError, onSpeakingChange, onUserSpeakingChange, onTranscriptTurn]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // startedRef로 재실행을 막지 않는다(2026-07-23) — React Strict Mode(dev)는 mount→cleanup→mount를
  // 하는데, startedRef가 있으면 재mount 때 연결을 건너뛰어 "연결하는 중"에 갇힌다. 대신 각 실행이
  // 자기 cancelled 플래그로 정리하므로, 버려지는 첫 실행은 connect 전에 취소되고(토큰 소모 없음)
  // 진짜 실행이 새로 연결한다.
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let inputContext: AudioContext | null = null;
    let outputContext: AudioContext | null = null;
    let processor: ScriptProcessorNode | null = null;
    let session: GeminiLiveSession | null = null;
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
    let speakingTimer: ReturnType<typeof setTimeout> | null = null;
    // 반이중(half-duplex): AI가 말하는 동안엔 마이크 프레임을 보내지 않는다. 스피커→마이크 에코가
    // 민감한 VAD에 사용자 발화로 오인돼 AI가 자기 말을 끊는 것을 막는 핵심 장치(에코 제거만으론
    // 노트북 스피커에서 부족). AI 발화가 끝나면(turnComplete/침묵) 다시 열린다.
    let agentSpeaking = false;
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

    const flushTranscript = () => {
      const u = userBuffer.trim();
      const s = scammerBuffer.trim();
      if (u) handlersRef.current.onTranscriptTurn("user", u);
      if (s) handlersRef.current.onTranscriptTurn("scammer", s);
      userBuffer = "";
      scammerBuffer = "";
    };

    // 자기 말 끊김 버그 수정(2026-07-25, 사용자 신고 "대화가 자연스럽지 않다") — 예전엔 이 타이머가
    // **청크 도착** 시점 기준 고정 600ms였다. Gemini는 오디오를 실시간보다 빠르게 스트리밍하므로
    // (4초짜리 발화의 청크가 1초 만에 다 도착할 수 있다) agentSpeaking이 **재생이 끝나기 한참 전에**
    // false로 떨어졌고, 그 순간 반이중 게이트(`if (agentSpeaking) return`)가 풀려 마이크가 다시
    // 열렸다 — 스피커로 나가던 AI 목소리가 마이크로 되돌아가 Gemini VAD가 이를 사용자 발화로 오인해
    // 자기 말을 스스로 끊는(interrupted) 일이 생길 수 있는 구조였다. 이제 **예약된 재생이 실제로
    // 끝나는 시각**(nextPlayTime) 기준으로 타이머를 잡는다.
    const SPEAKING_OFF_GRACE_MS = 250;
    const markSpeaking = () => {
      agentSpeaking = true;
      handlersRef.current.onSpeakingChange(true);
      if (speakingTimer) clearTimeout(speakingTimer);
      // 남은 재생 시간 + 약간의 여유. 서버가 turnComplete를 늦게 주거나 아예 안 줘도 파형이 계속
      // 켜져 있지 않도록 하는 안전장치라는 원래 역할은 그대로다.
      const remainingMs = outputContext
        ? Math.max(0, (nextPlayTime - outputContext.currentTime) * 1000)
        : 0;
      speakingTimer = setTimeout(() => {
        agentSpeaking = false;
        handlersRef.current.onSpeakingChange(false);
      }, remainingMs + SPEAKING_OFF_GRACE_MS);
    };

    const stopSpeaking = () => {
      agentSpeaking = false;
      if (speakingTimer) clearTimeout(speakingTimer);
      handlersRef.current.onSpeakingChange(false);
    };

    const cleanup = () => {
      if (speakingTimer) clearTimeout(speakingTimer);
      if (userLevelRafId !== null) cancelAnimationFrame(userLevelRafId);
      processor?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      void inputContext?.close().catch(() => {});
      void outputContext?.close().catch(() => {});
      try {
        session?.close();
      } catch {
        // 이미 닫혔으면 무시 — 종료는 항상 성공해야 한다(AC-006).
      }
      session = null;
    };
    cleanupRef.current = cleanup;

    (async () => {
      try {
        log("getUserMedia…");
        // 에코 제거/잡음 억제/자동 게인을 명시적으로 켠다(2026-07-23). 노트북 스피커로 나온 AI
        // 목소리가 마이크로 되돌아가면 Gemini가 그것을 사용자 발화로 오인해 자기 말에 끼어들거나
        // 반응해 "화자가 여러 명"처럼 들린다. 브라우저 기본값이 켜져 있어도 명시해 확실히 한다
        // (근본 해결은 헤드셋 사용).
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        outputContext = new AudioContext({ sampleRate: GEMINI_OUTPUT_SAMPLE_RATE });
        inputContext = new AudioContext();
        // 비동기 effect에서 만든 컨텍스트는 suspended로 시작할 수 있다 — 명시적으로 깨운다.
        await outputContext.resume().catch(() => {});
        await inputContext.resume().catch(() => {});
        log("audio contexts ready; connecting… model=", credentials.geminiModel);

        // 토큰을 API 키 자리에 그대로 넣는다(문서 지침). 단기 토큰은 v1alpha에서만 유효하다.
        const ai = new GoogleGenAI({
          apiKey: credentials.geminiToken,
          httpOptions: { apiVersion: "v1alpha" },
        });
        session = (await ai.live.connect({
          model: credentials.geminiModel,
          // 모델·프롬프트·도구·전사설정은 토큰에 고정돼 있어 여기서 다시 보내지 않는다.
          config: { responseModalities: [Modality.AUDIO] },
          callbacks: {
            onopen: () => {
              log("onopen ✓");
              if (!cancelled) handlersRef.current.onActive();
            },
            onmessage: (message: {
              data?: string;
              serverContent?: {
                interrupted?: boolean;
                turnComplete?: boolean;
                inputTranscription?: { text?: string };
                outputTranscription?: { text?: string };
              };
            }) => {
              if (cancelled || !outputContext) return;
              const sc = message.serverContent;

              // 전사 조각 누적(리포트 기록용). input=사용자 발화, output=사기범(모델) 발화.
              if (sc?.inputTranscription?.text) userBuffer += sc.inputTranscription.text;
              if (sc?.outputTranscription?.text) scammerBuffer += sc.outputTranscription.text;

              // 사용자가 말을 끊으면 예약된 재생을 전부 멈춰 새 응답과 겹치지 않게 한다.
              if (sc?.interrupted) {
                stopAllPlayback();
                stopSpeaking();
                return;
              }
              if (sc?.turnComplete) {
                stopSpeaking();
                flushTranscript();
              }
              if (!message.data) return;

              const samples = base64ToFloat32(message.data);
              if (samples.length === 0) return;
              const buffer = outputContext.createBuffer(1, samples.length, GEMINI_OUTPUT_SAMPLE_RATE);
              buffer.copyToChannel(samples, 0);
              const source = outputContext.createBufferSource();
              source.buffer = buffer;
              source.connect(outputContext.destination);
              // 이전 청크가 끝나는 시점에 이어붙인다(겹침·끊김 방지).
              const startAt = Math.max(outputContext.currentTime, nextPlayTime);
              source.start(startAt);
              nextPlayTime = startAt + buffer.duration;
              scheduledSources.add(source);
              source.onended = () => scheduledSources.delete(source);
              markSpeaking();
            },
            onerror: (e: unknown) => {
              log("onerror", e);
              if (!cancelled) handlersRef.current.onError();
            },
            onclose: (e: unknown) => {
              log("onclose", e);
              if (!cancelled) {
                flushTranscript();
                handlersRef.current.onEnded();
              }
            },
          },
        })) as unknown as GeminiLiveSession;

        if (cancelled) {
          cleanup();
          return;
        }
        log("connect() resolved");

        // 사용자 신고(2026-07-24) — 연결 직후 캐릭터가 먼저 말을 걸도록 트리거를 보낸다. onopen
        // 콜백(위)이 아니라 connect()가 실제로 resolve된 직후에 보내는 이유: onopen은 소켓 이벤트라
        // connect()의 반환 Promise가 아직 resolve되기 전에 먼저 발화할 수 있어(session 변수가 아직
        // 할당되기 전), 여기서 보내는 것이 session이 확실히 non-null임을 보장하는 가장 이른 지점이다.
        const activeSession = session;
        if (activeSession) {
          try {
            activeSession.sendClientContent({ turns: OPENING_TRIGGER_TURN, turnComplete: true });
          } catch {
            // 트리거 전송 실패는 무시 — 사용자가 먼저 말을 걸면 대화는 정상적으로 이어진다(핵심
            // 루프 비차단, P-4). AI가 먼저 말하지 않는 것으로 조용히 강등될 뿐 통화 자체는 안 막힌다.
          }
        }

        // 마이크 → PCM16 16kHz → 전송. ScriptProcessor는 구식이지만 AudioWorklet과 달리 별도
        // 워커 파일 없이 동작해, 정적 export 구성(next.config.ts)에서 추가 배포 산출물이 없다.
        const micSource = inputContext.createMediaStreamSource(stream);

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
          userSpeechDebounceState = nextState;
          userLevelRafId = requestAnimationFrame(sampleUserLevel);
        };
        userLevelRafId = requestAnimationFrame(sampleUserLevel);

        processor = inputContext.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
        const inputRate = inputContext.sampleRate;
        processor.onaudioprocess = (event) => {
          if (cancelled || !session || mutedRef.current) return;
          // 반이중: AI가 말하는 동안엔 마이크를 보내지 않아 에코가 AI를 끊지 못하게 한다.
          if (agentSpeaking) return;
          const pcm = floatToPcm16(
            event.inputBuffer.getChannelData(0),
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
        log("mic pipeline attached");
      } catch (err) {
        log("connect threw", err);
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
    cleanupRef.current?.();
  }, [stopSignal]);

  return null;
}
