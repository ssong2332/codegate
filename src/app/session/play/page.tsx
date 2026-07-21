"use client";

// UX-005 딥보이스 가족사칭 오디오 인앱 재생 (Track A, T5, AC-019/AC-022/AC-006).
// Entry: /scenarios(UX-004)에서 createSession 호출 성공 직후 이 화면으로 이동한다. createSession이
// pendingSessionId를 그대로 sessionId로 채택하므로(T4가 마련한 채택 로직), 이 화면도 동일하게
// getPendingSessionId()로 세션을 식별하고 sessions/{sid} 문서에서 scenarioId를 읽어 재생할 대사
// 목록(src/content/scenarios, T6)을 찾는다 — 별도 네비게이션 state/query param 불필요.
//
// AC-019: 실제 전화망/통화 연동 없이 synthesizeDeepvoice 콜러블의 audioUrl을 <audio>로 인앱
// 재생한다. AC-022: SyntheticLabel(화면 상시 라벨) + 재생 전 텍스트 프리롤 안내(오디오 프리롤은
// Mock 단계라 텍스트 안내로 대체, UX.md Interaction Pattern P-3)로 합성 표식을 이중 노출한다.
// AC-006: EndTrainingButton을 모든 상태에서 항상 노출한다.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPendingSessionId } from "@/lib/recording";
import { synthesizeDeepvoice } from "@/lib/api";
import { scenarios, type ScenarioDoc } from "@/content/scenarios";
import SyntheticLabel from "@/components/SyntheticLabel";
import EndTrainingButton from "@/components/EndTrainingButton";

type PageState =
  | "checking"
  | "no-session"
  | "scenario-not-found"
  | "load-error"
  | "idle"
  | "loading-line"
  | "playing"
  | "play-error"
  | "completed";

const PREROLL_NOTICE =
  "지금부터 재생되는 음성은 실제 전화가 아니라 AI로 합성된 훈련용 음성입니다.";

