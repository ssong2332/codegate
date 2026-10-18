// T190-1 — 수신 벨소리 패턴(순수) (UX D-97 · docs/Architecture.md §74.4 · §74.7 · AC-093 (a) · AC-095 (a)).
//
// ⛔ **OS 벨소리 파일 0 · 선율 비복제**(§74.0 #2·#3 · §74.3 A-3/A-6). 아래 값은 *"OS 기본 벨소리의 음색
// (벨/마림바 계열)·주기·박자감"* 만 닮게 **자체 설계**한 것이다 — 한 패턴 안의 모든 음이 **같은 음 높이**
// (같은 화음)라 음 높이 순서(선율)가 존재하지 않는다. 선율 비복제는 자동 검사가 불가능해 reviewer 확인
// 항목이다(§74.7 — 정직 고지). 아래 `[G454]` 테스트는 "패턴 안 음 높이가 하나뿐"이라는 구조만 막는다.
//
// 재생은 `ringtonePlayer.ts`(Web Audio)가 이 표를 스케줄한다. 이 파일은 잎(leaf) 모듈이다(타입 import만).
import type { MessengerSkin } from "../messenger/detectSkin";

/** 최대 울림 시간(UX-014 v1.33 (10) ② — 60초 뒤 소리만 멈추고 화면 연출은 계속). */
export const RING_MAX_MS = 60_000;

export type RingWave = "sine" | "triangle";

export type RingTone = {
  /** 주기 시작 기준 시작 시각(ms). */
  atMs: number;
  durMs: number;
  /** 동시에 울리는 주파수들(같은 음의 배음 쌓기 — 음 높이 순서가 아니다). */
  freqsHz: readonly number[];
  wave: RingWave;
  /** 엔벨로프 최고 게인(0~1). 귀를 놀라게 하지 않도록 낮게 둔다(PRD Risk 심리적 충격). */
  peak: number;
};

export type RingPattern = { cycleMs: number; tones: readonly RingTone[] };

const repeat = (count: number, gapMs: number, tone: Omit<RingTone, "atMs">, offsetMs = 0): RingTone[] =>
  Array.from({ length: count }, (_, i) => ({ ...tone, atMs: offsetMs + i * gapMs }));

/** iOS형 — 맑은 벨 계열 짧은 4연타 + 쉼(자체 설계 · 근사). */
const IOS_RING: RingPattern = {
  cycleMs: 2400,
  tones: repeat(4, 150, { durMs: 110, freqsHz: [1318.5, 2637], wave: "triangle", peak: 0.16 }),
};

/** One UI형·기본 — 마림바 계열 3연타 두 묶음 + 쉼(자체 설계 · 근사). */
const ONE_UI_RING: RingPattern = {
  cycleMs: 3200,
  tones: [
    ...repeat(3, 200, { durMs: 160, freqsHz: [784, 1568], wave: "sine", peak: 0.2 }),
    ...repeat(3, 200, { durMs: 160, freqsHz: [784, 1568], wave: "sine", peak: 0.2 }, 1000),
  ],
};

export const RING_PATTERNS: Readonly<Record<MessengerSkin, RingPattern>> = {
  ios: IOS_RING,
  samsung: ONE_UI_RING,
  default: ONE_UI_RING,
};

export function ringPatternFor(skin: MessengerSkin): RingPattern {
  return RING_PATTERNS[skin];
}

/** 60초 상한 안에서 시작하는 주기 수. */
export function ringCycleCount(pattern: RingPattern, maxMs: number = RING_MAX_MS): number {
  return Math.ceil(maxMs / pattern.cycleMs);
}

/** 주기 `cycleIndex`에서 **상한 안에 끝나는** 음만(상한을 넘는 음은 자르지 않고 아예 뺀다 — 끊김 소리 방지). */
export function tonesWithinCap(
  pattern: RingPattern,
  cycleIndex: number,
  maxMs: number = RING_MAX_MS,
): RingTone[] {
  const cycleStart = cycleIndex * pattern.cycleMs;
  return pattern.tones.filter((tone) => cycleStart + tone.atMs + tone.durMs <= maxMs);
}
