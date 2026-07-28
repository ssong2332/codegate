import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import {
  RECOVERABLE_PATHS,
  TRAINING_PATHS,
  isUnauthenticatedCallableError,
  resolveAuthInvalidationMode,
  type AuthInvalidationInput,
} from "./authInvalidation.ts";
import { AUTH_INVALIDATION_COPY } from "./copy.ts";
import {
  areCallablesBlocked,
  notifyUnauthenticatedCallable,
  resetUnauthenticatedSignalForTest,
  setCallablesBlocked,
  subscribeUnauthenticatedCallable,
} from "./unauthenticatedSignal.ts";

// T128 — 인증 무효화 취급(Architecture.md §34).
//
// ⛔ **이 테스트가 증명하지 않는 것부터 적는다**: 토큰 무효화를 막는 것이 아니다(§34.10 (a)).
//    무효화는 Firebase SDK가 이미 감지해 스스로 signOut한다. 여기서 고정하는 것은 **그때 참가자가
//    무엇을 보는가**와, 그보다 훨씬 중요한 **정상 사용자에게는 아무 일도 일어나지 않는다**는 쪽이다.
// ⭐ **역검증이 완료 조건이다**(§34.6 · §34.8 ①): 이 저장소는 오탐이 나면 장치를 삭제당한다(§24.4).
//    여기서 오탐 = **정상 사용자에게 배너가 뜨는 것**이라, 아래 R-* 케이스가 그 반대편을 못 박는다.

const HEALTHY: AuthInvalidationInput = {
  pathname: "/session/play",
  signedOut: false,
  hadUser: true,
  unauthenticatedCallable: false,
  wasAnonymous: false,
};

// 이 앱의 **전 라우트**(`src/app/**/page.tsx`에서 뽑은 실재 경로). 역검증을 "대충 몇 개"가 아니라
// 전 구간으로 돌리기 위해 전수로 둔다 — 아래 R-0이 파일시스템과 이 목록의 일치를 강제한다.
const ALL_ROUTES = [
  "/",
  "/challenge/create",
  "/challenge/join",
  "/challenge/results",
  "/clone/wait",
  "/grade",
  "/history",
  "/login",
  "/onboarding/age-gate",
  "/onboarding/consent",
  "/onboarding/record",
  "/report",
  "/report/archive",
  "/report/replay",
  "/report/rewind",
  "/scenarios",
  "/scenarios/difficulty",
  "/scenarios/experience-select",
  "/scenarios/messenger",
  "/scenarios/messenger/voice-select",
  "/scenarios/voice",
  "/scenarios/voice/clone",
  "/scenarios/voice/generic",
  "/session/chat",
  "/session/end",
  "/session/messenger",
  "/session/play",
];
const NORMAL_SESSION_PATHS = ALL_ROUTES;

// ───────────────────────────── ① 역검증 (정상 상태 = 배너 0회) ─────────────────────────────

test("[T128/R-0] 역검증 대상 경로 목록은 실제 라우트 전수와 일치해야 한다", () => {
  // 라우트가 새로 생겼는데 이 목록이 그대로면, "전 구간 배너 0회"라는 역검증이 **조용히 부분
  // 검증으로 줄어든다**. 라우트를 추가·삭제했다면 ALL_ROUTES에도 반영하라(그것으로 끝이다 —
  // §34.4 표 7행에 따라 새 경로는 전부 "현행 유지"로 판정된다).
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name === "page.tsx" ? [dir] : [],
    );
  const actual = walk("src/app")
    .map((d) => d.replace(/^src\/app/, "").replace(/\/\([^)]+\)/g, "") || "/")
    .sort();
  assert.deepEqual(actual, [...ALL_ROUTES].sort());
});

