"use client";

// UX-016 보이스피싱 목소리 방식 선택(드릴다운 2단계, T28) — docs/UX.md UX-016, AC-028/AC-029.
// UX-015에서 "보이스피싱"을 고른 사용자에게 clone/generic 방식을 묻는다. 신규 데이터 모델 없이
// 기존 `voiceMode`(clone|generic) 값을 그대로 재사용한다(Business Rules, AC-028). 라우팅 방식
// 판단 근거는 src/app/scenarios/page.tsx 상단 주석과 동일(별도 라우트 3개, router.back()으로
// 브라우저 뒤로가기와 일치).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DrilldownOptionCard } from "@/components/DrilldownOptionCard";
import { getSelectedVoiceModeChoice, setSelectedVoiceModeChoice } from "@/lib/recording";
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
    </main>
  );
}
