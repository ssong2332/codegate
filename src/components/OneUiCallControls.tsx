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
// 시트(더 보기 · 오디오 기기 · 연락처 · 통화 어시스트)는 iOS형과 같은 `CallExtraSheets`다.
import { useMemo, useRef } from "react";
import { CALL_EXTRA_COPY as COPY, type CallExtraPanel } from "@/lib/phone/callExtras";
import type { CallSkinTokens } from "@/lib/phone/skinTokens";
import CallExtraSheets from "./CallExtraSheets";
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

export default function OneUiCallControls(props: Props) {
  const { tokens, panel, onPanelChange } = props;
  const moreRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLButtonElement>(null);
  const assistRef = useRef<HTMLButtonElement>(null);
  // 시트 초점 effect가 매초(경과 시간) 다시 돌지 않게 한 번만 만든다.
  const triggers = useMemo(() => ({ more: moreRef, audio: audioRef, assist: assistRef }), []);
  const label = (text: string, dim = false) => (
    <span className={`whitespace-nowrap text-[14px] leading-tight ${dim ? "opacity-40" : ""}`} style={{ color: tokens.textPrimary }}>
      {text}
    </span>
  );
  const fill = (pressed: boolean) => ({
    backgroundColor: pressed ? tokens.gridButtonPressedBg : tokens.gridButtonBg,
    color: pressed ? tokens.gridIconPressed : tokens.gridIcon,
  });
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

      <CallExtraSheets
        variant="oneui"
        tokens={tokens}
        panel={panel}
        onPanelChange={onPanelChange}
        triggers={triggers}
        speaker={props.speaker}
        smsUnread={props.smsUnread}
        smsCount={props.smsCount}
        onOpenMessages={props.onOpenMessages}
        chat={props.chat}
        captionsOn={props.captionsOn}
        onToggleCaptions={props.onToggleCaptions}
        onToast={props.onToast}
        callerLabel={props.callerLabel}
        callerSubtitle={props.callerSubtitle}
      />
    </div>
  );
}
