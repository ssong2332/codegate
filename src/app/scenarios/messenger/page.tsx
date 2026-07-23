"use client";

// UX-024 메신저 시나리오 선택(드릴다운 2단계, T29) — docs/UX.md UX-024, AC-030/AC-002/AC-029.
// UX-015에서 "메신저피싱"을 고른 사용자에게 channel==="messenger"로 필터된 시나리오만 노출한다
// (보이스의 UX-017에 대응). 채널이 곧 유형이라 별도 방식(clone/generic) 단계가 없어 드릴다운은
// 유형→시나리오 2단계로 끝난다(UX-015=①, 이 화면=②). 카드 패턴·색 토큰·sticky CTA는
// src/app/scenarios/voice/ScenarioListView.tsx(T28)를 그대로 재사용해 일관성을 유지한다.
//
// **T30 후속 수정**: T29 시점에는 UX-025(조건부 목소리 선택)가 아직 없어 에스컬레이션 가능
// 시나리오(scenario.escalation 존재 — messenger-child-impersonation-kakao,
// messenger-subsidy-smishing-sms)를 고르면 "시작" 시 "준비 중" 안내만 띄우도록 명시적으로
// 축소해 두었다. UX-025(/scenarios/messenger/voice-select)가 이제 생겨 그 스텁을 실제 라우팅으로
// 교체한다 — 에스컬레이션 시나리오는 D-25대로 채팅 진입 전에 먼저 목소리를 확보해야 하므로
// createSession을 이 화면에서 바로 호출하지 않고 voice-select로 넘긴다(그 화면이 호출한다).
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearPendingSession,
  getOrCreatePendingSessionId,
  setSelectedScenarioId as setPendingSelectedScenarioId,
} from "@/lib/recording";
import { createSession } from "@/lib/api";
import { scenarios, GENERIC_VOICE_ID, type ScenarioDoc, type MessengerSurface } from "@/content/scenarios";

type PageState = "ready" | "starting" | "start-error";

const SURFACE_LABEL: Record<MessengerSurface, string> = {
  kakao: "카카오톡",
  sms: "문자",
};

