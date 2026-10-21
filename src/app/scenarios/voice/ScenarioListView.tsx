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
import {
  ADVANCED_ONLY_GROUP_TITLE,
  ADVANCED_ONLY_TAG,
  SCENARIO_TRAIT_LABEL,
  partitionScenarioList,
  resolveListedScenarioId,
} from "@/lib/difficulty";
import { scenarios, type ScenarioDoc, type VoiceMode } from "@/content/scenarios";
import SelectScreenHeader from "@/components/SelectScreenHeader";
import ScenarioPanelGroups, { scenarioPanelItem, type ScenarioPanelGroup } from "@/components/ScenarioPanelGroups";
import PageToc from "@/components/PageToc";
import { groupInOrder, voiceScenarioCategory } from "@/lib/pagetoc/pageToc";

const MODE_LABEL: Record<VoiceMode, string> = {
  clone: "내 목소리 복제",
  generic: "기본 AI 음성",
};

export function ScenarioListView({ mode }: { mode: VoiceMode }) {
  const router = useRouter();
  // T74(UX-030 "이 시나리오 다시 훈련") — 실패 아카이브가 시나리오를 미리 지목해 들어온다.
  // 선택만 채워 두고 시작은 여전히 사용자가 누른다(자동 시작하지 않는다).
  // ⚠️ 프리셋은 채널/음성모드만 검사한다(reviewer m1) — send 모드의 에스컬레이션 제외 필터까지는 재현하지 않는다. 그 조합은 서버
  // createChallenge가 escalation_not_supported로 독립 거부하고(2중 방어), 아카이브 진입은 항상
  // setExperienceMode("self")를 선호출해 send 모드가 되지 않는다.
  // ⚠️ 노출 필터(AC-029/AC-057)를 프리셋이 우회하면 안 된다 — 이 목록에 실제로 보이는 시나리오만
  // 미리 선택한다(예: clone 시나리오를 generic 목록에 손으로 붙여 넣어도 무시된다).
  const searchParams = useSearchParams();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(() => {
    const rawPreset = searchParams.get("scenarioId");
    // §92(UX D-135) — 합쳐진 시나리오를 지목한 옛 링크는 흡수처를 미리 고른다(목록에 없는 카드를 고르지 않는다).
    const preset = rawPreset ? resolveListedScenarioId(rawPreset, scenarios[rawPreset]) : null;
    if (!preset || scenarios[preset]?.voiceMode !== mode) return null;
    // T191 S5(D-107) — 지인에게 보내기 목록에는 고급 전용이 없으므로 프리셋도 받지 않는다.
    if (scenarios[preset]?.advancedOnly === true && getExperienceMode() === "send") return null;
    return preset;
  });
  // 단계 표시(breadcrumb) 전용 — self는 UX-016을 건너뛰어 유형→체험선택→시나리오(③)이고, send는
  // UX-016을 거쳐 유형→체험선택→방식→시나리오(④)다(v1.10 D-31 순서 반영). lazy initializer로 마운트
  // 시 1회만 읽는다(다른 드릴다운 화면과 동일 패턴).
  const [experienceModeHint] = useState<ReturnType<typeof getExperienceMode>>(() => getExperienceMode());

  // AC-029 핵심 — 전체 시나리오가 아니라 선택된 방식(mode)에 해당하는 부분집합만 노출.
  const filteredEntries = Object.entries(scenarios).filter(
    ([, scenario]) => scenario.voiceMode === mode,
  );
  // T191 S5(UX-017 v1.34 · D-104 · D-107) — 고급 전용은 아래 별도 묶음. §92(D-135) — 합쳐진 시나리오는 빠지고
  // 우선순위 낮음 2종은 일반 묶음 맨 뒤.
  // send(챌린지) 목록에서는 고급 전용 0건 · 묶음 제목도 없다(AC-097 (g) · 서버 createChallenge도 거부).
  const { regular: regularEntries, advancedOnly: advancedOnlyEntries } = partitionScenarioList(
    filteredEntries,
    experienceModeHint === "send" ? "send" : "self",
  );

  // UX D-140 (3) — 일반 묶음은 카테고리별 구역으로 나눠 그리고, 위 "목록"에서 구역으로 바로 간다(순서는 원래 목록 순서 유지).
  const regularGroups = groupInOrder(regularEntries, ([scenarioId]) => voiceScenarioCategory(scenarioId), "voice-category");
  const tocSections = [
    ...regularGroups.map((group) => ({ id: group.key, label: `${group.label} (${group.entries.length})` })),
    ...(advancedOnlyEntries.length > 0
      ? [{ id: "advanced-only-group-title", label: `${ADVANCED_ONLY_GROUP_TITLE} (${advancedOnlyEntries.length})` }]
      : []),
  ];

  // UX D-141(시안 E2) — 판을 누르면 그 시나리오로 확정하고 바로 난이도 선택(UX-029)으로 간다(종전 "고르고 → 아래 '다음'" 2탭 → 1탭).
  // (T72, v1.11 D-41) — 이 화면은 **시나리오만 확정**하고 넘긴다. 세션/챌린지 생성 분기(send → UX-019, self·generic →
  // createSession)는 난이도 화면이 그대로 넘겨받아 수행한다(판정 규칙 자체는 이관 전과 동일).
  const handleSelectScenario = (scenarioId: string) => {
    if (!scenarios[scenarioId]) return;
    setSelectedScenarioId(scenarioId);
    // UX 계약 C-10 — 이벤트는 종류만(시나리오 ID · 수법 0).
    if (scenarios[scenarioId]?.advancedOnly === true) {
      console.info(JSON.stringify({ event: "advanced_only_scenario_selected" }));
    }
    persistSelectedScenarioId(scenarioId);
    router.push("/scenarios/difficulty");
  };

  // 판 한 장 — 이름 · 표(고급 전용 · 다시 훈련) · 전화 오는 번호 / 소요 시간 · 수법 / 이 시나리오의 성향.
  // T72/AC-067 — "난이도"라는 단어는 사용자가 고르는 3단계(UX-029)에만 쓰고, 여기서는 "이 시나리오의 성향"이다.
  // 2026-10-21 시나리오 목록 검증 — "(으)로" 조사가 어색해 조사 없는 꼴("전화 오는 번호: …")을 쓴다.
  const toItem = ([scenarioId, scenario]: [string, ScenarioDoc]) =>
    scenarioPanelItem({
      id: scenarioId,
      icon: "phone",
      title: scenario.title,
      tags: [
        // T191 S5(D-104 (1)) — 텍스트 태그(색 단독 금지, P-22).
        ...(scenario.advancedOnly === true ? [ADVANCED_ONLY_TAG] : []),
        ...(selectedScenarioId === scenarioId ? ["다시 훈련"] : []),
      ],
      lines: [
        `전화 오는 번호: ${scenario.callerLabel}`,
        `${scenario.estimatedDuration} · ${scenario.fraudType}`,
        `${SCENARIO_TRAIT_LABEL}: ${scenario.difficulty}`,
      ],
    });

  const panelGroups: ScenarioPanelGroup[] = [
    ...regularGroups.map((group) => ({ id: group.key, label: group.label, items: group.entries.map(toItem) })),
    // T191 S5(UX-017 v1.34 (1) · D-104) — 고급 전용 묶음. 데이터가 없거나 send 모드면 묶음 자체를 그리지 않는다(빈 묶음 제목 0).
    ...(advancedOnlyEntries.length > 0
      ? [{ id: "advanced-only-group-title", label: <>{ADVANCED_ONLY_GROUP_TITLE}</>, items: advancedOnlyEntries.map(toItem) }]
      : []),
  ];

  return (
    <main className="drilldown-step mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-page pb-[env(safe-area-inset-bottom)]">
      <PageToc sections={tocSections} className="px-[22px]" />
      {/* 단계 표시(P-12 #2) — 지금까지의 선택 경로를 맥락으로 표시(스크린리더가 현재 위치로 읽음). */}
      <SelectScreenHeader
        step={<>보이스피싱 › {MODE_LABEL[mode]} › {experienceModeHint === "send" ? "④" : "③"} 시나리오</>}
        title={<>어떤 전화를<br />받아볼까요?</>}
      >
        <p>실제 사기가 아니라 훈련용 시뮬레이션입니다. 판을 누르면 마지막으로 난이도를 정합니다.</p>
      </SelectScreenHeader>

      {regularEntries.length + advancedOnlyEntries.length === 0 ? (
        // Empty 상태(UX-017 States) — 현재 데이터상 clone 2종·generic 7종 다 있어 실질 발생 안 함.
        <p className="mx-[22px] rounded-[8px] border border-line bg-white p-4 text-lg text-ink-sub">
          이 방식의 시나리오가 아직 없습니다.
        </p>
      ) : (
        <ScenarioPanelGroups groups={panelGroups} onSelect={handleSelectScenario} presetId={selectedScenarioId} />
      )}
    </main>
  );
}
