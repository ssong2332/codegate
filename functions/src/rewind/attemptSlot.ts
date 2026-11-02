// SEC-06(외부 보안 점검 2차 · 2026-11-02) — 되감기 리포트별 50회 슬롯 예약(트랜잭션).
//
// 전: `rewindAttempts`를 트랜잭션 밖에서 세고(limit 50) 판정(LLM) 뒤 append 했다 → 기록 49개 상태에서 동시 요청이 둘 다 49를 보고
// 통과해 51개가 저장됐다.
// 후: 판정 호출 **전에** 슬롯 문서(`reports/{rid}/limits/rewind`)를 트랜잭션으로 읽고 `used`를 1 올린다. 같은 문서를 읽고 쓰는
// 트랜잭션은 직렬화되므로 두 번째 요청은 첫 번째가 올린 값을 본다.
//
// | 상태 | used 시작값 |
// |---|---|
// | 슬롯 문서 있음 | 그 값 |
// | 슬롯 문서 없음(이 변경 전 리포트) | 기존 `rewindAttempts` 수(최대 50개 read) |
// 판정이 실패해도 슬롯은 돌려주지 않는다(판정 호출 = 비용이 이미 났다) — 저장 기록 수 ≤ used ≤ 50.
//
// ⛔ AC-007 · ADR-0008 불변식 — 이 모듈은 `reports/{rid}` 문서 · `sessions` · `users` 를 쓰지 않는다. 쓰는 곳은 슬롯 문서 하나뿐이고
// 그 문서는 서버 전용이다(`firestore.rules` 끝의 `/{document=**}` 전면 거부 — 규칙 변경 0 · 최상위 `reports` 쿼리에 안 섞인다).
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { REWIND_ATTEMPT_LIMIT } from "./judge";

/** 순수 판정 — 다음 used 값, 상한이면 null. 슬롯 문서 없음 = `storedUsed` undefined. 깨진 값(음수 · 소수 · 문자열)은 거절(fail-closed). */
export function nextRewindSlot(input: { storedUsed: unknown; existingAttempts: number }): number | null {
  let used: number;
  if (input.storedUsed === undefined) used = input.existingAttempts;
  else if (typeof input.storedUsed === "number" && Number.isInteger(input.storedUsed) && input.storedUsed >= 0) used = input.storedUsed;
  else return null;
  return used >= REWIND_ATTEMPT_LIMIT ? null : used + 1;
}

export async function reserveRewindSlot(db: Firestore, reportRef: DocumentReference): Promise<void> {
  const slotRef = reportRef.collection("limits").doc("rewind");
  const attemptsQuery = reportRef.collection("rewindAttempts").limit(REWIND_ATTEMPT_LIMIT);
  const granted = await db.runTransaction(async (tx) => {
    const slotSnap = await tx.get(slotRef);
    // 기존 기록은 슬롯 문서가 없을 때(이 변경 전 리포트)만 센다 — 있으면 read 1건.
    const existingAttempts = slotSnap.exists ? 0 : (await tx.get(attemptsQuery)).size;
    const next = nextRewindSlot({ storedUsed: slotSnap.exists ? slotSnap.get("used") : undefined, existingAttempts });
    if (next === null) return false;
    tx.set(slotRef, { used: next });
    return true;
  });
  if (!granted) {
    throw new HttpsError("resource-exhausted", "이 리포트에서 되감기를 너무 많이 실행했습니다.");
  }
}
