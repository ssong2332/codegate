"use client";

// 2026-10-27(사용자 요청 — 갤럭시 One UI 9 실기 통화 화면 스크린샷 재현) — `samsung` 스킨(`controls: "oneui9"`)의 통화 중 버튼 묶음.
//
// | 실기 자리 | 이 화면 | 동작 |
// |---|---|---|
// | 내 소리 차단 | 음소거 | 종전 음소거 그대로(눌림 = 어두운 채움) |
// | 스피커 · 키패드 | 같은 이름 | 종전 그대로 |
// | 더 보기 | 시트 열기 | 시트: 통화 자막 · 통화 대기 · 연락처 보기 + 메시지 보내기(= 종전 "메시지") + 채팅으로(메신저 채널만) |
// | 녹음 · 블루투스 · AI 반짝이 · 통화 자막 · 통화 대기 · 연락처 보기 | 대략적인 기능 | 판정표 = `@/lib/phone/callExtras` 머리 주석(2026-10-27 사용자 지시) |
//
// ⛔ 삼성 로고 · 상표 · 실제 아이콘 파일 0 — 아이콘은 `PhoneIcon`의 자체 제작 SVG다. 색은 스킨 토큰(`callTokensFor("samsung")`)만 쓴다.
// ⚠️ 버튼 묶음은 시트가 열려도 마운트된 채 숨긴다(`invisible`) — 시트 · 문자함을 닫을 때 초점이 연 버튼으로 돌아올 자리가 남는다.
import { useEffect, useRef, type ReactNode } from "react";
import { CALL_EXTRA_COPY as COPY, type CallExtraPanel } from "@/lib/phone/callExtras";
import type { CallSkinTokens } from "@/lib/phone/skinTokens";
import PhoneIcon from "./PhoneIcon";

type Props = {
  tokens: CallSkinTokens;
  muted: boolean;
  onToggleMute: () => void;
  onOpenKeypad: () => void;
  speaker: { on: boolean; disabled: boolean; onToggle: () => void };
  /** 미확인 문자 수(배지) · 도착 수(이름). */
  smsUnread: number;
  smsCount: number;
  onOpenMessages: (trigger: HTMLButtonElement | null) => void;
  /** 메신저 채널만 — 통화를 유지한 채 대화방 열기. */
  chat: { onOpen: () => void; busy: boolean } | null;
  /** 열린 시트(더 보기 · 오디오 기기 · 연락처 · 통화 어시스트) — 이름을 흐리는 데 화면도 쓴다. */
  panel: CallExtraPanel | null;
  onPanelChange: (panel: CallExtraPanel | null) => void;
  recording: boolean;
  onToggleRecording: () => void;
  captionsOn: boolean;
  onToggleCaptions: () => void;
  onToast: (text: string) => void;
  callerLabel: string;
  callerSubtitle: string | null;
};

const BUTTON = "flex h-[62px] w-[62px] items-center justify-center rounded-[24px]";
const ROW = "flex min-h-[44px] w-full items-center gap-5 pl-2 text-left text-[15px]";

