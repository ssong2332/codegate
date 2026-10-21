// T116 — 모의 랜딩 **렌더 층** 게이트 (Architecture.md §32 · §39 / AC-078 (b)(c) · AC-079 / UX-023).
//
// ── 무엇이 비어 있었는가 ────────────────────────────────────────────────────────────────
// 랜딩 검사가 **카탈로그 값만 보고 실제 렌더 결과를 보지 않았다.**
//   · AC-079 = 카탈로그 **필드 간 쌍별 비교**(서로 다른 랜딩이 수렴하지 않는가)
//   · G76(`src/components/mockScreenCopy.test.ts:331`) = **컴포넌트 소스 텍스트**에 문구가
//     리터럴로 있는가(`:345` `componentCode.includes(text)`)
// ⇒ **컴포넌트가 조건부로 필드를 안 그리거나 순서를 바꾸면 둘 다 통과한다.** 리터럴은 소스에
// 그대로 있고 카탈로그도 그대로이기 때문이다. 아래 역검증 3건이 그 사실을 **출력으로** 보인다.
//
// ── ⛔ 이 게이트가 **대체하지 않는 것**(§32.5 (4) · §39.6 — 세 층은 합집합이다) ──────────────
// | 층 | 무엇을 덮는가 | 이 게이트가 대신할 수 있는가 |
// |---|---|---|
// | AC-079(카탈로그 쌍별 비교) | 서로 다른 랜딩이 필드 단위로 **수렴하지 않는다** | ⛔ 불가 — 여기는 "그려지는가"를 보지 "서로 다른가"를 보지 않는다 |
// | G76(소스 텍스트 대조) | `successHeadline`·`consentLabel`을 **포함한 전 필드** | ⛔ 불가 — 아래 등록부가 그 둘을 **비대상**으로 갈랐다. 걷어내면 두 필드가 무검사가 된다 |
// | 이 게이트 | 초기 렌더에서 **실제로 그려지는가 · 순서가 맞는가** | — |
// ⭐ 그리고 **G76은 이 태스크 자신의 증거 장치다** — *"같은 오염에서 G76이 0건을 잡는다"* 가
// 아래 역검증의 본체다. 걷어내면 완료 증거가 소멸한다.
//
// ── ⛔⛔ 속도를 이유로 대조 축(문구·순서·건수)을 줄이지 말 것 ──────────────────────────────
// T113이 같은 자리에 남긴 주석을 그대로 계승한다. 전부 인메모리이고 네트워크·브라우저·DOM이
// 없다. 느려 보이면 축을 쳐내기 전에 **보고하고 판정을 받는다**(§32.3 (2)).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPONENT_PATH,
  extractText,
  poisonedComponentSource,
  renderLandingScreen,
} from "./renderHarness.ts";

const CATALOG_PATH = "functions/src/scenarios/mockScreens.ts";

/** ⚠️ **카탈로그를 import하지 않는다**(§32.5 (2) R-F) — `functions/`는 별도 TS 빌드 루트다.
 *  현행 G76과 **같은 방식**으로 소스 텍스트를 파싱해 값을 얻는다. */
const catalogSource = readFileSync(CATALOG_PATH, "utf8");
const componentSource = readFileSync(COMPONENT_PATH, "utf8");

/** G76과 같은 주석 제거 — "주석에 문구를 적어 둔 것"으로 통과하면 안 된다. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ── 필드별 **도달 상태 등록부**(§32.5 (3) · G141) ──────────────────────────────────────
//
// ⛔ 이것이 없으면 **오탐이 확정된다** — `successHeadline`은 제출 후에만, `consentLabel`은
// `phase === "permission"`에서만 렌더되므로 초기 렌더에서 찾으면 정상인데 빨간불이 난다.

/** 초기 렌더에서 **실제로 그려져야 하는** 필드. */
// ⭐ T190-2(docs/Architecture.md §74.9 ④ · §74.13 T116 행) — `mockHost`(가짜 주소창 호스트)가 초기 렌더 대상에 들어왔다.
const RENDER_TARGET_FIELDS = ["headline", "bodyLines", "issuerLabel", "mockHost", "fields", "submitLabel"];

/**
 * ⭐ **R-E — 비대상은 "없어도 된다"가 아니라 "이 검사가 보지 않는다"이다.**
 * 기준이 코드에 없으면 다음 사람이 판정을 달리한다. 그래서 사유를 문장으로 남긴다.
 */
const NOT_REACHED_BY_INITIAL_RENDER: Record<string, string> = {
  successHeadline:
    "제출 후 상태(submitted=true)에서만 렌더된다 — 이벤트 시뮬레이션이 필요하고 그것은 신규 의존성이다. 여전히 G76(소스 텍스트 층)이 검사한다",
  consentLabel:
    'phase === "permission"에서만 렌더된다(초기값은 "intro") — 타이머 전이 이후 상태다. 여전히 G76이 검사한다',
};
/** 화면이 아니라 **리포트**로 가는 필드 — 화면에 있으면 오히려 위반이다(G76 `:377-391` 담당). */
const REPORT_ONLY_FIELDS = ["momentTactic", "correctAction"];
/** 식별자·열거형 — 문구가 아니다. */
const NON_TEXT_FIELDS = ["landingId", "kind", "entrySurface"];

