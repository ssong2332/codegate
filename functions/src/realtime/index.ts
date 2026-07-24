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
import type { VoiceMode } from "../scenarios/publicMeta";
import type { ChallengeDoc, SessionDoc, VoiceSelectionSource } from "../shared/types";
import { getRealtimeProvider } from "./provider";
import type { CreateRealtimeCallRequest, CreateRealtimeCallResponse } from "./callTypes";

/**
 * 에스컬레이션된 세션(§13.6 통합 버그 수정)의 "유효 voiceMode" 유추 — session.voiceSelectionSource가
 * 있으면(메신저→보이스 전이 세션) 그 값으로부터 유추하고, 없으면(기존 순수 보이스 세션) undefined를
 * 반환해 getRealtimeProvider가 PUBLIC_SCENARIOS[scenarioId]?.voiceMode를 그대로 쓰게 한다.
 */
export function resolveEffectiveVoiceMode(
  voiceSelectionSource: VoiceSelectionSource | undefined,
): VoiceMode | undefined {
  if (!voiceSelectionSource) return undefined;
  if (voiceSelectionSource === "recorded" || voiceSelectionSource === "reused") return "clone";
  return "generic"; // fallback_male | fallback_female
}

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

  // T37·§14.7/ADR-0006(A1) — challenge 바운드 세션(session.challengeId 존재)은 session.voiceId를
  // 절대 저장하지 않는다(유출·onSessionEnded 폐기 격리, 파일 상단 근거는 challenge/userAccess.ts
  // 헤더 주석 참고). 여기서 challenges/{challengeId}를 admin read로 해석하고, 동시에 §14.2 발급
  // 게이트(status∈{consented,in_progress}+미만료)를 **재검증**한다 — consentChallenge 시점 이후
  // 시간이 지났으므로(신고·만료 등) 다시 확인해야 안전하다. 이 재검증 실패는 API.md Errors 표가
  // 명시한 throw 대상("challenge 만료/미동의")이라 provider 발급 실패의 isMock 폴백과 달리 그대로
  // 던진다 — 조용히 빈 voiceId로 넘어가지 않는다.
  let effectiveVoiceId = session.voiceId ?? "";
  if (session.challengeId) {
    const challengeSnap = await db.collection("challenges").doc(session.challengeId).get();
    const challenge = challengeSnap.data() as ChallengeDoc | undefined;
    const statusOk = challenge?.status === "consented" || challenge?.status === "in_progress";
    const notExpired = challenge ? challenge.linkExpiresAt.toMillis() > Date.now() : false;
    if (!challenge || !statusOk || !notExpired) {
      throw new HttpsError(
        "failed-precondition",
        "챌린지가 만료되었거나 더 이상 진행할 수 없습니다.",
      );
    }
    effectiveVoiceId = challenge.voiceId;
  }

  const effectiveVoiceMode = resolveEffectiveVoiceMode(session.voiceSelectionSource);
  const provider = getRealtimeProvider(session.scenarioId, effectiveVoiceMode);
  try {
    const credentials = await provider.createCallCredentials({
      sessionId,
      scenarioId: session.scenarioId,
      voiceId: effectiveVoiceId,
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
      voiceId: effectiveVoiceId,
      language: "ko",
      isMock: true,
    };
  }
});