test("[T128/R-1] 역검증 — 정상 세션 전 구간에서 배너 발화 0회", () => {
  let fired = 0;
  for (const pathname of NORMAL_SESSION_PATHS) {
    const mode = resolveAuthInvalidationMode({ ...HEALTHY, pathname });
    if (mode !== "none") fired += 1;
  }
  assert.equal(
    fired,
    0,
    `정상 상태에서 배너가 ${fired}회 발화했다. 오탐은 이 장치를 삭제시킨다(§24.4/§34.6).`,
  );
  console.log(`[T128/R-1] 정상 상태 경로 ${NORMAL_SESSION_PATHS.length}곳 → 배너 발화 ${fired}회`);
});

test("[T128/R-2] 역검증 — 익명 사용자도 정상 상태면 전 구간 배너 0회", () => {
  let fired = 0;
  for (const pathname of NORMAL_SESSION_PATHS) {
    const mode = resolveAuthInvalidationMode({ ...HEALTHY, pathname, wasAnonymous: true });
    if (mode !== "none") fired += 1;
  }
  assert.equal(fired, 0);
  console.log(`[T128/R-2] 익명 정상 상태 경로 ${NORMAL_SESSION_PATHS.length}곳 → 배너 발화 ${fired}회`);
});

test("[T128/R-3] 역검증 — 처음부터 비로그인인 채 훈련 URL을 직접 연 사람은 배너가 아니라 현행 리다이렉트다", () => {
  // hadUser=false = 이 마운트에서 로그인 상태를 **한 번도 본 적이 없다**. 이건 무효화가 아니라
  // 평범한 미인증이고, 여기에 배너를 띄우면 AC-027이 막아야 할 사람을 화면에 붙잡아 두게 된다.
  for (const pathname of [...TRAINING_PATHS, ...RECOVERABLE_PATHS]) {
    assert.equal(
      resolveAuthInvalidationMode({
        ...HEALTHY,
        pathname,
        signedOut: true,
        hadUser: false,
      }),
      "none",
      `${pathname}: 미인증 직접 진입까지 배너로 잡으면 오탐이다.`,
    );
  }
});

test("[T128/R-4] 역검증 — 사용자가 스스로 로그아웃한 뒤 훈련 밖 경로에 있으면 현행 리다이렉트", () => {
  for (const pathname of ["/", "/scenarios", "/onboarding/consent", "/challenge/create"]) {
    assert.equal(
      resolveAuthInvalidationMode({ ...HEALTHY, pathname, signedOut: true }),
      "none",
      `${pathname}: §34.4 표 1행 — 훈련 밖은 코드 변경 0줄, 현행 그대로다.`,
    );
  }
});

// ───────────────────────────── ② 감지 (§34.4 표 그대로) ─────────────────────────────

test("[T128/D-1] §34.4 2행 — 훈련 중 계정형이 signOut되면 리다이렉트가 아니라 재인증 배너", () => {
  for (const pathname of TRAINING_PATHS) {
    assert.equal(
      resolveAuthInvalidationMode({ ...HEALTHY, pathname, signedOut: true }),
      "banner-reauth",
      pathname,
    );
  }
});

test("[T128/D-2] §34.4 3행 — user는 살아 있는데 콜러블이 unauthenticated면 같은 배너", () => {
  for (const pathname of TRAINING_PATHS) {
    assert.equal(
      resolveAuthInvalidationMode({ ...HEALTHY, pathname, unauthenticatedCallable: true }),
      "banner-reauth",
      pathname,
    );
  }
});

test("[T128/D-3] §34.4 4·6행 — 익명(사용자2)은 재로그인이 아니라 종료 안내", () => {
  for (const pathname of [...TRAINING_PATHS, ...RECOVERABLE_PATHS]) {
    assert.equal(
      resolveAuthInvalidationMode({ ...HEALTHY, pathname, signedOut: true, wasAnonymous: true }),
      "banner-anonymous",
      pathname,
    );
    assert.equal(
      resolveAuthInvalidationMode({
        ...HEALTHY,
        pathname,
        unauthenticatedCallable: true,
        wasAnonymous: true,
      }),
      "banner-anonymous",
      pathname,
    );
  }
});

test("[T128/D-4] §34.4 5행 — 리포트·되감기 중 계정형은 트리 유지 + 재인증 배너", () => {
  for (const pathname of RECOVERABLE_PATHS) {
    assert.equal(
      resolveAuthInvalidationMode({ ...HEALTHY, pathname, signedOut: true }),
      "banner-reauth",
      pathname,
    );
  }
});