const KNOWN_FIELDS = [
  ...RENDER_TARGET_FIELDS,
  ...Object.keys(NOT_REACHED_BY_INITIAL_RENDER),
  ...REPORT_ONLY_FIELDS,
  ...NON_TEXT_FIELDS,
];

/** ⭐ 순서 대조(R-C) 대상 = **배열 필드**뿐이다. 배열 **안쪽** 순서를 본다. */
const ORDERED_ARRAY_FIELDS = ["bodyLines", "fields"];

type CatalogItem = { landingId: string; kind: string; fields: Map<string, string[]> };

function extractFieldValues(block: string, field: string): string[] | null {
  const single = new RegExp(`(?:^|\\n)\\s*${field}:\\s*(?:\\n\\s*)?"([^"]*)"`).exec(block);
  if (single) return [single[1]];
  const arrayStart = new RegExp(`(?:^|\\n)\\s*${field}:\\s*\\[`).exec(block);
  if (arrayStart) {
    const from = block.indexOf("[", arrayStart.index);
    const to = block.indexOf("]", from);
    return [...block.slice(from, to).matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  }
  return null;
}

/** 카탈로그를 **항목 단위**로 자른다(G76 `parseCatalogItems`와 같은 관례). */
function parseCatalogItems(): CatalogItem[] {
  const anchor = catalogSource.indexOf("export const MOCK_SCREENS");
  assert.ok(anchor > 0, "카탈로그에 MOCK_SCREENS 선언이 있어야 한다");
  const starts = [...catalogSource.matchAll(/landingId:\s*"([^"]+)"/g)].map((m) => ({
    landingId: m[1],
    at: m.index ?? 0,
  }));
  assert.ok(starts.length > 0, "카탈로그에서 항목을 하나도 찾지 못했다 — 파서가 죽었다");
  return starts
    .filter((start) => start.at < anchor)
    .map((start, index, kept) => {
      const block = catalogSource.slice(start.at, kept[index + 1]?.at ?? anchor);
      const fields = new Map<string, string[]>();
      for (const name of KNOWN_FIELDS) {
        const values = extractFieldValues(block, name);
        if (values !== null) fields.set(name, values);
      }
      for (const [, key] of block.matchAll(/^ {4}(\w+):/gm)) {
        assert.ok(
          KNOWN_FIELDS.includes(key),
          `'${start.landingId}'의 필드 '${key}'가 이 파일의 등록부에 없다 — ` +
            "RENDER_TARGET/NOT_REACHED/REPORT_ONLY/NON_TEXT 중 하나에 넣어라(안 넣으면 렌더 대조를 통째로 우회한다)",
        );
      }
      return { landingId: start.landingId, kind: fields.get("kind")?.[0] ?? "", fields };
    });
}

const catalogItems = parseCatalogItems();

/** ⚠️ **센티널** — `title`은 대화상자 `aria-label`(A5)에 흐른다(§39.5 (4) G194 부수 규칙). 카탈로그 문구와
 *  겹치지 않는 값을 넣어야 순서·중복 판정이 오염되지 않는다.
 *  ⭐ T190-2(§74.9 ④) — 가짜 주소창이 `title` 대신 그 랜딩의 `mockHost`를 그리게 되어 `title`은 **텍스트에서
 *  사라졌다**(속성에만 남는다). 그래서 생존 신호를 아래처럼 재지정했다(같은 커밋). */
const TITLE_SENTINEL = "ZZ-TITLE-SENTINEL-ZZ";
const DIFFICULTY_SENTINEL = "ZZ-DIFF-SENTINEL-ZZ";

/**
 * G447 생존 신호 — 본 게이트와 역검증이 같은 함수를 쓴다.
 * ⭐ T190-2 재지정(§74.9 ④): 자식 모듈 렌더 증명 ∧ **그 항목의 `mockHost`**
 * (카탈로그 값이 kind 분기·정확 일치 조회를 거쳐 주소창까지 흘렀다는 증명 — 옛 `title` 센티널의 prop 흐름
 * 증명을 대신한다).
 * ⭐ 사용자 결정(2026-10-18) 재지정 — 자식 모듈 렌더 증명이던 "훈련 종료"(`EndTrainingButton`)가 브라우저 바에서
 * 빠졌다. 같은 공유 브라우저 바에 남는 자식 모듈 `PhoneIcon`의 **지구본 글리프**(`GLOBE_GLYPH` — 그 파일에만
 * 있는 원 지름)로 옮겼다. 텍스트 노드가 없는 아이콘이라 `text`가 아니라 `markup`을 본다(G140 유지).
 */
const GLOBE_GLYPH = '<circle cx="12" cy="12" r="8.5"';
function isRenderAlive(rendered: { text: string; markup: string }, item: CatalogItem): boolean {
  const host = item.fields.get("mockHost")?.[0];
  return rendered.markup.includes(GLOBE_GLYPH) && host !== undefined && rendered.text.includes(host);
}

function propsFor(item: CatalogItem): Record<string, unknown> {
  return {
    title: TITLE_SENTINEL,
    landingKind: item.kind,
    landingId: item.landingId,
    difficultyLabel: DIFFICULTY_SENTINEL,
    onClose: () => {},
    // 사용자 결정(2026-10-18) — 컴포넌트가 더 이상 받지 않는 prop이다. 일부러 남겨 "넘겨도 '훈련 종료'가 안 그려진다"를 본다.
    onEndTraining: () => {},
    onInstallConsent: () => {},
    onCredentialSubmit: () => {},
  };
}

