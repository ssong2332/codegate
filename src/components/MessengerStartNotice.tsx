"use client";

// UX-022 `start-notice` — 메신저 시작 전 고지 (T187 · docs/Architecture.md §72.5 D2 · PRD v1.18
// AC-087/AC-088 · UX-022 v1.29 노트 (2)~(5) · UX D-78/D-79/D-80).
//
// ⭐ **세션 전** 화면이다 — 이 화면을 지나 "메시지 보기"를 누른 뒤에야 대화가 구독·렌더된다
// (구독 게이트는 messenger/page.tsx). 그래서 고지 문면이 여기에 있어도 "세션 중 표식 0"(AC-086)과
// 충돌하지 않는다. 문면 정본은 `src/lib/sessionboundary/preSessionCopy.ts` 한 곳이다.
//
// ⛔ 형태 규칙(UX-022 v1.29 (2) 형태 · (5) 접근성):
//   - 앱 기본 톤(#FAF8F5)으로 그린다 — 카카오/문자 스킨을 입히지 않는다(상대가 보낸 말처럼 읽히면 안 된다).
//   - 경고 표현 0(⚠·경고색·role="alert") · 자동 진행·타이머 0 · 노출 = 탭할 때까지.
//   - props에 난이도·채널(자가/수신자) 입력이 **없다**(AC-065 · D-79 구조 보장) — 갈리는 것은 표면에
//     따른 카카오 면책 1줄뿐이다(D-80).
//   - 상단 바 = "훈련 종료"만(오른쪽 끝 — chat 헤더와 같은 끝·문구·크기). 마운트 시 제목에 포커스.
import { useEffect, useRef } from "react";
import EndTrainingButton from "./EndTrainingButton";
import { Button } from "./ui";
import { MESSENGER_START_NOTICE } from "@/lib/sessionboundary/preSessionCopy";

type MessengerStartNoticeProps = {
  surface: "kakao" | "sms";
  onConfirm: () => void;
  onEndTraining: () => void;
};

export default function MessengerStartNotice({
  surface,
  onConfirm,
  onEndTraining,
}: MessengerStartNoticeProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // 상태 진입 시 제목에 포커스(UX-007 · UX-021 Error (c) 관례) — 스크린리더가 제목 → 고지 → 버튼
  // 순으로 읽는다(경고 알림으로 끼어들지 않는다).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-[#FAF8F5]">
      {/* 상단 바 — "훈련 종료"만(그 밖의 요소 0). G449: 오른쪽 끝 고정. */}
      <div className="flex justify-end px-4 py-2.5">
        <EndTrainingButton onClick={onEndTraining} />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span aria-hidden="true" className="text-5xl">
          💬
        </span>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-[26px] font-bold leading-[1.35] text-[#22303A] outline-none"
        >
          {MESSENGER_START_NOTICE.title}
        </h1>
        <p className="text-base leading-[1.7] text-[#6B655C]">{MESSENGER_START_NOTICE.notice}</p>
        {surface === "kakao" && (
          <p className="text-base leading-[1.7] text-[#6B655C]">
            {MESSENGER_START_NOTICE.kakaoDisclaimer}
          </p>
        )}
        <p className="text-base leading-[1.7] text-[#6B655C]">{MESSENGER_START_NOTICE.stopHint}</p>
      </div>

      {/* 주 버튼 — 화면 하단(엄지 도달 · P-30). */}
      <div className="mx-auto w-full max-w-md px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <Button type="button" onClick={onConfirm}>
          {MESSENGER_START_NOTICE.confirmLabel}
        </Button>
      </div>
    </main>
  );
}
