// T181 C1 — 챌린지 완료 전이(docs/Architecture.md §69.3 · §69.8 S-1~S-5 · S-7 · G424~G426 · G428).
//
// ⭐ 이번 결함은 "클라 테스트가 서버가 만들지 않는 값(completed fixture)을 입력으로 썼다"에서
// 숨었다(§69.2). 그래서 이 파일은 ① 서버가 **정확히 무엇을 쓰는지**를 메모리 가짜 db로 고정하고
// (S-3 — 루트 C-1이 그 리터럴을 소스에서 읽어 클라 매퍼에 넣는다) ② 트리거 배선 · 통과 고리 ·
// 상한 집합을 소스 스캔으로 고정한다. 트리거 핸들러(onDocumentUpdated)는 유닛에서 직접 돌리지
// 않는다(consentChallengePreGate.test.ts:4-8 관례) — 트리거 실제 발화는 라이브 L-1이 정본이다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { Firestore } from "firebase-admin/firestore";
import {
  CHALLENGE_STATUS_ON_CONSENT_END,
  CHALLENGE_STATUS_ON_EXPERIENCE_END,
  challengeIdToCompleteOnSessionUpdate,
  completeChallengeOnExperienceEnd,
  markChallengeInProgressIfConsented,
  nextChallengeStatusOnConsentEnd,
  nextChallengeStatusOnExperienceEnd,
} from "../challengeCompletion";
import type { ChallengeStatus } from "../types";

/** functions/src/shared/types.ts의 ChallengeStatus 7개 전수(순서 = 선언 순서). */
const ALL_STATUSES: readonly ChallengeStatus[] = [
  "pending",
  "consented",
  "in_progress",
  "completed",
  "expired",
  "reported",
  "deleted",
];

// ─────────────────────────────────────────────────────────────────────────────
// 메모리 가짜 Firestore — collection().doc() · runTransaction(fn) · tx.get · tx.update만 흉내 낸다.
// ⭐ ref.update · ref.set(트랜잭션 밖 쓰기)은 throw한다 — "헬퍼는 트랜잭션 안에서만 쓴다"를 기계로 건다.
// ─────────────────────────────────────────────────────────────────────────────

type DocData = Record<string, unknown>;
type FakeRef = { path: string; update: () => never; set: () => never };
type FakeSnap = { exists: boolean; data: () => DocData | undefined };
type FakeTx = {
  get: (ref: FakeRef) => Promise<FakeSnap>;
  update: (ref: FakeRef, data: DocData) => FakeTx;
};

class FakeFirestore {
  readonly store = new Map<string, DocData>();
  /** 트랜잭션이 커밋한 쓰기 전부 — 경로와 **쓴 객체 그대로**. */
  readonly txWrites: Array<{ path: string; data: DocData }> = [];

  collection(name: string): { doc: (id: string) => FakeRef } {
    return { doc: (id: string) => this.ref(`${name}/${id}`) };
  }

  private ref(refPath: string): FakeRef {
    const outsideTx = (): never => {
      throw new Error(`트랜잭션 밖 쓰기(${refPath}) — 헬퍼는 tx 안에서만 써야 한다`);
    };
    return { path: refPath, update: outsideTx, set: outsideTx };
  }

  async runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    const pending: Array<{ path: string; data: DocData }> = [];
    const tx: FakeTx = {
      get: async (ref) => {
        const data = this.store.get(ref.path);
        return { exists: data !== undefined, data: () => (data === undefined ? undefined : { ...data }) };
      },
      update: (ref, data) => {
        pending.push({ path: ref.path, data: { ...data } });
        return tx;
      },
    };
    const result = await fn(tx);
    for (const write of pending) {
      this.txWrites.push(write);
      this.store.set(write.path, { ...(this.store.get(write.path) ?? {}), ...write.data });
    }
    return result;
  }

  asFirestore(): Firestore {
    return this as unknown as Firestore;
  }

  /**
   * 헬퍼가 아닌 **다른 쓰기 지점의 무조건 쓰기 커밋**을 모사한다(S-10 · S-11) — 신고(userAccess.ts
   * reportChallenge) · 폐기(challenge/index.ts purgeChallenge) · 예전 동의 끝 무조건 in_progress 쓰기.
   * 헬퍼 경로가 아니므로 txWrites에 남기지 않는다.
   */
  commitUnconditional(docPath: string, data: DocData): void {
    this.store.set(docPath, { ...(this.store.get(docPath) ?? {}), ...data });
  }
}

