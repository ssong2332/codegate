"use client";

// UX-014 통화 세션 — 딥보이스 오프닝 → 실시간 역할극 (단일 연속 통화) (Track A·B, T5/T7/T8 통합,
// AC-003~007/AC-012/013/017/018/019/022/023/024).
//
// **v2(2026-07-22, D-11/D-12) — 화면 통합**: 이전에는 이 화면(구 UX-005, 딥보이스 재생)이 끝나면
// "계속(역할극 시작)" 버튼으로 /session/chat(구 UX-006)으로 페이지 전환했다. 사용자 피드백
// ("전화받기→대화가 하나의 통화처럼 안 느껴짐, 채팅창으로 넘어가는 느낌")에 따라 두 화면을 하나의
// 고정 통화 셸 안에서 phase 전이로만 처리하도록 재작성했다(docs/UX.md UX-014, P-10/P-11). 구
// /session/chat 라우트는 이 화면으로의 리다이렉트만 남긴다.
//
// 오프닝 재생은 더 이상 scenario.deepvoiceLines(별도 스크립트, synthesizeDeepvoice)를 순회하지
// 않는다 — createSession이 이미 생성해 Firestore messages(turnIndex 0)에 저장하고 1회성 힌트로
// 넘겨준 openingAudioUrl을 그대로 재생한다(P-10 "오프닝과 실시간 응답은 같은 대화 로그·같은 자막
// 영역에 누적"). scenario.deepvoiceLines/synthesizeDeepvoice 자체는 삭제하지 않았다(요청받지 않은
// 삭제 금지) — 이 화면에서만 더 이상 쓰지 않는다.
//
// Phase 전이: incoming(수신) → connecting(짧은 로딩) → opening(오프닝 자동재생) → live(실시간
// 역할극, 자동 청취) → ended(한도 도달/종료). AC-006 "훈련 종료"는 모든 phase에서 상시 노출.
// 통화 경과 타이머는 "받기" 시점(call_answered)을 0으로 삼는다(OQ-U8 architect 기본값).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { consumeOpeningAudioUrl, getPendingSessionId, useSpeechRecognition } from "@/lib/recording";
import { sendMessage } from "@/lib/api";
import { scenarios, type ScenarioDoc } from "@/content/scenarios";
import EndTrainingButton from "@/components/EndTrainingButton";

