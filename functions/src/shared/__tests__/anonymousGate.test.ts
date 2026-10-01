import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { HttpsError } from "firebase-functions/v2/https";
import {
  ANONYMOUS_DENIED_MESSAGE,
  ANONYMOUS_SIGN_IN_PROVIDER,
  assertAnonymousChallengeScope,
  denyAnonymous,
  isAnonymousCaller,
} from "../anonymousGate";
import { listEntryPoints } from "../../devtools/secretDeclarationScan";
import * as callables from "../../index";

// T176 · Architecture.md §68.9 T-1~T-4 · ADR-0016 · DECISIONS #108 — 익명 uid를 챌린지 수신 경로로만
// 제한하는 서버 게이트의 판별 진리표·분류 완전성·배선 스캔·역검증.
//
// ⚠️ T-3(배선 스캔)은 **"호출이 있다"와 D 클래스의 "비용 발생 호출보다 앞이다"만** 본다. S/R 호출이
// "소유권 검사 바로 뒤"에 있는지는 보지 않는다 — 계약이 아니라 **트립와이어**이고, 순서 대조는
// reviewer 몫이다(§68.13).

// ─────────────────────────────────────────────────────────────────────────────
// T-1 — 순수 판별 진리표(§68.6 (4))
// ─────────────────────────────────────────────────────────────────────────────

type AuthArg = Parameters<typeof isAnonymousCaller>[0];

function authWithProvider(provider: unknown): AuthArg {
  return { token: { firebase: { sign_in_provider: provider } } };
}

/** 비익명 호출자 — Google(프로덕션), password(E2 개발 로그인), custom(에뮬레이터 스크립트), 클레임 부재. */
const NON_ANONYMOUS: ReadonlyArray<readonly [string, AuthArg]> = [
  ["google.com", authWithProvider("google.com")],
  ["password", authWithProvider("password")],
  ["custom", authWithProvider("custom")],
  ["클레임 부재 — firebase 없음", { token: {} }],
  ["클레임 부재 — token 없음", {}],
  ["클레임 부재 — sign_in_provider 없음", { token: { firebase: {} } }],
  ["auth 자체가 undefined", undefined],
];

const ANONYMOUS = authWithProvider(ANONYMOUS_SIGN_IN_PROVIDER);

/** 익명에게 거부되어야 하는 대상 문서 — challengeId 부재·빈 문자열·비문자열. */
const OUT_OF_SCOPE: ReadonlyArray<readonly [string, { challengeId?: unknown }]> = [
  ["challengeId 부재", {}],
  ['challengeId === ""', { challengeId: "" }],
  ["challengeId가 숫자", { challengeId: 42 }],
  ["challengeId가 null", { challengeId: null }],
];

const IN_SCOPE = { challengeId: "challenge-abc" };

function assertPermissionDenied(fn: () => void, label: string): void {
  assert.throws(
    fn,
    (err: unknown) => {
      assert.ok(err instanceof HttpsError, `${label}: HttpsError가 아니다`);
      // ⛔ G417 — `unauthenticated`는 클라 인증 무효화 배너와 U1 잠금을 오발화한다.
      assert.notEqual(err.code, "unauthenticated", `${label}: 거부 코드가 unauthenticated다(G417 위반)`);
      assert.equal(err.code, "permission-denied", `${label}: 거부 코드가 permission-denied가 아니다`);
      assert.equal(err.message, ANONYMOUS_DENIED_MESSAGE, `${label}: 거부 문구가 정본과 다르다`);
      return true;
    },
    `${label}: throw해야 한다`,
  );
}

test("[T176 T-1] isAnonymousCaller: sign_in_provider === \"anonymous\"일 때만 true(G415)", () => {
  assert.equal(ANONYMOUS_SIGN_IN_PROVIDER, "anonymous");
  assert.equal(isAnonymousCaller(ANONYMOUS), true);
  for (const [label, auth] of NON_ANONYMOUS) {
    assert.equal(isAnonymousCaller(auth), false, `${label}은 익명이 아니다`);
  }
  // 대소문자·공백이 다른 값은 익명이 아니다(정확 일치 판별).
  assert.equal(isAnonymousCaller(authWithProvider("Anonymous")), false);
  assert.equal(isAnonymousCaller(authWithProvider(" anonymous")), false);
});

