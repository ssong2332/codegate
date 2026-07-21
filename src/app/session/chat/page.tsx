"use client";

// UX-006 역할극 채팅 (Track A·B, T7/T8, AC-003~005/AC-013/AC-024/AC-007).
//
// Entry: /session/play(UX-005)의 "계속 (역할극 시작)" 버튼에서 이 화면으로 이동한다. play 화면과
// 동일하게 getPendingSessionId()로 세션을 식별한다(별도 네비게이션 state/query param 불필요,
// scenarios/play 페이지와 동일 패턴). createSession이 이미 오프닝 사기범 대사를 sessions/{sid}/
// messages에 write해 두었으므로(functions/src/session/index.ts), 이 화면은 그 서브컬렉션을
// onSnapshot으로 구독해 대화 내역을 그리고, 사용자가 입력을 보내면 sendMessage 콜러블을 호출한다
// (서버가 응답을 같은 서브컬렉션에 write하므로 구독이 자동으로 반영 — 낙관적 로컬 append 불필요).
//
// AC-003~005/AC-013/AC-024: 인격 유지·약화 수법·악용 거부·인젝션 방어는 서버(functions/src/
// roleplay)가 전담하며 이 화면은 순수 렌더링/전송만 담당한다. AC-007: 턴/시간 한도 도달 시
// sendMessage 응답(ended:true)이 서버 쪽 자동 종료를 알려주며, 이 화면은 그 시점에 입력을
// 잠그고 "훈련 종료" 경로로 안내한다(EndTrainingButton과 동일한 /session/end 이동 — AC-006).
//
// ⚠️ LLM 실호출 여부(투명 고지): LLM_API_KEY 미확보로 서버는 여전히 MockLlmClient를 쓴다
// (functions/src/roleplay/index.ts 상단 주석). sendMessage 응답의 isMock으로 이를 전달받아
// 화면에 "Mock 응답" 배지로 노출한다 — 실 LLM(Claude/Gemini)로 교체 전까지는 최종 데모에
// 부적합함을 화면에서도 숨기지 않는다(PRD Risks "목업 잔존" 원칙, T19와 동일 취지).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPendingSessionId } from "@/lib/recording";
import { sendMessage } from "@/lib/api";
import EndTrainingButton from "@/components/EndTrainingButton";

type PageState = "checking" | "no-session" | "load-error" | "active" | "ended";

type ChatMessage = {
  id: string;
  role: "scammer" | "user";
  text: string;
  turnIndex: number;
};

export default function SessionChatPage() {
  const router = useRouter();
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [state, setState] = useState<PageState>(sessionId ? "checking" : "no-session");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  const [maxUserTurns, setMaxUserTurns] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await getDoc(doc(db, "sessions", sessionId));
        if (cancelled) return;
        const data = snapshot.data();
        if (!data) {
          setState("load-error");
          return;
        }
        setTurnCount((data.turnCount as number) ?? 0);
        setMaxUserTurns((data.maxUserTurns as number) ?? null);
        setIsMock(data.llmProvider === "mock");
        setState(data.status === "ended" ? "ended" : "active");
      } catch {
        if (!cancelled) setState("load-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || state === "checking" || state === "no-session" || state === "load-error") {
      return;
    }
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
  }, [sessionId, state]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!sessionId || !text || sending || state !== "active") return;
    setSending(true);
    setSendError(null);
    try {
      const result = await sendMessage({ sessionId, userText: text });
      setInput("");
      setTurnCount(result.turnCount);
      setIsMock(result.isMock);
      if (result.ended) {
        setState("ended");
      }
    } catch {
      setSendError("메시지를 보내지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  };

  const handleEndTraining = () => {
    router.push("/session/end");
  };

  if (state === "checking") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="flex items-center gap-2 text-lg" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
          />
          대화 정보를 불러오는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "no-session" || state === "load-error") {
    const message =
      state === "no-session"
        ? "진행 중인 세션 정보를 찾을 수 없습니다. 시나리오 선택부터 다시 진행해 주세요."
        : "대화 정보를 불러오지 못했습니다. 다시 시도해 주세요.";
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>{message}</span>
        </p>
        <button
          type="button"
          onClick={() => router.push("/scenarios")}
          className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
        >
          시나리오 선택으로
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">역할극 채팅</h1>
        {/* AC-006 상시 종료 컨트롤 — 모든 상태에서 항상 노출. */}
        <EndTrainingButton onClick={handleEndTraining} />
      </div>

      {isMock && (
        <p role="status" className="rounded bg-yellow-50 p-3 text-sm text-yellow-900">
          ⚠ 현재 상대방 응답은 실 LLM이 아닌 개발용 Mock 응답입니다.
        </p>
      )}

      {maxUserTurns !== null && (
        <p className="text-sm text-gray-600" aria-live="polite">
          대화 {turnCount} / {maxUserTurns}턴
        </p>
      )}

      <section
        className="flex min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto rounded border border-gray-300 p-4"
        aria-live="polite"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <p
              className={`max-w-[80%] rounded-lg px-4 py-2 text-base leading-relaxed ${
                message.role === "user"
                  ? "bg-black text-white"
                  : "bg-gray-100 text-gray-900"
              }`}
            >
              {message.text}
            </p>
          </div>
        ))}
        <div ref={listEndRef} />
      </section>

      {sendError && (
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>{sendError}</span>
        </p>
      )}

      {state === "ended" ? (
        <div className="flex flex-col gap-3 rounded border border-gray-300 p-4 text-center">
          <p className="text-lg font-semibold" role="status">
            대화 한도에 도달해 훈련이 종료되었습니다.
          </p>
          <button
            type="button"
            onClick={handleEndTraining}
            className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
          >
            결과 확인하러 가기
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
          className="flex gap-2"
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
            className="min-h-[48px] flex-1 rounded border border-gray-400 px-4 py-2 text-lg"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {sending ? "전송 중..." : "전송"}
          </button>
        </form>
      )}
    </main>
  );
}
