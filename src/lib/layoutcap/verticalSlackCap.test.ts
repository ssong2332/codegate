// 세로 여백 상한(P-30 / D-62 / D-63) **클래스 문자열 불변 게이트**.
//
// ⛔ **이 게이트가 증명하지 못하는 것을 먼저 적는다(P-30 (6) 자기 고지).** 이 저장소에는 브라우저
// 레이아웃을 기계로 재는 수단이 없다(jsdom-layout·Playwright **0건**, `renderToStaticMarkup`은
// 문자열 생성이라 레이아웃을 계산하지 않는다 — `src/lib/mockscreenrender/renderHarness.ts:26-28`
// 자기 고지). ⇒ **여백 픽셀 회귀는 이 게이트로 못 잡는다**(OQ-U34). 여기서 단언하는 것은
// **"상한 클래스가 그 자리에 있다 / 폭·패딩 토큰이 그대로다 / 세로 분기가 없다"** 세 가지뿐이고,
// **"그렇게 보인다"는 사람이 브라우저에서 읽은 값으로만 성립한다**(P-30 (5) 증거표).
//
// 검출 축은 T108 공용 헬퍼(`src/lib/sourcescan/scanSource.ts`)의 **JSX 속성 축**이다 — 클래스가
// 템플릿/조건식 안에 들어가도 리터럴 `includes` 검사보다 넓게 닿는다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseTsx, type ParsedSource } from "../sourcescan/scanSource.ts";

// P-30 (7) 적용 대상 표 — **변경 대상은 2건**이다. UX-001(동의)은 "이미 계약을 만족 → 변경 0건"
// 으로 판정됐다(D-62 Decision · P-30 (7) 3행). ⚠️ P-30 (6) ①은 *"적용 대상 3화면에 전부"* 라고
// 적지만 그것은 (7) 표·D-62 Decision과 어긋난다 — 좁은 쪽(2화면)을 따르고 UX-001은 **상한이
// 없어야 한다**는 반대 방향 단언으로 고정한다(아래 G-VC4).
const CAP = "max-h-[256px]";

const TARGETS = [
  {
    screen: "UX-013 로그인",
    file: "src/app/(auth)/login/page.tsx",
    // ⛔ 이번 패스가 손대지 않은 폭·패딩 토큰(D-62 Impact · L-6 · OQ-U33).
    frozen: ["max-w-xl", "px-6", "pt-16", "pb-10"],
  },
  {
    screen: "UX-003 클론 생성 대기",
    file: "src/app/clone/wait/page.tsx",
    frozen: ["max-w-xl", "px-6", "pt-10", "pb-10", "gap-7"],
  },
];

const UNTOUCHED_SCREEN = {
  screen: "UX-001 사전 고지·동의",
  file: "src/app/onboarding/consent/page.tsx",
};

/** 세로 축 여백 유틸 — D-57 ㄹ이 금지하는 "브레이크포인트별 두 벌 규칙"의 검사 대상. */
const VERTICAL_UTILITY = /^(?:max-h|min-h|h|pt|pb|py|mt|mb|my|gap|gap-y|space-y)-/;
const BREAKPOINT_PREFIX = /^(?:sm|md|lg|xl|2xl):/;

function classNameValues(parsed: ParsedSource): { value: string; line: number }[] {
  return parsed
    .jsxAttributeNames()
    .filter((hit) => hit.name === "className")
    .flatMap((hit) => hit.values.map((value) => ({ value, line: hit.line })));
}

function countCap(parsed: ParsedSource): number {
  return classNameValues(parsed).filter((entry) => entry.value.includes(CAP)).length;
}

/** 세로 여백 유틸에 브레이크포인트 프리픽스가 붙은 클래스(= D-57 ㄹ 위반) 목록. */
function breakpointVerticalClasses(parsed: ParsedSource): string[] {
  const found: string[] = [];
  for (const { value, line } of classNameValues(parsed)) {
    for (const token of value.split(/\s+/)) {
      if (!BREAKPOINT_PREFIX.test(token)) continue;
      const bare = token.replace(BREAKPOINT_PREFIX, "");
      if (VERTICAL_UTILITY.test(bare)) found.push(`${token} (line ${line})`);
    }
  }
  return found;
}

function parseTarget(file: string): ParsedSource {
  return parseTsx(file, readFileSync(file, "utf8"));
}