export default function OneUiCallControls(props: Props) {
  const { tokens, panel, onPanelChange } = props;
  const moreRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLButtonElement>(null);
  const assistRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // 시트: 열리면 첫 동작 항목으로 초점 · 바깥 누름 / Esc로 닫힘(Esc는 연 버튼으로 초점 복귀).
  useEffect(() => {
    if (!panel) return;
    // 시트를 연 버튼(Esc로 닫으면 초점이 돌아갈 곳). 연락처 카드는 '더 보기' 시트에서 열린다.
    const triggerFor = (p: CallExtraPanel) => (p === "audio" ? audioRef : p === "assist" ? assistRef : moreRef);
    sheetRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (sheetRef.current && event.target instanceof Node && sheetRef.current.contains(event.target)) return;
      onPanelChange(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const trigger = triggerFor(panel);
      onPanelChange(null);
      requestAnimationFrame(() => trigger.current?.focus());
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panel, onPanelChange]);

  const label = (text: string, dim = false) => (
    <span className={`whitespace-nowrap text-[14px] leading-tight ${dim ? "opacity-40" : ""}`} style={{ color: tokens.textPrimary }}>
      {text}
    </span>
  );
  const fill = (pressed: boolean) => ({
    backgroundColor: pressed ? tokens.gridButtonPressedBg : tokens.gridButtonBg,
    color: pressed ? tokens.gridIconPressed : tokens.gridIcon,
  });
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

  const sheet = (name: CallExtraPanel, title: string | null, children: ReactNode) => (
    <div
      ref={sheetRef}
      role={name === "more" ? "menu" : "dialog"}
      aria-label={title ?? "더 보기"}
      className="absolute inset-x-0 bottom-0 rounded-[28px] px-5 pb-3 pt-4 shadow-xl backdrop-blur-xl"
      style={{ backgroundColor: tokens.sheetBg ?? tokens.bg, color: tokens.textPrimary }}
    >
      {title && <p className="mb-2 pl-2 text-[13px] font-semibold opacity-80">{title}</p>}
      {children}
    </div>
  );

  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div className={panel ? "invisible" : undefined}>
        {/* 실기 — 버튼 묶음 오른쪽 위 작은 원형 반짝이(AI · 통화 어시스트). */}
        <div className="grid grid-cols-[repeat(3,62px)] justify-between px-[22px]">
          <button
            ref={assistRef}
            type="button"
            onClick={() => onPanelChange("assist")}
            aria-haspopup="dialog"
            aria-expanded={panel === "assist"}
            aria-label={COPY.assistTitle}
            className="col-start-3 mb-7 flex h-10 w-10 items-center justify-center justify-self-center rounded-full transition active:scale-95"
            style={{ backgroundColor: "rgba(40,28,40,0.40)", color: tokens.gridIcon }}
          >
            <PhoneIcon name="sparkle" size={22} />
          </button>
        </div>
        <div className="grid grid-cols-[repeat(3,62px)] justify-between gap-y-[14px] px-[22px]">
          {/* 녹음 — 표시만(파일 · 저장 · 전송 0 · 마이크를 따로 잡지 않는다). 경과 시간은 화면 위 상태 줄. */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={props.onToggleRecording}
              aria-pressed={props.recording}
              aria-label={props.recording ? "녹음 중지" : "녹음"}
              className={`${BUTTON} transition active:scale-95`}
              style={fill(props.recording)}
            >
              <PhoneIcon name="record" />
            </button>
            {label("녹음")}
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={props.onToggleMute}
              aria-pressed={props.muted}
              aria-label={props.muted ? "음소거 해제" : "음소거"}
              className={`${BUTTON} transition active:scale-95`}
              style={fill(props.muted)}
            >
              <PhoneIcon name="mute" />
            </button>
            {label("내 소리 차단")}
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              ref={audioRef}
              type="button"
              onClick={() => onPanelChange("audio")}
              aria-haspopup="dialog"
              aria-expanded={panel === "audio"}
              aria-label={COPY.audioTitle}
              className={`${BUTTON} transition active:scale-95`}
              style={fill(false)}
            >
              <PhoneIcon name="bluetooth" />
            </button>
            {label("블루투스")}
          </div>

          {/* ⭐ T190-3(UX D-98 · D-103) — 음량 전환 · 비활성 경로 무반응 · §105(UX D-146) 켜짐을 글자로도. */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (props.speaker.disabled) return;
                props.speaker.onToggle();
              }}
              aria-pressed={!props.speaker.disabled && props.speaker.on}
              aria-disabled={props.speaker.disabled ? true : undefined}
              aria-label="스피커"
              className={`${BUTTON} transition ${props.speaker.disabled ? "opacity-40" : "active:scale-95"}`}
              style={fill(!props.speaker.disabled && props.speaker.on)}
            >
              <PhoneIcon name="speaker" />
            </button>
            {label(!props.speaker.disabled && props.speaker.on ? "스피커 켜짐" : "스피커", props.speaker.disabled)}
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={props.onOpenKeypad}
              aria-pressed={false}
              aria-label="키패드 — 텍스트로 입력"
              className={`${BUTTON} transition active:scale-95`}
              style={fill(false)}
            >
              <PhoneIcon name="keypad" />
            </button>
            {label("키패드")}
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              ref={moreRef}
              type="button"
              onClick={() => onPanelChange("more")}
              aria-haspopup="menu"
              aria-expanded={panel === "more"}
              aria-label={props.smsUnread > 0 ? `더 보기 — 미확인 문자 ${props.smsUnread}건` : "더 보기"}
              className={`relative ${BUTTON} transition active:scale-95`}
              style={fill(false)}
            >
              <PhoneIcon name="more" />
              {props.smsUnread > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-xs font-bold"
                  style={{ backgroundColor: tokens.badgeBg, color: tokens.badgeText }}
                >
                  {props.smsUnread}
                </span>
              )}
            </button>
            {label("더 보기")}
          </div>
        </div>
      </div>

      {panel === "more" &&
        sheet(
          "more",
          null,
          <>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={props.captionsOn}
              onClick={() => {
                onPanelChange(null);
                props.onToggleCaptions();
              }}
              className="flex w-full items-center gap-4 py-1 text-left"
            >
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/45">
                <PhoneIcon name="caption" size={22} />
              </span>
              <span className="text-[15px]">{COPY.captionsTitle}</span>
              {check(props.captionsOn)}
            </button>
            <div aria-hidden="true" className="my-4 border-t-2 border-dotted border-white/50" />
            <button type="button" role="menuitem" onClick={() => toast(COPY.holdUnavailable)} className={ROW}>
              <PhoneIcon name="pause" size={22} />
              <span>통화 대기</span>
            </button>
            <button type="button" role="menuitem" onClick={() => onPanelChange("contact")} className={ROW}>
              <PhoneIcon name="contact" size={22} />
              <span>연락처 보기</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onPanelChange(null);
                props.onOpenMessages(moreRef.current);
              }}
              aria-label={
                props.smsCount === 0 ? "메시지 — 받은 문자 없음" : `메시지 — 도착 ${props.smsCount}건, 미확인 ${props.smsUnread}건`
              }
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
            {props.chat && (
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
            )}
          </>,
        )}

      {/* 블루투스 — 오디오 기기 시트. 휴대전화 / 스피커는 종전 스피커 전환과 같은 상태다(새 경로 0). 블루투스 기기는 웹이 고를 수 없다(§74.2). */}
      {panel === "audio" &&
        sheet(
          "audio",
          COPY.audioTitle,
          <>
            <button
              type="button"
              aria-pressed={!props.speaker.on || props.speaker.disabled}
              onClick={() => {
                if (props.speaker.on && !props.speaker.disabled) props.speaker.onToggle();
                onPanelChange(null);
              }}
              className={ROW}
            >
              <PhoneIcon name="accept-call" size={22} />
              <span>{COPY.audioPhone}</span>
              {check(!props.speaker.on || props.speaker.disabled)}
            </button>
            <button
              type="button"
              aria-pressed={props.speaker.on && !props.speaker.disabled}
              disabled={props.speaker.disabled}
              onClick={() => {
                if (!props.speaker.on) props.speaker.onToggle();
                onPanelChange(null);
              }}
              className={`${ROW} disabled:opacity-40`}
            >
              <PhoneIcon name="speaker" size={22} />
              <span>{COPY.audioSpeaker}</span>
              {check(props.speaker.on && !props.speaker.disabled)}
            </button>
            <p className="mt-2 pl-2 text-[13px] leading-snug opacity-80">{COPY.audioBluetoothNote}</p>
            <button type="button" onClick={() => onPanelChange(null)} className="mt-2 min-h-[44px] w-full text-[15px] font-semibold">
              {COPY.close}
            </button>
          </>,
        )}

      {/* 연락처 보기 — 저장되지 않은 번호 카드(개인정보 0 · 저장 0). */}
      {panel === "contact" &&
        sheet(
          "contact",
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
        )}

      {/* AI 반짝이 — 통화 어시스트. 통화 자막은 실제로 켜진다 · 실시간 통역은 쓸 수 없다는 토스트. */}
      {panel === "assist" &&
        sheet(
          "assist",
          COPY.assistTitle,
          <>
            <button
              type="button"
              aria-pressed={props.captionsOn}
              onClick={() => {
                onPanelChange(null);
                props.onToggleCaptions();
              }}
              className={ROW}
            >
              <PhoneIcon name="caption" size={22} />
              <span>{COPY.assistCaptions}</span>
              {check(props.captionsOn)}
            </button>
            <button type="button" onClick={() => toast(COPY.translateUnavailable)} className={ROW}>
              <PhoneIcon name="globe" size={22} />
              <span>{COPY.assistTranslate}</span>
            </button>
          </>,
        )}
    </div>
  );
}
