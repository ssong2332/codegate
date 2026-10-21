// §99 — 통화 중 화면 자동 꺼짐 방지(Screen Wake Lock) 제어기. 브라우저 API는 가짜로 주입한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createScreenWakeLock, type WakeLockStatus } from "./screenWakeLock.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeEnv(options: { supported?: boolean; reject?: boolean } = {}) {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: "visible",
    addEventListener: (_t: "visibilitychange", l: () => void) => listeners.add(l),
    removeEventListener: (_t: "visibilitychange", l: () => void) => listeners.delete(l),
  };
  const sentinels: { released: boolean; releaseCalls: number; fire: () => void }[] = [];
  let requests = 0;
  const nav =
    options.supported === false
      ? {}
      : {
          wakeLock: {
            request: async () => {
              requests += 1;
              if (options.reject) throw new Error("NotAllowedError");
              let onRelease: (() => void) | null = null;
              const s = {
                released: false,
                releaseCalls: 0,
                fire: () => {
                  s.released = true;
                  onRelease?.();
                },
                release: async () => {
                  s.releaseCalls += 1;
                  s.released = true;
                },
                addEventListener: (_t: "release", l: () => void) => {
                  onRelease = l;
                },
              };
              sentinels.push(s);
              return s;
            },
          },
        };
  const setVisibility = (v: "visible" | "hidden") => {
    doc.visibilityState = v;
    listeners.forEach((l) => l());
  };
  return { doc, nav, sentinels, listeners, setVisibility, requests: () => requests };
}

test("[§99] 지원 없음 → unsupported(통화는 계속 · 화면이 안내 문구로 대신)", () => {
  const env = fakeEnv({ supported: false });
  const statuses: WakeLockStatus[] = [];
  createScreenWakeLock({ nav: env.nav, doc: env.doc, onStatus: (s) => statuses.push(s) }).start();
  assert.deepEqual(statuses, ["unsupported"]);
});

test("[§99] 요청 거부 → denied", async () => {
  const env = fakeEnv({ reject: true });
  const statuses: WakeLockStatus[] = [];
  createScreenWakeLock({ nav: env.nav, doc: env.doc, onStatus: (s) => statuses.push(s) }).start();
  await tick();
  assert.deepEqual(statuses, ["denied"]);
});

test("[§99] 시작 → active · 가려지면 브라우저가 풀고(released) · 돌아오면 다시 요청 → active", async () => {
  const env = fakeEnv();
  const statuses: WakeLockStatus[] = [];
  const lock = createScreenWakeLock({ nav: env.nav, doc: env.doc, onStatus: (s) => statuses.push(s) });
  lock.start();
  await tick();
  assert.equal(env.requests(), 1);
  env.doc.visibilityState = "hidden";
  env.sentinels[0].fire();
  env.setVisibility("hidden");
  assert.equal(env.requests(), 1, "가려진 문서에서는 요청하지 않는다");
  env.setVisibility("visible");
  await tick();
  assert.equal(env.requests(), 2);
  assert.deepEqual(statuses, ["active", "released", "active"]);
});

test("[§99] stop → 잠금 해제 · 리스너 제거 · 멱등", async () => {
  const env = fakeEnv();
  const lock = createScreenWakeLock({ nav: env.nav, doc: env.doc });
  lock.start();
  await tick();
  lock.stop();
  lock.stop();
  assert.equal(env.sentinels[0].releaseCalls, 1);
  assert.equal(env.listeners.size, 0);
});

test("[§99] 요청이 끝나기 전에 stop → 받은 잠금을 바로 푼다(누수 0)", async () => {
  const env = fakeEnv();
  const lock = createScreenWakeLock({ nav: env.nav, doc: env.doc });
  lock.start();
  lock.stop();
  await tick();
  assert.equal(env.sentinels[0].releaseCalls, 1);
});
