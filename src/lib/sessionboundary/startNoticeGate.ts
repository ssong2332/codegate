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

// ── T190-8b — 통화 화면 초기 phase(docs/Architecture.md §74.22 (3) · G463 · UX-014 v1.33 (11) · PRD AC-091 (b)(g)) ──
//
// 진리표(위에서부터 첫 매치 — ⛔ 표 밖 분기를 더하지 않는다):
//   ① status === "ended"                        → "ended"
//   ② status === "active" && answered           → "live"            (현행 새로고침 복원 그대로)
//   ③ isEscalated                               → "incoming"        (OQ-52 (ㄴ) — 프리롤 없는 벨 · pre-call-notice 미경유)
//   ④ preCallNoticeSeen                         → "incoming"        (새로고침 생략 — AC-087 (c))
//   ⑤ 그 밖                                      → "pre-call-notice"
// ⚠️ 표에 없는 조합 1건(구현 판단 — 보고 대상): answered가 참인데 status가 active가 아닌 경우. 예전 코드는 이때
// 벨 화면(incoming)에 머물렀다 — 그 동작을 지킨다(이미 "받기"를 누른 세션이니 고지는 이미 지난 것이다).

export type CallPhase = "pre-call-notice" | "incoming" | "connecting" | "opening" | "live" | "ended";

export type InitialCallPhaseInput = {
  /** 세션 문서 `status`. */
  status: string | undefined;
  /** 이 탭에서 "받기"를 했거나(비에스컬레이션은 turnCount ≥ 1 포함) — play의 기존 `answered` 계산 그대로. */
  answered: boolean;
  /** `entryChannel === "messenger"` — 메신저에서 시작해 통화로 넘어온 세션(에스컬레이션 · UF-012 포함). */
  isEscalated: boolean;
  /** 이 탭에서 이 세션의 벨 직전 고지를 이미 확인했다(`isPreCallNoticeSeen`). */
  preCallNoticeSeen: boolean;
};

export function decideInitialCallPhase(
  input: InitialCallPhaseInput,
): Extract<CallPhase, "pre-call-notice" | "incoming" | "live" | "ended"> {
  if (input.status === "ended") return "ended";
  if (input.status === "active" && input.answered) return "live";
  if (input.isEscalated) return "incoming";
  if (input.preCallNoticeSeen || input.answered) return "incoming";
  return "pre-call-notice";
}
