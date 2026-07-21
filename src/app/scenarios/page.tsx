"use client";

// UX-004 시나리오 선택 (Track B·C, T6 콘텐츠 + T5 배선, AC-001/AC-002).
// RouteGuard(lib/auth, T18)가 이미 인증되지 않은 사용자를 /login으로 보내므로, 이 화면은
// "인증된 사용자"를 전제로 한다(다른 UX 화면과 동일 패턴).
//
// T5 핵심 갭 해소: 이 화면이 지금까지 createSession을 호출하지 않던 T2/T6 스텁이었다. 여기서
// (1) src/content/scenarios(T6)의 공개 메타로 시나리오 카드를 렌더링하고, (2) getPendingSessionId()
// (T3가 온보딩에서 만든 사전 세션 id)로 sessions/{sid} 문서를 읽어 클론된 voiceId를 확보한 뒤,
// (3) createSession({ sessionId: pendingId, scenarioId, voiceId })를 호출해 pendingId를 그대로
// 세션 id로 채택시킨다(T4가 서버 쪽에 이미 마련해 둔 sessionId 채택 로직, functions/src/session/
// index.ts 참고 — 이 화면이 그 로직을 처음 실사용한다). 시나리오 목록은 Firestore `scenarios`
// 컬렉션이 아니라 정적 콘텐츠(src/content/scenarios)를 직접 쓴다 — UX.md UX-004 Architect Handoff가
// "Firestore 또는 정적 콘텐츠" 둘 다 허용하고, seed 스크립트는 아직 실 Firebase 프로젝트에 연결되지
// 않아 실행된 적이 없다(T6 구현 보고서 참고) — 정적 콘텐츠 쪽이 이 프로토타입 단계에서 더 확실하다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPendingSessionId } from "@/lib/recording";
import { createSession } from "@/lib/api";
import { scenarios } from "@/content/scenarios";

type PageState =
  | "checking"
  | "no-session"
  | "voice-not-ready"
  | "read-error"
  | "ready"
  | "starting"
  | "start-error";

export default function ScenariosPage() {
  const router = useRouter();
  // sessionStorage 조회는 클라이언트 전용이라 lazy 초기값으로 한 번만 읽는다(clone/wait 페이지와
  // 동일 패턴 — react-hooks/set-state-in-effect 회피).
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [state, setState] = useState<PageState>(sessionId ? "checking" : "no-session");
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await getDoc(doc(db, "sessions", sessionId));
        if (cancelled) return;
        const data = snapshot.data();
        if (data?.voiceId && data?.cloneStatus === "ready") {
          setVoiceId(data.voiceId as string);
          setState("ready");
        } else {
          setState("voice-not-ready");
        }
      } catch {
        if (!cancelled) setState("read-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const scenarioEntries = Object.entries(scenarios);

  const handleStart = async () => {
    if (!sessionId || !voiceId || !selectedScenarioId) return;
    setState("starting");
    setStartError(null);
    try {
      await createSession({ sessionId, scenarioId: selectedScenarioId, voiceId });
      router.push("/session/play");
    } catch {
      setStartError("시나리오를 시작하지 못했습니다. 다시 시도해 주세요.");
      setState("ready");
    }
  };

  if (state === "checking") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="flex items-center gap-2 text-lg" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
          />
          시나리오 목록을 불러오는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "no-session" || state === "voice-not-ready" || state === "read-error") {
    const message =
      state === "no-session"
        ? "진행 중인 온보딩 정보를 찾을 수 없습니다. 목소리 등록부터 다시 진행해 주세요."
        : state === "voice-not-ready"
          ? "목소리 클론이 아직 준비되지 않았습니다. 클론 생성 화면으로 돌아가 주세요."
          : "시나리오 진입 정보를 불러오지 못했습니다. 다시 시도해 주세요.";
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>{message}</span>
        </p>
        <button
          type="button"
          onClick={() =>
            router.push(state === "voice-not-ready" ? "/clone/wait" : "/onboarding/record")
          }
          className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
        >
          {state === "voice-not-ready" ? "클론 생성 화면으로" : "목소리 등록으로"}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-bold">시나리오 선택</h1>
      <p className="text-base text-gray-600">
        체험할 사기 시나리오를 골라 주세요. 실제 사기가 아니라 훈련용 시뮬레이션입니다.
      </p>

      <ul className="flex flex-col gap-4">
        {scenarioEntries.map(([scenarioId, scenario]) => {
          const selected = selectedScenarioId === scenarioId;
          return (
            <li key={scenarioId}>
              <label
                className={`flex min-h-[48px] cursor-pointer flex-col gap-2 rounded border p-4 text-lg ${
                  selected ? "border-black bg-gray-50" : "border-gray-300"
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="scenario"
                    value={scenarioId}
                    checked={selected}
                    onChange={() => setSelectedScenarioId(scenarioId)}
                    className="mt-1 h-5 w-5 shrink-0"
                    aria-describedby={`scenario-${scenarioId}-meta`}
                  />
                  <span className="font-bold">{scenario.title}</span>
                </span>
                <span id={`scenario-${scenarioId}-meta`} className="flex flex-col gap-1 pl-8 text-sm text-gray-700">
                  <span>사기 유형: {scenario.fraudType}</span>
                  <span>예상 소요: {scenario.estimatedDuration}</span>
                  <span>난이도: {scenario.difficulty}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {startError && (
        <p role="alert" className="flex items-center gap-2 text-base text-red-700">
          <span aria-hidden="true">⚠</span>
          <span>{startError}</span>
        </p>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={!selectedScenarioId || state === "starting"}
        className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {state === "starting" ? "시작하는 중..." : "시작"}
      </button>
    </main>
  );
}
