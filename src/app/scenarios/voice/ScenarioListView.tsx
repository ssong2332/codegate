"use client";

// UX-017 시나리오 노출·선택(드릴다운 3단계, 종착, T28) — docs/UX.md UX-017, AC-001/AC-002/AC-029.
// UX-016에서 넘어온 voiceMode(clone|generic) 필터에 해당하는 시나리오만 노출한다(AC-029 "전체
// 평면 나열 금지"). 세션 시작 로직은 구 scenarios/page.tsx(UX-004, 드릴다운 도입 전)의 로직을
// 그대로 재사용한다 — clearPendingSession/getOrCreatePendingSessionId/createSession 호출/
// persistSelectedScenarioId/GENERIC_VOICE_ID/에러 처리/sticky CTA 패턴은 전부 무변경으로 이관.
//
// clone/generic 두 정적 라우트(voice/clone, voice/generic)가 이 컴포넌트를 mode prop만 다르게
// 재사용한다 — Next.js `output: "export"`(정적 export, next.config.ts) 제약상 동적 라우트
// (`[mode]`)를 쓰려면 generateStaticParams가 필요해 오히려 더 복잡해지고, 값이 clone|generic
// 2개뿐이라 정적 라우트 2개로 단순화하는 쪽이 이 코드베이스의 "화면=라우트 폴더" 관례와도 더
// 잘 맞는다(명시적 판단, 추측 아님).
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearPendingSession,
  consumeChallengeMode,
  getOrCreatePendingSessionId,
  setOpeningAudioUrl,
  setSelectedScenarioId as persistSelectedScenarioId,
} from "@/lib/recording";
import { createSession } from "@/lib/api";
import { scenarios, GENERIC_VOICE_ID, type ScenarioDoc, type VoiceMode } from "@/content/scenarios";
import { Badge, Button } from "@/components/ui";

type PageState = "ready" | "starting" | "start-error";

const MODE_LABEL: Record<VoiceMode, string> = {
  clone: "내 목소리 복제",
  generic: "기본 AI 음성",
};

export function ScenarioListView({ mode }: { mode: VoiceMode }) {
  const router = useRouter();
  const [state, setState] = useState<PageState>("ready");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // AC-029 핵심 — 전체 시나리오가 아니라 선택된 방식(mode)에 해당하는 부분집합만 노출.
  const filteredEntries = Object.entries(scenarios).filter(
    ([, scenario]) => scenario.voiceMode === mode,
  );

  const handleStart = async () => {
    if (!selectedScenarioId || state === "starting") return;
    const scenario = scenarios[selectedScenarioId];
    if (!scenario) return;

    // T36(UX-019) 진입점 판단 — "지인에게 딥보이스 체험 보내기" 카드(/scenarios/voice)가 세운
    // sessionStorage 플래그를 여기서 소비한다(항상 소비 — 아래 주석의 "자가 치유" 근거,
    // pendingSession.ts의 setChallengeMode/consumeChallengeMode 주석 참고). 챌린지는 항상 clone
    // 시나리오만 대상이라(createChallenge 서버 검증과 동일 제약) generic 시나리오 클릭은 플래그를
    // 소비해서 지우기만 하고 아래 일반 흐름을 그대로 탄다 — 챌린지 흐름을 중간에 이탈한 뒤 무관한
    // 훈련을 시작해도 플래그가 다음 클릭에서 자연히 정리된다.
    if (consumeChallengeMode() && scenario.voiceMode === "clone") {
      // 챌린지는 훈련 세션이 아니므로 createSession을 호출하지 않는다(record/clone/wait도 거치지
      // 않는다 — createChallenge가 "완료된 클론 보유" 여부를 서버에서 직접 재확인한다).
      router.push(`/challenge/create?scenarioId=${encodeURIComponent(selectedScenarioId)}`);
      return;
    }

    // "시작" = 새 훈련의 시작점. 직전 훈련을 "훈련 종료" 없이 빠져나온 경우 이전 사전 세션 id가
    // 남아 있을 수 있는데(그 세션은 서버에서 active라 createSession이 재사용을 거부한다, #1 가드),
    // 여기서 비우고 새 id를 발급해 매 훈련 시도가 독립 세션이 되게 한다. ⚠️ 이 clear+create는
    // 비멱등이라 렌더 경로(useState lazy init 등)에 두면 안 된다 — 반드시 이벤트 핸들러(여기)에서만
    // 실행한다(구 scenarios/page.tsx의 검증된 판단, 변경 없이 이관).
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

  const renderScenarioCard = (scenarioId: string, scenario: ScenarioDoc) => {
    const selected = selectedScenarioId === scenarioId;
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
              className="flex flex-col gap-1.5 text-sm text-[#6B655C]"
            >
              {/* 소요시간 배지(중립) — 훈련 플로우.dc.html의 "약 {time}" 배지와 동일 톤.
                  난이도는 자유서술문이라(예: "중간 — 감정적 압박이 강한 편입니다") 색상 등급
                  배지로 단정 짓지 않고 서술 텍스트로 유지한다(임의 매핑 금지, messenger/page.tsx와
                  동일 판단). */}
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{scenario.estimatedDuration}</Badge>
              </span>
              <span>
                {scenario.fraudType} · 난이도: {scenario.difficulty}
              </span>
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
        {/* 단계 표시(P-12 #2) — 지금까지의 선택 경로를 맥락으로 표시(스크린리더가 현재 위치로 읽음). */}
        <p className="text-sm font-semibold text-[#0E6B62]" aria-current="step">
          보이스피싱 › {MODE_LABEL[mode]} › ③ 시나리오
        </p>
        <h1 className="text-2xl font-bold text-[#22303A]">어떤 전화를 받아볼까요?</h1>
        <p className="text-base leading-relaxed text-[#6B655C]">
          실제 사기가 아니라 훈련용 시뮬레이션입니다. 하나를 고르면 그 사기범이 전화를 겁니다.
        </p>
      </header>

      {filteredEntries.length === 0 ? (
        // Empty 상태(UX-017 States) — 현재 데이터상 clone 2종·generic 7종 다 있어 실질 발생 안 함.
        <p className="rounded-xl border border-[#E2DDD3] bg-white p-4 text-base text-[#6B655C]">
          이 방식의 시나리오가 아직 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredEntries.map(([scenarioId, scenario]) => renderScenarioCard(scenarioId, scenario))}
        </ul>
      )}

      {/* 하단 고정 CTA(구 scenarios/page.tsx 관례 계승) — 목록이 뷰포트보다 길어질 수 있어 시작
          버튼을 화면 하단에 항상 떠 있게 한다. */}
      <div
        className="sticky bottom-0 -mx-6 -mb-28 border-t border-[#E2DDD3] bg-[#FAF8F5]/95 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur"
      >
        {startError && (
          <p role="alert" className="mb-3 flex items-center gap-2 text-base text-[#C6392F]">
            <span aria-hidden="true">⚠</span>
            <span>{startError}</span>
          </p>
        )}

        <Button
          type="button"
          onClick={() => void handleStart()}
          disabled={!selectedScenarioId || state === "starting"}
        >
          {state === "starting" ? "연결하는 중..." : "이 전화 받아보기"}
        </Button>
      </div>
    </main>
  );
}
