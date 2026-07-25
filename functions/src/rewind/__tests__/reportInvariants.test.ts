import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// T70 / AC-063(AC-007 불변식 보호) — "되감기는 새 리포트를 만들지 않고 원 리포트를 바꾸지 않는다".
//
// 이 불변식은 **런타임 값이 아니라 코드 경로의 부재**로 보장된다(ADR-0008: "깰 수 있는 경로가 없다").
// 그래서 단위 테스트도 소스에 금지된 쓰기 호출이 없는지를 직접 검사한다 —
// `src/lib/auth/devSignIn.guard.test.ts`(루트)와 같은 가드 테스트 방식이다. 누군가 나중에
// "리포트에 마지막 되감기 결과도 적어두자"고 한 줄 추가하면 이 테스트가 곧바로 막는다.
// 실제 런타임 무변경 증거(되감기 3회 실행 후 리포트 1개·판정값 무변경)는 에뮬레이터 실측으로
// 별도 확인한다(T70 완료 판정 필수 증거).
const REWIND_CALLABLE = "src/rewind/index.ts";

test("judgeRewindAnswer 소스에는 reports 문서·sessions·users에 대한 쓰기 호출이 없다(AC-007/AC-063)", () => {
  const source = readFileSync(REWIND_CALLABLE, "utf8");
  const code = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  for (const forbidden of [".set(", ".update(", ".delete(", ".create("]) {
    assert.ok(
      !code.includes(forbidden),
      `${REWIND_CALLABLE}: 되감기는 어떤 문서도 수정·생성하지 않는다 — 금지된 호출 발견: ${forbidden}`,
    );
  }

  assert.ok(
    !code.includes("updateDefenseGrade") && !code.includes('collection("users")'),
    `${REWIND_CALLABLE}: 방어등급·sessionCount는 실제 훈련 세션 결과만 반영한다(연습 반복 금지).`,
  );
});

test("judgeRewindAnswer의 유일한 쓰기는 rewindAttempts append다(§15.2.2)", () => {
  const source = readFileSync(REWIND_CALLABLE, "utf8");
  const code = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  const addCalls = code.match(/[A-Za-z0-9_.)\]]+\.add\(/g) ?? [];
  assert.deepEqual(
    addCalls,
    ["attemptsRef.add("],
    `${REWIND_CALLABLE}: append 대상은 reports/{rid}/rewindAttempts 하나뿐이어야 한다.`,
  );
  assert.ok(code.includes('reportRef.collection("rewindAttempts")'));
});

test("judgeRewindAnswer는 sessions를 읽기만 한다(종료된 세션은 불변)", () => {
  const source = readFileSync(REWIND_CALLABLE, "utf8");
  // 세션 접근은 그 순간 사기범 대사를 찾기 위한 messages read 하나뿐이다.
  const sessionAccesses = source.match(/collection\("sessions"\)/g) ?? [];
  assert.equal(sessionAccesses.length, 1);
  assert.ok(source.includes('.collection("messages")'));
});

test("firestore.rules: rewindAttempts는 소유자 read만 허용하고 클라 write를 전면 거부한다", () => {
  const rules = readFileSync("../firestore.rules", "utf8");
  const start = rules.indexOf("match /rewindAttempts/");
  assert.ok(start >= 0, "firestore.rules에 rewindAttempts 규칙이 없다(Database.md §rewindAttempts).");
  // 규칙 본문(match 선언 다음 줄부터 블록 끝까지) — `{attemptId}`의 닫는 중괄호와 섞이지 않도록
  // 선언 줄을 건너뛰고 자른다.
  const body = rules.slice(rules.indexOf("\n", start), start + 600);
  assert.ok(body.includes("allow read: if request.auth != null"));
  assert.ok(body.includes("allow write: if false"));
  // 부모 리포트 소유자만 읽을 수 있어야 한다(2인 사용자2 격리 유지).
  assert.ok(body.includes("documents/reports/$(reportId)).data.uid == request.auth.uid"));
});
