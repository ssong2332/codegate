// 되감기(UX-028) 진입점 노출 판정 — 순수 함수(T70, AC-062/AC-042, UX D-39/D-40).
//
// 진입점을 띄울지 말지는 세 화면(UX-007 종료 직후 · UX-008 리포트 · UX-018 리플레이 해설)이
// 같은 규칙을 써야 한다. 화면마다 조건을 손으로 다시 쓰면 한 곳만 어긋나 "안 속았는데 되감기가
// 뜨는" 또는 "2인 사용자2가 강제 해설을 건너뛰는" 회귀가 난다 — 판정표를 이 함수 하나로 고정한다.
//
// | 조건(위에서부터 먼저 매치) | 결과 |
// |---|---|
// | 2인 챌린지 세션이고 아직 강제 해설(UX-018) 단계를 지나지 않음 | hidden (AC-042 순서 보호) |
// | 리포트 로드 실패 | hidden |
// | 리포트 준비 중 | pending("리포트를 준비하고 있어요" — 비활성 노출, 침묵 실패 금지) |
// | 속은 순간 0건 | hidden (near-miss를 발명하지 않는다 — D-40) |
// | 그 외 | available |

export type RewindEntryState = "hidden" | "pending" | "available";

export type RewindEntryInput = {
  reportStatus: "pending" | "ready" | "error";
  deceivedMomentCount: number;
  /** 2인 챌린지 체험 세션(사용자2)인가 — session.challengeId 존재 여부. */
  isChallengeSession: boolean;
  /** 강제 정체 공개(UX-007) → 강제 리플레이 해설(UX-018) 단계를 이미 지난 화면인가. */
  afterForcedReplay: boolean;
};

export function resolveRewindEntry(input: RewindEntryInput): RewindEntryState {
  // AC-042 — 되감기는 강제 단계를 대체하거나 앞지르지 않는다. 2인 사용자2에게는 강제 해설
  // 이후 화면(UX-018)에서만 노출한다.
  if (input.isChallengeSession && !input.afterForcedReplay) return "hidden";
  if (input.reportStatus === "error") return "hidden";
  if (input.reportStatus === "pending") return "pending";
  if (input.deceivedMomentCount <= 0) return "hidden";
  return "available";
}
