// T115 — 에뮬레이터 신선도 판정표 테스트.
//
// ⭐ 이 저장소는 "죽은 게이트"에 여러 번 데였다. 그래서 여기서는 **낡은 쪽이 실제로 잡히는가**와
// **최신 쪽에서 오탐이 없는가**를 **독립된 샘플로 나눠** 단언한다(한 샘플에 섞지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideFreshness,
  diffTriggerNames,
  foldLibHash,
  isEmulatorLoadedLibFile,
  normalizeDir,
  parseIndexExports,
  parseListeningPid,
  pickLoadedBuildRecord,
  SEVERITY,
  type FreshnessInput,
} from "../emulatorFreshness";

const TREE = "C:\\codegate\\functions";
const HASH_OLD = "a".repeat(64);
const HASH_NEW = "b".repeat(64);

/** 모든 대조가 통과하는 기준 입력(= 최신 에뮬레이터). 각 테스트는 여기서 한 축만 바꾼다. */
function freshInput(): FreshnessInput {
  return {
    treeFunctionsDir: TREE,
    emulatorReachable: true,
    backends: [{ directory: TREE, triggerNames: ["createSession", "sendMessage"] }],
    processStartedAt: "2026-07-28T05:00:00.000Z",
    currentLibHash: HASH_OLD,
    buildHistory: [{ at: "2026-07-28T04:59:00.000Z", hash: HASH_OLD }],
    declaredExports: ["createSession", "sendMessage"],
    latestSrcMtimeMs: Date.parse("2026-07-28T04:58:00.000Z"),
    latestLibMtimeMs: Date.parse("2026-07-28T04:59:00.000Z"),
  };
}

test("최신 상태에서는 FRESH이고 지적 사항이 0건이다(오탐 0)", () => {
  const result = decideFreshness(freshInput());
  assert.equal(result.verdict, "FRESH");
  assert.deepEqual(result.findings, []);
});

test("기동 뒤 lib 내용이 바뀌면 STALE-CODE를 낸다", () => {
  const result = decideFreshness({
    ...freshInput(),
    currentLibHash: HASH_NEW,
    buildHistory: [
      { at: "2026-07-28T04:59:00.000Z", hash: HASH_OLD },
      { at: "2026-07-28T06:00:00.000Z", hash: HASH_NEW },
    ],
    latestLibMtimeMs: Date.parse("2026-07-28T06:00:00.000Z"),
  });
  assert.equal(result.verdict, "STALE-CODE");
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].detail, /낡은 lib/);
});

test("⭐ 재빌드로 mtime만 바뀌고 내용이 같으면 STALE-CODE를 내지 않는다(npm test 오탐 방지)", () => {
  // `npm --prefix functions test`가 lib를 지웠다 다시 만드는 경로. 해시가 같으므로 경고하지 않는다.
  const result = decideFreshness({
    ...freshInput(),
    buildHistory: [
      { at: "2026-07-28T04:59:00.000Z", hash: HASH_OLD },
      { at: "2026-07-28T06:00:00.000Z", hash: HASH_OLD },
    ],
    latestLibMtimeMs: Date.parse("2026-07-28T06:00:00.000Z"),
  });
  assert.equal(result.verdict, "FRESH");
});

test("다른 트리에서 기동된 에뮬레이터는 OTHER-TREE이며 코드 대조로 넘어가지 않는다", () => {
  const result = decideFreshness({
    ...freshInput(),
    backends: [{ directory: "C:\\codegate\\.claude\\worktrees\\other\\functions", triggerNames: [] }],
  });
  assert.equal(result.verdict, "OTHER-TREE");
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].detail, /반영될 수 없다/);
});

test("선언된 함수가 안 떠 있으면 STALE-EXPORTS를 내고 이름을 지목한다", () => {
  const result = decideFreshness({
    ...freshInput(),
    declaredExports: ["createSession", "sendMessage", "brandNewCallable"],
  });
  assert.equal(result.verdict, "STALE-EXPORTS");
  assert.match(result.findings[0].detail, /brandNewCallable/);
});

