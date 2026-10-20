// UX-025 목소리 선택 경로의 서버 강제 — Architecture §87 · PRD AC-046 갱신 고지(v1.29) · UX D-130 · DECISIONS #198.
//
// `createSession`은 **자가 훈련 세션만** 만든다(챌린지 수신자 세션은 consentChallenge가 만든다 —
// session/index.ts `isEscalationCapable` 주석). 자가 훈련에서 통화 상대(사기범)가 **참가자 본인 목소리**로
// 말하는 것은 훈련 의미가 없으므로(사용자 신고 2026-10-20), 클론 경로(`recorded` · `reused`)를 거부한다.
// 화면(UX-025)도 self 모드에서 두 경로를 그리지 않는다 — 이 함수는 그 2중 방어의 서버 층이다.
//
// ⛔ 호출 위치가 설계다: 인증 · 시나리오 존재 확인 직후, 어떤 Firestore · LLM · 음성 호출보다 앞.
// `__tests__/voiceSelectionAllowance.test.ts`가 순서를 소스 스캔으로 고정한다.
import { HttpsError } from "firebase-functions/v2/https";

/** 화면이 일반 오류와 구분하는 사유 코드(`HttpsError.details.reason`). */
export const SELF_CLONE_VOICE_NOT_ALLOWED_REASON = "self-clone-voice-not-allowed";

/** 자가 세션 생성(`createSession`)에서 이 `voiceSelectionSource` 원값을 받아도 되는가. 부재 · 기본 목소리만 허용. */
export function isVoiceSelectionSourceAllowed(rawVoiceSelectionSource: unknown): boolean {
  return rawVoiceSelectionSource !== "recorded" && rawVoiceSelectionSource !== "reused";
}

/** 허용되지 않으면 `failed-precondition` + `{ reason: "self-clone-voice-not-allowed" }`로 거부한다. */
export function assertVoiceSelectionSourceAllowed(rawVoiceSelectionSource: unknown): void {
  if (isVoiceSelectionSourceAllowed(rawVoiceSelectionSource)) return;
  throw new HttpsError("failed-precondition", "본인 체험에서는 내 목소리를 통화 목소리로 쓸 수 없습니다.", {
    reason: SELF_CLONE_VOICE_NOT_ALLOWED_REASON,
  });
}
