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
// ⭐ 보안 점검 후속(2026-11-02) — 같은 사전 세션 id 동시 시작. 전: 예약 키가 같아 같은 id 요청 3개가 모두 통과해 오프닝 대사(LLM)를 3번 만들고
// 오프닝 메시지(turnIndex 0)가 3개 저장됐다(에뮬레이터 실측). 후: 같은 트랜잭션에서 "진행 중" 표(`running`)와 채택할 세션 문서 상태를 함께 읽어
// 중복이면 거절한다(외부 호출 0). **거절 방식**인 이유 — 기존 가드(`index.ts` "이미 사용된 세션")가 active · ended 재사용을 이미 거절하고,
// 진행 중인 첫 요청의 결과(오프닝)는 커밋 전이라 돌려줄 값이 없다.
// | 같은 id 상태 | 결과 |
// |---|---|
// | `running`에 있음(TTL 안) | 거절(failed-precondition) |
// | 채택 문서 status active · ended | 거절(failed-precondition) — 첫 요청이 커밋 · 해제를 마친 뒤 |
// | 그 밖(created · 없음) | 예약 + `running` 표시 |
// `running`은 성공 · 실패 모두 끝에 지운다(실패한 뒤 같은 id 재시도 허용). 횟수 셈(`inflight`)은 종전대로 실패면 TTL 동안 남는다.
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
  running?: Readonly<Record<string, unknown>>;
  /** 채택할 사전 세션 문서가 이미 시작(active) · 종료(ended)됐다. */
  alreadyStarted?: boolean;
}): { limited: boolean; duplicate: boolean; inflight: Record<string, number>; running: Record<string, number> } {
  const recentIds = new Set(input.recent.map((r) => r.id));
  const keepFresh = (table: Readonly<Record<string, unknown>>) => {
    const out: Record<string, number> = {};
    for (const [id, at] of Object.entries(table)) {
      if (typeof at === "number" && Number.isFinite(at) && input.nowMs - at < CREATE_SLOT_INFLIGHT_TTL_MS) out[id] = at;
    }
    return out;
  };
  const fresh = keepFresh(input.inflight);
  const running = keepFresh(input.running ?? {});
  if (input.alreadyStarted === true || running[input.slotId] !== undefined) {
    return { limited: false, duplicate: true, inflight: fresh, running };
  }
  // ⛔ createdAt 부재 세션 문서는 세지 않는다 — §66.3 롤링 윈도우와 같은 규칙(§15.0-4 승계).
  const counted = [
    ...input.recent.map((r) => r.createdAtMs).filter((t): t is number => typeof t === "number"),
    ...Object.entries(fresh)
      .filter(([id]) => !recentIds.has(id))
      .map(([, at]) => at),
  ];
  const limited = isCreateSessionRateLimited({ recentCreatedAtMs: counted, nowMs: input.nowMs });
  return limited
    ? { limited, duplicate: false, inflight: fresh, running }
    : { limited, duplicate: false, inflight: { ...fresh, [input.slotId]: input.nowMs }, running: { ...running, [input.slotId]: input.nowMs } };
}

export function createSlotRef(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("limits").doc("createSession");
}

/**
 * 슬롯 예약 — 통과하면 예약을 남기고, 상한이면 resource-exhausted. ⛔ 위치가 설계다: 동의 게이트 뒤 · 흐름 변형 배정 · 오프닝 대사(LLM) ·
 * 세션 문서 write 앞(거절된 시도는 회전 문서 · AI · 세션 문서 0).
 */
export async function reserveCreateSessionSlot(
  db: Firestore,
  uid: string,
  slotId: string,
  nowMs: () => number = Date.now,
  options: { adoptsSessionDoc?: boolean } = {},
): Promise<void> {
  const ref = createSlotRef(db, uid);
  const recentQuery = db
    .collection("sessions")
    .where("uid", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(CREATE_SESSION_WINDOW_MAX + 1);
  const adoptedRef = options.adoptsSessionDoc ? db.collection("sessions").doc(slotId) : undefined;
  const decision = await db.runTransaction(async (tx) => {
    const [slotSnap, recentSnap] = await Promise.all([tx.get(ref), tx.get(recentQuery)]);
    // 채택 문서 상태는 트랜잭션 안에서 다시 읽는다 — 첫 요청이 커밋(active) · 해제한 직후 들어온 요청도 여기서 걸린다.
    const adoptedStatus = adoptedRef ? (await tx.get(adoptedRef)).get("status") : undefined;
    const now = nowMs();
    const decision = decideCreateSlot({
      recent: recentSnap.docs.map((d) => ({
        id: d.id,
        createdAtMs: (d.get("createdAt") as FirebaseFirestore.Timestamp | undefined)?.toMillis(),
      })),
      inflight: (slotSnap.exists ? (slotSnap.get("inflight") as Record<string, unknown> | undefined) : undefined) ?? {},
      running: (slotSnap.exists ? (slotSnap.get("running") as Record<string, unknown> | undefined) : undefined) ?? {},
      alreadyStarted: adoptedStatus === "active" || adoptedStatus === "ended",
      slotId,
      nowMs: now,
    });
    // 거절이어도 오래된 예약은 정리한다(같은 커밋 — 읽은 문서에 쓰므로 동시 요청과 직렬화된다).
    tx.set(ref, { inflight: decision.inflight, running: decision.running, updatedAtMs: now });
    return decision;
  });
  if (decision.duplicate) {
    throw new HttpsError("failed-precondition", "이미 시작 중이거나 사용된 세션입니다. 시나리오 선택부터 다시 시작해 주세요.");
  }
  if (decision.limited) {
    throw new HttpsError("resource-exhausted", "짧은 시간에 너무 많이 시작했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

/** 예약 해제 — 세션 문서를 커밋했거나 그 전에 실패했을 때. 실패해도 TTL이 지나면 세지 않으므로 오류를 삼킨다. */
export async function releaseCreateSessionSlot(db: Firestore, uid: string, slotId: string): Promise<void> {
  try {
    await createSlotRef(db, uid).update({ [`inflight.${slotId}`]: FieldValue.delete(), [`running.${slotId}`]: FieldValue.delete() });
  } catch {
    // 비차단(TTL 경과 뒤 자동 제외).
  }
}

/** 실패한 시도 끝 — `running`만 지운다(같은 사전 id 재시도 허용). 횟수 셈(`inflight`)은 TTL 동안 남긴다(AI를 이미 썼을 수 있다). */
export async function endFailedCreateSessionAttempt(db: Firestore, uid: string, slotId: string): Promise<void> {
  try {
    await createSlotRef(db, uid).update({ [`running.${slotId}`]: FieldValue.delete() });
  } catch {
    // 비차단(TTL 경과 뒤 자동 제외).
  }
}

// 창 길이는 호출부 · 테스트가 같은 상수를 본다.
export { CREATE_SESSION_WINDOW_MAX, CREATE_SESSION_WINDOW_MS };
