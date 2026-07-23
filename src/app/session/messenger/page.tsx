"use client";

// UX-022 메신저 채팅 셸 — 카카오톡형/문자메시지형(iOS·삼성·기본) 통합 (T29) — docs/UX.md UX-022,
// AC-030/031/032/045/047/006/002. 카카오·문자는 **하나의 화면**에서 surface(kakao|sms) 값만 다르게
// 재현한다(D-22, ux-design 판단 — 안전 셸·콘텐츠·링크는 표면과 무관하게 동일, 스킨은 외형뿐).
// 세션 상태 참조 패턴은 src/app/session/play/page.tsx(UX-014)를 그대로 따른다 —
// getPendingSessionId()로 sessionStorage의 사전 세션 id를 읽고, Firestore sessions/{sid} 문서를
// getDoc으로 1회 조회해 scenarioId→scenarios 콘텐츠 카탈로그를 찾는다.
//
// **기존 역할극 엔진 재사용(T29 지시)**: 메시지 전송·수신은 sendMessage(functions/src/roleplay,
// T7)를 표면만 바꿔 그대로 쓴다 — 음성 재생(audioUrl)은 무시한다(메신저는 TTS를 재생하지 않는다).
//
// **에스컬레이션 UI는 만들지 않는다(T29 범위 밖, T30 소관)** — 이 화면으로 진입 가능한 시나리오는
// UX-024가 이미 에스컬레이션 없는 2종만 통과시킨 뒤이므로 "전화로 확인" 버튼은 두지 않는다.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPendingSessionId } from "@/lib/recording";
import { sendMessage, updateMessengerSkin, type MessengerAttachment } from "@/lib/api";
import { scenarios, type ScenarioDoc } from "@/content/scenarios";
import { detectMessengerSkin, type MessengerSkin } from "@/lib/messenger/detectSkin";
import EndTrainingButton from "@/components/EndTrainingButton";
import SyntheticLabel from "@/components/SyntheticLabel";
import MessengerFakeLanding from "@/components/MessengerFakeLanding";

type PageState = "checking" | "ready" | "no-session" | "scenario-not-found" | "load-error";
// detectSkin.ts의 MessengerSkinSource는 auto|fallback만 다룬다(자동 감지 결과 타입) — 이 화면은
// 수동 전환(manual)까지 다루므로 로컬에서 더 넓은 유니언을 쓴다(P-16, AC-031).
type SkinSourceState = "auto" | "manual" | "fallback";

type ChatMessage = {
  id: string;
  role: "scammer" | "user";
  text: string;
  turnIndex: number;
  attachments?: MessengerAttachment[];
};

const SKIN_CYCLE: MessengerSkin[] = ["ios", "samsung", "default"];
const SKIN_LABEL: Record<MessengerSkin, string> = {
  ios: "iOS 메시지",
  samsung: "삼성 메시지",
  default: "기본 화면",
};

// 표면·스킨별 말풍선 색(외형뿐 — 어떤 안전 판정도 게이팅하지 않는다, §13.4/13.5). 카카오는
// 실제 카카오톡 말풍선 배색(정확 모사, OQ-18 accepted risk)을 재현한다.
function bubbleClass(role: "scammer" | "user", surface: "kakao" | "sms", skin: MessengerSkin) {
  if (surface === "kakao") {
    return role === "user"
      ? "bg-[#FEE500] text-[#22303A]"
      : "bg-white text-[#22303A] border border-[#E2DDD3]";
  }
  if (skin === "ios") {
    return role === "user" ? "bg-[#0B84FF] text-white" : "bg-[#E5E5EA] text-[#22303A]";
  }
  if (skin === "samsung") {
    return role === "user" ? "bg-[#1D6FE0] text-white" : "bg-[#EFF1F5] text-[#22303A]";
  }
  return role === "user" ? "bg-[#0E6B62] text-white" : "bg-white text-[#22303A] border border-[#E2DDD3]";
}

