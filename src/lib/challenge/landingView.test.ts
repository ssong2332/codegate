// node:test 단위 테스트 (T181 C5 · docs/Architecture.md §69.8 W-1T · §69.15.2 · docs/UX.md v1.27 D-75).
// UX-021 동의 랜딩의 화면 판정 진리표(status 7 × expired 2 = 14칸) + Error (c) 정본 문구 + 페이지 배선.
// 실행: `npm test` (package.json 참고) — node --experimental-strip-types로 컴파일 없이 직접 실행한다.
//
// ⭐ 필수인 이유(§69.15.2 (4)): 이 변경 전 랜딩 문구를 고정한 테스트가 0건이었고, "완료가 만료보다
// 우선하는 것은 completed에만"이라는 틀리기 쉬운 경계가 있다 — 신고·폐기까지 끌어오면 동의 전에 신고된
// 챌린지(훈련이 시작된 적도 없다)가 "끝난 훈련"으로 보인다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMPLETED_LANDING_BODY,
  COMPLETED_LANDING_TITLE,
  resolveChallengeLandingView,
} from "./landingView.ts";
import type { ChallengeLandingView } from "./landingView.ts";

type Cell = readonly [row: string, status: string, expired: boolean, expected: ChallengeLandingView];

/**
 * §69.15.2 (1) 방출표의 행 기호(a~j) 그대로. 7개 상태(functions/src/shared/types.ts ChallengeStatus) ×
 * 링크 만료 2값 = 14칸. ⛔ 칸을 지우거나 합치지 말 것 — "completed에만 우선"의 경계가 이 표다.
 */
const TRUTH_TABLE: readonly Cell[] = [
  ["a", "pending", false, "consent"],
  ["b", "pending", true, "expired"], // AC-048 — 최초 진입 창(3일)이 지난 링크. 의도된 정책이다.
  ["c", "consented", false, "consent"],
  ["c", "in_progress", false, "consent"],
  // ⚠️ 현행 동작 고정 — T184에서 변경 예정(링크 만료 후에도 보존기간 안 재개 허용). 아래 d행 2칸은
  //    결함 동작(T184 · 서버 consentGate.ts는 보존기간 30일 안 재개를 허용한다)을 그대로 고정한 것이다.
  //    T181은 이 동작을 바꾸지 않는다(범위 밖) — 이 단언을 의도된 정책으로 읽지 말 것.
  ["d", "consented", true, "expired"],
  ["d", "in_progress", true, "expired"],
  ["e", "completed", false, "completed"], // ⭐ T181 신규 — UX-021 Error (c)
  ["f", "completed", true, "completed"], // ⭐ T181 신규 — 완료가 만료보다 우선(이 행에만)
  ["g", "reported", false, "unavailable"],
  ["h", "reported", true, "expired"],
  ["i", "deleted", false, "unavailable"],
  ["j", "deleted", true, "expired"],
  ["—", "expired", true, "expired"], // 상태값 expired — 서버가 쓰지 않지만 타입에 있다(오늘과 같다)
  ["—", "expired", false, "unavailable"],
];

/** T181 전 join/page.tsx 판정의 사본(대조용 오라클 — 이 파일 밖에서 쓰지 않는다). */
function preT181View(status: string, expired: boolean): ChallengeLandingView {
  const resumable = status === "pending" || status === "consented" || status === "in_progress";
  if (expired || !resumable) return expired ? "expired" : "unavailable";
  return "consent";
}

test("[T181 W-1T] 랜딩 판정 14칸 진리표(status 7 × expired 2) — completed만 expired와 무관하게 완료 화면", () => {
  const statuses = new Set(TRUTH_TABLE.map(([, status]) => status));
  assert.equal(TRUTH_TABLE.length, 14, "진리표는 정확히 14칸이어야 한다");
  assert.equal(statuses.size, 7, "7개 상태를 전부 덮어야 한다");
  for (const status of statuses) {
    const expiredValues = TRUTH_TABLE.filter(([, s]) => s === status).map(([, , expired]) => expired);
    assert.deepEqual([...expiredValues].sort(), [false, true], `status=${status}: expired 두 값을 모두 덮어야 한다`);
  }
  for (const [row, status, expired, expected] of TRUTH_TABLE) {
    assert.equal(
      resolveChallengeLandingView({ status, expired }),
      expected,
      `행 ${row}: status=${status} · expired=${expired}`,
    );
  }
});

test("[T181 W-1T] 바뀌는 칸은 e · f(completed) 둘뿐이고 나머지 12칸은 T181 전 판정과 같다", (t) => {
  const changed = TRUTH_TABLE.filter(
    ([, status, expired]) => resolveChallengeLandingView({ status, expired }) !== preT181View(status, expired),
  ).map(([row, status, expired]) => `${row}:${status}/${expired}`);
  t.diagnostic(`T181 전과 달라진 칸: ${changed.join(", ")}`);
  assert.deepEqual(changed, ["e:completed/false", "f:completed/true"]);
});

