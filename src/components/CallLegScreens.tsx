"use client";

// §142(카드사 고급 재구성 PR-2) — 다통화 변형의 통화 사이 화면(전화 앱 다이얼 · 연결 중 · 다시 걸려 온 전화 · 진짜 기관 자동 안내).
// 흐름 판정은 `src/lib/callLegs/legTransition.ts`(순수) · 다음 통화 판정은 서버 `startCallLeg`가 한다 — 이 파일은 그리기만 한다.
//
// | 화면 | 구성(실제 휴대폰 전화 앱 근사 — 배치는 기본 전화 앱 구성 기준 추정) |
// |---|---|
// | 다이얼 | 위 = 입력 번호(크게) · 탭 = 키패드 / 연락처 · 아래 = 초록 통화 버튼 · 지우기 |
// | 연결 중 | 상대 라벨 · "연결 중" / "통화 연결음" · 빨간 종료(누르면 훈련 종료) |
// | 다시 걸려 온 전화 | 상대 번호 · 받기 · 거절(거절 = 훈련 종료) |
// | 자동 안내 | 진짜 기관 자동 안내 문장(서버 번호부 값 그대로) · 통화 종료 |
// ⛔ 세션 중 화면이라 '모의' · '훈련용' 표식 문구 0(G437). ⛔ 실제 전화 발신 0(`tel:` 링크 0).
// z = 통화 셸 위 · 문자 배너 · 문자함(z-40) 아래 — 다이얼 중에도 문자 속 번호를 다시 볼 수 있다.
import { useState } from "react";
import PhoneIcon from "@/components/PhoneIcon";
import { LEG_GENUINE_COPY, formatDialDigits, digitsOf, type LegScreen } from "@/lib/callLegs/legTransition";

export type CallLegScreensProps = {
  screen: LegScreen;
  contacts: readonly { label: string; number: string }[];
  onKey: (key: string) => void;
  onBackspace: () => void;
  onSetDigits: (digits: string) => void;
  onDial: () => void;
  onAnswer: () => void;
  /** 다이얼 · 연결 중 · 수신 거절 · 자동 안내 종료 — 훈련을 끝낸다. */
  onEndTraining: () => void;
  /** 문자함 열기(다이얼 화면에서 문자 속 번호를 다시 볼 수 있게). 부재 = 버튼 0. */
  onOpenSms?: () => void;
  dialing: boolean;
};

const KEYS: readonly { key: string; sub?: string }[] = [
  { key: "1" },
  { key: "2", sub: "ABC" },
  { key: "3", sub: "DEF" },
  { key: "4", sub: "GHI" },
  { key: "5", sub: "JKL" },
  { key: "6", sub: "MNO" },
  { key: "7", sub: "PQRS" },
  { key: "8", sub: "TUV" },
  { key: "9", sub: "WXYZ" },
  { key: "*" },
  { key: "0", sub: "+" },
  { key: "#" },
];

const SHELL = "fixed inset-0 z-[35] flex flex-col bg-[#101418] text-white";

function RoundButton({
  label,
  color,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  color: string;
  icon: "call" | "end";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[68px] w-[68px] items-center justify-center rounded-full disabled:opacity-50"
      style={{ backgroundColor: color }}
    >
      <PhoneIcon name={icon === "call" ? "accept-call" : "end-call"} size={30} />
    </button>
  );
}

