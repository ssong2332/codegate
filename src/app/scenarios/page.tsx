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

  // 카드 디자인(2026-07-22 개편): 시나리오가 2종에서 5종으로 늘어 기존 평문 목록으로는 훑어보기가
  // 어려워졌다. 어르신 대상이라 (a) 큰 글씨·넉넉한 터치 영역, (b) 색만이 아니라 체크 아이콘·굵은
  // 테두리로 선택 상태를 이중 표기, (c) "발신자가 누구로 걸려오는지"(callerLabel)를 먼저 보여줘
  // 통화 화면과 인식이 이어지게 했다.
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-10">
      <header className="flex flex-col gap-2 pt-2">
        <h1 className="text-2xl font-bold text-[#22303A]">어떤 전화를 받아볼까요?</h1>
        <p className="text-base leading-relaxed text-[#6B655C]">
          실제 사기가 아니라 훈련용 시뮬레이션입니다. 하나를 고르면 그 사기범이 전화를 겁니다.
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {scenarioEntries.map(([scenarioId, scenario]) => {
          const selected = selectedScenarioId === scenarioId;
          const needsRecording = scenario.voiceMode === "clone";
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

                {/* 발신자 아바타 — 통화 화면의 아바타와 같은 형태라 "이 사람이 전화한다"가 바로 읽힌다. */}
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
                    <span className="text-lg font-bold text-[#22303A]">{scenario.title}</span>
                    {/* 선택 표시는 색 단독이 아니라 아이콘 병행(접근성). */}
                    {selected && (
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0E6B62] text-sm font-bold text-white"
                      >
                        ✓
                      </span>
                    )}
                  </span>

                  <span className="text-sm text-[#6B655C]">{scenario.callerLabel}(으)로 전화가 옵니다</span>

                  <span
                    id={`scenario-${scenarioId}-meta`}
                    className="flex flex-col gap-1 text-sm text-[#6B655C]"
                  >
                    <span>
                      {scenario.fraudType} · {scenario.estimatedDuration}
                    </span>
                    <span>난이도: {scenario.difficulty}</span>
                    <span
                      className={`mt-1 inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                        needsRecording
                          ? "bg-[#FBF3E8] text-[#B96A1B]"
                          : "bg-[#F2EFE9] text-[#6B655C]"
                      }`}
                    >
                      {needsRecording
                        ? "내 목소리 녹음 30초 필요"
                        : "녹음 없이 바로 시작"}
                    </span>
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {startError && (
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>{startError}</span>
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleStart()}
        disabled={!selectedScenarioId || state === "starting"}
        className="min-h-[56px] rounded-xl bg-[#0E6B62] px-6 py-3 text-lg font-bold text-white transition hover:bg-[#0B564F] disabled:opacity-50"
      >
        {state === "starting" ? "연결하는 중..." : "이 전화 받아보기"}
      </button>
    </main>
  );
}
