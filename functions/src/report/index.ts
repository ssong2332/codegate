// 리포트 생성 (Track A, T9). API.md `generateReport` 1:1. AC-008/AC-009/AC-026.
//
// ⚠️ 분석 로직 실호출 여부(투명 고지): 실제 LLM이 아니라 대화 로그를 정규식 기반으로 분석하는
// 규칙 기반 로직이다(analyzeConversation.ts) — getLlmClient()가 여전히 MockLlmClient를 반환하므로
// (functions/src/llm/index.ts) LLM에 리포트 판정을 위임하지 않는다. API.md는 "LLM으로 산출"이라고
// 적었지만, LLM_API_KEY가 없는 이 하카톤 Mock 단계에서 LLM을 호출하는 척하는 것은 근거 없는 성공
// 보고에 해당하므로, 대신 대화 로그(사용자 응답의 저항/순응 키워드, 사기범 발화의 weakenedTactics
// 부분 일치)에서 직접 규칙 기반으로 추출한다 — 실제 LLM 없이도 리포트 구조(AC-008/009/026)를
// 정직하게 채운다. LLM_API_KEY 확보 후 실 LLM 분석으로 교체 가능(T7/T19와 동일한 어댑터 교체 원칙).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import type { SessionDoc } from "../shared/types";
import { generateReportForSession } from "./generateReportCore";
import type { GenerateReportRequest, GenerateReportResponse } from "./types";

ensureFirebaseAdminApp();

export const generateReport = onCall<GenerateReportRequest, Promise<GenerateReportResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const { sessionId } = request.data ?? {};
    if (!sessionId) {
      throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
    }

    // 소유권 검증(다른 콜러블들과 동일 패턴, createSession/endSession 참고) — 실제 생성 로직
    // (session 상태 확인·messages read·reports write)은 generateReportForSession에 위임한다.
    const db = getFirestore();
    const sessionSnap = await db.collection("sessions").doc(sessionId).get();
    if (!sessionSnap.exists) {
      throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
    }
    const session = sessionSnap.data() as SessionDoc;
    if (session.uid !== request.auth.uid) {
      throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
    }

    return generateReportForSession(sessionId);
  },
);

/**
 * 리포트 생성 "개시" 지점 (Track B, T8이 배선을 만들고 Track A, T9이 실제 로직을 채움).
 * Architecture.md §5 데이터플로우의 "endSession → generateReport" 화살표와 API.md `endSession`
 * 계약의 "리포트 생성 개시"를 실제로 배선한다. AC-007("종료된 모든 세션은 정확히 1개의 리포트를
 * 생성")을 만족하려면 세션이 `endSession` 콜러블 경로든 `sendMessage`의 한도 도달 자동 종료
 * 경로든 상관없이 이 지점을 반드시 거쳐야 한다 — `session/index.ts`(endSession)와
 * `roleplay/index.ts`(sendMessage의 limit_reached 분기)가 이 함수 하나를 공통으로 호출한다
 * (중복 로직 없이 단일 트리거 지점으로 배선, T8 태스크 지시).
 *
 * T9(이 태스크)이 실제 리포트 생성 로직(generateReportForSession — 마스킹 대화 로그를 규칙
 * 기반으로 분석해 deceivedMoments/tacticsUsed/preventionAdvice를 산출하고 `reports/{id}`를
 * write)을 채워, 위 `generateReport` 콜러블과 공통으로 호출하도록 연결했다. 실패해도 세션 종료
 * 자체를 막지 않도록 에러는 여기서 흡수한다 — 리포트 생성은 endSession/sendMessage 응답의
 * `reportPending: true`가 이미 클라에 알리는 비동기·재시도 가능 영역이기 때문이다(API.md
 * `endSession` Errors 절 참고). 클라가 `reports/{sid}` 문서를 직접 구독하면 이 트리거가 write를
 * 먼저 끝내든, 클라가 `generateReport`를 직접 호출해 같은 결과를 받든 상관없다(멱등,
 * generateReportCore.ts의 reportId 존재 확인 참고).
 */
export async function triggerReportGeneration(sessionId: string): Promise<void> {
  try {
    // endSession/sendMessage(limit_reached) 호출부가 이미 세션 소유권을 검증한 뒤에만 이 함수를
    // 부르므로, 여기서 다시 request.auth와 대조할 필요가 없다 — generateReportForSession은
    // 소유권 검증 없이 세션 존재·종료 상태만 확인한다(generateReportCore.ts 참고).
    const { reportId } = await generateReportForSession(sessionId);
    logger.info("리포트 생성 트리거됨 — 리포트 생성 완료", { sessionId, reportId });
  } catch (err) {
    logger.error("리포트 생성 트리거 처리 중 오류", { sessionId, err });
  }
}