export default function SessionPlayPage() {
  const router = useRouter();
  const [sessionId] = useState<string | null>(() => getPendingSessionId());
  const [state, setState] = useState<PageState>(sessionId ? "checking" : "no-session");
  const [scenario, setScenario] = useState<ScenarioDoc | null>(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await getDoc(doc(db, "sessions", sessionId));
        if (cancelled) return;
        const scenarioId = snapshot.data()?.scenarioId as string | undefined;
        const found = scenarioId ? scenarios[scenarioId] : undefined;
        if (!found) {
          setState("scenario-not-found");
          return;
        }
        setScenario(found);
        setState("idle");
      } catch {
        if (!cancelled) setState("load-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const playLine = useCallback(
    async (index: number, currentScenario: ScenarioDoc) => {
      if (!sessionId) return;
      const line = currentScenario.deepvoiceLines[index];
      if (!line) {
        setState("completed");
        return;
      }
      setState("loading-line");
      setLineIndex(index);
      try {
        const result = await synthesizeDeepvoice({ sessionId, lineId: line.lineId });
        setAudioUrl(result.audioUrl);
        setState("playing");
      } catch {
        setState("play-error");
      }
    },
    [sessionId],
  );

  // 오디오 자동재생 정책상 브라우저가 프로그램적 재생을 막을 수 있으므로 <audio controls>로
  // 수동 재생 대안을 항상 남겨둔다(UX.md UX-005 Permissions 주석). 실패해도 상태를 에러로 바꾸지
  // 않는다 — 사용자가 native 컨트롤로 직접 누를 수 있다.
  useEffect(() => {
    if (state === "playing" && audioUrl) {
      audioRef.current?.play().catch(() => {});
    }
  }, [state, audioUrl]);

  const handleStartPlayback = () => {
    if (!scenario) return;
    void playLine(0, scenario);
  };

  const handleAudioEnded = () => {
    if (!scenario) return;
    void playLine(lineIndex + 1, scenario);
  };

  const handleRetryLine = () => {
    if (!scenario) return;
    void playLine(lineIndex, scenario);
  };

  const handleReplayAll = () => {
    if (!scenario) return;
    void playLine(0, scenario);
  };

  const handleEndTraining = () => {
    audioRef.current?.pause();
    // TODO(T8): endSession 콜러블 실호출은 T8 소관(세션 라이프사이클) — 지금은 UX-007로 이동만
    // 시킨다(태스크 지시에 따른 최소 처리, 구현 보고서에 명시).
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
          재생 정보를 불러오는 중입니다...
        </p>
      </main>
    );
  }

  if (state === "no-session" || state === "scenario-not-found" || state === "load-error") {
    const message =
      state === "no-session"
        ? "진행 중인 세션 정보를 찾을 수 없습니다. 시나리오 선택부터 다시 진행해 주세요."
        : state === "scenario-not-found"
          ? "선택된 시나리오 정보를 찾을 수 없습니다. 시나리오를 다시 선택해 주세요."
          : "재생 정보를 불러오지 못했습니다. 다시 시도해 주세요.";
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

  const currentLineText = scenario?.deepvoiceLines[lineIndex]?.text ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">딥보이스 재생</h1>
        {/* AC-006 상시 종료 컨트롤 — 모든 상태에서 항상 노출. */}
        <EndTrainingButton onClick={handleEndTraining} />
      </div>

      {/* AC-022 합성 표식 이중 노출 ① 화면 상시 라벨. */}
      <SyntheticLabel />

      {/* AC-022 합성 표식 이중 노출 ② 프리롤 안내 문구(Mock 단계는 텍스트 안내로 충분, 태스크
          지시 — 실 ElevenLabs 전환 시 오디오 프리롤 추가 검토). */}
      <p role="status" className="rounded bg-yellow-50 p-4 text-base text-yellow-900">
        {PREROLL_NOTICE}
      </p>

      {scenario && (
        <p className="text-base text-gray-600">
          시나리오: <span className="font-semibold">{scenario.title}</span>
        </p>
      )}

      <section className="flex flex-col items-center gap-4 rounded border border-gray-300 p-6">
        {state === "idle" && (
          <button
            type="button"
            onClick={handleStartPlayback}
            className="min-h-[56px] w-full max-w-xs rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
          >
            ▶ 재생 시작
          </button>
        )}

        {state === "loading-line" && (
          <p className="flex items-center gap-2 text-lg" role="status">
            <span
              aria-hidden="true"
              className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"
            />
            음성을 합성하는 중입니다...
          </p>
        )}

        {(state === "playing" || state === "loading-line") && currentLineText && (
          <p className="text-lg leading-relaxed" aria-live="polite">
            {currentLineText}
          </p>
        )}

        {state === "playing" && audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            onEnded={handleAudioEnded}
            aria-label="딥보이스 합성 음성 재생"
            className="w-full max-w-xs"
          />
        )}

        {state === "play-error" && (
          <>
            <p role="alert" className="flex items-center gap-2 text-base text-red-700">
              <span aria-hidden="true">⚠</span>
              <span>음성 재생에 실패했습니다. 다시 시도해 주세요.</span>
            </p>
            <button
              type="button"
              onClick={handleRetryLine}
              className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
            >
              다시 시도
            </button>
          </>
        )}

        {state === "completed" && (
          <>
            <p className="text-lg font-semibold text-green-700" role="status">
              재생이 끝났습니다.
            </p>
            <div className="flex w-full max-w-xs flex-col gap-3">
              <button
                type="button"
                onClick={handleReplayAll}
                className="min-h-[48px] rounded border border-gray-400 px-6 py-3 text-lg font-bold hover:bg-gray-100"
              >
                다시 듣기
              </button>
              <button
                type="button"
                onClick={() => router.push("/session/chat")}
                className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800"
              >
                계속 (역할극 시작)
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