export default function CallLegScreens(props: CallLegScreensProps) {
  const { screen } = props;
  const [tab, setTab] = useState<"keypad" | "contacts">("keypad");
  if (screen.kind === "none") return null;

  if (screen.kind === "connecting" || screen.kind === "incoming") {
    const incoming = screen.kind === "incoming";
    return (
      <div className={SHELL} role="dialog" aria-modal="true" aria-label={incoming ? "전화 수신" : "통화 연결"}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <p className="text-[30px] font-semibold tracking-tight">{screen.label}</p>
          <p className="text-base text-white/70" role="status">
            {incoming ? "휴대전화" : screen.via === "transfer" ? "통화를 연결하고 있습니다" : "발신 중…"}
          </p>
        </div>
        <div className="flex justify-center gap-16 pb-[max(40px,env(safe-area-inset-bottom))]">
          {incoming ? (
            <>
              <RoundButton label="거절" color="#E5484D" icon="end" onClick={props.onEndTraining} />
              <RoundButton label="받기" color="#2FB55D" icon="call" onClick={props.onAnswer} />
            </>
          ) : (
            <RoundButton label="통화 종료" color="#E5484D" icon="end" onClick={props.onEndTraining} />
          )}
        </div>
      </div>
    );
  }

  if (screen.kind === "genuine") {
    return (
      <div className={SHELL} role="dialog" aria-modal="true" aria-label="통화 중">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="flex flex-col items-center gap-1">
            <p className="text-[26px] font-semibold">{screen.contactLabel ?? screen.number}</p>
            {screen.contactLabel && <p className="text-base text-white/70">{screen.number}</p>}
          </div>
          <div className="flex max-w-sm flex-col gap-2 text-[17px] leading-relaxed text-white/90" role="status">
            {screen.notice.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          {/* 실기기 신고 F4 — 공식 번호로 직접 확인한 끝 = 방어 성공(그냥 끝난 것이 아니다). */}
          <div className="max-w-sm rounded-2xl bg-[#2FB55D]/15 px-4 py-3 text-left">
            <p className="text-[16px] font-semibold text-[#7BE39C]">{LEG_GENUINE_COPY.defenseTitle}</p>
            <p className="mt-1 text-[15px] leading-relaxed text-white/85">{LEG_GENUINE_COPY.defenseBody}</p>
          </div>
        </div>
        <div className="flex justify-center pb-[max(40px,env(safe-area-inset-bottom))]">
          <RoundButton label={LEG_GENUINE_COPY.endButton} color="#E5484D" icon="end" onClick={props.onEndTraining} />
        </div>
      </div>
    );
  }

  // 다이얼
  const display = formatDialDigits(screen.digits);
  return (
    <div className={SHELL} role="dialog" aria-modal="true" aria-label="전화">
      <div className="flex min-h-[120px] flex-col items-center justify-end gap-2 px-6 pt-10">
        <p className="min-h-[44px] text-[36px] font-light tracking-wide" aria-live="polite">
          {display}
        </p>
        {screen.notice === "unknown_number" && (
          <p className="text-sm text-[#FF9C9C]" role="alert">
            {LEG_GENUINE_COPY.unknownNumber}
          </p>
        )}
      </div>
      <div className="mx-auto mt-2 flex gap-2 rounded-full bg-white/10 p-1 text-sm" role="tablist">
        {(["keypad", "contacts"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-full px-4 py-1.5 ${tab === value ? "bg-white text-[#101418]" : "text-white/80"}`}
          >
            {value === "keypad" ? "키패드" : "연락처"}
          </button>
        ))}
        {props.onOpenSms && (
          <button type="button" onClick={props.onOpenSms} className="rounded-full px-4 py-1.5 text-white/80">
            메시지
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center px-8">
        {tab === "keypad" ? (
          <div className="mx-auto grid w-full max-w-[300px] grid-cols-3 gap-x-6 gap-y-4">
            {KEYS.map(({ key, sub }) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                onClick={() => props.onKey(key)}
                className="flex h-[72px] w-[72px] flex-col items-center justify-center justify-self-center rounded-full bg-white/10 active:bg-white/25"
              >
                <span className="text-[30px] leading-none">{key}</span>
                {sub && <span className="mt-0.5 text-[10px] tracking-[0.15em] text-white/60">{sub}</span>}
              </button>
            ))}
          </div>
        ) : (
          <ul className="mx-auto flex w-full max-w-sm flex-col divide-y divide-white/10">
            {props.contacts.map((contact) => (
              <li key={contact.number}>
                <button
                  type="button"
                  onClick={() => {
                    props.onSetDigits(digitsOf(contact.number));
                    setTab("keypad");
                  }}
                  className="flex w-full flex-col items-start py-3 text-left"
                >
                  <span className="text-[17px]">{contact.label}</span>
                  <span className="text-sm text-white/60">{contact.number}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="relative flex items-center justify-center pb-[max(32px,env(safe-area-inset-bottom))]">
        <RoundButton label="통화" color="#2FB55D" icon="call" onClick={props.onDial} disabled={props.dialing || screen.digits.length === 0} />
        {screen.digits.length > 0 && (
          <button
            type="button"
            aria-label="지우기"
            onClick={props.onBackspace}
            className="absolute right-[calc(50%-120px)] top-[18px] px-3 py-2 text-white/80"
          >
            ⌫
          </button>
        )}
        <button
          type="button"
          onClick={props.onEndTraining}
          className="absolute left-4 top-[22px] text-sm text-white/60"
        >
          훈련 종료
        </button>
      </div>
    </div>
  );
}
