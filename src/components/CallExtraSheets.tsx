"use client";

// 2026-10-27 — 통화 화면 부가 기능 시트(더 보기 · 오디오 기기 · 연락처 · 통화 어시스트). One UI형(`OneUiCallControls`)과
// iOS형(`IosCallControls`)이 **같은 판정표**(`@/lib/phone/callExtras` 머리 주석)를 쓴다 — 다른 것은 '더 보기' 항목 구성뿐이다.
// 시트는 버튼 묶음 위에 겹친다(부모가 `relative` · 버튼 묶음은 `invisible`로 마운트 유지 — 닫을 때 초점이 연 버튼으로 돌아온다).
// ⛔ 저장소 · 네트워크 · 녹음 API 0(`callExtras.test.ts`가 고정한다).
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { CALL_EXTRA_COPY as COPY, type CallExtraPanel } from "@/lib/phone/callExtras";
import type { CallSkinTokens } from "@/lib/phone/skinTokens";
import PhoneIcon from "./PhoneIcon";

export type CallExtraSheetsProps = {
  variant: "oneui" | "ios";
  tokens: CallSkinTokens;
  panel: CallExtraPanel | null;
  onPanelChange: (panel: CallExtraPanel | null) => void;
  /** 각 시트를 연 버튼(Esc로 닫으면 초점이 돌아갈 곳). 연락처 카드는 '더 보기'에서 열린다. */
  triggers: Partial<Record<CallExtraPanel, RefObject<HTMLButtonElement | null>>>;
  speaker: { on: boolean; disabled: boolean; onToggle: () => void };
  smsUnread: number;
  smsCount: number;
  onOpenMessages: (trigger: HTMLButtonElement | null) => void;
  chat: { onOpen: () => void; busy: boolean } | null;
  captionsOn: boolean;
  onToggleCaptions: () => void;
  onToast: (text: string) => void;
  callerLabel: string;
  callerSubtitle: string | null;
};

const ROW = "flex min-h-[44px] w-full items-center gap-5 pl-2 text-left text-[15px]";

