// 상시 종료 컨트롤 — 공용 컴포넌트 (AC-006, D-3 "P-2", Architecture.md §2).
// 모든 세션 화면(UX-005/006)에서 항상 보이는 단일 종료 컨트롤. 실제 endSession 호출·
// 라우팅 로직은 소유 트랙(T8)이 onClick으로 주입한다 — 이 컴포넌트는 프레젠테이션만 담당.
type EndTrainingButtonProps = {
  onClick: () => void;
  disabled?: boolean;
};

export default function EndTrainingButton({
  onClick,
  disabled = false,
}: EndTrainingButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded bg-red-600 px-4 py-3 text-base font-bold text-white hover:bg-red-700 disabled:opacity-50"
      aria-label="훈련 즉시 종료"
    >
      훈련 종료
    </button>
  );
}
