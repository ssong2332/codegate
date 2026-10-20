// "AI 훈련용 합성" 표식 — 공용 컴포넌트 (AC-022, DECISIONS #7, Architecture.md §6.3/D-3).
// 합성 오디오/이미지가 표시되는 모든 화면(UX-005/006/009)에서 재사용.
// 화면 상시 라벨 노출 담당. 오디오 프리롤 안내 문구는 별도(재생 로직 소유 트랙, T5).
// 디자인(claude.ai/design 옵션 탐색, 1x 파운데이션): 보라 계열(#5B4B9E) 전용 배지, 아이콘+텍스트
// 병행(색 단독 구분 금지). 재생 중에도 점멸하지 않고 고정 노출(불안 유발 방지).
type SyntheticLabelProps = {
  label?: string;
  className?: string;
};

export default function SyntheticLabel({
  label = "AI 훈련용 합성",
  className = "",
}: SyntheticLabelProps) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-[7px] rounded-full border-[1.5px] border-ai bg-ai-tint px-3.5 py-1.5 text-base font-semibold text-ai-ink ${className}`}
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-ai text-[13px] font-extrabold text-white"
      >
        AI
      </span>
      {label}
    </span>
  );
}
