// 목소리 프로필 — 화면 쪽 순수 판정 · 문구 · 탭 힌트(Architecture.md §144 · UX-019 v1.x · DECISIONS #257).
// 서버 짝 = functions/src/challenge/voiceProfileRules.ts(동의 버전 · 상한 · 기간 · 이름 길이 같은 값 — 서버 시험이 대조).
// ⛔ firebase 등 브라우저 의존 import 금지 — node 시험 러너가 그대로 읽는다.

export const VOICE_PROFILE_CONSENT_VERSION = "voice-profile-v1";
export const VOICE_PROFILE_CAP = 3;
export const VOICE_PROFILE_LABEL_MAX_LENGTH = 20;
export const VOICE_PROFILE_RETENTION_OPTIONS = [7, 30] as const;
export type VoiceProfileRetentionDays = (typeof VOICE_PROFILE_RETENTION_OPTIONS)[number];
export const VOICE_PROFILE_DEFAULT_RETENTION: VoiceProfileRetentionDays = 30;

/** 보관 동의 문구(이 문구를 바꾸면 버전을 올린다 — 서버 상수도 함께). */
export function voiceProfileConsentText(days: VoiceProfileRetentionDays): string {
  return `이 녹음을 ${days}일 동안 보관하고, 지인에게 보내는 챌린지에만 씁니다. 기간이 끝나면 자동으로 지워지고, 언제든 직접 지울 수 있습니다. 지우면 이 목소리로 만든 챌린지 링크도 함께 사라집니다.`;
}

export type VoiceProfileSummary = { profileId: string; label: string; retentionDeleteAtMs: number };

// 판정표 VI — 만들기 화면 '보낼 목소리' 칸.
export type VoiceSlotView = {
  /** 만료 전 프로필만(만료됐지만 스캐너가 아직 안 지운 것은 숨긴다 — 서버도 거절한다). */
  profiles: VoiceProfileSummary[];
  canRecordNew: boolean;
  /** 고른 목소리(없거나 목록에 없으면 null — "챌린지 만들기" 비활성). */
  selectedId: string | null;
};

export function resolveVoiceSlot(
  all: readonly VoiceProfileSummary[],
  wantedId: string | null,
  nowMs: number,
): VoiceSlotView {
  const profiles = all.filter((p) => p.retentionDeleteAtMs > nowMs);
  const selectedId = wantedId && profiles.some((p) => p.profileId === wantedId) ? wantedId : null;
  return { profiles, canRecordNew: profiles.length < VOICE_PROFILE_CAP, selectedId };
}

/** "N일 뒤 삭제" — 하루 미만 남으면 "오늘 삭제". */
export function daysLeftLabel(retentionDeleteAtMs: number, nowMs: number): string {
  const days = Math.floor((retentionDeleteAtMs - nowMs) / (24 * 60 * 60 * 1000));
  return days < 1 ? "오늘 삭제" : `${days}일 뒤 삭제`;
}

// --- 녹음 화면 → clone/wait 저장 값(탭 범위 sessionStorage) ---
export type PendingVoiceProfileSave = { label: string; retentionDays: VoiceProfileRetentionDays };
const PENDING_SAVE_KEY = "voiceProfile.pendingSave";

export function setPendingVoiceProfileSave(value: PendingVoiceProfileSave): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(value));
}

export function readPendingVoiceProfileSave(raw: string | null): PendingVoiceProfileSave | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingVoiceProfileSave>;
    const label = typeof v.label === "string" ? v.label.trim() : "";
    if (!label || label.length > VOICE_PROFILE_LABEL_MAX_LENGTH) return null;
    if (!VOICE_PROFILE_RETENTION_OPTIONS.includes(v.retentionDays as VoiceProfileRetentionDays)) return null;
    return { label, retentionDays: v.retentionDays as VoiceProfileRetentionDays };
  } catch {
    return null;
  }
}

export function peekPendingVoiceProfileSave(): PendingVoiceProfileSave | null {
  if (typeof window === "undefined") return null;
  return readPendingVoiceProfileSave(window.sessionStorage.getItem(PENDING_SAVE_KEY));
}

export function clearPendingVoiceProfileSave(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PENDING_SAVE_KEY);
}

/** '내 정보' 허브(§144) — 목소리별 사용처 수. 사용자가 지운(deleted) 챌린지는 세지 않는다. */
export function voiceUsageCounts(
  challenges: readonly { voiceProfileId?: string | null; status: string }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of challenges) {
    if (!c.voiceProfileId || c.status === "deleted") continue;
    counts[c.voiceProfileId] = (counts[c.voiceProfileId] ?? 0) + 1;
  }
  return counts;
}
