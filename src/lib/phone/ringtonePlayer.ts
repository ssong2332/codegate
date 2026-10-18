// T190-4 — 수신 벨소리·진동 재생(DOM 부작용) (UX D-97 · docs/Architecture.md §74.7 · AC-093 (a)(b)(e)).
//
// ⚠️ 이 파일은 브라우저 API(`AudioContext` · `navigator.vibrate`)에 강결합돼 루트 테스트 러너로 실행할 수
// 없다(R-2 — 테스트는 순수 부분 `ringtone.ts` · `vibration.ts`만). 배선은 `ringtone.test.ts`(G454)가
// `play/page.tsx` 소스 스캔으로 고정한다.
//
// 규칙(§74.7):
//   - 음원 파일 0 — `OscillatorNode` + `GainNode` 엔벨로프 합성(§74.3 A-3/A-6).
//   - `resume()` 뒤에도 `state !== "running"`이면 **무음으로 끝낸다**(자동재생 거부 — 오류 문구 0 · D-97).
//     ⏳ iOS는 그 화면에서의 탭 없이 소리를 낼 수 없을 것으로 **추정**(§74.2 ③-b) — `pre-call-notice`(T190-8b)의
//     "준비됐어요" 탭이 `primedContext`를 넘길 때까지 무음일 수 있다(User 결정 OQ-A95 ⓐ — 그대로 둔다).
//   - 60초 뒤 소리·진동만 멈춘다(화면 연출은 계속 — UX-014 v1.33 (10) ②).
//   - `stop()`은 멱등이며 `AudioContext.close()`까지 한다(통화 오디오 컨텍스트와 공존 시간 0).
//     ⭐ 2026-10-18 개정(reviewer M3 · 라이브 d13e718 Android 무음 조사) — 이 규칙의 목적은 **벨 소리와 통화 오디오가
//     겹쳐 들리지 않는 것**(§74.7 "실시간 오디오와 겹침 0")이다. 받기에서는 `holdOpen()`이 **소리·진동을 즉시 0으로**
//     만들고(예약 오실레이터 정지 · 엔벨로프 분리 · 타이머 정리) 컨텍스트 `close()`만 통화 오디오가 running이 된 뒤로
//     미룬다 — "벨 컨텍스트를 닫은 직후 통화 컨텍스트를 만드는 순서"가 Android 무음 원인 후보라 그 순서를 가를 수
//     있게 하려는 것이다(`?ringclose=immediate`면 종전대로 즉시 close). 소리 공존 시간은 여전히 0이다.
//     ⏳ §74.7 문서 개정은 Docs 단계로 넘긴다.
//   - ⛔ `navigator.audioSession.type`을 바꾸지 않는다(§74.2 ③-c — 페이지 전체 오디오에 걸리는 전역 설정).
import type { MessengerSkin } from "../messenger/detectSkin";
import { RING_MAX_MS, ringCycleCount, ringPatternFor, tonesWithinCap, type RingTone } from "./ringtone";
import { canVibrate, vibrationPatternFor } from "./vibration";

export type IncomingAlert = {
  stop: () => void;
  /**
   * 소리·진동을 **즉시** 멈추되 컨텍스트는 열어 둔다. 반환값(`release`)을 부르면 그때 닫는다(멱등). 이 뒤의 `stop()`은
   * 아무것도 하지 않는다(이미 멈췄다). ⛔ 반환값을 부르는 쪽이 반드시 닫아야 한다(호출부의 해제 판정 + 언마운트 cleanup).
   */
  holdOpen: () => () => void;
};

/** 자동재생 판정 유예 — `resume()`이 이 안에 `running`이 되지 않으면 무음으로 끝낸다(판단값). */
const RESUME_GRACE_MS = 600;

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  // lib.dom은 `AudioContext`를 Window 속성이 아니라 전역 값으로 선언한다 — 전역으로 확인한다.
  if (typeof AudioContext !== "undefined") return AudioContext;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return w.webkitAudioContext ?? null;
}

type ScheduledVoice = { osc: OscillatorNode; envelope: GainNode };

