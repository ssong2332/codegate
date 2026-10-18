import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { FLOW_VARIANTS, RELAY_RUNTIME_AVAILABLE, findFlowVariant } from "../../scenarios/flowVariants";
import { resolveHangupRelay, resolveHangupRelayWith } from "../relayContext";

// T192 C1 · G526 ⓓ — `resolveHangupRelay`(Architecture.md §79.2 끝 · §79.18 (1)): S7 전(`RELAY_RUNTIME_AVAILABLE
// === false`)에는 legs ≥ 2 변형에서도 `undefined` · 역검증(플래그를 무시한 사본은 그 변형에서 값을 낸다) ·
// 콜러블이 이 함수를 부른다(소스 스캔 — 폴백 쪽은 C3 배선 뒤 더한다).
const SRC_DIR = path.resolve(__dirname, "../../../src/scammerHangup");
const MULTI_LEG = FLOW_VARIANTS.filter((v) => v.legs.length >= 2);
const SINGLE_LEG = FLOW_VARIANTS.find((v) => v.legs.length === 1);

test("[G526 ⓓ 전제] legs ≥ 2 변형이 카탈로그에 실제로 있다(없으면 아래 단언이 공허하다)", () => {
  assert.ok(MULTI_LEG.length >= 1, "legs ≥ 2 변형이 0건 — 79.1 #22 전제가 바뀌었다");
  assert.ok(SINGLE_LEG, "단일 leg 변형을 찾지 못했다");
  assert.equal(RELAY_RUNTIME_AVAILABLE, false, "S7이 들어왔다 — 이 테스트의 기대값을 S7과 함께 다시 정할 것");
});

test("[G526 ⓓ] RELAY_RUNTIME_AVAILABLE === false — legs ≥ 2 변형 · 중간 legIndex에서도 undefined", () => {
  for (const variant of MULTI_LEG) {
    for (const relay of [undefined, { legIndex: 0 }, { legIndex: variant.legs.length - 1 }]) {
      assert.equal(
        resolveHangupRelay({ flowVariantId: variant.variantId, relay }),
        undefined,
        `${variant.variantId} · ${JSON.stringify(relay)}: S7 전인데 릴레이 값이 나왔다 — 이 변형에서 끊기가 조용히 0이 된다`,
      );
    }
  }
  assert.equal(resolveHangupRelay({}), undefined, "변형 부재");
  assert.equal(resolveHangupRelay({ flowVariantId: "fv-없는-변형" }), undefined, "카탈로그에 없는 변형");
});

test("[G526 ⓓ 역검증] 플래그를 무시한(true로 넣은) 사본은 legs ≥ 2 변형에서 값을 내고, 중간 leg는 not_last_leg 입력이 된다", () => {
  for (const variant of MULTI_LEG) {
    const ignored = resolveHangupRelayWith({ flowVariantId: variant.variantId }, true, findFlowVariant);
    assert.deepEqual(ignored, { legIndex: 0, legCount: variant.legs.length }, variant.variantId);
    const moved = resolveHangupRelayWith(
      { flowVariantId: variant.variantId, relay: { legIndex: 1 } },
      true,
      findFlowVariant,
    );
    assert.deepEqual(moved, { legIndex: 1, legCount: variant.legs.length }, `${variant.variantId}: 서버 legIndex 반영`);
  }
  // 플래그가 켜져도 단일 leg 변형 · 변형 부재는 릴레이가 아니다.
  assert.equal(resolveHangupRelayWith({ flowVariantId: SINGLE_LEG!.variantId }, true, findFlowVariant), undefined);
  assert.equal(resolveHangupRelayWith({}, true, findFlowVariant), undefined);
});

test("[G526 ⓓ 배선] resolveHangupRelay는 RELAY_RUNTIME_AVAILABLE을 그대로 넘긴다 · 콜러블 판정이 이 함수를 부른다", () => {
  const relaySrc = readFileSync(path.join(SRC_DIR, "relayContext.ts"), "utf8");
  const body = relaySrc.slice(relaySrc.indexOf("export function resolveHangupRelay("));
  assert.ok(
    body.includes("resolveHangupRelayWith(session, RELAY_RUNTIME_AVAILABLE, findFlowVariant)"),
    "resolveHangupRelay가 런타임 플래그를 우회한다",
  );
  const commit = readFileSync(path.join(SRC_DIR, "commit.ts"), "utf8");
  assert.ok(commit.includes("relay: resolveHangupRelay(session)"), "실시간 판정이 resolveHangupRelay를 부르지 않는다");
  // 요청(클라)에서 릴레이 값을 받는 경로 0 — §79.18 (1) 신뢰 규칙.
  const types = readFileSync(path.join(SRC_DIR, "types.ts"), "utf8");
  assert.ok(!/\brelay\b|legIndex|legCount/.test(types), "요청 계약에 릴레이 필드가 생겼다 — 클라 값을 쓰지 않는다");
  // ⚠️ 폴백(`roleplay/index.ts`)이 같은 함수를 부르는지는 C3 배선 뒤에 더한다(C1 범위 밖).
});