/** 이 항목에서 **초기 렌더 대조 대상**인 문자열 전부(필드명과 함께). */
function targetTexts(item: CatalogItem): Array<{ field: string; text: string }> {
  const out: Array<{ field: string; text: string }> = [];
  for (const field of RENDER_TARGET_FIELDS) {
    for (const text of item.fields.get(field) ?? []) out.push({ field, text });
  }
  return out;
}

// ── ① 존재 대조(R-B) + 건수 단언(R-D) ────────────────────────────────────────────────

test("[T116/렌더-존재] 카탈로그 **도달 가능 전수**의 초기 렌더 대상 문구가 실제 렌더 결과에 등장한다", (t) => {
  assert.equal(catalogItems.length, 15, "도달 가능 랜딩은 15종이다(credential-form 10 + app-install 5, §53/§51 커밋 D · T194-a parcel-install · T194-c-1 Q2 3종 · §92.3 고급 전용 2종 · §98 검찰 보관 지갑)");

  let compared = 0;
  const perItem: string[] = [];
  for (const item of catalogItems) {
    const { text, markup, transpiledCount } = renderLandingScreen(propsFor(item));

    // G140 ①②④ — 하네스가 죽은 채 "위반 0건"으로 통과하지 않게 한다.
    assert.ok(transpiledCount >= 3, `훅이 변환한 모듈이 ${transpiledCount}개다 — 하네스가 죽었다`);
    assert.ok(markup.length >= 500, `마크업이 ${markup.length}자다 — 빈 렌더를 통과시키고 있다`);
    // ⭐ T187(PRD v1.18 AC-086 · T187 · docs/Architecture.md §72.7 G447) — 생존 신호 **이동**(G140 유지).
    // 옛 신호(공유 헤더의 모의 표식)는 세션 중 표식 폐지로 사라졌다. 새 신호 = 자식 모듈 렌더 증명 ∧ prop 흐름 증명.
    // ⭐ T190-2(§74.9 ④) — title 센티널 → 그 항목의 mockHost로 재지정(주소창이 title을 더 그리지 않는다).
    // ⭐ 사용자 결정(2026-10-18) — 자식 모듈 증명을 "훈련 종료"(EndTrainingButton 제거) → PhoneIcon 지구본 글리프로 재지정.
    assert.ok(
      isRenderAlive({ text, markup }, item),
      "생존 신호(지구본 글리프 + 그 랜딩의 mockHost)가 마크업에 없다 — 렌더가 통째로 실패했을 수 있다",
    );
    // 사용자 결정(2026-10-18) — 가짜 랜딩(메신저 진입)에 "훈련 종료"가 그려지지 않는다(onEndTraining을 넘겨도 — propsFor).
    assert.equal(text.includes("훈련 종료"), false, `${item.landingId}: 가짜 랜딩에 '훈련 종료'가 그려졌다`);
    // 주소창은 링크 표시 텍스트(title)를 **다시 그리지 않는다**(호스트만 — AC-094 (a)).
    assert.equal(text.includes(TITLE_SENTINEL), false, "주소창에 title이 남아 있다 — 호스트만 그려야 한다");
    // prop을 넘겨도 세션 중 난이도 배지가 그려지지 않는다(M-13 · 앵커 1종 — UX D-84).
    assert.equal(text.includes(DIFFICULTY_SENTINEL), false, "난이도 라벨이 렌더됐다 — 세션 중 배지가 되살아났다");

    const targets = targetTexts(item);
    assert.ok(targets.length >= 4, `${item.landingId}: 대조 대상이 ${targets.length}건뿐이다 — 파서가 필드를 놓쳤다`);
    const missing = targets.filter((entry) => !text.includes(entry.text));
    assert.deepEqual(
      missing.map((m) => `${m.field}: ${m.text}`),
      [],
      `${item.landingId}: 카탈로그 문구가 **초기 렌더 결과에 없다** — 소스에는 리터럴이 있어도 그려지지 않으면 참가자는 못 본다`,
    );
    compared += targets.length;
    perItem.push(`${item.landingId}(${item.kind})=${targets.length}건/${markup.length}자`);
  }

  // R-D — 항목이 늘었는데 대조가 안 늘면 여기서 걸린다.
  const expected = catalogItems.reduce((n, item) => n + targetTexts(item).length, 0);
  assert.equal(compared, expected, "대조 건수가 파싱 결과와 다르다 — 순회가 중간에 빠졌다");
  assert.ok(compared >= 4 * catalogItems.length, `항목당 최소 4건은 대조돼야 한다(현재 ${compared}건)`);
  t.diagnostic(`렌더 대조: 항목 ${catalogItems.length}종 / 총 대조 ${compared}건 — ${perItem.join(" · ")}`);
});

// ── ② 순서 대조(R-C) — G194 함정 처방 포함 ────────────────────────────────────────────

/** ⭐ **G194 — 첫 등장 인덱스만으로 순서를 판정하면 조용한 거짓 초록이 난다.**
 *  그래서 ① 각 문자열이 **정확히 1회** 등장 ② 서로 **부분 문자열이 아님** 을 **먼저** 단언한다. */
