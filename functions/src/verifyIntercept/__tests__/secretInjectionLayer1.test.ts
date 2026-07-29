import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { getRealtimeProvider } from "../../realtime/provider";
import { VERIFY_INTERCEPT } from "../../scenarios/verifyIntercept";

// T133 / AC-081 (d) — **층 1 재현**(Architecture.md §41.7).
//
// ⭐⭐ 이 파일이 재현하는 것과 재현하지 **못하는** 것을 먼저 적는다(⛔ 지우지 말 것 — G209):
//   재현한다   : "자격증명을 못 읽으면 재검증 ⑤(elevenlabs 차단)가 발동하지 않는다"는 **인과**.
//                `SecretParam.value()`가 순수한 `process.env` 판독이라는 SDK 실측(§41.2)이 이
//                층을 결정론적으로 열어 준다 — 배포 불요·키 불요.
//   재현 못 한다: **배포 런타임이 "선언되지 않은 시크릿"을 실제로 주입하지 않는가**(층 2).
//                배포 수단이 없다. ⛔ *"결함을 확인했다"* 로 읽지 마라.
//
// ⛔ G211 — 이 테스트는 **가짜 값**만 쓰고 어떤 단언에도 값을 싣지 않는다. 드러내는 것은
//    프로바이더 이름뿐이다.

/** 테스트는 lib/에서 실행되므로 소스 경로를 명시적으로 잡는다(axisCoverage.test.ts 관례). */
const VERIFY_CALLABLE_SRC = path.resolve(__dirname, "../../../src/verifyIntercept/index.ts");

/** 확인 무력화가 실제로 걸린 시나리오 1종(카탈로그가 정본 — 하드코딩하지 않는다). */
const SCENARIO = Object.keys(VERIFY_INTERCEPT)[0]!;

function withEnv<T>(overrides: Record<string, string | undefined>, run: () => T): T {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/**
 * 재검증 ⑤의 판정식을 소스에서 확인한다 — 아래 시뮬레이션이 실제 게이트와 갈라지지 않도록
 * 고정한다(§15.6 G7의 "판정을 두 곳에 복제하지 않는다"와 같은 판단).
 */
test("[T133 층1 전제] 재검증 ⑤의 판정식은 여전히 providerName === \"elevenlabs\"다", () => {
  const source = readFileSync(VERIFY_CALLABLE_SRC, "utf-8");
  assert.match(
    source,
    /provider\.providerName === "elevenlabs"/,
    "⑤의 판정식이 바뀌었다 — 아래 층1 재현이 실제 게이트를 더 이상 대변하지 않는다.",
  );
  assert.match(
    source,
    /secrets: \[ELEVENLABS_API_KEY, \.\.\.GEMINI_KEY_SECRETS\]/,
    "T133 선언이 사라졌다(정합 게이트가 이것을 별도로 잡지만 여기서도 고정한다).",
  );
});

test("[T133/AC-081 (d) 층1 재현] 자격증명 주입 유무가 재검증 ⑤의 발동/미발동을 가른다 — 두 갈래를 나란히", (t) => {
  // ── 갈래 A: 자격증명이 주입된 상태(정상) ────────────────────────────
  const injected = withEnv(
    {
      ELEVENLABS_API_KEY: "fixture-not-a-real-key",
      ELEVENLABS_AGENT_IDS: `${SCENARIO}:agent_fixture`,
      GEMINI_API_KEY: undefined,
    },
    () => getRealtimeProvider(SCENARIO).providerName,
  );

  // ── 갈래 B: 미주입 상태(선언 누락 시 배포 런타임에서 일어난다고 **추정**되는 상태) ──
  const notInjected = withEnv(
    { ELEVENLABS_API_KEY: undefined, ELEVENLABS_AGENT_IDS: undefined, GEMINI_API_KEY: undefined },
    () => getRealtimeProvider(SCENARIO).providerName,
  );

  const blocks = (providerName: string): boolean => providerName === "elevenlabs";

  t.diagnostic(
    `층1 재현 — 시나리오=${SCENARIO} · ` +
      `[주입됨] provider=${injected} ⇒ ⑤ 차단=${blocks(injected)} · ` +
      `[미주입] provider=${notInjected} ⇒ ⑤ 차단=${blocks(notInjected)}`,
  );

  assert.equal(injected, "elevenlabs");
  assert.equal(blocks(injected), true, "주입된 상태에서는 ⑤가 발동한다(failed-precondition).");

  assert.equal(notInjected, "mock", "미주입이면 Mock으로 강등된다(§41.6 — 정당한 Mock과 구분 불가).");
  assert.equal(
    blocks(notInjected),
    false,
    "⭐ 이것이 이 태스크의 인과다 — 자격증명을 못 읽으면 ⑤가 '차단 없음'으로 조용히 통과한다.",
  );

  // ⭐ 두 갈래가 실제로 갈렸음을 같은 출력에 고정한다(대조군이 없으면 재현이 아니다).
  assert.notEqual(injected, notInjected);
});

test("[T133/AC-081 (c) 경계] Mock 강등 자체를 차단으로 바꾸지 않았다(G210)", () => {
  // ⛔ "Mock이면 차단"은 §41.4/§41.6에서 기각됐다 — 키 없는 개발·격리 워크트리·새 clone 전부가
  //    Mock 강등 위에 서 있고 realtime/__tests__/provider.test.ts가 그 동작을 단언한다.
  //    이 태스크가 만든 것은 **(가) 원인 제거 + (나) 관측 가능성**이지 **차단이 아니다**(§41.6 (3)).
  const providerName = withEnv(
    { ELEVENLABS_API_KEY: undefined, GEMINI_API_KEY: undefined },
    () => getRealtimeProvider(SCENARIO).providerName,
  );
  assert.equal(providerName, "mock");
});
