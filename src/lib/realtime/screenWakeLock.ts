// §99 — 통화 중 화면 자동 꺼짐 방지(Screen Wake Lock API). 화면이 시간 초과로 꺼지면 마이크가 무음이 되고 소켓이 끊길 수
// 있다(`backgroundCall.ts` 머리 주석). 이 잠금이 막는 것은 **자동 꺼짐(시간 초과)뿐**이다 — 전원 버튼 · 다른 앱 전환은 막지
// 못하고, 탭이 가려지면 브라우저가 잠금을 스스로 푼다(명세). 그래서 화면에 돌아올 때마다 다시 요청한다.
//
// 지원: Chrome · 삼성 인터넷 · 웨일(Chromium 계열, 안드로이드) · Safari iOS 16.4+. iOS 홈 화면 앱(PWA)은 18.4 이전까지
// 동작하지 않았다(WebKit 254545) — 실패하면 상태 "denied"로 알리고 화면이 안내 문구로 대신한다(`SCREEN_OFF_COPY`).
// 브라우저 API는 주입받는다(테스트 — `screenWakeLock.test.ts`).

export type WakeLockStatus = "idle" | "unsupported" | "active" | "denied" | "released";

/**
 * ⭐ §105(2026-10-22 웨일 실기 — 화면을 끄지 않았다는데 §99 "화면이 꺼져 있던 동안" 배너가 떴다) — 화면이 보이는 채로 브라우저 · OS가
 * 잠금을 풀면(절전 모드 전환 등 — 명세상 가능) 예전에는 다음 `visibilitychange`까지 다시 요청하지 않아, 그 사이 화면이 시간 초과로
 * 꺼질 수 있었다(추정 경로). 이제 보이는 채로 풀리면 이 시간 뒤 다시 요청한다. 한 번 보이는 동안 최대 `MAX_VISIBLE_REREQUESTS`회(무한 반복 0).
 */
export const WAKE_LOCK_REREQUEST_DELAY_MS = 1000;
export const MAX_VISIBLE_REREQUESTS = 3;

type SentinelLike = {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

export type WakeLockDeps = {
  nav: { wakeLock?: { request: (type: "screen") => Promise<SentinelLike> } } | undefined;
  doc: {
    visibilityState: string;
    addEventListener: (type: "visibilitychange", listener: () => void) => void;
    removeEventListener: (type: "visibilitychange", listener: () => void) => void;
  };
  onStatus?: (status: WakeLockStatus) => void;
  /** 테스트 주입용 타이머(기본 = `setTimeout`). */
  schedule?: (fn: () => void, ms: number) => void;
};

export type ScreenWakeLock = { start: () => void; stop: () => void };

export function createScreenWakeLock(deps: WakeLockDeps): ScreenWakeLock {
  let wanted = false;
  let sentinel: SentinelLike | null = null;
  let requesting = false;
  let status: WakeLockStatus = "idle";
  let visibleRerequests = 0;
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms));
  const setStatus = (next: WakeLockStatus) => {
    if (next === status) return;
    status = next;
    deps.onStatus?.(next);
  };

  const request = () => {
    const api = deps.nav?.wakeLock;
    if (!api) {
      setStatus("unsupported");
      return;
    }
    // 가려진 문서에서는 요청이 거절된다(명세) — 돌아올 때 visibilitychange에서 다시 부른다.
    if (!wanted || requesting || deps.doc.visibilityState !== "visible") return;
    if (sentinel && !sentinel.released) return;
    requesting = true;
    api
      .request("screen")
      .then((s) => {
        requesting = false;
        if (!wanted) {
          void s.release().catch(() => {});
          return;
        }
        sentinel = s;
        s.addEventListener?.("release", () => {
          if (sentinel === s) sentinel = null;
          if (!wanted) return;
          setStatus("released");
          // §105 — 보이는 채로 풀렸으면 다시 요청한다(가려져서 풀린 것은 돌아올 때 `onVisibility`가 맡는다).
          if (deps.doc.visibilityState === "visible" && visibleRerequests < MAX_VISIBLE_REREQUESTS) {
            visibleRerequests += 1;
            schedule(request, WAKE_LOCK_REREQUEST_DELAY_MS);
          }
        });
        setStatus("active");
      })
      .catch(() => {
        // NotAllowedError(절전 모드 · 정책 · iOS 홈 화면 앱 등) — 통화는 계속된다. 화면이 안내 문구로 대신한다.
        requesting = false;
        setStatus("denied");
      });
  };

  const onVisibility = () => {
    if (deps.doc.visibilityState !== "visible") return;
    visibleRerequests = 0;
    request();
  };

  return {
    start() {
      if (wanted) return;
      wanted = true;
      deps.doc.addEventListener("visibilitychange", onVisibility);
      request();
    },
    stop() {
      if (!wanted) return;
      wanted = false;
      deps.doc.removeEventListener("visibilitychange", onVisibility);
      const s = sentinel;
      sentinel = null;
      if (s && !s.released) void s.release().catch(() => {});
      setStatus("idle");
    },
  };
}