function assertOrderPreconditions(text: string, values: string[], label: string): void {
  for (const value of values) {
    const occurrences = text.split(value).length - 1;
    assert.equal(
      occurrences,
      1,
      `${label}: "${value}"가 추출 텍스트에 ${occurrences}회 등장한다 — 순서 판정의 전제가 깨졌다. ` +
        "⛔ 임계를 낮추지 말고 멈추고 보고할 것(Architecture.md §39.5 (4) G194)",
    );
  }
  for (const a of values) {
    for (const b of values) {
      if (a === b) continue;
      assert.equal(a.includes(b), false, `${label}: "${a}"가 "${b}"를 포함한다 — 인덱스 판정이 무의미해진다`);
    }
  }
}

function orderViolations(text: string, values: string[]): string[] {
  const indices = values.map((value) => text.indexOf(value));
  const bad: string[] = [];
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] <= indices[i - 1]) bad.push(`${values[i - 1]} → ${values[i]}`);
  }
  return bad;
}

test("[T116/렌더-순서] 배열 필드가 **카탈로그 순서 그대로** 렌더된다(등장 인덱스 단조 증가)", (t) => {
  let checkedArrays = 0;
  let checkedValues = 0;
  const detail: string[] = [];
  for (const item of catalogItems) {
    const { text } = renderLandingScreen(propsFor(item));
    for (const field of ORDERED_ARRAY_FIELDS) {
      const values = item.fields.get(field);
      if (!values || values.length < 2) continue;
      const label = `${item.landingId}.${field}`;
      assertOrderPreconditions(text, values, label);
      assert.deepEqual(orderViolations(text, values), [], `${label}: 렌더 순서가 카탈로그 순서와 다르다`);
      checkedArrays += 1;
      checkedValues += values.length;
      detail.push(`${label}=${values.length}개`);
    }
  }
  // 하한 단언 — 순회가 0개를 돌고 "위반 0건"을 내는 것을 막는다(G140).
  assert.ok(checkedArrays >= 5, `순서 대조한 배열이 ${checkedArrays}개뿐이다 — 순회가 죽었다`);
  t.diagnostic(`순서 대조: 배열 ${checkedArrays}개 / 값 ${checkedValues}건 — ${detail.join(" · ")}`);
});

// ── ③ R-E — 비대상 필드를 **명시적으로** 단언한다 ────────────────────────────────────────

test("[T116/R-E] 초기 렌더 **비대상** 필드는 '없어도 된다'가 아니라 '이 검사가 보지 않는다'이다", (t) => {
  const install = catalogItems.find((item) => item.kind === "app-install");
  assert.ok(install, "app-install 항목이 있어야 한다");
  const { text } = renderLandingScreen(propsFor(install));

  // consentLabel은 permission 단계 전용이라 **초기 렌더에 없는 것이 정상**이다.
  const consentLabel = install.fields.get("consentLabel")?.[0];
  assert.ok(consentLabel, "카탈로그에 consentLabel이 있어야 한다");
  assert.equal(
    text.includes(consentLabel),
    false,
    "consentLabel이 초기 렌더에 등장한다면 등록부(§32.5 (3))가 현실과 어긋난 것이다 — 멈추고 보고할 것",
  );
  // 그러나 **G76이 여전히 검사한다** — 걷어내면 이 필드가 무검사가 된다(§32.5 (4)).
  assert.ok(
    codeOnly(componentSource).includes(consentLabel),
    "consentLabel은 렌더 층 비대상이지만 소스 텍스트 층(G76)에서는 계속 검사된다",
  );
  t.diagnostic(
    `비대상 ${Object.keys(NOT_REACHED_BY_INITIAL_RENDER).length}종(${Object.keys(NOT_REACHED_BY_INITIAL_RENDER).join(",")}) — 렌더 층 비대상 · G76이 계속 담당`,
  );
});

// ── ④ 역방향 확인 — ⭐ **여기가 "렌더 층이 비어 있었다"의 유일한 직접 증거다** ──────────────
//
// ⛔⛔ **G191 — 오염은 "리터럴을 남긴 채 렌더 지점 표현식만 끊는" 형태여야 한다.**
// 문구 리터럴을 지우면 **G76이 그 오염을 잡아 버려** *"같은 샘플에서 G76은 통과한다"* 가
// 성립하지 않는다. 아래 세 오염은 전부 `.map(`·`{copy.…}` 같은 **렌더 지점**만 건드린다.
// ⛔ 오염은 **테스트 코드 안(메모리)에서만** 만든다 — 실제 컴포넌트 파일을 고쳤다 되돌리지 않는다.

/** 이 파일이 보는 카탈로그 문구 전량 — G76의 입력과 같은 집합이다. */
const ALL_CATALOG_TEXTS = catalogItems.flatMap((item) =>
  [...RENDER_TARGET_FIELDS, ...Object.keys(NOT_REACHED_BY_INITIAL_RENDER)].flatMap(
    (field) => item.fields.get(field) ?? [],
  ),
);

/**
 * ⭐ **G192 — G76·AC-079가 같은 샘플에서 통과함을 *기계적으로* 보인다.**
 * ⛔ *"다른 스위트가 초록이니 통과했다"* 로 갈음하지 않는다. 두 게이트의 **입력이 불변**임을
 * 단언하면 통과는 기계적으로 따라 나온다.
 * @returns [G76 리터럴 검출 건수, 카탈로그 변경 바이트 수]
 */
