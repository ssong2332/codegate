// T84 — 모의 화면(UX-023 kind) 컴포넌트의 **구조 불변식**과 서버 카탈로그 **문구 드리프트** 고정
// (Architecture.md §15.9.1 R1/§15.9.7 G50, DECISIONS #42, AC-072/AC-045/AC-022/AC-006).
//
// **왜 소스 텍스트를 검사하는가**: 이 저장소에는 React 렌더러 테스트 러너가 없어(T19 known gap)
// 렌더 결과를 런타임으로 관측할 수 없다. 반면 여기서 막으려는 것들은 **깨지는 방식이 정해져 있다**
// — 누가 이 파일에 `httpsCallable`·`fetch`·`window.open`·권한 API를 들여오거나, kind를 별도
// 파일로 쪼개거나, 카탈로그 문구만 고치면 그 순간 회귀한다. smsTimelineScreens.test.ts와 같은
// 최소 방어이며 라이브 검증을 대체하지 않는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  formatHits,
  parseTsx,
  parseTsxFile,
  scanTokens,
  type Axis,
} from "../lib/sourcescan/scanSource.ts";

const componentPath = "src/components/MessengerFakeLanding.tsx";
const component = readFileSync(componentPath, "utf8");
const catalog = readFileSync("functions/src/scenarios/mockScreens.ts", "utf8");

/** 금지 토큰 검사는 **주석을 제외한 실제 코드**만 본다 — 이 저장소는 "왜 하지 않는가"를 주석에
 * 길게 남기는 관례라, 주석까지 세면 근거를 적었다는 이유로 테스트가 깨진다. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const componentCode = codeOnly(component);

/** AC-045/G50 금지 토큰(요구 무변경 — T108은 **검출 축만** 더한다). 아래 `G50_AXES`와 짝이다. */
const NETWORK_AND_PERMISSION_TOKENS = [
    // 네트워크(입력값 서버 미전송 — AC-045)
    "httpsCallable",
    "fetch(",
    "@/lib/api",
    "firebase/functions",
    "firebase/firestore",
    "XMLHttpRequest",
    "navigator.sendBeacon",
    // 외부 이동·실 URL(AC-032/AC-072)
    "window.open",
    "location.href",
    "href=",
    "http://",
    "https://",
    // 실제 OS/브라우저 권한 요청(AC-072 — "권한 허용"은 화면 안의 가짜 버튼이다)
    "navigator.permissions",
    "getUserMedia",
    "Notification.requestPermission",
    "requestPermission",
    "navigator.mediaDevices",
    "navigator.geolocation",
    // 실제 설치 경로
    ".apk",
    "market://",
    "intent://",
    "beforeinstallprompt",
];

test("[G50/AC-045/AC-072] 목업 화면에 나가는 네트워크·외부 이동·권한 API 경로가 **하나도 없다**", () => {
  for (const forbidden of NETWORK_AND_PERMISSION_TOKENS) {
    assert.equal(
      componentCode.includes(forbidden),
      false,
      `${componentPath}에 있으면 안 되는 것: ${forbidden} — 이 파일의 "전송·설치 경로 부재"가 AC-072/AC-045의 증명이다`,
    );
  }
});

test("[역검증] 금지 토큰이 섞이면 위 스캔이 실제로 실패한다", () => {
  const poisoned = `${componentCode}\nconst r = await fetch("https://example.com/app.apk");`;
  assert.ok(poisoned.includes("fetch("));
  assert.ok(poisoned.includes("https://"));
  assert.ok(poisoned.includes(".apk"));
});

