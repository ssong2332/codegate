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
//
// **T56 갱신(v1.10, D-31/D-32/D-33, Architecture.md §14.9.5, AC-057/058)**: 이 화면의 Exit는 이제
// UX-026에서 이미 정해진 모드(self|send, getExperienceMode() peek)로 갈린다 — 예전엔 "clone
// 시나리오면 무조건 체험 선택(UX-026)으로" 였으나, UX-026이 시나리오 선택보다 앞으로 상향돼 이
// 화면에 도달한 시점엔 모드가 이미 확정돼 있다. **send 모드**는 clone·generic 둘 다 UX-019(챌린지
// 만들기)로 직행한다(generic 보이스 챌린지 신설, AC-058 — 기존 clone 전용 라우팅을 확장). **self
// 모드**(또는 힌트 부재로 인한 방어적 기본값)는 generic만 도달 가능하므로(AC-057, UX-026이 클론을
// 건너뛰게 한다) 기존 createSession 직행 로직을 그대로 쓴다. `scenario.voiceMode==="clone"`인
// 시나리오는 self 경로로 정상 도달할 수 없으므로(방어적으로도) 항상 send로 취급한다.
// **T72 갱신(v1.11, D-41, UX-029)**: 위 T56 문단이 설명하는 Exit 분기(send→UX-019 / self→
// createSession)는 **더 이상 이 화면에 없다.** 난이도 선택(UX-029)이 "세션/챌린지 생성 직전"
// 단계로 삽입되면서 그 분기 전체가 src/app/scenarios/difficulty/page.tsx로 이관됐다(판정 규칙은
// 동일). 이 화면은 이제 시나리오를 확정해 sessionStorage에 남기고 UX-029로 넘기기만 한다.
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getExperienceMode, setSelectedScenarioId as persistSelectedScenarioId } from "@/lib/recording";
import { SCENARIO_TRAIT_LABEL } from "@/lib/difficulty";
import { scenarios, type ScenarioDoc, type VoiceMode } from "@/content/scenarios";
import { Badge, Button } from "@/components/ui";

const MODE_LABEL: Record<VoiceMode, string> = {
  clone: "내 목소리 복제",
  generic: "기본 AI 음성",
};

export function ScenarioListView({ mode }: { mode: VoiceMode }) {
  const router = useRouter();
  // T74(UX-030 "이 시나리오 다시 훈련") — 실패 아카이브가 시나리오를 미리 지목해 들어온다.
  // 선택만 채워 두고 시작은 여전히 사용자가 누른다(자동 시작하지 않는다).
  // ⚠️ 노출 필터(AC-029/AC-057)를 프리셋이 우회하면 안 된다 — 이 목록에 실제로 보이는 시나리오만
  // 미리 선택한다(예: clone 시나리오를 generic 목록에 손으로 붙여 넣어도 무시된다).
  const searchParams = useSearchParams();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(() => {
    const preset = searchParams.get("scenarioId");
    return preset && scenarios[preset]?.voiceMode === mode ? preset : null;
  });
  // 단계 표시(breadcrumb) 전용 — self는 UX-016을 건너뛰어 유형→체험선택→시나리오(③)이고, send는
  // UX-016을 거쳐 유형→체험선택→방식→시나리오(④)다(v1.10 D-31 순서 반영). lazy initializer로 마운트
  // 시 1회만 읽는다(다른 드릴다운 화면과 동일 패턴).
  const [experienceModeHint] = useState<ReturnType<typeof getExperienceMode>>(() => getExperienceMode());

  // AC-029 핵심 — 전체 시나리오가 아니라 선택된 방식(mode)에 해당하는 부분집합만 노출.
  const filteredEntries = Object.entries(scenarios).filter(
    ([, scenario]) => scenario.voiceMode === mode,
  );

  // (T72, v1.11 D-41) — 이 화면은 이제 **시나리오만 확정**하고 난이도 선택(UX-029)으로 넘긴다.
  // 세션/챌린지 생성 분기(send → UX-019, self·generic → createSession)는 그 화면이 그대로 넘겨받아
  // 수행한다 — 난이도가 "세션/챌린지 생성 직전" 단계라 생성 지점 자체를 그 뒤로 옮겨야 어느
  // 경로에서도 난이도가 누락되지 않는다(판정 규칙 자체는 이관 전과 동일).
  const handleStart = () => {
    if (!selectedScenarioId) return;
    if (!scenarios[selectedScenarioId]) return;
    persistSelectedScenarioId(selectedScenarioId);
    router.push("/scenarios/difficulty");
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
                  이 문자열은 자유서술문이라(예: "중간 — 감정적 압박이 강한 편입니다") 색상 등급
                  배지로 단정 짓지 않고 서술 텍스트로 유지한다(임의 매핑 금지, messenger/page.tsx와
                  동일 판단).
                  T72/AC-067 — 라벨을 "난이도"에서 "이 시나리오의 성향"으로 바꾼다. 삭제하지 않고
                  유지하되(AC-002), "난이도"라는 단어는 사용자가 고르는 3단계(UX-029)에만 쓴다. */}
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{scenario.estimatedDuration}</Badge>
              </span>
              <span>
                {scenario.fraudType} · {SCENARIO_TRAIT_LABEL}: {scenario.difficulty}
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
          보이스피싱 › {MODE_LABEL[mode]} › {experienceModeHint === "send" ? "④" : "③"} 시나리오
        </p>
        <h1 className="text-2xl font-bold text-[#22303A]">어떤 전화를 받아볼까요?</h1>
        <p className="text-base leading-relaxed text-[#6B655C]">
          실제 사기가 아니라 훈련용 시뮬레이션입니다. 하나를 고르면 마지막으로 난이도를 정합니다.
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
        {/* T72(D-41) — 이 단계의 CTA는 더 이상 통화를 시작하지 않고 난이도 선택으로 넘어간다.
            세션 생성 실패 표시도 그 화면이 담당한다(생성 지점이 그리로 이동했으므로). */}
        <Button type="button" onClick={handleStart} disabled={!selectedScenarioId}>
          다음 — 난이도 고르기
        </Button>
      </div>
    </main>
  );
}
