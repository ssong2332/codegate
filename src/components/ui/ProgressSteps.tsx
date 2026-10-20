// 공용 상단 진행 표시 (디자인 시스템.dc.html "5 · 상단 진행 표시" — 3단계 브레드크럼).
// 완료/현재 = 채워진 5px 바(brand), 미완료 = 옅은 바(line). 각 단계 하단에 라벨(시안 A 토큰 · UX D-132).

export type ProgressStep = { label: string };

export default function ProgressSteps({ steps, currentIndex }: { steps: ProgressStep[]; currentIndex: number }) {
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={steps.length}>
      {steps.map((step, i) => {
        const active = i <= currentIndex;
        return (
          <div key={step.label} className="flex-1 flex flex-col gap-2">
            <div className={`h-[5px] rounded-full ${active ? "bg-brand" : "bg-line"}`} />
            <p className={`text-[14px] text-center ${active ? "font-semibold text-brand" : "font-medium text-ink-sub"}`}>
              {step.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
