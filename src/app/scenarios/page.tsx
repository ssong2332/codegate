"use client";

// UX-015 훈련 유형 선택(드릴다운 1단계, T28) — docs/UX.md UX-015(v1.5/v1.7), AC-028/AC-029.
// 구 UX-004(평면 목록)를 대체하는 드릴다운 3화면(UX-015→UX-016→UX-017)의 진입점. RouteGuard
// (lib/auth, T18)가 이미 인증되지 않은 사용자를 /login으로 보내므로, 이 화면은 "인증된 사용자"를
// 전제로 한다(다른 UX 화면과 동일 패턴). onboarding/consent·age-gate가 통과 직후 이 경로로 보낸다
// (기존 진입점 `/scenarios`를 그대로 유지 — 다른 화면들의 "다시 훈련"/"처음으로" 링크도 전부
// `/scenarios`를 가리키므로 재배선 불필요).
//
// **라우팅 방식 판단(P-12 "각 단계가 브라우저 히스토리 엔트리와 일치해야" 요구, 근거 남김)**: 이
// 코드베이스는 이미 "화면=라우트 폴더"(src/app/onboarding/*, src/app/session/*) 관례를 쓰고
// 있어, 드릴다운 3단계도 별도 Next.js 라우트 3개(`/scenarios`, `/scenarios/voice`,
// `/scenarios/voice/{clone|generic}`)로 구현한다(단일 라우트 내 history.pushState 수동 관리 대신).
// 각 단계가 실제 라우트라 브라우저 뒤로가기가 자동으로 직전 단계로 돌아가고, 화면 내 "뒤로" 버튼도
// `router.back()`으로 위임해 완전히 동일하게 동작한다(별도 push 목적지를 하드코딩하면 히스토리
// 스택이 갈라져 브라우저 뒤로가기와 어긋날 위험이 있어 피했다).
//
// **스코프 갱신(T29, D-22 스텁 해소)**: T28 시점엔 UX-024(메신저 시나리오 선택)가 아직 없어
// 메신저피싱 선택 시 "준비 중" 안내만 표시했다(T28 구현 보고서가 예고한 후속 수정). T29가
// UX-024/UX-022를 구현했으므로 이제 실제로 `/scenarios/messenger`로 라우팅한다(docs/UX.md
// v1.7 UX-015 Exit 규칙과 정합).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DrilldownOptionCard } from "@/components/DrilldownOptionCard";
import {
  getSelectedTrainingType,
  setSelectedTrainingType,
  type TrainingType,
} from "@/lib/recording";

export default function ScenarioTypeSelectPage() {
  const router = useRouter();
  // 뒤로가기(P-12 "이전 선택 유지")로 이 화면에 복귀했을 때 직전에 고른 유형을 강조 표시한다.
  // lazy initializer로 마운트 시 1회만 sessionStorage를 읽는다(clone/wait/page.tsx와 동일 패턴 —
  // 이 앱은 정적 export(next.config.ts)라 서버 프리렌더 HTML과의 하이드레이션 불일치가 없다).
  const [selected, setSelected] = useState<TrainingType | null>(() => getSelectedTrainingType());

  const handleSelectVoice = () => {
    setSelected("voice");
    setSelectedTrainingType("voice");
    router.push("/scenarios/voice");
  };

  const handleSelectMessenger = () => {
    setSelected("messenger");
    setSelectedTrainingType("messenger");
    router.push("/scenarios/messenger");
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
        {/* 단계 표시(P-12 #2) — 색이 아니라 텍스트로 현재 위치를 알린다. */}
        <p className="text-sm font-semibold text-[#0E6B62]" aria-current="step">
          ① 유형
        </p>
        <h1 className="text-2xl font-bold text-[#22303A]">어떤 사기를 훈련해볼까요?</h1>
        <p className="text-base leading-relaxed text-[#6B655C]">
          훈련하고 싶은 사기 유형을 먼저 골라주세요. 고르면 바로 다음 단계로 넘어갑니다.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <DrilldownOptionCard
          icon="📞"
          title="보이스피싱"
          description="전화로 걸려오는 사기"
          selected={selected === "voice"}
          onClick={handleSelectVoice}
        />
        <DrilldownOptionCard
          icon="💬"
          title="메신저피싱"
          description="카카오톡·문자로 오는 사기"
          selected={selected === "messenger"}
          onClick={handleSelectMessenger}
        />
      </div>
    </main>
  );
}
