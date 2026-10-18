// T192 C3 — `requestScammerHangup` 요청 판독(Architecture.md §79.19 (6) ② ③ · G536).
//
// 핸들러(`index.ts`)는 onCall이라 에뮬레이터 없이 실행할 수 없다(관측 불가 지점) ⇒ 판독을 이 순수 함수로 내려
// 필드별 무효값 표로 고정한다. 핸들러는 세션 read **앞에서** 이 함수 하나를 부른다(소스 순서 — G536).
// ⛔ Firestore import 0. 무효값은 조용히 보정하지 않고 `invalid-argument`로 거절한다(6행 차단 무력화 방지).
// `userTurns`는 S5b `deliverInCallSms`와 **같은 판독 규칙**(정수 · 0~`MAX_CLAIMED_TURNS` — OQ-A120 같은 등급).
import { HttpsError } from "firebase-functions/v2/https";
import { MAX_CLAIMED_TURNS } from "../inCallSms/smsGate";
import type { ScammerHangupKind } from "../shared/types";
import { normalizeScammerHangupKind } from "./decide";

export type ScammerHangupRequestClaims = {
  sessionId: string;
  userTurns: number;
  pendingInstruction: boolean;
  kind: ScammerHangupKind;
};

export function readScammerHangupRequest(data: unknown): ScammerHangupRequestClaims {
  const raw = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const { sessionId, userTurns, pendingInstruction, kind } = raw;
  // C1 Minor ② — `!sessionId`는 숫자 · 객체 같은 비문자열을 통과시켰다.
  if (typeof sessionId !== "string" || sessionId === "") {
    throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
  }
  if (typeof userTurns !== "number" || !Number.isInteger(userTurns) || userTurns < 0 || userTurns > MAX_CLAIMED_TURNS) {
    throw new HttpsError("invalid-argument", `userTurns는 0~${MAX_CLAIMED_TURNS} 정수여야 합니다.`);
  }
  // 다른 값을 조용히 `false`로 떨어뜨리면 6행 차단이 무력화된다.
  if (typeof pendingInstruction !== "boolean") {
    throw new HttpsError("invalid-argument", "pendingInstruction은 true 또는 false여야 합니다.");
  }
  // 누락 · 오기입은 `unspecified`(거절하지 않는다 — §79.2).
  return { sessionId, userTurns, pendingInstruction, kind: normalizeScammerHangupKind(kind) };
}
