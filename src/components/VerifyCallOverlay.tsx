"use client";

// UX-031 확인 부서 연결 요청 — **호 전환(넘겨주기)** 오버레이 (T83 → T110/§22.1 층 C → §47(W4)/D-68,
// UF-011, D-47/D-48, P-24, AC-071/AC-019/AC-006/AC-022/AC-033).
//
// ⭐⭐ **D-68(2026-08-02) — 이 화면은 참가자가 여는 화면이 아니라 전환이 시작되는 순간 앱이 띄우는
// 비모달 전환 시트다.** 수락 컨트롤(Primary Action)이 없다 — 오퍼 개시가 참가자 탭으로 옮겨지면서
// (§47.3 C1/W4) "연결할까요?" 를 다시 묻는 두 번째 컨트롤을 두지 않기로 했다(C3). 그래서:
//   - **포커스 트랩·`aria-modal` 없음** — 참가자가 이 화면에서 결정할 것이 없다(자동으로 열리고
//     자동으로 닫힌다). 포커스를 빼앗지 않는다.
//   - Screen ID는 **UX-031 그대로**다(역할이 줄어드는 것이지 화면이 사라지는 것이 아니다).
//   - 남는 컨트롤은 **"훈련 종료"** 와 **닫기/통화로 돌아가기**(Esc·바깥 탭) 둘뿐이다. 닫기는
//     **전환을 취소하지 않는다** — 전환은 이미 시작됐고, 닫기는 시트를 치울 뿐이다.
//
// ⭐ **T110 — 이 화면은 "안내받은 번호로 걸어보기"가 아니다.** 통화→통화는 상담센터처럼 **넘겨주는**
// 형태이며(ADR-0013), 참가자가 번호를 안내받아 새로 거는 형태는 폐기됐다. 그래서 **번호 카드가
// 통째로 사라졌다**(C4).
// ⚠️ *"같은 통화가 이어집니다"* 라고 쓰지 않는다(C3 하드) — 전환 모델에서 그 문장은 **화자 잔류**를
// 암시해 이번 결함(화자 겹침)을 문구로 되살린다. 유지되는 것은 **세션·소켓·타이머**이고 유지되지
// 않는 것은 **화자**다.
//
// ⚠️ **이 화면은 전화 앱이 아니다(AC-019 하드).** 다이얼패드·연락처·통화기록·자유 번호 입력·
// `tel:` 링크·발신 인텐트·외부 네비게이션이 **존재하지 않는다.** 이 파일은 그런 API를 import하지도
// 않는다 — 화면에 **번호 자체가 없고** 탭 대상은 버튼뿐이다(P-24는 자동 충족).
// 참가자가 할 수 있는 것은 **그만두고 통화로 돌아가기 / 훈련 종료** 두 가지뿐이다.
//
// ⚠️ **유효 대처를 여기서 시뮬레이션하지 않는다(D-48).** "내가 아는 번호로 걸기"·"다른 기기로 걸기"
// 선택지를 두지 않는다 — 두면 (ㄱ) 그것마저 같은 곳으로 연결시켜 무력감을 남기거나(AC-071 정면
// 위반) (ㄴ) 정답을 세션 중에 알려 주게 되어 D-6/OQ-38을 깬다. 유효 대처는 **리포트에서만** 나온다.
//
// ⚠️ **세션 중 구조 설명 0건(OQ-38 확정, D-6).** "같은 곳으로 이어졌습니다" 같은 문구·연출이 이
// 화면 어디에도 없다. 참가자는 "확인했으니 안전하다"고 믿는 상태를 그대로 겪는다.
//
// ⚠️ **AC-006**: 시트가 통화 셸 하단의 종료 버튼을 덮으므로, 이 시트 **안에** 자체 "훈련 종료"를
// 둔다(선례: InCallSmsOverlay·MessengerFakeLanding, D-68 Reason ①/Impact).
//
// ⭐⭐ **G272/D-68** — "훈련용 모의 화면입니다. 이 화면에서만 재현되며 실제로 전화가 걸리지
// 않습니다." 고지는 **이 시트에도 그대로 남아 있다**(삭제 대상이 아니다). ⛔ 단, 이 시트는 전환이
// 성사되면 **자동으로 닫히므로**, 전환 이후 세션 종료까지 상시 유지되는 **정본 자리는 이제
// `src/app/session/play/page.tsx`의 `verifyConnectedLabel` 블록**이다 — 이 파일의 고지는 그 정본을
// 대체하지 않고 병존한다(중복은 안전, §47.7 (†)).
import { useEffect } from "react";
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
  /** 전환 처리 실패 시 1줄 고지(P-4 — 침묵 실패 금지). 재시도 컨트롤은 없다(D-68 — 두 번째
   * 확인 컨트롤을 두지 않는다, C3). 참가자는 "그만두고 통화로 돌아가기"로 시트를 닫는다. */
  errorMessage: string | null;
  onClose: () => void;
  onEndTraining: () => void;
};

export default function VerifyCallOverlay({
  offer,
  callerLabel,
  elapsedLabel,
  dialing,
  errorMessage,
  onClose,
  onEndTraining,
}: VerifyCallOverlayProps) {
  // ⭐ D-68 — Esc로 닫을 수 있다(포커스 트랩은 없다 — 참가자가 이 화면에서 결정할 것이 없으므로
  // 포커스를 빼앗지 않는다). InCallSmsOverlay의 모달 트랩과 달리 이 화면은 비모달 시트다.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div
      role="region"
      aria-label="확인 부서 연결 — 훈련용 모의 화면"
      className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/55 sm:items-center sm:p-6"
    >
      {/* 바깥 탭으로 닫기(UX-031 Exit — 재연결 없이 원래 통화가 계속된다. 전환을 취소하지 않는다). */}
      <button
        type="button"
        aria-label="확인 화면 닫고 통화로 돌아가기"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
        tabIndex={-1}
      />

      <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#FAF8F5] sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-[20px] sm:shadow-2xl">
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
          <h2 className="mb-1 text-xl font-bold text-[#22303A]">확인 부서로 연결 요청</h2>
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

          {/* Error — 재연결 실패 시 1줄(P-4 — 침묵 실패 금지). ⛔ 재시도 컨트롤은 없다(D-68/C3 —
              두 번째 확인 컨트롤을 두지 않는다). 아래 "그만두고 통화로 돌아가기"로 시트를 닫으면
              원래 통화로 복귀한다(UF-011 Failure (c)). */}
          {errorMessage && (
            <p role="alert" className="mt-4 text-base leading-relaxed text-[#C6392F]">
              {errorMessage}
            </p>
          )}
        </div>

        {/* ⭐⭐ D-68 — 수락 Primary Action이 사라졌다. 전환은 이 시트가 뜨는 순간 이미 시작돼
            있다(호출부가 `handlePlaceVerifyCall`을 함께 부른다). 남는 컨트롤은 아래 하나뿐이다 —
            전환을 취소하지 않고 시트만 치운다. */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-[#E2DDD3] bg-white px-4 py-3">
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
