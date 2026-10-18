// T187 — 메신저 시작 전 고지(UX-022 `start-notice`)를 띄울지 정하는 **순수 함수**
// (docs/Architecture.md §72.5 D2 · UX-022 v1.29 노트 (3) N-1~N-4 · PRD v1.18 AC-088).
//
// 판정표(위에서부터 첫 매치 — ⛔ 표 밖 분기를 더하지 않는다):
//   ① acknowledged || answeredInThisTab → "skip"         (N-2 같은 세션 새로고침 · 통화→메신저 역방향)
//   ② sessionEnded                      → "ended-footer" (N-4 종료 푸터만 — 대화 목록 0)
//   ③ 그 밖                             → "show"         (N-1 · N-3 기록 없음·유실·다른 탭)
//
// ⭐ N-3(모름)은 N-1과 같은 "show"다 — 한 번 더 보이는 대가가 고지 없이 대화가 보이는 위반보다 작다.

export type MessengerStartNoticeState = "pending" | "show" | "skip" | "ended-footer";

export type MessengerStartNoticeInput = {
  /** 이 탭에서 이 세션의 시작 고지를 이미 확인했다(`isStartNoticeAcknowledged`). */
  acknowledged: boolean;
  /** 이 탭에서 이 세션의 통화 "받기"를 이미 했다(`isSessionAnswered` — **읽기만**, G450). */
  answeredInThisTab: boolean;
  /** 세션 문서 `status === "ended"`. */
  sessionEnded: boolean;
};

export function decideMessengerStartNotice(
  input: MessengerStartNoticeInput,
): Exclude<MessengerStartNoticeState, "pending"> {
  if (input.acknowledged || input.answeredInThisTab) return "skip";
  if (input.sessionEnded) return "ended-footer";
  return "show";
}