test("[R1] kind 분기가 **이 파일 안에서** 일어난다(신규 컴포넌트 파일 0건)", () => {
  // 파일 안 서브 컴포넌트 2종이 모두 여기 있다.
  assert.ok(componentCode.includes("function AppInstallMockup"), "app-install 렌더가 이 파일 안에 있어야 한다");
  assert.ok(componentCode.includes("function CredentialFormMockup"), "기존 kind 렌더도 같은 파일 안에 있다");
  assert.ok(componentCode.includes('landingKind === "app-install"'), "분기 지점이 이 파일 안에 있어야 한다");

  // 같은 디렉터리에 "가짜 랜딩"을 그리는 **다른 파일**이 생기지 않았는지 본다 — 생기면 안전 계약이
  // 두 벌이 되고 그것이 AC-072가 금지한 "검증 경로 이중화"다.
  const siblings = readdirSync("src/components").filter(
    (name) => /landing|install|mockup/i.test(name) && name !== "MessengerFakeLanding.tsx",
  );
  assert.deepEqual(siblings, [], `가짜 랜딩/설치 화면 파일이 분리되면 안 된다(§15.9.1 R1): ${siblings.join(", ")}`);
});

test("[AC-022/AC-006] 모의 표식과 '훈련 종료'가 kind와 무관하게 **공유 헤더**에 있다", () => {
  const headerEnd = componentCode.indexOf("landingKind === \"app-install\" ? (");
  const header = componentCode.slice(0, headerEnd);
  assert.ok(header.includes("AI 훈련용 모의 화면"), "상시 모의 표식이 분기 이전(공유 헤더)에 있어야 한다");
  assert.ok(header.includes("<EndTrainingButton"), "상시 '훈련 종료'가 분기 이전(공유 헤더)에 있어야 한다");
  // 헤더가 kind별로 복제되면 한쪽만 고쳐지는 사고가 난다.
  assert.equal(
    componentCode.split("<EndTrainingButton").length - 1,
    1,
    "종료 컨트롤은 정확히 한 번만 렌더된다(두 kind가 공유)",
  );
});

test("[§15.9.6] 응낙 기록은 콜백으로 위임한다(컴포넌트가 직접 기록하지 않는다)", () => {
  assert.ok(componentCode.includes("onInstallConsent"), "페이지로 올리는 콜백 prop이 있어야 한다");
  assert.equal(
    componentCode.includes("recordMockScreenEvent"),
    false,
    "콜러블 호출은 페이지가 한다 — 컴포넌트가 부르면 이 파일의 네트워크 경로 부재가 깨진다",
  );
});

// ── 서버 카탈로그 ↔ 화면 문구 드리프트(§15.9.1 R3) ───────────────────────────
//
// 카탈로그(`functions/src/scenarios/mockScreens.ts`)가 문구의 정본이고, 실제 렌더는 이 컴포넌트가
// 한다(두 패키지라 import로 공유할 수 없다 — functions/는 별도 TS 빌드 루트다). 그래서 **소스
// 텍스트를 대조해** 한쪽만 고쳐지는 드리프트를 잡는다(publicMeta.ts ↔ src/content 미러 검사와
// 같은 관례).
// ⚠️ **T104/G76 — 이 파서는 "항목 1개" 전제로 짜여 있었다.** 이전 구현은
//   (a) `catalog.indexOf("bodyLines: [")`로 **첫 번째 블록 하나만** 검사했고,
//   (b) `field: "..."` 단일 정규식이라 **배열·옵셔널 필드를 읽지 못했다.**
// 항목이 5개가 되는 순간 4개 문구가 조용히 대조를 안 타는 상태였다. 그래서 **항목 단위 순회**로
// 바꾸고, **필드 이름 등록부**(아래 세 목록)와 **대조 건수**를 함께 단언한다 — 새 필드가 등록 없이
// 들어오면 실패하고, 항목이 늘었는데 대조 건수가 안 늘어도 실패한다.

/** 화면에 그려지는 문자열 필드 — 컴포넌트 소스에 **그대로 있어야** 한다. */
const RENDERED_FIELDS = [
  "headline",
  "bodyLines",
  "issuerLabel",
  "fields",
  "submitLabel",
  "successHeadline",
  "consentLabel",
];
/** 화면이 아니라 **리포트**로 가는 문자열 필드 — 컴포넌트에 있으면 오히려 잘못이다(§15.9.5 e-4). */
const REPORT_ONLY_FIELDS = ["momentTactic", "correctAction"];
/** 식별자·열거형 — 문구가 아니다. */
const NON_TEXT_FIELDS = ["landingId", "kind", "entrySurface"];

