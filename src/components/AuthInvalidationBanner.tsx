"use client";

// 인증 무효화 배너 (T128, Architecture.md §34.4 · G151).
//
// ⛔ **훈련 트리의 상위 래퍼로 두지 말 것**(G151). 이 컴포넌트는 `RouteGuard` 안에서 `{children}`의
//    **형제 노드**로만 렌더된다. 래퍼로 감싸면 이 처방이 고치려던 언마운트를 스스로 재현한다
//    (`src/app/session/play/page.tsx` 상단 G10 규칙: early return·상위 래퍼·`key` 변경·router.push
//    중 어느 하나라도 하면 실시간 세션·마이크·타이머가 끊긴다).
// ⛔ **비차단**이다 — 화면을 덮지 않고, 뒤 화면의 조작을 막지 않는다. 강제하면 꺼진다(§34.6 3행).
// ⚠️ 문면은 `src/lib/authinvalidation/copy.ts` 한 곳에만 있다(ux-design 인계 — §34.11).
import type { AuthInvalidationState } from "@/lib/authinvalidation";

export default function AuthInvalidationBanner({ state }: { state: AuthInvalidationState }) {
  if (state.mode === "none") return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 px-3 pt-3 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto mx-auto max-w-[520px] rounded-[12px] border border-[#B96A1B]/30 bg-[#FBF3E8] px-4 py-3 shadow-[0_2px_10px_rgba(34,48,58,0.12)]"
      >
        <div className="flex items-start gap-2.5">
          <span
            className="mt-[3px] text-[15px] font-bold leading-none text-[#B96A1B]"
            aria-hidden="true"
          >
            ⓘ
          </span>
          <div className="flex-1">
            <p className="text-[13px] leading-[1.55] text-[#22303A]">{state.message}</p>
            {state.notice ? (
              <p className="mt-1 text-[12px] leading-[1.55] text-[#6B7680]">{state.notice}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={state.onAction}
            disabled={state.busy}
            className="shrink-0 rounded-[8px] bg-[#22303A] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {state.busy ? "진행 중…" : state.actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
