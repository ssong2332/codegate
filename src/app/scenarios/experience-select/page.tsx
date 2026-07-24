"use client";

// UX-026 체험 선택 — 본인이 체험 / 지인에게 보내기 (v1.9, D-30, T48/T49) — docs/UX.md UX-026,
// AC-044(보이스 챌린지 분기)/AC-051(메신저 챌린지 분기)/AC-029(드릴다운 "한 번에 하나씩" 계승).
//
// **Entry**: 드릴다운에서 시나리오를 확정한 직후(voice/ScenarioListView.tsx의 clone 시나리오
// "시작", messenger/page.tsx의 비에스컬레이션 시나리오 "시작")에만 이 화면으로 온다 — generic
// 보이스·에스컬레이션 가능 메신저 시나리오는 "지인에게 보내기"가 성립하지 않아 이 화면을 거치지
// 않고 상류에서 자기훈련으로 직행한다(D-30 "노출 조건"). scenarioId는 query param으로 전달받는다
// (challenge/create/page.tsx가 이미 쓰는 이 앱의 관례 — output:"export" 정적 export 제약상 동적
// 라우트 세그먼트 대신 query-param 패턴).
//
// **이 화면은 모드만 정하고 세션 생성·녹음·챌린지 생성을 하지 않는다는 원칙(UX-026 Architect
// Handoff)과, 메신저 자기훈련만 예외적으로 이 화면이 직접 createSession을 호출한다**(메신저
// 채널은 clone 온보딩이 없어 이 화면과 세션 생성 사이에 별도 화면이 끼지 않기 때문 — 보이스
// clone 자기훈련은 onboarding/record가 그 역할을 대신 한다).
//
// **"지인에게 보내기"(보이스 clone) 판단(구현 보고서 명시)**: D-30 changelog(UX.md v1.9)는
// "메커니즘은 무변경, 진입 경로만 바뀐다"고 명시한다. 기존 T36 메커니즘은 setChallengeMode()
// 플래그를 소비해 record/clone/wait를 건너뛰고 곧장 `/challenge/create`로 가 caller의 "최근
// 완료된 클론"을 서버(createChallenge)가 재사용/재검증했다(UX-019 Alternative Flow "이미 등록해
// 둔 목소리 재사용"). 이 화면은 이미 시나리오 선택 직후이므로 그 플래그를 세우고 다른 화면에서
// consume할 필요 없이 **곧바로** `/challenge/create?scenarioId=...`로 이동한다 — setChallengeMode/
// consumeChallengeMode 메커니즘 자체가 이제 불필요해져 pendingSession.ts에서 함께 제거했다(진입
// 경로만 바뀌었을 뿐 챌린지 생성 동작 자체는 100% 동일).
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  clearPendingSession,
  getOrCreatePendingSessionId,
  setSelectedScenarioId as persistSelectedScenarioId,
} from "@/lib/recording";
import { createSession } from "@/lib/api";
import { scenarios, GENERIC_VOICE_ID } from "@/content/scenarios";
import { Button } from "@/components/ui";
import { DrilldownOptionCard } from "@/components/DrilldownOptionCard";

type PageState = "invalid" | "ready" | "starting";
type SelectedOption = "self" | "send" | null;