function assertExistingGateInputsUnchanged(original: string, poisoned: string): [number, number] {
  // (a) G76의 입력 = 주석 제거한 컴포넌트 소스의 **리터럴 집합**.
  //     `mockScreenCopy.test.ts:200-209`가 세운 관용구를 그대로 쓴다(재구현하지 않는다).
  const originalCode = codeOnly(original);
  const poisonedCode = codeOnly(poisoned);
  const literalCaught = ALL_CATALOG_TEXTS.filter(
    (text) => originalCode.includes(text) !== poisonedCode.includes(text),
  );
  assert.deepEqual(
    literalCaught,
    [],
    "이 오염이 소스 리터럴 집합을 바꿨다 — G76이 잡아 버리므로 '같은 샘플에서 G76은 통과한다'가 성립하지 않는다(G191)",
  );
  // (b) AC-079의 입력 = 카탈로그 소스. 한 바이트도 바뀌지 않았음을 단언한다.
  const catalogNow = readFileSync(CATALOG_PATH, "utf8");
  const catalogDelta = catalogNow === catalogSource ? 0 : 1;
  assert.equal(catalogDelta, 0, "카탈로그가 바뀌었다 — AC-079의 입력이 불변이어야 한다");
  // (c) 디스크의 컴포넌트도 그대로다(오염은 메모리에서만 만든다).
  assert.equal(readFileSync(COMPONENT_PATH, "utf8"), original, "디스크의 컴포넌트가 변경됐다 — 오염이 새어 나갔다");
  return [literalCaught.length, catalogDelta];
}

/** 그 **항목의** 렌더 텍스트에서 존재 위반 건수를 센다.
 *  ⚠️ 항목마다 렌더가 다르므로 반드시 같은 항목의 텍스트와 짝지어야 한다. */
function existenceViolations(item: CatalogItem, text: string): number {
  return targetTexts(item).filter((entry) => !text.includes(entry.text)).length;
}

// 사용자 결정(2026-10-18) — 옛 오염 지점(`<EndTrainingButton …/>`)이 사라져 재지정한 자식 모듈(PhoneIcon 지구본) 렌더 지점을 끊는다.
test("[T187/G447 역검증 · 사용자 결정 2026-10-18 재지정] 지구본 `PhoneIcon` 렌더 지점을 끊으면 생존 신호가 실패하고 G76·AC-079 입력은 불변이다", (t) => {
  const { original, poisoned, overrides } = poisonedComponentSource(
    '<PhoneIcon name="globe" size={16} />',
    "",
  );
  assert.notEqual(poisoned, original, "오염 샘플이 실제로 만들어져야 한다 — 치환 대상 문면이 바뀌었으면 여기서 걸린다");
  const item = catalogItems.find((entry) => entry.kind === "app-install") ?? catalogItems[0];
  const clean = renderLandingScreen(propsFor(item));
  const dirty = renderLandingScreen(propsFor(item), overrides);
  assert.equal(isRenderAlive(clean, item), true, "정상 경로의 생존 신호가 살아 있어야 한다");
  assert.equal(isRenderAlive(dirty, item), false, "자식 모듈 렌더를 끊었는데 생존 신호가 살아 있다 — 신호가 공회전한다");
  const [g76Caught, catalogDelta] = assertExistingGateInputsUnchanged(original, poisoned);
  t.diagnostic(`[G447 역검증] 생존 신호 정상 true / 오염 false / G76 리터럴 검출 ${g76Caught}건 / 카탈로그 변경 ${catalogDelta}바이트`);
});

test("[T190-2/G447 역검증] 주소창 호스트 렌더 지점을 끊으면 생존 신호·mockHost 존재 대조가 함께 실패하고 G76·AC-079 입력은 불변이다", (t) => {
  const { original, poisoned, overrides } = poisonedComponentSource(
    "{landingHostFor(landingKind, landingId)}",
    '{""}',
  );
  assert.notEqual(poisoned, original, "오염 샘플이 실제로 만들어져야 한다 — 주소창 렌더 식이 바뀌었으면 여기서 걸린다");
  const results = catalogItems.map((item) => {
    const clean = renderLandingScreen(propsFor(item));
    const dirty = renderLandingScreen(propsFor(item), overrides);
    const host = item.fields.get("mockHost")?.[0] ?? "";
    return {
      landingId: item.landingId,
      cleanAlive: isRenderAlive(clean, item),
      dirtyAlive: isRenderAlive(dirty, item),
      dirtyHasHost: dirty.text.includes(host),
    };
  });
  assert.ok(results.every((r) => r.cleanAlive), "정상 경로(9종 전부)의 생존 신호가 살아 있어야 한다");
  assert.deepEqual(
    results.filter((r) => r.dirtyAlive || r.dirtyHasHost).map((r) => r.landingId),
    [],
    "주소창 렌더를 끊었는데 호스트가 보인다 — 신호가 다른 경로로 새고 있다",
  );
  const [g76Caught, catalogDelta] = assertExistingGateInputsUnchanged(original, poisoned);
  t.diagnostic(
    `[T190-2 역검증] 9종 정상 생존 ${results.filter((r) => r.cleanAlive).length} / 오염 생존 ${results.filter((r) => r.dirtyAlive).length} / G76 리터럴 검출 ${g76Caught}건 / 카탈로그 변경 ${catalogDelta}바이트`,
  );
});

