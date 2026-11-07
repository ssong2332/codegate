"use client";

// §142(카드사 고급 재구성 PR-2) — 다통화 변형의 통화 사이 화면(전화 앱 · 발신 중 · 다시 걸려 온 전화 · 진짜 기관 자동 안내).
// 흐름 판정은 `src/lib/callLegs/legTransition.ts` · 전화 앱 내용은 `src/lib/callLegs/phoneApp.ts`(순수) · 다음 통화 판정은 서버 `startCallLeg`가 한다
// — 이 파일은 그리기만 한다.
//
// 2026-11-07 실기기 신고(R1) — "넘어간 화면도 실제 통화앱과 다르니까 이질감" · "통화를 걸었을 때도 효과음은 나지만 검은 화면" →
// 모든 화면을 참가자 기기 스킨(`deviceSkin` — One UI 9 / iOS 26 / 기본)으로 그린다. 배치는 공개 화면 기억 근사(실기 측정 전 — 추정).
// | 화면 | 구성 |
// |---|---|
// | 전화 앱(`dialer`) | 판 = 키패드 · 최근 기록(아래 탭) · 맨 아래 시스템 탐색(One UI = 최근 앱 · 홈 · 뒤로 / iOS = 홈 막대) · 오른쪽 위 훈련 종료 |
// | 홈 화면(`view: home`) | 시계 · 앱 3개(전화 · 메시지 · 인터넷) |
// | 인터넷 검색(`view: search`) | 검색칸 · 추천어 · 결과(공식 번호 — 누르면 키패드에 채움) |
// | 지갑(`view: wallet`) | 내 카드 뒷면(서명란 · 고객센터 번호 — 누르면 키패드에 채움) · 앞면 보기. 2026-11-07 사용자 결정 "내 카드 뒷면 화면" · CVC 0 |
// | 발신 중(`connecting`) | 통화 화면과 같은 바탕 · 배치(번호 · "발신 중…" · 흐린 버튼 묶음 · 종료 원). 종료 = 그 발신만 끊기 |
// | 넘김 대기(`holding`) | **그리지 않는다** — 통화 화면이 그대로 보이고 대기음만 들린다(2026-11-07 "검은 화면은 몰입감을 깬다") |
// | 다시 걸려 온 전화(`incoming`) | 수신 벨과 같은 바탕 · 받기 / 거절(거절 = 그 전화만 거절 — 훈련 계속) |
// | 자동 안내(`genuine`) | 통화 화면 바탕 · 진짜 기관 자동 안내(서버 번호부 값 그대로) · 방어 성공 안내 · 종료 = 훈련 종료 |
// ⛔ 세션 중 화면이라 '모의' · '훈련용' 표식 문구 0(G437). ⛔ 실제 전화 발신 0(`tel:` 링크 0). ⛔ 기관 번호 연락처 미리 저장 0.
// z = 통화 셸 위 · 문자 배너 · 문자함(z-40) 아래 — 다이얼 중에도 문자 속 번호를 다시 볼 수 있다.
import { useEffect, useState } from "react";
import PhoneIcon, { type PhoneIconName } from "@/components/PhoneIcon";
import { LEG_GENUINE_COPY, formatDialDigits, type LegScreen, type PhoneView } from "@/lib/callLegs/legTransition";
import {
  dialableDigits,
  formatRecentTime,
  myCardBack,
  recentSubtitle,
  searchOfficialListings,
  searchSuggestions,
  type RecentEntry,
} from "@/lib/callLegs/phoneApp";
import type { DeviceSkin } from "@/lib/phone/deviceSkin";
import { oneUi9CallerSubtitle } from "@/lib/phone/oneUi9Call";
import { callTokensFor, ringBackground, type CallSkinTokens } from "@/lib/phone/skinTokens";

