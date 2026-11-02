// SEC-05(외부 보안 점검 2차 · 2026-11-02) — createSession 슬롯 예약(트랜잭션).
//
// 전: 최근 세션을 트랜잭션 밖에서 세고(§66.3 롤링 윈도우) 세션 문서는 오프닝 대사(LLM) 뒤에 썼다 → 기존 5개 상태에서 동시 요청 2개가
// 둘 다 "5개"를 보고 통과해 6회 상한을 넘었다(AI 호출 2회 · 최종 7개).
// 후: 외부 AI 호출 **전에** 사용자별 예약 문서(`users/{uid}/limits/createSession`)를 트랜잭션으로 읽고 쓴다. 같은 문서를 읽고 쓰는
// 두 트랜잭션은 직렬화되므로(충돌하면 Firestore가 한쪽을 재시도) 두 번째는 첫 번째의 예약을 보고 거절된다.
//
// 세는 값(10분 창 · 6회 — `CREATE_SESSION_WINDOW_*`):
// | 항목 | 셈 |
// |---|---|
// | 창 안 세션 문서(createdAt) | 센다 |
// | 진행 중 예약(예약 뒤 `INFLIGHT_TTL_MS` 이내) | 센다 — 단, 그 예약의 세션 문서가 이미 창 안 목록에 있으면 한 번만 |
// | 오래된 예약(`INFLIGHT_TTL_MS` 경과 — 함수가 죽어 지우지 못한 것) | 세지 않고 지운다 |
// 예약 키 = 만들 세션 문서 id라 "세션 문서 커밋 ~ 예약 해제" 사이에도 두 번 세지 않는다.
//
// ⛔ 예약 문서는 서버 전용이다(`firestore.rules` 끝의 `/{document=**}` 전면 거부 — 규칙 변경 0). 쿼리는 종전 롤링 윈도우와 같다(인덱스 변경 0).
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { CREATE_SESSION_WINDOW_MAX, CREATE_SESSION_WINDOW_MS } from "../shared/constants";
import { isCreateSessionRateLimited } from "./rateLimit";

/** 예약이 유효한 시간 — createSession 제한 시간(60초)보다 넉넉하게. 지나면 죽은 요청으로 보고 세지 않는다. */
export const CREATE_SLOT_INFLIGHT_TTL_MS = 2 * 60 * 1000;

export type RecentSession = { id: string; createdAtMs: number | undefined };

/** 순수 판정 — 거절 여부와 정리된 예약 표(이번 예약 포함)를 돌려준다. */
export function decideCreateSlot(input: {
  recent: readonly RecentSession[];
  inflight: Readonly<Record<string, unknown>>;
  slotId: string;
  nowMs: number;
}): { limited: boolean; inflight: Record<string, number> } {
  const recentIds = new Set(input.recent.map((r) => r.id));
  const fresh: Record<string, number> = {};
  for (const [id, at] of Object.entries(input.inflight)) {
    if (typeof at === "number" && Number.isFinite(at) && input.nowMs - at < CREATE_SLOT_INFLIGHT_TTL_MS) fresh[id] = at;
  }
  // ⛔ createdAt 부재 세션 문서는 세지 않는다 — §66.3 롤링 윈도우와 같은 규칙(§15.0-4 승계).
  const counted = [
    ...input.recent.map((r) => r.createdAtMs).filter((t): t is number => typeof t === "number"),
    ...Object.entries(fresh)
      .filter(([id]) => !recentIds.has(id))
      .map(([, at]) => at),
  ];
  const limited = isCreateSessionRateLimited({ recentCreatedAtMs: counted, nowMs: input.nowMs });
  return { limited, inflight: limited ? fresh : { ...fresh, [input.slotId]: input.nowMs } };
}

export function createSlotRef(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("limits").doc("createSession");
}

/**
 * 슬롯 예약 — 통과하면 예약을 남기고, 상한이면 resource-exhausted. ⛔ 위치가 설계다: 동의 게이트 뒤 · 흐름 변형 배정 · 오프닝 대사(LLM) ·
 * 세션 문서 write 앞(거절된 시도는 회전 문서 · AI · 세션 문서 0).
 */
export async function reserveCreateSessionSlot(db: Firestore, uid: string, slotId: string, nowMs: () => number = Date.now): Promise<void> {
  const ref = createSlotRef(db, uid);
  const recentQuery = db
    .collection("sessions")
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(CREATE_SESSION_WINDOW_MAX + 1);
  const limited = await db.runTransaction(async (tx) => {
    const [slotSnap, recentSnap] = await Promise.all([tx.get(ref), tx.get(recentQuery)]);
    const now = nowMs();
    const decision = decideCreateSlot({
      recent: recentSnap.docs.map((d) => ({
        id: d.id,
        createdAtMs: (d.get("createdAt") as FirebaseFirestore.Timestamp | undefined)?.toMillis(),
      })),
      inflight: (slotSnap.exists ? (slotSnap.get("inflight") as Record<string, unknown> | undefined) : undefined) ?? {},
      slotId,
      nowMs: now,
    });
    // 거절이어도 오래된 예약은 정리한다(같은 커밋 — 읽은 문서에 쓰므로 동시 요청과 직렬화된다).
    tx.set(ref, { inflight: decision.inflight, updatedAtMs: now });
    return decision.limited;
  });
  if (limited) {
    throw new HttpsError("resource-exhausted", "짧은 시간에 너무 많이 시작했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

/** 예약 해제 — 세션 문서를 커밋했거나 그 전에 실패했을 때. 실패해도 TTL이 지나면 세지 않으므로 오류를 삼킨다. */
export async function releaseCreateSessionSlot(db: Firestore, uid: string, slotId: string): Promise<void> {
  try {
    await createSlotRef(db, uid).update({ [`inflight.${slotId}`]: FieldValue.delete() });
  } catch {
    // 비차단(TTL 경과 뒤 자동 제외).
  }
}

// 창 길이는 호출부 · 테스트가 같은 상수를 본다.
export { CREATE_SESSION_WINDOW_MAX, CREATE_SESSION_WINDOW_MS };
