// 흐름 변형 배정 · 회전 — T191 S5 / PRD AC-096 (e)(f) · User 결정 D6(회전).
// 설계: T191 흐름 변형 설계(Architecture T191 절 "배정 · 회전(D6) — 인덱스 0").
//
// | If | Then |
// |---|---|
// | 일반 세션 생성 | 허용 변형 = 시나리오 · 난이도로 거른 목록. 0개 → `failed-precondition`(조용한 임의 배정 금지). 1개 → 그것. 2개 이상 → `users/{uid}/variantRotation/{scenarioId}__{level}` **문서 1건을 키로 읽어** 직전 변형 다음 순번 |
// | 2인 챌린지 수신자(익명 · 이력 없음) | 회전 문서를 쓰지 않는다 — `hash(challengeId) mod n` 결정론 배정 |
// | 회전 문서 조회 실패(미리보기) | 첫 순번 + 경고 로그 1줄(통화를 막지 않는다 — P-4). 확정은 아래 트랜잭션이 다시 읽어 정한다 |
// | 세션 문서 기록 | **트랜잭션**(`commitSessionWithVariant`): 회전 문서를 다시 읽어 확정 변형을 정하고, 세션 문서 · 회전 문서를 같은 커밋으로 쓴다 — 동시 생성 경합에서도 연속 배정 0 |
//
// ⚠️ 2단계인 이유: 오프닝 대사(LLM)는 세션 문서보다 먼저 만들어지고 변형 프롬프트가 필요하다(미리보기 값).
// LLM 호출을 트랜잭션 안에 넣으면 재시도마다 LLM을 다시 부른다. 그래서 트랜잭션은 확정만 하고, 경합으로
// 확정값이 미리보기와 달라지면(`raced`) 확정값을 세션에 쓰고 로그 1줄을 남긴다 — 이때 오프닝 1줄만 미리보기
// 변형으로 만들어졌다(같은 시나리오 · 같은 난이도 · 같은 페르소나라 차이는 흐름 블록뿐).
//
// ⛔ 쿼리가 아니라 **키 조회**다 — `sessions where uid · scenarioId · difficultyLevel orderBy createdAt`는
// 새 복합 인덱스가 필요하다(설계 금지 X6 · §66 인덱스 배포 누락 장애 이력). 이 파일에 `.where(` ·
// `.orderBy(` 0건 · `firestore.indexes.json` 인덱스 수 불변을 테스트가 고정한다.
// ⛔ 회전 문서는 서버만 쓴다(`firestore.rules` 명시 거부) — 클라가 쓰면 변형을 고를 수 있게 된다
// (AC-096 (e) "참가자는 변형을 고르지 않는다").
import { HttpsError } from "firebase-functions/v2/https";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import type { DifficultyLevel } from "../shared/difficulty";
import { assignablePool } from "../scenarios/flowVariants";

export const VARIANT_ROTATION_COLLECTION = "variantRotation";

/** 회전 문서 키 — 시나리오 · 난이도마다 1건. */
export function rotationDocKey(scenarioId: string, level: DifficultyLevel): string {
  return `${scenarioId}__${level}`;
}

/**
 * 회전 순수 함수 — 후보(회전 순서) 중 직전 변형의 **다음** 것. 직전이 없거나 목록에 없으면 첫 번째.
 * 후보가 2개 이상이면 결과는 직전과 절대 같지 않다(AC-096 (e) "연속 배정 0").
 */
export function pickRotatedVariantId(candidates: readonly string[], lastVariantId?: string): string {
  if (candidates.length === 0) throw new Error("흐름 변형 후보가 0개다");
  const lastIndex = lastVariantId === undefined ? -1 : candidates.indexOf(lastVariantId);
  return candidates[(lastIndex + 1) % candidates.length];
}