/** 전이 대상이 아닌 필드들 — 전이 뒤에도 바이트 그대로여야 한다(G425 — voiceId·retentionDeleteAt 무접촉). */
function seedChallenge(fake: FakeFirestore, id: string, status: ChallengeStatus): DocData {
  const doc: DocData = {
    challengeId: id,
    creatorUid: "creator-1",
    status,
    voiceId: "voice-clone-1",
    retentionDeleteAt: "retention-marker",
    linkConsumedAt: "consumed-marker",
  };
  fake.store.set(`challenges/${id}`, { ...doc });
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// S-1 — nextChallengeStatusOnExperienceEnd 7개 상태 전수 진리표
// ─────────────────────────────────────────────────────────────────────────────

test("[T181 S-1] nextChallengeStatusOnExperienceEnd: consented·in_progress → completed / 나머지 5개 → null(G425)", () => {
  const expected: Record<ChallengeStatus, "completed" | null> = {
    pending: null,
    consented: "completed",
    in_progress: "completed",
    completed: null,
    expired: null,
    reported: null,
    deleted: null,
  };
  for (const status of ALL_STATUSES) {
    assert.equal(nextChallengeStatusOnExperienceEnd(status), expected[status], `status=${status}`);
  }
  assert.equal(Object.keys(expected).length, 7, "진리표가 7개 상태를 전부 덮어야 한다");
  assert.equal(CHALLENGE_STATUS_ON_EXPERIENCE_END, "completed");
});

// ─────────────────────────────────────────────────────────────────────────────
// S-2 — challengeIdToCompleteOnSessionUpdate(트리거 필터 + challengeId 판정)
// ─────────────────────────────────────────────────────────────────────────────

test("[T181 S-2] challengeIdToCompleteOnSessionUpdate: active→ended + 비어 있지 않은 challengeId일 때만 그 값", () => {
  assert.equal(
    challengeIdToCompleteOnSessionUpdate({ status: "active" }, { status: "ended", challengeId: "c1" }),
    "c1",
  );
  // 기존 필터(guardrails/index.ts — before?.status === after.status)와 같은 판정: before 부재도 "바뀜"이다.
  assert.equal(challengeIdToCompleteOnSessionUpdate(undefined, { status: "ended", challengeId: "c1" }), "c1");

  const nullCases: ReadonlyArray<
    readonly [string, { status?: unknown } | undefined, { status?: unknown; challengeId?: unknown } | undefined]
  > = [
    ["challengeId 없음(비챌린지 세션)", { status: "active" }, { status: "ended" }],
    ['challengeId === ""', { status: "active" }, { status: "ended", challengeId: "" }],
    ["challengeId가 숫자", { status: "active" }, { status: "ended", challengeId: 42 }],
    ["ended→ended(폐기의 voiceId 삭제 업데이트)", { status: "ended" }, { status: "ended", challengeId: "c1" }],
    ["active→active(턴마다의 세션 갱신)", { status: "active" }, { status: "active", challengeId: "c1" }],
    ["after 없음", { status: "active" }, undefined],
  ];
  for (const [label, before, after] of nullCases) {
    assert.equal(challengeIdToCompleteOnSessionUpdate(before, after), null, label);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// S-3 — completeChallengeOnExperienceEnd + 메모리 가짜 db
// ─────────────────────────────────────────────────────────────────────────────

test("[T181 S-3] in_progress → completed: 쓰기 1건이고 쓴 객체가 정확히 { status: CHALLENGE_STATUS_ON_EXPERIENCE_END }", async () => {
  const fake = new FakeFirestore();
  const before = seedChallenge(fake, "c1", "in_progress");

  const result = await completeChallengeOnExperienceEnd(fake.asFirestore(), "c1");

  assert.deepEqual(result, { outcome: "completed", from: "in_progress" });
  assert.deepEqual(fake.txWrites, [
    { path: "challenges/c1", data: { status: CHALLENGE_STATUS_ON_EXPERIENCE_END } },
  ]);
  // 다른 필드는 무접촉(G425 · ADR-0006 — voiceId · retentionDeleteAt).
  assert.deepEqual(fake.store.get("challenges/c1"), { ...before, status: CHALLENGE_STATUS_ON_EXPERIENCE_END });
});

test("[T181 S-3] consented → completed(동의 끝 쓰기가 늦어도 완료는 난다)", async () => {
  const fake = new FakeFirestore();
  seedChallenge(fake, "c1", "consented");

  const result = await completeChallengeOnExperienceEnd(fake.asFirestore(), "c1");

  assert.deepEqual(result, { outcome: "completed", from: "consented" });
  assert.deepEqual(fake.txWrites, [
    { path: "challenges/c1", data: { status: CHALLENGE_STATUS_ON_EXPERIENCE_END } },
  ]);
});

for (const status of ["reported", "deleted", "completed", "pending", "expired"] as const) {
  test(`[T181 S-3] status=${status} → 쓰기 0 · { outcome: "unchanged", status } (덮어쓰지 않는다 — G425)`, async () => {
    const fake = new FakeFirestore();
    const before = seedChallenge(fake, "c1", status);

    const result = await completeChallengeOnExperienceEnd(fake.asFirestore(), "c1");

    assert.deepEqual(result, { outcome: "unchanged", status });
    assert.deepEqual(fake.txWrites, []);
    assert.deepEqual(fake.store.get("challenges/c1"), before);
  });
}

test("[T181 S-3] 문서 없음 → { outcome: \"missing\" } · 쓰기 0 · throw 0", async () => {
  const fake = new FakeFirestore();
  let result: unknown;
  await assert.doesNotReject(async () => {
    result = await completeChallengeOnExperienceEnd(fake.asFirestore(), "nonexistent");
  });
  assert.deepEqual(result, { outcome: "missing" });
  assert.deepEqual(fake.txWrites, []);
  assert.equal(fake.store.size, 0, "없는 문서를 만들어서는 안 된다");
});

test("[T181 S-3] 같은 id로 2회(트리거 중복 전달) → 두 번째는 쓰기 0(멱등)", async () => {
  const fake = new FakeFirestore();
  seedChallenge(fake, "c1", "in_progress");

  const first = await completeChallengeOnExperienceEnd(fake.asFirestore(), "c1");
  const second = await completeChallengeOnExperienceEnd(fake.asFirestore(), "c1");

  assert.deepEqual(first, { outcome: "completed", from: "in_progress" });
  assert.deepEqual(second, { outcome: "unchanged", status: CHALLENGE_STATUS_ON_EXPERIENCE_END });
  assert.equal(fake.txWrites.length, 1, "두 번째 전달이 다시 썼다");
});

// ─────────────────────────────────────────────────────────────────────────────
// 소스 스캔 공통 — 주석 제거 규칙은 anonymousGate.test.ts의 stripComments와 같다(설명 주석에 함수명이
// 적혀 있어도 호출로 세지 않는다). 테스트는 lib/에서 돌므로 src 경로를 명시한다.
// ─────────────────────────────────────────────────────────────────────────────

const SRC_DIR = path.resolve(__dirname, "../../../src");
const GUARDRAILS_SRC = path.join(SRC_DIR, "guardrails/index.ts");
const CHALLENGE_INDEX_SRC = path.join(SRC_DIR, "challenge/index.ts");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, "$1"))
    .join("\n");
}

/** `export const <name> =`부터 다음 최상위 `export ` 또는 EOF까지(anonymousGate.test.ts extractBody와 같은 규칙). */
function extractExportBody(source: string, name: string): string {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`export const ${name} =`));
  assert.ok(start >= 0, `export const ${name} = 를 찾지 못했다`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i]!.startsWith("export ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** source[openAt] === "{" 인 블록의 본문(중괄호 짝 맞춤 — 이 파일들의 문자열에는 중괄호가 없다). */
function blockAt(source: string, openAt: number): string {
  assert.equal(source[openAt], "{", "블록 시작 위치가 { 가 아니다");
  let depth = 0;
  for (let i = openAt; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openAt, i + 1);
    }
  }
  throw new Error("닫는 중괄호를 찾지 못했다");
}