test("[T128/D-5] §34.4 7행 — 표에 없는 경로는 무슨 일이 있어도 현행 유지(표를 넓히지 않는다, G152)", () => {
  for (const pathname of ["/", "/scenarios", "/onboarding/record", "/challenge/join", "/login", "/history"]) {
    assert.equal(
      resolveAuthInvalidationMode({
        ...HEALTHY,
        pathname,
        signedOut: true,
        unauthenticatedCallable: true,
      }),
      "none",
      pathname,
    );
  }
});

// ───────────────────────────── ③ G156 — 판정 소스 1개로 한정 ─────────────────────────────

test("[T128/G156] `functions/unauthenticated` 코드 **하나만** 인증 문제로 본다", () => {
  assert.equal(isUnauthenticatedCallableError({ code: "functions/unauthenticated" }), true);

  // ⛔ 아래를 하나라도 true로 넓히면 네트워크 실패·권한 규칙 위반이 배너로 새고, 그 오탐이
  //    §24.4와 같은 형태로 이 장치를 삭제시킨다.
  const mustBeFalse = [
    { code: "functions/internal" },
    { code: "functions/unavailable" },
    { code: "functions/deadline-exceeded" },
    { code: "functions/permission-denied" },
    { code: "functions/not-found" },
    { code: "functions/failed-precondition" },
    { code: "unauthenticated" },
    { code: "auth/invalid-refresh-token" },
    { code: "auth-invalidation/blocked" },
    { code: "permission-denied" },
    new Error("unauthenticated"),
    "functions/unauthenticated",
    null,
    undefined,
  ];
  for (const err of mustBeFalse) {
    assert.equal(
      isUnauthenticatedCallableError(err),
      false,
      `판정 소스를 넓히면 안 된다: ${JSON.stringify(err)}`,
    );
  }
});

// ───────────────────────────── ④ 신호선 · U1 잠금 ─────────────────────────────

test("[T128/U1-1] 콜러블 잠금은 기본 해제 상태이고, 배너가 떠 있을 때만 걸린다", () => {
  resetUnauthenticatedSignalForTest();
  assert.equal(areCallablesBlocked(), false, "기본값이 잠금이면 정상 사용자의 모든 호출이 죽는다.");
  setCallablesBlocked(true);
  assert.equal(areCallablesBlocked(), true);
  setCallablesBlocked(false);
  assert.equal(areCallablesBlocked(), false);
  resetUnauthenticatedSignalForTest();
});

test("[T128/U1-2] 신호는 구독자에게만 전달되고 구독 해제 후에는 전달되지 않는다(유령 배너 방지)", () => {
  resetUnauthenticatedSignalForTest();
  let hits = 0;
  const unsubscribe = subscribeUnauthenticatedCallable(() => {
    hits += 1;
  });
  notifyUnauthenticatedCallable();
  assert.equal(hits, 1);
  unsubscribe();
  notifyUnauthenticatedCallable();
  assert.equal(hits, 1, "구독 해제 후에도 발화하면 언마운트된 화면의 배너가 되살아난다.");
  resetUnauthenticatedSignalForTest();
});

// ───────────────────────────── ⑤ 소스 게이트 (G151~G158 회귀 차단) ─────────────────────────────
//
// ⚠️ 아래는 **소스 문자열 검사**다. 이 저장소 루트에는 React 렌더 테스트 러너가 없어(package.json
//    `test` = `node --experimental-strip-types --test`), 컴포넌트 마운트 카운터를 돌릴 수 없다.
//    그래서 "언마운트되지 않는다"는 **구조를 고정하는 방식**으로 증명한다 — 실제 화면에서의
//    통화 지속(§34.4 U4)은 라이브 미검증이며 추정으로 남았다(§34.7 P-3 미실행).

