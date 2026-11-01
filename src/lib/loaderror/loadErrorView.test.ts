// UX-01(외부 보안 점검 2026-11-01) — 불러오기 실패 안내 구분 판정표 + 세 화면 배선.
// 실행: `npm test` (package.json 참고).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyLoadError,
  errorCodeOf,
  REPORT_FORBIDDEN_ACTION_HREF,
  REPORT_FORBIDDEN_MESSAGE,
} from "./loadErrorView.ts";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

test("판정표 — 콜러블(functions/ 접두어) · Firestore(접두어 없음) 코드 모두 같은 종류", () => {
  const cases: [unknown, string][] = [
    [{ code: "functions/permission-denied" }, "forbidden"],
    [{ code: "permission-denied" }, "forbidden"],
    [{ code: "functions/not-found" }, "invalid-link"],
    [{ code: "not-found" }, "invalid-link"],
    [{ code: "functions/invalid-argument" }, "invalid-link"],
    [{ code: "functions/unavailable" }, "retryable"],
    [{ code: "unavailable" }, "retryable"],
    [{ code: "functions/deadline-exceeded" }, "retryable"],
    [{ code: "functions/internal" }, "retryable"],
    [{ code: "functions/failed-precondition" }, "retryable"],
    [{ code: "functions/unauthenticated" }, "retryable"],
    [new Error("report-not-found"), "retryable"],
    [new TypeError("Failed to fetch"), "retryable"],
    [{ code: 403 }, "retryable"],
    [null, "retryable"],
    [undefined, "retryable"],
    ["permission-denied", "retryable"],
  ];
  for (const [error, kind] of cases) assert.equal(classifyLoadError(error), kind, JSON.stringify(error));
  assert.equal(errorCodeOf({ code: "functions/not-found" }), "not-found");
});

test("권한 없음 문구는 존재 여부 · 소유자 정보를 담지 않는 한 문장이다", () => {
  assert.equal(REPORT_FORBIDDEN_MESSAGE, "이 리포트에 접근할 수 없습니다.");
  assert.doesNotMatch(REPORT_FORBIDDEN_MESSAGE, /본인|소유|다른 사람|존재/);
  assert.equal(REPORT_FORBIDDEN_ACTION_HREF, "/history");
});

for (const page of ["src/app/report/page.tsx", "src/app/report/replay/page.tsx"]) {
  test(`[배선] ${page} — catch가 classifyLoadError로 종류를 정하고, 다시 시도는 retryable에서만 나온다`, () => {
    const code = read(page);
    assert.doesNotMatch(code, /catch \{\n\s*if \(!cancelled\) setState\("error"\)/, "모든 예외를 다시 시도로 묶는 옛 catch가 남았다");
    assert.doesNotMatch(code, /\.catch\(\(\) => setState\("error"\)\)/);
    assert.equal(code.match(/setErrorKind\(classifyLoadError\(error\)\)/g)?.length, 2);
    const errStart = code.indexOf('if (state === "error" || !report) {');
    const branch = code.slice(errStart, code.indexOf("다시 시도\n", errStart));
    const terminal = branch.indexOf('if (errorKind === "forbidden" || errorKind === "invalid-link")');
    assert.ok(terminal > -1, "권한 없음 · 잘못된 링크 분기가 다시 시도 버튼보다 앞에 없다");
    assert.ok(branch.includes("REPORT_FORBIDDEN_ACTION_HREF"), "권한 없음에 기록 목록 이동이 없다");
    // 서버 오류 메시지를 화면에 옮기지 않는다.
    assert.doesNotMatch(branch, /error\.message|\.message\}/);
  });
}

test("[배선] 챌린지 랜딩 — 잘못된 링크는 차단 안내, 일시 오류만 load-error(다시 시도)", () => {
  const code = read("src/app/challenge/join/page.tsx");
  assert.doesNotMatch(code, /setState\("load-error"\)\)/, "모든 예외를 load-error로 묶는 옛 .catch가 남았다");
  const fn = code.slice(code.indexOf("const handleLoadFailure"), code.indexOf("useEffect(() => {", code.indexOf("const handleLoadFailure")));
  assert.match(fn, /if \(classifyLoadError\(error\) === "retryable"\) \{\n\s*setState\("load-error"\);/);
  assert.match(fn, /setBlockedMessage\(CHALLENGE_INVALID_LINK_MESSAGE\);\n\s*setState\("blocked"\);/);
  assert.equal(code.match(/handleLoadFailure\b/g)?.length, 3, "정의 1 + 첫 로드 1 + 다시 시도 1");
});
