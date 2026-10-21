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

// T187(PRD v1.18 AC-086 · T187 · docs/Architecture.md §72.8) — 표식 단언을 **반전**했다: 공유 헤더에
// 표식·부정 문구가 0이고, "훈련 종료"만 공유 헤더에 정확히 1회 남는다(AC-006 절반은 그대로).
/** 공유 헤더 텍스트에 남은 세션 중 표식·부정 문구. 반전 단언과 역검증이 같이 쓴다. */
function sharedHeaderMarkers(header: string): string[] {
  return [
    "AI 훈련용 모의 화면",
    "훈련용",
    "모의",
    "실제 설치·권한 부여가 아닙니다",
    "실제 로그인/전송이 아니며",
    "<Banner",
  ].filter((token) => header.includes(token));
}

function sharedHeaderOf(code: string): string {
  return code.slice(0, code.indexOf("landingKind === \"app-install\" ? ("));
}

// ⭐ 사용자 결정(2026-10-18) — 가짜 랜딩 브라우저 바의 "훈련 종료"를 **없앴다**(메신저 진입·문자함 진입 둘 다).
// 그래서 옛 단언("공유 헤더에 `<EndTrainingButton`이 정확히 1회")을 **반전**했다: 이 파일 어디에도 종료 컨트롤·
// 종료 콜백이 없어야 한다. 표식 0 단언(AC-086)은 결정과 무관해 그대로 둔다.
/** 이 파일에 남은 종료 컨트롤 흔적. 반전 단언과 역검증이 같이 쓴다. */
function endControlTraces(code: string): string[] {
  return ["EndTrainingButton", "onEndTraining", "훈련 종료"].filter((token) => code.includes(token));
}

test("[사용자 결정 2026-10-18 · T187] 가짜 랜딩(공유 헤더 포함)에 '훈련 종료'가 **없고** 공유 헤더에 세션 중 표식이 없다", () => {
  const header = sharedHeaderOf(componentCode);
  assert.deepEqual(sharedHeaderMarkers(header), [], "공유 헤더에 세션 중 표식·부정 문구가 남아 있다(AC-086)");
  assert.deepEqual(
    endControlTraces(componentCode),
    [],
    "가짜 랜딩에 종료 컨트롤이 되살아났다 — 사용자 결정(2026-10-18)으로 브라우저 바의 '훈련 종료'는 없다",
  );
});

test("[사용자 결정 2026-10-18 역검증] 공유 헤더에 종료 버튼을 되살린 사본은 반전 단언에 걸린다", () => {
  const anchor = "{landingHostFor(landingKind, landingId)}";
  const poisoned = componentCode.replace(anchor, `${anchor}\n<EndTrainingButton onClick={onEndTraining} />`);
  assert.notEqual(poisoned, componentCode, "오염 지점(주소창 호스트)을 찾지 못했다 — 역검증이 공회전한다");
  assert.deepEqual(endControlTraces(poisoned), ["EndTrainingButton", "onEndTraining"]);
});

// ⭐ 사용자 결정(2026-10-18 · UX-023 v1.36 표 · D-116) — 메신저 진입 대화상자의 진입 포커스 · 트랩 · Esc · 복귀.
// 키보드 이벤트는 이 저장소에서 실행 관측이 안 돼(렌더러·DOM 없음) 소스 형태로 고정한다(실행 확인은 브라우저).
function messengerDialogFocusViolations(code: string): string[] {
  const out: string[] = [];
  if (!code.includes("if (!isMessenger) return;")) out.push("문자함 진입에서도 트랩이 돈다(중첩 트랩 — G460)");
  if (!code.includes("dialogRef.current?.focus();")) out.push("진입 포커스가 대화상자로 가지 않는다");
  if (!/event\.key === "Escape"[\s\S]{0,80}onCloseRef\.current\(\)/.test(code)) out.push("Esc = 닫기가 아니다");
  if (!code.includes("(event.shiftKey ? last : first).focus();")) out.push("밖 포커스를 안쪽으로 감싸지 않는다");
  if (!code.includes("first.focus();") || !code.includes("last.focus();")) out.push("첫/끝 순환이 없다");
  if (!code.includes("opener.focus();")) out.push("닫힌 뒤 연 요소로 포커스가 돌아가지 않는다");
  if (!code.includes("ref={dialogRef}")) out.push("대화상자에 ref가 없다");
  return out;
}