export default function MessengerScenarioSelectPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>("ready");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // AC-029/AC-030 핵심 — 메신저 채널로 필터된 시나리오만 노출(전체 평면 나열 아님).
  const filteredEntries = Object.entries(scenarios).filter(
    ([, scenario]) => scenario.channel === "messenger",
  );

  const handleStart = async () => {
    if (!selectedScenarioId || state === "starting") return;
    const scenario = scenarios[selectedScenarioId];
    if (!scenario) return;

    if (scenario.escalation) {
      // D-25(UX-025) — 조건부 목소리 선택은 전이 발생 시점이 아니라 시나리오 선택 직후에 미리
      // 온다. createSession은 이 화면이 아니라 voice-select 화면이 호출한다(voiceId 확정 후).
      setPendingSelectedScenarioId(selectedScenarioId);
      router.push("/scenarios/messenger/voice-select");
      return;
    }

    // "시작" = 새 훈련의 시작점(voice/ScenarioListView.tsx와 동일 판단·동일 가드 — clear+create는
    // 비멱등이라 이벤트 핸들러에서만 실행한다).
    clearPendingSession();
    const sessionId = getOrCreatePendingSessionId();
    if (!sessionId) return;

    setState("starting");
    setStartError(null);
    try {
      // 메신저는 TTS를 재생하지 않으므로 GENERIC_VOICE_ID를 placeholder로 그대로 재사용한다
      // (voiceId 필수 계약은 유지하되 값 자체는 쓰이지 않음, T29 지시대로).
      await createSession({
        sessionId,
        scenarioId: selectedScenarioId,
        voiceId: GENERIC_VOICE_ID,
        channel: "messenger",
        surface: scenario.surface,
      });
      router.push("/session/messenger");
    } catch {
      setStartError("시나리오를 시작하지 못했습니다. 다시 시도해 주세요.");
      setState("ready");
    }
  };

  const renderScenarioCard = (scenarioId: string, scenario: ScenarioDoc) => {
    const selected = selectedScenarioId === scenarioId;
    const surfaceLabel = scenario.surface ? SURFACE_LABEL[scenario.surface] : "메신저";
    return (
      <li key={scenarioId}>
        <label
          className={`flex cursor-pointer gap-4 rounded-2xl border-2 p-4 transition ${
            selected
              ? "border-[#0E6B62] bg-[#E4F0EC]"
              : "border-[#E2DDD3] bg-white hover:border-[#C9C2B6]"
          }`}
        >
          <input
            type="radio"
            name="scenario"
            value={scenarioId}
            checked={selected}
            onChange={() => setSelectedScenarioId(scenarioId)}
            className="sr-only"
            aria-describedby={`scenario-${scenarioId}-meta`}
          />

          <span
            aria-hidden="true"
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-bold ${
              selected ? "bg-[#0E6B62] text-white" : "bg-[#41525E] text-[#C9D4DB]"
            }`}
          >
            {scenario.callerLabel.slice(0, 1)}
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-start justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                {/* 표면 배지(AC-002/030) — 색 단독 표기 금지, 텍스트 라벨을 항상 함께 표기. */}
                <span className="rounded-full border border-[#0E6B62] px-2.5 py-0.5 text-xs font-bold text-[#0E6B62]">
                  {surfaceLabel}
                </span>
                <span className="text-lg font-bold text-[#22303A]">{scenario.title}</span>
              </span>
              {selected && (
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0E6B62] text-sm font-bold text-white"
                >
                  ✓
                </span>
              )}
            </span>

            <span className="text-sm text-[#6B655C]">
              {scenario.callerLabel}(으)로 {surfaceLabel} 메시지가 옵니다
            </span>

            <span
              id={`scenario-${scenarioId}-meta`}
              className="flex flex-col gap-1 text-sm text-[#6B655C]"
            >
              <span>
                {scenario.fraudType} · {scenario.estimatedDuration}
              </span>
              <span>난이도: {scenario.difficulty}</span>
            </span>
          </span>
        </label>
      </li>
    );
  };

  return (
    <main className="drilldown-step mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-28">
      <header className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex min-h-[48px] w-fit items-center gap-1 rounded-lg px-2 -ml-2 text-base font-medium text-[#6B655C] hover:bg-[#F2EFE9]"
        >
          <span aria-hidden="true">←</span> 뒤로
        </button>
        {/* 단계 표시(P-12 #2, T28 패턴 재사용) — 메신저는 방식 단계가 없어 유형→시나리오 2단계. */}
        <p className="text-sm font-semibold text-[#0E6B62]" aria-current="step">
          메신저피싱 › ② 시나리오
        </p>
        <h1 className="text-2xl font-bold text-[#22303A]">어떤 메시지를 받아볼까요?</h1>
        <p className="text-base leading-relaxed text-[#6B655C]">
          실제 사기가 아니라 훈련용 시뮬레이션입니다. 하나를 고르면 그 사기범이 메시지를 보냅니다.
        </p>
      </header>

      {filteredEntries.length === 0 ? (
        <p className="rounded-xl border border-[#E2DDD3] bg-white p-4 text-base text-[#6B655C]">
          메신저 시나리오가 아직 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredEntries.map(([scenarioId, scenario]) => renderScenarioCard(scenarioId, scenario))}
        </ul>
      )}

      <div className="sticky bottom-0 -mx-6 -mb-28 border-t border-[#E2DDD3] bg-[#FAF8F5]/95 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur">
        {startError && (
          <p role="alert" className="mb-3 flex items-center gap-2 text-base text-[#C6392F]">
            <span aria-hidden="true">⚠</span>
            <span>{startError}</span>
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={!selectedScenarioId || state === "starting"}
          className="min-h-[56px] w-full rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white transition hover:bg-[#0B564F] disabled:opacity-50"
        >
          {state === "starting" ? "연결하는 중..." : "이 메시지 받아보기"}
        </button>
      </div>
    </main>
  );
}
