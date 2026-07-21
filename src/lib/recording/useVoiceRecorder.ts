"use client";

// MediaRecorder 래퍼(마이크 전용) — UX-002 본인 목소리 녹음 (Track C, T3, AC-018/AC-020).
// getUserMedia로 마이크 스트림만 확보하고 MediaRecorder로 오디오를 캡처한다.
// <input type="file">·드래그드롭 등 업로드 경로는 이 모듈에도, 어떤 화면에도 두지 않는다
// (Architecture.md §6.1 — "타인 음성 무단 등록 경로가 UI에 없음"이 AC-020 클라이언트측 절반).
import { useCallback, useEffect, useRef, useState } from "react";

// 대본(SCRIPT_TEXT, record 화면)은 30초 낭독 분량으로 작성됨(UX-002) — 도달 시 자동 정지.
export const MAX_RECORDING_SECONDS = 30;
// "클론 생성" 활성화 최소 길이. UX.md Validation은 "≈30초 미달 시 비활성"이라고만 하고 정확한
// 하한을 정하지 않아, 조기 정지로 인한 왕복 재녹음을 줄이도록 여유(10초)를 둔 값이다(judgment call).
export const MIN_RECORDING_SECONDS = 20;

export type RecorderStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopped"
  | "permission-denied"
  | "unsupported"
  | "error";

export type VoiceRecorderState = {
  status: RecorderStatus;
  elapsedSeconds: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  mimeType: string | null;
  errorMessage: string | null;
};

export type VoiceRecorderControls = {
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
};

const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return undefined;
  }
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

const initialState: VoiceRecorderState = {
  status: "idle",
  elapsedSeconds: 0,
  audioBlob: null,
  audioUrl: null,
  mimeType: null,
  errorMessage: null,
};

export function useVoiceRecorder(): VoiceRecorderState & VoiceRecorderControls {
  const [state, setState] = useState<VoiceRecorderState>(initialState);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, [clearTimer]);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState((prev) => ({
        ...prev,
        status: "unsupported",
        errorMessage: "이 브라우저에서는 마이크 녹음을 지원하지 않습니다.",
      }));
      return;
    }

    setState((prev) => ({ ...prev, status: "requesting-permission", errorMessage: null }));

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState((prev) => ({
        ...prev,
        status: "permission-denied",
        errorMessage: "마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용한 뒤 다시 시도해 주세요.",
      }));
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickSupportedMimeType();

    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      stopStream();
      setState((prev) => ({
        ...prev,
        status: "error",
        errorMessage: "녹음을 시작하지 못했습니다. 다시 시도해 주세요.",
      }));
      return;
    }

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const blobType = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: blobType });
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      stopStream();
      setState((prev) => ({
        ...prev,
        status: "stopped",
        audioBlob: blob,
        audioUrl: url,
        mimeType: blobType,
      }));
    };

    recorder.start();
    setState((prev) => ({ ...prev, status: "recording", elapsedSeconds: 0 }));

    let seconds = 0;
    timerRef.current = setInterval(() => {
      seconds += 1;
      setState((prev) => ({ ...prev, elapsedSeconds: seconds }));
      if (seconds >= MAX_RECORDING_SECONDS) {
        stop();
      }
    }, 1000);
  }, [stop, stopStream]);

  const reset = useCallback(() => {
    clearTimer();
    stopStream();
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    chunksRef.current = [];
    setState(initialState);
  }, [clearTimer, stopStream]);

  // 언마운트 시 스트림/타이머/objectURL 정리(메모리·마이크 점유 누수 방지).
  useEffect(() => {
    return () => {
      clearTimer();
      stopStream();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, start, stop, reset };
}