export type CallLegScreensProps = {
  screen: LegScreen;
  /** 참가자 기기 스킨(통화 화면과 같은 값 — 한 세션 = 한 스킨). */
  skin: DeviceSkin;
  /** 공식 번호 검색 결과의 시나리오. */
  scenarioId: string;
  /** 최근 기록(이번 세션 통화 + 문자 온 번호 — `buildRecents`). */
  recents: readonly RecentEntry[];
  onKey: (key: string) => void;
  onBackspace: () => void;
  onSetDigits: (digits: string) => void;
  onView: (view: PhoneView) => void;
  onDial: () => void;
  /** 최근 기록 한 줄 누름 = 그 번호로 바로 건다(iOS 최근 통화와 같은 동작). */
  onCallNumber: (digits: string) => void;
  onAnswer: () => void;
  /** 다시 걸려 온 전화 거절 — 그 전화만 거절(훈련 계속). */
  onDecline: () => void;
  /** 발신 중 종료 — 그 발신만 끊기(훈련 계속). */
  onCancelDial: () => void;
  /** 전화 앱 오른쪽 위 · 자동 안내 종료 — 훈련을 끝낸다. */
  onEndTraining: () => void;
  /** 문자 앱 열기(홈 화면 메시지). 부재 = 받은 문자 0 — 아이콘은 그대로 두고 빈 문자함 대신 아무 동작 0. */
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

/**
 * 전화 앱 · 홈 화면 색(기기 스킨별 — 추정 근사). 훈련 화면 테마는 라이트 고정(`deviceTheme.ts` — 사용자 결정 2026-10-21)이라 One UI · iOS 전화 앱은
 * 밝은 화면이다(통화 화면은 실기도 어둡다). 기본 스킨은 종전 어두운 화면.
 * 대비(추정 계산): 본문 글자 = 바탕 대비 15:1 이상 · 보조 글자 #5F6368 = 흰 바탕 6.0:1 · iOS 강조 #0A66D6 = 흰 바탕 5.4:1.
 */
type PhoneAppTheme = {
  layout: "oneui" | "ios";
  bg: string;
  text: string;
  sub: string;
  keyBg: string;
  keyPressed: string;
  divider: string;
  tint: string;
  call: string;
  callIcon: string;
  navBar: string;
  field: string;
  wallpaper: string;
};

function phoneAppTheme(skin: DeviceSkin): PhoneAppTheme {
  if (skin === "ios") {
    return {
      layout: "ios",
      bg: "#FFFFFF",
      text: "#000000",
      sub: "#5F6368",
      keyBg: "#E5E5EA",
      keyPressed: "#B9B9C0",
      divider: "rgba(60,60,67,0.18)",
      tint: "#0A66D6",
      call: "#1E8E3E",
      callIcon: "#FFFFFF",
      navBar: "#F7F7F8",
      field: "#EEEEF0",
      wallpaper: "linear-gradient(170deg, #2F4E7A 0%, #4F6E8F 45%, #A3B5C4 100%)",
    };
  }
  if (skin === "samsung") {
    return {
      layout: "oneui",
      bg: "#F6F6F8",
      text: "#111111",
      sub: "#5F6368",
      keyBg: "rgba(0,0,0,0)",
      keyPressed: "rgba(0,0,0,0.10)",
      divider: "rgba(0,0,0,0.10)",
      tint: "#1259C3",
      call: "#1E8E3E",
      callIcon: "#FFFFFF",
      navBar: "#F6F6F8",
      field: "#FFFFFF",
      wallpaper: "linear-gradient(165deg, #23324A 0%, #3E5470 50%, #8C9BB0 100%)",
    };
  }
  return {
    layout: "oneui",
    bg: "#101418",
    text: "#FFFFFF",
    sub: "#C9D4DB",
    keyBg: "rgba(255,255,255,0.10)",
    keyPressed: "rgba(255,255,255,0.25)",
    divider: "rgba(255,255,255,0.12)",
    tint: "#8AB4F8",
    call: "#1E8E3E",
    callIcon: "#FFFFFF",
    navBar: "#101418",
    field: "rgba(255,255,255,0.10)",
    wallpaper: "linear-gradient(165deg, #1A2430 0%, #2B3B4D 55%, #4A5C70 100%)",
  };
}

/** 통화 화면 같은 바탕(바깥 = 한 단계 어두운 단색 · 안 = 최대폭 430px 셸). */
function CallShell({
  tokens,
  background,
  label,
  children,
}: {
  tokens: CallSkinTokens;
  background: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="font-phone fixed inset-0 z-[35] flex justify-center"
      style={{ backgroundColor: tokens.outerBg }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="flex h-full w-full max-w-[430px] flex-col"
        style={{ background, color: tokens.textPrimary, paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}
      >
        {children}
      </div>
    </div>
  );
}

function RoundButton({
  label,
  color,
  iconColor,
  icon,
  onClick,
  disabled,
  size = 76,
}: {
  label: string;
  color: string;
  iconColor: string;
  icon: "call" | "end";
  onClick: () => void;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded-full shadow-lg transition active:scale-95 disabled:opacity-50"
      style={{ backgroundColor: color, color: iconColor, width: size, height: size }}
    >
      <PhoneIcon name={icon === "call" ? "accept-call" : "end-call"} size={32} />
    </button>
  );
}

/** 이름(번호) · 상태 줄 — 통화 화면과 같은 자리(One UI 9 = 상태 줄이 맨 위 · 그 밖 = 번호 아래). */
function CallHeader({ tokens, number, status }: { tokens: CallSkinTokens; number: string; status: string }) {
  const oneUi9 = tokens.controls === "oneui9";
  const subtitle = oneUi9 ? oneUi9CallerSubtitle(number) : null;
  return (
    <div className="flex flex-col items-center px-6 text-center" style={{ marginTop: oneUi9 ? 0 : 48 }}>
      {oneUi9 && (
        <p className="mb-7 min-h-[28px] text-[17px]" role="status">
          {status}
        </p>
      )}
      <p
        className={`max-w-full truncate leading-tight ${oneUi9 ? "font-bold tracking-tight" : "font-semibold"}`}
        style={{ fontSize: tokens.numberSizePx }}
      >
        {number}
      </p>
      {subtitle && <p className="mt-1 text-[16px] opacity-90">{subtitle}</p>}
      {!oneUi9 && (
        <p className="mt-1.5 min-h-[24px] text-[17px]" style={{ color: tokens.textSecondary }} role="status">
          {status}
        </p>
      )}
    </div>
  );
}

/** 발신 중에도 보이는 버튼 묶음(연결 전이라 누를 수 없다 — 실제 발신 화면도 묶음이 먼저 보인다). */
function DimmedControls({ tokens }: { tokens: CallSkinTokens }) {
  const items: { icon: PhoneIconName; label: string }[] =
    tokens.controls === "ios26"
      ? [
          { icon: "speaker", label: "스피커" },
          { icon: "video", label: "영상 통화" },
          { icon: "mute", label: "소리 끔" },
        ]
      : [
          { icon: "speaker", label: "스피커" },
          { icon: "keypad", label: "키패드" },
          { icon: "mute", label: "내 소리 차단" },
        ];
  const round = tokens.layout === "ios";
  return (
    <div className="mx-auto grid w-full max-w-[320px] grid-cols-3 justify-items-center gap-y-2 px-3" aria-hidden="true">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col items-center gap-1.5 opacity-50">
          <span
            className={`flex items-center justify-center ${round ? "h-[76px] w-[76px] rounded-full" : "h-[62px] w-[62px] rounded-[24px]"}`}
            style={{ backgroundColor: tokens.gridButtonBg === "rgba(255,255,255,0)" ? "rgba(255,255,255,0.10)" : tokens.gridButtonBg }}
          >
            <PhoneIcon name={item.icon} size={28} />
          </span>
          <span className="whitespace-nowrap text-[13px]">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function CallLegScreens(props: CallLegScreensProps) {
  const { screen } = props;
  if (screen.kind === "none" || screen.kind === "holding") return null;
  const tokens = callTokensFor(props.skin);
  const oneUi9 = tokens.controls === "oneui9";
  const endSize = oneUi9 ? 64 : 76;

  if (screen.kind === "connecting") {
    const status = screen.via === "transfer" ? "통화를 연결하고 있습니다" : "발신 중…";
    return (
      <CallShell tokens={tokens} background={tokens.shellGradient ?? tokens.bg} label="발신 중">
        <CallHeader tokens={tokens} number={screen.label} status={status} />
        <div className="flex-1" />
        <DimmedControls tokens={tokens} />
        <div className="mt-6 flex flex-col items-center gap-1.5" style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${oneUi9 ? 52 : 32}px)` }}>
          <RoundButton label="통화 종료" color={tokens.end} iconColor={tokens.roundIcon} icon="end" size={endSize} onClick={props.onCancelDial} />
          {!oneUi9 && <span className="text-sm">종료</span>}
        </div>
      </CallShell>
    );
  }

  if (screen.kind === "incoming") {
    const ios = tokens.layout === "ios";
    const decline = (
      <div className="flex flex-col items-center gap-2">
        <RoundButton label="전화 거절" color={tokens.end} iconColor={tokens.roundIcon} icon="end" onClick={props.onDecline} />
        <span className="text-[15px]">거절</span>
      </div>
    );
    const accept = (
      <div className="flex flex-col items-center gap-2">
        <RoundButton label="전화 받기" color={tokens.accept} iconColor={tokens.roundIcon} icon="call" onClick={props.onAnswer} />
        <span className="text-[15px]">{ios ? "응답" : "받기"}</span>
      </div>
    );
    return (
      <CallShell tokens={tokens} background={ringBackground(tokens)} label="전화 수신">
        <CallHeader tokens={tokens} number={screen.label} status="수신 전화" />
        <div className="flex-1" />
        <div className="flex justify-between px-12" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 56px)" }}>
          {/* 배치: iOS형 = 거절 왼쪽 · 응답 오른쪽 / One UI형 = 받기 왼쪽 · 거절 오른쪽(통화 벨 화면과 같은 좌우). */}
          {ios ? (
            <>
              {decline}
              {accept}
            </>
          ) : (
            <>
              {accept}
              {decline}
            </>
          )}
        </div>
      </CallShell>
    );
  }

  if (screen.kind === "genuine") {
    return (
      <CallShell tokens={tokens} background={tokens.shellGradient ?? tokens.bg} label="통화 중">
        <CallHeader tokens={tokens} number={screen.number} status="통화 중" />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="flex max-w-sm flex-col gap-2 text-[17px] leading-relaxed opacity-90" role="status">
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
        <div className="flex justify-center" style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${oneUi9 ? 52 : 32}px)` }}>
          <RoundButton
            label={LEG_GENUINE_COPY.endButton}
            color={tokens.end}
            iconColor={tokens.roundIcon}
            icon="end"
            size={endSize}
            onClick={props.onEndTraining}
          />
        </div>
      </CallShell>
    );
  }

  // 다이얼(전화 앱 · 홈 화면 · 인터넷 검색)
  return <PhoneApp {...props} screen={screen} />;
}

function PhoneApp(props: CallLegScreensProps & { screen: Extract<LegScreen, { kind: "dialer" }> }) {
  const { screen } = props;
  const theme = phoneAppTheme(props.skin);
  const view: PhoneView = screen.view ?? "keypad";
  const ios = theme.layout === "ios";

  const goBack = () => {
    if (view === "search" || view === "wallet") props.onView("home");
    else if (view === "home") props.onView("keypad");
    else props.onView("home");
  };

  return (
    <div
      className="font-phone fixed inset-0 z-[35] flex justify-center"
      style={{ backgroundColor: theme.bg }}
      role="dialog"
      aria-modal="true"
      aria-label={view === "home" ? "홈 화면" : view === "search" ? "인터넷" : view === "wallet" ? "지갑" : "전화"}
    >
      <div className="relative flex h-full w-full max-w-[430px] flex-col" style={{ color: theme.text }}>
        {view === "home" ? (
          <HomeScreen
            theme={theme}
            onOpenPhone={() => props.onView("keypad")}
            onOpenSms={props.onOpenSms}
            onOpenWeb={() => props.onView("search")}
            onOpenWallet={myCardBack(props.scenarioId) ? () => props.onView("wallet") : undefined}
          />
        ) : view === "wallet" && myCardBack(props.scenarioId) ? (
          <WalletScreen
            theme={theme}
            scenarioId={props.scenarioId}
            onBack={() => props.onView("home")}
            onPickNumber={(digits) => props.onSetDigits(digits)}
          />
        ) : view === "search" ? (
          <SearchScreen
            theme={theme}
            scenarioId={props.scenarioId}
            onBack={() => props.onView("home")}
            onPickNumber={(digits) => props.onSetDigits(digits)}
          />
        ) : (
          <>
            <div className="flex justify-end px-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}>
              <button
                type="button"
                onClick={props.onEndTraining}
                aria-label="훈련 종료"
                className="flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold"
                style={{ color: "#C6392F", backgroundColor: ios || props.skin === "samsung" ? "rgba(198,57,47,0.08)" : "rgba(255,255,255,0.92)" }}
              >
                <span aria-hidden="true" className="h-[10px] w-[10px] rounded-[2px]" style={{ backgroundColor: "#C6392F" }} />
                훈련 종료
              </button>
            </div>
            {view === "recents" ? (
              <RecentsPane theme={theme} recents={props.recents} onCallNumber={props.onCallNumber} dialing={props.dialing} />
            ) : (
              <KeypadPane {...props} theme={theme} />
            )}
            <PhoneTabs theme={theme} view={view} onView={props.onView} />
          </>
        )}
        <SystemNav theme={theme} onHome={() => props.onView("home")} onBack={goBack} />
      </div>
    </div>
  );
}

function KeypadPane(props: CallLegScreensProps & { screen: Extract<LegScreen, { kind: "dialer" }>; theme: PhoneAppTheme }) {
  const { screen, theme } = props;
  const ios = theme.layout === "ios";
  const display = formatDialDigits(screen.digits);
  return (
    <>
      <div className="flex min-h-[112px] flex-col items-center justify-end gap-2 px-6">
        <p className={`min-h-[48px] ${ios ? "text-[38px] font-normal" : "text-[36px] font-light"} tracking-wide`} aria-live="polite">
          {display}
        </p>
        {screen.notice === "unknown_number" && (
          <p className="text-sm" style={{ color: theme.layout === "ios" || props.skin === "samsung" ? "#B3261E" : "#FF9C9C" }} role="alert">
            {LEG_GENUINE_COPY.unknownNumber}
          </p>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center px-8">
        <div className={`mx-auto grid w-full max-w-[300px] grid-cols-3 ${ios ? "gap-x-6 gap-y-4" : "gap-x-4 gap-y-2"}`}>
          {KEYS.map(({ key, sub }) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              onClick={() => props.onKey(key)}
              className={`flex flex-col items-center justify-center justify-self-center ${ios ? "h-[78px] w-[78px] rounded-full" : "h-[68px] w-[88px] rounded-[22px]"}`}
              style={{ backgroundColor: theme.keyBg }}
              onPointerDown={(event) => (event.currentTarget.style.backgroundColor = theme.keyPressed)}
              onPointerUp={(event) => (event.currentTarget.style.backgroundColor = theme.keyBg)}
              onPointerLeave={(event) => (event.currentTarget.style.backgroundColor = theme.keyBg)}
            >
              <span className={`${ios ? "text-[34px] font-normal" : "text-[32px]"} leading-none`}>{key}</span>
              {sub && (
                <span className="mt-0.5 text-[10px] font-semibold tracking-[0.15em]" style={{ color: ios ? theme.text : theme.sub }}>
                  {sub}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="relative flex items-center justify-center pb-4 pt-2">
        <RoundButton
          label="통화"
          color={theme.call}
          iconColor={theme.callIcon}
          icon="call"
          size={ios ? 78 : 72}
          onClick={props.onDial}
          disabled={props.dialing || screen.digits.length === 0}
        />
        {screen.digits.length > 0 && (
          <button
            type="button"
            aria-label="지우기"
            onClick={props.onBackspace}
            className="absolute right-[calc(50%-128px)] flex h-12 w-12 items-center justify-center"
            style={{ color: theme.sub }}
          >
            <PhoneIcon name="backspace" size={26} />
          </button>
        )}
      </div>
    </>
  );
}

function RecentsPane({
  theme,
  recents,
  onCallNumber,
  dialing,
}: {
  theme: PhoneAppTheme;
  recents: readonly RecentEntry[];
  onCallNumber: (digits: string) => void;
  dialing: boolean;
}) {
  const ios = theme.layout === "ios";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className={`px-5 pb-2 pt-1 ${ios ? "text-[32px] font-bold" : "text-[30px] font-semibold"}`}>{ios ? "최근 통화" : "최근기록"}</h2>
      {recents.length === 0 ? (
        <p className="px-5 pt-6 text-[16px]" style={{ color: theme.sub }}>
          최근 기록이 없습니다
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2" aria-label="최근 기록">
          {recents.map((entry, index) => {
            const digits = dialableDigits(entry.number);
            const declined = entry.kind === "call" && entry.direction === "declined";
            const icon: PhoneIconName =
              entry.kind === "sms" ? "message" : entry.direction === "out" ? "arrow-out" : "arrow-in";
            return (
              <li key={`${entry.kind}-${entry.number}-${entry.atMs}-${index}`} style={{ borderBottom: `1px solid ${theme.divider}` }}>
                <button
                  type="button"
                  disabled={!digits || dialing}
                  onClick={() => digits && onCallNumber(digits)}
                  aria-label={`${entry.number} ${recentSubtitle(entry)} ${formatRecentTime(entry.atMs)} — 전화 걸기`}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left disabled:opacity-100"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: theme.field, color: theme.sub }}>
                    <PhoneIcon name={icon} size={20} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[17px]" style={{ color: declined ? "#B3261E" : theme.text }}>
                      {entry.number}
                    </span>
                    <span className="text-[14px]" style={{ color: theme.sub }}>
                      {recentSubtitle(entry)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[14px]" style={{ color: theme.sub }}>
                    {formatRecentTime(entry.atMs)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PhoneTabs({ theme, view, onView }: { theme: PhoneAppTheme; view: PhoneView; onView: (view: PhoneView) => void }) {
  const ios = theme.layout === "ios";
  const tabs: { view: PhoneView; label: string; icon: PhoneIconName }[] = [
    { view: "recents", label: ios ? "최근 통화" : "최근기록", icon: "clock" },
    { view: "keypad", label: "키패드", icon: "keypad" },
  ];
  return (
    <div
      className="flex justify-around px-6 pb-1 pt-2"
      role="tablist"
      style={{ backgroundColor: theme.navBar, borderTop: ios ? `1px solid ${theme.divider}` : undefined }}
    >
      {tabs.map((tab) => {
        const selected = view === tab.view;
        return (
          <button
            key={tab.view}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onView(tab.view)}
            className="flex min-h-[48px] min-w-[96px] flex-col items-center justify-center gap-0.5"
            style={{ color: selected ? (ios ? theme.tint : theme.text) : theme.sub }}
          >
            {ios && <PhoneIcon name={tab.icon} size={24} />}
            <span className={`${ios ? "text-[11px]" : "text-[15px]"} ${selected && !ios ? "font-bold" : "font-medium"}`}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 시스템 탐색 — One UI형 = 3버튼(최근 앱 · 홈 · 뒤로) / iOS형 = 홈 막대(누르면 홈). */
function SystemNav({ theme, onHome, onBack }: { theme: PhoneAppTheme; onHome: () => void; onBack: () => void }) {
  if (theme.layout === "ios") {
    return (
      <div className="flex justify-center pt-2" style={{ backgroundColor: "transparent", paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}>
        <button type="button" aria-label="홈" onClick={onHome} className="flex h-6 w-40 items-center justify-center">
          <span aria-hidden="true" className="h-[5px] w-[134px] rounded-full" style={{ backgroundColor: theme.text === "#FFFFFF" ? "#FFFFFF" : "#111111" }} />
        </button>
      </div>
    );
  }
  return (
    <div
      className="flex justify-around"
      style={{ backgroundColor: theme.navBar, color: theme.sub, paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <span aria-hidden="true" className="flex h-12 w-16 items-center justify-center opacity-70">
        <PhoneIcon name="nav-recents" size={22} />
      </span>
      <button type="button" aria-label="홈" onClick={onHome} className="flex h-12 w-16 items-center justify-center">
        <PhoneIcon name="nav-home" size={22} />
      </button>
      <button type="button" aria-label="뒤로" onClick={onBack} className="flex h-12 w-16 items-center justify-center">
        <PhoneIcon name="chevron-back" size={22} />
      </button>
    </div>
  );
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function HomeScreen({
  theme,
  onOpenPhone,
  onOpenSms,
  onOpenWeb,
  onOpenWallet,
}: {
  theme: PhoneAppTheme;
  onOpenPhone: () => void;
  onOpenSms?: () => void;
  onOpenWeb: () => void;
  /** 지갑(내 카드) — 부재 = 이 시나리오에 내 카드 0 → 아이콘 0. */
  onOpenWallet?: () => void;
}) {
  const clock = useClock();
  const apps: { label: string; icon: PhoneIconName; bg: string; onClick?: () => void }[] = [
    { label: "전화", icon: "accept-call", bg: "#1E8E3E", onClick: onOpenPhone },
    { label: "메시지", icon: "message", bg: theme.layout === "ios" ? "#1E8E3E" : "#1259C3", onClick: onOpenSms },
    { label: "인터넷", icon: "globe", bg: theme.layout === "ios" ? "#0A66D6" : "#5B3FD0", onClick: onOpenWeb },
  ];
  if (onOpenWallet) apps.push({ label: "지갑", icon: "card", bg: theme.layout === "ios" ? "#1C1C1E" : "#0F6E5C", onClick: onOpenWallet });
  return (
    <div className="flex min-h-0 flex-1 flex-col text-white" style={{ background: theme.wallpaper }}>
      <p className="pt-[calc(env(safe-area-inset-top)+56px)] text-center text-[64px] font-light leading-none tabular-nums" aria-label={`현재 시각 ${clock}`}>
        {clock}
      </p>
      <div className="flex-1" />
      <div className="mx-4 mb-4 flex justify-around rounded-[28px] bg-white/20 px-4 py-4 backdrop-blur-xl">
        {apps.map((app) => (
          <button
            key={app.label}
            type="button"
            onClick={app.onClick}
            aria-label={app.label}
            className="flex flex-col items-center gap-1.5"
          >
            <span className="flex h-[60px] w-[60px] items-center justify-center rounded-[18px] shadow" style={{ backgroundColor: app.bg }}>
              <PhoneIcon name={app.icon} size={30} />
            </span>
            <span className="text-[13px] drop-shadow">{app.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchScreen({
  theme,
  scenarioId,
  onBack,
  onPickNumber,
}: {
  theme: PhoneAppTheme;
  scenarioId: string;
  onBack: () => void;
  onPickNumber: (digits: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const suggestions = submitted === null ? searchSuggestions(scenarioId, typed) : [];
  const results = submitted === null ? [] : searchOfficialListings(scenarioId, submitted);
  const light = theme.text !== "#FFFFFF";
  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ backgroundColor: light ? "#FFFFFF" : theme.bg }}>
      <form
        className="flex items-center gap-2 px-3 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)", borderBottom: `1px solid ${theme.divider}` }}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(typed);
        }}
        role="search"
      >
        <button type="button" aria-label="뒤로" onClick={onBack} className="flex h-11 w-9 items-center justify-center" style={{ color: theme.sub }}>
          <PhoneIcon name="chevron-back" size={22} />
        </button>
        <label className="flex min-h-[44px] flex-1 items-center gap-2 rounded-full px-4" style={{ backgroundColor: light ? "#EEEEF0" : theme.field }}>
          <span style={{ color: theme.sub }}>
            <PhoneIcon name="search" size={18} />
          </span>
          <input
            type="search"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setSubmitted(null);
            }}
            placeholder="검색어를 입력하세요"
            aria-label="검색어"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none"
            style={{ color: theme.text }}
          />
        </label>
        <button type="submit" className="min-h-[44px] shrink-0 whitespace-nowrap px-2 text-[15px] font-semibold" style={{ color: theme.tint }}>
          검색
        </button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {suggestions.length > 0 && (
          <ul aria-label="추천 검색어">
            {suggestions.map((text) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => {
                    setTyped(text);
                    setSubmitted(text);
                  }}
                  className="flex min-h-[48px] w-full items-center gap-3 px-5 text-left text-[16px]"
                >
                  <span style={{ color: theme.sub }}>
                    <PhoneIcon name="search" size={16} />
                  </span>
                  {text}
                </button>
              </li>
            ))}
          </ul>
        )}
        {submitted !== null && results.length === 0 && (
          <p className="px-5 pt-8 text-center text-[16px]" style={{ color: theme.sub }}>
            {`'${submitted}'에 대한 검색 결과가 없습니다.`}
          </p>
        )}
        {results.length > 0 && (
          <ul className="flex flex-col gap-3 px-4 pt-4" aria-label="검색 결과">
            {results.map((listing) => (
              <li key={listing.number} className="rounded-2xl px-4 py-3" style={{ border: `1px solid ${theme.divider}` }}>
                <p className="text-[13px]" style={{ color: theme.sub }}>
                  공식 홈페이지
                </p>
                <p className="mt-0.5 text-[18px] font-semibold" style={{ color: light ? "#1A0DAB" : theme.tint }}>
                  {listing.title}
                </p>
                <p className="mt-1 text-[14px]" style={{ color: theme.sub }}>
                  {listing.snippet}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const digits = dialableDigits(listing.number);
                    if (digits) onPickNumber(digits);
                  }}
                  aria-label={`${listing.title} ${listing.number} 전화 앱에 번호 입력`}
                  className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[16px] font-semibold"
                  style={{ backgroundColor: light ? "#EEF3FD" : theme.field, color: light ? "#1259C3" : theme.tint }}
                >
                  <PhoneIcon name="accept-call" size={18} />
                  {listing.number}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * 지갑 — 내 카드(2026-11-07 사용자 결정 "내 카드 뒷면 화면"). 실제 카드 뒷면처럼 마그네틱 띠 · 서명란 · 고객센터 번호 · 안내 문구.
 * 고객센터 번호를 누르면 전화 앱 키패드에 채운다(검색 결과와 같은 동작 — 거는 것은 참가자). ⛔ CVC · 전체 카드 번호 0.
 */
function WalletScreen({
  theme,
  scenarioId,
  onBack,
  onPickNumber,
}: {
  theme: PhoneAppTheme;
  scenarioId: string;
  onBack: () => void;
  onPickNumber: (digits: string) => void;
}) {
  const [side, setSide] = useState<"back" | "front">("back");
  const card = myCardBack(scenarioId);
  if (!card) return null;
  const light = theme.text !== "#FFFFFF";
  const centerDigits = dialableDigits(card.centerNumber);
  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ backgroundColor: light ? "#F2F2F4" : theme.bg }}>
      <div className="flex items-center gap-2 px-3 pb-2" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <button type="button" aria-label="뒤로" onClick={onBack} className="flex h-11 w-9 items-center justify-center" style={{ color: theme.sub }}>
          <PhoneIcon name="chevron-back" size={22} />
        </button>
        <h2 className="text-[22px] font-bold">지갑</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <p className="mb-3 text-[15px]" style={{ color: theme.sub }}>
          {`${card.cardName} · ${card.last4}`}
        </p>
        {side === "back" ? (
          <section
            aria-label={`${card.cardName} 뒷면`}
            className="relative aspect-[1.586] w-full overflow-hidden rounded-[18px] text-[#1B1F24] shadow-lg"
            style={{ background: "linear-gradient(160deg, #E9EEF2 0%, #D3DCE3 100%)" }}
          >
            <div aria-hidden="true" className="mt-[7%] h-[17%] w-full bg-[#1F2328]" />
            <div className="mx-[6%] mt-[5%] flex items-center gap-3">
              <div aria-hidden="true" className="h-8 flex-1 rounded-sm" style={{ background: "repeating-linear-gradient(135deg, #FFFFFF 0 6px, #E8E1CF 6px 12px)" }} />
              <span className="text-[11px] text-[#4A5560]">서명</span>
            </div>
            <div className="mx-[6%] mt-[5%] flex flex-col gap-0.5">
              <span className="text-[11px] text-[#4A5560]">{card.centerLabel}</span>
              <button
                type="button"
                onClick={() => {
                  if (centerDigits) onPickNumber(centerDigits);
                }}
                aria-label={`${card.issuer} ${card.centerLabel} ${card.centerNumber} 전화 앱에 번호 입력`}
                className="self-start text-[20px] font-bold tracking-wide underline underline-offset-4"
              >
                {card.centerNumber}
              </button>
            </div>
            <div className="absolute inset-x-[6%] bottom-[6%] flex flex-col gap-0.5 text-[10px] leading-snug text-[#4A5560]">
              {card.notes.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          </section>
        ) : (
          <section
            aria-label={`${card.cardName} 앞면`}
            className="relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-[18px] p-[6%] text-white shadow-lg"
            style={{ background: "linear-gradient(145deg, #0F6E5C 0%, #1D9A82 60%, #6CC8B4 100%)" }}
          >
            <span className="text-[18px] font-bold">{card.issuer}</span>
            <span aria-hidden="true" className="h-8 w-11 rounded-md bg-[#E8C66A]" />
            <div className="flex items-end justify-between">
              <span className="text-[17px] tracking-[0.18em]">{`•••• •••• •••• ${card.last4}`}</span>
              <span className="text-[12px] opacity-90">{card.validThru}</span>
            </div>
          </section>
        )}
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setSide(side === "back" ? "front" : "back")}
            className="min-h-[44px] rounded-full px-5 text-[15px] font-semibold"
            style={{ backgroundColor: light ? "#FFFFFF" : theme.field, color: theme.tint }}
          >
            {side === "back" ? "앞면 보기" : "뒷면 보기"}
          </button>
        </div>
      </div>
    </div>
  );
}
