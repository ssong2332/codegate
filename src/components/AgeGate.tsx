// UX-011 age-gate (P1, Track C, T14, AC-014) — 핵심 루프 비차단.
// T2 스캐폴딩 스텁: 최소 연령 확인 UI/로직은 T14에서 구현(OQ-8 연령값 확정 후).
type AgeGateProps = {
  onConfirm?: () => void;
};

export default function AgeGate(_props: AgeGateProps) {
  return null;
}
