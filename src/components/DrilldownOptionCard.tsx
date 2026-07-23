"use client";

// 드릴다운 선택 카드(UX-015 유형 선택 · UX-016 방식 선택 공용, T28) — docs/UX.md P-12/Accessibility.
// 두 화면 모두 "큰 카드 2개 중 하나를 탭하면 즉시 다음 단계로 이동"하는 동일한 패턴을 쓰므로
// 여기서 한 번만 구현하고 재사용한다(중복 최소화). 선택 상태는 색만으로 표기하지 않고 굵은
// 테두리+배경색+체크 아이콘으로 이중 표기한다(기존 scenarios/page.tsx 카드 스타일 관례 계승).
export function DrilldownOptionCard({
  icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-[48px] w-full items-start gap-4 rounded-2xl border-2 p-4 text-left transition ${
        selected
          ? "border-[#0E6B62] bg-[#E4F0EC]"
          : "border-[#E2DDD3] bg-white hover:border-[#C9C2B6]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl ${
          selected ? "bg-[#0E6B62] text-white" : "bg-[#41525E]/10 text-[#22303A]"
        }`}
      >
        {icon}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-lg font-bold text-[#22303A]">{title}</span>
          {selected && (
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0E6B62] text-sm font-bold text-white"
            >
              ✓
            </span>
          )}
        </span>
        <span className="text-sm text-[#6B655C]">{description}</span>
      </span>
    </button>
  );
}
