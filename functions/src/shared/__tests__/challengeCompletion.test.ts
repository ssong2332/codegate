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
  CHALLENGE_STATUS_ON_EXPERIENCE_END,
  challengeIdToCompleteOnSessionUpdate,
  completeChallengeOnExperienceEnd,
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
