"use client";

// 2026-10-27(사용자 요청 — 갤럭시 One UI 9 실기 통화 화면 스크린샷 재현) — `samsung` 스킨(`controls: "oneui9"`)의 통화 중 버튼 묶음.
//
// | 실기 자리 | 이 화면 | 동작 |
// |---|---|---|
// | 녹음 · 블루투스 · AI 반짝이 | 같은 모양 | 장식(`aria-hidden` · 초점 0 · 누름 무반응) — 앱에 없는 기능 |
// | 내 소리 차단 | 음소거 | 종전 음소거 그대로(눌림 = 어두운 채움) |
// | 스피커 · 키패드 | 같은 이름 | 종전 그대로 |
// | 더 보기 | 시트 열기 | 시트: 통화 자막 · 통화 대기 · 연락처 보기(장식) + 메시지 보내기(= 종전 "메시지") + 채팅으로(메신저 채널만) |
//
// ⛔ 삼성 로고 · 상표 · 실제 아이콘 파일 0 — 아이콘은 `PhoneIcon`의 자체 제작 SVG다. 색은 스킨 토큰(`callTokensFor("samsung")`)만 쓴다.
// ⚠️ 버튼 묶음은 시트가 열려도 마운트된 채 숨긴다(`invisible`) — 문자함을 닫을 때 초점이 '더 보기'로 돌아올 자리가 남는다.
import { useEffect, useRef } from "react";
import type { CallSkinTokens } from "@/lib/phone/skinTokens";
import PhoneIcon, { type PhoneIconName } from "./PhoneIcon";

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
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
};

const BUTTON = "flex h-[62px] w-[62px] items-center justify-center rounded-[24px]";

export default function OneUiCallControls(props: Props) {
  const { tokens, sheetOpen, onSheetOpenChange } = props;
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const firstActionRef = useRef<HTMLButtonElement>(null);

  // 시트: 열리면 첫 동작 항목으로 초점 · 바깥 누름 / Esc로 닫힘(Esc는 '더 보기'로 초점 복귀).
  useEffect(() => {
    if (!sheetOpen) return;
    firstActionRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (sheetRef.current && event.target instanceof Node && sheetRef.current.contains(event.target)) return;
      onSheetOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onSheetOpenChange(false);
      requestAnimationFrame(() => moreRef.current?.focus());
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sheetOpen, onSheetOpenChange]);

  const label = (text: string, dim = false) => (
    <span className={`whitespace-nowrap text-[14px] leading-tight ${dim ? "opacity-40" : ""}`} style={{ color: tokens.textPrimary }}>
      {text}
    </span>
  );
  const fill = (pressed: boolean) => ({
    backgroundColor: pressed ? tokens.gridButtonPressedBg : tokens.gridButtonBg,
    color: pressed ? tokens.gridIconPressed : tokens.gridIcon,
  });
  // 앱에 없는 기능 — 모양만(초점 0 · 누름 무반응 · 스크린리더 대상 밖).
  const decorative = (icon: PhoneIconName, text: string) => (
    <div aria-hidden="true" className="flex flex-col items-center gap-2">
      <span className={BUTTON} style={fill(false)}>
        <PhoneIcon name={icon} />
      </span>
      {label(text)}
    </div>
  );

  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div className={sheetOpen ? "invisible" : undefined}>
        {/* 실기 — 버튼 묶음 오른쪽 위 작은 원형 반짝이(AI). 장식. */}
        <div aria-hidden="true" className="grid grid-cols-[repeat(3,62px)] justify-between px-[22px]">
          <span
            className="col-start-3 mb-7 flex h-10 w-10 items-center justify-center justify-self-center rounded-full"
            style={{ backgroundColor: "rgba(40,28,40,0.40)", color: tokens.gridIcon }}
          >
            <PhoneIcon name="sparkle" size={22} />
          </span>
        </div>
        <div className="grid grid-cols-[repeat(3,62px)] justify-between gap-y-[14px] px-[22px]">
          {decorative("record", "녹음")}

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

          {decorative("bluetooth", "블루투스")}

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
              onClick={() => onSheetOpenChange(true)}
              aria-haspopup="menu"
              aria-expanded={sheetOpen}
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

      {sheetOpen && (
        <div
          ref={sheetRef}
          role="menu"
          aria-label="더 보기"
          className="absolute inset-x-0 bottom-0 rounded-[28px] px-5 pb-3 pt-4 shadow-xl backdrop-blur-xl"
          style={{ backgroundColor: tokens.sheetBg ?? tokens.bg, color: tokens.textPrimary }}
        >
          <div aria-hidden="true" className="flex items-center gap-4 py-1">
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-black/45">
              <PhoneIcon name="caption" size={22} />
            </span>
            <span className="text-[15px]">통화 자막</span>
          </div>
          <div aria-hidden="true" className="my-4 border-t-2 border-dotted border-white/50" />
          <div aria-hidden="true" className="flex min-h-[44px] items-center gap-5 pl-2">
            <PhoneIcon name="pause" size={22} />
            <span className="text-[15px]">통화 대기</span>
          </div>
          <div aria-hidden="true" className="flex min-h-[44px] items-center gap-5 pl-2">
            <PhoneIcon name="contact" size={22} />
            <span className="text-[15px]">연락처 보기</span>
          </div>
          <button
            ref={firstActionRef}
            type="button"
            role="menuitem"
            onClick={() => {
              onSheetOpenChange(false);
              props.onOpenMessages(moreRef.current);
            }}
            aria-label={
              props.smsCount === 0 ? "메시지 — 받은 문자 없음" : `메시지 — 도착 ${props.smsCount}건, 미확인 ${props.smsUnread}건`
            }
            className="flex min-h-[44px] w-full items-center gap-5 pl-2 text-left"
          >
            <PhoneIcon name="send-message" size={22} />
            <span className="text-[15px]">메시지 보내기</span>
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
                onSheetOpenChange(false);
                props.chat?.onOpen();
              }}
              aria-label="채팅으로 — 통화를 유지한 채 대화방 열기"
              className="flex min-h-[44px] w-full items-center gap-5 pl-2 text-left disabled:opacity-50"
            >
              <PhoneIcon name="chat" size={22} />
              <span className="text-[15px]">채팅으로</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
