"use client";

// §95(UX D-138 · 실기 신고 11 — 2026-10-21) — 카톡형 대화방에서 상대 이름 · 프로필 사진을 누르면 열리는 상대 프로필(전체 화면).
// 실제 메신저의 프로필 화면처럼 큰 사진 · 이름 · 아래 동작 줄. 동작은 둘뿐이다(동작 없는 버튼 금지 — P-37 R-6):
//  - "보이스톡" = 종전 머리줄 "전화로 확인"(서버 requestEscalation — 동작 · 술어 그대로). 통화로 이어지는 세션에서만 보인다.
//  - "훈련 종료" = 종전 머리줄 종료와 같은 처리기(1탭 즉시 · 확인 대화상자 0).
// ⚠️ 머리줄의 상시 종료(AC-006 R-4 — 대화 화면의 종료는 항상 보이고 1탭)는 이 시트와 별도로 남는다(§95.4 — 이 시트는 추가 경로).
// ⛔ 상표 · 고유 아이콘 · 실제 앱 그림을 쓰지 않는다 — 자체 실루엣(PhoneIcon)과 단색 바탕만.
// 포커스: 열면 시트로 · Tab 순환 · Esc = 닫기 · 닫히면 연 요소로 복귀(MessengerFakeLanding 메신저 진입과 같은 규칙).
import { useEffect, useRef } from "react";
import PhoneIcon from "@/components/PhoneIcon";
import { MESSENGER_CHAT_TOKENS } from "@/lib/phone/skinTokens";

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

type MessengerProfileSheetProps = {
  name: string;
  /** 통화로 이어지는 세션이고 대화가 끝나지 않았을 때만 "보이스톡"을 그린다. */
  voiceTalk?: { onClick: () => void; disabled?: boolean };
  onEndTraining: () => void;
  onClose: () => void;
};

export default function MessengerProfileSheet({ name, voiceTalk, onEndTraining, onClose }: MessengerProfileSheetProps) {
  const t = MESSENGER_CHAT_TOKENS;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      const panel = dialogRef.current;
      if (!panel) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !panel.contains(active) || (event.shiftKey && (active === first || active === panel))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="messenger-profile-name"
      tabIndex={-1}
      className="absolute inset-0 z-40 flex flex-col outline-none"
      style={{ backgroundColor: t.profileSheetBg, color: t.profileSheetText }}
    >
      <div className="flex justify-start p-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="프로필 닫기"
          className="flex h-12 w-12 items-center justify-center rounded-full"
        >
          <PhoneIcon name="close" size={26} />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-end gap-3 pb-8">
        <span
          aria-hidden="true"
          className="flex h-[96px] w-[96px] items-end justify-center overflow-hidden rounded-[36px]"
          style={{ backgroundColor: t.profileBg, color: t.profileFg }}
        >
          <PhoneIcon name="person" size={80} />
        </span>
        <h2 id="messenger-profile-name" className="text-[22px] font-bold">
          {name}
        </h2>
      </div>
      <div
        className="flex justify-center gap-10 border-t px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5"
        style={{ borderColor: "rgba(255,255,255,0.25)" }}
      >
        {voiceTalk && (
          <button
            type="button"
            onClick={voiceTalk.onClick}
            disabled={voiceTalk.disabled}
            className="flex min-h-[64px] min-w-[72px] flex-col items-center justify-center gap-1.5 text-[15px] disabled:opacity-50"
          >
            <PhoneIcon name="accept-call" size={28} />
            보이스톡
          </button>
        )}
        <button
          type="button"
          onClick={onEndTraining}
          className="flex min-h-[64px] min-w-[72px] flex-col items-center justify-center gap-1.5 text-[15px]"
        >
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center">
            <span className="h-[18px] w-[18px] rounded-[4px] bg-current" />
          </span>
          훈련 종료
        </button>
      </div>
    </div>
  );
}
