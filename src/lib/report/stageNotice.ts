// 3단계 결합 세션의 **상단 1줄 구조 고지** — 순수 함수 (T84, Architecture.md §15.9.5 e-3,
// OQ-U24 판정, D-50, AC-073).
//
// **왜 1줄인가(OQ-U24 판정)**: 데이터(`reports.stages`)에는 **미도달 단계까지 전부** 싣지만,
// 화면은 **도달한 단계만** 항목으로 그리고 미도달 단계를 빈 항목으로 그리지 않는다. 대신 리포트
// 상단에서 전체 구조를 **사후에** 한 줄로 고지한다.
//
// ⚠️ **D-50과 충돌하지 않는다**: D-50이 금지한 것은 **세션 중** 단계 카운터("1/3단계")이고, 그
// 결정 자체가 "단계 구분은 종료 후 리포트에서만 드러난다"고 명시한다. 이 문구는 그 예외 안이다.
// ⚠️ 확정 카피는 ux-design 소관(OQ-A5) — 아래는 architect가 §15.9.5 e-3에 남긴 참고 문구 형태다.

export type ReportStageName = "messenger" | "mock_install" | "voice";
export type ReportStage = { stage: ReportStageName; reached: boolean };

/** 단계 이름 → 사용자 어휘. **축 코드·단계 번호를 노출하지 않는다**(D-46/D-50). */
const STAGE_LABEL: Record<ReportStageName, string> = {
  messenger: "문자",
  mock_install: "앱 설치",
  voice: "전화",
};

/**
 * 의도된 단계 목록에서 구조 고지 1줄을 만든다. 단계가 2개 미만이면 `null`(문구를 그리지 않는다)
 * — 기존 단일 표면 세션의 리포트가 한 글자도 바뀌지 않아야 하기 때문이다.
 *
 * ⚠️ 배열 **순서 그대로** 잇는다(서버가 messenger → mock_install → voice 순서로 만든다). 화면이
 * 순서를 다시 해석하지 않는다(§15.1.5 (6)의 "스냅샷이 이미 최종 순서로 온다"와 같은 원칙).
 */
export function buildStageNotice(stages: readonly ReportStage[]): string | null {
  if (stages.length < 2) return null;
  const labels = stages.map((s) => STAGE_LABEL[s.stage]).filter(Boolean);
  if (labels.length < 2) return null;
  return `이번 훈련은 ${labels.join(" → ")}로 이어지는 수법이었습니다.`;
}

/**
 * 화면이 "도달 단계만" 그리기 위한 필터(OQ-U24 판정의 화면 쪽 절반).
 * 데이터에서 빼지 않고 **표시할 때만** 걸러낸다 — 데이터에서 빼면 "미도달"과 "그런 단계가
 * 애초에 없었다"를 영영 구분할 수 없다.
 */
export function reachedStages(stages: readonly ReportStage[]): ReportStage[] {
  return stages.filter((s) => s.reached);
}
