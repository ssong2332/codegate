// 목소리 프로필 — 순수 판정(Architecture.md §144 · DECISIONS #257). 부수효과는 voiceProfiles.ts가 배선한다.
//
// 프로필 = 사용자가 이름 붙여 보관한 **원본 녹음 사본** 하나(클론 voiceId는 갖지 않는다). 챌린지마다
// 종전대로 이 녹음으로 새 클론을 만든다 → 챌린지 스코프 고정(AC-041 · ADR-0005)이 그대로다.
// 문서 `users/{uid}/voices/{profileId}` · 녹음 `users/{uid}/voiceProfiles/{profileId}/voice_input.webm`
// (Storage 규칙상 기본 거부 경로 = 서버 전용 · 다운로드 경로 없음).

export const VOICE_PROFILE_CAP = 3;
export const VOICE_PROFILE_RETENTION_DAYS = [7, 30] as const;
export type VoiceProfileRetentionDays = (typeof VOICE_PROFILE_RETENTION_DAYS)[number];
export const VOICE_PROFILE_LABEL_MAX_LENGTH = 20;
/** 보관 동의 문구 버전 — 클라 `src/lib/voices/voiceProfileConsent.ts`와 같은 값이어야 한다(시험이 대조). */
export const VOICE_PROFILE_CONSENT_VERSION = "voice-profile-v1";
export const VOICE_PROFILE_CAP_REASON = "voice_profile_cap";
export const VOICE_PROFILE_REQUIRED_REASON = "voice_profile_required";

const DAY_MS = 24 * 60 * 60 * 1000;

export function voiceProfileRecordingPath(uid: string, profileId: string): string {
  return `users/${uid}/voiceProfiles/${profileId}/voice_input.webm`;
}

export function voiceProfileStoragePrefix(uid: string, profileId: string): string {
  return `users/${uid}/voiceProfiles/${profileId}/`;
}

export function retentionDeleteAtMs(nowMs: number, days: VoiceProfileRetentionDays): number {
  return nowMs + days * DAY_MS;
}

// 판정표 VS1 — 입력 형식(어떤 읽기보다 앞).
export type SaveInputCheck =
  | { ok: true; label: string; retentionDays: VoiceProfileRetentionDays }
  | { ok: false; message: string };

export function checkSaveInput(input: {
  label: unknown;
  retentionDays: unknown;
  consented: unknown;
  consentTextVersion: unknown;
}): SaveInputCheck {
  if (input.consented !== true || input.consentTextVersion !== VOICE_PROFILE_CONSENT_VERSION) {
    return { ok: false, message: "목소리 보관 동의가 필요합니다." };
  }
  if (!VOICE_PROFILE_RETENTION_DAYS.includes(input.retentionDays as VoiceProfileRetentionDays)) {
    return { ok: false, message: "보관 기간은 7일 또는 30일입니다." };
  }
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label || label.length > VOICE_PROFILE_LABEL_MAX_LENGTH) {
    return { ok: false, message: `목소리 이름은 1~${VOICE_PROFILE_LABEL_MAX_LENGTH}자로 적어 주세요.` };
  }
  return { ok: true, label, retentionDays: input.retentionDays as VoiceProfileRetentionDays };
}

// 판정표 VS2 — 저장할 사전 세션. 보내기 녹음은 시나리오 선택 전 사전 세션(status "created")에만 있다.
export function checkSourceSession(
  session: { uid?: string; status?: string; cloneStatus?: string } | undefined,
  uid: string,
): string | null {
  if (!session || session.uid !== uid) return "본인 녹음이 아닙니다.";
  if (session.status !== "created") return "이미 시작한 훈련의 녹음은 저장할 수 없습니다.";
  if (session.cloneStatus !== "ready") return "목소리 준비가 끝난 뒤 저장할 수 있습니다.";
  return null;
}

// 판정표 VS3 — 살아 있는(만료 전) 프로필만 센다. 만료됐지만 스캐너가 아직 안 지운 것은 자리를 잡지 않는다.
export function liveProfileCount(retentionDeleteAtMsList: readonly number[], nowMs: number): number {
  return retentionDeleteAtMsList.filter((ms) => ms > nowMs).length;
}

// 판정표 VU1 — 챌린지에 쓸 프로필. null = 사용 가능.
export function checkProfileForChallenge(
  profile: { retentionDeleteAtMs: number } | undefined,
  nowMs: number,
): string | null {
  if (!profile) return "보낼 목소리를 골라 주세요.";
  if (profile.retentionDeleteAtMs <= nowMs) return "보관 기간이 끝난 목소리입니다. 새로 녹음해 주세요.";
  return null;
}

// 판정표 VD2 — 프로필과 함께 지울 챌린지(이미 지운 것 제외).
export function selectChallengesForProfile(
  challenges: readonly { id: string; status: string }[],
): string[] {
  return challenges.filter((c) => c.status !== "deleted").map((c) => c.id);
}