function scheduleTone(
  ctx: AudioContext,
  tone: RingTone,
  cycleStartAt: number,
  voices: Set<ScheduledVoice>,
): void {
  const start = cycleStartAt + tone.atMs / 1000;
  const end = start + tone.durMs / 1000;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.linearRampToValueAtTime(tone.peak / tone.freqsHz.length, start + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  envelope.connect(ctx.destination);
  for (const freq of tone.freqsHz) {
    const osc = ctx.createOscillator();
    osc.type = tone.wave;
    osc.frequency.setValueAtTime(freq, start);
    osc.connect(envelope);
    osc.start(start);
    osc.stop(end + 0.02);
    const voice = { osc, envelope };
    voices.add(voice);
    osc.onended = () => voices.delete(voice);
  }
}

/**
 * `incoming` 동안 벨소리·진동을 반복한다. 반환값의 `stop()`을 받기·거절·종료·이탈 어디서든 부른다.
 * @param options.primedContext D-102 대비 구멍(§74.7) — 나중에 "준비됐어요" 탭 핸들러 안에서 만든
 *   컨텍스트를 넘길 수 있게 인자만 미리 둔다(지금은 호출부가 넘기지 않는다).
 */
export function startIncomingAlert(
  skin: MessengerSkin,
  options: { primedContext?: AudioContext } = {},
): IncomingAlert {
  const pattern = ringPatternFor(skin);
  const totalCycles = ringCycleCount(pattern, RING_MAX_MS);
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const vibration = canVibrate(nav) ? vibrationPatternFor(skin) : null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;
  let ctx: AudioContext | null = null;
  // holdOpen이 즉시 멈출 수 있도록 예약한 음을 들고 있는다.
  const voices = new Set<ScheduledVoice>();

  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timers.add(timer);
  };

  const closeAudio = () => {
    const current = ctx;
    ctx = null;
    if (current) void current.close().catch(() => {});
  };

  const vibrateOnce = (value: number[] | 0) => {
    if (!vibration || !nav) return;
    try {
      nav.vibrate(value);
    } catch {
      // 진동 실패는 조용히 흡수한다(오류 문구 0 — AC-093 (e)).
    }
  };

  const silenceAll = () => {
    closeAudio();
    vibrateOnce(0);
  };

  try {
    const Ctor = audioContextCtor();
    ctx = options.primedContext ?? (Ctor ? new Ctor() : null);
  } catch {
    ctx = null;
  }

  const runCycle = (cycleIndex: number) => {
    if (stopped) return;
    if (cycleIndex >= totalCycles) {
      silenceAll();
      return;
    }
    if (ctx && ctx.state === "running") {
      const cycleStartAt = ctx.currentTime + 0.03;
      for (const tone of tonesWithinCap(pattern, cycleIndex, RING_MAX_MS)) scheduleTone(ctx, tone, cycleStartAt, voices);
    }
    if (vibration) vibrateOnce([...vibration]);
    later(() => runCycle(cycleIndex + 1), pattern.cycleMs);
  };
  // 첫 주기는 `resume()`이 끝나거나 유예가 지난 뒤 시작한다 — 그때도 `running`이 아니면 무음(진동만 — 지원 시).
  let begun = false;
  const begin = () => {
    if (begun || stopped) return;
    begun = true;
    if (ctx && ctx.state !== "running") closeAudio();
    runCycle(0);
  };
  if (ctx) {
    ctx.resume().then(begin, begin);
    later(begin, RESUME_GRACE_MS);
  } else {
    begin();
  }

  const haltTimers = () => {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };

  return {
    stop: () => {
      if (stopped) return;
      haltTimers();
      silenceAll();
    },
    holdOpen: () => {
      if (!stopped) {
        haltTimers();
        // 소리 즉시 0 — 예약·재생 중인 음을 멈추고 엔벨로프를 떼어 낸다(컨텍스트는 닫지 않는다).
        for (const voice of voices) {
          try {
            voice.osc.stop();
          } catch {
            // 이미 끝난 음은 무시.
          }
          voice.envelope.disconnect();
        }
        voices.clear();
        vibrateOnce(0);
      }
      return closeAudio; // 멱등(ctx를 비운 뒤 닫는다)
    },
  };
}

/**
 * T190-8b(§74.7 "D-102 대비 구멍" · §74.12 (3) ⑤ · OQ-A95 ⓐ) — "준비됐어요" 탭 핸들러 **안**(사용자 제스처)에서
 * 벨용 오디오 컨텍스트를 만들고 깨운다. iOS Safari는 그 화면에서의 탭 없이 소리를 낼 수 없을 것으로 **추정**되므로
 * (§74.2 ③-b) 여기서 만든 컨텍스트를 `startIncomingAlert(skin, { primedContext })`로 넘긴다. 실패 = `null`(무음 폴백 —
 * 오류 문구 0). ⚠️ 에스컬레이션 진입은 이 탭이 없어 iOS 벨이 여전히 무음일 수 있다(OQ-A95 ⓐ 범위 — 그대로 둔다).
 */
export function primeIncomingAlertAudio(): AudioContext | null {
  try {
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    const ctx = new Ctor();
    void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}
