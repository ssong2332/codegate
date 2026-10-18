// T190-1 — 감지 규칙표 v2(G461) · 표 K 해석 · 기기 저장값 파싱 (docs/Architecture.md §73.3 표 K · §73.5 · §73.14 G461 ·
// PRD v1.20 AC-092 (b)(c)(g)ⓒ).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEVICE_SKIN_RULES_V2,
  detectDeviceSkin,
  detectDeviceSkinWithRules,
  detectMessengerSkin,
  type DeviceSkinSignals,
} from "../messenger/detectSkin.ts";
import {
  DEVICE_SKIN_CHOICE_LABELS,
  DEVICE_SKIN_STORAGE_KEY,
  parseSessionSkin,
  parseStoredDeviceSkin,
  readUaModelHint,
  resolveDeviceSkin,
  serializeStoredDeviceSkin,
} from "./deviceSkin.ts";

/** Chrome 110+ 축소 UA(§73.2 ④ — 모델명 `SM-…`이 사라진다). */
const REDUCED_ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
/** iPadOS 13+ Safari의 데스크톱 UA(Mac UA를 보낸다). */
const IPADOS_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const SAMSUNG_SM_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const SAMSUNG_BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/115.0.0.0 Mobile Safari/537.36";
const ANDROID_PIXEL_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** G461 케이스표 — §73.14 G461 행 그대로 + 기존 v1 케이스 전부(같은 기대값). */
const G461_CASES: Array<{ label: string; signals: DeviceSkinSignals; expected: { skin: string; source: string } }> = [
  {
    label: "축소 UA + uaModel SM-S918N → samsung/auto(규칙 4)",
    signals: { userAgent: REDUCED_ANDROID_UA, uaModel: "SM-S918N" },
    expected: { skin: "samsung", source: "auto" },
  },
  {
    label: "축소 UA + uaModel 없음 → default/auto(규칙 5)",
    signals: { userAgent: REDUCED_ANDROID_UA },
    expected: { skin: "default", source: "auto" },
  },
  {
    label: "Macintosh + maxTouchPoints 5 → ios/auto(규칙 2)",
    signals: { userAgent: IPADOS_DESKTOP_UA, maxTouchPoints: 5 },
    expected: { skin: "ios", source: "auto" },
  },
  {
    label: "Macintosh + maxTouchPoints 0 → default/fallback(규칙 6)",
    signals: { userAgent: IPADOS_DESKTOP_UA, maxTouchPoints: 0 },
    expected: { skin: "default", source: "fallback" },
  },
  { label: "v1 iPhone", signals: { userAgent: IPHONE_UA }, expected: { skin: "ios", source: "auto" } },
  { label: "v1 SM-", signals: { userAgent: SAMSUNG_SM_UA }, expected: { skin: "samsung", source: "auto" } },
  {
    label: "v1 SamsungBrowser",
    signals: { userAgent: SAMSUNG_BROWSER_UA },
    expected: { skin: "samsung", source: "auto" },
  },
  { label: "v1 Pixel", signals: { userAgent: ANDROID_PIXEL_UA }, expected: { skin: "default", source: "auto" } },
  { label: "v1 데스크톱", signals: { userAgent: DESKTOP_UA }, expected: { skin: "default", source: "fallback" } },
  { label: "v1 빈 UA", signals: { userAgent: "" }, expected: { skin: "default", source: "fallback" } },
  { label: "v1 null UA", signals: { userAgent: null }, expected: { skin: "default", source: "fallback" } },
];

test("[T190/G461] 감지 규칙표 v2 — 신설 행 4건 · 기존 v1 케이스 전부 같은 기대값", () => {
  assert.deepEqual(
    DEVICE_SKIN_RULES_V2.map((rule) => rule.id),
    [1, 2, 3, 4, 5],
    "§73.5 (1) 표 순서(첫 매치)와 행 번호가 어긋났다 — 6번(그 밖)은 함수의 마지막 줄이다",
  );
  for (const { label, signals, expected } of G461_CASES) {
    assert.deepEqual(detectDeviceSkin(signals), expected, label);
  }
});

test("[T190/G461] detectMessengerSkin(v1 진입점)은 v2에 위임한다 — UA만 주면 v2와 같은 값", () => {
  for (const ua of [IPHONE_UA, SAMSUNG_SM_UA, SAMSUNG_BROWSER_UA, ANDROID_PIXEL_UA, DESKTOP_UA, REDUCED_ANDROID_UA, ""]) {
    assert.deepEqual(detectMessengerSkin(ua), detectDeviceSkin({ userAgent: ua }));
  }
  // UA만으로는 규칙 2·4가 성립하지 않는다 — 그래서 v1 기대값이 바뀌지 않는다.
  assert.deepEqual(detectMessengerSkin(IPADOS_DESKTOP_UA), { skin: "default", source: "fallback" });
});

