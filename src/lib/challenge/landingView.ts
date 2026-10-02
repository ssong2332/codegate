// UX-021 사용자2 동의 랜딩의 화면 판정 (T181 C5 · docs/Architecture.md §69.15.2 · docs/UX.md v1.27 D-75).
//
// 랜딩 응답(getChallengeLanding)의 status · expired **둘만으로** 어떤 화면을 보일지 정한다 — 서버 응답
// 필드 추가 0(UX v1.27 Data Required). Firebase·React 없이 node:test로 14칸 진리표(status 7 × expired 2)를
// 단언하려고 순수 함수로 분리했다(W-1T — mapChallengeItems.ts와 같은 "부수효과와 로직 분리" 관례).
//
// ⭐ 완료가 만료보다 우선한다 — status가 completed이면 링크 기간 경과(expired, 생성 +3일)와 무관하게
//    완료 안내(UX-021 Error (c))다. 그렇지 않으면 3일 뒤 다시 연 완료자가 "만료"를 보고 "늦었다"로 읽는다.
// ⛔ 이 우선순위는 completed에만 건다 — 신고(reported) · 폐기(deleted) · 그 밖의 판정과 문구는 T181 전과
//    같다(UX v1.27 노트 (3) · (6)). 신고 · 폐기까지 "끝난 훈련"으로 묶으면, 동의 전에 신고된 챌린지(훈련이
//    시작된 적도 없다)에 사실과 다른 문장을 보이게 된다.
// ⛔ 차단은 그대로다 — completed 화면에는 동의 · 재개 경로가 없다(§69.4 · AC-048).

export type ChallengeLandingView =
  /** 동의 화면(고지 + "동의하고 시작") — 진행 가능 3상태(pending · consented · in_progress) + 링크 미만료. */
  | "consent"
  /** 차단 — "이 링크는 만료되었습니다." */
  | "expired"
  /** 차단 — "이 챌린지는 더 이상 이용할 수 없습니다." */
  | "unavailable"
  /** UX-021 Error (c) 완료 안내 — 체험이 끝난 훈련(차단 유지 · 버튼 0). */
  | "completed";

export function resolveChallengeLandingView(landing: { status: string; expired: boolean }): ChallengeLandingView {
  if (landing.status === "completed") {
    return "completed";
  }
  // 이하 T181 전 판정 그대로(join/page.tsx의 `result.expired || !resumable` — 만료 문구가 먼저).
  // ⚠️ 현행 동작 고정 — T184에서 변경 예정(링크 만료 후에도 보존기간 안 재개 허용): 지금은 링크 생성
  //    3일 뒤 consented · in_progress도 여기서 "expired"가 된다. 서버는 보존기간(30일) 안 재개를 허용한다
  //    (functions/src/challenge/consentGate.ts). T181은 이 동작을 바꾸지 않는다(범위 밖).
  if (landing.expired) {
    return "expired";
  }
  const resumable =
    landing.status === "pending" || landing.status === "consented" || landing.status === "in_progress";
  return resumable ? "consent" : "unavailable";
}

/**
 * T181 C6(§69.15.2 (4) W-2 · OQ-U52 · UX v1.27 노트 (4)) — 동의가 실패했을 때 보일 화면. 동의 화면을 띄워
 * 둔 사이 체험이 끝나면 동의는 서버에서 거절되고 재시도는 성공할 수 없다 ⇒ 랜딩을 1회 다시 조회해
 * 완료면 "completed"(Error (c) — 랜딩 로드와 같은 화면), 그 밖의 상태(신고 · 삭제 · 링크 만료 · 진행
 * 중)와 재조회 실패는 "consent-error"(기존 "동의 처리에 실패했습니다…" 그대로).
 * ⛔ 서버 거절 메시지 · 오류 코드는 받지도 않는다(4상태 공용 · 계약 아님 — 판정은 위 함수 1곳).
 * ⛔ 재조회 실패를 삼키는 것이 계약이다 — 던지면 호출부가 실패 문구를 못 세우고 동의 버튼이 잠긴 채 남는다.
 */
export async function resolveConsentFailureView(
  refetchLanding: () => Promise<{ status: string; expired: boolean }>,
): Promise<"completed" | "consent-error"> {
  try {
    const latest = await refetchLanding();
    return resolveChallengeLandingView(latest) === "completed" ? "completed" : "consent-error";
  } catch {
    return "consent-error";
  }
}

// UX-021 Error (c) 정본 문구 — docs/UX.md v1.27 UX-021 노트 (1)에서 **글자 단위로 복사**했다(⛔ 의역 금지 ·
// 정본이 바뀌면 여기와 landingView.test.ts를 함께 고친다).
export const COMPLETED_LANDING_TITLE = "이미 끝난 훈련입니다";
export const COMPLETED_LANDING_BODY = [
  "한 번 끝난 훈련은 다시 시작되지 않습니다.",
  "잘못된 것은 없으니 안심하셔도 됩니다.",
  "이 링크로 더 하실 일은 없습니다. 이 화면은 닫으셔도 됩니다.",
] as const;