type PageState = "checking" | "ready" | "no-session" | "scenario-not-found" | "load-error";
type Phase = "incoming" | "connecting" | "opening" | "live" | "ended";

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
  const [scenario, setScenario] = useState<ScenarioDoc | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speech = useSpeechRecognition();

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

  // 오프닝 이후(phase !== "incoming")부터 대화 로그를 구독한다(P-10 "같은 대화 로그·같은 자막
  // 영역"). "받기" 전에는 구독하지 않아 아직 공개되지 않은 오프닝 텍스트가 미리 새지 않는다.
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

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 통화 경과 타이머 — "받기"(call_answered) 시점부터 1초 간격 증가, ended면 정지(OQ-U8).
  useEffect(() => {
    if (phase === "incoming" || phase === "ended") return;
    const interval = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // 오디오 자동재생 정책상 브라우저가 막을 수 있다 — 재생바 대신 최소한의 "탭하여 듣기" 버튼으로만
  // 수동 재생 대안을 남긴다(P-4 비차단 원칙, 2026-07-22 재생 컨트롤 숨김 요청 반영).
  // 인라인 async IIFE로 감싼다(react-hooks/set-state-in-effect 회피 — effect 본문에서 직접
  // setState를 호출하면 "동기 setState"로 오탐한다, clone/wait·session/end 등과 동일 패턴).
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

  // P-11 이음새 없는 전환 — 오프닝 재생이 끝나면(또는 재생할 오디오가 없으면) 화면 전환·확인 버튼
  // 없이 곧바로 실시간 청취로 넘어간다.
  const handlePlaybackEnded = () => {
    setPhase((p) => (p === "opening" ? "live" : p));
    maybeStartListening();
  };

  const handleAnswer = () => {
    setPhase("connecting");
    const audio = consumeOpeningAudioUrl();
    if (audio) {
      setPlaybackUrl(audio);
      setPhase("opening");
    } else {
      // 합성 실패 등으로 재생할 오프닝 오디오가 없다 — 침묵 실패 금지, 바로 실시간 청취로 진입.
      setPhase("live");
      maybeStartListening();
    }
  };

  const handleDecline = () => {
    router.push("/session/end");
  };

  const handleEndTraining = () => {
    audioRef.current?.pause();
    router.push("/session/end");
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

  // STT가 발화를 인식하면(status === "processing") 곧바로 전송한다 — 인라인 async IIFE로 감싼다
  // (session/end/page.tsx·report/page.tsx와 동일한 회피 패턴).
  useEffect(() => {
    if (speech.status === "processing" && speech.transcript) {
      (async () => {
        await handleSend(speech.transcript);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.status, speech.transcript]);

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
  const latestMessage = messages[messages.length - 1] ?? null;

  return (
    <main className="flex min-h-screen flex-col bg-[#22303A]">
      {/* 2026-07-22: 사용자가 반복 요청·명시적으로 지시해 이 화면의 "AI 훈련용 합성" 상시 배지를
          제거했다(AC-022 편차, docs/UX.md에 결정 기록). 사전 동의·시나리오 선택 안내·전화받기 전
          프리롤 고지(PREROLL_NOTICE)·"훈련 종료" 버튼(AC-006/012/017/023)은 그대로 유지된다 —
          이번 변경은 통화 중 상시 배지 1개로 범위가 한정된다. */}
      <div className="flex items-center justify-center gap-3 pt-4">
        {phase !== "incoming" && phase !== "connecting" && (
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-[#9FB0BA]" role="status">
            {formatElapsed(elapsedSec)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center gap-3 overflow-y-auto px-8 pt-4 text-white">
        <div className="flex h-26 w-26 items-center justify-center rounded-full bg-[#41525E] text-4xl font-bold text-[#C9D4DB]">
          {callerLabel.slice(0, 1)}
        </div>
        <p className="text-3xl font-bold">{callerLabel}</p>

        {phase === "incoming" && (
          <>
            <p className="text-lg text-[#9FB0BA]">휴대전화 수신 중…</p>
            <p role="status" className="text-center text-sm text-[#9FB0BA]">
              {PREROLL_NOTICE}
            </p>
          </>
        )}

        {phase === "connecting" && (
          <p className="flex items-center gap-2 text-lg text-[#9FB0BA]" role="status">
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-[#9FB0BA] border-t-transparent"
            />
            연결하는 중…
          </p>
        )}

        {(phase === "opening" || phase === "live") && (
          <p className="text-lg text-[#9FB0BA]" role="status">
            통화 중
          </p>
        )}

        {phase === "ended" && <p className="text-lg text-[#9FB0BA]">통화 종료</p>}

        {/* voiceMode 라벨(D-13) — 오프닝 재생 중에만 노출. generic은 "당신의 목소리" 같은 근거
            없는 표기를 하지 않는다. */}
        {phase === "opening" && (
          <p className="mt-1 rounded-xl border border-[#9484D6]/50 bg-[#5B4B9E]/25 px-4 py-2.5 text-center text-[15px] leading-relaxed text-[#CFC6EE]">
            {scenario.voiceMode === "generic" ? (
              "기본 합성 음성으로 재생됩니다"
            ) : (
              <>
                이 목소리는 방금 녹음한
                <br />
                <b>당신의 목소리</b>로 합성되었습니다
              </>
            )}
          </p>
        )}

        {/* 오디오는 화면에 재생바(스크러버)를 노출하지 않는다 — 실제 통화엔 없는 "재생 컨트롤" UI가
            훈련 앱 티를 낸다는 사용자 피드백(2026-07-22)에 따라 숨김. 자동재생이 브라우저 정책으로
            막히면(P-4 비차단 원칙) 아래 작은 "탭하여 듣기" 버튼만 최소로 노출한다. */}
        {playbackUrl && (phase === "opening" || phase === "live") && (
          <audio
            ref={audioRef}
            src={playbackUrl}
            onEnded={handlePlaybackEnded}
            aria-label="상대방 음성 재생"
            className="hidden"
          />
        )}
        {playbackBlocked && (phase === "opening" || phase === "live") && (
          <button
            type="button"
            onClick={handleManualPlay}
            className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white"
          >
            🔊 탭하여 듣기
          </button>
        )}

        {/* 같은 대화 로그·같은 자막 영역(P-10) — 오프닝도 사기범 첫 턴으로 여기 함께 쌓인다. 실제
            통화 자막처럼 보이도록 카드형 배경/테두리 없이 순수 텍스트로 표시(2026-07-22). */}
        {latestMessage && (phase === "opening" || phase === "live" || phase === "ended") && (
          <p
            className="mt-2 max-w-xs text-center text-lg leading-relaxed text-white/90"
            aria-live="polite"
          >
            &ldquo;{latestMessage.text}&rdquo;
          </p>
        )}

        <div ref={listEndRef} />
      </div>

      {sendError && (
        <p role="alert" className="flex items-center gap-2 px-4 pb-2 text-base text-[#F0A79E]">
          <span aria-hidden="true">⚠</span>
          <span>{sendError}</span>
        </p>
      )}

      {phase === "incoming" && (
        <div className="flex justify-around px-9 pb-7 text-white">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleDecline}
              aria-label="전화 거절 — 훈련 종료"
              className="h-19 w-19 rounded-full bg-[#C6392F] text-base font-bold text-white"
            >
              거절
            </button>
            <span className="text-sm text-[#9FB0BA]">받지 않기</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleAnswer}
              aria-label="전화 받기"
              className="h-19 w-19 rounded-full bg-[#1E9E6A] text-base font-bold text-white"
            >
              받기
            </button>
            <span className="text-sm text-[#9FB0BA]">받기</span>
          </div>
        </div>
      )}

      {phase === "ended" && (
        <div className="flex flex-col gap-3 p-5 text-center">
          <p className="text-lg font-semibold text-white" role="status">
            대화 한도에 도달해 훈련이 종료되었습니다.
          </p>
          <button
            type="button"
            onClick={() => router.push("/session/end")}
            className="min-h-[52px] rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white"
          >
            결과 확인하러 가기
          </button>
        </div>
      )}

      {phase === "live" &&
        (speech.status === "unsupported" ? (
          <div className="px-5 pb-5">
            <p className="pb-2 text-center text-sm text-[#9FB0BA]">
              이 브라우저는 음성 인식을 지원하지 않아 텍스트로 진행합니다.
            </p>
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
                placeholder="메시지를 입력하세요..."
                className="min-h-[50px] flex-1 rounded-full border-[1.5px] border-white/30 bg-white/10 px-[18px] py-3 text-lg text-white placeholder:text-[#9FB0BA]"
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
            <div className="mt-3">
              <EndTrainingButton onClick={handleEndTraining} variant="dark" />
            </div>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <div className="flex flex-col items-center gap-3">
              {speech.status === "listening" && (
                <p role="status" className="flex items-center gap-2 text-base font-semibold text-[#7CD9C2]">
                  <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#7CD9C2]" />
                  듣고 있어요...
                </p>
              )}
              {sending && (
                <p role="status" className="text-base text-[#9FB0BA]">
                  메시지를 보내는 중...
                </p>
              )}
              {(speech.status === "permission-denied" || speech.status === "error") && speech.errorMessage && (
                <p role="alert" className="flex items-center gap-2 text-sm text-[#F0A79E]">
                  <span aria-hidden="true">⚠</span>
                  <span>{speech.errorMessage}</span>
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => (speech.status === "listening" ? speech.stop() : speech.start())}
                  disabled={sending}
                  aria-label={speech.status === "listening" ? "음성 인식 중지" : "다시 말하기"}
                  className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl disabled:opacity-50 ${
                    speech.status === "listening"
                      ? "bg-[#C6392F] text-white"
                      : "border-2 border-white text-white"
                  }`}
                >
                  🎙
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowTextInput((v) => !v)}
                className="text-sm font-semibold text-[#9FB0BA] underline"
              >
                {showTextInput ? "텍스트 입력 숨기기" : "텍스트로 입력할게요"}
              </button>
            </div>

            {showTextInput && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSend();
                }}
                className="mt-3 flex items-center gap-2.5"
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
                  placeholder="메시지를 입력하세요..."
                  className="min-h-[50px] flex-1 rounded-full border-[1.5px] border-white/30 bg-white/10 px-[18px] py-3 text-lg text-white placeholder:text-[#9FB0BA]"
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
            )}

            <div className="mt-3">
              <EndTrainingButton onClick={handleEndTraining} variant="dark" />
            </div>
          </div>
        ))}

      {/* AC-006 상시 종료 — incoming(거절이 겸함)/ended(별도 버튼) 이외의 모든 phase에서 노출. */}
      {(phase === "connecting" || phase === "opening") && (
        <div className="px-5 pb-5">
          <EndTrainingButton onClick={handleEndTraining} variant="dark" />
        </div>
      )}
    </main>
  );
}