test("[T116/역검증 ①] **필드 누락**(issuerLabel 렌더 지점 차단) — 새 검사는 실패하고 G76·AC-079는 통과한다", (t) => {
  const { original, poisoned, overrides } = poisonedComponentSource(
    "{copy.issuerLabel}",
    '{""}',
  );
  assert.notEqual(poisoned, original, "오염 샘플이 실제로 만들어져야 한다 — 치환 대상 문면이 바뀌었으면 여기서 걸린다");

  const item = catalogItems.find((entry) => entry.landingId === "tax-refund-claim");
  assert.ok(item, "대조에 쓸 credential-form 항목이 있어야 한다");
  const clean = renderLandingScreen(propsFor(item));
  const dirty = renderLandingScreen(propsFor(item), overrides);

  const issuer = item.fields.get("issuerLabel")?.[0] ?? "";
  assert.ok(clean.text.includes(issuer), "정상 경로에서는 issuerLabel이 그려진다");
  assert.equal(dirty.text.includes(issuer), false, "오염 샘플에서 issuerLabel이 그려지면 안 된다");

  const violations = targetTexts(item).filter((entry) => !dirty.text.includes(entry.text));
  assert.ok(violations.length > 0, "오염을 새 검사가 잡지 못하면 이 게이트는 무의미하다");

  const [g76Caught, catalogDelta] = assertExistingGateInputsUnchanged(original, poisoned);
  t.diagnostic(
    `[역검증 ① 필드 누락] 새 검사 위반 ${violations.length}건 / G76 리터럴 검출 ${g76Caught}건 / 카탈로그 변경 ${catalogDelta}바이트`,
  );
});

test("[T116/역검증 ②] **배열 누락**(bodyLines를 빈 배열로 순회) — 새 검사는 실패하고 G76·AC-079는 통과한다", (t) => {
  const { original, poisoned, overrides } = poisonedComponentSource(
    "copy.bodyLines.map(",
    "copy.bodyLines.slice(0, 0).map(",
  );
  assert.notEqual(poisoned, original, "오염 샘플이 실제로 만들어져야 한다");

  const item = catalogItems.find((entry) => entry.landingId === "parcel-redelivery");
  assert.ok(item, "대조에 쓸 credential-form 항목이 있어야 한다");
  const clean = renderLandingScreen(propsFor(item));
  const dirty = renderLandingScreen(propsFor(item), overrides);

  const bodyLines = item.fields.get("bodyLines") ?? [];
  assert.ok(bodyLines.length >= 2, "bodyLines가 2줄 이상인 항목이어야 한다");
  assert.deepEqual(bodyLines.filter((line) => !clean.text.includes(line)), [], "정상 경로에서는 전부 그려진다");
  assert.deepEqual(
    bodyLines.filter((line) => dirty.text.includes(line)),
    [],
    "오염 샘플에서는 bodyLines가 하나도 그려지면 안 된다",
  );

  const violations = targetTexts(item).filter((entry) => !dirty.text.includes(entry.text));
  assert.equal(violations.length, bodyLines.length, "누락 건수가 bodyLines 수와 같아야 한다");

  const [g76Caught, catalogDelta] = assertExistingGateInputsUnchanged(original, poisoned);
  t.diagnostic(
    `[역검증 ② 배열 누락] 새 검사 위반 ${violations.length}건 / G76 리터럴 검출 ${g76Caught}건 / 카탈로그 변경 ${catalogDelta}바이트`,
  );
});

test("[T116/역검증 ③] **순서 뒤바뀜**(fields 역순 순회) — 존재 대조는 통과하고 **순서 대조만** 실패한다", (t) => {
  const { original, poisoned, overrides } = poisonedComponentSource(
    "copy.fields.map(",
    "copy.fields.slice().reverse().map(",
  );
  assert.notEqual(poisoned, original, "오염 샘플이 실제로 만들어져야 한다");

  const item = catalogItems.find((entry) => entry.landingId === "courier-customs-check");
  assert.ok(item, "fields가 3개인 항목이어야 한다");
  const fields = item.fields.get("fields") ?? [];
  assert.ok(fields.length >= 3, `순서 오염을 보이려면 fields가 3개 이상이어야 한다(현재 ${fields.length})`);

  const clean = renderLandingScreen(propsFor(item));
  const dirty = renderLandingScreen(propsFor(item), overrides);

  // ⭐ **값 집합이 같으므로 R-B(존재)는 초록이어야 한다.** 그렇지 않다면 순서 오염이 아니라
  // 누락 오염을 만든 것이고, 그러면 R-C가 실제로 작동한다는 증거가 되지 못한다.
  assert.equal(existenceViolations(item, clean.text), 0, "정상 경로에 존재 위반이 있으면 안 된다");
  assert.deepEqual(
    targetTexts(item).filter((entry) => !dirty.text.includes(entry.text)),
    [],
    "순서 오염인데 존재 대조가 깨졌다 — R-C가 사실은 존재 대조를 다시 하고 있는지 확인할 것",
  );

  assertOrderPreconditions(clean.text, fields, "정상");
  assertOrderPreconditions(dirty.text, fields, "오염");
  const cleanOrder = orderViolations(clean.text, fields);
  const dirtyOrder = orderViolations(dirty.text, fields);
  assert.deepEqual(cleanOrder, [], "정상 경로는 순서 위반이 0건이어야 한다");
  assert.ok(dirtyOrder.length > 0, "순서 오염을 순서 대조가 잡지 못하면 R-C는 무의미하다");

  const [g76Caught, catalogDelta] = assertExistingGateInputsUnchanged(original, poisoned);
  t.diagnostic(
    `[역검증 ③ 순서 뒤바뀜] 존재 위반 ${0}건(설계대로 초록) / 순서 위반 ${dirtyOrder.length}건 / ` +
      `G76 리터럴 검출 ${g76Caught}건 / 카탈로그 변경 ${catalogDelta}바이트`,
  );
});

