"use client";

// §144(DECISIONS #257) 저장한 목소리 목록 — 챌린지 만들기(UX-019 '보낼 목소리' · 고르기)와 '내 정보' 허브(/me · 사용처 수)가 같이 쓴다.
// 삭제 확인 문구는 여기 한 곳(녹음 즉시 삭제 + 이 목소리로 만든 챌린지 링크도 사라짐 — DECISIONS #257 Q4).
import { daysLeftLabel, type VoiceProfileSummary } from "@/lib/voices/voiceProfileConsent";

export function confirmVoiceProfileDelete(label: string): boolean {
  return window.confirm(
    `「${label}」 목소리를 지울까요? 녹음이 바로 지워지고, 이 목소리로 만든 챌린지 링크도 함께 사라집니다.`,
  );
}

type Props = {
  profiles: readonly VoiceProfileSummary[];
  nowMs: number;
  onDelete: (profile: VoiceProfileSummary) => void;
  deletingId: string | null;
  disabled?: boolean;
  /** 있으면 라디오로 고른다(만들기 화면). */
  select?: { selectedId: string | null; onSelect: (profileId: string) => void };
  /** 있으면 "챌린지 N개"를 함께 보인다(허브). */
  usage?: Readonly<Record<string, number>>;
};

export default function VoiceProfileList({ profiles, nowMs, onDelete, deletingId, disabled, select, usage }: Props) {
  return (
    <>
      {profiles.map((profile) => {
        const meta = [
          daysLeftLabel(profile.retentionDeleteAtMs, nowMs),
          ...(usage ? [`챌린지 ${usage[profile.profileId] ?? 0}개`] : []),
        ].join(" · ");
        const text = (
          <span className="flex flex-col">
            <span className="text-[17px] font-semibold text-ink">{profile.label}</span>
            <span className="text-sm text-ink-sub">{meta}</span>
          </span>
        );
        return (
          <div
            key={profile.profileId}
            className="flex items-center gap-3 rounded-[8px] border-[1.5px] border-line-strong bg-white px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-tint"
          >
            {select ? (
              <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name="voice-profile"
                  value={profile.profileId}
                  checked={select.selectedId === profile.profileId}
                  onChange={() => select.onSelect(profile.profileId)}
                  disabled={disabled}
                  className="h-5 w-5 accent-brand"
                />
                {text}
              </label>
            ) : (
              <div className="flex min-h-[44px] flex-1 items-center">{text}</div>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirmVoiceProfileDelete(profile.label)) onDelete(profile);
              }}
              disabled={disabled || deletingId !== null}
              aria-label={`${profile.label} 삭제`}
              className="min-h-[44px] rounded-[8px] px-3 text-base font-semibold text-danger disabled:opacity-50"
            >
              {deletingId === profile.profileId ? "지우는 중" : "삭제"}
            </button>
          </div>
        );
      })}
    </>
  );
}
