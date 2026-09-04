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
import { isPrefetchFresh as isPrefetchTimestampFresh } from "./prefetchFreshness";
import { toFallbackCredentials } from "./fallbackCredentials";

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
  /** 사용자 신고(2026-07-24, "내 말을 잘 듣고 있는지 보고 싶다") — 로컬 마이크(Gemini) 또는
   * SDK VAD 점수(ElevenLabs)로 판단한 "지금 사용자가 말하는 중"인가 — 사용자 측 파형 인디케이터용.
   * agentSpeaking과 동일한 boolean 계약이라 CallWaveform을 그대로 재사용할 수 있다. */
  isUserSpeaking: boolean;
  /** RealtimeVoiceSession에 넘길 종료 신호(증가시키면 세션이 끊긴다). */
  stopSignal: number;
  errorMessage: string | null;
  /** T158(§48.1 실측 14, §48.5.1) — `CreateRealtimeCallResponse.isMock`이 한 번이라도 true였는가
   * (sticky OR — false로 되돌리는 대입 0건, G278). 이 저장소에서 `isMock`을 읽는 유일한 기존
   * 지점(아래 `start()` 안)의 결과를 그대로 밖으로 노출한다 — 신규 read 0건. */
  isMock: boolean;
};

export type RealtimeCallControls = {
  /** 수신(전화 울림) 중 미리 자격증명만 받아 둔다(마이크 접근 없음, 실패해도 조용히 무시 — start()가
   * "받기" 시점에 정상적으로 재시도한다). 지연 단축 전용, 상태(status)를 바꾸지 않는다. */
  prefetch: (sessionId: string) => void;
  /** 마이크 권한 확인 → 서명 URL 발급까지 진행한다. 실시간 불가면 fallback 상태로 끝난다. */
  start: (sessionId: string) => Promise<void>;
  /** 통화를 끊는다(훈련 종료·한도 도달 시). */
  stop: () => void;
  /** RealtimeVoiceSession이 올려주는 콜백들. */
  handleActive: () => void;
  handleEnded: () => void;
  handleError: () => void;
  handleSpeakingChange: (speaking: boolean) => void;
  /** RealtimeVoiceSession/GeminiVoiceSession이 사용자 발화 파형 신호를 올려주는 콜백. */
  handleUserSpeakingChange: (speaking: boolean) => void;
};