// ─────────────────────────────────────────────────────────────────────────────
// S-4 — 트리거 배선(guardrails/index.ts): 위치 · 자기 try/catch · catch 안 throw 0 · import 금지(G426)
// ─────────────────────────────────────────────────────────────────────────────

test("[T181 S-4 ①②] 완료 전이 호출이 기존 필터·폐기 catch 뒤에 있고, 자기 try/catch 안이며 catch에 throw가 없다", () => {
  const code = stripComments(readFileSync(GUARDRAILS_SRC, "utf-8"));
  const callAt = code.indexOf("completeChallengeOnExperienceEnd(");
  const filterAt = code.indexOf('after.status !== "ended"');
  const purgeCatchLogAt = code.indexOf('"onSessionEnded: 폐기 트리거 처리 중 예외"');
  assert.ok(callAt >= 0, "completeChallengeOnExperienceEnd( 호출이 없다(G424 — 전이 지점이 사라졌다)");
  assert.ok(filterAt >= 0 && purgeCatchLogAt >= 0, "기존 필터 또는 폐기 catch 로그를 찾지 못했다 — 스캔 전제가 깨졌다");
  assert.equal(code.split("completeChallengeOnExperienceEnd(").length - 1, 1, "전이 호출은 정확히 1곳이어야 한다");
  assert.ok(filterAt < callAt, "전이 호출이 기존 필터(after.status !== \"ended\")보다 앞에 있다");
  assert.ok(purgeCatchLogAt < callAt, "전이 호출이 기존 폐기 catch보다 앞에 있다 — 폐기 블록과 독립이어야 한다");

  // ② 호출을 감싼 try는 폐기 catch **뒤**에 새로 열린 것이어야 한다(폐기 try에 섞이면 독립이 아니다).
  const tryAt = code.lastIndexOf("try {", callAt);
  assert.ok(tryAt > purgeCatchLogAt, "전이 호출이 폐기 catch 뒤에 열린 자기 try 안에 있지 않다");
  const tryBlock = blockAt(code, tryAt + "try ".length);
  assert.ok(tryBlock.includes("completeChallengeOnExperienceEnd("), "전이 호출이 자기 try 블록 안에 있지 않다");
  const catchMatch = /^\s*catch\s*(\([^)]*\))?\s*\{/.exec(code.slice(tryAt + "try ".length + tryBlock.length));
  assert.ok(catchMatch, "전이 try 바로 뒤에 catch가 없다");
  const catchOpenAt = tryAt + "try ".length + tryBlock.length + catchMatch[0].length - 1;
  const catchBlock = blockAt(code, catchOpenAt);
  assert.doesNotMatch(catchBlock, /\bthrow\b/, "전이 catch가 다시 throw한다 — 트리거 재시도가 폐기 부수효과까지 재실행한다");
});