export default function MessengerSessionPage() {
  const router = useRouter();
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [pageState, setPageState] = useState<PageState>(sessionId ? "checking" : "no-session");
  const [scenario, setScenario] = useState<ScenarioDoc | null>(null);
  const [ended, setEnded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [messengerSkin, setMessengerSkin] = useState<MessengerSkin>("default");
  const [skinSource, setSkinSource] = useState<SkinSourceState>("fallback");
  const [fakeLanding, setFakeLanding] = useState<{ fakeLandingId: string; displayText: string } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 세션·시나리오 로드 + (문자형이면) 스킨 결정. session/play/page.tsx와 동일하게 인라인 async
  // IIFE로 감싼다(react-hooks/set-state-in-effect 회피 관례).
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
        if (!found || found.channel !== "messenger") {
          setPageState("scenario-not-found");
          return;
        }
        setScenario(found);
        if (data.status === "ended") {
          setEnded(true);
        }

        if (found.surface === "sms") {
          const persistedSkin = data.messengerSkin as MessengerSkin | undefined;
          const persistedSource = data.skinSource as SkinSourceState | undefined;
          if (persistedSkin && persistedSource) {
            // 이미 결정된 스킨이 있다(새로고침 복원 또는 이전 수동 전환, P-16) — 재감지하지 않는다.
            setMessengerSkin(persistedSkin);
            setSkinSource(persistedSource);
          } else {
            const detected = detectMessengerSkin(
              typeof navigator !== "undefined" ? navigator.userAgent : "",
            );
            setMessengerSkin(detected.skin);
            setSkinSource(detected.source);
            // 세션 문서에 지속(P-16) — 실패해도 화면 표시는 이미 로컬 state로 끝났다(비차단).
            updateMessengerSkin({
              sessionId,
              messengerSkin: detected.skin,
              skinSource: detected.source,
            }).catch(() => {});
          }
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

  // 대화 로그 구독 — "받기" 개념이 없어(채팅은 진입 즉시 오프닝 메시지가 보인다) 로드 완료 후
  // 곧바로 구독한다.
  useEffect(() => {
    if (!sessionId || pageState !== "ready") return;
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
            attachments: data.attachments as MessengerAttachment[] | undefined,
          };
        }),
      );
    });
    return unsubscribe;
  }, [sessionId, pageState]);

  const handleSend = async () => {
    const text = input.trim();
    if (!sessionId || !text || sending || ended) return;
    setSending(true);
    setSendError(null);
    try {
      const result = await sendMessage({ sessionId, userText: text });
      setInput("");
      if (result.ended) {
        setEnded(true);
      }
    } catch {
      setSendError("메시지를 보내지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleToggleSkin = () => {
    const next = SKIN_CYCLE[(SKIN_CYCLE.indexOf(messengerSkin) + 1) % SKIN_CYCLE.length];
    setMessengerSkin(next);
    setSkinSource("manual");
    if (sessionId) {
      updateMessengerSkin({ sessionId, messengerSkin: next, skinSource: "manual" }).catch(() => {});
    }
  };

  const handleEndTraining = () => {
    router.push("/session/end");
  };

  if (pageState === "no-session" || pageState === "scenario-not-found" || pageState === "load-error") {
    const message =
      pageState === "no-session"
        ? "진행 중인 세션 정보를 찾을 수 없습니다. 시나리오 선택부터 다시 진행해 주세요."
        : pageState === "scenario-not-found"
          ? "선택된 메신저 시나리오 정보를 찾을 수 없습니다. 시나리오를 다시 선택해 주세요."
          : "채팅 정보를 불러오지 못했습니다. 다시 시도해 주세요.";
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>{message}</span>
        </p>
        <button
          type="button"
          onClick={() => router.push("/scenarios/messenger")}
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
          채팅을 불러오는 중입니다...
        </p>
      </main>
    );
  }

  const surface = scenario.surface ?? "sms";

  return (
    <main className="flex min-h-screen flex-col bg-[#FAF8F5]">
      {/* 상단 상시 고정 영역(스크롤 무관) — 카카오 면책 배너(닫기 불가·상시)·"AI 훈련용 모의"
          표식·스킨 토글·"훈련 종료"(AC-006). */}
      <div className="sticky top-0 z-20 flex flex-col border-b border-[#E2DDD3] bg-white">
        {surface === "kakao" && (
          // AC-047 핵심 — 닫기 버튼 없음. 어떤 state도 이 배너를 숨기지 않는다(영구 비활성 불가).
          <p
            role="status"
            className="bg-[#FEF6D8] px-4 py-2 text-center text-sm font-semibold text-[#6B5A1E]"
          >
            ⚠ 카카오톡 실제 서비스와 무관한 훈련용 재현입니다
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <SyntheticLabel label="AI 훈련용 모의" />
            {surface === "sms" && (
              <button
                type="button"
                onClick={handleToggleSkin}
                className="min-h-[40px] rounded-full border border-[#C9C2B6] px-3 text-sm font-semibold text-[#22303A] hover:bg-[#F2EFE9]"
              >
                스킨: {SKIN_LABEL[messengerSkin]} (탭하여 전환)
              </button>
            )}
          </div>
          <EndTrainingButton onClick={handleEndTraining} />
        </div>
        {surface === "sms" && skinSource === "fallback" && (
          <p role="status" className="px-4 pb-2 text-xs leading-relaxed text-[#6B655C]">
            기기를 자동 인식하지 못해 기본 화면으로 표시합니다. 직접 바꿀 수 있어요.
          </p>
        )}
      </div>

      {/* 대화 상단 맥락 — 발신자(사칭 대상)와 표면. */}
      <p className="px-4 pt-3 text-sm text-[#6B655C]">
        {scenario.callerLabel}(으)로부터 {surface === "kakao" ? "카카오톡" : "문자"} 메시지가
        도착했습니다.
      </p>

      {/* 대화 목록 — 발신자 구분은 색이 아니라 라벨로(위에 "나"/callerLabel 텍스트). */}
      <ul className="flex flex-1 flex-col gap-3 px-4 py-4" aria-live="polite">
        {messages.map((message) => (
          <li
            key={message.id}
            className={`flex flex-col gap-1 ${message.role === "user" ? "items-end" : "items-start"}`}
          >
            <span className="text-xs font-semibold text-[#6B655C]">
              {message.role === "user" ? "나" : scenario.callerLabel}
            </span>
            <span
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-base leading-relaxed ${bubbleClass(
                message.role,
                surface,
                messengerSkin,
              )}`}
            >
              {message.text}
            </span>
            {message.attachments?.map((attachment, i) =>
              attachment.kind === "link" ? (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setFakeLanding({
                      fakeLandingId: attachment.fakeLandingId,
                      displayText: attachment.displayText,
                    })
                  }
                  aria-label={`링크(모의): ${attachment.displayText}`}
                  className="mt-1 flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-[#0E6B62] bg-[#E4F0EC] px-4 py-2 text-sm font-bold text-[#0E6B62] underline decoration-2 underline-offset-2"
                >
                  <span aria-hidden="true">🔗</span>
                  {attachment.displayText}
                  <span className="rounded-full bg-[#0E6B62] px-2 py-0.5 text-xs font-bold text-white">
                    모의
                  </span>
                </button>
              ) : null,
            )}
          </li>
        ))}
      </ul>

      {/* 입력·전송 또는 종료 상태 — 빈 메시지 전송 방지, 전송 중 중복 전송 방지. */}
      <div className="sticky bottom-0 border-t border-[#E2DDD3] bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {ended ? (
          <div className="flex flex-col gap-3 text-center">
            <p className="text-base font-semibold text-[#22303A]" role="status">
              대화가 종료되었습니다.
            </p>
            <button
              type="button"
              onClick={() => router.push("/session/end")}
              className="min-h-[52px] rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white hover:bg-[#0B564F]"
            >
              결과 확인하러 가기
            </button>
          </div>
        ) : (
          <>
            {sendError && (
              <p role="alert" className="mb-2 flex items-center gap-2 text-sm text-[#C6392F]">
                <span aria-hidden="true">⚠</span>
                <span>{sendError}</span>
              </p>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
              className="flex items-center gap-2.5"
            >
              <label htmlFor="messenger-chat-input" className="sr-only">
                메시지 입력
              </label>
              <input
                id="messenger-chat-input"
                ref={inputRef}
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onFocus={(event) =>
                  event.currentTarget.scrollIntoView({ behavior: "smooth", block: "center" })
                }
                disabled={sending}
                placeholder="메시지를 입력하세요..."
                className="min-h-[50px] flex-1 rounded-full border-[1.5px] border-[#C9C2B6] px-[18px] py-3 text-lg text-[#22303A] placeholder:text-[#6B655C]"
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
          </>
        )}
      </div>

      {fakeLanding && (
        <MessengerFakeLanding
          title={fakeLanding.displayText}
          onClose={() => setFakeLanding(null)}
          onEndTraining={handleEndTraining}
        />
      )}
    </main>
  );
}
