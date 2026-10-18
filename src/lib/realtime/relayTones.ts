// 릴레이 끊김음 · 연결음 재생기 — T191 S7 / UX P-38 (4) · D-96 (5)(자체 합성음 — 실제 통신사 · OS 음원 0).
// 패턴 값은 순수 모듈 `relayHandover.ts`가 소유한다(이 파일은 Web Audio 배선만 — 브라우저 전용, 단위 테스트 밖).
// 음량은 통화 스피커 칸 음량 모드(D-98/D-103)를 받아 그 비율로 낮춘다.
import { RELAY_CUT_TONE, RELAY_RINGBACK_TONE } from "./relayHandover";

const TONE_GAIN = 0.12;

export type RelayToneHandle = { stop: () => void };

/** 끊김음 1회 → 연결음 반복. `stop()`까지 울린다. 오디오를 못 만들면 조용히 무음 핸들을 돌려준다(P-4 비차단). */
export function startRelayTones(volume = 1): RelayToneHandle {
  if (typeof window === "undefined") return { stop: () => undefined };
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return { stop: () => undefined };
  let ctx: AudioContext;
  try {
    ctx = new Ctor();
    void ctx.resume().catch(() => undefined);
  } catch {
    return { stop: () => undefined };
  }
  const master = ctx.createGain();
  master.gain.value = TONE_GAIN * Math.max(0, Math.min(1, volume));
  master.connect(ctx.destination);
  const beep = (freqs: readonly number[], startSec: number, durSec: number) => {
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(master);
      osc.start(startSec);
      osc.stop(startSec + durSec);
    }
  };
  const t0 = ctx.currentTime + 0.02;
  beep([RELAY_CUT_TONE.freqHz], t0, RELAY_CUT_TONE.ms / 1000);
  const cycleSec = (RELAY_RINGBACK_TONE.onMs + RELAY_RINGBACK_TONE.offMs) / 1000;
  let nextCycle = t0 + RELAY_CUT_TONE.ms / 1000;
  const scheduleAhead = () => {
    while (nextCycle < ctx.currentTime + cycleSec * 2) {
      beep(RELAY_RINGBACK_TONE.freqHz, nextCycle, RELAY_RINGBACK_TONE.onMs / 1000);
      nextCycle += cycleSec;
    }
  };
  scheduleAhead();
  const timer = setInterval(scheduleAhead, 500);
  let stopped = false;
  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      try {
        master.disconnect();
      } catch {
        // 이미 끊김
      }
      void ctx.close().catch(() => undefined);
    },
  };
}
