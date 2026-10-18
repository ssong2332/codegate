// T192 C4(Architecture.md §79.9 E6 · 종료 화면 글머리 · §79.10 · §79.19 (7) C4-1 · C4-2) — 종료 사유 힌트의 순수 판정.
//
// 통화 화면이 "어떤 이유로 끝났는가"를 종료 화면(`/session/end`)에 넘기는 1회성 힌트다. 저장 · 삭제는
// `pendingSession.ts`의 `setPendingEndReason` · `peekPendingEndReason` · `clearPendingEndReason`이 하고(세션 저장소), 이 파일은 **값 판정만**
// 한다 — 브라우저 API · 별칭(`@/`) import 0이라 루트 테스트 러너에서 그대로 돈다.
//
// ⛔ 허용목록 밖 · 없음 · 깨진 값 · 다른 세션의 힌트는 전부 `user_ended`(종료 화면의 종전 고정값 — AC-006 "종료는 항상
//    성공"). 서버(`functions/src/session/endReason.ts`)도 같은 3값만 받고, 표식 없는 `scammer_ended`는 `user_ended`로
//    기록한다 — 클라 힌트는 신뢰 근거가 아니다(§79.10 "신뢰 등급 변화 0").
import type { EndSessionReason } from "../api/types";

/** 종료 화면이 `endSession`에 보낼 수 있는 사유(서버 `END_SESSION_ALLOWED_REASONS`와 같은 3값 — G557가 대조). */
export const END_REASON_HINT_ALLOWED: readonly EndSessionReason[] = ["user_ended", "limit_reached", "scammer_ended"];

export const END_REASON_HINT_DEFAULT: EndSessionReason = "user_ended";

/** 허용목록이면 그 값, 아니면 `user_ended`. 정확 일치만 본다(대소문자 · 공백 보정 0). */
export function resolveEndReasonHint(raw: unknown): EndSessionReason {
  for (const allowed of END_REASON_HINT_ALLOWED) {
    if (raw === allowed) return allowed;
  }
  return END_REASON_HINT_DEFAULT;
}

/** 저장 형식 — 세션 id와 묶는다(같은 탭의 이전 훈련 힌트가 다음 세션 종료에 섞이지 않게). */
export function encodeEndReasonHint(sessionId: string, reason: EndSessionReason): string {
  return JSON.stringify({ sessionId, reason });
}

/** 저장값 판독 — 없음 · 파싱 실패 · 세션 불일치 · 허용목록 밖 = `user_ended`. */
export function readEndReasonHint(stored: string | null, sessionId: string): EndSessionReason {
  if (!stored) return END_REASON_HINT_DEFAULT;
  try {
    const parsed = JSON.parse(stored) as { sessionId?: unknown; reason?: unknown } | null;
    if (!parsed || parsed.sessionId !== sessionId) return END_REASON_HINT_DEFAULT;
    return resolveEndReasonHint(parsed.reason);
  } catch {
    return END_REASON_HINT_DEFAULT;
  }
}