test("[T176 T-1] denyAnonymous: 비익명은 반환(무동작), 익명은 permission-denied throw", () => {
  for (const [label, auth] of NON_ANONYMOUS) {
    assert.doesNotThrow(() => denyAnonymous(auth), `${label}: 비익명은 통과해야 한다`);
    assert.equal(denyAnonymous(auth), undefined);
  }
  assertPermissionDenied(() => denyAnonymous(ANONYMOUS), "denyAnonymous(익명)");
});

test("[T176 T-1] assertAnonymousChallengeScope: 진리표 전 칸(§68.6 (4))", () => {
  // 비익명 행 — challengeId가 있든 없든 전부 반환.
  for (const [label, auth] of NON_ANONYMOUS) {
    assert.doesNotThrow(() => assertAnonymousChallengeScope(auth, IN_SCOPE), `${label} × challengeId 있음`);
    for (const [docLabel, doc] of OUT_OF_SCOPE) {
      assert.doesNotThrow(
        () => assertAnonymousChallengeScope(auth, doc),
        `${label} × ${docLabel}: 비익명은 통과해야 한다(Google 무변경)`,
      );
    }
  }
  // 익명 행 — challengeId가 비어 있지 않은 문자열일 때만 반환.
  assert.doesNotThrow(() => assertAnonymousChallengeScope(ANONYMOUS, IN_SCOPE));
  for (const [docLabel, doc] of OUT_OF_SCOPE) {
    assertPermissionDenied(() => assertAnonymousChallengeScope(ANONYMOUS, doc), `익명 × ${docLabel}`);
  }
});

