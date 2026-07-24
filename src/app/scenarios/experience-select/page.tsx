"use client";

// UX-026 체험 선택 — 본인이 체험 / 지인에게 보내기 (v1.10, D-31, T56) — docs/UX.md UX-026,
// AC-056(선택 지점 재배치)/AC-057(보이스 self=generic 전용)/AC-058(generic 보이스 챌린지 분기)/
// AC-051(메신저 챌린지 분기)/AC-029(드릴다운 "한 번에 하나씩" 계승).
//
// **T56 재배치(v1.10, D-31, Architecture.md §14.9.5)**: 이 화면은 이제 **유형 선택(UX-015) 직후**
// 온다 — 목소리 방식 선택(UX-016)·시나리오 선택(UX-017/UX-024)보다 **먼저**. 시나리오가 아직
// 확정되지 않은 시점이라(구 v1.9는 시나리오 확정 직후) scenarioId query param 대신
// getSelectedTrainingType()(UX-015가 세팅한 힌트)을 peek해 유형(voice|messenger)만 안다. 여기서
// 고른 모드(self|send)는 setExperienceMode() sessionStorage 힌트로 남기고(형제 드릴다운 힌트
// selectedTrainingType/selectedVoiceModeChoice와 동일한 peek 방식, §14.9.5), 세션 생성·녹음·챌린지
// 생성은 전부 하류(UX-016/UX-017/UX-024)로 위임한다(이 화면 자체는 콜러블을 호출하지 않는다 —
// UX-026 Architect Handoff "Data Operations: 없음").
//
// **Exit(4분기, D-31/D-32/D-33)**:
// - 보이스 + 본인이 체험 → UX-016을 건너뛰고 곧장 `/scenarios/voice/generic`(강제 generic, AC-057)
// - 보이스 + 지인에게 보내기 → `/scenarios/voice`(UX-016, clone/generic 방식 선택 노출)
// - 메신저 + 본인이 체험 → `/scenarios/messenger`(전체 시나리오, 에스컬레이션 포함)
// - 메신저 + 지인에게 보내기 → `/scenarios/messenger`(그 화면이 experienceMode 힌트로 비에스컬레이션만 필터)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSelectedTrainingType, setExperienceMode, type TrainingType } from "@/lib/recording";
import { Button } from "@/components/ui";
import { DrilldownOptionCard } from "@/components/DrilldownOptionCard";

type SelectedOption = "self" | "send" | null;

export default function ExperienceSelectPage() {
  const router = useRouter();
  // sessionStorage 조회는 클라 전용이라 lazy 초기값으로 한 번만 읽는다(다른 드릴다운 화면과 동일
  // 관례). 유형 미확정(직접 URL 접근 등 방어적 상황)이면 invalid로 처리한다.
  const [trainingType] = useState<TrainingType | null>(() => getSelectedTrainingType());
  const [selectedOption, setSelectedOption] = useState<SelectedOption>(null);

  if (!trainingType) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 bg-[#FAF8F5] p-8 text-center">
        <p role="alert" className="flex items-center gap-2 text-base text-[#C6392F]">
          <span aria-hidden="true">⚠</span>
          <span>훈련 유형을 먼저 선택해 주세요.</span>
        </p>
        <div className="w-full max-w-xs">
          <Button type="button" onClick={() => router.push("/scenarios")}>
            유형 선택으로
          </Button>
        </div>
      </main>
    );
  }

  const isMessenger = trainingType === "messenger";
  const typeLabel = isMessenger ? "메신저피싱" : "보이스피싱";

  const handleSelfExperience = () => {
    setSelectedOption("self");
    setExperienceMode("self");
    // 보이스 self는 UX-016(방식 선택)을 건너뛰고 generic으로 강제한다(AC-057, D-32) — clone
    // 시나리오는 자기 체험에서 완전히 배제된다. 메신저 self는 UX-024가 전체 시나리오(에스컬레이션
    // 포함)를 노출하고 세션 생성까지 담당한다(D-31로 이 화면에서 messenger/page.tsx로 이관).
    router.push(isMessenger ? "/scenarios/messenger" : "/scenarios/voice/generic");
  };

  const handleSendToFriend = () => {
    setSelectedOption("send");
    setExperienceMode("send");
    // 보이스 send는 UX-016(clone/generic 방식 선택)을 노출한다(AC-058, D-33). 메신저 send는
    // UX-024가 비에스컬레이션 시나리오만 노출한다(AC-051, 무변경).
    router.push(isMessenger ? "/scenarios/messenger" : "/scenarios/voice");
  };

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
        {/* 단계 표시(P-12 #2, 드릴다운 관례 계승) — 스크린리더가 현재 위치(유형)를 읽는다(UX-026
            Accessibility). 시나리오는 아직 미확정이라(v1.10) 유형만 맥락으로 표시한다. */}
        <p className="text-sm font-semibold text-[#0E6B62]" aria-current="step">
          {typeLabel} › ② 체험 선택
        </p>
        <h1 className="text-2xl font-bold text-[#22303A]">이 유형, 어떻게 체험할까요?</h1>
        <p className="text-base leading-relaxed text-[#6B655C]">
          직접 훈련해볼지, 지인에게 링크로 보내 테스트해볼지 골라주세요.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <DrilldownOptionCard
          icon="🧑"
          title="본인이 체험"
          description="직접 훈련해봅니다"
          selected={selectedOption === "self"}
          onClick={handleSelfExperience}
        />
        <DrilldownOptionCard
          icon="🎁"
          title="지인에게 보내기"
          description="지인에게 링크로 보내 테스트합니다"
          selected={selectedOption === "send"}
          onClick={handleSendToFriend}
        />
      </div>
    </main>
  );
}
