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
import { withJosa } from "@/lib/text/josa";
import { scenarios, type ScenarioDoc, type MessengerSurface } from "@/content/scenarios";
import SelectScreenHeader from "@/components/SelectScreenHeader";
import ScenarioPanelGroups, { scenarioPanelItem, type ScenarioPanelGroup } from "@/components/ScenarioPanelGroups";
import PageToc from "@/components/PageToc";
import { groupInOrder } from "@/lib/pagetoc/pageToc";

const SURFACE_LABEL: Record<MessengerSurface, string> = {
  kakao: "카카오톡",
  sms: "문자",
};

// UX D-140 (3) — 구역 제목(조사까지 고정 문자열로 둔다).
const SURFACE_GROUP_LABEL: Record<MessengerSurface, string> = {
  kakao: "카카오톡으로 오는 사기",
  sms: "문자로 오는 사기",
};

export default function MessengerScenarioSelectPage() {
  const router = useRouter();
  // T74(UX-030 "이 시나리오 다시 훈련") — 아카이브가 시나리오를 미리 지목해 들어온다.
  // 시작은 여전히 사용자가 누른다. 프리셋은 채널만 검사한다(reviewer m1) — send 모드의
  // 에스컬레이션 제외 필터까지 재현하지는 않으며, 그 조합은 서버 createChallenge가
  // escalation_not_supported로 독립 거부한다(2중 방어). 아카이브 진입은 항상
  // setExperienceMode("self")를 선호출해 send 모드가 되지 않는다.
  const searchParams = useSearchParams();
  const [selectedScenarioId] = useState<string | null>(() => {
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
  // UX D-140 (3) — 카카오톡 · 문자 구역으로 나눠 그리고, 위 "목록"에서 구역으로 바로 간다(순서는 원래 목록 순서 유지).
  const surfaceGroups = groupInOrder(
    filteredEntries,
    ([, scenario]) => (scenario.surface ? SURFACE_GROUP_LABEL[scenario.surface] : "메신저로 오는 사기"),
    "messenger-surface",
  );
  const tocSections = surfaceGroups.map((group) => ({ id: group.key, label: `${group.label} (${group.entries.length})` }));

  // UX D-141(시안 E2) — 판을 누르면 그 시나리오로 확정하고 바로 난이도 선택으로 간다(종전 2탭 → 1탭).
  // T72(D-41) — 세션 생성은 난이도 선택(UX-029) 화면이 한다.
  // 리뷰 Minor — 이동하지 않으면 false(덮개 0). 지목 표("다시 훈련")는 프리셋에만 붙인다.
  const handleSelectScenario = (scenarioId: string) => {
    if (!scenarios[scenarioId]) return false;
    setPendingSelectedScenarioId(scenarioId);
    router.push("/scenarios/difficulty");
  };

  // 판 한 장 — 이름 · 표(표면 · 다시 훈련 — 색 단독 표기 금지, AC-002/030) · 누가 보내는지 / 소요 시간 · 수법 / 성향.
  // T72/AC-067 — 라벨은 "이 시나리오의 성향"(값은 무변경).
  const toItem = ([scenarioId, scenario]: [string, ScenarioDoc]) => {
    const surfaceLabel = scenario.surface ? SURFACE_LABEL[scenario.surface] : "메신저";
    return scenarioPanelItem({
      id: scenarioId,
      icon: "chat",
      title: scenario.title,
      tags: [surfaceLabel, ...(selectedScenarioId === scenarioId ? ["다시 훈련"] : [])],
      lines: [
        // §130.6(N5) — 번호 끝 숫자의 읽기에 맞춘 조사(`josa.ts` 표 — 2298 → "로" · 3390 → "으로").
        `${withJosa(scenario.callerLabel, "으로/로")} ${surfaceLabel} 메시지가 옵니다`,
        `${scenario.estimatedDuration} · ${scenario.fraudType}`,
        `${SCENARIO_TRAIT_LABEL}: ${scenario.difficulty}`,
      ],
    });
  };
  const panelGroups: ScenarioPanelGroup[] = surfaceGroups.map((group) => ({
    id: group.key,
    label: group.label,
    items: group.entries.map(toItem),
  }));

  return (
    <main className="drilldown-step mx-auto flex min-h-dvh w-full max-w-xl flex-col bg-page pb-[env(safe-area-inset-bottom)]">
      <PageToc sections={tocSections} className="px-[22px]" />
      {/* 단계 표시(P-12 #2, T28 패턴 재사용) — 메신저는 방식 단계가 없어 유형→체험선택→시나리오
          3단계(v1.10 D-31로 체험 선택이 앞에 추가되며 ②→③으로 밀림). */}
      <SelectScreenHeader step="메신저피싱 › ③ 시나리오" title={<>어떤 메시지를<br />받아볼까요?</>}>
        <p>실제 사기가 아니라 훈련용 시뮬레이션입니다. 판을 누르면 마지막으로 난이도를 정합니다.</p>
      </SelectScreenHeader>

      {filteredEntries.length === 0 ? (
        <p className="mx-[22px] rounded-[8px] border border-line bg-white p-4 text-lg text-ink-sub">
          메신저 시나리오가 아직 없습니다.
        </p>
      ) : (
        <ScenarioPanelGroups groups={panelGroups} onSelect={handleSelectScenario} presetId={selectedScenarioId} />
      )}
    </main>
  );
}
