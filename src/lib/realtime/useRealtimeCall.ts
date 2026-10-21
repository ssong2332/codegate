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
import { createPrefetchSlot, type PrefetchSlot } from "./prefetchFreshness";
import { toFallbackCredentials } from "./fallbackCredentials";
import { LIVE_MIC_CONSTRAINTS, liveMicHandoff, requestMicrophone, stopStream } from "./micHandoff";
import { markCallSetup, markCredentialsPrefetched, resetCallSetupMarks } from "./liveLatency";
import { noteAccept, noteCredentialSource } from "./audioDiagnostics";
import { SCREEN_OFF_COPY } from "./backgroundCall";

export type RealtimeCallStatus =
  | "idle"
  | "connecting"
  | "active"
  // §99 — 화면이 가려진 동안 끊긴 Live 세션을 새 자격증명으로 다시 잇는 중(화면 phase는 그대로 `live`).
  | "reconnecting"
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
  /** §99 — 다시 연결할 때마다 1씩 오른다. 화면이 Live 세션 컴포넌트의 `key`로 써서 새 자격증명으로 새로 마운트한다. */
  connectionSeq: number;
};

export type RealtimeCallControls = {
  /** 수신(전화 울림) 중 미리 자격증명만 받아 둔다(마이크 접근 없음, 실패해도 조용히 무시 — start()가
   * "받기" 시점에 정상적으로 재시도한다). 지연 단축 전용, 상태(status)를 바꾸지 않는다. */
  prefetch: (sessionId: string) => void;
  /** 마이크 권한 확인 → 서명 URL 발급까지 진행한다. 실시간 불가면 fallback 상태로 끝난다. */
  start: (sessionId: string) => Promise<void>;
  /** 통화를 끊는다(훈련 종료·한도 도달 시). */
  stop: () => void;
  /**
   * §99 — 화면이 가려진 동안 끊긴 Live 세션을 다시 잇는다(새 자격증명 발급 → 세션 재마운트). 실패하면 `error`(텍스트로 이어감 —
   * 종전 강등 경로). 통화 중(`active`)일 때만 동작한다.
   */
  reconnect: (sessionId: string) => Promise<void>;
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
// (phase="pre-call-notice"·"incoming" — 2026-10-18부터 고지 화면에서 시작, 아직 마이크 접근·"받기" 소비 전) 미리 이 호출만 해 두면, 실제 "받기" 시점엔
// 네트워크 왕복 없이 곧장 마이크 확인→연결로 넘어간다 — 마이크 권한 확인은 여전히 "받기" 이후에만
// 하므로(start() 그대로) 사전 동의/수신 화면 관례(§UX-014 "받기 전엔 아무 것도 새지 않는다")는
// 그대로 유지된다.
//
// ⚠️ Gemini 자격증명(ephemeral token)은 발급 시점부터 **2분**(newSessionExpireTime,
// geminiProvider.ts) 안에만 새 세션을 시작할 수 있다 — 그보다 오래 방치된 프리페치 결과는 재사용하지
// 않고 "받기" 시점에 새로 발급받는다(안전 여유를 두어 90초로 자름).
const PREFETCH_STALE_MS = 90_000;

export type Prefetched = { sessionId: string; issued: CreateRealtimeCallResponse; mintedAt: number };

/** 신선도 판정 · 진행 중 요청 재사용(순수 로직)은 prefetchFreshness.ts의 `createPrefetchSlot`에 있다(경로 별칭
 * 임포트가 없어야 별도 node:test 프로세스에서 단위 테스트할 수 있다) — 이 훅은 그 슬롯 하나를 ref에 담아 쓴다.
 * 신선도 규칙(`isPrefetchFresh` + 아래 `PREFETCH_STALE_MS`)과 "한 번 쓰면 소모" 규칙은 슬롯 안에서 그대로다. */

export function useRealtimeCall(): RealtimeCallState & RealtimeCallControls {
  const [status, setStatus] = useState<RealtimeCallStatus>("idle");
  const [credentials, setCredentials] = useState<CreateRealtimeCallResponse | null>(null);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [stopSignal, setStopSignal] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // T158 — sticky OR. 한 번 true가 되면 false로 되돌리지 않는다(48.5.1 sticky 규칙과 동형).
  const [isMock, setIsMock] = useState(false);
  const [connectionSeq, setConnectionSeq] = useState(0);
  // 언마운트 후 늦게 도착한 비동기 결과가 setState를 호출하지 않도록 가드한다.
  const mountedRef = useRef(true);
  // 수신(전화 울림) 중 미리 받아 둔 자격증명 슬롯 — start()가 "받기" 시점에 신선하면 그대로 쓰고, 같은 세션 요청이
  // **진행 중이면 그것을 기다려** 쓰고(2026-10-18, 라이브 d13e718 회귀 — 예전엔 진행 중 요청을 못 보고 두 번 발급했다),
  // 없거나 실패·상했으면 이 자리에서 새로 발급받는다. status를 바꾸지 않으므로 화면엔 영향 없다.
  // ⚠️ 렌더 중에는 만들지 않는다(react-hooks/refs) — 콜백 안에서 처음 쓸 때 만든다(`getPrefetchSlot`).
  const prefetchSlotRef = useRef<PrefetchSlot<CreateRealtimeCallResponse> | null>(null);
  const getPrefetchSlot = useCallback((): PrefetchSlot<CreateRealtimeCallResponse> => {
    if (!prefetchSlotRef.current) {
      prefetchSlotRef.current = createPrefetchSlot<CreateRealtimeCallResponse>({
        mint: (sessionId) => createRealtimeCall({ sessionId }),
        now: () => Date.now(),
        staleMs: PREFETCH_STALE_MS,
        isAlive: () => mountedRef.current,
      });
    }
    return prefetchSlotRef.current;
  }, []);
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
      liveMicHandoff.release(); // 세션이 가져가지 않은 받기 마이크는 닫는다(누수 0).
    };
  }, []);

  // 연결 타임아웃(2026-07-23 고착 버그 수정) — 자격증명을 세팅했는데 세션 컴포넌트가 일정 시간
  // 안에 active를 알려주지 않으면(연결이 매달리거나 조용히 닫힘), 무한 "연결하는 중"에 갇히지 않도록
  // 강제로 error로 떨어뜨려 텍스트 폴백으로 강등한다. Node 실측상 정상 연결은 ~2초면 setupComplete가
  // 오므로 12초는 충분히 여유 있는 상한이다.
  useEffect(() => {
    if (!credentials || (status !== "connecting" && status !== "reconnecting")) return;
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        setStatus("error");
        setErrorMessage("통화 연결이 지연되어 텍스트로 진행합니다.");
      }
    }, 12000);
    return () => clearTimeout(timer);
  }, [credentials, status]);

  const prefetch = useCallback(
    (sessionId: string) => {
      if (!hasMicrophoneSupport()) return; // 폴백으로 갈 브라우저는 미리 받아 둘 이유가 없다.
      // 같은 세션 요청이 진행 중이거나 신선한 결과가 이미 있으면(화면 리렌더 · 고지→벨 전이) 슬롯이 다시 걸지 않는다.
      // 고지 화면에 오래 머물러 결과가 상했으면 한 번 더 받는다. 실패는 조용히 무시(P-4 — start()가 새로 발급한다).
      getPrefetchSlot().prefetch(sessionId);
    },
    [getPrefetchSlot],
  );

  // ⭐⭐ D2/F1(§54.9 (4) 2, G342) — **실시간이 불가능해도 자격증명은 받아 둔다.** 폴백 대화의 확인
  // 시도 무력화 게이트는 `credentials.verifyOffer`를 유일한 입력으로 쓰므로(§54.2 (1)), 이 값이
  // 없으면 사기범 턴이 아무리 쌓여도 확인 데스크 전환이 **구조적으로 0회**다.
  // ⚠️ 화면 상태(status)는 이미 확정된 뒤에 부르는 fire-and-forget이다 — 발급 왕복이 폴백 진입을
  // 늦추지 않고, 실패해도 대화를 막지 않는다(P-4 핵심 루프 비차단, prefetch와 같은 관례).
  // ⛔ 발급 응답은 `toFallbackCredentials`로 낮춰서 보관한다(그 파일의 근거 주석 참고) — 그대로
  // 담으면 마이크가 없는데 실시간 세션 컴포넌트가 마운트된다.
  const retainFallbackCredentials = useCallback(async (sessionId: string) => {
    try {
      // 진행 중 미리 받기도 같은 규칙으로 재사용한다(받기 경로와 같은 슬롯 — 발급 2회 0).
      const taken = await getPrefetchSlot().take(sessionId);
      const issued = taken.issued ?? (await createRealtimeCall({ sessionId }));
      if (!mountedRef.current) return;
      if (issued.isMock) setIsMock(true);
      setCredentials(toFallbackCredentials(issued));
    } catch {
      // 발급 실패는 폴백 진행을 막지 않는다 — 확인 오퍼만 열리지 않는다(종전 동작 그대로).
    }
  }, [getPrefetchSlot]);

  const start = useCallback(async (sessionId: string) => {
    if (!hasMicrophoneSupport()) {
      setStatus("unsupported");
      setErrorMessage("이 브라우저는 실시간 음성 통화를 지원하지 않아 텍스트로 진행합니다.");
      void retainFallbackCredentials(sessionId); // E2 — 폴백 트리거 보관(D2/F1)
      return;
    }

    setStatus("connecting");
    setErrorMessage(null);
    // §71.6 P-0 — 통화 1건의 준비 구간 표시를 받기 시점부터 새로 찍는다(나머지는 GeminiVoiceSession).
    resetCallSetupMarks();
    noteAccept(performance.now()); // 진단 패널(`?audiodebug=1`)의 통화별 값도 받기 시점에 비운다(관찰 전용).
    markCallSetup("accept", performance.now());

    // ① 마이크 — 실패하면 실시간 대화가 불가능하므로 폴백 안내로 전환한다.
    // ⭐ 2026-10-21(받기→첫소리 10.2초) — 예전엔 여기서 권한 확인용으로 열고 **기다려 닫은 뒤** 자격증명을 꺼냈고,
    // Live 세션이 마이크를 한 번 더 열었다(장치 열기 2회 · 전부 직렬). 이제 Live 제약으로 **한 번만** 열고 기다리지
    // 않는다 — 자격증명 꺼내기 · Live 연결과 겹친다. Gemini 경로는 이 요청을 세션에 넘긴다(`micHandoff.ts`).
    const mic = requestMicrophone(() => navigator.mediaDevices.getUserMedia(LIVE_MIC_CONSTRAINTS));
    void mic.then((stream) => {
      if (stream) markCallSetup("micGranted", performance.now());
    });
    // 거부 처리 — 이미 받은 발급 응답이 있으면 낮춰 보관하고(재발급 0), 없으면 슬롯 · 새 발급으로 보관한다.
    const denyMicrophone = (issuedSoFar: CreateRealtimeCallResponse | null) => {
      liveMicHandoff.release();
      setStatus("permission-denied");
      setErrorMessage(
        "마이크 권한이 필요합니다. 브라우저 설정에서 허용한 뒤 다시 시도하거나 텍스트로 진행해 주세요.",
      );
      if (issuedSoFar) setCredentials(toFallbackCredentials(issuedSoFar));
      else void retainFallbackCredentials(sessionId); // E1 — 폴백 트리거 보관(D2/F1)
    };

    // ② 서명 URL 발급(서버) — ElevenLabs API 키는 서버에만 남는다. 미리 받아 둔 신선한 자격증명이 있거나
    // 같은 세션 요청이 **진행 중이면 그것을 기다려** 쓰고(지연 단축 · 발급 1회), 없거나 실패·상했으면 지금 새로 받는다.
    // ⭐ 계측: 진행 중 요청을 기다려 재사용한 경우도 `credentialsPrefetched: true`다(서버 발급이 받기 뒤에 새로
    // 일어나지 않았다는 뜻). 기다린 시간은 `acceptToCredentialsMs`에 그대로 남고, 어느 경로였는지는 진단 패널이 보인다.
    const taken = await getPrefetchSlot().take(sessionId);
    noteCredentialSource(taken.source);
    markCredentialsPrefetched(taken.issued !== null, taken.source);
    if (!mountedRef.current) return;

    let issued: CreateRealtimeCallResponse;
    if (taken.issued) {
      issued = taken.issued;
    } else {
      try {
        issued = await createRealtimeCall({ sessionId });
      } catch {
        // 마이크 거부가 먼저다(종전 순서 — 거부면 권한 안내, 허용이면 발급 실패 안내).
        const stream = await mic;
        stopStream(stream);
        if (!mountedRef.current) return;
        if (!stream) {
          denyMicrophone(null);
          return;
        }
        setStatus("error");
        setErrorMessage("통화를 시작하지 못했습니다. 텍스트로 진행해 주세요.");
        return;
      }
    }
    if (!mountedRef.current) return;
    markCallSetup("credentialsReady", performance.now());

    // ③ 실시간 대화 불가(키·설정 미비) → 텍스트 폴백. 조용히 넘어가지 않고 상태로 알린다.
    const hasUsableCredentials =
      (issued.provider === "elevenlabs" && Boolean(issued.signedUrl)) ||
      (issued.provider === "gemini" && Boolean(issued.geminiToken));
    if (issued.isMock) setIsMock(true);
    // Gemini Live만 마이크를 넘겨받고 연결과 겹친다. 나머지(폴백 · ElevenLabs — SDK가 스스로 연다)는 종전처럼
    // 권한 결과를 기다린 뒤 진행하고, 연 스트림은 닫는다.
    const handsOffMic = !issued.isMock && issued.provider === "gemini" && hasUsableCredentials;
    if (!handsOffMic) {
      const stream = await mic;
      stopStream(stream);
      if (!mountedRef.current) return;
      if (!stream) {
        denyMicrophone(issued);
        return;
      }
    }
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
    if (handsOffMic) liveMicHandoff.offer(mic);
    setCredentials(issued);
    if (!handsOffMic) return;
    // Live 연결이 진행되는 동안 권한 결과를 기다린다. 거부면 세션을 내리고(자격증명을 낮추면 마운트 조건이 풀린다) 폴백으로 간다.
    // 이미 끝낸 통화(끊기 등)면 건드리지 않는다.
    const stream = await mic;
    if (stream || !mountedRef.current) return;
    if (statusRef.current === "connecting" || statusRef.current === "active") denyMicrophone(issued);
  }, [retainFallbackCredentials, getPrefetchSlot]);

  const stop = useCallback(() => {
    setStopSignal((n) => n + 1);
    // 리뷰 Minor — 다시 잇는 발급이 렌더 전에 끝나도 새 세션을 붙이지 않게 미러를 먼저 내린다(`reconnect`의 확인과 짝).
    if (statusRef.current === "active" || statusRef.current === "reconnecting") statusRef.current = "ended";
    // §99 — 다시 잇는 중에 끊어도 정상 종료다.
    setStatus((prev) => (prev === "active" || prev === "reconnecting" ? "ended" : prev));
  }, []);

  const reconnect = useCallback(async (sessionId: string) => {
    if (statusRef.current !== "active") return;
    statusRef.current = "reconnecting"; // 같은 렌더 안 두 번째 호출을 막는다(effect 미러보다 먼저).
    setStatus("reconnecting");
    try {
      // 프리페치 슬롯은 쓰지 않는다(이미 소모됐다) — 서버는 진행 중 세션에 새 토큰을 발급한다(`createRealtimeCall` 가드 = 세션 active).
      const issued = await createRealtimeCall({ sessionId });
      if (!mountedRef.current || statusRef.current !== "reconnecting") return;
      if (issued.isMock || issued.provider !== "gemini" || !issued.geminiToken) {
        setCredentials(toFallbackCredentials(issued));
        setStatus("error");
        setErrorMessage(SCREEN_OFF_COPY.reconnectFailed);
        return;
      }
      setCredentials(issued);
      setConnectionSeq((n) => n + 1);
    } catch {
      if (!mountedRef.current || statusRef.current !== "reconnecting") return;
      setStatus("error");
      setErrorMessage(SCREEN_OFF_COPY.reconnectFailed);
    }
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
    } else if (statusRef.current === "connecting" || statusRef.current === "reconnecting") {
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
    connectionSeq,
    prefetch,
    start,
    stop,
    reconnect,
    handleActive,
    handleEnded,
    handleError,
    handleSpeakingChange,
    handleUserSpeakingChange,
  };
}
