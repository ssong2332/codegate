"use client";

// UX-014 `pre-call-notice` — 통화 벨 직전 고지 (T190-8b · docs/Architecture.md §74.22 (1) ⓓ · §74.12 (3) ·
// UX-014 v1.33 (11) ① 정본 · D-102 · PRD AC-091 (b)(d)(e) · AC-087).
//
// ⭐ **세션 전** 화면이다 — 통화 진입 경로 ① 자가 통화 · ③ 수신자 통화가 반드시 지나고, "준비됐어요"를 누른 뒤에야
// 벨(`incoming`)이 울린다(벨 화면 문구 0 — 결정 7). 메신저→통화 에스컬레이션은 이 화면을 거치지 않는다(OQ-52 (ㄴ) —
// 그 고지는 메신저 시작 전 고지가 "메시지와 전화"로 맡는다). 등록부: G436 `pre-session` · T86 `false`.
//
// ⛔ 형태 규칙(UX-014 v1.33 (11) ①):
//   - **앱 기본 화면 톤**(#FAF8F5 · 앱 글꼴) — 통화 스킨을 입히지 않는다(스킨이 켜지는 순간 = `incoming` = 세션의 시작).
//   - 경고 표현 0(⚠·경고색·role="alert") · 점멸·자동 진행 0 · 노출 = 탭할 때까지.
//   - 상단 바 = "훈련 종료"만(오른쪽 끝 · 확인 없이 즉시 UX-007 — AC-006 · AC-091 (e)). 발신자·번호·난이도·시나리오
//     제목 없음(수신자 서프라이즈 AC-040).
//   - 읽는 순서 = 제목 → 고지 ① → 고지 ② → 화면 모양 줄 → 준비됐어요 → (상단) 훈련 종료. 진입 시 제목에 포커스.
// ⭐ G438(재지정 ⓓ) — `{PREROLL_NOTICE}`는 이 파일에서 **정확히 1회 · 조건 없이** 그린다(화면 전체가 세션 전).
import { useEffect, useRef } from "react";
import DeviceSkinPicker from "./DeviceSkinPicker";
import EndTrainingButton from "./EndTrainingButton";
import PhoneIcon from "./PhoneIcon";
import { Button } from "./ui";
import { PRE_CALL_NOTICE, PREROLL_NOTICE } from "@/lib/sessionboundary/preSessionCopy";
import type { DeviceSkin, DeviceSkinSource } from "@/lib/phone/deviceSkin";

type CallStartNoticeProps = {
  /** "준비됐어요" — 이 핸들러 안(사용자 제스처)에서 벨 오디오를 준비한다(iOS 자동재생 — OQ-A95 ⓐ의 해제 지점). */
  onConfirm: () => void;
  onEndTraining: () => void;
  /** 세션 전 화면 모양 줄(D-100 (2) · AC-092 (d)) — 통화는 표면이 하나라 조건 없이 그린다(UX-014 v1.33 (11) ①). */
  skinPicker: {
    value: DeviceSkin;
    source: DeviceSkinSource;
    onChange: (skin: "ios" | "samsung") => void;
  };
};

export default function CallStartNotice({ onConfirm, onEndTraining, skinPicker }: CallStartNoticeProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

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
        <span aria-hidden="true" className="text-[#41525E]">
          <PhoneIcon name="accept-call" size={48} />
        </span>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-[22px] font-bold leading-[1.35] text-[#22303A] outline-none"
        >
          {PRE_CALL_NOTICE.title}
        </h1>
        <p className="text-[17px] leading-[1.7] text-[#6B655C]">{PREROLL_NOTICE}</p>
        <p className="text-[17px] leading-[1.7] text-[#6B655C]">{PRE_CALL_NOTICE.stopHint}</p>
        <DeviceSkinPicker value={skinPicker.value} source={skinPicker.source} onChange={skinPicker.onChange} />
      </div>

      {/* 주 버튼 — 화면 하단(엄지 도달 · P-30 (2)(3) · 52px · 폭 전체). */}
      <div className="mx-auto w-full max-w-md px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <Button type="button" onClick={onConfirm}>
          {PRE_CALL_NOTICE.confirmLabel}
        </Button>
      </div>
    </main>
  );
}
