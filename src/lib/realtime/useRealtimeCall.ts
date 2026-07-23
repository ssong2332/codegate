"use client";

// 실시간 음성 통화 상태 훅 (UX-014 live phase, 2026-07-22).
//
// ⚠️ 이 파일은 **@elevenlabs/react를 import하지 않는다**. 그 SDK는 livekit-client(WebRTC)를 끌어오고,
// 통화 화면 로드 시점에 항상 불러오면 WebRTC를 못 쓰는 환경에서 렌더러가 통째로 죽는다(실측 확인).
// 실제 SDK 사용은 RealtimeVoiceSession.tsx가 맡고, 그 컴포넌트는 서버가 "실시간 통화 가능"이라고
// 확인해 준 뒤에만 next/dynamic으로 지연 로딩된다. 이 훅은 그 판정까지의 상태만 관리한다.
//
// 상태머신은 useSpeechRecognition/useVoiceRecorder와 같은 관례를 따른다:
//   idle → connecting → active(대화 중) → ended
//   실패 경로: unsupported(마이크 API 없음) / permission-denied / error / fallback(실시간 불가)
import { useCallback, useEffect, useRef, useState } from "react";
import { createRealtimeCall } from "@/lib/api";
import type { CreateRealtimeCallResponse } from "@/lib/api";

export type RealtimeCallStatus =
  | "idle"
  | "connecting"
  | "active"
  | "ended"
  | "fallback"
  | "permission-denied"
  | "unsupported"
  | "error";

export type RealtimeCallState = {
  status: RealtimeCallStatus;
  /** 실시간 세션을 실제로 띄울 자격증명(있으면 RealtimeVoiceSession을 마운트한다). */
  credentials: CreateRealtimeCallResponse | null;
  /** 상대(사기범)가 지금 말하고 있는가 — 통화 화면 파형 인디케이터용. */
  isAgentSpeaking: boolean;
  /** RealtimeVoiceSession에 넘길 종료 신호(증가시키면 세션이 끊긴다). */
  stopSignal: number;
  errorMessage: string | null;
};

export type RealtimeCallControls = {
  /** 마이크 권한 확인 → 서명 URL 발급까지 진행한다. 실시간 불가면 fallback 상태로 끝난다. */
  start: (sessionId: string) => Promise<void>;
  /** 통화를 끊는다(훈련 종료·한도 도달 시). */
  stop: () => void;
  /** RealtimeVoiceSession이 올려주는 콜백들. */
  handleActive: () => void;
  handleEnded: () => void;
  handleError: () => void;
  handleSpeakingChange: (speaking: boolean) => void;
};