// ── G-VC1 상한 토큰이 두 대상 화면에 정확히 1개씩 있다 ─────────────────────────────
for (const target of TARGETS) {
  test(`[P-30/G-VC1] ${target.screen} — 상단 탄성 여백 상한 \`${CAP}\`가 정확히 1건 존재한다`, () => {
    const count = countCap(parseTarget(target.file));
    assert.equal(
      count,
      1,
      `${target.file}: 상한 클래스가 ${count}건이다. 탄성 영역은 콘텐츠 위 1곳뿐이며(P-30 (1)(2)) ` +
        `상한은 그 한 곳에만 건다 — 0건이면 긴 화면 여백이 다시 비례 증가하고, 2건 이상이면 ` +
        `남는 높이가 어디로 갈지 예측할 수 없다.`,
    );
  });

  test(`[P-30/G-VC2] ${target.screen} — 폭·패딩 토큰이 그대로다(이번 패스는 여백만 손댄다)`, () => {
    const values = classNameValues(parseTarget(target.file))
      .map((entry) => entry.value)
      .join(" ");
    for (const token of target.frozen) {
      assert.ok(
        values.split(/\s+/).includes(token),
        `${target.file}: \`${token}\` 가 사라졌다. 폭(\`max-w-xl\`)은 src/app/** 22개 파일이 ` +
          `공유하고(OQ-U33) 패딩은 L-4·L-6의 회귀 기준이다 — 이번 범위 밖이다.`,
      );
    }
  });

  test(`[P-30/G-VC3] ${target.screen} — 세로 여백에 sm:/md:/lg: 분기가 0건이다(D-57 ㄹ 계승)`, () => {
    const violations = breakpointVerticalClasses(parseTarget(target.file));
    assert.deepEqual(
      violations,
      [],
      `${target.file}: 브레이크포인트별 세로 여백 규칙이 발견됐다 — ${violations.join(", ")}. ` +
        `상한은 뷰포트 **높이**에 대한 단일 규칙이며, 분기 구현은 reviewer 반려 사유다(D-62 Impact).`,
    );
  });
}

// ── G-VC4 UX-001은 변경 0건 판정이다 — 상한을 얹으면 안 된다 ─────────────────────
test(`[P-30/G-VC4] ${UNTOUCHED_SCREEN.screen} — 상한 클래스가 0건이다(D-62 "이미 계약 만족, 변경 0건")`, () => {
  const count = countCap(parseTarget(UNTOUCHED_SCREEN.file));
  assert.equal(
    count,
    0,
    `${UNTOUCHED_SCREEN.file}: 이 화면은 탄성 영역이 **이미 허용 위치(중간)** 라 P-30 (7) 표가 ` +
      `"변경 0건"으로 판정했다 — 상한을 얹으면 오히려 모바일 배치가 바뀐다.`,
  );
});

// ── 역검증: 게이트가 실제로 잡는지(조작 소스를 넣어 확인) ──────────────────────────
test("[P-30/G-VC 역검증] 상한을 지운 소스 · 폭을 바꾼 소스 · 세로 분기를 넣은 소스를 각각 잡는다", () => {
  const withCap = `export default function P(){return <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 pb-10 pt-16"><div className="flex flex-1 flex-col"><div aria-hidden="true" className="${CAP} flex-1" /><p>x</p><div aria-hidden="true" className="flex-1" /></div></main>;}`;
  const capRemoved = withCap.replace(`${CAP} `, "");
  const widthChanged = withCap.replace("max-w-xl", "max-w-3xl");
  const branched = withCap.replace(`${CAP} flex-1`, `${CAP} flex-1 md:pt-24`);

  assert.equal(countCap(parseTsx("probe.tsx", withCap)), 1, "정상 소스는 1건이어야 한다");
  assert.equal(countCap(parseTsx("probe.tsx", capRemoved)), 0, "상한을 지우면 0건으로 떨어져야 한다");
  assert.ok(
    !classNameValues(parseTsx("probe.tsx", widthChanged))
      .map((e) => e.value)
      .join(" ")
      .split(/\s+/)
      .includes("max-w-xl"),
    "폭 토큰을 바꾸면 동결 토큰 검사가 실패해야 한다",
  );
  assert.deepEqual(
    breakpointVerticalClasses(parseTsx("probe.tsx", branched)),
    ["md:pt-24 (line 1)"],
    "세로 여백에 붙은 브레이크포인트 프리픽스를 잡아야 한다",
  );
  // 오탐 방지 — 가로 축 유틸(px/w/max-w)에 붙은 프리픽스는 이 규칙의 대상이 아니다.
  assert.deepEqual(
    breakpointVerticalClasses(parseTsx("probe.tsx", withCap.replace("px-6", "px-6 md:px-8"))),
    [],
    "가로 패딩의 브레이크포인트 분기는 D-57 ㄹ의 대상이 아니다(오탐 금지)",
  );
});

// ── 한계 고지(출력으로 남긴다) ───────────────────────────────────────────────────
test("[P-30/한계] 이 게이트는 클래스 문자열까지만 증명한다 — 픽셀 회귀는 못 잡는다", (t) => {
  t.diagnostic(
    "OQ-U34: 브라우저 레이아웃 측정 도구(jsdom-layout·Playwright 등) 도입은 신규 의존성 판단이라 " +
      "architect 소관이다. 그때까지 L-1~L-6 판정은 사람이 브라우저에서 읽은 값(P-30 (5) 증거표)으로만 성립한다.",
  );
  assert.ok(true);
});