/** 2인 챌린지 수신자용 결정론 배정 — FNV-1a 32bit(challengeId) mod n. 같은 챌린지는 항상 같은 변형. */
export function pickChallengeVariantId(candidates: readonly string[], challengeId: string): string {
  if (candidates.length === 0) throw new Error("흐름 변형 후보가 0개다");
  let hash = 0x811c9dc5;
  for (let i = 0; i < challengeId.length; i += 1) {
    hash ^= challengeId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return candidates[hash % candidates.length];
}

// T194-a(§84.13.5 · G590) — 후보 = 배정 가능 풀(허용 변형 중 세션 종류의 에스컬레이션 값과 통화 단계 유무가 같은 것). 자가(`challengeId` 부재) ·
// 수신자 배정이 같은 필터를 탄다.
function candidatesOrThrow(scenarioId: string, level: DifficultyLevel, challengeId?: string): string[] {
  const candidates = assignablePool(scenarioId, level, challengeId).map((v) => v.variantId);
  if (candidates.length === 0) {
    // AC-096 (f) — 배정 실패가 조용히 임의 변형으로 귀결되지 않는다.
    console.warn(JSON.stringify({ event: "flow_variant_none", scenarioId, level }));
    throw new HttpsError("failed-precondition", "이 시나리오는 선택한 난이도로 훈련할 수 없습니다.", {
      reason: "flow-variant-unavailable",
    });
  }
  return candidates;
}

export type VariantAssignment = {
  /** 미리보기 값(오프닝 대사 조립용). 세션 문서의 확정값은 `commitSessionWithVariant`가 정한다. */
  flowVariantId: string;
  /** 회전 순서(후보 목록) — 트랜잭션 안 재계산 입력. */
  candidates: readonly string[];
  /** 회전 문서 참조(후보 ≥ 2일 때만). 트랜잭션이 다시 읽고 세션 문서와 같은 커밋으로 쓴다. */
  rotationRef?: DocumentReference;
};

/**
 * 트랜잭션 안 확정 순수 함수 — 트랜잭션이 읽은 최신 직전값으로 다음 순번을 다시 고른다. 미리보기와 다르면
 * `raced: true`(다른 동시 생성이 먼저 커밋했다). 결과는 항상 `lastInTx`와 다르다(후보 ≥ 2).
 */
export function settleRotation(
  candidates: readonly string[],
  lastInTx: string | undefined,
  previewId: string,
): { flowVariantId: string; raced: boolean } {
  const flowVariantId = pickRotatedVariantId(candidates, lastInTx);
  return { flowVariantId, raced: flowVariantId !== previewId };
}

/**
 * 세션 문서 + 회전 문서를 **한 트랜잭션**으로 쓴다(읽기: 회전 문서 1건 키 조회 → 쓰기: 회전 · 세션).
 * 돌려주는 값이 세션에 기록된 확정 변형 ID다. ⚠️ 트랜잭션 안 읽기 실패는 세션 쓰기 실패와 같은 Firestore
 * 장애로 보고 그대로 실패시킨다(세션 문서 없이 통화가 진행되는 경로를 만들지 않는다).
 */
export async function commitSessionWithVariant<T extends object>(
  db: Firestore,
  sessionRef: DocumentReference,
  sessionDoc: T,
  assignment: VariantAssignment,
  updatedAt: unknown,
): Promise<string> {
  return db.runTransaction(async (tx) => {
    let flowVariantId = assignment.flowVariantId;
    if (assignment.rotationRef) {
      const snap = await tx.get(assignment.rotationRef);
      const value = snap.exists ? snap.get("lastVariantId") : undefined;
      const settled = settleRotation(
        assignment.candidates,
        typeof value === "string" ? value : undefined,
        assignment.flowVariantId,
      );
      if (settled.raced) console.warn(JSON.stringify({ event: "flow_variant_rotation_race" }));
      flowVariantId = settled.flowVariantId;
      tx.set(assignment.rotationRef, { lastVariantId: flowVariantId, updatedAt });
    }
    tx.set(sessionRef, { ...sessionDoc, flowVariantId }, { merge: true });
    return flowVariantId;
  });
}

/**
 * 일반 세션의 변형 배정 **미리보기**. Firestore 접근은 회전 문서 키 조회 1건뿐이다(후보 2개 이상일 때만).
 * 쓰기는 하지 않는다 — 확정과 기록은 `commitSessionWithVariant`(트랜잭션)가 한다.
 */
export async function assignFlowVariantForSession(
  db: Firestore,
  uid: string,
  scenarioId: string,
  level: DifficultyLevel,
): Promise<VariantAssignment> {
  const candidates = candidatesOrThrow(scenarioId, level);
  if (candidates.length === 1) return { flowVariantId: candidates[0], candidates };
  const rotationRef = db
    .collection("users")
    .doc(uid)
    .collection(VARIANT_ROTATION_COLLECTION)
    .doc(rotationDocKey(scenarioId, level));
  let lastVariantId: string | undefined;
  try {
    const snap = await rotationRef.get();
    const value = snap.exists ? snap.get("lastVariantId") : undefined;
    lastVariantId = typeof value === "string" ? value : undefined;
  } catch {
    // P-4 — 통화를 막지 않는다. 첫 순번으로 강등(관측 가능 — 로그 1줄).
    console.warn(JSON.stringify({ event: "flow_variant_rotation_read_failed", scenarioId, level }));
  }
  return { flowVariantId: pickRotatedVariantId(candidates, lastVariantId), candidates, rotationRef };
}

/** 2인 챌린지 수신자 세션의 변형 배정(회전 문서 0 — 익명 쓰기 최소, §69). */
export function assignFlowVariantForChallenge(
  scenarioId: string,
  level: DifficultyLevel,
  challengeId: string,
): string {
  return pickChallengeVariantId(candidatesOrThrow(scenarioId, level, challengeId), challengeId);
}
