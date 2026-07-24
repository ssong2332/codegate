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
// **T30 후속 수정 — 에스컬레이션 연출 배선**: T29는 이 화면에 에스컬레이션 UI를 만들지 않았다
// (UX-024가 그때는 에스컬레이션 2종을 "준비 중"으로 막아 두어서다). 이제 UX-025(voice-select)가
// 생겨 그 2종도 이 화면까지 들어올 수 있으므로, ①명시 "전화로 확인" 버튼(scenario.escalation
// 있을 때만, 1턴부터 상시)과 ②sendMessage 응답의 escalation 플래그 처리(전이 연출 후 /session/play
// 이동)를 배선한다(§13.2/13.3, P-18, AC-034/036/039).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPendingSessionId } from "@/lib/recording";
import {
  requestEscalation,
  sendMessage,
  updateMessengerSkin,
  type MessengerAttachment,
} from "@/lib/api";
import { scenarios, type ScenarioDoc } from "@/content/scenarios";
import { detectMessengerSkin, type MessengerSkin } from "@/lib/messenger/detectSkin";
import EndTrainingButton from "@/components/EndTrainingButton";
import SyntheticLabel from "@/components/SyntheticLabel";
import MessengerFakeLanding from "@/components/MessengerFakeLanding";
import { Banner, Button } from "@/components/ui";

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
  // T30 — 에스컬레이션 전이 연출(P-18) 표시 중. true가 되면 잠시 후 /session/play로 이동한다.
  const [escalating, setEscalating] = useState(false);
  const [escalationError, setEscalationError] = useState<string | null>(null);
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
    if (!sessionId || !text || sending || ended || escalating) return;
    setSending(true);
    setSendError(null);
    try {
      const result = await sendMessage({ sessionId, userText: text });
      setInput("");
      // T30(§13.2) — 자동 신호든 max-turn 폴백이든, 서버가 이미 transitionChannel을 마쳤다는
      // 뜻이다. 클라는 이 플래그만 보고 전이 연출로 넘어간다(자유텍스트 직접 분류 안 함).
      if (result.escalation?.toChannel === "voice") {
        setEscalating(true);
        return;
      }
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

  // 명시 전환 버튼("전화로 확인", §13.3 — 1턴부터 상시). 서버가 즉시 transitionChannel(manual_button)
  // 을 수행하고 확인 플래그를 돌려주면 handleSend와 동일한 전이 연출로 넘어간다.
  const handleRequestEscalation = async () => {
    if (!sessionId || escalating || ended) return;
    setEscalationError(null);
    try {
      const result = await requestEscalation({ sessionId });
      if (result.escalation?.toChannel === "voice") {
        setEscalating(true);
      }
    } catch {
      setEscalationError("통화 연결을 요청하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  // 전이 연출(P-18) — "사기범이 전화를 거는" 화면을 잠시 보여준 뒤 UX-014 수신 phase로 이음새
  // 없이 인계한다(/session/play는 이미 phase 기본값이 incoming이라 그대로 진입한다).
  useEffect(() => {
    if (!escalating) return;
    const timer = setTimeout(() => router.push("/session/play"), 1500);
    return () => clearTimeout(timer);
  }, [escalating, router]);

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
        <div className="w-full max-w-xs">
          <Button variant="secondary" type="button" onClick={() => router.push("/scenarios/messenger")}>
            시나리오 선택으로
          </Button>
        </div>
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
          // Banner 공용 컴포넌트(caution, sticky) 재사용 — 메신저 플로우.dc.html의 상시 고지
          // 배너와 동일 톤(ⓘ 아이콘 + 주의 배경). 텍스트 내용은 기존 AC-047/045 문구를 그대로 유지.
          // (Banner의 기본 rounded-[12px]는 그대로 둔다 — 모서리를 각지게 강제로 덮어쓰려면
          // Banner.tsx 자체를 수정해야 하는데 공용 컴포넌트는 이 작업 범위 밖이다.)
          <Banner variant="caution" sticky>
            카카오톡 실제 서비스와 무관한 훈련용 재현입니다
          </Banner>
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
          <div className="flex items-center gap-2">
            {/* 명시 전환 버튼(§13.3 — 1턴부터 상시, AC-034) — 에스컬레이션 가능 시나리오에서만.
                전이 플로우.dc.html의 "📞 전화로 확인" 채움 스타일(브랜드 청록 CTA)을 그대로 채용
                — 위치는 상단 sticky 툴바에 그대로 두었다(항상 노출 요건은 이미 충족, §13.3 판단
                근거는 보고 참고). */}
            {scenario.escalation && !ended && (
              <button
                type="button"
                onClick={() => void handleRequestEscalation()}
                disabled={escalating}
                className="min-h-[40px] rounded-full bg-[#0E6B62] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#0B564F] disabled:cursor-not-allowed disabled:bg-[#F2EFE9] disabled:text-[#C9C2B6]"
              >
                📞 전화로 확인
              </button>
            )}
            <EndTrainingButton onClick={handleEndTraining} />
          </div>
        </div>
        {surface === "sms" && skinSource === "fallback" && (
          <p role="status" className="px-4 pb-2 text-xs leading-relaxed text-[#6B655C]">
            기기를 자동 인식하지 못해 기본 화면으로 표시합니다. 직접 바꿀 수 있어요.
          </p>
        )}
        {escalationError && (
          <p role="alert" className="px-4 pb-2 text-xs leading-relaxed text-[#C6392F]">
            {escalationError}
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
            <Button type="button" onClick={() => router.push("/session/end")}>
              결과 확인하러 가기
            </Button>
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

      {/* 전이 연출(P-18, T30) — "사기범이 전화를 거는" 화면으로 잠시 전환한 뒤 통화 셸(UX-014)
          수신 phase로 이음새 없이 인계한다(위 effect가 1.5초 후 라우팅, 타이밍 로직은 무변경).
          새 의존성 없이 기존 call-ring-pulse(globals.css, UX-014와 동일 모션 톤)만 재사용한다.
          배경색은 디자인 시스템의 공식 "통화 셸 배경" 토큰(#22303A, 반투명)으로 맞춰 UX-014
          수신 화면과 이음새 없이 이어지게 했다(전이 플로우.dc.html의 반투명 오버레이와 동일 취지 —
          아래 채팅 화면이 은은히 비쳐 보인다). */}
      {escalating && (
        <div
          role="status"
          className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#22303A]/95 text-white"
        >
          <span className="rounded-full border border-[#B96A1B]/50 bg-[#B96A1B]/25 px-3 py-1.5 text-xs font-semibold text-[#FBF3E8]">
            🔊 훈련용 가상 통화
          </span>
          <div className="relative flex items-center justify-center">
            <span
              aria-hidden="true"
              className="call-ring-pulse absolute h-24 w-24 rounded-full bg-[#7CD9C2]/30"
            />
            <span
              aria-hidden="true"
              className="call-ring-pulse absolute h-24 w-24 rounded-full bg-[#7CD9C2]/20"
              style={{ animationDelay: "0.7s" }}
            />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[#41525E] text-4xl">
              🔔
            </div>
          </div>
          <p className="text-xl font-bold">{scenario.callerLabel}(으)로부터 전화가 옵니다</p>
        </div>
      )}
    </main>
  );
}