const readSrc = (p: string) => readFileSync(p, "utf8");
const ROUTE_GUARD = "src/lib/auth/RouteGuard.tsx";
const HOOK = "src/lib/authinvalidation/useAuthInvalidation.ts";
const BANNER = "src/components/AuthInvalidationBanner.tsx";
const CALLABLE = "src/lib/api/callable.ts";

test("[T128/G151] 배너는 훈련 트리의 **형제 노드**여야 한다 — 상위 래퍼로 감싸면 언마운트를 재현한다", () => {
  const src = readSrc(ROUTE_GUARD);
  assert.match(
    src,
    /<>\s*<AuthInvalidationBanner[^>]*\/>\s*\{children\}\s*<\/>/,
    `${ROUTE_GUARD}: 배너와 {children}은 같은 프래그먼트의 형제여야 한다(G151).`,
  );
  // 감싸는 형태는 여는 태그(`/>`가 아닌 `>`)와 닫는 태그를 만든다 — 둘 다 없어야 형제다.
  assert.doesNotMatch(
    src,
    /<\/AuthInvalidationBanner>/,
    `${ROUTE_GUARD}: 배너가 {children}을 감싸면 안 된다(G151).`,
  );
});

test("[T128/G10] RouteGuard의 언마운트·리다이렉트는 배너 상태에서 반드시 보류돼야 한다", () => {
  const src = readSrc(ROUTE_GUARD);
  // 배너 상태를 고려하지 않는 옛 형태(`!user && !isPublicPath`만 보고 끊는 형태)가 남아 있으면 안 된다.
  const guards = src.match(/!user && !isPublicPath[^)\n]*/g) ?? [];
  assert.ok(guards.length >= 2, `${ROUTE_GUARD}: 가드 표현식을 찾지 못했다.`);
  for (const g of guards) {
    assert.ok(
      g.includes("!holdCurrentScreen"),
      `${ROUTE_GUARD}: "${g}" — 배너 보류 조건 없이 리다이렉트/언마운트하면 T128이 고치려던 결함 그대로다.`,
    );
  }
});

test("[T128/G154] 재인증은 signInWithPopup만 — signInWithRedirect는 페이지 이탈 = 세션 파괴다", () => {
  const src = readSrc(HOOK);
  assert.ok(src.includes("signInWithPopup"), `${HOOK}: 팝업 재인증이 없다.`);
  const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /signInWithRedirect/, `${HOOK}: signInWithRedirect 금지(G154).`);
});

test("[T128/G153] 무효화 처리 경로는 익명 사용자를 /login으로 보내지 않는다(AC-048)", () => {
  for (const p of [HOOK, BANNER]) {
    const code = readSrc(p)
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /"\/login"/, `${p}: /login은 Google 버튼뿐이라 사용자2에게 막다른 길이다.`);
  }
});

test("[T128/G155] `unauthenticated` 분기는 단일 지점 1곳 — 24개 래퍼에 흩어져 있으면 안 된다", () => {
  const dir = "src/lib/api";
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  const offenders = files.filter(
    (f) => f !== "callable.ts" && readSrc(`${dir}/${f}`).includes("httpsCallable"),
  );
  assert.deepEqual(offenders, [], `${dir}: 콜러블 호출은 callable.ts 한 곳을 거쳐야 한다(G155).`);

  const wrappers = files.filter((f) => !["index.ts", "types.ts", "callable.ts"].includes(f));
  assert.ok(wrappers.length >= 24, `래퍼가 ${wrappers.length}개뿐이다 — 스캔 대상이 줄었는지 확인하라.`);
  for (const f of wrappers) {
    assert.ok(
      readSrc(`${dir}/${f}`).includes("callCallable"),
      `${dir}/${f}: 단일 헬퍼를 거치지 않으면 이 래퍼의 무효화는 감지되지 않는다.`,
    );
  }
  console.log(`[T128/G155] 콜러블 래퍼 ${wrappers.length}개 전부 callable.ts 단일 지점을 경유`);
});

