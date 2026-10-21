// 상시 종료 컨트롤 — 공용 컴포넌트 (AC-006, D-3 "P-2", Architecture.md §2).
// 모든 세션 화면(UX-005/006)에서 항상 보이는 단일 종료 컨트롤. 실제 endSession 호출·
// 라우팅 로직은 소유 트랙(T8)이 onClick으로 주입한다 — 이 컴포넌트는 프레젠테이션만 담당.
// 디자인(claude.ai/design 옵션 탐색, 1x 파운데이션): 채움 빨강이 아닌 외곽선형 — "비상구" 인상,
// 공격적이지 않게. 정지(■) 아이콘 병행(색 단독 구분 금지).
type EndTrainingButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  variant?: "light" | "dark";
  /**
   * §95(UX D-138) — 카톡형 대화방 머리줄용 작은 모양(실기 신고 11 *"상단의 훈련 종료가 카톡과 다르다"*). 상시 보임 · 1탭 즉시 ·
   * 같은 접근 가능한 이름(AC-006 R-4)은 그대로 — 크기 · 강조만 줄인다(터치 영역 44px 유지). 부재 = 종전 모양.
   */
  compact?: boolean;
};

export default function EndTrainingButton({
  onClick,
  disabled = false,
  variant = "light",
  compact = false,
}: EndTrainingButtonProps) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label="훈련 즉시 종료"
        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-white px-3 text-[14px] font-semibold text-danger disabled:opacity-50"
      >
        <span aria-hidden="true" className="h-[10px] w-[10px] rounded-[2px] bg-danger" />
        종료
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="훈련 즉시 종료"
      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-[8px] border-2 border-danger px-4 py-2.5 text-lg font-bold text-danger disabled:opacity-50 ${
        variant === "dark" ? "bg-white/95" : "bg-white hover:bg-danger-tint"
      }`}
    >
      <span aria-hidden="true" className="h-[13px] w-[13px] rounded-[3px] bg-danger" />
      훈련 종료
    </button>
  );
}
