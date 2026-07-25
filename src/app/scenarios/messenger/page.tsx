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
//
// **T49 후속 수정(v1.9, D-30)**: 비에스컬레이션 시나리오의 Exit가 `createSession` 직행에서
// UX-026(체험 선택, src/app/scenarios/experience-select/page.tsx)으로 바뀐다 — 비에스컬레이션
// 메신저 시나리오는 "지인에게 보내기"(챌린지, AC-051)가 가능하므로 "본인이 체험/지인에게
// 보내기"를 먼저 물어야 한다. 세션 생성(clearPendingSession+createSession)은 이제 그 화면의
// 자기훈련 분기가 담당한다 — 이 화면은 시나리오만 확정한다. 에스컬레이션 가능 시나리오는
// 챌린지 대상이 아니므로(#21/OQ-28 보류) voice-select 경로는 무변경.
//
// **T56 갱신(v1.10, D-31, Architecture.md §14.9.5, AC-056/051)**: UX-026이 유형 선택 직후로
// 상향되면서 모드(self|send)가 **이 화면 도달 전에 이미 확정**된다(getExperienceMode() peek).
// (1) **노출 필터**: self는 에스컬레이션 가능 시나리오를 포함한 전체를 노출(무변경, 자기훈련은
// 에스컬레이션 제약 없음), send는 비에스컬레이션만 노출(AC-051, #21/OQ-28 보류 — send에는
// 에스컬레이션 시나리오가 애초에 안 보인다). (2) **Exit**: send + 비에스컬레이션 → `/challenge/
// create`로 직행(구 UX-026 handleSendToFriend 로직을 이 화면으로 이관). self + 비에스컬레이션 →
// 이 화면이 직접 createSession을 호출한다(구 UX-026 handleSelfExperience의 isMessenger 분기를
// 이 화면으로 이관 — UX-026이 시나리오 선택보다 앞서게 되며 그 책임을 넘겨받음). self + 에스컬레이션
// → voice-select(무변경).
// **T72 갱신(v1.11, D-41, UX-029)**: 위 T56 문단이 설명하는 Exit 분기(에스컬레이션→UX-025 /
// send→UX-019 / self→createSession)는 **더 이상 이 화면에 없다.** 난이도 선택(UX-029)이 시나리오
// 확정 직후·생성 직전 단계로 삽입되면서 그 분기 전체가 src/app/scenarios/difficulty/page.tsx로
// 이관됐다(노출 필터는 이 화면에 그대로 남고, 판정 규칙도 동일).
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getExperienceMode, setSelectedScenarioId as setPendingSelectedScenarioId } from "@/lib/recording";
import { SCENARIO_TRAIT_LABEL } from "@/lib/difficulty";
import { scenarios, type ScenarioDoc, type MessengerSurface } from "@/content/scenarios";
import { Badge, Button } from "@/components/ui";

const SURFACE_LABEL: Record<MessengerSurface, string> = {
  kakao: "카카오톡",
  sms: "문자",
};

