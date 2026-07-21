// "AI 훈련용 합성" 표식 — 공용 컴포넌트 (AC-022, DECISIONS #7, Architecture.md §6.3/D-3).
// 합성 오디오/이미지가 표시되는 모든 화면(UX-005/006/009)에서 재사용.
// 화면 상시 라벨 노출 담당. 오디오 프리롤 안내 문구는 별도(재생 로직 소유 트랙, T5).
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
      className={`inline-block rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-900 ${className}`}
    >
      {label}
    </span>
  );
}
