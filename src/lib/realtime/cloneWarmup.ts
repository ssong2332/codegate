// §143.22 — 챌린지 링크가 열린 순간 복제 합성 서버를 켜고, 받는 사람 대기 화면에 실제 서버 단계를 알려 주는 제어기.
// 서버 호출은 주입한다(시험 · 화면 공용). ⛔ 동시에 서버를 부르는 요청은 늘 1개(겹치면 Modal 컨테이너가 하나 더 켜진다 — 서버 WT5도 막는다).
//
// 판정표 WW(대기 화면이 다음에 할 일):
// | 행  | 조건                               | 결과 |
// | WW1 | phase ready                         | advance — 벨(통화 화면)로 |
// | WW2 | phase off(대상 아님 · 미설정 · 한도) | advance — 대기 화면 없이 종전 흐름(연결 화면 CW 150초가 판정) |
// | WW3 | phase failed                        | give-up — 다시 시도 · 나가기 |
// | WW4 | 경과 ≥ 150초(CW3와 같은 값)          | give-up |
// | WW5 | 그 밖(booting · loading · warming)   | wait — 2초 뒤 다시 묻는다 |
export type WarmPhase = "off" | "booting" | "loading" | "warming" | "ready" | "failed";
export type WarmDecision = "advance" | "give-up" | "wait";

export const WARM_WAIT_LIMIT_MS = 150_000; // = cloneTts.ts CLONE_TTS_READY_TIMEOUT_MS(CW3) — 시험이 대조
export const WARM_POLL_INTERVAL_MS = 2_000;

export function decideWarmWait(phase: WarmPhase, elapsedMs: number): WarmDecision {
  if (phase === "ready" || phase === "off") return "advance"; // WW1 · WW2
  if (phase === "failed") return "give-up"; // WW3
  if (elapsedMs >= WARM_WAIT_LIMIT_MS) return "give-up"; // WW4
  return "wait"; // WW5
}

/** 대기 화면에 보이는 단계(서버 phase 순서 그대로 · 가짜 진행 0). index = 지금 단계. */
export const WARM_STAGES = [
  { phase: "booting", label: "서버 켜는 중" },
  { phase: "loading", label: "음성 모델 불러오는 중" },
  { phase: "warming", label: "목소리 엔진 준비 중" },
  { phase: "ready", label: "준비 완료" },
] as const;

export function warmStageIndex(phase: WarmPhase): number {
  const i = WARM_STAGES.findIndex((s) => s.phase === phase);
  return i < 0 ? 0 : i;
}

/** stage = 화면에 표시할 마지막 실제 단계(failed · off가 와도 앞 단계를 유지 — 어디서 멈췄는지 보여 준다). */
export type WarmSnapshot = { phase: WarmPhase; stage: WarmPhase; decision: WarmDecision; startedAtMs: number; answered: boolean; answeredAtMs: number };

/** Modal 컨테이너는 마지막 요청 5분 뒤 내려간다(scaledown_window=300). 그보다 여유 있게 4분 지난 '준비 완료'는 다시 확인한다. */
export const WARM_READY_FRESH_MS = 240_000;

/** 동의 순간 — 다시 물어야 하나(give-up · 오래된 ready = 예 · 진행 중 · off · 새 ready = 아니오). */
export function needsFreshWarmCheck(s: WarmSnapshot, nowMs: number): boolean {
  if (s.decision === "give-up") return true;
  return s.decision === "advance" && s.phase === "ready" && nowMs - s.answeredAtMs >= WARM_READY_FRESH_MS;
}

type Deps = { call: () => Promise<WarmPhase>; now: () => number; sleep: (ms: number) => Promise<void> };

export function createCloneWarmup(deps: Deps) {
  let snap: WarmSnapshot = { phase: "booting", stage: "booting", decision: "wait", startedAtMs: deps.now(), answered: false, answeredAtMs: 0 };
  let running = false;
  let gen = 0; // 다시 시도 · 멈춤 때 앞 반복을 끊는다
  const listeners = new Set<(s: WarmSnapshot) => void>();
  const set = (s: WarmSnapshot) => {
    snap = s;
    listeners.forEach((l) => l(s));
  };

  async function loop(my: number) {
    running = true;
    try {
      for (;;) {
        const phase = await deps.call(); // 한 번에 하나 — 앞 응답이 와야 다음을 부른다
        if (my !== gen) return;
        const now = deps.now();
        const decision = decideWarmWait(phase, now - snap.startedAtMs);
        set({ ...snap, phase, stage: phase === "failed" || phase === "off" ? snap.stage : phase, decision, answered: true, answeredAtMs: now });
        if (decision !== "wait") return;
        await deps.sleep(WARM_POLL_INTERVAL_MS);
        if (my !== gen) return;
      }
    } finally {
      if (my === gen) running = false;
    }
  }

  return {
    /** 시작 · 멈춘 뒤 이어 가기(이미 돌거나 끝났으면 아무것도 안 함 — 같은 링크 다시 들어옴 · 동의 뒤 재사용). */
    start() {
      if (running || snap.decision !== "wait") return;
      void loop(gen);
    },
    /** give-up 뒤 다시 시도 — 시간을 새로 잰다. */
    retry() {
      if (running) return;
      gen += 1;
      set({ phase: "booting", stage: "booting", decision: "wait", startedAtMs: deps.now(), answered: false, answeredAtMs: 0 });
      void loop(gen);
    },
    stop() {
      gen += 1;
      running = false;
    },
    get: () => snap,
    subscribe(l: (s: WarmSnapshot) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export type CloneWarmup = ReturnType<typeof createCloneWarmup>;