const KNOWN_FIELDS = [...RENDERED_FIELDS, ...REPORT_ONLY_FIELDS, ...NON_TEXT_FIELDS];

type CatalogItem = { landingId: string; fields: Map<string, string[]> };

/** 카탈로그 소스를 **항목 단위**로 자른다. `MOCK_SCREENS` 선언 이후는 항목 리터럴이 아니다. */
function parseCatalogItems(): CatalogItem[] {
  const anchor = catalog.indexOf("export const MOCK_SCREENS");
  assert.ok(anchor > 0, "카탈로그에 MOCK_SCREENS 선언이 있어야 한다");
  const starts = [...catalog.matchAll(/landingId:\s*"([^"]+)"/g)].map((m) => ({
    landingId: m[1],
    at: m.index ?? 0,
  }));
  assert.ok(starts.length > 0, "카탈로그에서 항목을 하나도 찾지 못했다 — 파서가 죽었다");
  for (const start of starts) {
    assert.ok(
      start.at < anchor,
      `항목 '${start.landingId}'가 MOCK_SCREENS 선언 뒤에 있다 — 파서가 이 항목을 건너뛴다`,
    );
  }
  return starts.map((start, index) => {
    const block = catalog.slice(start.at, starts[index + 1]?.at ?? anchor);
    const fields = new Map<string, string[]>();
    for (const name of KNOWN_FIELDS) {
      const values = extractFieldValues(block, name);
      if (values !== null) fields.set(name, values);
    }
    // 등록되지 않은 속성이 항목에 있으면 그 문구는 어떤 검사도 타지 않는다.
    for (const [, key] of block.matchAll(/^ {4}(\w+):/gm)) {
      assert.ok(
        KNOWN_FIELDS.includes(key),
        `'${start.landingId}'의 필드 '${key}'가 이 파일의 등록부에 없다 — ` +
          "RENDERED/REPORT_ONLY/NON_TEXT 중 하나에 넣어라(안 넣으면 드리프트 검사를 통째로 우회한다)",
      );
    }
    return { landingId: start.landingId, fields };
  });
}

/** 문자열 필드와 문자열 배열 필드를 **둘 다** 읽는다(이전 파서가 못 읽던 자리). */
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

const catalogItems = parseCatalogItems();

test("[G76/드리프트] 카탈로그 **모든 항목**의 화면 문구가 컴포넌트에 그대로 있다", () => {
  let compared = 0;
  for (const item of catalogItems) {
    // 항목마다 최소한 headline·bodyLines·issuerLabel은 있어야 한다(공통 필수 필드).
    for (const required of ["headline", "bodyLines", "issuerLabel"]) {
      assert.ok(
        item.fields.has(required),
        `${item.landingId}: 필수 필드 '${required}'를 파서가 읽지 못했다 — 서식이 바뀌었으면 파서를 넓혀라`,
      );
    }
    for (const name of RENDERED_FIELDS) {
      for (const text of item.fields.get(name) ?? []) {
        // ⚠️ 주석을 제거한 코드에서 찾는다 — 주석에 문구를 적어 두는 것으로 통과하면 안 된다.
        assert.ok(
          componentCode.includes(text),
          `카탈로그 문구가 화면에 없다(드리프트) — ${item.landingId}.${name}: ${text}`,
        );
        compared += 1;
      }
    }
  }
  // **대조 건수 단언**(§19.3 (4)) — 항목이 늘었는데 대조가 안 늘면 여기서 걸린다.
  const expected = catalogItems.reduce(
    (n, item) => n + RENDERED_FIELDS.reduce((m, name) => m + (item.fields.get(name)?.length ?? 0), 0),
    0,
  );
  assert.equal(compared, expected, "대조 건수가 파싱 결과와 다르다 — 순회가 중간에 빠졌다");
  assert.ok(
    compared >= 4 * catalogItems.length,
    `항목당 최소 4건(headline+bodyLines+issuerLabel+kind 전용)은 대조돼야 한다(현재 ${compared}건 / ${catalogItems.length}항목)`,
  );
});

