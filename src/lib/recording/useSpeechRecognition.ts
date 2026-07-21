"use client";

// 브라우저 음성 인식(STT) 래퍼 — 실시간 음성 통화 전환(2026-07-22 사용자 결정, Phase A).
// useVoiceRecorder.ts와 동일한 상태머신 패턴(idle/permission-denied/unsupported/error)을 따른다.
// 표준 TS lib에 SpeechRecognition 타입이 없어(비표준 Web API) 최소 형태를 이 파일에 직접 선언한다.
// 탭-투-토크 1턴 = 인식 1회(continuous:false) — 통화 중 매 턴 사용자가 말을 마치면 자동 종료된다.
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
};
type SpeechRecognitionErrorEventLike = { error: string };
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export type SpeechRecognitionStatus =
  | "idle"
  | "listening"
  | "processing"
  | "unsupported"
  | "permission-denied"
  | "error";

export type SpeechRecognitionState = {
  status: SpeechRecognitionStatus;
  transcript: string;
  errorMessage: string | null;
};

export type SpeechRecognitionControls = {
  start: () => void;
  stop: () => void;
  reset: () => void;
};

const initialState: SpeechRecognitionState = {
  status: "idle",
  transcript: "",
  errorMessage: null,
};

export function useSpeechRecognition(): SpeechRecognitionState & SpeechRecognitionControls {
  const [state, setState] = useState<SpeechRecognitionState>(initialState);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setState((prev) => ({
        ...prev,
        status: "unsupported",
        errorMessage: "이 브라우저는 음성 인식을 지원하지 않습니다.",
      }));
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setState((prev) => ({ ...prev, status: "processing", transcript }));
    };

    recognition.onerror = (event) => {
      const isPermission = event.error === "not-allowed" || event.error === "service-not-allowed";
      setState((prev) => ({
        ...prev,
        status: isPermission ? "permission-denied" : "error",
        errorMessage: isPermission
          ? "마이크 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용한 뒤 다시 시도해 주세요."
          : "음성 인식에 실패했습니다. 다시 시도하거나 텍스트로 입력해 주세요.",
      }));
    };

    recognition.onend = () => {
      // onresult가 먼저 오지 않고 침묵/취소로 바로 끝난 경우 idle로 되돌린다(에러 상태는 유지).
      setState((prev) => (prev.status === "listening" ? { ...prev, status: "idle" } : prev));
    };

    recognitionRef.current = recognition;
    setState({ status: "listening", transcript: "", errorMessage: null });
    recognition.start();
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState(initialState);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { ...state, start, stop, reset };
}