test("[T176 T-1] 비익명 호출자에 대해 assertAnonymousChallengeScope는 대상 문서를 들여다보지도 않는다", () => {
  // "Google 동작 바이트 무변경"(§68.6 (4))의 가장 강한 형태 — 비익명 경로는 판별식 한 번 외에
  // 아무것도 하지 않는다. 대상 문서의 challengeId를 읽으면 즉시 실패하는 getter로 확인한다.
  const untouchable = {
    get challengeId(): unknown {
      throw new Error("비익명 경로에서 challengeId를 읽었다");
    },
  };
  for (const [label, auth] of NON_ANONYMOUS) {
    assert.doesNotThrow(() => assertAnonymousChallengeScope(auth, untouchable), label);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// T-2 — 분류 완전성 트립와이어(G421) · §68.3 분류표의 정본 사본
// ─────────────────────────────────────────────────────────────────────────────

type AnonymousPolicy = "deny" | "session" | "report" | "entry" | "no_auth" | "not_callable";

/** Architecture.md §68.3 — 26행. 새 export를 추가하면 여기에 분류를 추가해야 테스트가 통과한다. */
const ANONYMOUS_POLICY: Record<string, AnonymousPolicy> = {
  createVoiceClone: "deny",
  createSession: "deny",
  endSession: "session",
  updateMessengerSkin: "session",
  requestEscalation: "session",
  requestReverseEscalation: "session",
  sendMessage: "session",
  createRealtimeCall: "session",
  submitRealtimeTranscript: "session",
  generateReport: "session",
  judgeRewindAnswer: "report",
  deliverInCallSms: "session",
  recordInCallSmsEvent: "session",
  deliverVerifyOffer: "session",
  deliverVerifyReconnect: "session",
  recordMockScreenEvent: "session",
  getBeginnerBriefing: "deny",
  createChallenge: "deny",
  deleteChallenge: "deny",
  listMyChallenges: "deny",
  getChallengeLanding: "no_auth",
  consentChallenge: "entry",
  reportChallenge: "no_auth",
  setChallengeResultSharing: "entry",
  onSessionEnded: "not_callable",
  purgeExpiredChallenges: "not_callable",
};

type ClassificationGaps = { unclassified: string[]; stale: string[] };

/**
 * export 집합과 정책표의 양방향 차집합(순수 함수 — 오염 샘플을 넣어 역검증할 수 있게 분리, AC-085 (e) ⓐ).
 *   unclassified = export에는 있는데 정책표에 없는 이름(새 콜러블이 분류 없이 추가된 경우)
 *   stale        = 정책표에는 있는데 export에 없는 이름(삭제·개명된 콜러블의 잔존 행)
 */
function findClassificationGaps(
  exportedNames: readonly string[],
  policyTable: Readonly<Record<string, AnonymousPolicy>>,
): ClassificationGaps {
  const exported = [...exportedNames].sort();
  const classified = Object.keys(policyTable).sort();
  return {
    unclassified: exported.filter((name) => !Object.prototype.hasOwnProperty.call(policyTable, name)),
    stale: classified.filter((name) => !exported.includes(name)),
  };
}

/** T-2 양방향 단언 — 실제 입력과 오염 샘플에 **같은 단언**을 적용한다. */
function assertNoClassificationGaps(
  exportedNames: readonly string[],
  policyTable: Readonly<Record<string, AnonymousPolicy>>,
): void {
  const { unclassified, stale } = findClassificationGaps(exportedNames, policyTable);
  assert.deepEqual(
    unclassified,
    [],
    unclassified
      .map(
        (name) =>
          `새 export \`${name}\`의 익명 정책이 없다 — Architecture.md §68.3 기준으로 분류하고 해당 호출을 넣어라(G421)`,
      )
      .join("\n"),
  );
  assert.deepEqual(
    stale,
    [],
    `정책표에 있지만 index.ts가 export하지 않는 이름: ${stale.join(", ")} — 정책표에서 지우거나 export를 복원하라`,
  );
}

const EXPORTED_NAMES: readonly string[] = Object.keys(callables);

test("[T176 T-2] index.ts export 집합과 §68.3 정책표가 양방향으로 일치한다(G421)", () => {
  assertNoClassificationGaps(EXPORTED_NAMES, ANONYMOUS_POLICY);
  assert.equal(EXPORTED_NAMES.length, 26, "§68.1 1 — 서버 진입점은 26개(콜러블 24 + 트리거 1 + 스케줄 1)");
});

test("[T176 T-2] 정책표 클래스별 개수 = §68.3(D 6 · S 13 · R 1 · E 2 · N 2 · X 2 — 변경 대상 20)", () => {
  const count = (policy: AnonymousPolicy) =>
    Object.values(ANONYMOUS_POLICY).filter((p) => p === policy).length;
  assert.equal(count("deny"), 6);
  assert.equal(count("session"), 13);
  assert.equal(count("report"), 1);
  assert.equal(count("entry"), 2);
  assert.equal(count("no_auth"), 2);
  assert.equal(count("not_callable"), 2);
  assert.equal(count("deny") + count("session") + count("report"), 20);
});

// ─────────────────────────────────────────────────────────────────────────────
// T-3 — 배선 스캔(G418·G419·G420 트립와이어)
// ─────────────────────────────────────────────────────────────────────────────

/** D 호출이 이보다 앞에 있어야 하는 "비용 발생" 호출(§68.9 T-3). */
const COSTLY_CALLS = ["getFirestore(", "generateOpeningLine(", "getVoiceProvider(", "getLlmClient("] as const;
const DENY_CALL = "denyAnonymous(";
const SCOPE_CALL = "assertAnonymousChallengeScope(";

/**
 * 주석을 걷어낸다 — 설명 주석에 함수명이 적혀 있어도 호출로 세지 않게 한다(자기 주석이 스캔을
 * 때리는 함정). 문자열 속 `//`(예: `https://`)은 앞이 공백·행 시작일 때만 주석으로 본다.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");
}

/** `export const <name> =`부터 다음 최상위 `export ` 또는 EOF까지(§68.9 T-3). */
function extractBody(source: string, name: string): string {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`export const ${name} =`));
  if (start < 0) throw new Error(`export const ${name} = 를 찾지 못했다`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i]!.startsWith("export ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** 정책별 위반 목록. 빈 배열 = 통과. */
function findGateViolations(policy: AnonymousPolicy, rawBody: string): string[] {
  const body = stripComments(rawBody);
  const violations: string[] = [];
  const denyAt = body.indexOf(DENY_CALL);
  switch (policy) {
    case "deny": {
      if (denyAt < 0) {
        violations.push("deny 클래스인데 denyAnonymous(request.auth) 호출이 없다(G419)");
        break;
      }
      for (const costly of COSTLY_CALLS) {
        const costlyAt = body.indexOf(costly);
        if (costlyAt >= 0 && costlyAt < denyAt) {
          violations.push(`denyAnonymous가 첫 \`${costly}\`보다 뒤에 있다(G419)`);
        }
      }
      break;
    }
    case "session":
    case "report":
      if (!body.includes(SCOPE_CALL)) {
        violations.push(`${policy} 클래스인데 assertAnonymousChallengeScope 호출이 없다(G420)`);
      }
      break;
    case "entry":
    case "no_auth":
      if (countOccurrences(body, DENY_CALL) > 0 || countOccurrences(body, SCOPE_CALL) > 0) {
        violations.push(`${policy} 클래스에 익명 게이트 호출이 있다 — 수신 흐름이 입구에서 끊긴다(G418)`);
      }
      break;
    case "not_callable":
      break;
  }
  return violations;
}

const entryFiles = new Map(listEntryPoints().map((entry) => [entry.name, entry.file]));

function bodyOf(name: string): string {
  const file = entryFiles.get(name);
  if (!file) throw new Error(`${name}의 정의 파일을 찾지 못했다`);
  return extractBody(fs.readFileSync(file, "utf-8"), name);
}

test("[T176 T-3 전제] 진입점 스캐너가 정책표의 26개 이름을 전부 찾는다(조용한 건너뜀 방지)", () => {
  const missing = Object.keys(ANONYMOUS_POLICY).filter((name) => !entryFiles.has(name));
  assert.deepEqual(missing, [], `listEntryPoints()가 찾지 못한 이름: ${missing.join(", ")}`);
});

test("[T176 T-3] 20개 변경 대상에 게이트 호출이 있고, 입구 4개에는 없다(G418·G419·G420)", () => {
  const report: string[] = [];
  for (const [name, policy] of Object.entries(ANONYMOUS_POLICY)) {
    for (const violation of findGateViolations(policy, bodyOf(name))) {
      report.push(`${name}(${policy}): ${violation}`);
    }
  }
  assert.deepEqual(report, [], report.join("\n"));
});

// ─────────────────────────────────────────────────────────────────────────────
// T-4 — 역검증(오염 샘플). 스캔이 실제로 "잡는다"는 것을 입력 불변과 함께 증명한다.
// ─────────────────────────────────────────────────────────────────────────────

/** 게이트 호출 줄만 제거한 본문 — 오염 전후로 "나머지가 같다"는 입력 불변 비교용. */
function withoutGateLines(body: string): string {
  return body
    .split("\n")
    .filter((line) => !line.includes(DENY_CALL) && !line.includes(SCOPE_CALL))
    .join("\n");
}

test("[T176 T-4 ⓐ] createSession 본문에서 deny 줄만 빼면 스캔이 실패한다", () => {
  const original = bodyOf("createSession");
  assert.deepEqual(findGateViolations("deny", original), [], "정상 본문은 통과해야 한다");
  const contaminated = withoutGateLines(original);
  assert.notEqual(contaminated, original, "오염이 실제로 적용되지 않았다(거짓 음성 방지)");
  assert.equal(withoutGateLines(contaminated), withoutGateLines(original), "입력 불변 — 나머지 본문이 같아야 한다");
  assert.ok(findGateViolations("deny", contaminated).length > 0, "deny 줄이 빠졌는데 스캔이 통과했다");
});

test("[T176 T-4 ⓑ] consentChallenge 본문에 deny를 넣으면 스캔이 실패한다(G418)", () => {
  const original = bodyOf("consentChallenge");
  assert.deepEqual(findGateViolations("entry", original), [], "정상 본문은 통과해야 한다");
  const lines = original.split("\n");
  const at = lines.findIndex((line) => line.includes("async (request) =>"));
  assert.ok(at >= 0, "consentChallenge 본문에서 핸들러 시작 줄을 찾지 못했다");
  lines.splice(at + 1, 0, "    denyAnonymous(request.auth);");
  const contaminated = lines.join("\n");
  assert.equal(withoutGateLines(contaminated), withoutGateLines(original), "입력 불변 — 나머지 본문이 같아야 한다");
  assert.ok(findGateViolations("entry", contaminated).length > 0, "입구에 deny가 들어갔는데 스캔이 통과했다");
});

test("[T176 T-4 ⓒ] createSession의 deny를 getFirestore( 뒤로 옮기면 스캔이 실패한다(G419)", () => {
  const original = bodyOf("createSession");
  const lines = original.split("\n");
  const denyLine = lines.findIndex((line) => line.includes(DENY_CALL));
  assert.ok(denyLine >= 0, "createSession 본문에 deny 줄이 없다");
  const [moved] = lines.splice(denyLine, 1);
  const firestoreLine = lines.findIndex((line) => line.includes("getFirestore("));
  assert.ok(firestoreLine >= 0, "createSession 본문에 getFirestore(가 없다 — 역검증 전제가 깨졌다");
  lines.splice(firestoreLine + 1, 0, moved!);
  const contaminated = lines.join("\n");
  assert.notEqual(contaminated, original, "오염이 실제로 적용되지 않았다(거짓 음성 방지)");
  assert.equal(withoutGateLines(contaminated), withoutGateLines(original), "입력 불변 — 나머지 본문이 같아야 한다");
  assert.ok(findGateViolations("deny", contaminated).length > 0, "deny가 비용 호출 뒤인데 스캔이 통과했다");
});

test("[T176 T-4 ⓓ] sendMessage 본문에서 scope 줄만 빼면 스캔이 실패한다(session 분기 역검증)", () => {
  const original = bodyOf("sendMessage");
  assert.deepEqual(findGateViolations("session", original), [], "정상 본문은 통과해야 한다");
  const contaminated = withoutGateLines(original);
  assert.notEqual(contaminated, original, "오염이 실제로 적용되지 않았다(거짓 음성 방지)");
  assert.equal(withoutGateLines(contaminated), withoutGateLines(original), "입력 불변 — 나머지 본문이 같아야 한다");
  assert.ok(findGateViolations("session", contaminated).length > 0, "scope 줄이 빠졌는데 스캔이 통과했다");
});

// ─────────────────────────────────────────────────────────────────────────────
// T-4 ⓔ — AC-085 (e) ⓐ "분류 없는 export" 역검증. T-2와 **같은 단언 함수**
// (`assertNoClassificationGaps`)에 정상 샘플과 오염 샘플을 나란히 넣는다. 오염은 테스트 코드
// 안의 사본에만 적용한다(실제 정책표·export는 건드리지 않는다).
// ─────────────────────────────────────────────────────────────────────────────

/** 단언이 던진 실패 메시지(없으면 null) — 실행 출력에 증거로 남긴다. */
function gapFailureOf(
  exportedNames: readonly string[],
  policyTable: Readonly<Record<string, AnonymousPolicy>>,
): string | null {
  try {
    assertNoClassificationGaps(exportedNames, policyTable);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message.split("\n")[0]! : String(err);
  }
}

test("[T176 T-4 ⓔ-1 / AC-085 (e) ⓐ] 정책표에서 한 이름을 빼면(분류 없는 export) 실패하고 정상 샘플은 통과한다", (t) => {
  const removed = "createSession";
  const contaminated: Record<string, AnonymousPolicy> = { ...ANONYMOUS_POLICY };
  delete contaminated[removed];

  assert.equal(Object.keys(contaminated).length, Object.keys(ANONYMOUS_POLICY).length - 1, "오염이 실제로 적용되지 않았다");
  assert.deepEqual({ ...contaminated, [removed]: ANONYMOUS_POLICY[removed]! }, ANONYMOUS_POLICY, "입력 불변 — 뺀 행 외에는 같아야 한다");

  const normal = gapFailureOf(EXPORTED_NAMES, ANONYMOUS_POLICY);
  const polluted = gapFailureOf(EXPORTED_NAMES, contaminated);
  t.diagnostic(`정상 샘플: ${normal === null ? "통과" : "실패 — " + normal}`);
  t.diagnostic(`오염 샘플(정책표에서 ${removed} 제거): ${polluted === null ? "통과(!)" : "실패 — " + polluted}`);
  assert.equal(normal, null, "정상 샘플은 통과해야 한다");
  assert.deepEqual(findClassificationGaps(EXPORTED_NAMES, contaminated), { unclassified: [removed], stale: [] });
  assert.ok(polluted?.includes(`새 export \`${removed}\`의 익명 정책이 없다`), "분류 없는 export인데 단언이 실패하지 않았다");
});

test("[T176 T-4 ⓔ-2 / AC-085 (e) ⓐ] export에 분류 없는 새 이름이 생기면 실패하고 정상 샘플은 통과한다", (t) => {
  const added = "newUnclassifiedCallable";
  assert.ok(!(added in ANONYMOUS_POLICY) && !EXPORTED_NAMES.includes(added), "샘플 이름이 이미 존재한다 — 역검증 전제가 깨졌다");
  const contaminated = [...EXPORTED_NAMES, added];

  assert.equal(contaminated.length, EXPORTED_NAMES.length + 1, "오염이 실제로 적용되지 않았다");
  assert.deepEqual(contaminated.filter((name) => name !== added), [...EXPORTED_NAMES], "입력 불변 — 추가한 이름 외에는 같아야 한다");

  const normal = gapFailureOf(EXPORTED_NAMES, ANONYMOUS_POLICY);
  const polluted = gapFailureOf(contaminated, ANONYMOUS_POLICY);
  t.diagnostic(`정상 샘플: ${normal === null ? "통과" : "실패 — " + normal}`);
  t.diagnostic(`오염 샘플(export에 ${added} 추가): ${polluted === null ? "통과(!)" : "실패 — " + polluted}`);
  assert.equal(normal, null, "정상 샘플은 통과해야 한다");
  assert.deepEqual(findClassificationGaps(contaminated, ANONYMOUS_POLICY), { unclassified: [added], stale: [] });
  assert.ok(polluted?.includes(`새 export \`${added}\`의 익명 정책이 없다`), "분류 없는 export인데 단언이 실패하지 않았다");
});

test("[T176 T-4 ⓔ-3 / 역방향] export에 없는 정책 행이 있으면 실패하고 정상 샘플은 통과한다", (t) => {
  const ghost = "removedCallable";
  assert.ok(!(ghost in ANONYMOUS_POLICY) && !EXPORTED_NAMES.includes(ghost), "샘플 이름이 이미 존재한다 — 역검증 전제가 깨졌다");
  const contaminated: Record<string, AnonymousPolicy> = { ...ANONYMOUS_POLICY, [ghost]: "deny" };

  assert.equal(Object.keys(contaminated).length, Object.keys(ANONYMOUS_POLICY).length + 1, "오염이 실제로 적용되지 않았다");
  const restored = { ...contaminated };
  delete restored[ghost];
  assert.deepEqual(restored, ANONYMOUS_POLICY, "입력 불변 — 추가한 행 외에는 같아야 한다");

  const normal = gapFailureOf(EXPORTED_NAMES, ANONYMOUS_POLICY);
  const polluted = gapFailureOf(EXPORTED_NAMES, contaminated);
  t.diagnostic(`정상 샘플: ${normal === null ? "통과" : "실패 — " + normal}`);
  t.diagnostic(`오염 샘플(정책표에 ${ghost} 추가): ${polluted === null ? "통과(!)" : "실패 — " + polluted}`);
  assert.equal(normal, null, "정상 샘플은 통과해야 한다");
  assert.deepEqual(findClassificationGaps(EXPORTED_NAMES, contaminated), { unclassified: [], stale: [ghost] });
  assert.ok(polluted?.includes(`정책표에 있지만 index.ts가 export하지 않는 이름: ${ghost}`), "잔존 정책 행인데 단언이 실패하지 않았다");
});
