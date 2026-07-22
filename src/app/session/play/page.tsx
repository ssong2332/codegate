"use client";

// UX-014 통화 세션 — 실시간 음성 통화 (단일 연속 통화) (AC-003~007/012/013/017/018/019/023/024).
//
// **v3(2026-07-22) — 실시간 speech-to-speech 전환**: 이전 v2는 "브라우저 STT → 텍스트 LLM → TTS
// 합성 → <audio> 재생"을 턴마다 왕복해 지연이 누적됐고, 말을 끊거나 겹쳐 말하는 실제 통화 동작을
// 재현하지 못했다. 이제 ElevenLabs Agents와 **speech-to-speech로 직접 연결**해(useRealtimeCall)
// 사용자가 진짜 통화처럼 말하고 듣는다. 한국어는 agent.language:"ko", 목소리는 clone 시나리오면
// 참가자 본인 클론 voiceId로 지정한다(tts.voice_id 오버라이드 — 이게 가능한 유일한 실시간 API라
// ElevenLabs를 골랐다, functions/src/realtime/types.ts 근거 주석 참고).
//
// **폴백(조용한 실패 금지)**: 키·에이전트 미설정, 마이크 거부, 미지원 브라우저 등으로 실시간
// 대화가 불가능하면 `callMode:"fallback"`으로 내려가 기존 텍스트/STT 경로를 그대로 쓴다. 화면에도
// 실시간 통화가 아님을 알린다.
//
// Phase: incoming(수신) → connecting(연결) → opening(폴백 전용 오프닝 재생) → live(대화) → ended.
// 통화 타이머·서버 시간 한도는 모두 answeredAt("받기") 기점이다(OQ-U8).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { consumeOpeningAudioUrl, getPendingSessionId, useSpeechRecognition } from "@/lib/recording";
import { useRealtimeCall } from "@/lib/realtime";
import { sendMessage } from "@/lib/api";
import { scenarios, type ScenarioDoc } from "@/content/scenarios";
import CallWaveform from "@/components/CallWaveform";

// ⚠️ 지연 로딩 필수 — @elevenlabs/react가 끌어오는 livekit-client(WebRTC)를 이 화면 로드 시점에
// 함께 불러오면 WebRTC를 못 쓰는 환경에서 렌더러가 통째로 죽는다(실측: 페이지 자체가 로드 실패).
// 서버가 "실시간 통화 가능"이라고 확인해 자격증명을 준 뒤에만 마운트해, 텍스트 폴백 경로는 WebRTC
// 코드를 아예 건드리지 않게 한다.
const RealtimeVoiceSession = dynamic(() => import("@/lib/realtime/RealtimeVoiceSession"), {
  ssr: false,
});
// Gemini Live(무료 경로) 세션도 같은 이유로 지연 로딩한다 — 오디오 컨텍스트/SDK를 실제로 쓸
// 때만 불러온다.
const GeminiVoiceSession = dynamic(() => import("@/lib/realtime/GeminiVoiceSession"), {
  ssr: false,
});

type PageState = "checking" | "ready" | "no-session" | "scenario-not-found" | "load-error";
type Phase = "incoming" | "connecting" | "opening" | "live" | "ended";
/** realtime = speech-to-speech 실시간 통화, fallback = 기존 STT/텍스트 경로. */
type CallMode = "undecided" | "realtime" | "fallback";

type ChatMessage = {
  id: string;
  role: "scammer" | "user";
  text: string;
  turnIndex: number;
};

