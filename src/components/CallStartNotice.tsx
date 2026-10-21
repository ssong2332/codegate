"use client";

// UX-014 `pre-call-notice` — 통화 벨 직전 고지 (T190-8b · docs/Architecture.md §74.22 (1) ⓓ · §74.12 (3) ·
// UX-014 v1.33 (11) ① 정본 · D-102 · PRD AC-091 (b)(d)(e) · AC-087).
//
// ⭐ **세션 전** 화면이다 — 통화 진입 경로 ① 자가 통화 · ③ 수신자 통화가 반드시 지나고, "준비됐어요"를 누른 뒤에야
// 벨(`incoming`)이 울린다(벨 화면 문구 0 — 결정 7). 메신저→통화 에스컬레이션은 이 화면을 거치지 않는다(OQ-52 (ㄴ) —
// 그 고지는 메신저 시작 전 고지가 "메시지와 전화"로 맡는다). 등록부: G436 `pre-session` · T86 `false`.
//
// ⛔ 형태 규칙(UX-014 v1.33 (11) ①):
//   - **앱 기본 화면 톤**(시안 A page 토큰 · 앱 글꼴) — 통화 스킨을 입히지 않는다(스킨이 켜지는 순간 = `incoming` = 세션의 시작).
//   - 경고 표현 0(⚠·경고색·role="alert") · 점멸·자동 진행 0 · 노출 = 탭할 때까지.
//   - 상단 바 = "훈련 종료"만(오른쪽 끝 · 확인 없이 즉시 UX-007 — AC-006 · AC-091 (e)). 발신자·번호·난이도·시나리오
//     제목 없음(수신자 서프라이즈 AC-040).
//   - 읽는 순서 = 제목 → 고지 ① → 고지 ② → (T194-b 카드: 블록 제목 → 안내 → 항목 → 고지 ⓐ → 고지 ⓑ) → 화면 모양 줄 →
//     준비됐어요 → (상단) 훈련 종료. 진입 시 제목에 포커스.
// ⭐ G438(재지정 ⓓ) — `{PREROLL_NOTICE}`는 이 파일에서 **정확히 1회 · 조건 없이** 그린다(화면 전체가 세션 전).
import { useEffect, useRef } from "react";
import DeviceSkinPicker from "./DeviceSkinPicker";
// §95.6(UX D-139) — 브라우저 다크 모드 안내(웨일 · 기기 다크일 때만 · 벨 직전 고지에만 — 벨 · 통화 화면 0).
import WebDarkModeNotice from "./WebDarkModeNotice";
import EndTrainingButton from "./EndTrainingButton";
import PhoneIcon from "./PhoneIcon";
import { Button } from "./ui";
import { PRE_CALL_NOTICE, PREROLL_NOTICE } from "@/lib/sessionboundary/preSessionCopy";
import type { DeviceSkin, DeviceSkinSource } from "@/lib/phone/deviceSkin";
import {
  MASK_ACCESSIBLE_NAME,
  PERSONA_CARD_COPY,
  splitMaskedValue,
  type PersonaCardView,
} from "@/lib/personacard/personaCard";

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
  /**
   * T194-b(UX-014 v1.38 (1)(3) · D-118 · PRD AC-104 (b)) — 서버가 세션 문서에 쓴 가상 신상 카드 행(`readSessionPersonaCard` 결과).
   * `null` = 카드 블록 0(그 밖 세션의 이 화면은 v1.33 (11) ① 그대로). ⛔ 이 화면은 값을 만들거나 고치지 않는다.
   * §88 — 챌린지를 보낸 사람이 넣은 카드는 `readSessionPersonaCard`가 `null`로 돌려 받는 사람에게 그리지 않는다.
   */
  personaCard: PersonaCardView | null;
};

export default function CallStartNotice({ onConfirm, onEndTraining, skinPicker, personaCard }: CallStartNoticeProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="flex min-h-dvh flex-col bg-page">
      {/* 상단 바 — "훈련 종료"만(그 밖의 요소 0). G449: 오른쪽 끝 고정. */}
      <div className="flex justify-end px-4 py-2.5">
        <EndTrainingButton onClick={onEndTraining} />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span aria-hidden="true" className="text-avatar-bg">
          <PhoneIcon name="accept-call" size={48} />
        </span>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-[22px] font-bold leading-[1.35] text-ink outline-none"
        >
          {PRE_CALL_NOTICE.title}
        </h1>
        <p className="text-[17px] leading-[1.7] text-ink-sub">{PREROLL_NOTICE}</p>
        <p className="text-[17px] leading-[1.7] text-ink-sub">{PRE_CALL_NOTICE.stopHint}</p>
        <WebDarkModeNotice />
        {/* T194-b(UX-014 v1.38 (1)) — 고지 ② 바로 아래 · 화면 모양 줄 위. 카드는 "상대가 알고 있다 · 말할 것이다"를 예고하지
            않는다(K-7). 경고 표현 · 점멸 · 포커스 대상 0(조작 요소 없음 — 진입 포커스는 기존대로 제목). 닫힘 = "준비됐어요". */}
        {personaCard && (
          <section
            aria-labelledby="persona-card-title"
            className="w-full rounded-[8px] border border-line bg-surface p-4 text-left"
          >
            <h2 id="persona-card-title" className="text-[17px] font-bold leading-[1.4] text-ink">
              {PERSONA_CARD_COPY.title}
            </h2>
            <p className="mt-1 text-[17px] leading-[1.6] text-ink-sub">{PERSONA_CARD_COPY.guide}</p>
            <dl className="mt-3 flex flex-col gap-2">
              {personaCard.rows.map((row) => (
                <div key={row.label}>
                  <dt className="text-[17px] font-normal leading-[1.5] text-ink-sub">{row.label}</dt>
                  {/* 가림 "○○"은 화면에 그대로, 스크린리더에는 "가려진 이름"(UX-014 v1.38 (3)). 줄바꿈 허용 · 말줄임 0. */}
                  <dd className="break-words text-[20px] font-bold leading-[1.4] text-ink">
                    {splitMaskedValue(row.value).map((segment, i) =>
                      segment.masked ? (
                        <span key={i}>
                          <span aria-hidden="true">{segment.text}</span>
                          <span className="sr-only">{MASK_ACCESSIBLE_NAME}</span>
                        </span>
                      ) : (
                        <span key={i}>{segment.text}</span>
                      ),
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {/* §88(UX D-131 (5)) — 고지 ⓐ는 카드 출처로 갈린다(v1 = noticeVirtual · v2 self = noticeInput — readSessionPersonaCard가 고른다). */}
            <p className="mt-3 text-[17px] leading-[1.6] text-ink-sub">{personaCard.notice}</p>
            <p className="mt-1 text-[17px] leading-[1.6] text-ink-sub">{PERSONA_CARD_COPY.noticeNoRevisit}</p>
          </section>
        )}
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
