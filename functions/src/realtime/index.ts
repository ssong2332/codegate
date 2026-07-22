// 실시간 음성 통화 자격증명 발급 콜러블 (2026-07-22, UX-014 live phase).
//
// 클라(브라우저)가 ElevenLabs Agents와 직접 WebSocket으로 speech-to-speech 대화를 하되, API 키는
// 절대 클라로 내려보내지 않기 위해 **서버가 짧은 수명의 서명 URL만 발급**한다.
//
// 소유권/상태 검증은 sendMessage·endSession과 동일한 패턴을 따른다(본인 세션 + active 상태).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { ensureFirebaseAdminApp } from "../firebaseAdmin";
import { ELEVENLABS_API_KEY, GEMINI_API_KEY } from "../shared/config";
import type { SessionDoc } from "../shared/types";
import { getRealtimeProvider } from "./provider";
import type { CreateRealtimeCallRequest, CreateRealtimeCallResponse } from "./callTypes";

ensureFirebaseAdminApp();

export const createRealtimeCall = onCall<
  CreateRealtimeCallRequest,
  Promise<CreateRealtimeCallResponse>
>({ secrets: [ELEVENLABS_API_KEY, GEMINI_API_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const { sessionId } = request.data ?? {};
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "sessionId가 필요합니다.");
  }

  const db = getFirestore();
  const sessionSnap = await db.collection("sessions").doc(sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError("failed-precondition", "존재하지 않는 세션입니다.");
  }
  const session = sessionSnap.data() as SessionDoc;
  if (session.uid !== request.auth.uid) {
    throw new HttpsError("permission-denied", "본인 세션이 아닙니다.");
  }
  if (session.status !== "active") {
    throw new HttpsError("failed-precondition", "이미 종료되었거나 활성 상태가 아닌 세션입니다.");
  }

  const provider = getRealtimeProvider(session.scenarioId);
  try {
    const credentials = await provider.createCallCredentials({
      sessionId,
      scenarioId: session.scenarioId,
      voiceId: session.voiceId ?? "",
    });
    return credentials;
  } catch {
    // 자격증명 발급 실패가 통화 자체를 막지 않도록, 목업(텍스트 폴백)으로 강등해 돌려준다
    // (P-4 핵심 루프 비차단). 클라는 isMock을 보고 폴백 UI를 띄운다 — 조용히 실패하지 않는다.
    return {
      provider: "none",
      signedUrl: "",
      geminiToken: "",
      geminiModel: "",
      voiceId: session.voiceId ?? "",
      language: "ko",
      isMock: true,
    };
  }
});