function hasMicrophoneSupport(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

// 사용자 신고(2026-07-25) — "전화가 연결되면 바로 말을 하는 걸로". 지연의 상당 부분은 "받기" 탭
// 이후 시작되는 createRealtimeCall(자격증명 발급 Cloud Function) 왕복이다. 전화가 울리는 동안
// (phase="incoming", 아직 마이크 접근·"받기" 소비 전) 미리 이 호출만 해 두면, 실제 "받기" 시점엔
// 네트워크 왕복 없이 곧장 마이크 확인→연결로 넘어간다 — 마이크 권한 확인은 여전히 "받기" 이후에만
// 하므로(start() 그대로) 사전 동의/수신 화면 관례(§UX-014 "받기 전엔 아무 것도 새지 않는다")는
// 그대로 유지된다.
//
// ⚠️ Gemini 자격증명(ephemeral token)은 발급 시점부터 **2분**(newSessionExpireTime,
// geminiProvider.ts) 안에만 새 세션을 시작할 수 있다 — 그보다 오래 방치된 프리페치 결과는 재사용하지
// 않고 "받기" 시점에 새로 발급받는다(안전 여유를 두어 90초로 자름).
const PREFETCH_STALE_MS = 90_000;

export type Prefetched = { sessionId: string; issued: CreateRealtimeCallResponse; mintedAt: number };

/** 신선도 판정 자체(순수 로직)는 prefetchFreshness.ts에 있다(경로 별칭 임포트가 없어야 별도
 * node:test 프로세스에서 단위 테스트할 수 있다) — 여기서는 그 결과에 타입 서술어만 덧씌워 호출부가
 * `prefetched.issued`를 널 체크 없이 바로 쓸 수 있게 한다. */
function isFreshPrefetch(
  prefetched: Prefetched | null,
  sessionId: string,
  nowMs: number,
  staleMs: number,
): prefetched is Prefetched {
  return isPrefetchTimestampFresh(prefetched, sessionId, nowMs, staleMs);
}

export function useRealtimeCall(): RealtimeCallState & RealtimeCallControls {
  const [status, setStatus] = useState<RealtimeCallStatus>("idle");
  const [credentials, setCredentials] = useState<CreateRealtimeCallResponse | null>(null);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [stopSignal, setStopSignal] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // T158 — sticky OR. 한 번 true가 되면 false로 되돌리지 않는다(48.5.1 sticky 규칙과 동형).
  const [isMock, setIsMock] = useState(false);
  // 언마운트 후 늦게 도착한 비동기 결과가 setState를 호출하지 않도록 가드한다.
  const mountedRef = useRef(true);
  // 수신(전화 울림) 중 미리 받아 둔 자격증명 — start()가 "받기" 시점에 신선하면 그대로 쓰고,
  // 없거나 상해 있으면 이 자리에서 새로 발급받는다. status를 바꾸지 않으므로 화면엔 영향 없다.
  const prefetchRef = useRef<Prefetched | null>(null);
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

  const prefetch = useCallback((sessionId: string) => {
    if (!hasMicrophoneSupport()) return; // 폴백으로 갈 브라우저는 미리 받아 둘 이유가 없다.
    // 이미 같은 세션에 대해 프리페치를 걸어 뒀다면(전화벨 화면 리렌더 등) 중복 호출하지 않는다.
    if (prefetchRef.current?.sessionId === sessionId) return;
    (async () => {
      try {
        const issued = await createRealtimeCall({ sessionId });
        if (!mountedRef.current) return;
        prefetchRef.current = { sessionId, issued, mintedAt: Date.now() };
      } catch {
        // 프리페치 실패는 조용히 무시 — start()가 "받기" 시점에 정상적으로 재시도한다(P-4 비차단).
      }
    })();
  }, []);

  // ⭐⭐ D2/F1(§54.9 (4) 2, G342) — **실시간이 불가능해도 자격증명은 받아 둔다.** 폴백 대화의 확인
  // 시도 무력화 게이트는 `credentials.verifyOffer`를 유일한 입력으로 쓰므로(§54.2 (1)), 이 값이
  // 없으면 사기범 턴이 아무리 쌓여도 확인 데스크 전환이 **구조적으로 0회**다.
  // ⚠️ 화면 상태(status)는 이미 확정된 뒤에 부르는 fire-and-forget이다 — 발급 왕복이 폴백 진입을
  // 늦추지 않고, 실패해도 대화를 막지 않는다(P-4 핵심 루프 비차단, prefetch와 같은 관례).
  // ⛔ 발급 응답은 `toFallbackCredentials`로 낮춰서 보관한다(그 파일의 근거 주석 참고) — 그대로
  // 담으면 마이크가 없는데 실시간 세션 컴포넌트가 마운트된다.
  const retainFallbackCredentials = useCallback(async (sessionId: string) => {
    try {
      const prefetched = prefetchRef.current;
      prefetchRef.current = null; // 어느 쪽이든 소모 — 재사용하지 않는다(성공 경로와 같은 관례).
      const issued = isFreshPrefetch(prefetched, sessionId, Date.now(), PREFETCH_STALE_MS)
        ? prefetched.issued
        : await createRealtimeCall({ sessionId });
      if (!mountedRef.current) return;
      if (issued.isMock) setIsMock(true);
      setCredentials(toFallbackCredentials(issued));
    } catch {
      // 발급 실패는 폴백 진행을 막지 않는다 — 확인 오퍼만 열리지 않는다(종전 동작 그대로).
    }
  }, []);

  const start = useCallback(async (sessionId: string) => {
    if (!hasMicrophoneSupport()) {
      setStatus("unsupported");
      setErrorMessage("이 브라우저는 실시간 음성 통화를 지원하지 않아 텍스트로 진행합니다.");
      void retainFallbackCredentials(sessionId); // E2 — 폴백 트리거 보관(D2/F1)
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
      void retainFallbackCredentials(sessionId); // E1 — 폴백 트리거 보관(D2/F1)
      return;
    }

    // ② 서명 URL 발급(서버) — ElevenLabs API 키는 서버에만 남는다. 수신 중 미리 받아 둔 신선한
    // 자격증명이 있으면 그대로 쓰고(지연 단축), 없거나 상했으면 지금 새로 받는다.
    const prefetched = prefetchRef.current;
    prefetchRef.current = null; // 어느 쪽이든 소모 — 재사용하지 않는다.

    let issued: CreateRealtimeCallResponse;
    if (isFreshPrefetch(prefetched, sessionId, Date.now(), PREFETCH_STALE_MS)) {
      issued = prefetched.issued;
    } else {
      try {
        issued = await createRealtimeCall({ sessionId });
      } catch {
        if (!mountedRef.current) return;
        setStatus("error");
        setErrorMessage("통화를 시작하지 못했습니다. 텍스트로 진행해 주세요.");
        return;
      }
    }
    if (!mountedRef.current) return;

    // ③ 실시간 대화 불가(키·설정 미비) → 텍스트 폴백. 조용히 넘어가지 않고 상태로 알린다.
    const hasUsableCredentials =
      (issued.provider === "elevenlabs" && Boolean(issued.signedUrl)) ||
      (issued.provider === "gemini" && Boolean(issued.geminiToken));
    if (issued.isMock) setIsMock(true);
    if (issued.isMock || !hasUsableCredentials) {
      // E3 — 이미 받아 둔 값을 버리지 않는다(D2/F1, §54.9 (4) 1). 이 경로의 응답은 `provider:"none"`
      // 이므로(서버 실측: MockRealtimeProvider·발급 실패 분기 둘 다 "none") 낮춤은 무효과이고,
      // 실시간 세션 컴포넌트도 종전대로 마운트되지 않는다 — 부작용 0.
      setCredentials(toFallbackCredentials(issued));
      setStatus("fallback");
      return;
    }

    // ④ 자격증명을 세팅하면 통화 화면이 RealtimeVoiceSession(지연 로딩)을 마운트하고,
    //    그 컴포넌트가 실제 speech-to-speech 세션을 시작한 뒤 handleActive로 알려준다.
    // ⛔ 이 줄은 D2에서 **한 글자도 바뀌지 않았다**(§54.9 (4) 6 역검증) — 실시간 경로는 종전 그대로
    // 발급 응답을 낮추지 않고 그대로 세팅한다.
    setCredentials(issued);
  }, [retainFallbackCredentials]);

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

  const handleUserSpeakingChange = useCallback((speaking: boolean) => {
    if (mountedRef.current) setIsUserSpeaking(speaking);
  }, []);

  return {
    status,
    credentials,
    isAgentSpeaking,
    isUserSpeaking,
    stopSignal,
    errorMessage,
    isMock,
    prefetch,
    start,
    stop,
    handleActive,
    handleEnded,
    handleError,
    handleSpeakingChange,
    handleUserSpeakingChange,
  };
}
