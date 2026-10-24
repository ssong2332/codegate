// 통화 중 발화 인디케이터 (UX-014, 2026-07-22).
// 실시간 speech-to-speech 통화에서는 자막이 늦거나 없을 수 있어, "지금 상대가 말하고 있다 /
// 내가 말할 차례다"를 시각적으로 알려주는 장치가 필요하다. 색만으로 구분하지 않고 텍스트 라벨을
// 항상 함께 노출한다(접근성 — 색 단독 구분 금지, UX.md Accessibility).
type CallWaveformProps = {
  /** true면 상대(사기범)가 말하는 중 — 파형이 움직인다. false면 정지(내 차례). */
  active: boolean;
  label: string;
  /** §130.6(N4) — 키패드가 열려 자리가 모자랄 때 막대를 접는다. 상태 글(`label` — 폴백의 "듣고 있어요" · "보내는 중")은 그대로 남는다(G289). */
  compact?: boolean;
};

const BAR_DELAYS_MS = [0, 150, 300, 450, 200];

export default function CallWaveform({ active, label, compact = false }: CallWaveformProps) {
  return (
    <div className="flex flex-col items-center gap-2" role="status" aria-live="polite">
      <div className={`${compact ? "hidden" : "flex"} h-8 items-center justify-center gap-[5px]`} aria-hidden="true">
        {BAR_DELAYS_MS.map((delay, index) => (
          <span
            key={index}
            className={`w-[4px] rounded-full bg-[var(--call-wave,#7CD9C2)] ${active ? "call-wave-bar h-7" : "h-2 opacity-40"}`}
            style={active ? { animationDelay: `${delay}ms` } : undefined}
          />
        ))}
      </div>
      <p className="text-base font-semibold text-[var(--call-fg-sub,#9FB0BA)]">{label}</p>
    </div>
  );
}