test("[T181 S-4 ③] 트리거 파일이 ../challenge · ../challenge/index · ../challenge/userAccess를 import하지 않는다(G426)", () => {
  const code = stripComments(readFileSync(GUARDRAILS_SRC, "utf-8"));
  const specifiers = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);
  assert.ok(specifiers.length > 0, "import를 하나도 찾지 못했다 — 스캔 전제가 깨졌다");
  const forbidden = specifiers.filter((s) => s === "../challenge" || s === "../challenge/index" || s === "../challenge/userAccess");
  assert.deepEqual(forbidden, [], `트리거가 챌린지 모듈을 끌어온다(모듈 상호 import · §41 폐포): ${forbidden.join(", ")}`);
  assert.ok(specifiers.includes("../shared/challengeCompletion"), "완료 로직은 잎 모듈 ../shared/challengeCompletion에서 와야 한다");
});

test("[T181 G426] 잎 모듈 challengeCompletion.ts는 런타임 import가 0건이다(type import만)", () => {
  const code = stripComments(readFileSync(path.join(SRC_DIR, "shared/challengeCompletion.ts"), "utf-8"));
  const runtimeImports = [...code.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  assert.deepEqual(runtimeImports, [], `잎 모듈에 런타임 import가 있다: ${runtimeImports.join(", ")}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// S-5 — 서버 통과 고리: listMyChallenges가 저장된 status를 값 변환 없이 싣는다
// S-7 — 상한 판정: ACTIVE_STATUSES에 완료 값이 없다(완료가 슬롯을 돌려준다 — §14.5)
// ─────────────────────────────────────────────────────────────────────────────

test("[T181 S-5] listMyChallenges 항목이 status: data.status 로 값을 그대로 싣는다(값 변환 0)", () => {
  const body = stripComments(extractExportBody(readFileSync(CHALLENGE_INDEX_SRC, "utf-8"), "listMyChallenges"));
  assert.match(body, /^\s*status: data\.status,\s*$/m, "listMyChallenges의 status 통과 고리가 바뀌었다 — 서버→클라 사슬 단절");
});

test("[T181 S-7] ACTIVE_STATUSES에 CHALLENGE_STATUS_ON_EXPERIENCE_END의 값이 없다(완료는 활성 상한에서 빠진다)", () => {
  const code = stripComments(readFileSync(CHALLENGE_INDEX_SRC, "utf-8"));
  const m = /const ACTIVE_STATUSES = \[([^\]]*)\] as const;/.exec(code);
  assert.ok(m, "ACTIVE_STATUSES 선언을 찾지 못했다 — 스캔 전제가 깨졌다");
  const members = [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
  assert.ok(members.length > 0, "ACTIVE_STATUSES 원소를 하나도 읽지 못했다(조용한 통과 방지)");
  assert.deepEqual(members, ["pending", "consented", "in_progress"], "§69.5 — 상한 집합은 무변경이어야 한다");
  assert.ok(!members.includes(CHALLENGE_STATUS_ON_EXPERIENCE_END), "완료 값이 활성 집합에 있다 — 슬롯이 돌아오지 않는다");
});

// ═════════════════════════════════════════════════════════════════════════════
// T181 C4(§69.15.4 · OQ-A88 (a) · G429) — 동의 끝 consented → in_progress 조건부 전이. S-8~S-12.
// ═════════════════════════════════════════════════════════════════════════════

/** 예전 userAccess.ts 동의 끝 쓰기(트랜잭션 밖 무조건 in_progress)의 모사 — S-10 · S-11 대조군 전용. */
function legacyUnconditionalConsentEnd(fake: FakeFirestore, id: string): void {
  fake.commitUnconditional(`challenges/${id}`, { status: "in_progress" });
}

test("[T181 S-9 전제] 가짜 db의 ref.update · ref.set(트랜잭션 밖 쓰기)은 실제로 throw한다 — 아래 '쓰기 0' 단언이 공회전이 아니다", () => {
  const fake = new FakeFirestore();
  seedChallenge(fake, "c1", "consented");
  const ref = fake.collection("challenges").doc("c1");
  assert.throws(() => ref.update(), /트랜잭션 밖 쓰기/);
  assert.throws(() => ref.set(), /트랜잭션 밖 쓰기/);
});

test("[T181 S-8] nextChallengeStatusOnConsentEnd: consented → in_progress / 나머지 6개 → null(G429)", () => {
  const expected: Record<ChallengeStatus, "in_progress" | null> = {
    pending: null,
    consented: "in_progress",
    in_progress: null,
    completed: null,
    expired: null,
    reported: null,
    deleted: null,
  };
  for (const status of ALL_STATUSES) {
    assert.equal(nextChallengeStatusOnConsentEnd(status), expected[status], `status=${status}`);
  }
  assert.equal(Object.keys(expected).length, 7, "진리표가 7개 상태를 전부 덮어야 한다");
  assert.equal(CHALLENGE_STATUS_ON_CONSENT_END, "in_progress");
});

test("[T181 S-9] consented → in_progress: 쓰기 1건이고 쓴 객체가 정확히 { status: CHALLENGE_STATUS_ON_CONSENT_END }", async () => {
  const fake = new FakeFirestore();
  const before = seedChallenge(fake, "c1", "consented");

  const result = await markChallengeInProgressIfConsented(fake.asFirestore(), "c1");

  assert.deepEqual(result, { outcome: "in_progress" });
  assert.deepEqual(fake.txWrites, [{ path: "challenges/c1", data: { status: CHALLENGE_STATUS_ON_CONSENT_END } }]);
  assert.deepEqual(fake.store.get("challenges/c1"), { ...before, status: CHALLENGE_STATUS_ON_CONSENT_END });
});

for (const status of ["pending", "in_progress", "completed", "expired", "reported", "deleted"] as const) {
  test(`[T181 S-9] status=${status} → 쓰기 0 · { outcome: "unchanged", status } (덮어쓰지 않는다 — G429)`, async () => {
    const fake = new FakeFirestore();
    const before = seedChallenge(fake, "c1", status);

    const result = await markChallengeInProgressIfConsented(fake.asFirestore(), "c1");

    assert.deepEqual(result, { outcome: "unchanged", status });
    assert.deepEqual(fake.txWrites, []);
    assert.deepEqual(fake.store.get("challenges/c1"), before);
  });
}

test("[T181 S-9] 문서 없음 → { outcome: \"missing\" } · 쓰기 0 · throw 0 / 같은 id로 2회 → 두 번째 쓰기 0", async () => {
  const missing = new FakeFirestore();
  let result: unknown;
  await assert.doesNotReject(async () => {
    result = await markChallengeInProgressIfConsented(missing.asFirestore(), "nonexistent");
  });
  assert.deepEqual(result, { outcome: "missing" });
  assert.deepEqual(missing.txWrites, []);
  assert.equal(missing.store.size, 0, "없는 문서를 만들어서는 안 된다");

  const twice = new FakeFirestore();
  seedChallenge(twice, "c1", "consented");
  const first = await markChallengeInProgressIfConsented(twice.asFirestore(), "c1");
  const second = await markChallengeInProgressIfConsented(twice.asFirestore(), "c1");
  assert.deepEqual(first, { outcome: "in_progress" });
  assert.deepEqual(second, { outcome: "unchanged", status: CHALLENGE_STATUS_ON_CONSENT_END });
  assert.equal(twice.txWrites.length, 1, "두 번째 호출이 다시 썼다");
});

test("[T181 S-10] 신고·폐기가 먼저 커밋되면 C4는 덮지 않는다 — 옛 무조건 쓰기 대조군은 덮는다(판별력)", async (t) => {
  // ① 신고가 먼저(reportChallenge의 무조건 쓰기 모사 — status + reportedAt).
  const reportFirst = new FakeFirestore();
  seedChallenge(reportFirst, "c1", "consented");
  reportFirst.commitUnconditional("challenges/c1", { status: "reported", reportedAt: "reported-at-marker" });
  const afterReport = await markChallengeInProgressIfConsented(reportFirst.asFirestore(), "c1");
  assert.deepEqual(afterReport, { outcome: "unchanged", status: "reported" });
  assert.deepEqual(reportFirst.txWrites, []);
  assert.equal(reportFirst.store.get("challenges/c1")!.status, "reported");
  assert.equal(reportFirst.store.get("challenges/c1")!.reportedAt, "reported-at-marker", "신고 시각이 보존돼야 한다");

  // ② 폐기가 먼저(purgeChallenge의 무조건 deleted 모사).
  const deleteFirst = new FakeFirestore();
  seedChallenge(deleteFirst, "c1", "consented");
  deleteFirst.commitUnconditional("challenges/c1", { status: "deleted" });
  const afterDelete = await markChallengeInProgressIfConsented(deleteFirst.asFirestore(), "c1");
  assert.deepEqual(afterDelete, { outcome: "unchanged", status: "deleted" });
  assert.deepEqual(deleteFirst.txWrites, []);
  assert.equal(deleteFirst.store.get("challenges/c1")!.status, "deleted");

  // ③ 대조군 — 같은 순서에 옛 무조건 쓰기를 넣으면 둘 다 in_progress로 덮인다(시나리오에 판별력이 있다).
  const legacyReport = new FakeFirestore();
  seedChallenge(legacyReport, "c1", "consented");
  legacyReport.commitUnconditional("challenges/c1", { status: "reported", reportedAt: "reported-at-marker" });
  legacyUnconditionalConsentEnd(legacyReport, "c1");
  const legacyDelete = new FakeFirestore();
  seedChallenge(legacyDelete, "c1", "consented");
  legacyDelete.commitUnconditional("challenges/c1", { status: "deleted" });
  legacyUnconditionalConsentEnd(legacyDelete, "c1");
  t.diagnostic(
    `신고 먼저 → C4: ${reportFirst.store.get("challenges/c1")!.status} · 옛 무조건 쓰기: ${legacyReport.store.get("challenges/c1")!.status}`,
  );
  t.diagnostic(
    `폐기 먼저 → C4: ${deleteFirst.store.get("challenges/c1")!.status} · 옛 무조건 쓰기: ${legacyDelete.store.get("challenges/c1")!.status}`,
  );
  assert.equal(legacyReport.store.get("challenges/c1")!.status, "in_progress", "대조군이 신고를 덮지 않았다 — 시나리오가 판별력이 없다");
  assert.equal(legacyDelete.store.get("challenges/c1")!.status, "in_progress", "대조군이 폐기를 덮지 않았다 — 시나리오가 판별력이 없다");

  // ④ 반대 순서(C4 먼저 → 신고) — 신고가 이긴다(§14.5 의도 유지).
  const c4First = new FakeFirestore();
  seedChallenge(c4First, "c1", "consented");
  assert.deepEqual(await markChallengeInProgressIfConsented(c4First.asFirestore(), "c1"), { outcome: "in_progress" });
  c4First.commitUnconditional("challenges/c1", { status: "reported", reportedAt: "reported-at-marker" });
  assert.equal(c4First.store.get("challenges/c1")!.status, "reported");
});

test("[T181 S-11] 완료가 먼저 커밋되면 C4는 덮지 않는다(R-1 해소) + 교차 불변식 — 옛 무조건 쓰기 대조군은 R-1을 재현한다", async (t) => {
  // ① 완료가 먼저 — 실제 완료 전이 → C4.
  const completionFirst = new FakeFirestore();
  seedChallenge(completionFirst, "c1", "consented");
  const completion = await completeChallengeOnExperienceEnd(completionFirst.asFirestore(), "c1");
  assert.deepEqual(completion, { outcome: "completed", from: "consented" });
  const consentEnd = await markChallengeInProgressIfConsented(completionFirst.asFirestore(), "c1");
  assert.deepEqual(consentEnd, { outcome: "unchanged", status: CHALLENGE_STATUS_ON_EXPERIENCE_END });
  assert.equal(completionFirst.txWrites.length, 1, "C4가 완료 뒤에 다시 썼다");
  assert.equal(completionFirst.store.get("challenges/c1")!.status, CHALLENGE_STATUS_ON_EXPERIENCE_END);

  // ② 정상 순서 — C4 → in_progress(쓰기 1) → 완료 → from: in_progress.
  const normal = new FakeFirestore();
  seedChallenge(normal, "c1", "consented");
  assert.deepEqual(await markChallengeInProgressIfConsented(normal.asFirestore(), "c1"), { outcome: "in_progress" });
  assert.deepEqual(await completeChallengeOnExperienceEnd(normal.asFirestore(), "c1"), {
    outcome: "completed",
    from: CHALLENGE_STATUS_ON_CONSENT_END,
  });
  assert.equal(normal.txWrites.length, 2);
  assert.equal(normal.store.get("challenges/c1")!.status, CHALLENGE_STATUS_ON_EXPERIENCE_END);

  // ③ 교차 불변식 — C4의 출력은 완료 전이의 입력이고, 완료 전이의 출력은 C4의 입력이 아니다.
  assert.equal(nextChallengeStatusOnConsentEnd(CHALLENGE_STATUS_ON_EXPERIENCE_END), null);
  assert.equal(nextChallengeStatusOnExperienceEnd(CHALLENGE_STATUS_ON_CONSENT_END), CHALLENGE_STATUS_ON_EXPERIENCE_END);

  // ④ 대조군 — ①의 순서에 옛 무조건 쓰기를 넣으면 최종 in_progress(R-1 재현 — 그 챌린지 영구 "대기").
  const legacy = new FakeFirestore();
  seedChallenge(legacy, "c1", "consented");
  await completeChallengeOnExperienceEnd(legacy.asFirestore(), "c1");
  legacyUnconditionalConsentEnd(legacy, "c1");
  t.diagnostic(
    `완료 먼저 → C4: ${completionFirst.store.get("challenges/c1")!.status} · 옛 무조건 쓰기: ${legacy.store.get("challenges/c1")!.status}`,
  );
  assert.equal(legacy.store.get("challenges/c1")!.status, "in_progress", "대조군이 R-1을 재현하지 않았다 — 시나리오가 판별력이 없다");
});

// ─────────────────────────────────────────────────────────────────────────────
// S-12 — userAccess.ts 소스 스캔(G429): "in_progress" 리터럴 0 · 헬퍼 호출 정확히 1 · 위치
// ─────────────────────────────────────────────────────────────────────────────

const USER_ACCESS_SRC = path.join(SRC_DIR, "challenge/userAccess.ts");
const CONSENT_END_CALL = "markChallengeInProgressIfConsented(";
const LEGACY_CONSENT_END_LINE = '    await challengeRef.update({ status: "in_progress" });';

/** G429 위반 목록(빈 배열 = 통과). 입력은 파일 전체 소스다. */
function findConsentEndViolations(fileSource: string): string[] {
  const code = stripComments(fileSource);
  const violations: string[] = [];
  const literalHits = code.split('"in_progress"').length - 1;
  if (literalHits > 0) {
    violations.push(`userAccess.ts에 "in_progress" 리터럴이 ${literalHits}건 있다 — 조건부 헬퍼를 거치지 않는 쓰기(G429)`);
  }
  const body = extractExportBody(code, "consentChallenge");
  const callHits = body.split(CONSENT_END_CALL).length - 1;
  if (callHits !== 1) {
    violations.push(`consentChallenge 본문의 ${CONSENT_END_CALL} 호출이 ${callHits}건이다(정확히 1건이어야 한다)`);
  }
  const callAt = body.indexOf(CONSENT_END_CALL);
  const resumeAt = body.indexOf('if (claim.action === "resume")');
  const responseAt = body.indexOf("openingMessageText: openingMessage.text");
  if (resumeAt < 0 || responseAt < 0) {
    violations.push("resume 반환 또는 최종 응답(openingMessageText)을 찾지 못했다 — 스캔 전제가 깨졌다");
  } else if (callAt >= 0 && !(resumeAt < callAt && callAt < responseAt)) {
    violations.push("헬퍼 호출이 resume 반환 뒤 · 최종 응답 앞이 아니다(§69.15.4 (2) 위치)");
  }
  return violations;
}

/** 헬퍼 호출 줄과 옛 무조건 쓰기 줄을 뺀 나머지 — 오염 전후 "나머지가 같다"는 입력 불변 비교용. */
function withoutConsentEndLines(fileSource: string): string {
  return fileSource
    .split("\n")
    .filter((line) => !line.includes(CONSENT_END_CALL) && !line.includes('status: "in_progress"'))
    .join("\n");
}

test("[T181 S-12] userAccess.ts — \"in_progress\" 리터럴 0건 · consentChallenge의 헬퍼 호출 정확히 1건 · resume 뒤 · 최종 응답 앞(G429)", () => {
  const violations = findConsentEndViolations(readFileSync(USER_ACCESS_SRC, "utf-8"));
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("[T181 S-12 역검증] 오염 3종(ⓐ 옛 무조건 쓰기 삽입 ⓑ 헬퍼 호출 삭제 ⓒ 헬퍼를 동의 트랜잭션 앞으로)은 실패하고 정상은 통과한다 — 입력 불변", (t) => {
  const original = readFileSync(USER_ACCESS_SRC, "utf-8").replace(/\r\n/g, "\n");
  const lines = original.split("\n");
  const callLine = lines.findIndex((line) => line.includes(CONSENT_END_CALL));
  const txLine = lines.findIndex((line) => line.includes("const claim = await db.runTransaction("));
  assert.ok(callLine >= 0 && txLine >= 0 && txLine < callLine, "역검증 전제가 깨졌다 — 헬퍼 호출 또는 동의 트랜잭션 줄을 찾지 못했다");

  const inserted = [...lines];
  inserted.splice(callLine, 0, LEGACY_CONSENT_END_LINE);
  const removed = lines.filter((_, i) => i !== callLine);
  const movedBeforeTx = lines.filter((_, i) => i !== callLine);
  movedBeforeTx.splice(txLine, 0, lines[callLine]!);

  const samples: ReadonlyArray<readonly [string, string]> = [
    ["ⓐ 옛 줄 `await challengeRef.update({ status: \"in_progress\" });` 삽입", inserted.join("\n")],
    ["ⓑ 헬퍼 호출 삭제", removed.join("\n")],
    ["ⓒ 헬퍼 호출을 `const claim = await db.runTransaction(` 앞으로 이동", movedBeforeTx.join("\n")],
  ];

  const normal = findConsentEndViolations(original);
  t.diagnostic(`정상 소스: ${normal.length === 0 ? "통과" : "실패 — " + normal.join(" / ")}`);
  assert.deepEqual(normal, [], "정상 소스는 통과해야 한다");

  for (const [label, contaminated] of samples) {
    const violations = findConsentEndViolations(contaminated);
    t.diagnostic(`${label}: ${violations.length === 0 ? "통과(!)" : "실패 — " + violations.join(" / ")}`);
    assert.notEqual(contaminated, original, `${label}: 오염이 실제로 적용되지 않았다(거짓 음성 방지)`);
    assert.equal(withoutConsentEndLines(contaminated), withoutConsentEndLines(original), `${label}: 입력 불변 — 나머지 소스가 같아야 한다`);
    assert.ok(violations.length > 0, `${label}: 오염 소스인데 검사가 통과했다`);
  }
});