test("[사용자 결정 2026-10-18 · UX-023 v1.36] 메신저 진입 대화상자: 진입 포커스 · 트랩 · Esc = 닫기 · 연 요소로 복귀", () => {
  assert.deepEqual(messengerDialogFocusViolations(componentCode), []);
});

test("[사용자 결정 2026-10-18 역검증] Esc 처리 · 진입 포커스를 지운 사본은 각각 실패한다", () => {
  const noEsc = componentCode.replace('event.key === "Escape"', 'event.key === "Esc-removed"');
  const noFocus = componentCode.replace("dialogRef.current?.focus();", "");
  assert.notEqual(noEsc, componentCode, "오염 지점(Esc)을 찾지 못했다");
  assert.notEqual(noFocus, componentCode, "오염 지점(진입 포커스)을 찾지 못했다");
  assert.deepEqual(messengerDialogFocusViolations(noEsc), ["Esc = 닫기가 아니다"]);
  assert.deepEqual(messengerDialogFocusViolations(noFocus), ["진입 포커스가 대화상자로 가지 않는다"]);
});

test("[AC-006 · T187 역검증] 공유 헤더에 옛 표식 배너를 되살린 사본은 반전 단언에 걸린다", () => {
  // 사용자 결정(2026-10-18) — 옛 오염 앵커(`<EndTrainingButton …/>`)가 사라져 같은 공유 헤더 안의 주소창 호스트로 옮겼다.
  const anchor = "{landingHostFor(landingKind, landingId)}";
  const poisoned = componentCode.replace(
    anchor,
    `${anchor}\n<Banner variant="caution" sticky className="flex-1">AI 훈련용 모의 화면 · 실제 설치·권한 부여가 아닙니다</Banner>`,
  );
  assert.notEqual(poisoned, componentCode, "오염 지점을 찾지 못했다 — 역검증이 공회전한다");
  const found = sharedHeaderMarkers(sharedHeaderOf(poisoned));
  assert.ok(found.includes("AI 훈련용 모의 화면") && found.includes("<Banner"), `검출 실패: ${found.join(", ")}`);
});

test("[§15.9.6] 응낙 기록은 콜백으로 위임한다(컴포넌트가 직접 기록하지 않는다)", () => {
  assert.ok(componentCode.includes("onInstallConsent"), "페이지로 올리는 콜백 prop이 있어야 한다");
  assert.equal(
    componentCode.includes("recordMockScreenEvent"),
    false,
    "콜러블 호출은 페이지가 한다 — 컴포넌트가 부르면 이 파일의 네트워크 경로 부재가 깨진다",
  );
});

// ── G138 / AC-080 (a) — **제출 콜백은 무인자다**(T123, Architecture.md §31.6 (3)(4)) ─────────
//
// 참가자가 가짜 랜딩 폼을 제출하면 **"제출했다는 사실"만** 기록된다(AC-080). 입력값(계좌번호·
// 예금주명)은 `CredentialFormMockup`의 로컬 state를 벗어나지 않는다(AC-045 무변경).
// 그 경계를 지키는 **유일한 기계적 방어**가 이 블록이다 — 콜백에 인자가 실리는 순간 값이 페이지로
// 넘어가고, 페이지에는 `fetch(`·`httpsCallable`이 정상적으로 존재하므로 **위 금지 토큰 스캔은
// 그것을 잡지 못한다**(아래 역검증이 그 사실 자체를 출력으로 보인다).
//
// ⚠️ **한계(정직 고지)**: 이 검사도 소스 텍스트 스캔이라 **스캔 대상 파일 집합이 고정**이고
// 파일 분할로 무력화된다(`src/lib/incallsms/callContinuity.test.ts`의 `[T108/한계]`와 동일).
// 그리고 **T116이 미해결**이라 *"참가자가 실제로 그 화면을 보고 제출했다"* 는 여전히 렌더 층에서
// 검증되지 않는다 — 이 게이트가 판정하는 것은 **콜백의 모양**뿐이다.

