// UA 기반 기기 스킨 자동 감지 (T29 → T190 v2) — Architecture.md §73.5 (1) 규칙표 v2(§13.5 표 대체)를
// 순서대로 그대로 구현한다(임의 판단 금지). 스킨은 **프레젠테이션 전용**이라 어떤 안전 판정도
// 게이팅하지 않는다(§13.5 계승) — 이 함수가 오판정해도 영향은 "외형이 기기와 다르게 보임"뿐이다.
//
// ⚠️ **왜 v2 규칙표가 이 파일에 있는가(§73.4 표의 위치와 다르다 — T190 구현 판단, 보고 대상)**:
// 설계는 v2를 `src/lib/phone/deviceSkin.ts`에 두고 이 파일이 그쪽에 **위임**하게 했다. 그런데 루트
// 테스트 러너(`node --experimental-strip-types --test`)는 확장자 없는 상대 import(`"../phone/deviceSkin"`)를
// 풀지 못하고(실측: ERR_MODULE_NOT_FOUND), 앱 코드에 `.ts` 확장자 import를 쓰는 선례는 0건이다.
// ⇒ 이 저장소의 테스트 대상 lib 모듈은 전부 **값 import가 없는 잎(leaf) 모듈**이다. 그래서 규칙표
// 자체를 타입 정본(`MessengerSkin`)이 있는 이 파일에 두고, 기존 `detectMessengerSkin`이 **같은 파일
// 안의 v2 함수에 위임**한다(규칙표는 한 벌 — 드리프트 0). 해석(표 K)·저장값 파싱은 `deviceSkin.ts`가
// 감지 결과를 **인자로 받아** 조합한다(그쪽도 잎 모듈로 남는다).
//
// 순수 함수라 UA 문자열만으로 직접 단위 검증할 수 있다(./detectSkin.test.ts · ../phone/deviceSkin.test.ts).
export type MessengerSkin = "ios" | "samsung" | "default";
export type MessengerSkinSource = "auto" | "fallback";

export type DetectedMessengerSkin = {
  skin: MessengerSkin;
  source: MessengerSkinSource;
};

/** 규칙표 v2의 입력(§73.5 (1) — 한 객체 · 순수). `uaModel`은 300ms 안에 받은 UA-CH 값만 넣는다. */
export type DeviceSkinSignals = {
  userAgent: string | null | undefined;
  /** `navigator.maxTouchPoints` — iPadOS 데스크톱 UA 보정(규칙 2). 부재 = 0. */
  maxTouchPoints?: number;
  /** UA Client Hints `getHighEntropyValues(["model"])`의 `model` — Chrome UA 축소 보강(규칙 4). */
  uaModel?: string;
};

type NormalizedSignals = { ua: string; maxTouchPoints: number; uaModel: string };

export type DeviceSkinRule = {
  /** §73.5 (1) 표의 # — 역검증이 이 번호로 행을 뺀 사본을 만든다(G461). */
  id: number;
  matches: (signals: NormalizedSignals) => boolean;
  skin: MessengerSkin;
  source: MessengerSkinSource;
};

const isAndroid = (ua: string) => /Android/.test(ua);

/**
 * Architecture.md §73.5 (1) 판정 규칙표 v2(순서대로 첫 매치 — ⛔ 표 밖 판단 금지):
 * 1. UA에 iPhone|iPad|iPod|iOS → ios (auto)
 * 2. UA에 Macintosh ∧ maxTouchPoints > 1 → ios (auto)  ← 신설(iPadOS 데스크톱 UA)
 * 3. UA에 Android ∧ (SM-|SamsungBrowser|Samsung) → samsung (auto)
 * 4. UA에 Android ∧ UA-CH model이 /^SM-/ → samsung (auto)  ← 신설(Chrome UA 축소 보강)
 * 5. UA에 Android → default (auto)
 * 6. 그 밖(데스크톱·미상·빈 UA) → default (fallback) — 아래 함수의 마지막 줄
 */
export const DEVICE_SKIN_RULES_V2: readonly DeviceSkinRule[] = [
  { id: 1, matches: ({ ua }) => /iPhone|iPad|iPod|iOS/.test(ua), skin: "ios", source: "auto" },
  {
    id: 2,
    matches: ({ ua, maxTouchPoints }) => /Macintosh/.test(ua) && maxTouchPoints > 1,
    skin: "ios",
    source: "auto",
  },
  {
    id: 3,
    matches: ({ ua }) => isAndroid(ua) && /SM-|SamsungBrowser|Samsung/.test(ua),
    skin: "samsung",
    source: "auto",
  },
  {
    id: 4,
    matches: ({ ua, uaModel }) => isAndroid(ua) && /^SM-/.test(uaModel),
    skin: "samsung",
    source: "auto",
  },
  { id: 5, matches: ({ ua }) => isAndroid(ua), skin: "default", source: "auto" },
];

/** 규칙 목록을 인자로 받는 판정 본체 — 본 판정과 역검증(행을 뺀 사본)이 **같은 함수**를 쓴다. */
export function detectDeviceSkinWithRules(
  rules: readonly DeviceSkinRule[],
  signals: DeviceSkinSignals,
): DetectedMessengerSkin {
  const normalized: NormalizedSignals = {
    ua: signals.userAgent ?? "",
    maxTouchPoints: signals.maxTouchPoints ?? 0,
    uaModel: signals.uaModel ?? "",
  };
  if (normalized.ua) {
    for (const rule of rules) {
      if (rule.matches(normalized)) return { skin: rule.skin, source: rule.source };
    }
  }
  return { skin: "default", source: "fallback" };
}

/** 규칙표 v2 판정(§73.5 (1)). */
export function detectDeviceSkin(signals: DeviceSkinSignals): DetectedMessengerSkin {
  return detectDeviceSkinWithRules(DEVICE_SKIN_RULES_V2, signals);
}

/**
 * 기존 v1 진입점(T29) — **v2에 위임한다**(§73.4). UA 문자열만 받으므로 규칙 2·4(터치 지점 수·UA-CH)는
 * 성립하지 않고, 그래서 v1 테스트 기대값이 전부 그대로다(`./detectSkin.test.ts` 무변경 통과).
 */
export function detectMessengerSkin(userAgent: string | undefined | null): DetectedMessengerSkin {
  return detectDeviceSkin({ userAgent });
}