const PREROLL_NOTICE =
  "지금부터 재생되는 음성은 실제 전화가 아니라 AI로 합성된 훈련용 음성입니다.";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SessionCallPage() {
  const router = useRouter();
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [pageState, setPageState] = useState<PageState>(sessionId ? "checking" : "no-session");
  const [phase, setPhase] = useState<Phase>("incoming");
  const [callMode, setCallMode] = useState<CallMode>("undecided");
  const [scenario, setScenario] = useState<ScenarioDoc | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speech = useSpeechRecognition();
  const realtime = useRealtimeCall();

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await getDoc(doc(db, "sessions", sessionId));
        if (cancelled) return;
        const data = snapshot.data();
        if (!data) {
          setPageState("load-error");
          return;
        }
        const scenarioId = data.scenarioId as string | undefined;
        const found = scenarioId ? scenarios[scenarioId] : undefined;
        if (!found) {
          setPageState("scenario-not-found");
          return;
        }
        setScenario(found);
        if (data.status === "ended") {
          setPhase("ended");
        } else if (data.status === "active" && (data.turnCount as number) >= 1) {
          // #5 새로고침 복원: 이미 대화가 시작된 세션을 다시 열면 "수신 중"으로 되돌아가지 않고
          // 곧바로 대화 상태로 복원한다. 통화 타이머는 answeredAt 기점으로 이어서 센다(#6, 서버
          // 한도 기점과 정합). 실시간 세션 자체는 새로고침으로 끊기므로 폴백 경로로 복원한다.
          const answeredAtMs =
            (data.answeredAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null;
          if (answeredAtMs) {
            setElapsedSec(Math.max(0, Math.floor((Date.now() - answeredAtMs) / 1000)));
          }
          setCallMode("fallback");
          setPhase("live");
        }
        setPageState("ready");
      } catch {
        if (!cancelled) setPageState("load-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 대화 로그 구독 — 폴백 경로의 자막/이력용. 실시간 경로는 음성이 주채널이라 자막이 없을 수 있다.
  // "받기" 전에는 구독하지 않아 아직 공개되지 않은 오프닝 텍스트가 미리 새지 않는다.
  useEffect(() => {
    if (!sessionId || phase === "incoming" || phase === "connecting") return;
    const messagesQuery = query(
      collection(db, "sessions", sessionId, "messages"),
      orderBy("turnIndex", "asc"),
    );
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setMessages(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            role: data.role as "scammer" | "user",
            text: data.textMasked as string,
            turnIndex: data.turnIndex as number,
          };
        }),
      );
    });
    return unsubscribe;
  }, [sessionId, phase]);

  // 통화 경과 타이머 — "받기"(answeredAt) 기점, ended면 정지.
  useEffect(() => {
    if (phase === "incoming" || phase === "ended") return;
    const interval = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // 실시간 통화가 연결/폴백 판정을 끝내면 화면 phase를 맞춘다. 인라인 async IIFE로 감싼다
  // (react-hooks/set-state-in-effect 회피 — effect 본문에서 직접 setState를 호출하면 "동기
  // setState"로 오탐한다, clone/wait·session/end 등 다른 화면과 동일한 관례).
  useEffect(() => {
    if (callMode !== "realtime") return;
    (async () => {
      if (realtime.status === "active") {
        setPhase("live");
      } else if (
        realtime.status === "fallback" ||
        realtime.status === "unsupported" ||
        realtime.status === "permission-denied" ||
        realtime.status === "error"
      ) {
        // 실시간 불가 — 기존 텍스트/STT 경로로 강등한다. 오프닝 오디오가 있으면 그것부터 재생.
        setCallMode("fallback");
        const audio = consumeOpeningAudioUrl();
        if (audio) {
          setPlaybackUrl(audio);
          setPhase("opening");
        } else {
          setPhase("live");
        }
      } else if (realtime.status === "ended") {
        setPhase("ended");
      }
    })();
  }, [callMode, realtime.status]);

  // 폴백 경로 오디오 자동재생 — 브라우저 정책으로 막히면 "탭하여 듣기" 버튼만 최소로 노출(P-4).
  useEffect(() => {
    if (!playbackUrl) return;
    (async () => {
      setPlaybackBlocked(false);
      try {
        await audioRef.current?.play();
      } catch {
        setPlaybackBlocked(true);
      }
    })();
  }, [playbackUrl]);

  const handleManualPlay = () => {
    audioRef.current
      ?.play()
      .then(() => setPlaybackBlocked(false))
      .catch(() => {});
  };

  const maybeStartListening = useCallback(() => {
    if (speech.status === "unsupported" || speech.status === "listening") return;
    speech.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.status]);

  // #7 연속 자동 청취(폴백 경로 전용) — 브라우저 SpeechRecognition은 침묵이 이어지면 스스로 종료해
  // status가 idle로 떨어진다. live 구간에서 재생 중/전송 중이 아니면 idle이 될 때마다 다시 연다.
  // start()가 status를 listening으로 바꿔 이 effect가 곧 멈추므로 타이트 루프가 아니다.
  useEffect(() => {
    if (callMode !== "fallback" || phase !== "live") return;
    if (speech.status !== "idle") return;
    if (sending || playbackUrl) return;
    const timer = setTimeout(() => speech.start(), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callMode, phase, speech.status, sending, playbackUrl]);

  // P-11 이음새 없는 전환 — 오프닝 재생이 끝나면 확인 버튼 없이 곧바로 실시간 청취로 넘어간다.
  const handlePlaybackEnded = () => {
    setPlaybackUrl(null);
    setPhase((p) => (p === "opening" ? "live" : p));
    maybeStartListening();
  };

  const handleAnswer = () => {
    if (!sessionId) return;
    setPhase("connecting");
    setCallMode("realtime");
    // 실시간 연결을 먼저 시도한다. 불가하면 위 effect가 폴백으로 강등한다.
    void realtime.start(sessionId);
  };

  const handleDecline = () => {
    router.push("/session/end");
  };

  const handleEndTraining = () => {
    audioRef.current?.pause();
    realtime.stop();
    router.push("/session/end");
  };

  const handleToggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      // 폴백 경로에서는 음소거가 곧 "듣기 중지"다. 실시간 경로는 SDK가 마이크를 직접 다룬다.
      if (next) speech.stop();
      return next;
    });
  };

  const handleSend = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!sessionId || !text || sending || phase !== "live") return;
    setSending(true);
    setSendError(null);
    try {
      const result = await sendMessage({ sessionId, userText: text });
      setInput("");
      speech.reset();
      if (result.audioUrl) {
        setPlaybackUrl(result.audioUrl);
      } else if (!result.ended) {
        maybeStartListening();
      }
      if (result.ended) {
        setPhase("ended");
      }
    } catch {
      setSendError("메시지를 보내지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  };

  // STT가 발화를 인식하면 곧바로 전송한다(폴백 경로) — 인라인 async IIFE로 감싼다
  // (react-hooks/set-state-in-effect 회피, 다른 화면과 동일 패턴).
  useEffect(() => {
    if (callMode !== "fallback") return;
    if (speech.status === "processing" && speech.transcript) {
      (async () => {
        await handleSend(speech.transcript);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callMode, speech.status, speech.transcript]);

  if (pageState === "no-session" || pageState === "scenario-not-found" || pageState === "load-error") {
    const message =
      pageState === "no-session"
        ? "진행 중인 세션 정보를 찾을 수 없습니다. 시나리오 선택부터 다시 진행해 주세요."
        : pageState === "scenario-not-found"
          ? "선택된 시나리오 정보를 찾을 수 없습니다. 시나리오를 다시 선택해 주세요."
          : "통화 정보를 불러오지 못했습니다. 다시 시도해 주세요.";
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>{message}</span>
        </p>
        <button
          type="button"
          onClick={() => router.push("/scenarios")}
          className="min-h-[48px] rounded-xl border border-[#C9C2B6] px-6 py-3 text-lg font-bold text-[#22303A] hover:bg-white"
        >
          시나리오 선택으로
        </button>
      </main>
    );
  }

  if (pageState !== "ready" || !scenario) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p className="flex items-center gap-2 text-lg text-[#22303A]" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
          />
          통화 정보를 불러오는 중입니다...
        </p>
      </main>
    );
  }

  const callerLabel = scenario.callerLabel ?? "발신자 (사칭)";
  const latestScammerLine =
    [...messages].reverse().find((m) => m.role === "scammer")?.text ?? null;
  const isRinging = phase === "incoming";
  // 실시간 경로는 SDK의 발화 상태를, 폴백 경로는 오디오 재생 여부를 "상대가 말하는 중"으로 본다.
  const agentSpeaking =
    callMode === "realtime" ? realtime.isAgentSpeaking : Boolean(playbackUrl);
  const waveLabel = agentSpeaking
    ? "상대방이 말하는 중"
    : callMode === "realtime"
      ? "말씀하세요"
      : speech.status === "listening"
        ? "듣고 있어요"
        : sending
          ? "보내는 중"
          : "말씀하세요";

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#26363F] via-[#22303A] to-[#18232B] text-white">
      {/* 실시간 speech-to-speech 세션 — 서버가 자격증명을 준 경우에만 마운트된다(지연 로딩).
          화면 요소는 없고 SDK 세션 생명주기만 관리한다. */}
      {realtime.credentials?.provider === "elevenlabs" && (
        <RealtimeVoiceSession
          credentials={realtime.credentials}
          stopSignal={realtime.stopSignal}
          muted={muted}
          onActive={realtime.handleActive}
          onEnded={realtime.handleEnded}
          onError={realtime.handleError}
          onSpeakingChange={realtime.handleSpeakingChange}
        />
      )}
      {realtime.credentials?.provider === "gemini" && (
        <GeminiVoiceSession
          credentials={realtime.credentials}
          stopSignal={realtime.stopSignal}
          muted={muted}
          onActive={realtime.handleActive}
          onEnded={realtime.handleEnded}
          onError={realtime.handleError}
          onSpeakingChange={realtime.handleSpeakingChange}
        />
      )}

      {/* 상단 상태 바 — 통신사/신호 자리에 통화 상태와 경과 시간(실제 통화 화면 관례). */}
      <div className="flex items-center justify-between px-6 pt-5 text-sm text-[#8B9BA5]">
        <span>휴대전화</span>
        {phase !== "incoming" && phase !== "connecting" && (
          <span role="status" className="tabular-nums font-semibold text-[#B9C6CE]">
            {formatElapsed(elapsedSec)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8">
        {/* 발신자 아바타 — 수신 중에는 파동, 통화 중 상대 발화 시에도 파동으로 존재감을 준다. */}
        <div className="relative flex items-center justify-center">
          {(isRinging || agentSpeaking) && (
            <>
              <span
                aria-hidden="true"
                className="call-ring-pulse absolute h-28 w-28 rounded-full bg-[#7CD9C2]/30"
              />
              <span
                aria-hidden="true"
                className="call-ring-pulse absolute h-28 w-28 rounded-full bg-[#7CD9C2]/20"
                style={{ animationDelay: "0.7s" }}
              />
            </>
          )}
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-[#41525E] text-5xl font-bold text-[#C9D4DB]">
            {callerLabel.slice(0, 1)}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <p className="text-3xl font-bold">{callerLabel}</p>
          <p className="text-base text-[#8B9BA5]">
            {phase === "incoming"
              ? "휴대전화 수신 중…"
              : phase === "connecting"
                ? "연결하는 중…"
                : phase === "ended"
                  ? "통화 종료"
                  : "통화 중"}
          </p>
        </div>

        {phase === "incoming" && (
          <p role="status" className="max-w-xs text-center text-sm leading-relaxed text-[#8B9BA5]">
            {PREROLL_NOTICE}
          </p>
        )}

        {phase === "connecting" && (
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#8B9BA5] border-t-transparent"
          />
        )}

        {/* 통화 중 발화 인디케이터 — 실제 통화 화면에 있는 유일한 "상태" 표시다.
            자막·안내문·오류는 여기 두지 않는다(2026-07-22 사용자 피드백: 화면이 통화처럼 안 보임)
            — 필요한 것은 키패드 패널 안으로 옮겨, 기본 화면은 발신자와 컨트롤만 남긴다. */}
        {(phase === "live" || phase === "opening") && (
          <CallWaveform active={agentSpeaking} label={waveLabel} />
        )}

        {playbackUrl && (
          <audio
            ref={audioRef}
            src={playbackUrl}
            onEnded={handlePlaybackEnded}
            aria-label="상대방 음성 재생"
            className="hidden"
          />
        )}
        {/* 자동재생이 막힌 경우에만 노출 — 이건 누르지 않으면 통화가 진행되지 않아 화면에 남긴다. */}
        {playbackBlocked && (
          <button
            type="button"
            onClick={handleManualPlay}
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white"
          >
            🔊 탭하여 듣기
          </button>
        )}
      </div>

      {/* 하단 컨트롤 — 실제 폰 통화 UI 관례(수신 화면은 거절/받기, 통화 중은 음소거·키패드·종료). */}
      {phase === "incoming" ? (
        <div className="flex justify-around px-10 pb-12">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleDecline}
              aria-label="전화 거절 — 훈련 종료"
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#C6392F] text-3xl shadow-lg transition active:scale-95"
            >
              <span aria-hidden="true">✕</span>
            </button>
            <span className="text-sm text-[#8B9BA5]">거절</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleAnswer}
              aria-label="전화 받기"
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#1E9E6A] text-3xl shadow-lg transition active:scale-95"
            >
              <span aria-hidden="true">✆</span>
            </button>
            <span className="text-sm text-[#8B9BA5]">받기</span>
          </div>
        </div>
      ) : phase === "ended" ? (
        <div className="flex flex-col gap-3 p-6 text-center">
          <p className="text-lg font-semibold" role="status">
            통화가 종료되었습니다.
          </p>
          <button
            type="button"
            onClick={() => router.push("/session/end")}
            className="min-h-[56px] rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white"
          >
            결과 확인하러 가기
          </button>
        </div>
      ) : (
        <div className="px-6 pb-10">
          {/* 키패드 패널 — 기본 화면을 통화답게 유지하려고, 자막·안내·오류·텍스트 입력을 전부
              여기로 모았다. 닫혀 있으면 통화 화면에는 발신자와 컨트롤만 남는다. */}
          {showTextInput && (
            <div className="mb-5 rounded-2xl bg-black/25 p-4">
              {latestScammerLine && (
                <p className="mb-3 text-center text-base leading-relaxed text-white/85" aria-live="polite">
                  &ldquo;{latestScammerLine}&rdquo;
                </p>
              )}

              {(callMode === "fallback" || sendError || speech.errorMessage) && (
                <p
                  role={sendError ? "alert" : undefined}
                  className={`mb-3 text-center text-xs leading-relaxed ${
                    sendError ? "text-[#F0A79E]" : "text-[#8B9BA5]"
                  }`}
                >
                  {sendError ??
                    (callMode === "fallback"
                      ? `실시간 음성 통화를 사용할 수 없어 텍스트로 진행합니다.${
                          realtime.errorMessage ? ` ${realtime.errorMessage}` : ""
                        }`
                      : speech.errorMessage)}
                </p>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSend();
                }}
                className="flex items-center gap-2.5"
              >
                <label htmlFor="chat-input" className="sr-only">
                  메시지 입력
                </label>
                <input
                  id="chat-input"
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={sending}
                  placeholder="하고 싶은 말을 입력하세요..."
                  className="min-h-[50px] flex-1 rounded-full border-[1.5px] border-white/30 bg-white/10 px-[18px] py-3 text-lg text-white placeholder:text-[#8B9BA5]"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  aria-label="전송"
                  className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-[#0E6B62] text-lg font-bold text-white disabled:opacity-50"
                >
                  {sending ? (
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    />
                  ) : (
                    "↑"
                  )}
                </button>
              </form>
            </div>
          )}

          {/* 실제 폰 통화의 컨트롤 행: 음소거 · 통화 종료(빨강, 가운데) · 키패드.
              가운데 빨강 버튼이 AC-006의 "상시 즉시 종료" 컨트롤을 겸한다 — 별도 "훈련 종료"
              버튼을 두면 통화 화면처럼 보이지 않는다는 피드백을 반영하되, 종료 수단은 모든
              상태에서 한 번의 탭으로 도달 가능하다는 요건은 그대로 지킨다. */}
          <div className="flex items-end justify-center gap-9">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMute}
                aria-pressed={muted}
                aria-label={muted ? "음소거 해제" : "음소거"}
                className={`flex h-14 w-14 items-center justify-center rounded-full text-xl transition active:scale-95 ${
                  muted ? "bg-white text-[#22303A]" : "bg-white/15 text-white"
                }`}
              >
                <span aria-hidden="true">{muted ? "🔇" : "🎙"}</span>
              </button>
              <span className="text-xs text-[#8B9BA5]">{muted ? "음소거 중" : "음소거"}</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleEndTraining}
                aria-label="통화 종료 — 훈련 종료"
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#C6392F] text-3xl shadow-lg transition active:scale-95"
              >
                <span aria-hidden="true">✆</span>
              </button>
              <span className="text-xs text-[#8B9BA5]">종료</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTextInput((v) => !v)}
                aria-pressed={showTextInput}
                aria-label="키패드 — 텍스트로 입력"
                className={`flex h-14 w-14 items-center justify-center rounded-full text-xl transition active:scale-95 ${
                  showTextInput ? "bg-white text-[#22303A]" : "bg-white/15 text-white"
                }`}
              >
                <span aria-hidden="true">⌨</span>
              </button>
              <span className="text-xs text-[#8B9BA5]">키패드</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
