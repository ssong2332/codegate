// T103 회귀 방어 — **문자함이 닫히지 않던 결함**(2026-07-27 라이브 검증에서 발견, 병합 차단급).
//
// **무엇이 있었나.** 퇴장 연출이 `state:"finished"`로 끝났는데도 오버레이가 언마운트되지 않아,
// opacity 0인 `fixed inset-0` 레이어가 화면 전체를 계속 덮은 채 참가자가 통화 화면에 갇혔다.
// 언마운트가 React 합성 이벤트 `onAnimationEnd` **단 하나**에 걸려 있었기 때문이고, 그 이벤트는
// 이 저장소의 어떤 테스트로도 관측할 수 없어 **T103 구조 불변식 6건이 전부 통과한 채로** 빠져나갔다.
//
// ⇒ 여기서 고정하는 것은 *"퇴장 시퀀스는 어떤 경로로도 반드시, 정확히 한 번 완료된다"* 이다.
// 완료 신호가 오든(정상) 안 오든(이번 결함) 상한에서 닫힌다는 것을 **실제로 실행해** 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXIT_ANIMATION_FALLBACK_MS, runExitSequence } from "./closeSequence.ts";

/** 테스트가 시간을 지배한다 — 실제 타이머를 쓰지 않고 "상한 도달"을 명시적으로 발화시킨다. */
function fakeScheduler() {
  const pending = new Map<number, () => void>();
  let nextId = 1;
  return {
    schedule: (fn: () => void, ms: number) => {
      const id = nextId++;
      pending.set(id, fn);
      lastDelay = ms;
      return id;
    },
    cancelScheduled: (handle: unknown) => {
      pending.delete(handle as number);
    },
    /** 등록된 상한 타이머를 전부 발화시킨다. */
    fire: () => {
      for (const fn of [...pending.values()]) fn();
    },
    get pendingCount() {
      return pending.size;
    },
  };
}
let lastDelay = 0;

/** 영영 정착하지 않는 프로미스 = "완료 신호가 오지 않는" 이번 결함 상황. */
const neverSettles = new Promise<void>(() => {});

test("[T103/닫힘] 연출이 정상 완료되면 onDone이 1회 호출된다", async () => {
  const timers = fakeScheduler();
  let done = 0;
  runExitSequence({
    animations: [{ finished: Promise.resolve() }, { finished: Promise.resolve() }],
    schedule: timers.schedule,
    cancelScheduled: timers.cancelScheduled,
    onDone: () => done++,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, 1);
});

test("[T103/닫힘⭐] 완료 신호가 **영영 오지 않아도** 상한에서 반드시 닫힌다(이번 결함의 회귀)", async () => {
  const timers = fakeScheduler();
  let done = 0;
  runExitSequence({
    animations: [{ finished: neverSettles }],
    schedule: timers.schedule,
    cancelScheduled: timers.cancelScheduled,
    onDone: () => done++,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, 0, "아직은 기다린다");
  timers.fire();
  assert.equal(done, 1, "상한에 도달하면 완료 신호 없이도 닫혀야 한다 — 없으면 참가자가 갇힌다");
});

test("[T103/닫힘] 완료 신호와 상한이 **둘 다** 와도 onDone은 정확히 1회다", async () => {
  const timers = fakeScheduler();
  let done = 0;
  runExitSequence({
    animations: [{ finished: Promise.resolve() }],
    schedule: timers.schedule,
    cancelScheduled: timers.cancelScheduled,
    onDone: () => done++,
  });
  await new Promise((resolve) => setImmediate(resolve));
  timers.fire();
  assert.equal(done, 1);
});

test("[T103/닫힘] 취소된 애니메이션(finished reject)도 닫힘으로 이어진다", async () => {
  const timers = fakeScheduler();
  let done = 0;
  const rejected = Promise.reject(new Error("cancelled"));
  rejected.catch(() => undefined); // 테스트 러너의 unhandled rejection 방지
  runExitSequence({
    animations: [{ finished: rejected }],
    schedule: timers.schedule,
    cancelScheduled: timers.cancelScheduled,
    onDone: () => done++,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, 1, "reject를 흡수하지 않으면 정상 경로가 통째로 사라진다");
});

test("[T103/닫힘] 연출이 0건이면(연출 미시작·CSS 꺼짐) 즉시 닫는다", () => {
  const timers = fakeScheduler();
  let done = 0;
  runExitSequence({
    animations: [],
    schedule: timers.schedule,
    cancelScheduled: timers.cancelScheduled,
    onDone: () => done++,
  });
  assert.equal(done, 1);
  assert.equal(timers.pendingCount, 0, "기다릴 것이 없으면 타이머도 남기지 않는다");
});

test("[T103/A5] 취소하면 이후 어떤 경로로도 onDone이 오지 않는다(호스트 선(先)언마운트)", async () => {
  const timers = fakeScheduler();
  let done = 0;
  const cancel = runExitSequence({
    animations: [{ finished: Promise.resolve() }],
    schedule: timers.schedule,
    cancelScheduled: timers.cancelScheduled,
    onDone: () => done++,
  });
  cancel(); // 한도 자동 종료·훈련 종료가 먼저 오버레이를 내린 상황
  await new Promise((resolve) => setImmediate(resolve));
  timers.fire();
  assert.equal(done, 0, "이미 언마운트된 뒤 늦은 완료 신호가 닫기를 또 부르면 안 된다");
});

test("[T103/닫힘] 상한은 CSS 퇴장 지속시간보다 길다(둘이 어긋나면 연출이 잘린다)", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const durations = [...css.matchAll(/\.sms-(?:surface|dim)-exit\s*\{\s*animation:[^;]*?([\d.]+)s/g)].map(
    (m) => Number(m[1]) * 1000,
  );
  assert.ok(durations.length >= 2, `퇴장 클래스의 지속시간을 파싱하지 못했다: ${durations.join(", ")}`);
  const longest = Math.max(...durations);
  assert.ok(
    EXIT_ANIMATION_FALLBACK_MS > longest,
    `상한(${EXIT_ANIMATION_FALLBACK_MS}ms)이 퇴장 연출(${longest}ms)보다 짧으면 연출이 잘린다`,
  );
  assert.equal(lastDelay, EXIT_ANIMATION_FALLBACK_MS, "기본 상한이 실제로 쓰여야 한다");
});
