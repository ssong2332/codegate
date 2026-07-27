"use client";

// UX-031 확인 부서 연결 요청 — **호 전환(넘겨주기)** 오버레이 (T83 → T110/§22.1 층 C, UF-011,
// D-47/D-48, P-24, AC-071/AC-019/AC-006/AC-022/AC-033).
//
// ⭐ **T110 — 이 화면은 "안내받은 번호로 걸어보기"가 아니다.** 통화→통화는 상담센터처럼 **넘겨주는**
// 형태이며(ADR-0013), 참가자가 번호를 안내받아 새로 거는 형태는 폐기됐다. 그래서 **번호 카드가
// 통째로 사라졌고**(C4) 버튼의 은유도 발신("걸기")에서 요청("연결해 달라고 하기")으로 바뀌었다(C5).
// ⚠️ *"같은 통화가 이어집니다"* 라고 쓰지 않는다(C3 하드) — 전환 모델에서 그 문장은 **화자 잔류**를
// 암시해 이번 결함(화자 겹침)을 문구로 되살린다. 유지되는 것은 **세션·소켓·타이머**이고 유지되지
// 않는 것은 **화자**다.
//
// ⚠️ **이 화면은 전화 앱이 아니다(AC-019 하드).** 다이얼패드·연락처·통화기록·자유 번호 입력·
// `tel:` 링크·발신 인텐트·외부 네비게이션이 **존재하지 않는다.** 이 파일은 그런 API를 import하지도
// 않는다 — 화면에 **번호 자체가 없고** 탭 대상은 버튼뿐이다(P-24는 자동 충족).
// 참가자가 할 수 있는 것은 **연결 요청 / 그만두고 통화로 돌아가기 / 훈련 종료** 세 가지뿐이다.
//
// ⚠️ **유효 대처를 여기서 시뮬레이션하지 않는다(D-48).** "내가 아는 번호로 걸기"·"다른 기기로 걸기"
// 선택지를 두지 않는다 — 두면 (ㄱ) 그것마저 같은 곳으로 연결시켜 무력감을 남기거나(AC-071 정면
// 위반) (ㄴ) 정답을 세션 중에 알려 주게 되어 D-6/OQ-38을 깬다. 유효 대처는 **리포트에서만** 나온다.
//
// ⚠️ **세션 중 구조 설명 0건(OQ-38 확정, D-6).** "같은 곳으로 이어졌습니다" 같은 문구·연출이 이
// 화면 어디에도 없다. 참가자는 "확인했으니 안전하다"고 믿는 상태를 그대로 겪는다.
//
// ⚠️ **AC-006**: 포커스 트랩이 통화 셸 하단의 종료 버튼을 가두므로, 이 오버레이 **안에** 자체
// "훈련 종료"를 둔다(선례: InCallSmsOverlay·MessengerFakeLanding). 트랩을 푸는 방식은 쓰지 않는다.
import { useEffect, useRef } from "react";
import EndTrainingButton from "./EndTrainingButton";
import SyntheticLabel from "./SyntheticLabel";
import { type VerifyInterceptView } from "@/lib/verifyintercept";