export default function CallExtraSheets(props: CallExtraSheetsProps) {
  const { tokens, panel, onPanelChange, triggers } = props;
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreTrigger = triggers.more;

  // 시트: 열리면 첫 동작 항목으로 초점 · 바깥 누름 / Esc로 닫힘(Esc는 연 버튼으로 초점 복귀).
  useEffect(() => {
    if (!panel) return;
    sheetRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (sheetRef.current && event.target instanceof Node && sheetRef.current.contains(event.target)) return;
      onPanelChange(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const trigger = triggers[panel === "contact" ? "more" : panel] ?? triggers.more;
      onPanelChange(null);
      requestAnimationFrame(() => trigger?.current?.focus());
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panel, onPanelChange, triggers]);

  if (!panel) return null;

  const toast = (text: string) => {
    onPanelChange(null);
    props.onToast(text);
  };
  const check = (on: boolean) =>
    on ? (
      <span aria-hidden="true" className="ml-auto mr-1 text-[15px] font-semibold">
        ✓
      </span>
    ) : null;
  const sheet = (title: string | null, children: ReactNode) => (
    <div
      ref={sheetRef}
      role={panel === "more" ? "menu" : "dialog"}
      aria-label={title ?? "더 보기"}
      className={`absolute inset-x-0 bottom-0 px-5 pb-3 pt-4 shadow-xl backdrop-blur-xl ${
        props.variant === "ios" ? "rounded-[32px] border border-white/15" : "rounded-[28px]"
      }`}
      style={{ backgroundColor: tokens.sheetBg ?? tokens.bg, color: tokens.textPrimary }}
    >
      {title && <p className="mb-2 pl-2 text-[13px] font-semibold opacity-80">{title}</p>}
      {children}
    </div>
  );
  const captionsItem = (asMenu: boolean, withCircle: boolean) => (
    <button
      type="button"
      role={asMenu ? "menuitemcheckbox" : undefined}
      aria-checked={asMenu ? props.captionsOn : undefined}
      aria-pressed={asMenu ? undefined : props.captionsOn}
      onClick={() => {
        onPanelChange(null);
        props.onToggleCaptions();
      }}
      className={withCircle ? "flex w-full items-center gap-4 py-1 text-left" : ROW}
    >
      {withCircle ? (
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/45">
          <PhoneIcon name="caption" size={22} />
        </span>
      ) : (
        <PhoneIcon name="caption" size={22} />
      )}
      <span className="text-[15px]">{COPY.captionsTitle}</span>
      {check(props.captionsOn)}
    </button>
  );
  const messagesItem = (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onPanelChange(null);
        props.onOpenMessages(moreTrigger?.current ?? null);
      }}
      aria-label={props.smsCount === 0 ? "메시지 — 받은 문자 없음" : `메시지 — 도착 ${props.smsCount}건, 미확인 ${props.smsUnread}건`}
      className={ROW}
    >
      <PhoneIcon name="send-message" size={22} />
      <span>메시지 보내기</span>
      {props.smsUnread > 0 && (
        <span
          aria-hidden="true"
          className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-xs font-bold"
          style={{ backgroundColor: tokens.badgeBg, color: tokens.badgeText }}
        >
          {props.smsUnread}
        </span>
      )}
    </button>
  );
  const chatItem = props.chat && (
    <button
      type="button"
      role="menuitem"
      disabled={props.chat.busy}
      onClick={() => {
        onPanelChange(null);
        props.chat?.onOpen();
      }}
      aria-label="채팅으로 — 통화를 유지한 채 대화방 열기"
      className={`${ROW} disabled:opacity-50`}
    >
      <PhoneIcon name="chat" size={22} />
      <span>채팅으로</span>
    </button>
  );
  const toastItem = (icon: Parameters<typeof PhoneIcon>[0]["name"], text: string, message: string) => (
    <button type="button" role={panel === "more" ? "menuitem" : undefined} onClick={() => toast(message)} className={ROW}>
      <PhoneIcon name={icon} size={22} />
      <span>{text}</span>
    </button>
  );

  if (panel === "more") {
    return props.variant === "oneui"
      ? sheet(
          null,
          <>
            {captionsItem(true, true)}
            <div aria-hidden="true" className="my-4 border-t-2 border-dotted border-white/50" />
            {toastItem("pause", "통화 대기", COPY.holdUnavailable)}
            <button type="button" role="menuitem" onClick={() => onPanelChange("contact")} className={ROW}>
              <PhoneIcon name="contact" size={22} />
              <span>연락처 보기</span>
            </button>
            {messagesItem}
            {chatItem}
          </>,
        )
      : // iOS형 '더 보기'(추정 구성 — iOS 26 More 메뉴: 통화 대기 지원 · 실시간 번역 · 화면 공유 + 이 앱의 메시지 · 채팅).
        sheet(
          null,
          <>
            {toastItem("pause", "통화 대기 지원", COPY.holdAssistUnavailable)}
            {toastItem("globe", COPY.iosTranslate, COPY.translateUnavailable)}
            {toastItem("screen-share", "화면 공유", COPY.screenShareUnavailable)}
            {captionsItem(true, false)}
            <button type="button" role="menuitem" onClick={() => onPanelChange("contact")} className={ROW}>
              <PhoneIcon name="contact" size={22} />
              <span>연락처</span>
            </button>
            {messagesItem}
            {chatItem}
          </>,
        );
  }

  // 오디오 기기 — 휴대전화 / 스피커는 종전 스피커 전환과 같은 상태(새 경로 0). 블루투스 기기는 웹이 고를 수 없다(§74.2).
  if (panel === "audio") {
    const onSpeaker = props.speaker.on && !props.speaker.disabled;
    return sheet(
      COPY.audioTitle,
      <>
        <button
          type="button"
          aria-pressed={!onSpeaker}
          onClick={() => {
            if (onSpeaker) props.speaker.onToggle();
            onPanelChange(null);
          }}
          className={ROW}
        >
          <PhoneIcon name="accept-call" size={22} />
          <span>{COPY.audioPhone}</span>
          {check(!onSpeaker)}
        </button>
        <button
          type="button"
          aria-pressed={onSpeaker}
          disabled={props.speaker.disabled}
          onClick={() => {
            if (!props.speaker.on) props.speaker.onToggle();
            onPanelChange(null);
          }}
          className={`${ROW} disabled:opacity-40`}
        >
          <PhoneIcon name="speaker" size={22} />
          <span>{COPY.audioSpeaker}</span>
          {check(onSpeaker)}
        </button>
        <p className="mt-2 pl-2 text-[13px] leading-snug opacity-80">{COPY.audioBluetoothNote}</p>
        <button type="button" onClick={() => onPanelChange(null)} className="mt-2 min-h-[44px] w-full text-[15px] font-semibold">
          {COPY.close}
        </button>
      </>,
    );
  }

  // 연락처 — 저장되지 않은 번호 카드(개인정보 0 · 저장 0).
  if (panel === "contact") {
    return sheet(
      COPY.contactUnsaved,
      <>
        <div className="flex flex-col items-center gap-1 py-3">
          <span
            aria-hidden="true"
            className="mb-2 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: tokens.avatarBg, color: tokens.avatarFg }}
          >
            <PhoneIcon name="person" size={30} />
          </span>
          <p className="text-[20px] font-bold tabular-nums">{props.callerLabel}</p>
          {props.callerSubtitle && <p className="text-[14px] opacity-80">{props.callerSubtitle}</p>}
        </div>
        <button type="button" onClick={() => onPanelChange(null)} className="min-h-[44px] w-full text-[15px] font-semibold">
          {COPY.close}
        </button>
      </>,
    );
  }

  // 통화 어시스트(One UI형 AI 반짝이) — 통화 자막은 실제로 켜진다 · 실시간 통역은 토스트.
  return sheet(
    COPY.assistTitle,
    <>
      {captionsItem(false, false)}
      {toastItem("globe", COPY.assistTranslate, COPY.translateUnavailable)}
    </>,
  );
}
