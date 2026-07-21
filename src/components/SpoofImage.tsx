// UX-009 사칭 이미지 (P1, Track B, T12, AC-025/AC-022) — 핵심 루프 비차단.
// T2 스캐폴딩 스텁: 정적 사칭 이미지 에셋 + SyntheticLabel 오버레이는 T12에서 구현.
type SpoofImageProps = {
  src?: string;
  alt?: string;
};

export default function SpoofImage(_props: SpoofImageProps) {
  return null;
}