type VerifyCallOverlayProps = {
  offer: VerifyInterceptView;
  /** 통화가 살아 있다는 증거(P-20) — 발신자 라벨과 경과 시간을 오버레이 위에 계속 보여준다. */
  callerLabel: string;
  elapsedLabel: string;
  /** "연결 중…" 진행 상태(UX-031 States Dialing — 호 전환에서도 이 표현이 정확하다, C7). */
  dialing: boolean;
  /** 전환 처리 실패 시 1줄 고지(P-4 — 침묵 실패 금지). */
  errorMessage: string | null;
  /** "연결해 달라고 하기" — 발신이 아니라 **인앱 호 전환 요청**이다(AC-019/T110 C5). */
  onPlaceCall: () => void;
  onClose: () => void;
  onEndTraining: () => void;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function VerifyCallOverlay({
  offer,
  callerLabel,
  elapsedLabel,
  dialing,
  errorMessage,
  onPlaceCall,
  onClose,
  onEndTraining,
}: VerifyCallOverlayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  // 열릴 때 포커스를 오버레이 제목으로(UX-031 Accessibility). 닫을 때의 복귀는 호출부가 직전
  // 트리거 컨트롤로 되돌린다.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Esc 닫기 + 포커스 트랩(AC-006 — 트랩 안에 "훈련 종료"가 포함돼 있어 종료는 항상 도달 가능).
  // InCallSmsOverlay와 **같은 구현**이다(오버레이 규칙 무개정 재사용, §16.2).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || active === titleRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="확인 부서 연결 요청 — 훈련용 모의 화면"
      className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/55 sm:items-center sm:p-6"
    >
      {/* 바깥 탭으로 닫기(UX-031 Exit — 재연결 없이 원래 통화가 계속된다). */}
      <button
        type="button"
        aria-label="확인 화면 닫고 통화로 돌아가기"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        className="relative flex h-full w-full flex-col overflow-hidden bg-[#FAF8F5] sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-[20px] sm:shadow-2xl"
      >
        {/* ── 통화 축소 바(P-20) — 오버레이가 열려 있어도 통화가 끊기지 않았음을 상시 보여준다. */}
        <div className="flex shrink-0 items-center justify-between gap-3 bg-[#22303A] px-4 py-2.5 text-white">
          <p className="min-w-0 text-sm leading-tight">
            <span className="block truncate font-semibold">{callerLabel}</span>
            <span role="status" className="block text-xs text-[#C9D4DB]">
              통화 대기 중 · 경과 {elapsedLabel}
            </span>
          </p>
          <span className="shrink-0 rounded-full bg-[#41525E] px-2.5 py-1 text-xs font-semibold text-[#C9D4DB]">
            통화 중
          </span>
        </div>

        {/* ── 상시 표식(AC-022) + 상시 종료(AC-006). 스크롤과 무관하게 항상 보인다. */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#E2DDD3] bg-white px-4 py-3">
          <SyntheticLabel label="AI 훈련용 모의 화면" />
          <EndTrainingButton onClick={onEndTraining} />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="mb-1 text-xl font-bold text-[#22303A] outline-none"
          >
            확인 부서로 연결 요청
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-[#6B655C]">
            통화는 끊기지 않습니다. 담당자가 바뀌어 이어집니다.
          </p>

          {/* ⭐ T110 §22.1 C4 — 연락 수단 표기 카드는 통째로 제거됐다. 남는 것은 창구명 1줄 +
              모의 화면 고지다. 카탈로그에도 값이 없으므로 되돌리려면 스키마부터 되살려야 한다
              (= 되돌릴 수 없게 만드는 것이 이 제거의 목적이다, G85).
              ⚠️ 이 JSX 주석은 `codeOnly()`가 걷어내지 못하므로 G85-UI 스캔 대상에 남는다 —
              그래서 금지 단어를 서술에 쓰지 않는다(파일 서두 `//` 주석이 전문을 담는다). */}
          <div className="rounded-[14px] border-[1.5px] border-[#E2DDD3] bg-white p-5">
            <p className="text-base text-[#6B655C]">상대가 연결해 주겠다는 확인 창구</p>
            <p className="mt-1 text-xl font-bold text-[#22303A]">{offer.deskLabel}</p>
            <p className="mt-2 text-sm text-[#6B655C]">
              훈련용 모의 화면입니다. 이 화면에서만 재현되며 실제로 전화가 걸리지 않습니다.
            </p>
          </div>

          {/* Dialing — "연결 중…"(aria-live). 이 구간에도 통화 축소 표시·"훈련 종료"가 계속 보인다. */}
          {dialing && (
            <p
              role="status"
              aria-live="polite"
              className="mt-4 flex items-center justify-center gap-2 text-base font-semibold text-[#22303A]"
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-[#C9C2B6] border-t-transparent"
              />
              연결 중…
            </p>
          )}

          {/* Error — 재연결 실패 시 1줄 + 재시도(P-4). 원래 통화는 유지된다(침묵 실패 금지). */}
          {errorMessage && (
            <p role="alert" className="mt-4 text-base leading-relaxed text-[#C6392F]">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-[#E2DDD3] bg-white px-4 py-3">
          {/* ① "연결해 달라고 하기"(T110 C5 — 발신 은유 금지). "훈련 종료"와는 색이 아니라 문구·
              아이콘·위치로 구분한다(D-47 — 두 컨트롤 혼동은 AC-006 도달성 문제로 번진다).
              "훈련 종료"는 위쪽 고정 영역에 원래 자리·문구 그대로 남아 있다. */}
          <button
            type="button"
            onClick={onPlaceCall}
            disabled={dialing}
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#0E6B62] text-lg font-bold text-white disabled:opacity-60"
          >
            <span aria-hidden="true">✆</span>
            {errorMessage ? "다시 요청하기" : "연결해 달라고 하기"}
          </button>
          {/* ② 그만두고 통화로 돌아가기 — 재연결 없이 원래 통화가 계속된다(UF-011 Alternative (b)). */}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[52px] w-full rounded-[14px] border-[1.5px] border-[#C9C2B6] bg-white text-base font-bold text-[#22303A]"
          >
            그만두고 통화로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