function hasMicrophoneSupport(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export function useRealtimeCall(): RealtimeCallState & RealtimeCallControls {
  const [status, setStatus] = useState<RealtimeCallStatus>("idle");
  const [credentials, setCredentials] = useState<CreateRealtimeCallResponse | null>(null);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [stopSignal, setStopSignal] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 언마운트 후 늦게 도착한 비동기 결과가 setState를 호출하지 않도록 가드한다.
  const mountedRef = useRef(true);
  // 안정적인 콜백(useCallback [])에서 현재 status를 읽기 위한 미러 — setState 업데이터 안에서
  // 다른 setState를 호출하는(순수하지 않은) 패턴을 피하려고 둔다. 렌더 중이 아니라 effect에서
  // 갱신한다(react-hooks/refs).
  const statusRef = useRef<RealtimeCallStatus>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 연결 타임아웃(2026-07-23 고착 버그 수정) — 자격증명을 세팅했는데 세션 컴포넌트가 일정 시간
  // 안에 active를 알려주지 않으면(연결이 매달리거나 조용히 닫힘), 무한 "연결하는 중"에 갇히지 않도록
  // 강제로 error로 떨어뜨려 텍스트 폴백으로 강등한다. Node 실측상 정상 연결은 ~2초면 setupComplete가
  // 오므로 12초는 충분히 여유 있는 상한이다.
  useEffect(() => {
    if (!credentials || status !== "connecting") return;
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        setStatus("error");
        setErrorMessage("통화 연결이 지연되어 텍스트로 진행합니다.");
      }
    }, 12000);
    return () => clearTimeout(timer);
  }, [credentials, status]);

  const start = useCallback(async (sessionId: string) => {
    if (!hasMicrophoneSupport()) {
      setStatus("unsupported");
      setErrorMessage("이 브라우저는 실시간 음성 통화를 지원하지 않아 텍스트로 진행합니다.");
      return;
    }

    setStatus("connecting");
    setErrorMessage(null);

    // ① 마이크 권한 — 실패하면 실시간 대화가 불가능하므로 즉시 폴백 안내로 전환한다.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 권한 확인용으로만 열었으므로 곧바로 닫는다 — 실제 캡처는 SDK가 자체적으로 다시 연다.
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      if (!mountedRef.current) return;
      setStatus("permission-denied");
      setErrorMessage(
        "마이크 권한이 필요합니다. 브라우저 설정에서 허용한 뒤 다시 시도하거나 텍스트로 진행해 주세요.",
      );
      return;
    }

    // ② 서명 URL 발급(서버) — ElevenLabs API 키는 서버에만 남는다.
    let issued: CreateRealtimeCallResponse;
    try {
      issued = await createRealtimeCall({ sessionId });
    } catch {
      if (!mountedRef.current) return;
      setStatus("error");
      setErrorMessage("통화를 시작하지 못했습니다. 텍스트로 진행해 주세요.");
      return;
    }
    if (!mountedRef.current) return;

    // ③ 실시간 대화 불가(키·설정 미비) → 텍스트 폴백. 조용히 넘어가지 않고 상태로 알린다.
    const hasUsableCredentials =
      (issued.provider === "elevenlabs" && Boolean(issued.signedUrl)) ||
      (issued.provider === "gemini" && Boolean(issued.geminiToken));
    if (issued.isMock || !hasUsableCredentials) {
      setStatus("fallback");
      return;
    }

    // ④ 자격증명을 세팅하면 통화 화면이 RealtimeVoiceSession(지연 로딩)을 마운트하고,
    //    그 컴포넌트가 실제 speech-to-speech 세션을 시작한 뒤 handleActive로 알려준다.
    setCredentials(issued);
  }, []);

  const stop = useCallback(() => {
    setStopSignal((n) => n + 1);
    setStatus((prev) => (prev === "active" ? "ended" : prev));
  }, []);

  const handleActive = useCallback(() => {
    if (mountedRef.current) setStatus("active");
  }, []);

  const handleEnded = useCallback(() => {
    if (!mountedRef.current) return;
    // 세션이 닫혔을 때: 이미 통화 중(active)이었으면 정상 종료(ended). 하지만 아직 connecting
    // 단계에서 닫혔다면(연결 실패로 서버가 곧장 close) "정상 종료"가 아니라 **연결 실패**다 —
    // 예전엔 이 경우 아무 전이도 안 해서 무한 "연결하는 중"에 갇혔다(2026-07-23 고착 버그의 핵심).
    // 이제 error로 떨어뜨려 텍스트 폴백으로 강등한다.
    if (statusRef.current === "active") {
      setStatus("ended");
    } else if (statusRef.current === "connecting") {
      setStatus("error");
      setErrorMessage("통화가 연결되지 못해 텍스트로 진행합니다.");
    }
  }, []);

  const handleError = useCallback(() => {
    if (!mountedRef.current) return;
    setStatus("error");
    setErrorMessage("통화 연결에 문제가 생겼습니다. 텍스트로 진행해 주세요.");
  }, []);

  const handleSpeakingChange = useCallback((speaking: boolean) => {
    if (mountedRef.current) setIsAgentSpeaking(speaking);
  }, []);

  return {
    status,
    credentials,
    isAgentSpeaking,
    stopSignal,
    errorMessage,
    start,
    stop,
    handleActive,
    handleEnded,
    handleError,
    handleSpeakingChange,
  };
}
