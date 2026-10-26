"use client";

// 2026-10-27(사용자 지시 — iOS 26 통화 화면 재현 · 실기 스크린샷 없음) — `ios` 스킨(`controls: "ios26"`)의 통화 중 버튼 묶음.
//
// | 자리(근거) | 이 화면 | 동작 |
// |---|---|---|
// | 위 줄: 스피커 · 영상 통화 · 소리 끔(iOS 17 이후 6개 묶음 윗줄 — AppleInsider 2023-08-16 · 순서는 추정) | 같은 자리 | 스피커 = 종전 음량 전환 · 영상 통화 = 토스트 · 소리 끔 = 종전 음소거 |
// | 아래 줄: 더 보기 · 종료 · 키패드(종료 가운데 · 키패드 오른쪽 — 같은 기사) | 종료 자리는 비워 둔다 | 종료 버튼은 play 화면의 하나뿐인 종료 버튼(G441)을 이 자리로 끌어올린다 |
// | 더 보기(iOS 26 More — 통화 대기 지원 · 실시간 번역 · 화면 공유 — Apple 지원 문서 · 보도) | 시트 | `CallExtraSheets` variant "ios"(같은 판정표) + 이 앱의 메시지 · 채팅 · 통화 자막 · 연락처 |
// | 녹음(iOS 18.1~ 통화 화면 왼쪽 위) | play 화면 왼쪽 위 버튼 | One UI형과 같은 규칙(표시만 — 파일 · 저장 · 전송 0) |
//
// ⛔ Apple 로고 · 상표 · 실제 아이콘 파일 0 — "FaceTime" 대신 "영상 통화"로 쓴다. 아이콘은 `PhoneIcon` 자체 제작 SVG. 유리 재질은 CSS(반투명 + 흐림 + 윗변 밝은 테두리)로 흉내만 낸다.
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
  smsUnread: number;
  smsCount: number;
  onOpenMessages: (trigger: HTMLButtonElement | null) => void;
  chat: { onOpen: () => void; busy: boolean } | null;
  panel: CallExtraPanel | null;
  onPanelChange: (panel: CallExtraPanel | null) => void;
  captionsOn: boolean;
  onToggleCaptions: () => void;
  onToast: (text: string) => void;
  callerLabel: string;
  callerSubtitle: string | null;
};

/** 유리 원 — 반투명 바탕 + 흐림 + 윗변 밝은 테두리(Liquid Glass 근사). */
const GLASS =
  "flex h-[76px] w-[76px] items-center justify-center rounded-full border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-xl transition active:scale-95";

export default function IosCallControls(props: Props) {
  const { tokens, panel, onPanelChange } = props;
  const moreRef = useRef<HTMLButtonElement>(null);
  const triggers = useMemo(() => ({ more: moreRef }), []);

  const fill = (pressed: boolean) => ({
    backgroundColor: pressed ? tokens.gridButtonPressedBg : tokens.gridButtonBg,
    color: pressed ? tokens.gridIconPressed : tokens.gridIcon,
  });
  const label = (text: string, dim = false) => (
    <span className={`whitespace-nowrap text-[13px] ${dim ? "opacity-40" : ""}`} style={{ color: tokens.textPrimary }}>
      {text}
    </span>
  );
  const speakerOn = !props.speaker.disabled && props.speaker.on;

  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <div className={`grid grid-cols-[repeat(3,76px)] justify-between gap-y-5 px-3 ${panel ? "invisible" : ""}`}>
        {/* ⭐ T190-3(UX D-98 · D-103) — 음량 전환 · 비활성 경로 무반응 · §105(UX D-146) 켜짐을 글자로도. */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (props.speaker.disabled) return;
              props.speaker.onToggle();
            }}
            aria-pressed={speakerOn}
            aria-disabled={props.speaker.disabled ? true : undefined}
            aria-label="스피커"
            className={`${GLASS} ${props.speaker.disabled ? "opacity-40" : ""}`}
            style={fill(speakerOn)}
          >
            <PhoneIcon name="speaker" />
          </button>
          {label(speakerOn ? "스피커 켜짐" : "스피커", props.speaker.disabled)}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button type="button" onClick={() => props.onToast(COPY.videoUnavailable)} aria-label="영상 통화" className={GLASS} style={fill(false)}>
            <PhoneIcon name="video" />
          </button>
          {label("영상 통화")}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={props.onToggleMute}
            aria-pressed={props.muted}
            aria-label={props.muted ? "음소거 해제" : "음소거"}
            className={GLASS}
            style={fill(props.muted)}
          >
            <PhoneIcon name="mute" />
          </button>
          {label("소리 끔")}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <button
            ref={moreRef}
            type="button"
            onClick={() => onPanelChange("more")}
            aria-haspopup="menu"
            aria-expanded={panel === "more"}
            aria-label={props.smsUnread > 0 ? `더 보기 — 미확인 문자 ${props.smsUnread}건` : "더 보기"}
            className={`relative ${GLASS}`}
            style={fill(false)}
          >
            <PhoneIcon name="more-horizontal" />
            {props.smsUnread > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-xs font-bold"
                style={{ backgroundColor: tokens.badgeBg, color: tokens.badgeText }}
              >
                {props.smsUnread}
              </span>
            )}
          </button>
          {label("더 보기")}
        </div>

        {/* 종료 자리 — play 화면의 종료 버튼(하나뿐 · G441)이 이 칸으로 올라온다(초점 대상 0). */}
        <div aria-hidden="true" className="min-h-[98px]" />

        <div className="flex flex-col items-center gap-1.5">
          <button type="button" onClick={props.onOpenKeypad} aria-label="키패드 — 텍스트로 입력" className={GLASS} style={fill(false)}>
            <PhoneIcon name="keypad" />
          </button>
          {label("키패드")}
        </div>
      </div>

      <CallExtraSheets
        variant="ios"
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
