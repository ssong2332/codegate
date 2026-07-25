// 즉시 되감기 판정 콜러블 (T70). API.md `judgeRewindAnswer` 1:1. UX-028/UF-009, AC-062/AC-063.
//
// ⚠️ AC-007("종료된 모든 세션은 정확히 1개 리포트") 불변식이 이 파일의 존재 이유다(ADR-0008).
// 이 모듈이 **하지 않는 것**(§15.2.2 금지표 — 코드 리뷰 체크포인트):
//   - `reports/{rid}` 문서 필드 update  (읽기만 한다)
//   - 두 번째 `reports/*` 문서 생성
//   - `updateDefenseGrade`/`users.defenseGrade`·`sessionCount` 갱신
//   - `sessions/*` write            (세션 메시지도 읽기만 한다)
// 쓰기는 오직 `reports/{rid}/rewindAttempts/{auto}` **append** 하나뿐이다. 최상위 컬렉션 쿼리
// (`db.collection("reports")`)는 서브컬렉션 문서를 포함하지 않으므로 기존 집계·방어등급이 오염되지
// 않는다(§15.2.2 실측 근거).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { maskPII } from "../guardrails";
import { getLlmClient } from "../llm";
import { GEMINI_API_KEY } from "../shared/config";
import type { MessageDoc, ReportDoc, RewindAttemptDoc } from "../shared/types";
import { judgeRewindAnswerWith, REWIND_ANSWER_MAX_LENGTH, REWIND_ATTEMPT_LIMIT } from "./judge";
import type { JudgeRewindAnswerRequest, JudgeRewindAnswerResponse } from "./types";

ensureFirebaseAdminApp();

export { judgeByRule, judgeRewindAnswerWith, parseLlmJudgement } from "./judge";
export { buildRewindJudgePrompt } from "./judgePrompt";

/**
 * 그 순간 사기범이 한 말(마스킹됨)을 찾는다 — `deceivedMoments[i].turnIndex`는 **사용자 응답 턴**의
 * 인덱스이고(analyzeConversation.ts:149), 짝이 되는 사기범 발화는 정렬 순서상 바로 앞 항목이다.
 * turnIndex 산술(−1)이 아니라 정렬 위치로 찾는 이유는 채널 전이 등으로 turnIndex가 연속이 아닐 수
 * 있기 때문이다. 실패하거나 못 찾으면 빈 문자열 — 판정은 tactic/correctAction만으로도 계속된다
 * (비차단, P-4).
 */
async function findScammerLineMasked(sessionId: string, userTurnIndex: number): Promise<string> {
  try {
    const db = getFirestore();
    const snap = await db
      .collection("sessions")
      .doc(sessionId)
      .collection("messages")
      .orderBy("turnIndex", "asc")
      .get();
    const messages = snap.docs.map((doc) => doc.data() as MessageDoc);
    const position = messages.findIndex((m) => m.turnIndex === userTurnIndex);
    if (position < 0) return "";
    for (let i = position - 1; i >= 0; i -= 1) {
      if (messages[i].role === "scammer") return messages[i].textMasked;
    }
    return "";
  } catch {
    return "";
  }
}

export const judgeRewindAnswer = onCall<
  JudgeRewindAnswerRequest,
  Promise<JudgeRewindAnswerResponse>
>({ secrets: [GEMINI_API_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { reportId, momentIndex, answerText } = request.data ?? {};
  if (!reportId || typeof momentIndex !== "number" || !Number.isInteger(momentIndex) || momentIndex < 0) {
    throw new HttpsError("invalid-argument", "reportId와 momentIndex가 필요합니다.");
  }
  if (typeof answerText !== "string" || !answerText.trim()) {
    throw new HttpsError("invalid-argument", "답변을 입력해 주세요.");
  }
  if (answerText.length > REWIND_ANSWER_MAX_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `답변은 ${REWIND_ANSWER_MAX_LENGTH}자까지 입력할 수 있습니다.`,
    );
  }

  const db = getFirestore();
  const reportRef = db.collection("reports").doc(reportId);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "존재하지 않는 리포트입니다.");
  }
  const report = reportSnap.data() as ReportDoc;
  // 소유권만 검증한다 — 2인 챌린지의 사용자2는 익명 uid로 자기 리포트를 소유하므로 그대로 성립하고
  // (§14.7/ADR-0006), 사용자1은 사용자2 리포트에 접근할 수 없다(uid 격리를 새로 뚫지 않는다).
  if (report.uid !== request.auth.uid) {
    throw new HttpsError("permission-denied", "본인 리포트가 아닙니다.");
  }

  const moments = Array.isArray(report.deceivedMoments) ? report.deceivedMoments : [];
  const moment = moments[momentIndex];
  if (!moment) {
    throw new HttpsError("not-found", "되감을 순간을 찾을 수 없습니다.");
  }

  // 남용 방지 상한(§15.2.2). UX의 "횟수 제한 없음"은 사용자 체감 수준의 요구이며 50건은 학습
  // 흐름에서 도달하지 않는다.
  const attemptsRef = reportRef.collection("rewindAttempts");
  const existing = await attemptsRef.limit(REWIND_ATTEMPT_LIMIT).get();
  if (existing.size >= REWIND_ATTEMPT_LIMIT) {
    throw new HttpsError("resource-exhausted", "이 리포트에서 되감기를 너무 많이 실행했습니다.");
  }

  // 저장·판정에 들어가는 텍스트는 전부 마스킹 후 값이다(원문 미저장, ADR-0004 계승).
  const answerMasked = maskPII(answerText.trim());
  const scammerLineMasked = await findScammerLineMasked(report.sessionId, moment.turnIndex);

  const judgement = await judgeRewindAnswerWith(getLlmClient(), {
    tactic: moment.tactic,
    correctAction: moment.correctAction,
    scammerLineMasked,
    answerMasked,
  });

  const attempt: RewindAttemptDoc = {
    momentTurnIndex: moment.turnIndex,
    answerMasked,
    verdict: judgement.verdict,
    reason: judgement.reason,
    judgedBy: judgement.judgedBy,
    createdAt: Timestamp.now(),
  };
  await attemptsRef.add(attempt);

  // 판정 불가(unclear)여도 correctAction은 반드시 채워 반환한다(학습 최소 보장, ADR-0008).
  return {
    verdict: judgement.verdict,
    reason: judgement.reason,
    correctAction: moment.correctAction,
    judgedBy: judgement.judgedBy,
  };
});
