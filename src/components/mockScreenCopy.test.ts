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

const componentPath = "src/components/MessengerFakeLanding.tsx";
const component = readFileSync(componentPath, "utf8");
const catalog = readFileSync("functions/src/scenarios/mockScreens.ts", "utf8");

/** 금지 토큰 검사는 **주석을 제외한 실제 코드**만 본다 — 이 저장소는 "왜 하지 않는가"를 주석에
 * 길게 남기는 관례라, 주석까지 세면 근거를 적었다는 이유로 테스트가 깨진다. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const componentCode = codeOnly(component);

test("[G50/AC-045/AC-072] 목업 화면에 나가는 네트워크·외부 이동·권한 API 경로가 **하나도 없다**", () => {
  for (const forbidden of [
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
  ]) {
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
function extractCatalogStrings(field: string): string[] {
  const pattern = new RegExp(`${field}:\\s*"([^"]+)"`, "g");
  return [...catalog.matchAll(pattern)].map((m) => m[1]);
}

test("[드리프트] 카탈로그의 headline·consentLabel이 화면 문구와 정확히 일치한다", () => {
  const headlines = extractCatalogStrings("headline");
  const consentLabels = extractCatalogStrings("consentLabel");
  assert.ok(headlines.length >= 1, "카탈로그에 headline이 있어야 한다");
  assert.ok(consentLabels.length >= 1, "카탈로그에 consentLabel이 있어야 한다");
  for (const text of [...headlines, ...consentLabels]) {
    // ⚠️ 주석을 제거한 코드에서 찾는다 — 주석에 문구를 적어 두는 것으로 통과하면 안 된다.
    assert.ok(
      componentCode.includes(text),
      `카탈로그 문구가 화면에 없다(드리프트): ${text}`,
    );
  }
});

test("[드리프트] 카탈로그의 bodyLines가 화면 문구와 정확히 일치한다", () => {
  const start = catalog.indexOf("bodyLines: [");
  assert.ok(start > 0, "카탈로그에 bodyLines 배열이 있어야 한다");
  const block = catalog.slice(start, catalog.indexOf("]", start));
  const lines = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(lines.length >= 1, "카탈로그 bodyLines가 비어 있으면 안 된다");
  for (const line of lines) {
    assert.ok(componentCode.includes(line), `카탈로그 bodyLine이 화면에 없다(드리프트): ${line}`);
  }
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
