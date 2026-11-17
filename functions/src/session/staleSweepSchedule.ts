// 버려진 active 세션 정리(예약 함수) — 판정은 `staleSweep.ts` 판정표 하나. 이 파일은 쿼리 + 트랜잭션 배선만 한다
// (`challenge/index.ts` `purgeExpiredChallenges`와 같은 "순수 판정 + 얇은 onSchedule" 관례).
// ⛔ LLM · 음성 · 리포트 모듈 import 0 — 시크릿 선언 0(§41 시크릿 폐포 · G212). 정리는 `ended` 쓰기가 유발하는 `onSessionEnded`가 한다.
// ⛔ 리포트를 만들지 않는다 — `endSession` · sendMessage 한도 종료는 `triggerReportGeneration`을 부르지만 이 경로는 부르지 않는다
//    (자동 생성 여부는 이번 변경 범위 밖 · 참가자가 리포트 화면을 열면 `generateReport`가 만든다).
// ⚠️ 쿼리 = `status ==` + `createdAt <=` + `orderBy(createdAt)` → 복합 색인 `sessions(status ASC, createdAt ASC)`(firestore.indexes.json).
//    배포 순서: `firebase deploy --only firestore:indexes` → 색인 READY 확인 → functions 배포.
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { SessionDoc } from "../shared/types";
import {
  judgeStaleSession,
  STALE_SESSION_END_REASON,
  STALE_SESSION_SWEEP_LIMIT,
  staleSessionCreatedBeforeMs,
} from "./staleSweep";

export const endStaleSessions = onSchedule("every 60 minutes", async () => {
  const db = getFirestore();
  const nowMs = Date.now();
  const candidates = await db
    .collection("sessions")
    .where("status", "==", "active")
    .where("createdAt", "<=", Timestamp.fromMillis(staleSessionCreatedBeforeMs(nowMs)))
    .orderBy("createdAt", "asc")
    .limit(STALE_SESSION_SWEEP_LIMIT)
    .get();

  let ended = 0;
  for (const doc of candidates.docs) {
    try {
      // 트랜잭션 안에서 다시 읽고 판정한다 — 그 사이 endSession · sendMessage가 끝냈거나(S1) 기점이 바뀐(S3) 세션은 쓰지 않는다.
      const didEnd = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const data = fresh.data() as Partial<SessionDoc> | undefined;
        if (!data) return false;
        const verdict = judgeStaleSession(
          {
            status: data.status,
            createdAtMs: data.createdAt?.toMillis(),
            answeredAtMs: data.answeredAt?.toMillis(),
            maxSessionMs: data.maxSessionMs,
          },
          Date.now(),
        );
        if (verdict.action !== "end") return false;
        tx.update(doc.ref, {
          status: "ended",
          endReason: STALE_SESSION_END_REASON,
          endedAt: Timestamp.now(),
        } satisfies Partial<SessionDoc>);
        return true;
      });
      if (didEnd) ended += 1;
    } catch (err) {
      // 한 세션 실패가 나머지를 막지 않는다 — 다음 실행에서 여전히 active면 다시 잡힌다.
      logger.error("endStaleSessions: 종료 중 예외", { sessionId: doc.id, err });
    }
  }
  logger.info("endStaleSessions: 실행 완료", { candidates: candidates.size, ended });
});