test("[T128/G156] callable.ts는 판정 함수를 거쳐서만 신호를 낸다(코드 문자열 직접 비교 금지)", () => {
  const code = readSrc(CALLABLE)
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(
    code,
    /if \(isUnauthenticatedCallableError\(err\)\) \{\s*notifyUnauthenticatedCallable\(\);/,
    `${CALLABLE}: 신호는 반드시 G156 판정 함수 뒤에서만 나가야 한다.`,
  );
  assert.doesNotMatch(
    code,
    /notifyUnauthenticatedCallable\(\);[\s\S]*notifyUnauthenticatedCallable\(\);/,
    `${CALLABLE}: 신호 발화 지점은 1곳이어야 한다.`,
  );
  assert.match(code, /throw err;/, `${CALLABLE}: 오류를 삼키면 호출부의 기존 실패 처리가 사라진다.`);
});

test("[T128/G157] 주기 폴링·워치독 타이머 0건 — 검출은 사건 기반 + 프리플라이트 1회뿐", () => {
  const code = readSrc(HOOK)
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  for (const banned of ["setInterval", "setTimeout", "requestAnimationFrame"]) {
    assert.ok(!code.includes(banned), `${HOOK}: ${banned} 금지(G157 — 속도·쿼터).`);
  }
});

test("[T128/G158] 배너 상태를 영속화하지 않는다 — 재인증 후 남는 유령 배너 방지", () => {
  const dir = "src/lib/authinvalidation";
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    if (f.endsWith(".test.ts")) continue;
    const code = readSrc(`${dir}/${f}`)
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const banned of ["sessionStorage", "localStorage", "document.cookie"]) {
      assert.ok(!code.includes(banned), `${dir}/${f}: ${banned} 금지(G158).`);
    }
  }
});

test("[T128/§34.3①] onIdTokenChanged 구독을 새로 만들지 않았다(검출력 증가 0)", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : /\.tsx?$/.test(e.name)
          ? [`${dir}/${e.name}`]
          : [],
    );
  // ⚠️ 이 테스트 파일 자신은 제외한다 — 금지 심볼을 **설명하는** 문자열이 스캔에 걸리는 함정이
  //    이 저장소에서 반복 발생했다. 제외 대상은 테스트 파일뿐이고 제품 코드는 전수 스캔한다.
  const offenders = walk("src").filter((f) => {
    if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) return false;
    const code = readSrc(f)
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    return code.includes("onIdTokenChanged");
  });
  assert.deepEqual(offenders, [], "onIdTokenChanged는 조용히 죽는 경로를 못 잡는다(§34.3 표 ①행).");
});

// ───────────────────────────── ⑥ 문구(OQ-A23 확정) ─────────────────────────────

test("[T128/OQ-A23] 익명 문구는 (1) 끝났음 (2) 진행분 없음 (3) 다시 시작 경로 셋을 모두 말한다", () => {
  const { message, action } = AUTH_INVALIDATION_COPY.anonymous;
  assert.ok(message.includes("끝납니다"), "끝났다는 사실을 그대로 알려야 한다.");
  assert.ok(message.includes("남지 않습니다"), "진행분이 남지 않는다는 것을 명시해야 한다.");
  assert.ok(message.includes("다시 시작"), "처음부터 다시 시작하는 경로를 줘야 한다.");
  assert.equal(action, "처음부터 다시 시작");

  // ⛔ 기각된 대안 2건이 문면으로 새어 들어오지 않았는지 — "리포트를 살려준다"·"이어진다"는
  //    익명 참가자에게 지킬 수 없는 약속이다(새 uid로는 기존 문서를 읽을 수 없다).
  for (const banned of ["이어집니다", "이어서", "리포트", "복구"]) {
    assert.ok(!message.includes(banned), `익명 문구에 "${banned}"가 들어가면 지킬 수 없는 약속이 된다.`);
  }
});

test("[T128/OQ-A23] 계정형 문구는 반대로 '이어진다'를 약속한다(복구 가능하기 때문)", () => {
  assert.ok(AUTH_INVALIDATION_COPY.reauth.message.includes("이어집니다"));
  assert.equal(AUTH_INVALIDATION_COPY.reauth.action, "다시 로그인");
});
