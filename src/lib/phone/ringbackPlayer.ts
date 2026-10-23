// §121(1) — 보이스톡 발신 연결음(DOM 부작용). 음원 파일 0 — `OscillatorNode` + `GainNode`(벨 `ringtonePlayer.ts`와 같은 방식).
// 컨텍스트는 대화방 보이스톡 탭 안에서 만든 **통화 출력 컨텍스트**를 빌려 쓴다(제스처 안에서 깨운 것이라 iOS에서도 소리가 난다 —
// 추정). 컨텍스트는 닫지 않는다(통화가 그대로 쓴다) — `stop()`은 예약한 소리만 끊는다(멱등).
// ⚠️ 브라우저 API에 강결합돼 루트 테스트 러너로 실행하지 않는다 — 배선은 `voiceTalkDial.test.ts` 소스 스캔이 고정한다.

export type RingbackTone = { freqsHz: readonly number[]; onMs: number; offMs: number; peak: number };

export function startRingback(ctx: AudioContext | null | undefined, tone: RingbackTone): () => void {
  if (!ctx || ctx.state === "closed") return () => {};
  const master = ctx.createGain();
  master.gain.value = tone.peak / tone.freqsHz.length;
  master.connect(ctx.destination);
  const oscillators = tone.freqsHz.map((freq) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(master);
    osc.start();
    return osc;
  });
  const cycleMs = tone.onMs + tone.offMs;
  // 1주기 = 울림 → 쉼. 다음 주기는 타이머로 예약한다(오디오 시계 기준 예약 — 탭이 잠깐 멈춰도 박자가 밀리지 않게 2주기씩).
  let scheduledUntil = ctx.currentTime;
  const schedule = () => {
    while (scheduledUntil < ctx.currentTime + (2 * cycleMs) / 1000) {
      const start = Math.max(scheduledUntil, ctx.currentTime);
      master.gain.setValueAtTime(tone.peak / tone.freqsHz.length, start);
      master.gain.setValueAtTime(0, start + tone.onMs / 1000);
      scheduledUntil = start + cycleMs / 1000;
    }
  };
  schedule();
  const timer = setInterval(schedule, cycleMs);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime);
      for (const osc of oscillators) {
        osc.stop();
        osc.disconnect();
      }
      master.disconnect();
    } catch {
      // 이미 닫힌 컨텍스트 — 소리는 이미 없다.
    }
  };
}
