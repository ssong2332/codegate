"use client";

// Gemini Live 실시간 speech-to-speech 세션 본체 (UX-014 live phase, 2026-07-22 무료 경로).
//
// ⚠️ RealtimeVoiceSession(ElevenLabs)과 마찬가지로 **지연 로딩 전용**이다 — 서버가 자격증명을
// 준 경우에만 마운트한다. 화면 요소는 없고(렌더링 null) 세션 생명주기만 관리한다.
//
// ElevenLabs SDK는 마이크/스피커를 대신 다뤄줬지만 Live API는 오디오를 직접 흘려보내야 한다:
//   보내기: 마이크 Float32 → 16kHz PCM16 → base64 → sendRealtimeInput
//   받기:   base64 PCM16(24kHz) → Float32 → AudioBuffer 큐로 순차 재생
// 재생은 "다음 버퍼 시작 시각"을 누적해 이어붙인다 — 청크마다 즉시 start()하면 겹치거나 끊긴다.
//
// 보안 메모: 여기서 넘기는 건 서버가 발급한 단기 토큰뿐이다. 모델·시스템 프롬프트·도구는 토큰
// 발급 시점에 서버가 고정했으므로(liveConnectConstraints) 이 파일이 프롬프트를 알 필요도, 알 수도
// 없다(ADR-0004).
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
  stopSignal: number;
  muted: boolean;
};

/** 마이크 캡처 버퍼 크기 — 작을수록 지연이 낮지만 콜백이 잦다. 4096은 통화용으로 무난한 절충. */
const CAPTURE_BUFFER_SIZE = 4096;

export default function GeminiVoiceSession({
  credentials,
  onActive,
  onEnded,
  onError,
  onSpeakingChange,
  stopSignal,
  muted,
}: GeminiVoiceSessionProps) {
  const handlersRef = useRef({ onActive, onEnded, onError, onSpeakingChange });
  const mutedRef = useRef(muted);
  const startedRef = useRef(false);
  // 정리 대상들 — 언마운트 시 전부 닫지 않으면 마이크가 계속 열려 있다.
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    handlersRef.current = { onActive, onEnded, onError, onSpeakingChange };
  }, [onActive, onEnded, onError, onSpeakingChange]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let inputContext: AudioContext | null = null;
    let outputContext: AudioContext | null = null;
    let processor: ScriptProcessorNode | null = null;
    let session: { sendRealtimeInput: (i: unknown) => void; close: () => void } | null = null;
    // 받은 오디오를 이어붙일 다음 재생 시작 시각(출력 컨텍스트 시간축 기준).
    let nextPlayTime = 0;
    let speakingTimer: ReturnType<typeof setTimeout> | null = null;

    const markSpeaking = () => {
      handlersRef.current.onSpeakingChange(true);
      if (speakingTimer) clearTimeout(speakingTimer);
      // 오디오 청크가 끊기면 곧 "말이 끝났다"고 본다 — 서버가 turnComplete를 늦게 줄 수도 있어
      // 파형 인디케이터가 계속 켜져 있는 것을 막는 안전장치다.
      speakingTimer = setTimeout(() => handlersRef.current.onSpeakingChange(false), 600);
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
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        outputContext = new AudioContext({ sampleRate: GEMINI_OUTPUT_SAMPLE_RATE });
        inputContext = new AudioContext();

        // 토큰을 API 키 자리에 그대로 넣는다(문서 지침). 키 자체는 서버에만 있다.
        const ai = new GoogleGenAI({ apiKey: credentials.geminiToken });
        session = (await ai.live.connect({
          model: credentials.geminiModel,
          // 모델·프롬프트·도구는 토큰에 고정돼 있어 여기서 다시 보내지 않는다.
          config: { responseModalities: [Modality.AUDIO] },
          callbacks: {
            onopen: () => {
              if (!cancelled) handlersRef.current.onActive();
            },
            onmessage: (message: {
              data?: string;
              serverContent?: { interrupted?: boolean; turnComplete?: boolean };
            }) => {
              if (cancelled || !outputContext) return;

              // 사용자가 말을 끊으면 큐에 남은 재생을 버리고 시간축을 리셋한다.
              if (message.serverContent?.interrupted) {
                nextPlayTime = 0;
                handlersRef.current.onSpeakingChange(false);
                return;
              }
              if (message.serverContent?.turnComplete) {
                handlersRef.current.onSpeakingChange(false);
              }
              if (!message.data) return;

              const samples = base64ToFloat32(message.data);
              if (samples.length === 0) return;
              const buffer = outputContext.createBuffer(
                1,
                samples.length,
                GEMINI_OUTPUT_SAMPLE_RATE,
              );
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
            onerror: () => {
              if (!cancelled) handlersRef.current.onError();
            },
            onclose: () => {
              if (!cancelled) handlersRef.current.onEnded();
            },
          },
        })) as unknown as typeof session;

        if (cancelled) {
          cleanup();
          return;
        }

        // 마이크 → PCM16 16kHz → 전송. ScriptProcessor는 구식이지만 AudioWorklet과 달리 별도
        // 워커 파일 없이 동작해, 정적 export 구성(next.config.ts)에서 추가 배포 산출물이 없다.
        const source = inputContext.createMediaStreamSource(stream);
        processor = inputContext.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
        const inputRate = inputContext.sampleRate;
        processor.onaudioprocess = (event) => {
          if (cancelled || !session || mutedRef.current) return;
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
        source.connect(processor);
        // ScriptProcessor는 destination에 연결돼야 콜백이 돈다. 무음 게인으로 스피커 반향을 막는다.
        const silence = inputContext.createGain();
        silence.gain.value = 0;
        processor.connect(silence);
        silence.connect(inputContext.destination);
      } catch {
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