test("lib이 src보다 낡으면 STALE-BUILD를 낸다", () => {
  const result = decideFreshness({
    ...freshInput(),
    latestSrcMtimeMs: Date.parse("2026-07-28T07:00:00.000Z"),
  });
  assert.equal(result.verdict, "STALE-BUILD");
  assert.match(result.findings[0].detail, /src가 lib보다 새롭다/);
});

test("포트가 응답하지 않으면 NOT-RUNNING이고 이후 대조를 시도하지 않는다", () => {
  const result = decideFreshness({ ...freshInput(), emulatorReachable: false, backends: null });
  assert.equal(result.verdict, "NOT-RUNNING");
});

test("⭐ 판정에 필요한 값이 없으면 FRESH가 아니라 UNKNOWN이다 — 거짓 안심 금지", () => {
  const noStart = decideFreshness({ ...freshInput(), processStartedAt: null });
  assert.equal(noStart.verdict, "UNKNOWN");

  const noHistory = decideFreshness({ ...freshInput(), buildHistory: [] });
  assert.equal(noHistory.verdict, "UNKNOWN");

  const unreadableBackends = decideFreshness({ ...freshInput(), backends: null });
  assert.equal(unreadableBackends.verdict, "UNKNOWN");

  const noLib = decideFreshness({ ...freshInput(), currentLibHash: null, latestLibMtimeMs: null });
  assert.equal(noLib.verdict, "UNKNOWN");
});

test("UNKNOWN은 NOT-RUNNING보다 심각하다 — 모르는 채로 검증을 시작하는 쪽이 위험하다", () => {
  assert.ok(SEVERITY.UNKNOWN > SEVERITY["NOT-RUNNING"]);
  assert.ok(SEVERITY["STALE-CODE"] > SEVERITY.UNKNOWN);
  assert.equal(SEVERITY.FRESH, 0);
});

test("pickLoadedBuildRecord는 기동 시각 이전의 마지막 기록을 고른다", () => {
  const history = [
    { at: "2026-07-28T01:00:00.000Z", hash: "h1" },
    { at: "2026-07-28T03:00:00.000Z", hash: "h3" },
    { at: "2026-07-28T02:00:00.000Z", hash: "h2" },
    { at: "2026-07-28T09:00:00.000Z", hash: "h9" },
  ];
  assert.equal(pickLoadedBuildRecord(history, "2026-07-28T05:00:00.000Z")?.hash, "h3");
  assert.equal(pickLoadedBuildRecord(history, "2026-07-28T00:30:00.000Z"), null);
  assert.equal(pickLoadedBuildRecord(history, "not-a-date"), null);
});

test("parseListeningPid는 포트가 정확히 일치하는 LISTENING 줄만 본다", () => {
  const netstat = [
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    127.0.0.1:50011        0.0.0.0:0              LISTENING       111",
    "  TCP    127.0.0.1:5001         127.0.0.1:9999         ESTABLISHED     222",
    "  TCP    127.0.0.1:5001         0.0.0.0:0              LISTENING       58788",
  ].join("\r\n");
  assert.equal(parseListeningPid(netstat, 5001), 58788);
  assert.equal(parseListeningPid(netstat, 5711), null);
});

test("parseIndexExports는 재export 목록을 뽑고 `as` 별칭은 외부 이름을 취한다", () => {
  const source = [
    "// 주석",
    'export { createVoiceClone } from "./voice";',
    'export {',
    "  getChallengeLanding,",
    "  consentChallenge as consent,",
    '} from "./challenge/userAccess";',
    'export { onSessionEnded } from "./guardrails";',
  ].join("\n");
  assert.deepEqual(parseIndexExports(source), [
    "createVoiceClone",
    "getChallengeLanding",
    "consent",
    "onSessionEnded",
  ]);
});

test("diffTriggerNames는 양방향 차이를 낸다", () => {
  const diff = diffTriggerNames(["a", "b"], ["b", "c"]);
  assert.deepEqual(diff.missing, ["a"]);
  assert.deepEqual(diff.extra, ["c"]);
});