test("[G76/역검증] 항목이 하나라도 순회에서 빠지면 위 검사가 의미를 잃는다는 것을 고정한다", () => {
  // 파서가 "첫 블록만" 보던 이전 구현을 재현해 **검사 범위가 실제로 넓어졌음**을 보인다.
  const firstOnly = catalog.slice(catalog.indexOf("bodyLines: ["), catalog.indexOf("]", catalog.indexOf("bodyLines: [")));
  const firstOnlyLines = [...firstOnly.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const allLines = catalogItems.flatMap((item) => item.fields.get("bodyLines") ?? []);
  assert.ok(
    allLines.length > firstOnlyLines.length || catalogItems.length === 1,
    `항목이 ${catalogItems.length}개인데 첫 블록만 보던 이전 파서와 대조 범위가 같다 — G76이 안 고쳐졌다`,
  );
  // 그리고 카탈로그에만 있고 화면에 없는 문구는 실제로 잡힌다.
  assert.equal(componentCode.includes("이 문구는 어느 화면에도 없다"), false);
});

test("[G76] 리포트 전용 문구(momentTactic·correctAction)는 화면 컴포넌트에 들어가지 않는다", () => {
  // §15.9.5 e-4 — 목업 문구를 리포트 스냅샷에 싣지 않는 것과 **반대 방향**의 규칙이다.
  // 대처 문구가 화면에 섞이면 훈련 도중에 정답이 노출된다(D-6 취지).
  for (const item of catalogItems) {
    for (const name of REPORT_ONLY_FIELDS) {
      for (const text of item.fields.get(name) ?? []) {
        assert.equal(
          componentCode.includes(text),
          false,
          `리포트 전용 문구가 화면에 있다 — ${item.landingId}.${name}`,
        );
      }
    }
  }
});

// ── T104 — 상황별 콘텐츠 조회의 구조 규칙(§19.4 R7/R8 · AC-078 (d)) ─────────────

/** R8 금지 토큰(요구 무변경 — T108은 **검출 축만** 더한다). 아래 `R8_AXES`와 짝이다. */
const LANDING_ID_CLASSIFY_TOKENS = [
  "landingId.startsWith",
  "landingId.includes",
  "landingId.split",
  "landingId.match",
  "landingId.indexOf",
  "landingId.replace",
  "landingId.endsWith",
  "test(landingId",
];

test("[T104/R8] landingId는 **정확 일치 조회 키**로만 쓰인다(문자열 분류 0건)", () => {
  // AC-024 자유문자열 분류 금지 원칙의 계승 — `startsWith`·`includes`·정규식으로 랜딩 성격을
  // 추론하기 시작하면 서버가 kind를 정한다는 R3이 클라에서 조용히 무너진다.
  for (const forbidden of LANDING_ID_CLASSIFY_TOKENS) {
    assert.equal(componentCode.includes(forbidden), false, `landingId 문자열 분류 금지(R8): ${forbidden}`);
  }
  assert.ok(
    componentCode.includes("CREDENTIAL_LANDING_COPY[landingId]"),
    "정확 일치 키 조회가 있어야 한다",
  );
});

// ── T108(docs/Architecture.md §24) — 위 두 리터럴 게이트에 **AST 축을 합집합으로 더한다** ─────
//
// **왜.** T104 QA가 소스 텍스트 스캔을 피하는 형태 3종을 재현했다(표현식 컨테이너·동적 태그명·
// computed prop key). 같은 부류의 회피는 여기에도 그대로 통한다 — `globalThis["fet"+"ch"]`·
// `navigator["geo"+"location"]`·`landingId["start"+"sWith"]`는 소스에 금지 문자열이 없다.
// AST 축은 **표기와 무관하게** 호출·멤버 접근·import 지정자·문자열 값을 구조로 본다.
//
// ⚠️ **N1 — 위 리터럴 검사를 걷어내지 않는다.** 합집합이지 교체가 아니다.
// ⚠️ **요구 무변경** — 금지 토큰 목록은 위 두 상수 그대로다(§24.10 ⑧).
// ⚠️ **자기 고지**: 이 축도 고의 난독화에 완전하지 않다(런타임 조립·표현식이 낀 템플릿은 정적
// 결정 불가). 전체 한계와 그 근거는 `src/lib/sourcescan/scanSource.ts` 머리말과
// `src/lib/incallsms/callContinuity.test.ts`의 `[T108/한계]`에 있다 — **스캔 대상 파일 집합이
// 고정이라 파일 분할로 무력화된다**는 것을 포함한다.

const landingAst = parseTsxFile(componentPath);

const G50_AXES: Record<string, Axis[]> = {
  httpsCallable: ["callOrMember"],
  "fetch(": ["callOrMember"],
  "@/lib/api": ["importSpecifier"],
  "firebase/functions": ["importSpecifier"],
  "firebase/firestore": ["importSpecifier"],
  XMLHttpRequest: ["callOrMember"],
  "navigator.sendBeacon": ["callOrMember"],
  "window.open": ["callOrMember"],
  "location.href": ["callOrMember"],
  "href=": ["jsxAttribute"],
  "http://": ["foldedString"],
  "https://": ["foldedString"],
  "navigator.permissions": ["callOrMember"],
  getUserMedia: ["callOrMember"],
  "Notification.requestPermission": ["callOrMember"],
  requestPermission: ["callOrMember"],
  "navigator.mediaDevices": ["callOrMember"],
  "navigator.geolocation": ["callOrMember"],
  ".apk": ["foldedString"],
  "market://": ["foldedString"],
  "intent://": ["foldedString"],
  beforeinstallprompt: ["foldedString"],
};

const R8_AXES: Record<string, Axis[]> = {
  "landingId.startsWith": ["callOrMember"],
  "landingId.includes": ["callOrMember"],
  "landingId.split": ["callOrMember"],
  "landingId.match": ["callOrMember"],
  "landingId.indexOf": ["callOrMember"],
  "landingId.replace": ["callOrMember"],
  "landingId.endsWith": ["callOrMember"],
  "test(landingId": ["callOrMember"],
};

test("[G50/T108] AST 축에서도 네트워크·외부 이동·권한 API가 0건이다(합집합 — N1)", (t) => {
  assert.deepEqual(
    Object.keys(G50_AXES).sort(),
    [...NETWORK_AND_PERMISSION_TOKENS].sort(),
    "금지 토큰과 검출 축 매핑이 어긋났다 — 토큰을 늘렸으면 §24.6 표에 축을 지정하라",
  );
  const hits = scanTokens(landingAst, "G50", G50_AXES);
  t.diagnostic(`[오탐 전수] ${componentPath} / G50 → 위반 ${hits.length}건 ${JSON.stringify(hits)}`);
  assert.deepEqual(hits, [], formatHits(hits));
  // S5 — 파싱이 죽은 채 "0건"으로 통과하지 않는다.
  assert.ok(landingAst.jsxElementNames().length > 10, "AST가 실제 JSX를 보고 있어야 한다");
  assert.ok(landingAst.importModuleSpecifiers().length > 0, "AST가 import를 보고 있어야 한다");
});

test("[T104/R8·T108] AST 축에서도 landingId 문자열 분류가 0건이다", (t) => {
  assert.deepEqual(
    Object.keys(R8_AXES).sort(),
    [...LANDING_ID_CLASSIFY_TOKENS].sort(),
    "R8 금지 토큰과 검출 축 매핑이 어긋났다",
  );
  const hits = scanTokens(landingAst, "R8", R8_AXES);
  t.diagnostic(`[오탐 전수] ${componentPath} / R8 → 위반 ${hits.length}건 ${JSON.stringify(hits)}`);
  assert.deepEqual(hits, [], formatHits(hits));
  // 정상 경로(정확 일치 조회)는 계속 있어야 한다 — 위 [T104/R8]의 단언과 같은 계약.
  assert.ok(componentCode.includes("CREDENTIAL_LANDING_COPY[landingId]"));
  assert.ok(landingAst.callAndMemberNames().length > 10, "AST가 호출·멤버 접근을 보고 있어야 한다");
});

test("[T108/역검증 4] 조립된 표기가 섞이면 AST 축이 실제로 잡는다(리터럴 검사는 못 잡는다)", (t) => {
  // 오염은 **테스트 코드 안에서만**(callContinuity.test.ts:161-162 관례).
  const poison = [
    'const G: any = (globalThis as any)["fet"+"ch"];',
    'const U: any = navigator["geo"+"location"];',
    'const K: any = landingId["start"+"sWith"]("card");',
    'const S = "htt"+"ps://example.com/app"+"."+"apk";',
  ].join("\n");
  const parsed = parseTsx("MessengerFakeLanding.poisoned.tsx", `${component}\n${poison}\n`);

  const literalCaught = [...NETWORK_AND_PERMISSION_TOKENS, ...LANDING_ID_CLASSIFY_TOKENS].filter(
    (token) => poison.includes(token),
  );
  const hits = [...scanTokens(parsed, "G50", G50_AXES), ...scanTokens(parsed, "R8", R8_AXES)];
  const shape = [...new Set(hits.map((hit) => `${hit.axis}/${hit.token}`))].sort();
  t.diagnostic(`현행 리터럴 검사: ${literalCaught.length}건 / AST 축: ${shape.join(", ")}`);
  assert.deepEqual(literalCaught, [], "이 형태가 리터럴로 잡혔다면 샘플이 조립 형태가 아니다");
  assert.deepEqual(shape, [
    "callOrMember/fetch(",
    "callOrMember/landingId.startsWith",
    "callOrMember/navigator.geolocation",
    "foldedString/.apk",
    "foldedString/https://",
  ]);
});

test("[T104/R7·AC-078 (d)] 콘텐츠 미스는 **같은 kind의 범용 화면**으로만 떨어진다", () => {
  // 폴백 대상이 GENERIC_CREDENTIAL_COPY(=범용 credential-form)임을 소스로 고정한다.
  assert.ok(
    /CREDENTIAL_LANDING_COPY\[landingId\][^;]*\?\?\s*GENERIC_CREDENTIAL_COPY/.test(componentCode),
    "콘텐츠 미스의 폴백이 범용 credential-form 문구여야 한다(§15.9.1 R5)",
  );
  // ⛔ app-install 렌더가 credential 콘텐츠 표를 보지 않는다 — 조회가 kind를 바꾸는 경로 0건.
  const installStart = componentCode.indexOf("function AppInstallMockup");
  assert.ok(installStart > 0);
  const installBody = componentCode.slice(installStart);
  assert.equal(
    installBody.includes("CREDENTIAL_LANDING_COPY"),
    false,
    "app-install이 credential 콘텐츠 표를 읽으면 kind 경계가 콘텐츠로 새어 R5 폴백 금지를 우회한다",
  );
  // 그리고 kind 분기 자체는 콘텐츠보다 **먼저** 끝난다(R7).
  const branchAt = componentCode.indexOf('landingKind === "app-install" ? (');
  const lookupAt = componentCode.indexOf("CREDENTIAL_LANDING_COPY[landingId]");
  assert.ok(branchAt > 0 && lookupAt > branchAt, "콘텐츠 조회가 kind 분기보다 먼저 일어나면 안 된다");
});

test("[T104] 화면 콘텐츠 표의 키가 **전부 카탈로그에 있는 landingId**다(반대 방향 드리프트)", () => {
  const tableStart = componentCode.indexOf("const CREDENTIAL_LANDING_COPY");
  assert.ok(tableStart > 0, "상황별 콘텐츠 표가 있어야 한다");
  const tableBody = componentCode.slice(tableStart, componentCode.indexOf("\n};", tableStart));
  const keys = [...tableBody.matchAll(/^ {2}"([a-z0-9-]+)":/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 4, `상황별 랜딩 4종이 있어야 한다(현재 ${keys.length}종): ${keys}`);
  const catalogIds = catalogItems.map((item) => item.landingId);
  for (const key of keys) {
    assert.ok(
      catalogIds.includes(key),
      `화면에만 있는 랜딩 콘텐츠다 — 서버 카탈로그에 없는 키: ${key}`,
    );
  }
  // 카탈로그의 credential-form 항목은 전부 표에 있어야 한다(범용 화면으로 떨어지면 사용자 신고 재발).
  const credentialIds = catalogItems
    .filter((item) => (item.fields.get("kind") ?? [])[0] !== "app-install")
    .map((item) => item.landingId);
  assert.deepEqual(keys.slice().sort(), credentialIds.slice().sort());
});

test("[AC-072] 화면 문구에도 실존 앱명·스토어 표기가 없다", () => {
  // 주석은 제외한다 — 이 파일의 주석은 "무엇을 하면 안 되는가"를 적고 있어 금지어를 인용한다.
  for (const forbidden of ["카카오뱅크", "토스", "네이버", "정부24", "AnyDesk", "TeamViewer", "플레이스토어", "앱스토어"]) {
    assert.equal(componentCode.includes(forbidden), false, `화면 문구에 있으면 안 되는 것: ${forbidden}`);
  }
});

// ── T84 reviewer Major 1(2026-07-26) — 연속성 앵커 회귀 방지 ──────────────────
//
// UX.md UF-012 Steps §6은 **연속성 앵커 3종**이 "세 단계 내내 자리를 지킨다"고 요구한다.
// 이 오버레이는 `fixed inset-0`으로 페이지 헤더를 통째로 덮으므로, 난이도 배지를 헤더에 다시
// 그리지 않으면 **2단계에서만 앵커가 사라진다.** 앵커의 존재 이유가 "지금 같은 훈련 안에 있다"는
// 감각을 끊지 않는 것이라, 한 단계에서만 사라지면 그 목적이 무너진다.
//
// ⚠️ 난이도는 표기일 뿐 **어떤 안전장치도 게이팅하지 않는다**(AC-065). 이 테스트는 배지가
// "보이는지"만 고정하고 배지가 동작을 바꾸는지는 검사하지 않는다 — 바꾸면 안 되기 때문이다.
test("[T84] 모의 화면 오버레이 헤더가 난이도 배지를 다시 그린다(연속성 앵커, UF-012 Steps §6)", () => {
  assert.ok(
    /difficultyLabel/.test(component),
    "오버레이가 난이도 라벨을 받지 않으면 2단계에서 연속성 앵커가 사라진다.",
  );
  assert.ok(
    /난이도 \{difficultyLabel\}/.test(component),
    "받은 라벨을 실제로 렌더해야 한다 — prop만 받고 안 그리면 의미가 없다.",
  );

  // ⚠️ 라벨을 **번역해서** 받아야 한다 — 컴포넌트가 난이도 사전을 갖게 되면 표기 정본이
  // 페이지 헤더와 오버레이 두 곳으로 갈라진다(드리프트).
  assert.ok(
    !/DIFFICULTY_LABEL/.test(component),
    "컴포넌트가 난이도 사전을 import하면 표기 정본이 두 곳으로 갈라진다 — " +
      "페이지가 자기 헤더에 쓰는 값을 그대로 내려보내야 한다.",
  );
});
