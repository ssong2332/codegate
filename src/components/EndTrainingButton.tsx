// 상시 종료 컨트롤 — 공용 컴포넌트 (AC-006, D-3 "P-2", Architecture.md §2).
// 모든 세션 화면(UX-005/006)에서 항상 보이는 단일 종료 컨트롤. 실제 endSession 호출·
// 라우팅 로직은 소유 트랙(T8)이 onClick으로 주입한다 — 이 컴포넌트는 프레젠테이션만 담당.
// 디자인(claude.ai/design 옵션 탐색, 1x 파운데이션): 채움 빨강이 아닌 외곽선형 — "비상구" 인상,
// 공격적이지 않게. 정지(■) 아이콘 병행(색 단독 구분 금지).
type EndTrainingButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  variant?: "light" | "dark";
};

export default function EndTrainingButton({
  onClick,
  disabled = false,
  variant = "light",
}: EndTrainingButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="훈련 즉시 종료"
      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 border-[#C6392F] px-4 py-2.5 text-base font-bold text-[#C6392F] disabled:opacity-50 ${
        variant === "dark" ? "bg-white/95" : "bg-white hover:bg-[#FDF1F0]"
      }`}
    >
      <span aria-hidden="true" className="h-[13px] w-[13px] rounded-[3px] bg-[#C6392F]" />
      훈련 종료
    </button>
  );
}