/** ① 무인자 호출이 실제로 있는가. */
const SUBMIT_CALLBACK_NO_ARG = /onCredentialSubmit\??\.?\(\s*\)/;
/** ② 인자를 실은 호출이 있는가 — 있으면 위반이다(§31.6 G138). */
const SUBMIT_CALLBACK_WITH_ARG = /onCredentialSubmit\??\.?\(\s*[^)\s]/;

/** ③ 콜백 호출과 입력 state(`values`/`setValues`)가 **같은 식(줄)** 에 등장하는 지점. */
function submitCallbackLinesTouchingValues(source: string): string[] {
  return source
    .split("\n")
    .filter(
      (line) =>
        /onCredentialSubmit\??\.?\(/.test(line) && /\bvalues\b|\bsetValues\b/.test(line),
    );
}

test("[G138/AC-080 (a)] 제출 콜백은 **무인자**다 — 입력값이 컴포넌트 밖으로 나가지 않는다", () => {
  // ① 위임 형태가 실제로 존재한다(§15.9.6 관례 = `onInstallConsent`와 같은 축).
  assert.ok(
    componentCode.includes("onCredentialSubmit"),
    "제출 사실을 페이지로 올리는 콜백 prop이 있어야 한다",
  );
  assert.ok(
    SUBMIT_CALLBACK_NO_ARG.test(componentCode),
    "`onCredentialSubmit?.()` 형태의 **무인자** 호출이 있어야 한다",
  );
  // ② 인자를 실은 호출이 0건이다 — 이것이 G138의 본체다.
  assert.equal(
    SUBMIT_CALLBACK_WITH_ARG.test(componentCode),
    false,
    "제출 콜백에 인자를 실으면 참가자 입력이 컴포넌트 밖으로 나가는 첫 경로가 생긴다(AC-045 위반)",
  );
  // ③ 입력 state가 콜백 경로에 닿지 않는다.
  assert.deepEqual(
    submitCallbackLinesTouchingValues(componentCode),
    [],
    "입력 state(values/setValues)가 제출 콜백과 같은 식에 등장하면 안 된다",
  );
  // ④ 기록 콜러블 **2종 모두**가 이 파일에 부재하다(위 `[§15.9.6]`의 축을 양쪽으로 넓힌다 —
  //    요구 확장이 아니라 같은 요구의 누락 축 보완이다. 랜딩은 이제 통화 표면에서도 열린다).
  for (const callable of ["recordMockScreenEvent", "recordInCallSmsEvent"]) {
    assert.equal(
      componentCode.includes(callable),
      false,
      `${callable} 호출은 페이지가 한다 — 컴포넌트가 부르면 이 파일의 네트워크 경로 부재가 깨진다`,
    );
  }
});

test("[G138/역검증] 인자를 실은 제출 콜백이 섞이면 위 ②·③이 **실제로 실패**한다", (t) => {
  // 오염은 **테스트 코드 안에서만** 만든다(callContinuity.test.ts:161-162 관례) —
  // 실제 컴포넌트를 고쳤다 되돌리지 않는다.
  const poisoned = componentCode.replace("onCredentialSubmit?.()", "onCredentialSubmit?.(values)");
  assert.notEqual(
    poisoned,
    componentCode,
    "오염 샘플이 만들어지지 않았다 = 정상 경로에 무인자 호출이 없다는 뜻이다",
  );

  const real = {
    withArg: SUBMIT_CALLBACK_WITH_ARG.test(componentCode),
    valuesLines: submitCallbackLinesTouchingValues(componentCode).length,
  };
  const bad = {
    withArg: SUBMIT_CALLBACK_WITH_ARG.test(poisoned),
    valuesLines: submitCallbackLinesTouchingValues(poisoned).length,
  };
  t.diagnostic(
    `정상 경로: ②인자실은호출=${real.withArg} ③values동거줄=${real.valuesLines} / ` +
      `오염 샘플: ②인자실은호출=${bad.withArg} ③values동거줄=${bad.valuesLines}`,
  );
  assert.deepEqual(real, { withArg: false, valuesLines: 0 }, "정상 경로는 통과해야 한다");
  assert.deepEqual(bad, { withArg: true, valuesLines: 1 }, "오염 샘플은 두 검사 모두에 걸려야 한다");

  // ⭐ 이 게이트가 왜 필요한가 — **기존 금지 토큰 스캔은 이 오염을 하나도 잡지 못한다.**
  const literalCaught = NETWORK_AND_PERMISSION_TOKENS.filter(
    (token) => poisoned.includes(token) !== componentCode.includes(token),
  );
  t.diagnostic(`같은 오염에 대한 기존 G50 리터럴 스캔 검출: ${literalCaught.length}건`);
  assert.deepEqual(
    literalCaught,
    [],
    "기존 토큰 스캔이 이 오염을 잡는다면 G138 게이트는 불필요하다는 뜻이다",
  );
});

// ── G138 반대편 — **서버 요청 타입에 입력값을 담을 필드가 존재하지 않는다**(AC-080 (a)) ────────
//
// 위 블록이 *"값이 컴포넌트 밖으로 나가지 않는다"* 를 고정한다면, 이 블록은 *"설령 나가더라도
// 실어 보낼 자리가 없다"* 를 고정한다 — **구조적 금지**가 이 저장소의 AC-045 방어 형태다
// (`mockScreens/types.ts` 머리말 원문: *"인자는 세션 id·랜딩 id·고정 enum 3개뿐"*).
// 두 방어는 합집합이지 교체가 아니다.

/** `export type X = { ... }` 본문의 필드 키 집합. */
function requestFieldKeys(source: string, typeName: string): string[] {
  const match = new RegExp(`export type ${typeName} = \\{([^}]*)\\}`).exec(source);
  assert.ok(match, `${typeName} 선언을 찾지 못했다 — 타입이 옮겨졌으면 이 게이트를 따라가야 한다`);
  return [...match[1].matchAll(/^\s*(\w+)\??\s*:/gm)].map((m) => m[1]).sort();
}

const inCallSmsTypes = readFileSync("functions/src/inCallSms/types.ts", "utf8");
const mockScreenTypes = readFileSync("functions/src/mockScreens/types.ts", "utf8");

test("[G138/AC-080 (a)] 기록 콜러블 2종의 요청 타입에 **입력값을 담을 필드가 없다**", (t) => {
  const sms = requestFieldKeys(inCallSmsTypes, "RecordInCallSmsEventRequest");
  const mock = requestFieldKeys(mockScreenTypes, "RecordMockScreenEventRequest");
  t.diagnostic(`요청 필드 — recordInCallSmsEvent: ${sms.join(",")} / recordMockScreenEvent: ${mock.join(",")}`);
  assert.deepEqual(sms, ["event", "sessionId", "smsId"], "세션 id·문자 id·고정 enum 3개뿐이어야 한다");
  // T194-c-1(docs/Architecture.md §84.5.3 · §84.15.3 · G584) — `callMode`(통화 경로 고정 enum 2값 "realtime" · "fallback")가 더해졌다.
  // 참가자 입력값이 아니라 화면 상태(통화 경로)라 AC-045 "입력값 서버 미전송"은 그대로다 — 아래에서 enum 리터럴 타입임을 함께 고정한다.
  assert.deepEqual(mock, ["callMode", "event", "landingId", "sessionId"], "세션 id·랜딩 id·고정 enum 2개(event · callMode)뿐이어야 한다");
  assert.match(mockScreenTypes, /callMode\?: "realtime" \| "fallback";/, "callMode는 고정 enum 리터럴이어야 한다(자유 문자열 0)");
});

test("[G138/역검증] 요청 타입에 입력값 필드가 하나라도 붙으면 위 단언이 실제로 실패한다", (t) => {
  // 오염은 **테스트 코드 안에서만**(callContinuity.test.ts:161-162 관례).
  const poisoned = inCallSmsTypes.replace(
    "  event: InCallSmsEvent;",
    "  event: InCallSmsEvent;\n  accountNumber: string;",
  );
  assert.notEqual(poisoned, inCallSmsTypes, "오염 샘플이 실제로 만들어져야 한다");
  const badKeys = requestFieldKeys(poisoned, "RecordInCallSmsEventRequest");
  t.diagnostic(`오염 샘플의 요청 필드: ${badKeys.join(",")}`);
  assert.notDeepEqual(badKeys, ["event", "sessionId", "smsId"], "오염이 검출되지 않으면 게이트가 무의미하다");
  assert.ok(badKeys.includes("accountNumber"));
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
  // T190-2(docs/Architecture.md §74.9 · §74.13 G76 행) — 가짜 주소창 호스트. 미등록이면 위 파서의 미등록 필드
  // 단언이 실패한다(트립와이어).
  "mockHost",
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
// 결정 불가). **속성 스프레드가 인라인 객체 리터럴이 아니라 참조일 때도 속성 축이 닿지 않는다**
// (QA-14 — 참조 추적은 S3/G95가 금지한 확장이라 넓히지 않았다).
// 전체 한계와 그 근거는 `src/lib/sourcescan/scanSource.ts` 머리말과
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
// ⭐ T187(PRD v1.18 AC-086 · M-13 · T187 · docs/Architecture.md §72.8 · UX D-84) — **반전**. 앵커 3종 중
// ①표식·③난이도 배지는 세션 중에서 빠지고 ②"훈련 종료"만 남는다(D-84). 그래서 이 테스트는 이제
// "배지를 다시 그리지 않는다"를 고정한다. DIFFICULTY_LABEL 부재 단언(사전 이중화 금지)은 그대로 유지.
/** 오버레이 코드에 남은 세션 중 난이도 배지 흔적. 반전 단언과 역검증이 같이 쓴다. */
function difficultyBadgeTraces(code: string): string[] {
  const traces: string[] = [];
  if (/difficultyLabel/.test(code)) traces.push("difficultyLabel");
  if (/난이도 \{/.test(code)) traces.push("난이도 {");
  if (/DIFFICULTY_LABEL/.test(code)) traces.push("DIFFICULTY_LABEL");
  return traces;
}

test("[T84 → T187] 모의 화면 오버레이 헤더가 난이도 배지를 **그리지 않는다**(연속성 앵커 = '훈련 종료' 1종, UX D-84)", () => {
  assert.deepEqual(
    difficultyBadgeTraces(componentCode),
    [],
    "세션 중 난이도 배지가 되살아났다(M-13 · AC-086) — 연속성 앵커는 '훈련 종료' 하나다(D-84).",
  );
  // ⚠️ 컴포넌트가 난이도 사전을 갖게 되면 표기 정본이 두 곳으로 갈라진다(기존 단언 유지 — 주석 포함 원문).
  assert.ok(!/DIFFICULTY_LABEL/.test(component), "컴포넌트가 난이도 사전을 import하면 안 된다.");
});

test("[T84 → T187 역검증] 배지를 되살린 사본은 반전 단언에 걸린다", () => {
  // 사용자 결정(2026-10-18) — 옛 오염 앵커(`<EndTrainingButton …/>`)가 사라져 같은 헤더의 주소창 호스트로 옮겼다.
  const anchor = "{landingHostFor(landingKind, landingId)}";
  const poisoned = componentCode.replace(anchor, `${anchor}\n<span>난이도 {difficultyLabel}</span>`);
  assert.notEqual(poisoned, componentCode, "오염 지점을 찾지 못했다 — 역검증이 공회전한다");
  assert.deepEqual(difficultyBadgeTraces(poisoned), ["difficultyLabel", "난이도 {"]);
});

// ── T190-2 — G453(클라 쪽) · 가짜 주소창 호스트 (docs/Architecture.md §74.9 · §74.14 G453 · PRD AC-094 (b)(g)) ──
//
// 서버 카탈로그의 8개 호스트는 `functions/src/scenarios/__tests__/mockAddress.test.ts`가 보고, 위 G76이 그 글자가
// 컴포넌트에 그대로 있음을 묶는다. 여기서는 **컴포넌트에만 있는 호스트**(범용 폴백 `GENERIC_CREDENTIAL_COPY` ·
// 설치 화면 `INSTALL_MOCK_HOST`)까지 포함해 컴포넌트 소스의 호스트 **전부**에 같은 규칙을 건다(두 패키지라
// 함수를 import로 공유할 수 없어 같은 정규식을 둔다).
const MOCK_HOST_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)*\.invalid$/;

function clientHostViolations(host: string): string[] {
  const out: string[] = [];
  if (!MOCK_HOST_PATTERN.test(host)) out.push(`호스트 형식(.invalid 끝): ${host}`);
  if (/https?:\/\//i.test(host) || /\bwww\./i.test(host) || /href/i.test(host)) out.push(`금지 표기: ${host}`);
  if (/\d{4,}/.test(host)) out.push(`연속 숫자 4자리 이상: ${host}`);
  return out;
}

function componentHosts(code: string): string[] {
  return [
    ...[...code.matchAll(/mockHost:\s*"([^"]*)"/g)].map((m) => m[1]),
    ...[...code.matchAll(/INSTALL_MOCK_HOST\s*=\s*"([^"]*)"/g)].map((m) => m[1]),
  ];
}

test("[T190/G453 클라] 컴포넌트의 가짜 호스트 전부(카탈로그 8 + 범용 폴백 1)가 .invalid 규칙을 지킨다", (t) => {
  const hosts = componentHosts(componentCode);
  t.diagnostic(`[G453 클라] 호스트 ${hosts.length}개: ${hosts.join(" · ")}`);
  assert.equal(hosts.length, 16, "카탈로그 credential 10 + 설치 5(T194-a parcel-install · T194-c-1 Q2 3종 · §92.3 credential 2 · §95 보관 지갑 1) + 범용 폴백 1");
  assert.deepEqual(hosts.flatMap(clientHostViolations), []);
  // 범용 폴백 호스트는 카탈로그 호스트와 겹치지 않는다(겹치면 미스가 다른 사이트처럼 보인다).
  assert.equal(new Set(hosts).size, hosts.length);
  // 주소창은 호스트만 그린다 — 링크 표시 텍스트(`title`)를 주소창에 다시 그리지 않는다(AC-094 (a)).
  assert.ok(componentCode.includes("{landingHostFor(landingKind, landingId)}"), "주소창이 가짜 호스트를 그려야 한다");
});

test("[T190/G453 클라 역검증] .com 호스트를 넣은 사본 · https:// 접두 사본은 같은 함수에 걸린다", () => {
  const poisoned = componentCode.replace('mockHost: "id-verify-center.invalid"', 'mockHost: "id-verify-center.com"');
  assert.notEqual(poisoned, componentCode, "오염 지점(범용 폴백 호스트)을 찾지 못했다");
  assert.ok(componentHosts(poisoned).flatMap(clientHostViolations).length >= 1);
  const schemed = componentCode.replace(
    'INSTALL_MOCK_HOST = "support-app-center.invalid"',
    'INSTALL_MOCK_HOST = "https://support-app-center.invalid"',
  );
  assert.notEqual(schemed, componentCode, "오염 지점(설치 호스트)을 찾지 못했다");
  assert.ok(componentHosts(schemed).flatMap(clientHostViolations).length >= 1);
});

// ── T190-5 — D-93 숫자 자판 힌트(UX-023 v1.33 (4) · docs/Architecture.md §74.8) ─────────────────────────────
// 클라 전용 표현 힌트(`placeholder`와 같은 층)라 서버 카탈로그 드리프트 대조 밖이다. 계좌번호·금액 칸에만 필드별로 명시한다.
const NUMERIC_FIELD_LABELS = [
  "계좌번호",
  "안전계좌 번호",
  "이체 금액",
  "이관 전용 계좌번호",
  "이관 금액",
  "보호계좌 번호",
  "옮길 금액",
  // §92.3 — 자산 보관 신청서의 금액 칸.
  "보관 신청 금액",
  // §95 — 검찰 보관 지갑 송금 화면의 금액 칸(지갑 번호 칸은 영문이 섞여 numeric이 아니다).
  "전송 금액",
];

test("[T190/D-93] 계좌번호·금액 칸에만 inputMode numeric — 검증(maxLength·pattern) 0 · type=text 유지", () => {
  const numeric = [...componentCode.matchAll(/\{ label: "([^"]+)", placeholder: "[^"]*", inputMode: "numeric" \}/g)].map((m) => m[1]);
  assert.deepEqual(numeric.sort(), [...NUMERIC_FIELD_LABELS].sort());
  assert.ok(componentCode.includes("inputMode={field.inputMode}"), "입력 요소가 필드별 힌트를 받아야 한다");
  for (const forbidden of ["maxLength", "pattern=", 'type="number"']) {
    assert.equal(componentCode.includes(forbidden), false, `입력 검증·숫자 타입 금지(D-93): ${forbidden}`);
  }
});

test("[T190/D-93] 완료 복귀 문면은 진입 표면이 정한다 — 메신저 '채팅으로' · 문자함 '문자로'", () => {
  assert.ok(componentCode.includes('messenger: "채팅으로 돌아가기"'));
  assert.ok(componentCode.includes('"in-call-sms": "문자로 돌아가기"'));
  assert.equal((componentCode.match(/^\s*\{returnLabel\}\s*$/gm) ?? []).length, 2, "두 kind의 완료 버튼이 모두 진입 표면 문면을 쓴다");
});

// ── T194-a(docs/Architecture.md §84.13.3 ③) — 설치 화면 상황별 표 `INSTALL_LANDING_COPY` ─────────────────────────────

test("[T194-a §84.13.3 ③ ⓐ] 설치 문구 표의 키 집합 = 서버 카탈로그 app-install landingId 집합(양방향) · 값 리터럴은 G76 · 렌더 게이트가 대조", () => {
  const start = componentCode.indexOf("const INSTALL_LANDING_COPY");
  assert.ok(start > 0, "설치 문구 표가 있어야 한다");
  const body = componentCode.slice(start, componentCode.indexOf("\n};", start));
  const keys = [...body.matchAll(/^ {2}"([a-z0-9-]+)": \{/gm)].map((m) => m[1]).sort();
  const installIds = catalogItems
    .filter((item) => (item.fields.get("kind") ?? [])[0] === "app-install")
    .map((item) => item.landingId)
    .sort();
  assert.deepEqual(keys, installIds, "표에만 있거나 카탈로그에만 있는 설치 항목이 있다");
  // T194-c-1(§84.15.4) — Q2 통화 중 설치 화면 3종이 더해졌다.
  assert.deepEqual(installIds, ["card-delivery-app-install", "card-guard-app-install", "loan-check-app-install", "parcel-install", "subsidy-install"]);
});

test("[T194-a §84.13.3 ③ ⓑ] 표에 없는 id의 app-install은 설치 화면을 그리지 않는다 — 기본 문구 폴백 0(소스 구조) · 역방향", (t) => {
  // 조회는 정확 일치 · 미스 = undefined(폴백 식 없음).
  assert.match(componentCode, /function installCopyFor\(landingId\?: string\): InstallCopy \| undefined \{\s*return landingId \? INSTALL_LANDING_COPY\[landingId\] : undefined;\s*\}/);
  // 상위 컴포넌트 · 서브 컴포넌트 둘 다 미스에서 null.
  assert.ok(componentCode.includes('if (landingKind === "app-install" && installCopyFor(landingId) === undefined) return null;'));
  assert.ok(componentCode.includes("if (!installCopy) return null;"));
  // 역방향 — 지원금 문구 기본값으로 떨어지는 사본(옛 형태)은 위 단언에 걸린다.
  const fallback = componentCode.replace(
    "return landingId ? INSTALL_LANDING_COPY[landingId] : undefined;",
    "return (landingId ? INSTALL_LANDING_COPY[landingId] : undefined) ?? INSTALL_LANDING_COPY[\"subsidy-install\"];",
  );
  const caught = !/return landingId \? INSTALL_LANDING_COPY\[landingId\] : undefined;\s*\}/.test(fallback);
  t.diagnostic(`[③ ⓑ 역방향] 기본 문구 폴백 사본 → 검출 ${caught}`);
  assert.notEqual(fallback, componentCode);
  assert.equal(caught, true);
});