export default function MessengerScenarioSelectPage() {
  const router = useRouter();
  // T74(UX-030 "이 시나리오 다시 훈련") — 아카이브가 시나리오를 미리 지목해 들어온다.
  // 시작은 여전히 사용자가 누른다. 프리셋은 채널만 검사한다(reviewer m1) — send 모드의
  // 에스컬레이션 제외 필터까지 재현하지는 않으며, 그 조합은 서버 createChallenge가
  // escalation_not_supported로 독립 거부한다(2중 방어). 아카이브 진입은 항상
  // setExperienceMode("self")를 선호출해 send 모드가 되지 않는다.
  const searchParams = useSearchParams();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(() => {
    const preset = searchParams.get("scenarioId");
    return preset && scenarios[preset]?.channel === "messenger" ? preset : null;
  });
  // lazy initializer로 마운트 시 1회만 읽는다(다른 드릴다운 화면과 동일 패턴). 힌트 부재(직접 URL
  // 접근 등 방어적 상황)는 self로 취급 — 기존(UX-026 상향 전) "유형→시나리오 직행" 기본 동작과
  // 동일한 최대 노출·자기훈련 우선 기본값이다.
  const [isSendMode] = useState<boolean>(() => getExperienceMode() === "send");

  // AC-029/AC-030 핵심 — 메신저 채널로 필터된 시나리오만 노출(전체 평면 나열 아님).
  // (T56, D-31/AC-051) — send 모드는 비에스컬레이션 시나리오만(#21/OQ-28 보류로 에스컬레이션은
  // 챌린지 대상이 아님). self 모드는 무변경(에스컬레이션 포함 전체).
  const filteredEntries = Object.entries(scenarios).filter(
    ([, scenario]) => scenario.channel === "messenger" && (!isSendMode || !scenario.escalation),
  );

  // (T72, v1.11 D-41) — 이 화면은 이제 **시나리오만 확정**하고 난이도 선택(UX-029)으로 넘긴다.
  // 하류 분기(에스컬레이션 → UX-025 목소리 선택 / send → UX-019 / self → createSession)는 그
  // 화면이 그대로 넘겨받는다 — 난이도는 목소리 선택(UX-025)보다도 **앞**이다(UX-024 v1.11 갱신:
  // 난이도가 전이 도달 속도에 영향을 주므로 먼저 정해져야 한다). 분기 판정 규칙 자체는 무변경.
  const handleStart = () => {
    if (!selectedScenarioId) return;
    if (!scenarios[selectedScenarioId]) return;
    setPendingSelectedScenarioId(selectedScenarioId);
    router.push("/scenarios/difficulty");
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
            {/* T75 — 발신자 표기가 번호로 바뀌어 첫 글자를 따면 "0"·"+"가 뜬다.
                저장되지 않은 발신자용 일반 아이콘으로 대체한다. */}
            <span aria-hidden="true">💬</span>
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-start justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                {/* 표면 배지(AC-002/030) — 색 단독 표기 금지, 텍스트 라벨을 항상 함께 표기.
                    디자인 시스템 배지(중립) 재사용 — 메신저 플로우.dc.html의 채널 배지와 동일 톤. */}
                <Badge variant="neutral">{surfaceLabel}</Badge>
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
              className="flex flex-col gap-1.5 text-sm text-[#6B655C]"
            >
              {/* 소요시간 배지(중립) — 메신저 플로우.dc.html의 "약 {time}" 배지와 동일 톤.
                  이 문자열은 자유서술문이라(예: "중간 — 정서적 압박과 채널 전환이 결합됩니다") 색상
                  등급 배지로 단정 짓지 않고 서술 텍스트로 유지한다(임의 매핑 금지).
                  T72/AC-067 — 라벨을 "난이도"에서 "이 시나리오의 성향"으로 바꾼다(값은 무변경). */}
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
        {/* 단계 표시(P-12 #2, T28 패턴 재사용) — 메신저는 방식 단계가 없어 유형→체험선택→시나리오
            3단계(v1.10 D-31로 체험 선택이 앞에 추가되며 ②→③으로 밀림). */}
        <p className="text-sm font-semibold text-[#0E6B62]" aria-current="step">
          메신저피싱 › ③ 시나리오
        </p>
        <h1 className="text-2xl font-bold text-[#22303A]">어떤 메시지를 받아볼까요?</h1>
        <p className="text-base leading-relaxed text-[#6B655C]">
          실제 사기가 아니라 훈련용 시뮬레이션입니다. 하나를 고르면 마지막으로 난이도를 정합니다.
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
        {/* T72(D-41) — 세션 생성은 난이도 선택(UX-029) 화면으로 이동했다. */}
        <Button type="button" onClick={handleStart} disabled={!selectedScenarioId}>
          다음 — 난이도 고르기
        </Button>
      </div>
    </main>
  );
}
