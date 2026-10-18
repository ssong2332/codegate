// T190-1 — 떠 있는 문자 배너 표시 판정 (UX D-91 · UX-014 v1.33 (6) · docs/Architecture.md §74.6 (6)).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BANNER_VISIBLE_MS,
  ackOnOverlayClose,
  shouldRunBannerTimer,
  visibleBannerSmsId,
  type BannerInput,
} from "./bannerState.ts";

const base: BannerInput = {
  latestSmsId: "a",
  ackSmsId: null,
  expiredSmsId: null,
  overlayOpen: false,
  ended: false,
};

test("[D-91] 6초 · 최신 1건 · 문자함/종료 중 0", () => {
  assert.equal(BANNER_VISIBLE_MS, 6000);
  assert.equal(visibleBannerSmsId(base), "a");
  assert.equal(visibleBannerSmsId({ ...base, latestSmsId: null }), null);
  assert.equal(visibleBannerSmsId({ ...base, overlayOpen: true }), null);
  assert.equal(visibleBannerSmsId({ ...base, ended: true }), null);
});

test("[D-91] 6초가 지난 문자는 다시 뜨지 않고, 새 문자가 오면 최신으로 다시 뜬다", () => {
  assert.equal(visibleBannerSmsId({ ...base, expiredSmsId: "a" }), null);
  assert.equal(visibleBannerSmsId({ ...base, latestSmsId: "b", expiredSmsId: "a" }), "b");
});

test("[D-91 ③] 문자함을 닫으면 그때까지 온 건은 다시 뜨지 않는다 — 그 뒤 새 문자는 뜬다(경로 무관)", () => {
  const ack = ackOnOverlayClose("a", null);
  assert.equal(ack, "a");
  assert.equal(visibleBannerSmsId({ ...base, ackSmsId: ack }), null);
  // ⭐ §74.6 (6) 추정 결함 — 모델 도구 경로로 도착한 둘째 문자도 id가 새로우니 배너가 다시 뜬다
  // (옛 boolean은 그 경로에서 되돌려지지 않았다).
  assert.equal(visibleBannerSmsId({ ...base, latestSmsId: "b", ackSmsId: ack }), "b");
  // 최신이 없을 때 닫으면 기존 확인 값을 유지한다.
  assert.equal(ackOnOverlayClose(null, "a"), "a");
});

test("[D-91 ② · WCAG 2.2.1] 포커스·호버 중에는 6초 타이머가 멈춘다", () => {
  assert.equal(shouldRunBannerTimer("a", false), true);
  assert.equal(shouldRunBannerTimer("a", true), false);
  assert.equal(shouldRunBannerTimer(null, false), false);
});
