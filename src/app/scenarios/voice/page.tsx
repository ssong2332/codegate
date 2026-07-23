"use client";

// UX-016 보이스피싱 목소리 방식 선택(드릴다운 2단계, T28) — docs/UX.md UX-016, AC-028/AC-029.
// UX-015에서 "보이스피싱"을 고른 사용자에게 clone/generic 방식을 묻는다. 신규 데이터 모델 없이
// 기존 `voiceMode`(clone|generic) 값을 그대로 재사용한다(Business Rules, AC-028). 라우팅 방식
// 판단 근거는 src/app/scenarios/page.tsx 상단 주석과 동일(별도 라우트 3개, router.back()으로
// 브라우저 뒤로가기와 일치).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DrilldownOptionCard } from "@/components/DrilldownOptionCard";
import {
  getSelectedVoiceModeChoice,
  setChallengeMode,
  setSelectedVoiceModeChoice,
} from "@/lib/recording";
import type { VoiceMode } from "@/content/scenarios";

export default function ScenarioVoiceModeSelectPage() {
  const router = useRouter();
  // 뒤로가기(P-12 "이전 선택 유지")로 복귀 시 직전 방식 선택을 강조 표시. lazy initializer로
  // 마운트 시 1회만 읽는다(clone/wait/page.tsx·scenarios/page.tsx와 동일 패턴).
  const [selected, setSelected] = useState<VoiceMode | null>(() => getSelectedVoiceModeChoice());

  const handleSelect = (mode: VoiceMode) => {
    setSelected(mode);
    setSelectedVoiceModeChoice(mode);
    router.push(`/scenarios/voice/${mode}`);
  };

  // T36(UX-019) 진입점 — 2인 소셜 챌린지는 항상 clone(내 목소리 복제) 시나리오만 대상이라, "내
  // 목소리 복제" 카드를 다시 고르게 하지 않고 clone 드릴다운(voice/clone)으로 바로 들어간다.
  // 플래그만 세우고 실제 분기는 그 드릴다운의 최종 시나리오 카드 액션에서 일어난다
  // (ScenarioListView.handleStart, pendingSession.ts의 setChallengeMode 주석 참고).
  const handleStartChallenge = () => {
    setChallengeMode();
    router.push("/scenarios/voice/clone");
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
        <p className="text-sm font-semibold text-[#0E6B62]" aria-current="step">
          보이스피싱 › ② 방식
        </p>
        <h1 className="text-2xl font-bold text-[#22303A]">어떤 목소리로 전화가 올까요?</h1>
        <p className="text-base leading-relaxed text-[#6B655C]">
          내 목소리로 체험할지, 기본 AI 목소리로 바로 체험할지 골라주세요. 고르면 바로 다음
          단계로 넘어갑니다.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <DrilldownOptionCard
          icon="🎙"
          title="내 목소리 복제"
          description="내 목소리 30초 녹음 후 그 목소리로 걸려오는 전화"
          selected={selected === "clone"}
          onClick={() => handleSelect("clone")}
        />
        <DrilldownOptionCard
          icon="🔊"
          title="기본 AI 음성"
          description="녹음 없이 바로 시작"
          selected={selected === "generic"}
          onClick={() => handleSelect("generic")}
        />
      </div>

      {/* T36(UX-019) 진입점 — 위 두 카드와 같은 "선택지" 그룹이 아니라 별도 기능으로 보이도록
          시각적으로 구분한다(점선 테두리 + 구분선). */}
      <div className="mt-2 flex flex-col gap-3 border-t border-[#E2DDD3] pt-5">
        <p className="text-sm font-semibold text-[#6B655C]">또는</p>
        <button
          type="button"
          onClick={handleStartChallenge}
          className="flex min-h-[56px] w-full items-start gap-4 rounded-2xl border-2 border-dashed border-[#0E6B62] bg-white p-4 text-left transition hover:bg-[#E4F0EC]"
        >
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0E6B62]/10 text-xl"
          >
            🎁
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-lg font-bold text-[#22303A]">지인에게 딥보이스 체험 보내기</span>
            <span className="text-sm text-[#6B655C]">
              내 목소리로 챌린지를 만들어 링크로 보내보세요(2인 챌린지)
            </span>
          </span>
        </button>
      </div>
    </main>
  );
}
