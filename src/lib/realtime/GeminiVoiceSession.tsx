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

export type GeminiVoiceSessionProps = {
  credentials: CreateRealtimeCallResponse;
  onActive: () => void;
  onEnded: () => void;
  onError: () => void;
  onSpeakingChange: (speaking: boolean) => void;
  /** 완성된 발화 1턴을 부모로 올린다(리포트 기록용, finding #1). role은 user/scammer. */
  onTranscriptTurn: (role: "user" | "scammer", text: string) => void;
  stopSignal: number;
  muted: boolean;
};

/** 마이크 캡처 버퍼 크기 — 작을수록 지연이 낮지만 콜백이 잦다. 4096은 통화용으로 무난한 절충. */
const CAPTURE_BUFFER_SIZE = 4096;

const log = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.info("[gemini]", ...args);
};

export default function GeminiVoiceSession({
  credentials,
  onActive,
  onEnded,
  onError,
  onSpeakingChange,
  onTranscriptTurn,
  stopSignal,
  muted,
}: GeminiVoiceSessionProps) {
  const handlersRef = useRef({ onActive, onEnded, onError, onSpeakingChange, onTranscriptTurn });
  const mutedRef = useRef(muted);
  // 정리 대상들 — 언마운트 시 전부 닫지 않으면 마이크가 계속 열려 있다.
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    handlersRef.current = { onActive, onEnded, onError, onSpeakingChange, onTranscriptTurn };
  }, [onActive, onEnded, onError, onSpeakingChange, onTranscriptTurn]);

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
    let session: { sendRealtimeInput: (i: unknown) => void; close: () => void } | null = null;
    // 받은 오디오를 이어붙일 다음 재생 시작 시각(출력 컨텍스트 시간축 기준).
    let nextPlayTime = 0;
    let speakingTimer: ReturnType<typeof setTimeout> | null = null;
    // 반이중(half-duplex): AI가 말하는 동안엔 마이크 프레임을 보내지 않는다. 스피커→마이크 에코가
    // 민감한 VAD에 사용자 발화로 오인돼 AI가 자기 말을 끊는 것을 막는 핵심 장치(에코 제거만으론
    // 노트북 스피커에서 부족). AI 발화가 끝나면(turnComplete/침묵) 다시 열린다.
    let agentSpeaking = false;
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

    const markSpeaking = () => {
      agentSpeaking = true;
      handlersRef.current.onSpeakingChange(true);
      if (speakingTimer) clearTimeout(speakingTimer);
      // 오디오 청크가 끊기면 곧 "말이 끝났다"고 본다 — 서버가 turnComplete를 늦게 줄 수도 있어
      // 파형 인디케이터가 계속 켜져 있는 것을 막는 안전장치다. 이 시점에 마이크도 다시 연다.
      speakingTimer = setTimeout(() => {
        agentSpeaking = false;
        handlersRef.current.onSpeakingChange(false);
      }, 600);
    };

    const stopSpeaking = () => {
      agentSpeaking = false;
      if (speakingTimer) clearTimeout(speakingTimer);
      handlersRef.current.onSpeakingChange(false);
    };

    const cleanup = () => {
      if (speakingTimer) clearTimeout(speakingTimer);
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

              // 사용자가 말을 끊으면 큐에 남은 재생을 버리고 시간축을 리셋한다.
              if (sc?.interrupted) {
                nextPlayTime = 0;
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
        })) as unknown as typeof session;

        if (cancelled) {
          cleanup();
          return;
        }
        log("connect() resolved");

        // 마이크 → PCM16 16kHz → 전송. ScriptProcessor는 구식이지만 AudioWorklet과 달리 별도
        // 워커 파일 없이 동작해, 정적 export 구성(next.config.ts)에서 추가 배포 산출물이 없다.
        const micSource = inputContext.createMediaStreamSource(stream);
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