// ── ⑤ 추출 함수 자체의 함정 고정(G193) ──────────────────────────────────────────────────

test("[T116/G193] 태그 경계에서 인접 텍스트가 **붙지 않는다**", () => {
  assert.equal(extractText("<p>가</p><p>나</p>"), "가\n나");
  assert.equal(
    extractText("<p>가</p><p>나</p>").includes("가나"),
    false,
    "태그를 빈 문자열로 지우면 '가나'라는 없는 문구가 생긴다 — 그것이 G193이다",
  );
  assert.equal(extractText("<p>A&amp;B</p>"), "A&B", "엔티티를 디코드해야 원문과 대조된다");
});

// ── T190-5 — 두 진입 표면 각각 렌더(docs/Architecture.md §74.13 T116 행 · §74.14 G460 · UX D-93/D-94) ──────────

/** G460 판정 — 같은 함수를 본 게이트와 역검증이 쓴다. 임베디드(문자함 안) 렌더에 대화상자 역할·aria-modal이 없어야 한다. */
function embeddedDialogViolations(markup: string): string[] {
  const out: string[] = [];
  if (/role="dialog"/.test(markup)) out.push('role="dialog"');
  if (/aria-modal/.test(markup)) out.push("aria-modal");
  if (!/role="region"/.test(markup)) out.push('role="region" 없음');
  return out;
}

test("[T190/G460 · 렌더] entrySurface 두 갈래 — 메신저 = 대화상자 · 문자함 = 영역(중첩 aria-modal 0) · 대상 문구는 둘 다 그려진다", (t) => {
  const rows: string[] = [];
  for (const item of catalogItems) {
    const messenger = renderLandingScreen(propsFor(item));
    const inCall = renderLandingScreen({ ...propsFor(item), entrySurface: "in-call-sms", onHide: () => {} });
    assert.ok(/role="dialog"/.test(messenger.markup) && /aria-modal="true"/.test(messenger.markup), "메신저 진입은 대화상자 그대로");
    assert.deepEqual(embeddedDialogViolations(inCall.markup), [], `${item.landingId}: 문자함 안 랜딩이 대화상자로 그려졌다(G460)`);
    assert.deepEqual(
      targetTexts(item).filter((entry) => !inCall.text.includes(entry.text)).map((m) => `${m.field}: ${m.text}`),
      [],
      `${item.landingId}: 문자함 안 렌더에서 카탈로그 문구가 빠졌다`,
    );
    assert.ok(isRenderAlive(inCall, item), `${item.landingId}: 문자함 안 렌더의 생존 신호가 없다`);
    // 사용자 결정(2026-10-18) — 두 진입 표면 모두 브라우저 바에 "훈련 종료"가 없다.
    assert.equal(messenger.text.includes("훈련 종료"), false, `${item.landingId}: 메신저 진입 랜딩에 '훈련 종료'가 그려졌다`);
    assert.equal(inCall.text.includes("훈련 종료"), false, `${item.landingId}: 문자함 안 랜딩에 '훈련 종료'가 그려졌다`);
    // D-94 — 문자함 안에서만 브라우저 뒤로 "문자"가 있다.
    assert.equal(messenger.text.split("\n").includes("문자"), false, "메신저 진입에 '문자' 뒤로가 그려졌다");
    assert.equal(inCall.text.split("\n").includes("문자"), true, `${item.landingId}: 문자함 안에 '문자' 뒤로가 없다`);
    rows.push(`${item.landingId}=메신저 ${messenger.markup.length}자/문자함 ${inCall.markup.length}자`);
  }
  t.diagnostic(`[T190/G460] 9종 × 두 진입 표면 렌더 — ${rows.join(" · ")}`);
});

/** 메신저 진입 랜딩의 ✕(닫기) 위반 — 본 단언과 역검증이 같은 함수를 쓴다(사용자 결정 2026-10-18 · UX-023 v1.36 · D-116). */
function closeButtonViolations(messengerMarkup: string, inCallMarkup: string): string[] {
  const out: string[] = [];
  const closeButton = /<button[^>]*aria-label="닫기"[^>]*>/;
  if (!closeButton.test(messengerMarkup)) out.push("메신저 진입에 ✕(닫기)가 없다");
  else {
    if (!/<button[^>]*aria-label="닫기"[^>]*><svg/.test(messengerMarkup)) out.push("✕ 아이콘이 없다");
    // 왼쪽 = 주소 필드(지구본)보다 앞.
    if (messengerMarkup.search(closeButton) > messengerMarkup.indexOf(GLOBE_GLYPH)) out.push("✕가 주소 필드 왼쪽이 아니다");
  }
  if (closeButton.test(inCallMarkup)) out.push("문자함 진입에 ✕가 그려졌다(왼쪽은 '‹ 문자')");
  return out;
}

