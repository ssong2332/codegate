// 리포트 생성 핵심 로직 (Track A, T9). API.md `generateReport` 1:1. AC-008/AC-009/AC-026.
//
// `generateReport` onCall(클라 인증·소유권 검증 후 호출)과 `triggerReportGeneration`(endSession/
// sendMessage의 limit_reached 자동종료 경로가 이미 소유권을 검증한 뒤 서버 내부에서 호출, API.md
// generateReport 계약의 "또는 endSession 후 서버 내부 호출") 양쪽이 이 함수 하나를 공통으로
// 쓴다 — 로직 중복 없이 단일 지점化(T8이 triggerReportGeneration에 적용한 것과 같은 원칙).
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { SCENARIO_PROMPTS } from "../scenarios";
import type { MessageDoc, ReportDoc, SessionDoc } from "../shared/types";
import { analyzeConversation, buildPreventionAdvice, type AnalysisMessage } from "./analyzeConversation";
import { computeDefenseGrade } from "./computeDefenseGrade";
import type { GenerateReportResponse } from "./types";

export async function generateReportForSession(sessionId: string): Promise<GenerateReportResponse> {
  const db = getFirestore();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
  }
  const session = sessionSnap.data() as SessionDoc;
  if (session.status !== "ended") {
    throw new HttpsError("failed-precondition", "세션이 아직 종료되지 않았습니다.");
  }

  // reportId = sessionId(Database.md "PK(=sessionId 권장)", AC-007 "정확히 1개 리포트"와 자연
  // 정합). 이미 생성된 리포트가 있으면 재계산하지 않고 그대로 반환한다(멱등 처리 — 클라
  // 직접 호출과 endSession/sendMessage 내부 트리거 양쪽에서 호출될 수 있으므로 중복 생성 방지).
  const reportRef = db.collection("reports").doc(sessionId);
  const existingReport = await reportRef.get();
  if (existingReport.exists) {
    return { reportId: sessionId };
  }

  // ① 마스킹된 messages만 입력(원문·실제 운영정보 배제, AC-005/013 — MessageDoc.textMasked는
  // 이미 저장 전 maskPII를 거친 값이다, T11 실구현 전까지는 passthrough).
  const messagesSnap = await sessionRef.collection("messages").orderBy("turnIndex", "asc").get();
  const messages: AnalysisMessage[] = messagesSnap.docs.map((doc) => {
    const data = doc.data() as MessageDoc;
    return {
      role: data.role,
      textMasked: data.textMasked,
      turnIndex: data.turnIndex,
      createdAtMs: data.createdAt.toMillis(),
    };
  });

  const scenarioPrompt = SCENARIO_PROMPTS[session.scenarioId];
  const weakenedTactics = scenarioPrompt?.weakenedTactics ?? [];

  // ② 대화 로그 규칙 기반 분석(analyzeConversation.ts 참고 — Mock 단계 한계 고지 포함) →
  // deceivedMoments/tacticsUsed/wasDeceived 산출.
  const analysis = analyzeConversation(messages, session.createdAt.toMillis(), weakenedTactics);
  const preventionAdvice = buildPreventionAdvice(analysis.tacticsUsed, analysis.wasDeceived);

  const reportDoc: ReportDoc = {
    reportId: sessionId,
    sessionId,
    uid: session.uid,
    wasDeceived: analysis.wasDeceived,
    deceivedMoments: analysis.deceivedMoments,
    tacticsUsed: analysis.tacticsUsed,
    preventionAdvice,
    createdAt: Timestamp.now(),
  };
  await reportRef.set(reportDoc);

  // P1(AC-010/AC-011, T13) — 방어 등급/세션 횟수 갱신. Database.md `users/{uid}.defenseGrade`·
  // `.sessionCount`(둘 다 옵셔널 P1 필드)에 반영한다. 새 리포트가 정확히 1회 write될 때만 이
  // 지점을 지나므로(위 멱등 early-return 참고) 등급이 세션마다 정확히 1번씩만 재계산된다.
  // UX.md UX-010 Failure("산정 실패 시 생략, 비차단")대로 실패해도 리포트 생성 자체는 막지 않는다
  // — 등급 산정식 자체는 computeDefenseGrade.ts 참고(OQ-5 미확정 임시값 v1).
  try {
    await updateDefenseGrade(db, session.uid);
  } catch (err) {
    logger.error("방어 등급 갱신 실패(비차단 — 리포트는 정상 생성됨, T13/AC-010/AC-011)", {
      sessionId,
      uid: session.uid,
      err,
    });
  }

  return { reportId: sessionId };
}

/** uid의 누적 reports를 다시 읽어 등급을 재계산하고 users/{uid}에 merge write한다. `reports`는
 * uid 단일 필드 동등 조건 쿼리라 Firestore 자동 인덱스로 충분하다(Database.md 인덱스 표 변경 불요). */
async function updateDefenseGrade(db: FirebaseFirestore.Firestore, uid: string): Promise<void> {
  const reportsSnap = await db.collection("reports").where("uid", "==", uid).get();
  const results = reportsSnap.docs.map((doc) => ({ wasDeceived: Boolean((doc.data() as ReportDoc).wasDeceived) }));
  const { defenseGrade, sessionCount } = computeDefenseGrade(results);
  await db.collection("users").doc(uid).set({ defenseGrade, sessionCount }, { merge: true });
}
