// T192 C1 — `endSession`의 종료 사유 검증 · 기록값 결정(Architecture.md §79.5 `endSession` 행 · G508).
// 잎 모듈(Firestore · 네트워크 · LLM import 0) — 판정을 onCall 밖에서 단위 테스트하기 위해 분리했다.
//
// ① 허용목록 검증: `user_ended` · `limit_reached` · `scammer_ended`만 받는다. 그 밖(타입상 남아 있는
//    `completed` · `deceived` 포함 — 사용처 0, §79.5)은 `invalid-argument`. 79.1 #12 — 이전에는
//    `!endReason` 검사뿐이라 임의 문자열이 그대로 기록됐다.
// ② `scammer_ended`인데 세션에 서버 승인 표식(`scammerHangup`)이 없으면 **`user_ended`로 기록**한다.
//    ⛔ 거절하지 않는다 — AC-006 "종료는 항상 성공". 클라 주장만으로 "사기범이 끊었다"는 기록을 만들 수
//    없게 하는 것이 목적이다.
// ③ 멱등(이미 ended면 재작성 0)은 이 모듈이 아니라 호출부(`session/index.ts`)가 그대로 소유한다.
import type { SessionDoc, SessionEndReason } from "../shared/types";

export const END_SESSION_ALLOWED_REASONS = ["user_ended", "limit_reached", "scammer_ended"] as const;
export type AllowedEndSessionReason = (typeof END_SESSION_ALLOWED_REASONS)[number];

/** 허용목록 판독. 목록 밖이면 `null`(호출부가 `invalid-argument`로 던진다). 정확 일치만 본다. */
export function readEndSessionReason(raw: unknown): AllowedEndSessionReason | null {
  for (const allowed of END_SESSION_ALLOWED_REASONS) {
    if (raw === allowed) return allowed;
  }
  return null;
}

/** 실제로 세션 문서에 기록할 사유. 표식 없는 `scammer_ended`만 `user_ended`로 바뀐다. */
export function resolveRecordedEndReason(
  requested: AllowedEndSessionReason,
  session: Pick<SessionDoc, "scammerHangup">,
): SessionEndReason {
  if (requested === "scammer_ended" && !session.scammerHangup) return "user_ended";
  return requested;
}