test("[사용자 결정 2026-10-18 · UX-023 v1.36] 메신저 진입 랜딩 브라우저 바 왼쪽에 ✕(닫기)가 있고 문자함 진입에는 없다", () => {
  for (const item of catalogItems) {
    const messenger = renderLandingScreen(propsFor(item));
    const inCall = renderLandingScreen({ ...propsFor(item), entrySurface: "in-call-sms", onHide: () => {} });
    assert.deepEqual(closeButtonViolations(messenger.markup, inCall.markup), [], item.landingId);
    // 진입 포커스를 받는 컨테이너 — 대화상자 자신이 tabindex=-1이다.
    assert.ok(/role="dialog"[^>]*tabindex="-1"|tabindex="-1"[^>]*role="dialog"/.test(messenger.markup), `${item.landingId}: 대화상자가 포커스를 받을 수 없다`);
  }
});

test("[사용자 결정 2026-10-18 역검증] ✕ 렌더 지점을 끊은 사본은 실패한다", () => {
  const { original, poisoned, overrides } = poisonedComponentSource('<PhoneIcon name="close" size={22} />', "");
  assert.notEqual(poisoned, original, "오염 지점(✕ 아이콘)을 찾지 못했다");
  const { poisoned: noButton, overrides: noButtonOverrides } = poisonedComponentSource("{isMessenger && (", "{false && (");
  assert.notEqual(noButton, original, "오염 지점(✕ 조건)을 찾지 못했다");
  const item = catalogItems[0];
  const inCall = renderLandingScreen({ ...propsFor(item), entrySurface: "in-call-sms", onHide: () => {} });
  const dirty = renderLandingScreen(propsFor(item), noButtonOverrides);
  assert.deepEqual(closeButtonViolations(dirty.markup, inCall.markup), ["메신저 진입에 ✕(닫기)가 없다"]);
  // 아이콘만 끊으면 이름만 있는 빈 버튼이 남는다 — 아이콘 판정이 잡는다.
  const iconless = renderLandingScreen(propsFor(item), overrides);
  assert.deepEqual(closeButtonViolations(iconless.markup, inCall.markup), ["✕ 아이콘이 없다"]);
});

test("[T190/G460 역검증] 문자함 안 래퍼에 aria-modal을 남긴 사본은 실패한다", () => {
  const { original, poisoned, overrides } = poisonedComponentSource(
    // CRLF 체크아웃(autocrlf=true)에서도 맞도록 앵커에 줄바꿈을 넣지 않는다(QA 격리 워크트리 실측 실패).
    'role="region"',
    'role="region" aria-modal="true"',
  );
  assert.notEqual(poisoned, original, "오염 지점(임베디드 래퍼)을 찾지 못했다");
  const item = catalogItems[0];
  const dirty = renderLandingScreen({ ...propsFor(item), entrySurface: "in-call-sms" }, overrides);
  assert.deepEqual(embeddedDialogViolations(dirty.markup), ["aria-modal"]);
});

test("[T190/UX-023 v1.33 (2)(3)] 주소창 ⚠·모노 글꼴·🔒 0 · 기관 헤더 띠 = issuerLabel의 'ⓒ ' 정확 접두 1회 제거", () => {
  for (const item of catalogItems) {
    const { markup, text } = renderLandingScreen(propsFor(item));
    assert.equal(text.includes("⚠"), false, `${item.landingId}: 주소창 경고 표시가 남았다(D-92)`);
    assert.equal(text.includes("🔒"), false, `${item.landingId}: 자물쇠가 남았다(D-92)`);
    assert.equal(/font-mono/.test(markup), false, `${item.landingId}: 모노 글꼴이 남았다`);
    if (item.kind === "credential-form") {
      const issuer = item.fields.get("issuerLabel")?.[0] ?? "";
      const name = issuer.startsWith("ⓒ ") ? issuer.slice(2) : issuer;
      assert.ok(text.split("\n").includes(name), `${item.landingId}: 기관 헤더 띠("${name}")가 없다`);
    }
  }
});

// ── T194-a(docs/Architecture.md §84.13.3 ③) — 설치 화면 상황별 문구 · 표 밖 id 생략 ────────────────────────────────

test("[T194-a §84.13.3 ③] 설치 항목마다 자기 문구만 그린다(교차 0) · 표에 없는 id의 app-install은 아무것도 그리지 않는다(지원금 기본값 0)", (t) => {
  const installs = catalogItems.filter((item) => item.kind === "app-install");
  assert.equal(installs.length, 5, "설치 항목 5종(subsidy · parcel · T194-c-1 Q2 3종)");
  const lines: string[] = [];
  for (const item of installs) {
    const { text } = renderLandingScreen(propsFor(item));
    for (const other of installs.filter((o) => o.landingId !== item.landingId)) {
      const otherHeadline = other.fields.get("headline")?.[0] ?? "";
      assert.equal(text.includes(otherHeadline), false, `${item.landingId} 화면에 ${other.landingId} 헤드라인이 그려졌다`);
    }
    lines.push(`${item.landingId}=${text.length}자`);
  }
  const unknown = renderLandingScreen({ ...propsFor(installs[0]), landingId: "no-such-install" });
  const subsidyHeadline = installs.find((i) => i.landingId === "subsidy-install")?.fields.get("headline")?.[0] ?? "";
  lines.push(`표 밖 id=${unknown.markup.length}자 마크업`);
  t.diagnostic(`[③] ${lines.join(" · ")}`);
  assert.equal(unknown.markup, "", "표에 없는 id의 설치 화면은 생략돼야 한다(UF-012 Failure (a))");
  assert.equal(unknown.text.includes(subsidyHeadline), false);
});
