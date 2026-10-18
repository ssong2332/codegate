"use client";

// T190-6 — 세션 전 "화면 모양" 줄 (docs/Architecture.md §74.4 · §74.10 (2) · UX-014 v1.33 (11) ② 정본 · D-100 ·
// PRD AC-092 (d)(e)).
//
// ⭐ **세션 전** 부품이다 — 메신저 `start-notice`(UX-022, 문자형 표면만)에 둔다(통화 경로 `pre-call-notice`는
// T190-8b). 등록부 2벌: G436 `pre-session` · T86 `false`. ⛔ 세션 중 화면에는 이 줄·스킨 이름·감지 실패 안내 0
// (AC-092 (d)) — 그래서 이 컴포넌트를 세션 중 파일이 import하지 않는다(G438 — 세션 경계 문면 import 금지와 같은 축).
//
// 상태(UX-014 v1.33 (11) ② 표):
//   - 자동 감지 성공(`auto`) 또는 이 기기의 이전 선택(`manual`) → **접힘** "화면 모양: {iOS형 | One UI형}" + "바꾸기"
//   - 감지 실패(`fallback`) 또는 "바꾸기"를 누름 → **펼침** 안내 + 선택지 2개(라디오 · 각 48px 이상)
//   ⚠️ 표에 없는 경우 1건(구현 판단 — 보고 대상): 감지는 됐지만 결과가 `default`(삼성 외 Android)이면 보여 줄
//   라벨이 없다("기본"은 선택지가 아니다) ⇒ 펼친 상태로 시작한다(고르지 않으면 기본 그대로 — AC-031 폴백).
// 문면 = `preSessionCopy.ts`(세션 전 문면 정본 1곳) · 라벨 = `deviceSkin.ts`. 썸네일 = 자체 그린 축소 도식(캡처 0 — 표 A-8).
import { useState } from "react";
import {
  DEVICE_SKIN_CHOICE_LABELS,
  pickerStartsCollapsed,
  type DeviceSkin,
  type DeviceSkinSource,
} from "@/lib/phone/deviceSkin";
import { DEVICE_SKIN_PICKER_COPY } from "@/lib/sessionboundary/preSessionCopy";
import { callTokensFor } from "@/lib/phone/skinTokens";

type ChoosableSkin = "ios" | "samsung";

const CHOICES: readonly ChoosableSkin[] = ["ios", "samsung"];

type DeviceSkinPickerProps = {
  value: DeviceSkin;
  source: DeviceSkinSource;
  /** 고르는 즉시 반영(저장 = `skinSource = manual` · 기기 저장 `fv.deviceSkin.v1` — 호출부가 한다). */
  onChange: (skin: ChoosableSkin) => void;
};

function SkinThumbnail({ skin }: { skin: ChoosableSkin }) {
  const tokens = callTokensFor(skin);
  return (
    <span
      aria-hidden="true"
      className="relative flex h-12 w-7 shrink-0 flex-col items-center justify-start overflow-hidden rounded-[6px] pt-2"
      style={{ backgroundColor: tokens.bg }}
    >
      {tokens.hasAvatar && <span className="mb-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tokens.avatarBg }} />}
      <span className="h-1 w-4 rounded-full bg-white/80" />
      <span className="mt-auto mb-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tokens.end }} />
    </span>
  );
}

export default function DeviceSkinPicker({ value, source, onChange }: DeviceSkinPickerProps) {
  const [expanded, setExpanded] = useState(() => !pickerStartsCollapsed(value, source));
  const current: ChoosableSkin | null = value === "ios" || value === "samsung" ? value : null;

  if (!expanded && current) {
    return (
      <div className="flex w-full items-center gap-3 rounded-[14px] border border-[#E2DDD3] bg-white px-4 py-2 text-left">
        <SkinThumbnail skin={current} />
        <p className="min-w-0 flex-1 text-base text-[#22303A]">
          {DEVICE_SKIN_PICKER_COPY.collapsedPrefix}
          {DEVICE_SKIN_CHOICE_LABELS[current]}
        </p>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="min-h-[48px] shrink-0 px-2 text-base font-semibold text-[#0E6B62] underline underline-offset-2"
        >
          {DEVICE_SKIN_PICKER_COPY.changeLabel}
        </button>
      </div>
    );
  }

  return (
    <fieldset className="flex w-full flex-col gap-2 rounded-[14px] border border-[#E2DDD3] bg-white px-4 py-3 text-left">
      <legend className="sr-only">{DEVICE_SKIN_PICKER_COPY.expandedPrompt}</legend>
      <p aria-hidden="true" className="text-base text-[#22303A]">
        {DEVICE_SKIN_PICKER_COPY.expandedPrompt}
      </p>
      <div className="flex gap-2">
        {CHOICES.map((skin) => (
          <label
            key={skin}
            className="flex min-h-[56px] flex-1 cursor-pointer items-center gap-2.5 rounded-[12px] border px-3 py-2 text-base font-semibold text-[#22303A]"
            style={{ borderColor: current === skin ? "#0E6B62" : "#C9C2B6" }}
          >
            <input
              type="radio"
              name="device-skin"
              value={skin}
              checked={current === skin}
              onChange={() => {
                onChange(skin);
                setExpanded(false);
              }}
              // reviewer Minor — 이미 선택된 칸을 다시 고르면 change 이벤트가 오지 않는다 ⇒ 접고 그 값을 수동 선택으로 저장한다.
              // (새 값을 고를 때는 렌더 시점의 `current`가 다르므로 여기서 두 번 부르지 않는다.)
              onClick={() => {
                if (current !== skin) return;
                onChange(skin);
                setExpanded(false);
              }}
              className="h-5 w-5 accent-[#0E6B62]"
            />
            <SkinThumbnail skin={skin} />
            {DEVICE_SKIN_CHOICE_LABELS[skin]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