test("foldLibHash는 파일 순서에 의존하지 않고 내용 변화에는 반응한다", () => {
  const a = [
    { relPath: "index.js", sha256: "1" },
    { relPath: "voice/index.js", sha256: "2" },
  ];
  const reordered = [...a].reverse();
  assert.equal(foldLibHash(a), foldLibHash(reordered));
  assert.notEqual(foldLibHash(a), foldLibHash([{ relPath: "index.js", sha256: "9" }, a[1]]));
  // 경로 구분자가 달라도 같은 파일로 본다(Windows/POSIX 혼재).
  assert.equal(foldLibHash(a), foldLibHash([a[0], { relPath: "voice\\index.js", sha256: "2" }]));
});

test("⭐ 해시 대상은 에뮬레이터가 로드하는 것만 — 테스트·devtools는 제외한다(reviewer Major)", () => {
  // 포함: 실제로 서빙되는 함수 본문.
  assert.equal(isEmulatorLoadedLibFile("index.js"), true);
  assert.equal(isEmulatorLoadedLibFile("scenarios/beginnerBriefing.js"), true);
  assert.equal(isEmulatorLoadedLibFile("challenge/userAccess.js"), true);
  // 제외 ①: 컴파일된 테스트 — `node --test`만 읽는다.
  assert.equal(isEmulatorLoadedLibFile("scenarios/__tests__/axisCoverage.test.js"), false);
  assert.equal(isEmulatorLoadedLibFile("__tests__/anything.js"), false);
  // 제외 ②: 이 검사 도구 자신 — 포함하면 도구를 고칠 때마다 자기를 낡았다고 신고한다.
  assert.equal(isEmulatorLoadedLibFile("devtools/emulatorFreshness.js"), false);
  assert.equal(isEmulatorLoadedLibFile("devtools/__tests__/emulatorFreshness.test.js"), false);
  // `.js`가 아닌 산출물(.js.map, .d.ts)은 애초에 로드 대상이 아니다.
  assert.equal(isEmulatorLoadedLibFile("index.js.map"), false);
  // Windows 구분자여도 같은 판정이어야 한다.
  assert.equal(isEmulatorLoadedLibFile("scenarios\\__tests__\\axisCoverage.test.js"), false);
  assert.equal(isEmulatorLoadedLibFile("devtools\\recordLibBuild.js"), false);
  // ⚠️ 이름이 비슷할 뿐인 경로는 제외하지 않는다(과잉 제외 = 진짜 변경을 놓치는 반대 방향 고장).
  assert.equal(isEmulatorLoadedLibFile("devtoolsHelper.js"), true);
  assert.equal(isEmulatorLoadedLibFile("report/__tests__helper.js"), true);
});

test("⭐ 제외 대상만 바뀌면 접힌 해시가 변하지 않는다 — 무관한 변경에 STALE-CODE를 내지 않는다", () => {
  const all = [
    { relPath: "index.js", sha256: "prod-1" },
    { relPath: "scenarios/__tests__/axisCoverage.test.js", sha256: "test-1" },
    { relPath: "devtools/emulatorFreshness.js", sha256: "tool-1" },
  ];
  const testAndToolChanged = [
    { relPath: "index.js", sha256: "prod-1" },
    { relPath: "scenarios/__tests__/axisCoverage.test.js", sha256: "test-2" },
    { relPath: "devtools/emulatorFreshness.js", sha256: "tool-2" },
  ];
  const keep = (files: typeof all) => files.filter((f) => isEmulatorLoadedLibFile(f.relPath));
  assert.equal(foldLibHash(keep(all)), foldLibHash(keep(testAndToolChanged)));

  // 반대 방향 — 진짜 함수 본문이 바뀌면 반드시 달라야 한다(범위를 좁히다 놓치면 도구가 무의미해진다).
  const prodChanged = [{ relPath: "index.js", sha256: "prod-2" }, ...all.slice(1)];
  assert.notEqual(foldLibHash(keep(all)), foldLibHash(keep(prodChanged)));
});

test("normalizeDir은 Windows 경로 표기 차이를 흡수한다", () => {
  assert.equal(normalizeDir("C:\\codegate\\functions\\"), normalizeDir("c:/CODEGATE/functions"));
});