export default function ExperienceSelectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scenarioId = searchParams.get("scenarioId");
  const scenario = scenarioId ? scenarios[scenarioId] : undefined;
  const isMessenger = scenario?.channel === "messenger";

  // 노출 조건(UX-026 Architect Handoff "Business Rules") — 보이스 clone 또는 비에스컬레이션
  // 메신저 시나리오에서만 이 화면이 성립한다(generic 보이스·에스컬레이션 가능 메신저는 "지인에게
  // 보내기"가 불가해 상류가 이 화면에 진입시키지 않는다). URL 직접 접근 등 방어적 상황 대비.
  const isChallengeEligible = Boolean(
    scenario && (scenario.voiceMode === "clone" || (isMessenger && !scenario.escalation)),
  );

  const [state, setState] = useState<PageState>(isChallengeEligible ? "ready" : "invalid");
  const [selectedOption, setSelectedOption] = useState<SelectedOption>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const handleSelfExperience = async () => {
    if (!scenario || !scenarioId || state === "starting") return;
    setSelectedOption("self");

    if (isMessenger) {
      // 메신저 자기훈련 — messenger/page.tsx가 예전에 여기서 직접 하던 createSession 호출을
      // 그대로 이 화면으로 옮겼다(D-30, "진입 경로만" 이동 — 세션 생성 로직·게이팅은 무변경).
      clearPendingSession();
      const sessionId = getOrCreatePendingSessionId();
      if (!sessionId) return;
      setState("starting");
      setStartError(null);
      try {
        await createSession({
          sessionId,
          scenarioId,
          voiceId: GENERIC_VOICE_ID,
          channel: "messenger",
          surface: scenario.surface,
        });
        router.push("/session/messenger");
      } catch {
        setStartError("시나리오를 시작하지 못했습니다. 다시 시도해 주세요.");
        setState("ready");
      }
      return;
    }

    // 보이스 clone 자기훈련 — 기존 ScenarioListView.tsx의 clone 분기와 동일 판단: 직전 미종료
    // 세션이 남아있을 수 있어 clearPendingSession으로 비운 뒤 새 사전 세션 id를 발급한다("매
    // 훈련 시도가 독립 세션이 되게 한다" 원칙, 변경 없음).
    clearPendingSession();
    getOrCreatePendingSessionId();
    persistSelectedScenarioId(scenarioId);
    router.push("/onboarding/record");
  };

  const handleSendToFriend = () => {
    if (!scenario || !scenarioId) return;
    setSelectedOption("send");
    // 보이스 clone·메신저 공통 — 시나리오가 이미 확정된 상태로 UX-019(챌린지 만들기)로 직행한다.
    // 보이스는 createChallenge가 caller의 "최근 완료된 클론"을 서버에서 재확인·재사용하고(클론이
    // 없으면 그 화면이 "먼저 본인 목소리 클론을 완료해 주세요" 오류로 안내), 메신저는 애초에
    // 클론을 요구하지 않는다(AC-051) — 두 경우 모두 이 화면은 라우팅만 담당한다.
    router.push(`/challenge/create?scenarioId=${encodeURIComponent(scenarioId)}`);
  };

  if (state === "invalid" || !scenario) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>이 시나리오는 지인에게 보내기를 지원하지 않습니다. 시나리오 선택부터 다시 진행해 주세요.</span>
        </p>
        <div className="w-full max-w-xs">
          <Button
            type="button"
            onClick={() => router.push(isMessenger ? "/scenarios/messenger" : "/scenarios/voice")}
          >
            시나리오 선택으로
          </Button>
        </div>
      </main>
    );
  }

  const typeLabel = isMessenger ? "메신저피싱" : "보이스피싱";
  const isStarting = state === "starting";

  return (
    <main className="drilldown-step mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex min-h-[48px] w-fit items-center gap-1 rounded-lg px-2 -ml-2 text-base font-medium text-[#6B655C] hover:bg-[#F2EFE9]"
        >
          <span aria-hidden="true">←</span> 뒤로
        </button>
        {/* 단계 표시(P-12 #2, 드릴다운 관례 계승) — 스크린리더가 현재 위치("어떤 시나리오를
            골랐는지")를 읽는다(UX-026 Accessibility). */}
        <p className="text-sm font-semibold text-[#0E6B62]" aria-current="step">
          {typeLabel} › {scenario.title}
        </p>
        <h1 className="text-2xl font-bold text-[#22303A]">이 시나리오, 어떻게 체험할까요?</h1>
        <p className="text-base leading-relaxed text-[#6B655C]">
          직접 훈련해볼지, 지인에게 링크로 보내 테스트해볼지 골라주세요.
        </p>
      </header>

      {startError && (
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>{startError}</span>
        </p>
      )}

      <div className="flex flex-col gap-3">
        <DrilldownOptionCard
          icon="🧑"
          title="본인이 체험"
          description="직접 훈련해봅니다"
          selected={selectedOption === "self"}
          onClick={() => void handleSelfExperience()}
        />
        <DrilldownOptionCard
          icon="🎁"
          title="지인에게 보내기"
          description="지인에게 링크로 보내 테스트합니다"
          selected={selectedOption === "send"}
          onClick={handleSendToFriend}
        />
      </div>

      {isStarting && (
        <p className="flex items-center gap-2 text-base text-[#6B655C]" role="status">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-[#0E6B62]"
          />
          연결하는 중...
        </p>
      )}
    </main>
  );
}
