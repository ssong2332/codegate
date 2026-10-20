"use client";

// 드릴다운 선택 카드(UX-015 유형 선택 · UX-016 방식 선택 공용, T28) — docs/UX.md P-12/Accessibility.
// 두 화면 모두 "큰 카드 2개 중 하나를 탭하면 즉시 다음 단계로 이동"하는 동일한 패턴을 쓰므로
// 여기서 한 번만 구현하고 재사용한다(중복 최소화). 선택 상태는 색만으로 표기하지 않고 굵은
// 테두리+배경색+체크 아이콘으로 이중 표기한다(기존 scenarios/page.tsx 카드 스타일 관례 계승).
// 시안 A(UX D-132 (2)): 이모지 대신 자체 선 아이콘을 남색 틴트 사각(8px)에 담는다 · 모서리 8px.
import LineIcon, { type LineIconName } from "./ui/LineIcon";

export function DrilldownOptionCard({
  icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: LineIconName;
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
      className={`flex min-h-[48px] w-full items-start gap-4 rounded-[8px] border-2 p-4 text-left transition ${
        selected
          ? "border-brand bg-brand-tint"
          : "border-line bg-surface hover:border-line-strong"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] ${
          selected ? "bg-brand text-white" : "bg-brand-tint text-brand"
        }`}
      >
        <LineIcon name={icon} size={24} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-lg font-bold text-ink">{title}</span>
          {selected && (
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-base font-bold text-white"
            >
              ✓
            </span>
          )}
        </span>
        <span className="text-base text-ink-sub">{description}</span>
      </span>
    </button>
  );
}
