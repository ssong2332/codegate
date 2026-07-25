// 실패 아카이브(UX-030)의 "이 시나리오 다시 훈련" 목적지 판정 — 순수 함수(T74, AC-068).
//
// UX-030 Exit는 "UX-029(난이도 선택) 경유 → 새 세션"이지만, **UX-029(`/scenarios/difficulty`)는
// 아직 존재하지 않는다**(난이도 단계는 T71/T72 소관이고 이 브랜치의 기준선 main에 미병합).
// 없는 화면으로 링크를 걸면 깨진 동선이 되므로, 현재 존재하는 드릴다운의 **시나리오 목록 단계**로
// 보내되 시나리오를 미리 선택된 상태로 넘긴다(UX-029 Entry가 요구하는 "시나리오 프리셋"). T72가
// UX-029를 붙일 때 이 함수 하나의 반환 경로만 바꾸면 되도록 판정을 여기 한 곳에 모아 둔다.
//
// | 조건(위에서부터 먼저 매치) | 목적지 |
// |---|---|
// | 시나리오 메타를 못 찾음 | 유형 선택(`/scenarios`)부터 — 없는 시나리오를 지목하지 않는다 |
// | 메신저 시나리오 | `/scenarios/messenger?scenarioId=…` (self 모드) |
// | 보이스 clone 시나리오 | 유형 선택(`/scenarios`) — clone 자기 체험은 AC-057로 배제돼 목록에 없다 |
// | 그 외(보이스 generic) | `/scenarios/voice/generic?scenarioId=…` (self 모드) |

export type RetrainTrainingType = "voice" | "messenger";

/** `src/content/scenarios`의 ScenarioDoc에서 이 판정에 필요한 필드만. */
export type RetrainScenarioMeta = {
  channel?: "voice" | "messenger";
  voiceMode?: "clone" | "generic";
};

export type RetrainTarget = {
  /** 드릴다운 힌트로 남길 유형. null이면 유형 선택부터 다시 시작한다. */
  trainingType: RetrainTrainingType | null;
  path: string;
};

export function resolveRetrainTarget(
  scenarioId: string | null,
  meta: RetrainScenarioMeta | null | undefined,
): RetrainTarget {
  if (!scenarioId || !meta) return { trainingType: null, path: "/scenarios" };

  const preset = `scenarioId=${encodeURIComponent(scenarioId)}`;
  if (meta.channel === "messenger") {
    return { trainingType: "messenger", path: `/scenarios/messenger?${preset}` };
  }
  // AC-057 — 보이스 clone은 "지인에게 보내기" 전용이라 자기훈련 목록(generic)에 나타나지 않는다.
  // 프리셋을 붙여 봐야 선택되지 않으므로 유형 선택부터 다시 고르게 한다(깨진 동선 금지).
  if (meta.voiceMode === "clone") return { trainingType: null, path: "/scenarios" };

  return { trainingType: "voice", path: `/scenarios/voice/generic?${preset}` };
}