test("[T181 W-1T · G428] 서버가 실제로 쓰는 완료 리터럴(소스에서 읽음)이 랜딩에서 완료 화면으로 간다", () => {
  const source = readFileSync("functions/src/shared/challengeCompletion.ts", "utf8");
  const match = /^export const CHALLENGE_STATUS_ON_EXPERIENCE_END = "([^"]+)"/m.exec(source);
  assert.ok(match, "서버 전이 리터럴을 찾지 못했다 — 서버→랜딩 연결 증거를 낼 수 없다");
  for (const expired of [false, true]) {
    assert.equal(resolveChallengeLandingView({ status: match[1], expired }), "completed", `expired=${expired}`);
  }
});

test("[T181 W-1T] Error (c) 제목 · 본문 3문장 상수 = docs/UX.md v1.27 UX-021 노트 (1) 정본(글자 단위)", () => {
  assert.equal(COMPLETED_LANDING_TITLE, "이미 끝난 훈련입니다");
  assert.deepEqual(
    [...COMPLETED_LANDING_BODY],
    [
      "한 번 끝난 훈련은 다시 시작되지 않습니다.",
      "잘못된 것은 없으니 안심하셔도 됩니다.",
      "이 링크로 더 하실 일은 없습니다. 이 화면은 닫으셔도 됩니다.",
    ],
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 페이지 배선(소스 스캔) — 이 저장소에는 페이지 렌더 러너가 없다(callContinuity.test.ts 등과 같은 관례).
// 판정이 위 순수 함수 1곳에서만 나오고, Error (c) 화면이 경고 표현 · 버튼 0이라는 것을 텍스트로 고정한다.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_PATH = "src/app/challenge/join/page.tsx";

/** 주석 제거 — 설명 주석에 금지 토큰(role="alert" 등)이 적혀 있어도 코드로 세지 않는다. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const pageCode = codeOnly(readFileSync(PAGE_PATH, "utf8"));

test("[T181 C5 배선] 랜딩 판정은 resolveChallengeLandingView 1곳 — 페이지에 status 직접 비교가 없고, 완료 분기가 차단 문구보다 앞이다", () => {
  assert.match(
    pageCode,
    /import \{\s*COMPLETED_LANDING_BODY,\s*COMPLETED_LANDING_TITLE,\s*resolveChallengeLandingView,\s*\} from "@\/lib\/challenge";/,
    "판정 함수 · 정본 문구를 @/lib/challenge(landingView.ts)에서 가져와야 한다",
  );
  const barrel = readFileSync("src/lib/challenge/index.ts", "utf8");
  assert.match(barrel, /resolveChallengeLandingView,\s*\} from "\.\/landingView";/, "배럴이 landingView.ts를 다시 내보내야 한다");

  assert.doesNotMatch(pageCode, /\.status\s*===/, "페이지가 status를 직접 비교한다 — 판정이 두 곳으로 갈라진다");
  const loadAt = pageCode.indexOf("const loadLanding = async");
  const viewAt = pageCode.indexOf("resolveChallengeLandingView(result)", loadAt);
  const completedAt = pageCode.indexOf('setState("completed")', loadAt);
  const blockedAt = pageCode.indexOf("setBlockedMessage(", loadAt);
  assert.ok(loadAt >= 0 && viewAt > loadAt, "loadLanding이 resolveChallengeLandingView(result)를 부르지 않는다");
  assert.ok(completedAt > viewAt && completedAt < blockedAt, "완료 분기가 차단 문구 설정보다 앞이어야 한다");
  // 다른 상태의 문구는 T181 전과 같다(UX v1.27 노트 (3)) — 각 1회.
  for (const message of ["이 링크는 만료되었습니다.", "이 챌린지는 더 이상 이용할 수 없습니다."]) {
    assert.equal(pageCode.split(`"${message}"`).length - 1, 1, `기존 차단 문구 "${message}"가 바뀌었다`);
  }
});

test("[T181 C5 화면] Error (c) 렌더 분기 — 체크 표식(장식) · 제목 포커스 대상 · 정본 문구, 경고 표현 · 버튼 · 표시 이름 0", () => {
  const start = pageCode.indexOf('if (state === "completed") {');
  const end = pageCode.indexOf('if (state === "load-error") {', start);
  assert.ok(start >= 0 && end > start, "Error (c) 렌더 분기를 찾지 못했다");
  const block = pageCode.slice(start, end);

  assert.match(block, /<h1\s+ref=\{completedHeadingRef\}\s+tabIndex=\{-1\}/, "제목이 포커스 대상(ref + tabIndex=-1)이어야 한다");
  assert.match(block, /\{COMPLETED_LANDING_TITLE\}\s*<\/h1>/, "제목은 정본 상수여야 한다");
  assert.ok(block.includes("COMPLETED_LANDING_BODY.map("), "본문은 정본 상수 3문장이어야 한다");
  assert.ok(block.includes('aria-hidden="true"'), "체크 표식은 장식(aria-hidden)이어야 한다");
  for (const forbidden of [
    'role="alert"',
    "⚠",
    "#C6392F",
    "<button",
    "<Button",
    "<Banner",
    "onClick",
    "href=",
    "displayName",
    "DIFFICULTY_LABEL",
  ]) {
    assert.ok(!block.includes(forbidden), `Error (c) 화면에 \`${forbidden}\`가 있다 — UX v1.27 노트 (1)(2) 위반`);
  }
  assert.match(
    pageCode,
    /if \(state === "completed"\) completedHeadingRef\.current\?\.focus\(\);/,
    "Error (c) 진입 시 제목 포커스가 빠졌다(UX v1.27 노트 (8))",
  );
});
