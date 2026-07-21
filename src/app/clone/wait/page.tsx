"use client";

// UX-003 클론 생성 대기 (Track A, T4, AC-018).
// Entry: UX-002에서 "클론 생성" 버튼이 이미 createVoiceClone 콜러블을 호출·완료한 뒤 이 화면으로
// 이동한다(record page 참고). 이 화면은 sessions/{sid}.cloneStatus를 구독해 단계형 진행 상태를
// 보여준다(UX.md D-4 "전용 화면으로 분리"). Mock은 항상 즉시 성공하므로 정교한 타임아웃/재시도
// 로직은 만들지 않는다(프로토타입 우선순위, 태스크 지시).
//
// **Phase B(2026-07-22 사용자 결정) — 온보딩 순서 변경**: 시나리오 선택(UX-004)이 이제 녹음보다
// 먼저 온다. 이 화면은 클론이 준비되면 scenarios/page.tsx가 sessionStorage에 남겨둔
// selectedScenarioId를 읽어 createSession을 대신 호출하고(사용자가 다시 시나리오를 고를 필요
// 없음), 바로 /session/play로 이동한다. cloneStatus 구독(Effect 1)과 createSession 호출
// (Effect 2)을 분리해 "다시 시도"가 스냅샷 재발화 없이도 실제로 재호출되게 한다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPendingSessionId, getSelectedScenarioId, setOpeningAudioUrl } from "@/lib/recording";
import { createSession } from "@/lib/api";

type CloneState = "checking" | "pending" | "ready" | "failed" | "no-session" | "read-error";
type StartState = "idle" | "starting" | "start-error" | "no-scenario";

export default function CloneWaitPage() {
  const router = useRouter();
  // sessionStorage 조회는 클라이언트 전용(SSR 없음)이라 lazy 초기값으로 한 번만 읽는다 — effect
  // 본문에서 동기적으로 setState를 호출하지 않기 위함(react-hooks/set-state-in-effect).
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [cloneState, setCloneState] = useState<CloneState>(sessionId ? "checking" : "no-session");
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [startState, setStartState] = useState<StartState>("idle");
  const [startAttempt, setStartAttempt] = useState(0);

  // Effect 1 — cloneStatus 구독만 담당(클론 진행 상태 표시). voiceId가 확보되면 저장만 하고,
  // 실제 createSession 호출은 Effect 2로 넘긴다.
  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = onSnapshot(
      doc(db, "sessions", sessionId),
      (snapshot) => {
        const data = snapshot.data();
        const status = data?.cloneStatus;
        if (status === "ready") {
          setVoiceId((data?.voiceId as string) ?? null);
          setCloneState("ready");
        } else if (status === "failed") {
          setCloneState("failed");
        } else {
          setCloneState("pending");
        }
      },
      () => setCloneState("read-error"),
    );
    return () => unsubscribe();
  }, [sessionId]);

  // Effect 2 — 클론이 준비되면 createSession을 1회 호출한다. startAttempt를 늘리면(재시도 버튼)
  // 이 effect가 다시 실행되어 스냅샷 재발화 없이도 재호출된다. 인라인 async IIFE로 감싼다
  // (session/end/page.tsx·report/page.tsx와 동일한 회피 패턴 — effect 본문에서 직접 setState를
  // 호출하면 react-hooks/set-state-in-effect가 "동기 setState"로 오탐한다).
  useEffect(() => {
    if (cloneState !== "ready" || !sessionId || !voiceId) return;
    let cancelled = false;
    (async () => {
      const scenarioId = getSelectedScenarioId();
      if (!scenarioId) {
        if (!cancelled) setStartState("no-scenario");
        return;
      }
      setStartState("starting");
      try {
        const result = await createSession({ sessionId, scenarioId, voiceId });
        if (cancelled) return;
        if (result.openingAudioUrl) setOpeningAudioUrl(result.openingAudioUrl);
        router.push("/session/play");
      } catch {
        if (!cancelled) setStartState("start-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloneState, sessionId, voiceId, startAttempt, router]);

  const handleRetryStart = () => setStartAttempt((n) => n + 1);
  const handleRetryScenarios = () => router.push("/scenarios");
  const handleRetryRecord = () => router.push("/onboarding/record");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-bold">목소리 클론 생성 중</h1>

      {(cloneState === "checking" || cloneState === "pending") && (
        <p className="flex items-center gap-2 text-lg" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
          />
          잠시만 기다려 주세요. 내 목소리로 클론을 만들고 있습니다...
        </p>
      )}

      {cloneState === "ready" && startState === "starting" && (
        <p className="flex items-center gap-2 text-lg" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
          />
          목소리 클론이 준비됐습니다. 훈련을 시작하는 중입니다...
        </p>
      )}

      {cloneState === "ready" && startState === "start-error" && (
        <>
          <p role="alert" className="flex items-center gap-2 text-base text-red-700">
            <span aria-hidden="true">⚠</span>
            <span>훈련을 시작하지 못했습니다. 다시 시도해 주세요.</span>
          </p>
          <button
            type="button"
            onClick={handleRetryStart}
            className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
          >
            다시 시도
          </button>
        </>
      )}

      {cloneState === "ready" && startState === "no-scenario" && (
        <>
          <p role="alert" className="flex items-center gap-2 text-base text-red-700">
            <span aria-hidden="true">⚠</span>
            <span>선택한 시나리오 정보를 찾을 수 없습니다. 시나리오를 다시 선택해 주세요.</span>
          </p>
          <button
            type="button"
            onClick={handleRetryScenarios}
            className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
          >
            시나리오 선택으로
          </button>
        </>
      )}

      {(cloneState === "failed" || cloneState === "read-error" || cloneState === "no-session") && (
        <>
          <p role="alert" className="flex items-center gap-2 text-base text-red-700">
            <span aria-hidden="true">⚠</span>
            <span>
              {cloneState === "no-session"
                ? "진행 중인 녹음 정보를 찾을 수 없습니다. 다시 녹음해 주세요."
                : "목소리 클론 생성에 실패했습니다. 다시 시도해 주세요."}
            </span>
          </p>
          <button
            type="button"
            onClick={handleRetryRecord}
            className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
          >
            재녹음으로 돌아가기
          </button>
        </>
      )}
    </main>
  );
}