test("[T190/G461 역검증 — AC-092 (g)ⓒ] 규칙 4를 지운 사본에서는 첫 케이스가 실패하고 정상은 통과한다", (t) => {
  const withoutRule4 = DEVICE_SKIN_RULES_V2.filter((rule) => rule.id !== 4);
  const first = G461_CASES[0];
  const normal = detectDeviceSkinWithRules(DEVICE_SKIN_RULES_V2, first.signals);
  const poisoned = detectDeviceSkinWithRules(withoutRule4, first.signals);
  const withoutRule2 = DEVICE_SKIN_RULES_V2.filter((rule) => rule.id !== 2);
  const ipadPoisoned = detectDeviceSkinWithRules(withoutRule2, G461_CASES[2].signals);
  t.diagnostic(
    `[G461] 정상 ${JSON.stringify(normal)} / 규칙4 삭제 ${JSON.stringify(poisoned)} / 규칙2 삭제(iPadOS) ${JSON.stringify(ipadPoisoned)}`,
  );
  assert.deepEqual(normal, first.expected);
  assert.notDeepEqual(poisoned, first.expected, "규칙 4를 지웠는데 첫 케이스가 통과한다 — 케이스가 규칙 4를 안 탄다");
  assert.notDeepEqual(ipadPoisoned, G461_CASES[2].expected);
});

test("[T190/표 K] 세션 문서 > 기기 수동 선택 > 자동 감지 (AC-092 (b))", () => {
  const detected = { skin: "default" as const, source: "fallback" as const };
  // K-1
  assert.deepEqual(
    resolveDeviceSkin({ session: { skin: "ios", source: "manual" }, stored: "samsung", detected }),
    { skin: "ios", source: "manual" },
  );
  // K-2
  assert.deepEqual(resolveDeviceSkin({ session: null, stored: "samsung", detected }), {
    skin: "samsung",
    source: "manual",
  });
  // K-3
  assert.deepEqual(resolveDeviceSkin({ session: null, stored: null, detected }), detected);
});

test("[T190/표 K-1] 세션 문서 값은 두 필드가 **둘 다** enum 안일 때만 쓴다", () => {
  assert.deepEqual(parseSessionSkin("samsung", "auto"), { skin: "samsung", source: "auto" });
  assert.deepEqual(parseSessionSkin("default", "fallback"), { skin: "default", source: "fallback" });
  assert.equal(parseSessionSkin("samsung", undefined), null);
  assert.equal(parseSessionSkin(undefined, "auto"), null);
  assert.equal(parseSessionSkin("SAMSUNG", "auto"), null);
  assert.equal(parseSessionSkin("ios", "guess"), null);
});

test("[T190/§73.5 (3)] 기기 저장값 — 잘못된 값·default·파싱 실패는 '선택 없음'", () => {
  assert.equal(DEVICE_SKIN_STORAGE_KEY, "fv.deviceSkin.v1");
  assert.equal(parseStoredDeviceSkin(serializeStoredDeviceSkin("ios", 1)), "ios");
  assert.equal(parseStoredDeviceSkin(serializeStoredDeviceSkin("samsung", 2)), "samsung");
  for (const raw of [null, undefined, "", "{", "null", '{"skin":"default"}', '{"skin":"pixel"}', '"ios"', "[]"]) {
    assert.equal(parseStoredDeviceSkin(raw), null, `저장값 ${String(raw)}`);
  }
});

test("[T190/OQ-U67] 선택지 라벨은 두 낱말뿐이다 — default는 선택지가 아니다(AC-092 (e))", () => {
  assert.deepEqual(DEVICE_SKIN_CHOICE_LABELS, { ios: "iOS형", samsung: "One UI형" });
});

test("[T190/§73.4] UA-CH model 보강 — 미지원·실패·상한 초과는 undefined(던지지 않는다)", async () => {
  assert.equal(await readUaModelHint(undefined), undefined);
  assert.equal(await readUaModelHint({}), undefined);
  assert.equal(
    await readUaModelHint({ userAgentData: { getHighEntropyValues: async () => ({ model: "SM-S918N" }) } }),
    "SM-S918N",
  );
  assert.equal(
    await readUaModelHint({ userAgentData: { getHighEntropyValues: async () => ({ model: "" }) } }),
    undefined,
  );
  assert.equal(
    await readUaModelHint({
      userAgentData: {
        getHighEntropyValues: () => Promise.reject(new Error("blocked")),
      },
    }),
    undefined,
  );
  const late = await readUaModelHint(
    {
      userAgentData: {
        getHighEntropyValues: () => new Promise((resolve) => setTimeout(() => resolve({ model: "SM-X" }), 80)),
      },
    },
    10,
  );
  assert.equal(late, undefined, "상한을 넘겨 도착한 값은 버린다(세션 중 화면 모양이 바뀌지 않게 — D-100 (4))");
});
