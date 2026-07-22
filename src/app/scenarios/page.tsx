"use client";

// UX-004 시나리오 선택 (Track B·C, T6 콘텐츠 + T5 배선, AC-001/AC-002).
// RouteGuard(lib/auth, T18)가 이미 인증되지 않은 사용자를 /login으로 보내므로, 이 화면은
// "인증된 사용자"를 전제로 한다(다른 UX 화면과 동일 패턴).
//
// **Phase B(2026-07-22 사용자 결정) — 온보딩 순서 변경**: 이 화면이 이제 녹음(UX-002)보다
// 먼저 온다(age-gate 직후). voiceMode:"clone" 시나리오를 고르면 녹음이 필요하므로
// `/onboarding/record`로 보내고, voiceMode:"generic" 시나리오는 녹음/클론 자체를 생략하고
// 여기서 바로 `createSession`을 호출해 `/session/play`로 직행한다(기본 TTS, 본인 목소리 불필요).
// 사전 세션 id는 이 화면이 처음 만든다(getOrCreatePendingSessionId) — 이전에는 record 화면이
// 만들었지만, 이제 이 화면이 온보딩 녹음보다 먼저 오므로 여기로 옮겼다.
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearPendingSession,
  getOrCreatePendingSessionId,
  setOpeningAudioUrl,
  setSelectedScenarioId as persistSelectedScenarioId,
} from "@/lib/recording";
import { createSession } from "@/lib/api";
import { scenarios, GENERIC_VOICE_ID } from "@/content/scenarios";

type PageState = "ready" | "starting" | "start-error";

export default function ScenariosPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>("ready");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const scenarioEntries = Object.entries(scenarios);

  const handleStart = async () => {
    if (!selectedScenarioId || state === "starting") return;
    const scenario = scenarios[selectedScenarioId];
    if (!scenario) return;

    // "시작" = 새 훈련의 시작점. 직전 훈련을 "훈련 종료" 없이 빠져나온 경우 이전 사전 세션 id가
    // 남아 있을 수 있는데(그 세션은 서버에서 active라 createSession이 재사용을 거부한다, #1 가드),
    // 여기서 비우고 새 id를 발급해 매 훈련 시도가 독립 세션이 되게 한다. ⚠️ 이 clear+create는
    // 비멱등이라 렌더 경로(useState lazy init 등)에 두면 안 된다 — React StrictMode가 initializer를
    // 이중 호출해 컴포넌트 state와 sessionStorage의 id가 갈라지는 실버그가 있었다(브라우저 실측으로
    // 확인). 반드시 이벤트 핸들러(여기)에서만 실행한다.
    clearPendingSession();
    const sessionId = getOrCreatePendingSessionId();
    if (!sessionId) return;

    if (scenario.voiceMode === "clone") {
      // 본인 목소리 클론이 필요한 시나리오 — 선택을 저장해두고 녹음 화면으로 보낸다.
      // clone/wait 화면이 클론 완료 후 이 값을 읽어 createSession을 대신 호출한다.
      persistSelectedScenarioId(selectedScenarioId);
      router.push("/onboarding/record");
      return;
    }

    // voiceMode === "generic" — 녹음/클론 없이 바로 세션을 시작한다(기본 TTS, GENERIC_VOICE_ID).
    setState("starting");
    setStartError(null);
    try {
      const result = await createSession({
        sessionId,
        scenarioId: selectedScenarioId,
        voiceId: GENERIC_VOICE_ID,
      });
      if (result.openingAudioUrl) setOpeningAudioUrl(result.openingAudioUrl);
      router.push("/session/play");
    } catch {
      setStartError("시나리오를 시작하지 못했습니다. 다시 시도해 주세요.");
      setState("ready");
    }
  };

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
                  <span>
                    {scenario.voiceMode === "clone"
                      ? "본인 목소리 등록(30초 녹음)이 필요합니다."
                      : "본인 목소리 등록 없이 바로 진행됩니다(기본 합성 음성)."}
                  </span>
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
        onClick={() => void handleStart()}
        disabled={!selectedScenarioId || state === "starting"}
        className="min-h-[48px] rounded bg-black px-6 py-3 text-lg font-bold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {state === "starting" ? "시작하는 중..." : "시작"}
      </button>
    </main>
  );
}
