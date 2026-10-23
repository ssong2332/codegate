"use client";

// §123(UX D-156 · 사용자 실기 신고 2026-10-23 원문 *"보이스톡 연결되는 과정의 웹사이트도 실제 카카오톡에서 제공하는 것과 동일하게
// 디자인하자"*) — 카톡형 보이스톡 발신 화면. 대화방(신호음 · 응답 없음 · 전환 요청 중)과 통화 화면(발신 덮개)이 같은 화면을 쓴다.
//
// 구성(실제 카톡 보이스톡 발신 화면 근사 — 배치는 앱 화면 구성 기준 추정, 색 · 크기는 `MESSENGER_CHAT_TOKENS.voiceTalk*` 추정값):
// | 자리 | 내용 |
// |---|---|
// | 바탕 | 전체 화면 · 어두운 세로 그라데이션(대화방이 비치지 않는다) |
// | 위 | 둥근 사각 프로필(자체 실루엣) · 이름(크게) · 상태 한 줄("보이스톡 연결 중…" 등) |
// | 아래 | 둥근 버튼 줄 — 스피커 · 마이크 끄기(누름 상태 = 흰 바탕) · 그 아래 빨간 종료 |
// ⛔ 카카오 로고 · 상표 이미지 0. ⛔ 세션 중 화면이라 '모의' · '훈련용' 표식 문구 0(G437 — 고지는 세션 전 화면이 맡는다).
// 버튼 상태를 넘기지 않으면(대화방 단계 — 통화 오디오가 아직 없다) 흐림 · 무반응으로 그린다.
import PhoneIcon from "@/components/PhoneIcon";
import { MESSENGER_CHAT_TOKENS } from "@/lib/phone/skinTokens";

type Toggle = { on: boolean; onToggle: () => void };

export type VoiceTalkDialScreenProps = {
  name: string;
  status: string;
  speaker?: Toggle;
  mute?: Toggle;
  /** 종료(취소). 없으면 흐림 · 무반응(전환 요청 중 · 응답 없음 안내). */
  onEnd?: () => void;
  endDisabled?: boolean;
};

const t = MESSENGER_CHAT_TOKENS;

function RoundToggle({ label, icon, toggle }: { label: string; icon: "speaker" | "mute"; toggle?: Toggle }) {
  const on = toggle?.on === true;
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={toggle?.onToggle}
        aria-label={label}
        aria-pressed={toggle ? on : undefined}
        aria-disabled={toggle ? undefined : true}
        className={`flex h-16 w-16 items-center justify-center rounded-full transition ${toggle ? "active:scale-95" : "opacity-50"}`}
        style={{ backgroundColor: on ? t.voiceTalkButtonOnBg : t.voiceTalkButtonBg, color: on ? t.voiceTalkButtonOnIcon : t.voiceTalkButtonIcon }}
      >
        <PhoneIcon name={icon} size={26} />
      </button>
      <span className="text-[13px]" style={{ color: t.voiceTalkLabel }}>
        {label}
      </span>
    </div>
  );
}

export default function VoiceTalkDialScreen({ name, status, speaker, mute, onEnd, endDisabled }: VoiceTalkDialScreenProps) {
  const endInactive = !onEnd || endDisabled === true;
  return (
    <div
      className="font-phone fixed inset-0 z-50 flex flex-col items-center justify-between px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(4.5rem,calc(env(safe-area-inset-top)+3rem))]"
      style={{ background: `linear-gradient(180deg, ${t.voiceTalkBgTop} 0%, ${t.voiceTalkBgBottom} 100%)` }}
    >
      <div className="flex flex-col items-center">
        <span
          aria-hidden="true"
          className="flex h-[104px] w-[104px] items-end justify-center overflow-hidden rounded-[40px]"
          style={{ backgroundColor: t.profileBg, color: t.profileFg }}
        >
          <PhoneIcon name="person" size={86} />
        </span>
        <p className="mt-5 text-[26px] font-semibold" style={{ color: t.voiceTalkName }}>
          {name}
        </p>
        <p role="status" aria-live="polite" className="mt-2 text-[15px]" style={{ color: t.voiceTalkStatus }}>
          {status}
        </p>
      </div>
      <div className="flex w-full flex-col items-center gap-10">
        <div className="flex items-start justify-center gap-14">
          <RoundToggle label="스피커" icon="speaker" toggle={speaker} />
          <RoundToggle label="마이크 끄기" icon="mute" toggle={mute} />
        </div>
        <button
          type="button"
          onClick={endInactive ? undefined : onEnd}
          disabled={endInactive}
          aria-label="보이스톡 취소"
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full transition active:scale-95 disabled:opacity-60"
          style={{ backgroundColor: t.voiceTalkEndBg, color: t.voiceTalkEndIcon }}
        >
          <PhoneIcon name="end-call" size={32} />
        </button>
      </div>
    </div>
  );
}
